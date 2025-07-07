import * as utils from './analyzerUtils.js';

/**
 * @class VideoAnalyzer
 * @classdesc Video analysis utility for detecting visual risks such as flash, flickering and chromatic anomalies. It computes metrics including brightness, colour variance, entropy and temporal coherence to assess visual risk levels.
 */
class VideoAnalyzer {
    /**
     * @constructor
     * @property {Object} metrics
     * @property {Object} thresholds
     * @property {HTMLCanvasElement} canvas
     * @property {CanvasRenderingContext2D} context
     * @property {number} sampleSize
     * @property {Array} timelineData
     * @property {Array} detailedData
     * @property {number} lastAnalysisTime
     * @property {number} minAnalysisInterval
     * @property {Object} advancedMetrics
     * @property {Object} fft
     * @property {Object} temporalBuffer
     * @property {number|null} startTime
     * @property {Array} dataChunks
     * @property {Array} currentChunk
     * @property {number} chunkSize
     * @property {number} totalFrames
     * @property {number|null} analysisStartTime
     * @property {number} lastExportTime
     */
    constructor() {

        this.metrics = {
            flashCount: 0,
            riskLevel: 'low',
            timeline: [],
            lastFrameBrightness: 0,
            frameCount: 0,
            flashSequences: [],
            lastTimestamp: 0
        };
        this.thresholds = {
            brightnessChange: 0.1,
            flashThreshold: 0.1,
            minSequenceLength: 3
        };
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d', { willReadFrequently: true });
        this.sampleSize = 4;
        this.timelineData = [];
        this.detailedData = [];
        this.lastAnalysisTime = 0;
        this.minAnalysisInterval = 1000 / 60;

        this.updateThresholds({
            flashesPerSecond: 3,
            intensity: 0.2
        });

        this.advancedMetrics = {
            colorVariance: [],
            temporalChanges: [],
            flickerFrequencies: [],
            frameEntropy: [],
            colorHistory: {
                r: [],
                g: [],
                b: []
            },
            spikes: [],
            historyLength: 30,
            psi: {
                score: 0,
                components: {
                    frequency: 0,
                    intensity: 0,
                    coverage: 0,
                    duration: 0
                }
            },
            spatialMap: {
                center: 0,
                periphery: 0,
                quadrants: [0, 0, 0, 0]
            },
            chromaticFlashes: {
                redGreen: 0,
                blueYellow: 0,
                lastColors: []
            },
            temporalContrast: {
                current: 0,
                history: [],
                maxRate: 0
            },
            frameDifference: {
                current: 0,
                history: [],
                threshold: 0.1,
                maxDiff: 0
            },
            spectralAnalysis: {
                frequencies: [],
                dominantFrequency: 0,
                spectrum: [],
                fft: null
            },
            temporalCoherence: {
                coherenceScore: 0,
                history: [],
                windowSize: 30
            },
            edgeDetection: {
                edges: 0,
                history: [],
                threshold: 30
            }
        };

        this.fft = {
            forward: (signal) => this.performFFT(signal)
        };

        // Circular buffer for temporal data
        this.temporalBuffer = {
            maxSize: 128,
            data: [],
            add(value) {
                if (this.data.length >= this.maxSize) {
                    this.data.shift();
                }
                this.data.push(value);
            },
            clear() {
                this.data = [];
            }
        };

        this.startTime = null;
        this.dataChunks = [];
        this.currentChunk = [];
        this.chunkSize = 1000;
        this.totalFrames = 0;
        this.analysisStartTime = null;
        this.lastExportTime = 0;
        this.lastRedIntensity = 0;

        this.patternHistory = [];
    }

    /**
     * Updates  thresholds based on brightness change, flash detection, and sequence length.
     * @param {Object} thresholds
     * @param {number} thresholds.intensity
     * @param {number} thresholds.flashesPerSecond
     */
    updateThresholds(thresholds) {
        this.thresholds = {
            brightnessChange: thresholds.intensity,
            flashThreshold: thresholds.intensity,
            flashesPerSecond: thresholds.flashesPerSecond,
            minSequenceLength: 3,
            psi: {
                critical: 0.8,
                warning: 0.5
            },
            chromaticContrast: 0.4
        };
    }

    setAnalysisOptions(options) {
        this.analysisOptions = { ...this.analysisOptions, ...options };
    }

    analyzeFrame(video, timestamp) {
        try {
            if (this.analysisStartTime === null) {
                this.analysisStartTime = timestamp;
                this.lastExportTime = timestamp;
            }

            const relativeTime = timestamp - this.analysisStartTime;
            const currentTime = performance.now();
            const timeSinceLastFrame = currentTime - this.lastAnalysisTime;

            if (timeSinceLastFrame < 16.67) { // 60 frames per second
                return null;
            }

            if (!video.videoWidth || !video.videoHeight) {
                return { error: 'Video not ready' };
            }

            if (timestamp - this.metrics.lastTimestamp > 1) {
                this.reset();
            }

            this.metrics.frameCount++;
            this.metrics.lastTimestamp = timestamp;

            const imageData = this.captureFrame(video);
            const redIntensity = this.calculateAverageRedIntensity(imageData.data);
            const redDelta = Math.abs(redIntensity - (this.lastRedIntensity || 0));
            this.lastRedIntensity = redIntensity;
            const results = this.processFrame(imageData, timestamp, relativeTime, redIntensity, redDelta);

            this.lastAnalysisTime = timestamp;
            return results;
        } catch (error) {
            console.error('Analysis error:', error);
            return { error: error.message };
        }
    }

    /**
     * Process the captured frame image data, computes all relevant metrics. Updates flash metrics, risk level and storage.
     * @returns {Object}
     */
    processFrame(imageData, timestamp, relativeTime, redIntensity = 0, redDelta = 0) {
        const brightness = this.calculateAverageBrightness(imageData.data);
        const brightnessDiff = Math.abs(brightness - this.metrics.lastFrameBrightness);
        const isFlash = brightnessDiff > this.thresholds.brightnessChange;
        const dominantColor = this.calculateDominantColor(imageData);
        const dominantLab = this.rgbToLab(dominantColor.r, dominantColor.g, dominantColor.b);


        let cie76Delta = 0;
        if (this.lastDominantLab) {
            cie76Delta = this.cie76(dominantLab, this.lastDominantLab);
        }
        this.lastDominantLab = dominantLab;

        const patternedStimulusScore = this.detectPatternedStimulus(imageData);

        const metrics = {
            colorVariance: this.calculateColorVariance(imageData),
            temporalChange: this.calculateTemporalChange(brightness),
            flickerFrequency: this.estimateFlickerFrequency(),
            entropy: this.calculateFrameEntropy(imageData),
            psi: this.calculatePSI(brightness, brightnessDiff),
            spatialData: this.analyzeSpatialDistribution(imageData),
            chromaticData: this.analyzeChromaticFlashes(imageData),
            temporalContrastData: this.analyzeTemporalContrast(brightness, timestamp),
            frameDiffData: this.calculateFrameDifference(imageData),
            spectralData: this.performSpectralAnalysis(brightness),
            coherenceData: this.calculateTemporalCoherence(brightness),
            edgeData: this.detectEdges(imageData),
            dominantColor: dominantColor,
            dominantLab: dominantLab,
            cie76Delta: cie76Delta,
            patternedStimulusScore: patternedStimulusScore
        };

        if (isFlash && brightnessDiff > this.thresholds.flashThreshold) {
            this.metrics.flashCount++;
            this.metrics.flashSequences.push({
                timestamp,
                intensity: brightnessDiff,
                frameDuration: timestamp - this.lastAnalysisTime
            });
        }

        this.metrics.lastFrameBrightness = brightness;
        this.updateRiskLevel();

        const timelineEntry = this.createTimelineEntry(
            relativeTime, timestamp, brightness, isFlash, brightnessDiff, metrics, redIntensity, redDelta
        );

        if (isFlash || brightnessDiff > 0.001 || metrics.temporalChange > 0.001) {
            this.updateStorage(timelineEntry);
        }

        return this.createResults(timelineEntry);
    }

    captureFrame(video) {

        if (!video.videoWidth || !video.videoHeight) {
            throw new Error('Invalid video dimensions');
        }

        this.canvas.width = Math.max(video.videoWidth / this.sampleSize, 1);
        this.canvas.height = Math.max(video.videoHeight / this.sampleSize, 1);

        try {
            this.context.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
            return this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
        } catch (error) {
            console.error('Frame capture error:', error);
            return null;
        }
    }


    /**
     * Average brightness of the given pixel data.
     * @param {Uint8ClampedArray} data
     * @returns {number} [0,1].
     */
    calculateAverageBrightness(data) {
        let total = 0, n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
            total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        return total / (n * 255);
    }

    /**
     * Average red channel intensity from RGBA pixel data.
     * @param {Uint8ClampedArray} data
     * @returns {number} [0,1].
     */
    calculateAverageRedIntensity(data) {
        if (!data || data.length === 0) return 0;
        let total = 0, n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) total += data[i];
        return total / (n * 255);
    }

    /**
     * Ratio of bright pixels in a given image frame.
     * @param {ImageData} imageData
     * @returns {number} [0,1].
     */
    calculateCoverage(imageData) {
        if (!imageData || !imageData.data) return 0;

        const data = imageData.data;
        const pixels = data.length / 4;
        let brightPixels = 0;
        const brightnessThreshold = 0.5;

        for (let i = 0; i < data.length; i += 4) {
            const brightness = (
                data[i] * 0.2126 +     // Red
                data[i + 1] * 0.7152 + // Green
                data[i + 2] * 0.0722   // Blue
            ) / 255;

            if (brightness > brightnessThreshold) {
                brightPixels++;
            }
        }

        return brightPixels / pixels;
    }

    getDetailedAnalysis() {
        return {
            frameRate: this.metrics.frameCount / (this.metrics.lastTimestamp || 1),
            flashSequences: this.metrics.flashSequences,
            averageIntensity: this.calculateAverageIntensity(),
            riskFactors: this.analyzeRiskFactors()
        };
    }

    getTimelineData() {
        return this.timelineData;
    }

    detectFlashSequence(brightness, timestamp) {
        const brightnessDiff = Math.abs(brightness - this.metrics.lastFrameBrightness);

        if (brightnessDiff > this.thresholds.brightnessChange) {
            this.metrics.flashCount++;
            this.metrics.flashSequences.push({
                timestamp,
                intensity: brightnessDiff
            });
        }

        this.metrics.lastFrameBrightness = brightness;

        this.timelineData.push({
            timestamp,
            brightness,
            isFlash: brightnessDiff > this.thresholds.brightnessChange,
            intensity: brightnessDiff
        });
    }

    updateRiskLevel() {
        const flashRate = this.metrics.flashCount / (this.metrics.frameCount / 60);
        const intensity = this.calculateAverageIntensity();
        const fpsThresh = this.thresholds.flashesPerSecond || 3;

        if (flashRate > fpsThresh || this.metrics.flashCount > 30 || intensity > 0.8) {
            this.metrics.riskLevel = 'high';
        } else if (flashRate > (fpsThresh * 0.66) || this.metrics.flashCount > 15 || intensity > 0.5) {
            this.metrics.riskLevel = 'medium';
        } else {
            this.metrics.riskLevel = 'low';
        }

        return {
            level: this.metrics.riskLevel,
            flashCount: this.metrics.flashCount,
            flashRate: flashRate,
            intensity: intensity
        };
    }

    calculateAverageIntensity() {
        if (!this.metrics.flashSequences.length) return 0;

        const totalIntensity = this.metrics.flashSequences.reduce(
            (sum, seq) => sum + seq.intensity,
            0
        );
        return totalIntensity / this.metrics.flashSequences.length;
    }

    analyzeRiskFactors() {
        const factors = [];
        const flashRate = this.metrics.flashCount / (this.metrics.frameCount / 60);

        if (flashRate > 3) factors.push('High Flash Rate');
        if (this.calculateAverageIntensity() > 0.5) factors.push('High Intensity');
        if (this.metrics.flashSequences.length > 5) factors.push('Multiple Sequences');

        return factors.length ? factors : ['No significant risk factors'];
    }

    /**
     * Color variance for the video frame and the color history
     * @param {ImageData} imageData
     * @returns {{current: { r: number, g: number, b: number}, temporal: { r: number, g: number, b: number}, spikes: Array<{ frame: number, channel: 'r' | 'g' | 'b', magnitude: number }>, averageChange: { r: number, g: number, b: number}
     * }}
     */
    calculateColorVariance(imageData) {
        if (!imageData || !imageData.data) return { r: 0, g: 0, b: 0 };

        try {
            const d = imageData.data, n = d.length / 4;
            let means = { r: 0, g: 0, b: 0 };
            for (let i = 0; i < d.length; i += 4) {
                means.r += d[i]; means.g += d[i + 1]; means.b += d[i + 2];
            }
            means.r /= n; means.g /= n; means.b /= n;
            let sumSq = { r: 0, g: 0, b: 0 };
            for (let i = 0; i < d.length; i += 4) {
                sumSq.r += Math.pow(d[i] - means.r, 2);
                sumSq.g += Math.pow(d[i + 1] - means.g, 2);
                sumSq.b += Math.pow(d[i + 2] - means.b, 2);
            }
            const currentVariance = {
                r: Math.sqrt(sumSq.r / n) / 255,
                g: Math.sqrt(sumSq.g / n) / 255,
                b: Math.sqrt(sumSq.b / n) / 255
            };

            this.advancedMetrics.colorHistory.r.push(means.r);
            this.advancedMetrics.colorHistory.g.push(means.g);
            this.advancedMetrics.colorHistory.b.push(means.b);
            if (this.advancedMetrics.colorHistory.r.length > this.advancedMetrics.historyLength) {
                this.advancedMetrics.colorHistory.r.shift();
                this.advancedMetrics.colorHistory.g.shift();
                this.advancedMetrics.colorHistory.b.shift();
            }
            const temporalAnalysis = this.analyzeColorHistory();
            const result = {
                current: currentVariance,
                temporal: temporalAnalysis.variance,
                spikes: temporalAnalysis.spikes,
                averageChange: temporalAnalysis.averageChange
            };

            this.advancedMetrics.colorVariance.push(result);
            return result;
        } catch (error) {
            console.error('Color variance calculation error:', error);
            return { r: 0, g: 0, b: 0 };
        }
    }

    /**
     * Analyses the temporal colour history for:
     * - Temporal variance for RGB channels.
     * - Detected spikes in color changes.
     * - Average color changes.
     * @returns {{variance: { r: number, g: number, b: number }, spikes: Array<{frame: number, channel: 'r' | 'g' | 'b', magnitude: number}>, averageChange: { r: number, g: number, b: number }
     * }}
     */
    analyzeColorHistory() {
        const h = this.advancedMetrics.colorHistory;
        if (h.r.length < 2) return { variance: { r: 0, g: 0, b: 0 }, spikes: [], averageChange: { r: 0, g: 0, b: 0 } };
        const temporalVariance = {
            r: Math.sqrt(utils.variance(h.r)) / 255,
            g: Math.sqrt(utils.variance(h.g)) / 255,
            b: Math.sqrt(utils.variance(h.b)) / 255
        };
        const changes = { r: [], g: [], b: [] };
        for (let i = 1; i < h.r.length; i++) {
            changes.r.push(Math.abs(h.r[i] - h.r[i - 1]));
            changes.g.push(Math.abs(h.g[i] - h.g[i - 1]));
            changes.b.push(Math.abs(h.b[i] - h.b[i - 1]));
        }
        const spikes = this.detectColorSpikes(changes);
        const averageChange = {
            r: utils.mean(changes.r),
            g: utils.mean(changes.g),
            b: utils.mean(changes.b)
        };
        return { variance: temporalVariance, spikes, averageChange };
    }

    /**
     * Detects periodicity in a numeric signal and estimates the dominant period, accounting for lags
     * @param {number[]} signal
     * @returns {{isPeriodic: boolean, period: number, confidence: number}}
     */
    detectPeriodicity(signal) {
        if (signal.length < 4) return { isPeriodic: false, period: 0 };

        const autocorr = [];
        const mean = signal.reduce((a, b) => a + b) / signal.length;
        const normalizedSignal = signal.map(x => x - mean);

        for (let lag = 0; lag < Math.floor(signal.length / 2); lag++) {
            let sum = 0;
            for (let i = 0; i < signal.length - lag; i++) {
                sum += normalizedSignal[i] * normalizedSignal[i + lag];
            }
            autocorr[lag] = sum / (signal.length - lag);
        }

        const peaks = [];
        for (let i = 1; i < autocorr.length - 1; i++) {
            if (autocorr[i] > autocorr[i - 1] && autocorr[i] > autocorr[i + 1]) {
                peaks.push({
                    lag: i,
                    value: autocorr[i]
                });
            }
        }

        peaks.sort((a, b) => b.value - a.value);

        const threshold = 0.5;
        if (peaks.length > 0 && peaks[0].value > threshold) {
            return {
                isPeriodic: true,
                period: peaks[0].lag,
                confidence: peaks[0].value
            };
        }

        return {
            isPeriodic: false,
            period: 0,
            confidence: 0
        };
    }

    /**
     * Calculates temporal coherence of brightness for a rolling window of recent frames.
     * @param {number} brightness
     * @returns {{coherenceScore: number, periodicity: number|null}}
     */
    calculateTemporalCoherence(brightness) {
        const history = this.advancedMetrics.temporalCoherence.history;
        history.push(brightness);
        if (history.length > this.advancedMetrics.temporalCoherence.windowSize) {
            history.shift();
        }

        if (history.length < 2) return { coherenceScore: 0 };

        let coherence = 0;
        const mean = history.reduce((a, b) => a + b) / history.length;
        const variance = history.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / history.length;

        for (let lag = 1; lag < Math.min(10, history.length); lag++) {
            let correlation = 0;
            for (let i = 0; i < history.length - lag; i++) {
                correlation += (history[i] - mean) * (history[i + lag] - mean);
            }
            correlation /= (history.length - lag) * variance;
            coherence += Math.abs(correlation);
        }

        return {
            coherenceScore: coherence / 9,
            periodicity: this.detectPeriodicity(history)
        };
    }

    /**
     * Detects significant colour spikes in the frame changes.
     * @param {{ r: number[], g: number[], b: number[] }} changes
     * @returns {{channel: 'r' | 'g' | 'b', frameIndex: number, magnitude: number}[]}
     */
    detectColorSpikes(changes) {
        const threshold = 0.2;
        const spikes = [];

        ['r', 'g', 'b'].forEach(channel => {
            const meanChange = changes[channel].reduce((a, b) => a + b, 0) / changes[channel].length;
            const stdDev = Math.sqrt(
                changes[channel].reduce((a, b) => a + Math.pow(b - meanChange, 2), 0) / changes[channel].length
            );

            const spikeThreshold = meanChange + (stdDev * 2);

            changes[channel].forEach((change, i) => {
                if (change > spikeThreshold && change > threshold) {
                    spikes.push({
                        channel,
                        frameIndex: i,
                        magnitude: change
                    });
                }
            });
        });

        return spikes;
    }

    padToPowerOfTwo(signal) {
        return this.performFFT(utils.padToPowerOfTwoArray(signal));
    }


/**
 * FFT on the input signal using Cooley-Tukey
 * @param {number[]} signal
 * @returns {{re: Float64Array, im: Float64Array}}
 * @throws {Error}
 */
 performFFT(signal) {
    const n = signal.length;
    if (n <= 1 || (n & (n - 1)) !== 0) {
        return this.padToPowerOfTwo(signal)
    }

    const logN = Math.log2(n);
    const re = new Float64Array(n);
    const im = new Float64Array(n);

    for(let i = 0; i < n; i++) {
        re[i] = signal[i];
}

    const cosTable = new Float64Array(n/2);
    const sinTable = new Float64Array(n/2);
    for(let i = 0; i < n/2; i++) {

        const angle = -2 * Math.PI * i / n;
        cosTable[i] = Math.cos(angle);
        sinTable[i] = Math.sin(angle);
}


utils.bitReverseShuffle(re, im, n, logN);


for(let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2;

    for(let i = 0; i < n; i += len) {
        let wRe = 1, wIm = 0;

        for(let j = 0; j < halfLen; j++) {
            const idx1 = i + j;
            const idx2 = idx1 + halfLen;
            const twiddleIdx = (j * (n/len)) >> 0;
            const twRe = cosTable[twiddleIdx];
            const twIm = sinTable[twiddleIdx];
            const tempRe = wRe * re[idx2] - wIm * im[idx2];
            const tempIm = wRe * im[idx2] + wIm * re[idx2];

            re[idx2] = re[idx1] - tempRe;
            im[idx2] = im[idx1] - tempIm;
            re[idx1] += tempRe;
            im[idx1] += tempIm;

            const tmpRe = wRe * twRe - wIm * twIm;
            wIm = wRe * twIm + wIm * twRe;
            wRe = tmpRe;
        }
    }
}

return {re, im};
}

/**
 * Detects repetitive patterns and high-contrast visual stimuli in the frame.
 * @param {ImageData} imageData
 * @returns {number}
 */
detectPatternedStimulus(imageData) {
    if (!imageData || !imageData.data) return 0;
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    let blockSize = Math.max(4, Math.min(16, Math.floor(Math.min(width, height) / 8)));

    const gray = VideoAnalyzer.toGrayscale(data);

    let blockScores = [];
    for (let by = 0; by < height; by += blockSize) {
        for (let bx = 0; bx < width; bx += blockSize) {
            let sum = 0, sum2 = 0, count = 0;
            for (let y = by; y < Math.min(by + blockSize, height); ++y) {
                for (let x = bx; x < Math.min(bx + blockSize, width); ++x) {
                    let v = gray[y * width + x];
                    sum += v;
                    sum2 += v * v;
                    count++;
                }
            }
            if (count > 0) {
                let mean = sum / count;
                let variance = sum2 / count - mean * mean;
                blockScores.push(Math.sqrt(Math.max(variance, 0)));
            }
        }
    }

    let avgBlockContrast = blockScores.length ? blockScores.reduce((a, b) => a + b, 0) / blockScores.length / 128 : 0;

    if (avgBlockContrast < 0.05) {
        this.patternHistory.push(0);
        if (this.patternHistory.length > 30) this.patternHistory.shift();
        return 0;
    }

    const edge = new Float32Array(width * height);
    let maxEdge = 0;
    for (let y = 1; y < height - 1; ++y) {
        for (let x = 1; x < width - 1; ++x) {
            const idx = y * width + x;
            const { mag } = VideoAnalyzer.sobelAt(gray, width, x, y);
            edge[idx] = mag * mag;
            if (mag > maxEdge) maxEdge = mag;
        }
    }

    if (maxEdge > 0) {
        for (let i = 0; i < edge.length; ++i) {
            edge[i] /= maxEdge;
        }
    }

    const smoothEdge = new Float32Array(width * height);
    for (let y = 0; y < height; ++y) {
        for (let x = 1; x < width - 1; ++x) {
            smoothEdge[y * width + x] = (edge[y * width + (x - 1)] + edge[y * width + x] + edge[y * width + (x + 1)]) / 3;
        }
    }
    for (let x = 0; x < width; ++x) {
        for (let y = 1; y < height - 1; ++y) {
            edge[y * width + x] = (smoothEdge[(y - 1) * width + x] + smoothEdge[y * width + x] + smoothEdge[(y + 1) * width + x]) / 3;
        }
    }

    let edgeRowSum = new Float32Array(height);
    for (let y = 0; y < height; ++y) {
        let sum = 0;
        for (let x = 0; x < width; ++x) {
            sum += edge[y * width + x];
        }
        edgeRowSum[y] = sum;
    }

    let edgeColSum = new Float32Array(width);
    for (let x = 0; x < width; ++x) {
        let sum = 0;
        for (let y = 0; y < height; ++y) {
            sum += edge[y * width + x];
        }
        edgeColSum[x] = sum;
    }

    let meanRow = edgeRowSum.reduce((a, b) => a + b, 0) / height;
    let maxCorrRow = 0;
    for (let lag = 2; lag < Math.min(20, height / 2); ++lag) {
        let corr = 0;
        for (let i = 0; i < height - lag; ++i) {
            corr += (edgeRowSum[i] - meanRow) * (edgeRowSum[i + lag] - meanRow);
        }
        corr /= (height - lag);
        if (corr > maxCorrRow) maxCorrRow = corr;
    }
    let periodicityScoreRow = Math.min(
        maxCorrRow / (edgeRowSum.reduce((a, b) => a + Math.abs(b - meanRow), 0) / height + 1e-6),
        1
    );

    let meanCol = edgeColSum.reduce((a, b) => a + b, 0) / width;
    let maxCorrCol = 0;
    for (let lag = 2; lag < Math.min(20, width / 2); ++lag) {
        let corr = 0;
        for (let i = 0; i < width - lag; ++i) {
            corr += (edgeColSum[i] - meanCol) * (edgeColSum[i + lag] - meanCol);
        }
        corr /= (width - lag);
        if (corr > maxCorrCol) maxCorrCol = corr;
    }
    let periodicityScoreCol = Math.min(
        maxCorrCol / (edgeColSum.reduce((a, b) => a + Math.abs(b - meanCol), 0) / width + 1e-6),
        1
    );

    let periodicityScore = Math.max(periodicityScoreRow, periodicityScoreCol);

    let score = 0.5 * avgBlockContrast + 0.5 * periodicityScore;
    score = Math.max(0, Math.min(score, 1));

    this.patternHistory.push(score);
    if (this.patternHistory.length > 30) this.patternHistory.shift();

    return score;
}

}

export default VideoAnalyzer;