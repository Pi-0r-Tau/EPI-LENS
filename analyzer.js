"use strict";

if (!window.VideoAnalyzer) {
    /**
     * @class VideoAnalyzer
     * @classdesc Video analysis utility for detecting visual risks such as flash, flickering and chromatic anomalies. It computes metrics including brightness, colour variance, entropy and temporal coherence to assess visual risk levels. Uses helper functions
     * from the analyzer-helpers.js.
     */
    class VideoAnalyzer {
        constructor( {
            coherenceWindowSize = 30,
            edgeHistoryMax = 500,
            chromaticHistoryLen = 10,
            spectralBufferLen = 128,
            spectralFftLen = 64,
            fps = 60,
            edgeThreshold = 30,
            colorHistoryLen = 30,
            historyLength = 30
        } = {}) {
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
            this.minAnalysisInterval = 1000 / fps;

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
                    b: [],
                    maxLen: colorHistoryLen
                },
                spikes: [],
                historyLength: historyLength,
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
                    lastColors: [],
                    maxLen: chromaticHistoryLen
                },
                temporalContrast: {
                    current: 0,
                    history: [],
                    maxRate: 0,
                    bufferLen: 15
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
                    bufferLen: spectralBufferLen,
                    fftLen: spectralFftLen,
                    fft: null
                },
                temporalCoherence: {
                    coherenceScore: 0,
                    history: [],
                    windowSize: coherenceWindowSize,
                    coherenceHistory: [],
                    maxLag: 10
                },
                edgeDetection: {
                    edges: 0,
                    history: [],
                    threshold: edgeThreshold,
                    maxHistory: edgeHistoryMax
                }
            };

            // FFT implementation
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
            this.sceneChangeHistory = [];
            this.patternHashes = [];

            this._frameDiffHistory = new Float32Array(8);
            this._frameDiffIdx = 0;
        }

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
            const FRAME_INTERVAL_MS = 1000 / 60;
            const MAX_INACTIVITY_MS = 1000;

            try {
                if (!video || !video.videoWidth || !video.videoHeight) {
                    return { error: 'Video not ready' };
                }

                // Initialize analysis timing
                if (this.analysisStartTime === null) {
                    this.analysisStartTime = timestamp;
                    this.lastExportTime = timestamp;
                }

                const relativeTime = timestamp - this.analysisStartTime;

                // Frame rate limiting using monotonic browser clock
                const nowMs = performance.now();
                const timeSinceLastFrame = nowMs - (this.lastAnalysisPerf || 0);
                if (timeSinceLastFrame < FRAME_INTERVAL_MS) return null;
                this.lastAnalysisPerf = nowMs;

                if (timestamp - (this.metrics.lastTimestamp || 0) > MAX_INACTIVITY_MS) {
                    this.reset();
                }

                // Update metrics for new frame
                this.metrics.frameCount++;
                this.metrics.lastTimestamp = timestamp;

                // Capture frame and compute color metrics
                const imageData = this.captureFrame(video);
                const redIntensity = this.calculateAverageRedIntensity(imageData.data);
                const prevRedIntensity = (typeof this.lastRedIntensity === 'number' && isFinite(this.lastRedIntensity)) ? this.lastRedIntensity : 0;
                const redDelta = Math.abs(redIntensity - prevRedIntensity);
                this.lastRedIntensity = redIntensity;
                const results = this.processFrame(imageData, timestamp, relativeTime, redIntensity, redDelta);

                return results;
            } catch (error) {

                console.error('Analysis error:', error);
                return { error: error.message || 'Unknown analysis error' };
            }
        }


        processFrame(imageData, timestamp, relativeTime, redIntensity = 0, redDelta = 0) {
            const brightness = this.calculateAverageBrightness(imageData.data);
            const brightnessDiff = Math.abs(brightness - this.metrics.lastFrameBrightness);
            const isFlash = brightnessDiff > this.thresholds.brightnessChange;

            const dominantColor = window.AnalyzerHelpers.calculateDominantColor(imageData);
            const dominantLab = window.AnalyzerHelpers.rgbToLab(dominantColor.r, dominantColor.g, dominantColor.b);

            let cie76Delta = 0;
            if (this.lastDominantLab) {
                cie76Delta = window.AnalyzerHelpers.cie76(dominantLab, this.lastDominantLab);
            }
            this.lastDominantLab = dominantLab;

            const patternedStimulusScore = this.detectPatternedStimulus(imageData);

            let sceneChangeScore = 0;
            if (this.lastFrame && imageData) {
                sceneChangeScore = window.AnalyzerHelpers.frameHistogramDiff(
                    imageData.data, this.lastFrame.data
                );
            }
            this.sceneChangeHistory.push(sceneChangeScore);

            const metrics = {
                colorVariance: this.calculateColorVariance(imageData),
                temporalChange: this.calculateTemporalChange(brightness),
                flickerFrequency: this.estimateFlickerFrequency(),
                entropy: this.calculateFrameEntropy(imageData),
                psi: this.calculatePSI(brightness, brightnessDiff),
                spatialData: this.analyzeSpatialDistribution(imageData),
                chromaticData: this.analyzeChromaticFlashes(imageData),
                temporalContrastData: this.analyzeTemporalContrast(brightness, timestamp),
                frameDiffData: window.AnalyzerHelpers.calculateFrameDifference.call(this, imageData),
                spectralData: this.performSpectralAnalysis(brightness),
                coherenceData: this.calculateTemporalCoherence(brightness),
                edgeData: this.detectEdges(imageData),
                dominantColor: dominantColor,
                dominantLab: dominantLab,
                cie76Delta: cie76Delta,
                patternedStimulusScore: patternedStimulusScore,
                sceneChangeScore: sceneChangeScore
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

            // Set canvas size based on video dimensions
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
         * Calculates the average brightness (luminance) of RGBA pixel data using BT.709 coefficients.
         * @param {Uint8ClampedArray} data - RGBA pixel array.
         * @returns {number} Normalized [0,1] average brightness.
         */
        calculateAverageBrightness(data) {
            const len = data.length;
            if (len < 4) return 0;

            // BT.709 coefficients for luminance 
            const R_COEF = 0.2126, G_COEF = 0.7152, B_COEF = 0.0722;

            let luminanceSum = 0, i = 0;
            const pixelCount = len >>> 2;

            const max = len - (len % 32);
            for (; i < max; i += 32) {
                luminanceSum += (
                    data[i]     * R_COEF + data[i+1]  * G_COEF + data[i+2]  * B_COEF +
                    data[i+4]   * R_COEF + data[i+5]  * G_COEF + data[i+6]  * B_COEF +
                    data[i+8]   * R_COEF + data[i+9]  * G_COEF + data[i+10] * B_COEF +
                    data[i+12]  * R_COEF + data[i+13] * G_COEF + data[i+14] * B_COEF +
                    data[i+16]  * R_COEF + data[i+17] * G_COEF + data[i+18] * B_COEF +
                    data[i+20]  * R_COEF + data[i+21] * G_COEF + data[i+22] * B_COEF +
                    data[i+24]  * R_COEF + data[i+25] * G_COEF + data[i+26] * B_COEF +
                    data[i+28]  * R_COEF + data[i+29] * G_COEF + data[i+30] * B_COEF
                );
            }

            for (; i < len; i += 4) {
                luminanceSum += data[i] * R_COEF + data[i+1] * G_COEF + data[i+2] * B_COEF;
            }

            return luminanceSum / (pixelCount * 255);
        }

        calculateAverageRedIntensity(data) {
            const len = data?.length || 0;
            if (len < 4) return 0;
            let redSum = 0, i = 0;
            const pixelCount = len >>> 2;


            const max = len - (len % 32);
            for (; i < max; i += 32) {
                redSum += data[i]   + data[i+4]  + data[i+8]  + data[i+12] +
                        data[i+16] + data[i+20] + data[i+24] + data[i+28];
            }
            // Handle remaining pixels
            for (; i < len; i += 4) {
                redSum += data[i];
            }

            if (pixelCount === 0) return 0;

            // Normalize
            return redSum / (pixelCount * 255);
        }

        calculateCoverage(imageData, brightnessThreshold = 0.5) {
            if (!imageData?.data || imageData.data.length < 4) return 0;

            const data = imageData.data;
            const pixelCount = data.length >>> 2;
            let brightPixels = 0;

            // BT.709 perceptual weights for sRGB
            const R_COEF = 0.2126, G_COEF = 0.7152, B_COEF = 0.0722;

            let i = 0;
            const max = data.length - (data.length % 16);
            for (; i < max; i += 16) {
                // Pixel 1
                if (((data[i] * R_COEF + data[i+1] * G_COEF + data[i+2] * B_COEF) / 255) > brightnessThreshold) brightPixels++;
                // Pixel 2
                if (((data[i+4] * R_COEF + data[i+5] * G_COEF + data[i+6] * B_COEF) / 255) > brightnessThreshold) brightPixels++;
                // Pixel 3
                if (((data[i+8] * R_COEF + data[i+9] * G_COEF + data[i+10] * B_COEF) / 255) > brightnessThreshold) brightPixels++;
                // Pixel 4
                if (((data[i+12] * R_COEF + data[i+13] * G_COEF + data[i+14] * B_COEF) / 255) > brightnessThreshold) brightPixels++;
            }
            for (; i < data.length; i += 4) {
                if (((data[i] * R_COEF + data[i+1] * G_COEF + data[i+2] * B_COEF) / 255) > brightnessThreshold) brightPixels++;
            }

            return pixelCount ? brightPixels / pixelCount : 0;
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
            const riskAssessment = window.RiskLevelHelper.calculateRiskLevel({
                metrics: this.metrics,
                calculateAverageIntensity: () => this.calculateAverageIntensity(),
                calculateCoverage: (imageData) => this.calculateCoverage(imageData),
                canvas: this.canvas,
                context: this.context,
                advancedMetrics: this.advancedMetrics,
                lastRedIntensity: this.lastRedIntensity,
                prevRedIntensity: this.prevRedIntensity,
                patternHistory: this.patternHistory
            });

            this.metrics.riskLevel = riskAssessment.level;

            return riskAssessment;
        }

        calculateAverageIntensity() {
            const seq = this.metrics.flashSequences;
            const count = seq.length;
            if (count === 0) return 0;

            let sum = 0;
            let validCount = 0;

            for (let i = 0; i < count; i++) {
                let intensity = seq[i]?.intensity;
                if (typeof intensity === 'number' && !isNaN(intensity) && intensity >= 0 && intensity <= 1) {
                    sum += intensity;
                    validCount++;
                }
            }

            return validCount > 0 ? sum / validCount : 0;
        }

        analyzeRiskFactors() {
            const factors = [];
            const flashRate = this.metrics.flashCount / (this.metrics.frameCount / 60);
            if (flashRate > 3) factors.push('High Flash Rate');
            if (this.calculateAverageIntensity() > 0.5) factors.push('High Intensity');
            if (this.metrics.flashSequences.length > 5) factors.push('Multiple Sequences');
            return factors.length ? factors : ['No significant risk factors'];
        }

        calculateColorVariance(imageData) {
            if (!imageData?.data || imageData.data.length < 4) return { r: 0, g: 0, b: 0 };

            const SAMPLE_SIZE = 1024;
            const data = imageData.data;
            const pixelCount = data.length >>> 2;
            const stride = Math.max(1, Math.floor(pixelCount / SAMPLE_SIZE));

            let rSum = 0, gSum = 0, bSum = 0;
            let rSumSq = 0, gSumSq = 0, bSumSq = 0;
            let sampleCount = 0;

            for (let i = 0; i < data.length; i += stride * 4, sampleCount++) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                // Ignores outliers outside 0-255 (corrupted data)
                if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) continue;
                rSum += r; rSumSq += r * r;
                gSum += g; gSumSq += g * g;
                bSum += b; bSumSq += b * b;
            }

            if (sampleCount === 0) return { r: 0, g: 0, b: 0 };

            const rMean = rSum / sampleCount, gMean = gSum / sampleCount, bMean = bSum / sampleCount;
            const rVar = Math.max(0, rSumSq / sampleCount - rMean * rMean);
            const gVar = Math.max(0, gSumSq / sampleCount - gMean * gMean);
            const bVar = Math.max(0, bSumSq / sampleCount - bMean * bMean);

            const currentVariance = {
                r: Math.sqrt(rVar) / 255,
                g: Math.sqrt(gVar) / 255,
                b: Math.sqrt(bVar) / 255
            };

            // Ring buffer for temporal color history
            const historyLen = this.advancedMetrics.historyLength || 30;
            if (!this.advancedMetrics.colorHistory._ring) {
                this.advancedMetrics.colorHistory._ring = {
                    r: new Float32Array(historyLen).fill(0),
                    g: new Float32Array(historyLen).fill(0),
                    b: new Float32Array(historyLen).fill(0),
                    idx: 0,
                    count: 0
                };
            }

            const ring = this.advancedMetrics.colorHistory._ring;
            ring.r[ring.idx] = rMean;
            ring.g[ring.idx] = gMean;
            ring.b[ring.idx] = bMean;
            ring.idx = (ring.idx + 1) % historyLen;
            if (ring.count < historyLen) ring.count++;

            // Create proper arrays from ring buffer for temporal analysis, fixes issue with correct historical data for variance calculation
            const rHistory = new Float32Array(ring.count);
            const gHistory = new Float32Array(ring.count);
            const bHistory = new Float32Array(ring.count);

            for (let i = 0; i < ring.count; i++) {
                // Calculate correct index in the ring buffer
                const idx = (ring.idx - 1 - i + historyLen) % historyLen;
                rHistory[i] = ring.r[idx];
                gHistory[i] = ring.g[idx];
                bHistory[i] = ring.b[idx];
            }

            // Store current color history for temporal analysis
            this.advancedMetrics.colorHistory.r = Array.from(rHistory);
            this.advancedMetrics.colorHistory.g = Array.from(gHistory);
            this.advancedMetrics.colorHistory.b = Array.from(bHistory);

            const temporalAnalysis = this.analyzeColorHistory();

            return {
                current: currentVariance,
                temporal: temporalAnalysis.variance,
                spikes: temporalAnalysis.spikes,
                averageChange: temporalAnalysis.averageChange
            };
        }

        analyzeColorHistory() {
            const history = this.advancedMetrics.colorHistory;
            const n = Math.min(history.r.length, history.g.length, history.b.length);

            if (n < 2) {
                return {
                    variance: { r: 0, g: 0, b: 0 },
                    spikes: [],
                    averageChange: { r: 0, g: 0, b: 0 }
                };
            }

            const variance = { r: 0, g: 0, b: 0 };
            ['r','g','b'].forEach(ch => {
                variance[ch] = this.calculateTemporalVariance(history[ch].slice(0, n));
            });

            const changes = { r: [], g: [], b: [] };
            for (let i = 1; i < n; i++) {
                ['r','g','b'].forEach(ch => {
                    const prev = history[ch][i-1];
                    const curr = history[ch][i];
                    if (typeof curr === 'number' && typeof prev === 'number' && !isNaN(curr) && !isNaN(prev)) {
                        changes[ch].push(Math.abs(curr - prev));
                    }
                });
            }

            const spikes = this.detectColorSpikes(changes);

            const averageChange = { r: 0, g: 0, b: 0 };
            ['r','g','b'].forEach(ch => {
                const arr = changes[ch];
                if (arr.length > 0) {
                    let sum = 0, validCount = 0;
                    for (let i = 0; i < arr.length; i++) {
                        if (typeof arr[i] === 'number' && !isNaN(arr[i])) {
                            sum += arr[i];
                            validCount++;
                        }
                    }
                    averageChange[ch] = validCount ? sum / validCount : 0;
                }
            });
            // console.log('Color history lengths:', history.r.length, history.g.length, history.b.length);
            // if (spikes.length > 0) console.warn('Color spikes detected:', spikes);

            return {
                variance,
                spikes,
                averageChange
            };
        }

        calculateTemporalVariance(values) {
            if (!Array.isArray(values) || values.length < 2) return 0;

            let sum = 0, count = 0;
            for (let i = 0; i < values.length; i++) {
                const v = values[i];
                if (typeof v === 'number' && !isNaN(v)) {
                    sum += v;
                    count++;
                }
            }
            if (count < 2) return 0;
            const mean = sum / count;

            let sqDiffSum = 0;
            for (let i = 0; i < values.length; i++) {
                const v = values[i];
                if (typeof v === 'number' && !isNaN(v)) {
                    sqDiffSum += (v - mean) * (v - mean);
                }
            }
            const variance = sqDiffSum / count;

            // The division by 255 caused values that were 0 basically only allowing [0,255]
            // Only normalize if the input values are in the 0-255 range so allows [0,1] or [0,255]
            const maxValue = Math.max(...values.filter(v => typeof v === 'number' && !isNaN(v)));
            const normalizationFactor = maxValue > 1 ? 255 : 1;

            return Math.sqrt(variance) / normalizationFactor;

        }

        detectColorSpikes(changes, fixedThreshold = 0.2, stdDevMultiplier = 2) {
            const spikes = [];
            ['r', 'g', 'b'].forEach(channel => {
                const arr = Array.isArray(changes[channel]) ? changes[channel] : [];
                if (arr.length < 2) return;

                let sum = 0, count = 0;
                for (let i = 0; i < arr.length; i++) {
                    const v = arr[i];
                    if (typeof v === 'number' && !isNaN(v)) {
                        sum += v; count++;
                    }
                }
                if (count < 2) return;
                const mean = sum / count;

                let sqDiffSum = 0;
                for (let i = 0; i < arr.length; i++) {
                    const v = arr[i];
                    if (typeof v === 'number' && !isNaN(v)) {
                        sqDiffSum += (v - mean) * (v - mean);
                    }
                }
                const stdDev = Math.sqrt(sqDiffSum / count);
                const spikeThreshold = mean + stdDevMultiplier * stdDev;

                for (let i = 0; i < arr.length; i++) {
                    const change = arr[i];
                    if (
                        typeof change === 'number' && !isNaN(change) &&
                        change > spikeThreshold && change > fixedThreshold
                    ) {
                        spikes.push({ channel, frameIndex: i, magnitude: change });
                    }
                }
            });

            // if (spikes.length) console.warn('Color spikes detected:', spikes);

            return spikes;
        }

        calculateTemporalChange(currentBrightness, maxHistory = 1000) {
            if (typeof currentBrightness !== 'number' || isNaN(currentBrightness) || currentBrightness < 0 || currentBrightness > 1)
                currentBrightness = 0;

            const changes = this.advancedMetrics.temporalChanges;
            let change = 0;

            if (changes.length > 0) {
                const last = changes[changes.length - 1];
                if (typeof last.brightness === 'number' && !isNaN(last.brightness)) {
                    change = Math.abs(currentBrightness - last.brightness);
                }
            }

            changes.push({
                timestamp: Date.now(),
                brightness: currentBrightness,
                change
            });

            if (changes.length > maxHistory) changes.shift();

            // if (change > 0.5) console.warn('Sudden brightness spike detected:', change);

            return change;
        }

        estimateFlickerFrequency() {
            const changes = this.advancedMetrics.temporalChanges;
            const n = changes.length;
            if (n < 2) return 0;

            let sumDiff = 0, count = 0;
            let prevTimestamp = null;

            for (let i = 0; i < n; i++) {
                const entry = changes[i];
                if (
                    entry && typeof entry.brightness === 'number' && typeof entry.change === 'number' &&
                    typeof entry.timestamp === 'number' && !isNaN(entry.timestamp) &&
                    entry.change > this.thresholds.brightnessChange
                ) {
                    if (prevTimestamp !== null) {
                        const diff = entry.timestamp - prevTimestamp;
                        if (diff > 0 && diff < 10000) {
                            sumDiff += diff;
                            count++;
                        }
                    }
                    prevTimestamp = entry.timestamp;
                }
            }

            if (count === 0 || sumDiff === 0) return 0;
            const avgTimeDiff = sumDiff / count;

            const frequency = avgTimeDiff > 0 ? Math.min(1000 / avgTimeDiff, 100) : 0;

            // if (frequency > 3) console.warn('Flicker detected:', frequency, 'Hz');

            return frequency;
        }

        calculateFrameEntropy(imageData, maxHistory = 1000) {
            if (!imageData?.data || !imageData.width || !imageData.height) return 0;

            const data = imageData.data;
            const width = imageData.width;
            const height = imageData.height;
            const pixels = width * height;
            if (pixels === 0) return 0;

            const histogram = new Uint32Array(256); // 8-bit brightness bins
            const rWeight = 0.2126, gWeight = 0.7152, bWeight = 0.0722;

            let i = 0, len = data.length;
            for (; i <= len - 32; i += 32) {
                for (let k = 0; k < 32; k += 4) {
                    let r = data[i + k], g = data[i + k + 1], b = data[i + k + 2];
                    r = (typeof r === 'number' && !isNaN(r)) ? r : 0;
                    g = (typeof g === 'number' && !isNaN(g)) ? g : 0;
                    b = (typeof b === 'number' && !isNaN(b)) ? b : 0;
                    let brightness = Math.round(r * rWeight + g * gWeight + b * bWeight);
                    brightness = Math.max(0, Math.min(255, brightness));
                    histogram[brightness]++;
                }
            }

            for (; i < len; i += 4) {
                let r = data[i], g = data[i + 1], b = data[i + 2];
                r = (typeof r === 'number' && !isNaN(r)) ? r : 0;
                g = (typeof g === 'number' && !isNaN(g)) ? g : 0;
                b = (typeof b === 'number' && !isNaN(b)) ? b : 0;
                let brightness = Math.round(r * rWeight + g * gWeight + b * bWeight);
                brightness = Math.max(0, Math.min(255, brightness));
                histogram[brightness]++;
            }


            let entropy = 0;
            for (let j = 0; j < 256; j++) {
                const h = histogram[j];
                if (h) {
                    const p = h / pixels;
                    entropy -= p * Math.log2(p);
                }
            }

            // Manage capped entropy history
            const history = this.advancedMetrics.frameEntropy;
            history.push(entropy);
            if (history.length > maxHistory) history.shift();

            // if (entropy < 3 || entropy > 7) console.warn('Entropy outlier:', entropy);

            return entropy;
        }

        calculatePSI(brightness, brightnessDiff, weights = { frequency: 0.3, intensity: 0.25, coverage: 0.2, duration: 0.15, brightness: 0.1 }) {

            brightness = (typeof brightness === 'number' && brightness >= 0 && brightness <= 1) ? brightness : 0;
            brightnessDiff = (typeof brightnessDiff === 'number' && brightnessDiff >= 0 && brightnessDiff <= 1) ? brightnessDiff : 0;


            const frameCount = this.metrics.frameCount || 1;
            const flashCount = this.metrics.flashCount || 0;
            const frequency = frameCount > 0 ? flashCount / (frameCount / 60) : 0;

            const normFrequency = Math.min(frequency / 3, 1);

            let coverage = 0;
            try {
                coverage = this.calculateCoverage(this.context.getImageData(0, 0, this.canvas.width, this.canvas.height));
                coverage = (typeof coverage === 'number' && coverage >= 0 && coverage <= 1) ? coverage : 0;
            } catch (e) {
                coverage = 0;
            }

            let duration = 0;
            if (Array.isArray(this.metrics.flashSequences) && this.metrics.flashSequences.length > 0) {
                const lastSeq = this.metrics.flashSequences[this.metrics.flashSequences.length - 1];
                duration = (lastSeq && typeof lastSeq.frameDuration === 'number' && lastSeq.frameDuration >= 0) ? lastSeq.frameDuration : 0;
            }

            const normDuration = Math.min(duration / 50, 1);
            const normIntensity = Math.min(brightnessDiff / 0.2, 1);

            const psi = {
                frequency: normFrequency,
                intensity: normIntensity,
                coverage: coverage,
                duration: normDuration,
                brightness: brightness
            };

            const score = (
                psi.frequency * (weights.frequency || 0.3) +
                psi.intensity * (weights.intensity || 0.25) +
                psi.coverage * (weights.coverage || 0.2) +
                psi.duration * (weights.duration || 0.15) +
                psi.brightness * (weights.brightness || 0.1)
            );


            if (!Array.isArray(this.advancedMetrics.psiHistory)) this.advancedMetrics.psiHistory = [];
            this.advancedMetrics.psi = { score, components: psi };
            this.advancedMetrics.psiHistory.push({ timestamp: Date.now(), score, components: psi });
            if (this.advancedMetrics.psiHistory.length > 1000) this.advancedMetrics.psiHistory.shift();

            // if (score > 0.8) console.warn('High PSI risk score:', score, psi);

            return { score, components: psi };
        }


        analyzeSpatialDistribution(imageData) {
            if (!imageData?.data || !imageData.width || !imageData.height) {
                return { center: 0, periphery: 0, quadrants: [0, 0, 0, 0] };
            }

            const width = imageData.width;
            const height = imageData.height;
            const centerRadius = Math.min(width, height) * 0.2; // 20% radius: default for central risk
            const data = imageData.data;
            let centerSum = 0, peripherySum = 0;
            const quadrants = [0, 0, 0, 0];
            let centerPixels = 0, peripheryPixels = 0;
            const halfW = width / 2, halfH = height / 2;
            const quadrantCounts = [0, 0, 0, 0];

            // Main loop
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    let r = data[i], g = data[i + 1], b = data[i + 2];
                    r = (typeof r === 'number' && !isNaN(r)) ? r : 0;
                    g = (typeof g === 'number' && !isNaN(g)) ? g : 0;
                    b = (typeof b === 'number' && !isNaN(b)) ? b : 0;
                    const brightness = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;

                    const dx = x - halfW, dy = y - halfH;
                    const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);

                    if (distanceFromCenter < centerRadius) {
                        centerSum += brightness;
                        centerPixels++;
                    } else {
                        peripherySum += brightness;
                        peripheryPixels++;
                    }

                    // Quadrant index: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
                    const quadrantIndex = (x < halfW ? 0 : 1) + (y < halfH ? 0 : 2);
                    quadrants[quadrantIndex] += brightness;
                    quadrantCounts[quadrantIndex]++;
                }
            }

            const normalizedQuadrants = quadrants.map((sum, idx) => quadrantCounts[idx] > 0 ? sum / quadrantCounts[idx] : 0);

            //normalizedQuadrants.forEach((q, idx) => {
            //   if (q > 0.8) console.warn(`Quadrant ${idx} unusually bright:`, q);
           // });

            return {
                center: centerPixels > 0 ? centerSum / centerPixels : 0,
                periphery: peripheryPixels > 0 ? peripherySum / peripheryPixels : 0,
                quadrants: normalizedQuadrants
            };
        }

        analyzeChromaticFlashes(imageData, historyLen = 10) {
            if (!imageData?.data || !imageData.width || !imageData.height) {
                return { redGreen: 0, blueYellow: 0 };
            }
            const data = imageData.data;
            const len = data.length;
            const pixels = len >>> 2;
            let redGreenSum = 0, blueYellowSum = 0;

            let i = 0;
            for (; i <= len - 16; i += 16) {
                for (let k = 0; k < 16; k += 4) {
                    let r = data[i + k], g = data[i + k + 1], b = data[i + k + 2];
                    r = (typeof r === 'number' && !isNaN(r)) ? r : 0;
                    g = (typeof g === 'number' && !isNaN(g)) ? g : 0;
                    b = (typeof b === 'number' && !isNaN(b)) ? b : 0;
                    redGreenSum += Math.abs(r - g);
                    blueYellowSum += Math.abs(b - Math.round((r + g) / 2));
                }
            }
            for (; i < len; i += 4) {
                let r = data[i], g = data[i + 1], b = data[i + 2];
                r = (typeof r === 'number' && !isNaN(r)) ? r : 0;
                g = (typeof g === 'number' && !isNaN(g)) ? g : 0;
                b = (typeof b === 'number' && !isNaN(b)) ? b : 0;
                redGreenSum += Math.abs(r - g);
                blueYellowSum += Math.abs(b - Math.round((r + g) / 2));
            }

            const norm = pixels > 0 ? 1 / (pixels * 255) : 0;
            const result = {
                redGreen: redGreenSum * norm,
                blueYellow: blueYellowSum * norm
            };

            // Maintain capped history for temporal analysis
            const lastColors = this.advancedMetrics.chromaticFlashes.lastColors || [];
            lastColors.push(result);
            if (lastColors.length > historyLen) lastColors.shift();
            this.advancedMetrics.chromaticFlashes.lastColors = lastColors;

        // if (result.redGreen > 0.8 || result.blueYellow > 0.8) console.warn('High chromatic flash detected:', result);

            return result;
        }

        analyzeTemporalContrast(brightness, timestamp, bufferLen = 15) {
            brightness = (typeof brightness === 'number' && brightness >= 0 && brightness <= 1 && !isNaN(brightness)) ? brightness : 0;
            timestamp = (typeof timestamp === 'number' && !isNaN(timestamp)) ? timestamp : Date.now();

            const tc = this.advancedMetrics.temporalContrast;
            if (!tc._ring || tc._ring.brightness.length !== bufferLen) {
                tc._ring = {
                    brightness: new Float32Array(bufferLen),
                    timestamp: new Float64Array(bufferLen),
                    idx: 0,
                    count: 0
                };
                tc.maxRate = 0; // Initialize maxRate
            }
            const ring = tc._ring;

            // Store values in ring buffer
            ring.brightness[ring.idx] = brightness;
            ring.timestamp[ring.idx] = timestamp;
            ring.idx = (ring.idx + 1) % bufferLen;
            if (ring.count < bufferLen) ring.count++;

            let maxRate = 0;
            for (let i = 1; i < ring.count; i++) {
                const prevIdx = (ring.idx + i - ring.count) % bufferLen;
                const currIdx = (ring.idx + i - ring.count + 1) % bufferLen;
                const timeDiff = ring.timestamp[currIdx] - ring.timestamp[prevIdx];
                if (timeDiff > 0.001) {
                    const rate = Math.abs(ring.brightness[currIdx] - ring.brightness[prevIdx]) / timeDiff;
                    maxRate = Math.max(maxRate, Math.min(rate, 1000));
                }
            }

            tc.current = maxRate;
            tc.maxRate = Math.max(maxRate, typeof tc.maxRate === 'number' ? tc.maxRate : 0);

            tc.history = [];
            for (let i = 0; i < ring.count; i++) {
                const idx = (ring.idx + i - ring.count) % bufferLen;
                tc.history.push({ brightness: ring.brightness[idx], timestamp: ring.timestamp[idx] });
            }

            // if (maxRate > 0.5) console.warn('High temporal contrast detected:', maxRate);

            return {
                currentRate: maxRate,
                maxRate: tc.maxRate
            };
        }

        performSpectralAnalysis(brightness, bufferLen = 128, fftLen = 64, fps = 60) {

            try {
        brightness = (typeof brightness === 'number' && brightness >= 0 && brightness <= 1 && !isNaN(brightness)) ? brightness : 0;


        if (!this.temporalBuffer._ring || this.temporalBuffer._ring.buffer.length !== bufferLen) {
            this.temporalBuffer._ring = {
                buffer: new Float32Array(bufferLen),
                idx: 0,
                count: 0
            };
        }
        const ring = this.temporalBuffer._ring;

        // Store brightness sample
        ring.buffer[ring.idx] = brightness;
        ring.idx = (ring.idx + 1) % bufferLen;
        if (ring.count < bufferLen) ring.count++;

        if (ring.count < Math.max(32, fftLen)) {
            return { dominantFrequency: 0, spectrum: [], spectralFlatness: 0, windowSize: ring.count };
        }

        const N = Math.min(fftLen, ring.count);
        const signal = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            signal[i] = ring.buffer[(ring.idx + i - N + bufferLen) % bufferLen];
        }

        for (let i = 0; i < N; i++) {
            signal[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
        }

        const { re, im } = window.AnalyzerHelpers.padToPowerOfTwo(signal);
        const spectrum = [];
        for (let i = 0; i < N; i++) {
            spectrum.push({
                frequency: (i * fps) / N,
                amplitude: 2 * Math.hypot(re[i], im[i]) / N
            });
        }

        // Find dominant frequency (risk: 3–30Hz band)
        let maxAmp = 0, domIdx = 1;
        const half = Math.floor(spectrum.length / 2); // Nyquist
        for (let i = 1; i < half; i++) {
            if (spectrum[i].amplitude > maxAmp) {
                maxAmp = spectrum[i].amplitude;
                domIdx = i;
            }
        }
        const dominantFrequency = spectrum[domIdx]?.frequency || 0;

        let spectralFlatness = 0;
        if (window.AnalyzerHelpers?.computeSpectralFlatness && typeof window.AnalyzerHelpers.computeSpectralFlatness === 'function') {
            spectralFlatness = window.AnalyzerHelpers.computeSpectralFlatness(spectrum.slice(1, half));
        }

        return {
            dominantFrequency,
            spectrum: spectrum.slice(0, half),
            windowSize: N,
            spectralFlatness
        };
    } catch (error) {
        console.error('Spectral analysis error:', error);
        return { dominantFrequency: 0, spectrum: [], windowSize: 0, spectralFlatness: 0 };
    }
}

        detectPeriodicity(signal, minLag = 2, threshold = 0.5) {
            if (!Array.isArray(signal) || signal.length < minLag + 2) {
                return { isPeriodic: false, period: 0, confidence: 0, autocorr: [] };
            }
            const len = signal.length;
            const clean = signal.map(v => (typeof v === 'number' && isFinite(v)) ? v : 0);
            const mean = clean.reduce((a, b) => a + b, 0) / len;

            const autocorr = [];
            for (let lag = minLag; lag < Math.floor(len / 2); lag++) {
                let corr = 0, normA = 0, normB = 0;
                for (let i = 0; i < len - lag; i++) {
                    const a = clean[i] - mean;
                    const b = clean[i + lag] - mean;
                    corr += a * b;
                    normA += a * a;
                    normB += b * b;
                }
                const norm = Math.sqrt(normA * normB);
                autocorr[lag] = norm > 0 ? corr / norm : 0;
            }

            // Find max peak (excluding lag=0)
            let maxVal = -Infinity, maxLag = minLag;
            for (let lag = minLag + 1; lag < autocorr.length - 1; lag++) {
                if (autocorr[lag] > autocorr[lag - 1] && autocorr[lag] > autocorr[lag + 1]) {
                    if (autocorr[lag] > maxVal) {
                        maxVal = autocorr[lag];
                        maxLag = lag;
                    }
                }
            }

            const isPeriodic = maxVal > threshold;
            
            // if (isPeriodic) console.warn('Periodicity detected:', { period: maxLag, confidence: maxVal });

            return {
                isPeriodic,
                period: isPeriodic ? maxLag : 0,
                confidence: isPeriodic ? maxVal : 0,
                autocorr
            };
        }

        calculateTemporalCoherence(brightness, windowSize = 30, maxLag = 10) {
            brightness = (typeof brightness === 'number' && brightness >= 0 && brightness <= 1 && !isNaN(brightness)) ? brightness : 0;

            // Init buffer and metrics
            const tc = this.advancedMetrics.temporalCoherence;
            if (!tc._ring || tc._ring.buffer.length !== windowSize) {
                tc._ring = {
                    buffer: new Float32Array(windowSize),
                    idx: 0,
                    count: 0
                };
                tc.coherenceHistory = [];
            }
            const ring = tc._ring;

            // Store brightness in ring buffer
            ring.buffer[ring.idx] = brightness;
            ring.idx = (ring.idx + 1) % windowSize;
            if (ring.count < windowSize) ring.count++;

            // Early exit for short buffers
            const len = ring.count;
            if (len < 2) return { coherenceScore: 0, periodicity: { isPeriodic: false, period: 0, confidence: 0 }, lags: [] };

            const validBuffer = [];
            for (let i = 0; i < len; i++) {
                const v = ring.buffer[i];
                validBuffer.push((typeof v === 'number' && isFinite(v)) ? v : 0);
            }

            const mean = validBuffer.reduce((a, b) => a + b, 0) / len;
            const variance = validBuffer.reduce((a, b) => a + (b - mean) * (b - mean), 0) / len || 1e-8;

            let coherence = 0;
            const lags = [];
            const usedMaxLag = Math.min(maxLag, len - 1);
            for (let lag = 1; lag <= usedMaxLag; lag++) {
                let corr = 0;
                let n = len - lag;
                for (let i = 0; i < n; i++) {
                    corr += (validBuffer[i] - mean) * (validBuffer[i + lag] - mean);
                }
                corr = corr / (n * variance);
                coherence += Math.abs(corr);
                lags.push({ lag, correlation: corr });
            }
            const coherenceScore = usedMaxLag > 0 ? coherence / usedMaxLag : 0;

            let periodicity = { isPeriodic: false, period: 0, confidence: 0 };
            if (typeof this.detectPeriodicity === 'function') {
                periodicity = this.detectPeriodicity(validBuffer);
            }

            tc.coherenceHistory = tc.coherenceHistory || [];
            tc.coherenceHistory.push({ timestamp: Date.now(), coherenceScore, periodicity, buffer: [...validBuffer] });
            if (tc.coherenceHistory.length > 1000) tc.coherenceHistory.shift();


           // if (coherenceScore > 0.7) console.warn('High temporal coherence detected:', coherenceScore);

            return {
                coherenceScore,
                periodicity,
                lags
            };
        }

        detectEdges(imageData, sobelThreshold = 50, maxHistory = 500) {

            if (!imageData?.data || !imageData.width || !imageData.height) {
                return { edgeDensity: 0, edgeCount: 0, temporalEdgeChange: 0, edgeMap: null };
            }

            const width = imageData.width;
            const height = imageData.height;
            const data = imageData.data;
            const gray = new Float32Array(width * height);

            for (let i = 0, j = 0; i < data.length; i += 4, ++j) {
                const r = (typeof data[i] === 'number' && !isNaN(data[i])) ? data[i] : 0;
                const g = (typeof data[i + 1] === 'number' && !isNaN(data[i + 1])) ? data[i + 1] : 0;
                const b = (typeof data[i + 2] === 'number' && !isNaN(data[i + 2])) ? data[i + 2] : 0;
                gray[j] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            }

            let edgeCount = 0;
            const edgeMap = new Uint8Array(width * height); // Binary edge mask

            // Sobel edge detection
            for (let y = 1; y < height - 1; ++y) {
                let yw = y * width, ym1w = (y - 1) * width, yp1w = (y + 1) * width;
                for (let x = 1; x < width - 1; ++x) {
                    let gx =
                        -gray[ym1w + (x - 1)] - 2 * gray[yw + (x - 1)] - gray[yp1w + (x - 1)] +
                        gray[ym1w + (x + 1)] + 2 * gray[yw + (x + 1)] + gray[yp1w + (x + 1)];
                    let gy =
                        -gray[ym1w + (x - 1)] - 2 * gray[ym1w + x] - gray[ym1w + (x + 1)] +
                        gray[yp1w + (x - 1)] + 2 * gray[yp1w + x] + gray[yp1w + (x + 1)];
                    let mag = Math.hypot(gx, gy);

                    if (mag > sobelThreshold) {
                        edgeCount++;
                        edgeMap[yw + x] = 255; // Mark edge pixel
                    }
                }
            }

            const validPixels = (width - 2) * (height - 2);
            const edgeDensity = validPixels > 0 ? edgeCount / validPixels : 0;


            const hist = this.advancedMetrics.edgeDetection.history;
            hist.push(edgeDensity);
            if (hist.length > maxHistory) hist.shift();

            // if (edgeDensity > 0.3) console.warn('High edge density detected:', edgeDensity);


            return {
                edgeDensity,
                edgeCount,
                temporalEdgeChange: (typeof this.calculateEdgeChange === 'function') ? this.calculateEdgeChange() : 0,
                edgeMap
            };
        }


        getLuminance(data, idx, weights = [0.2126, 0.7152, 0.0722]) {
            if (!Array.isArray(data) && !(data instanceof Uint8ClampedArray)) return 0;
            const len = data.length;
            if (typeof idx !== 'number' || idx < 0 || idx > len - 3) return 0;

            const r = (typeof data[idx] === 'number' && isFinite(data[idx])) ? data[idx] : 0;
            const g = (typeof data[idx + 1] === 'number' && isFinite(data[idx + 1])) ? data[idx + 1] : 0;
            const b = (typeof data[idx + 2] === 'number' && isFinite(data[idx + 2])) ? data[idx + 2] : 0;

            // BT.709 weights for perceptual luminance; can override for calibration
            return r * weights[0] + g * weights[1] + b * weights[2];
        }

        calculateEdgeChange(window = 2) {
            const hist = this.advancedMetrics?.edgeDetection?.history;
            if (!Array.isArray(hist) || hist.length < window) return 0;

            let change = 0;
            for (let i = 1; i < window; i++) {
                const a = (typeof hist[hist.length - i] === 'number' && isFinite(hist[hist.length - i])) ? hist[hist.length - i] : 0;
                const b = (typeof hist[hist.length - i - 1] === 'number' && isFinite(hist[hist.length - i - 1])) ? hist[hist.length - i - 1] : 0;
                change += Math.abs(a - b);
            }

            const edgeChange = window > 1 ? change / (window - 1) : change;

            // if (edgeChange > 0.2) console.warn('High edge change detected:', edgeChange);


            return edgeChange;
        }
        // Color Change Mag added:
        // Improves the number of exported metrics from 47 to 48
        // It is the overall amount of color change between frames, calculated as the Euclidean distance of the avg change rates for R, G, B channels
        generateCSV() {
            try {
                const headers = [
                    'Timestamp',
                    'Brightness',
                    'Flash Detected',
                    'Intensity',
                    'Current R Variance',
                    'Current G Variance',
                    'Current B Variance',
                    'Temporal R Variance',
                    'Temporal G Variance',
                    'Temporal B Variance',
                    'R Change Rate',
                    'G Change Rate',
                    'B Change Rate',
                    'Color Spikes Count',
                    'Temporal Change',
                    'Flicker Frequency (Hz)',
                    'Frame Entropy',
                    'PSI Score',
                    'PSI Frequency',
                    'PSI Intensity',
                    'PSI Coverage',
                    'PSI Duration',
                    'Center Flash Intensity',
                    'Peripheral Flash Intensity',
                    'Red-Green Contrast',
                    'Blue-Yellow Contrast',
                    'Temporal Contrast Rate',
                    'Frame Difference',
                    'Motion Ratio',
                    'Dominant Frequency',
                    'Spectral Flatness',
                    'Temporal Coherence',
                    'Edge Density',
                    'Edge Count',
                    'Edge Change Rate',
                    'Red Intensity',
                    'Red Delta',
                    'Dominant Color R',
                    'Dominant Color G',
                    'Dominant Color B',
                    'Dominant Lab L',
                    'Dominant Lab a',
                    'Dominant Lab b',
                    'CIE76 Delta',
                    'Patterned Stimulus Score',
                    'Scene Change Score',
                    'Color Change Magnitude'

                ];
                const allData = [...this.dataChunks.flat(), ...this.currentChunk]
                    .filter(entry => entry.timestamp >= 0)
                    .sort((a, b) => a.timestamp - b.timestamp);
                console.log(`Exporting data: ${allData.length} frames, from ${this.analysisStartTime} to ${this.lastExportTime}`);
                const rows = allData.map(entry => {
                    const colorVar = entry.colorVariance || {
                        current: { r: 0, g: 0, b: 0 },
                        temporal: { r: 0, g: 0, b: 0 },
                        averageChange: { r: 0, g: 0, b: 0 },
                        spikes: []
                    };

                    // Calculate temporal color change magnitude (Euclidean distance)
                    const rChange = Number(colorVar.averageChange?.r || 0);
                    const gChange = Number(colorVar.averageChange?.g || 0);
                    const bChange = Number(colorVar.averageChange?.b || 0);
                    const colorChangeMagnitude = Math.sqrt(rChange * rChange + gChange * gChange + bChange * bChange);

                    return [
                        Number(entry.timestamp || 0).toFixed(6),
                        Number(entry.brightness || 0).toFixed(4),
                        entry.isFlash ? '1' : '0',
                        Number(entry.intensity || 0).toFixed(4),
                        Number(colorVar.current?.r || 0).toFixed(4),
                        Number(colorVar.current?.g || 0).toFixed(4),
                        Number(colorVar.current?.b || 0).toFixed(4),
                        Number(colorVar.temporal?.r || 0).toFixed(4),
                        Number(colorVar.temporal?.g || 0).toFixed(4),
                        Number(colorVar.temporal?.b || 0).toFixed(4),
                        Number(colorVar.averageChange?.r || 0).toFixed(4),
                        Number(colorVar.averageChange?.g || 0).toFixed(4),
                        Number(colorVar.averageChange?.b || 0).toFixed(4),
                        colorVar.spikes?.length || 0,
                        Number(entry.temporalChange || 0).toFixed(4),
                        Number(entry.flickerFrequency || 0).toFixed(2),
                        Number(entry.entropy || 0).toFixed(4),
                        Number(entry.psi?.score || 0).toFixed(4),
                        Number(entry.psi?.components?.frequency || 0).toFixed(4),
                        Number(entry.psi?.components?.intensity || 0).toFixed(4),
                        Number(entry.psi?.components?.coverage || 0).toFixed(4),
                        Number(entry.psi?.components?.duration || 0).toFixed(4),
                        Number(entry.spatialMap?.center || 0).toFixed(4),
                        Number(entry.spatialMap?.periphery || 0).toFixed(4),
                        Number(entry.chromaticFlashes?.redGreen || 0).toFixed(4),
                        Number(entry.chromaticFlashes?.blueYellow || 0).toFixed(4),
                        Number(entry.temporalContrast?.currentRate || 0).toFixed(4),
                        Number(entry.frameDifference?.difference || 0).toFixed(4),
                        Number(entry.frameDifference?.motion || 0).toFixed(4),
                        Number(entry.spectralAnalysis?.dominantFrequency || 0).toFixed(2),
                        Number(entry.spectralFlatness || 0).toFixed(4),
                        Number(entry.temporalCoherence?.coherenceScore || 0).toFixed(4),
                        Number(entry.edgeDetection?.edgeDensity || 0).toFixed(4),
                        Number(entry.edgeDetection?.edgeCount || 0),
                        Number(entry.edgeDetection?.temporalEdgeChange || 0).toFixed(4),
                        Number(entry.redIntensity || 0).toFixed(4),
                        Number(entry.redDelta || 0).toFixed(4),
                        Number(entry.dominantColor?.r || 0).toFixed(1),
                        Number(entry.dominantColor?.g || 0).toFixed(1),
                        Number(entry.dominantColor?.b || 0).toFixed(1),
                        Number(entry.dominantLab?.L || 0).toFixed(2),
                        Number(entry.dominantLab?.a || 0).toFixed(2),
                        Number(entry.dominantLab?.b || 0).toFixed(2),
                        Number(entry.cie76Delta || 0).toFixed(4),
                        Number(entry.patternedStimulusScore || 0).toFixed(4),
                        Number(entry.sceneChangeScore || 0).toFixed(4),
                        Number(colorChangeMagnitude).toFixed(4)
                    ];
                });
                return [headers, ...rows]
                    .map(row => row.join(','))
                    .join('\n');
            } catch (error) {
                console.error('CSV generation error:', error);
                return 'Error generating CSV';
            }
        }

        generateReport() {
            return {
                videoTitle: this.videoTitle || document.title,
                duration: document.querySelector('video')?.duration || 0,
                metrics: {
                    totalFlashes: this.metrics.flashCount,
                    riskLevel: this.metrics.riskLevel,
                    framesAnalyzed: this.metrics.frameCount,
                    averageFlashRate: this.metrics.flashCount / (this.metrics.frameCount / 60)
                },
                recommendations: this.generateRecommendations(),
                timeline: this.timelineData
            };
        }

        generateRecommendations() {
            const recommendations = [];
            const flashRate = this.metrics.flashCount / (this.metrics.frameCount / 60);
            if (flashRate > 3) {
                recommendations.push('Warning: High flash rate detected');
            }
            if (this.calculateAverageIntensity() > 0.5) {
                recommendations.push('Warning: High intensity flashes detected');
            }
            if (this.metrics.flashSequences.length > 5) {
                recommendations.push('Multiple flash sequences detected');
            }
            return recommendations.length ? recommendations : ['No significant issues detected'];
        }

        generateJSON() {
            try {
                const data = {
                    metadata: {
                        videoTitle: this.videoTitle || document.title,
                        analysisDate: new Date().toISOString(),
                        totalFramesAnalyzed: this.metrics.frameCount,
                        totalFlashesDetected: this.metrics.flashCount,
                        riskLevel: this.metrics.riskLevel
                    },
                    analysis: [...this.dataChunks.flat(), ...this.currentChunk]
                        .filter(entry => entry.timestamp >= 0)
                        .sort((a, b) => a.timestamp - b.timestamp)
                        .map(entry => {
                            const colorVar = entry.colorVariance || {
                                current: { r: 0, g: 0, b: 0 },
                                temporal: { r: 0, g: 0, b: 0 },
                                averageChange: { r: 0, g: 0, b: 0 },
                                spikes: []
                            };

                            // Calculate color change magnitude
                            const rChange = Number(colorVar.averageChange?.r || 0);
                            const gChange = Number(colorVar.averageChange?.g || 0);
                            const bChange = Number(colorVar.averageChange?.b || 0);
                            const colorChangeMagnitude = Math.sqrt(rChange * rChange + gChange * gChange + bChange * bChange);

                            return {
                                timestamp: Number(entry.timestamp || 0).toFixed(6),
                                brightness: Number(entry.brightness || 0).toFixed(4),
                                isFlash: entry.isFlash,
                                intensity: Number(entry.intensity || 0).toFixed(4),
                                colorVariance: {
                                    current: {
                                        r: Number(colorVar.current?.r || 0).toFixed(4),
                                        g: Number(colorVar.current?.g || 0).toFixed(4),
                                        b: Number(colorVar.current?.b || 0).toFixed(4)
                                    },
                                    temporal: {
                                        r: Number(colorVar.temporal?.r || 0).toFixed(4),
                                        g: Number(colorVar.temporal?.g || 0).toFixed(4),
                                        b: Number(colorVar.temporal?.b || 0).toFixed(4)
                                    },
                                    averageChange: {
                                        r: Number(colorVar.averageChange?.r || 0).toFixed(4),
                                        g: Number(colorVar.averageChange?.g || 0).toFixed(4),
                                        b: Number(colorVar.averageChange?.b || 0).toFixed(4),
                                        magnitude: Number(colorChangeMagnitude).toFixed(4)
                                    },
                                    spikes: colorVar.spikes || [],

                                },
                                temporalChange: Number(entry.temporalChange || 0).toFixed(4),
                                flickerFrequency: Number(entry.flickerFrequency || 0).toFixed(2),
                                entropy: Number(entry.entropy || 0).toFixed(4),
                                psi: {
                                    score: Number(entry.psi?.score || 0).toFixed(4),
                                    components: {
                                        frequency: Number(entry.psi?.components?.frequency || 0).toFixed(4),
                                        intensity: Number(entry.psi?.components?.intensity || 0).toFixed(4),
                                        coverage: Number(entry.psi?.components?.coverage || 0).toFixed(4),
                                        duration: Number(entry.psi?.components?.duration || 0).toFixed(4)
                                    }
                                },
                                frameDifference: {
                                    difference: Number(entry.frameDifference?.difference || 0).toFixed(4),
                                    motion: Number(entry.frameDifference?.motion || 0).toFixed(4)
                                },
                                spectralAnalysis: {
                                    dominantFrequency: Number(entry.spectralAnalysis?.dominantFrequency || 0).toFixed(2),
                                    spectrum: entry.spectralAnalysis?.spectrum || [],
                                    spectralFlatness: Number(entry.spectralFlatness || 0).toFixed(4)
                                },
                                temporalCoherence: {
                                    score: Number(entry.temporalCoherence?.coherenceScore || 0).toFixed(4),
                                    periodicity: entry.temporalCoherence?.periodicity
                                },
                                edgeDetection: {
                                    density: Number(entry.edgeDetection?.edgeDensity || 0).toFixed(4),
                                    count: entry.edgeDetection?.edgeCount,
                                    change: Number(entry.edgeDetection?.temporalEdgeChange || 0).toFixed(4)
                                },
                                redIntensity: Number(entry.redIntensity || 0).toFixed(4),
                                redDelta: Number(entry.redDelta || 0).toFixed(4),
                                dominantColor: entry.dominantColor
                                    ? {
                                        r: Number(entry.dominantColor.r || 0).toFixed(1),
                                        g: Number(entry.dominantColor.g || 0).toFixed(1),
                                        b: Number(entry.dominantColor.b || 0).toFixed(1)
                                    }
                                    : { r: 0, g: 0, b: 0 },
                                dominantLab: entry.dominantLab
                                    ? {
                                        L: Number(entry.dominantLab.L || 0).toFixed(2),
                                        a: Number(entry.dominantLab.a || 0).toFixed(2),
                                        b: Number(entry.dominantLab.b || 0).toFixed(2)
                                    }
                                    : { L: 0, a: 0, b: 0 },
                                cie76Delta: Number(entry.cie76Delta || 0).toFixed(4),
                                patternedStimulusScore: Number(entry.patternedStimulusScore || 0).toFixed(4),
                                sceneChangeScore: Number(entry.sceneChangeScore || 0).toFixed(4),
                            }
                        }),
                    colorHistory: {
                        r: this.advancedMetrics.colorHistory.r,
                        g: this.advancedMetrics.colorHistory.g,
                        b: this.advancedMetrics.colorHistory.b
                    }
                };
                return JSON.stringify(data, null, 2);
            } catch (error) {
                console.error('JSON generation error:', error);
                return JSON.stringify({ error: 'Error generating JSON' });
            }
        }

        reset() {
            this.startTime = null;
            this.lastAnalysisTime = 0;
            this.analysisStartTime = null;
            this.lastExportTime = 0;
            this.totalFrames = 0;
            this._frameDiffIdx = 0;
            this.metrics = {
                flashCount: 0,
                riskLevel: 'low',
                timeline: [],
                lastFrameBrightness: 0,
                frameCount: 0,
                flashSequences: [],
                lastTimestamp: 0
            };
            // Reset main data arrays
            this.timelineData = [];
            this.dataChunks = [];
            this.currentChunk = [];
            this._frameDiffHistory = new Float32Array(8);

            const coherenceWindowSize = this.advancedMetrics.temporalCoherence?.windowSize || 30;
            const edgeHistoryMax = this.advancedMetrics?.edgeDetection?.maxHistory || 500;
            const chromaticHistoryLen = this.advancedMetrics?.chromaticFlashes?.maxLen || 10;
            const colorHistoryLen = this.advancedMetrics?.colorHistory?.maxLen || 30;
            const spectralBufferLen = this.advancedMetrics?.spectralAnalysis?.bufferLen || 128;
            const spectralFftLen = this.advancedMetrics?.spectralAnalysis?.fftLen || 64;

            this.advancedMetrics = {
                colorVariance: [],
                temporalChanges: [],
                flickerFrequencies: [],
                frameEntropy: [],
                colorHistory: {
                    r: [],
                    g: [],
                    b: [],
                    maxLen: colorHistoryLen
                },
                spikes: [],
                historyLength: colorHistoryLen,
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
                    lastColors: [],
                    maxLen: chromaticHistoryLen
                },
                temporalContrast: {
                    current: 0,
                    history: [],
                    maxRate: 0,
                    bufferLen: 15
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
                    bufferLen: spectralBufferLen,
                    fftLen: spectralFftLen,
                    fft: null
                },
                temporalCoherence: {
                    coherenceScore: 0,
                    history: [],
                    windowSize: coherenceWindowSize,
                    coherenceHistory: [],
                    maxLag: 10
                },
                edgeDetection: {
                    edges: 0,
                    history: [],
                    threshold: 30,
                    maxHistory: edgeHistoryMax
                }
            };


            this.temporalBuffer.clear();
        }

        calculateDominantColor(imageData) {
            return window.AnalyzerHelpers.calculateDominantColor(imageData);
        }

        detectPatternedStimulus(imageData) {
            const score = window.AnalyzerHelpers.detectPatternedStimulus(imageData);
            this.patternHistory.push(score);
            if (this.patternHistory.length > 30) this.patternHistory.shift();
            return score;
        }

        createTimelineEntry(relativeTime, timestamp, brightness, isFlash, brightnessDiff, metrics, redIntensity = 0, redDelta = 0) {
            const entry = {
                timestamp: timestamp,
                relativeTimestamp: relativeTime,
                absoluteTimestamp: Date.now(),
                brightness: brightness,
                isFlash: isFlash,
                intensity: brightnessDiff,
                colorVariance: metrics.colorVariance,
                temporalChange: metrics.temporalChange,
                flickerFrequency: metrics.flickerFrequency,
                entropy: metrics.entropy,
                psi: metrics.psi,
                spatialMap: metrics.spatialData,
                chromaticFlashes: metrics.chromaticData,
                temporalContrast: metrics.temporalContrastData,
                frameDifference: metrics.frameDiffData,
                spectralAnalysis: metrics.spectralData,
                temporalCoherence: metrics.coherenceData,
                edgeDetection: metrics.edgeData,
                redIntensity: redIntensity,
                redDelta: redDelta,
                dominantColor: metrics.dominantColor,
                dominantLab: metrics.dominantLab,
                cie76Delta: metrics.cie76Delta,
                patternedStimulusScore: metrics.patternedStimulusScore,
                sceneChangeScore: metrics.sceneChangeScore
            };
            entry.spectralFlatness = metrics.spectralData?.spectralFlatness ?? 0;
            this.currentChunk.push(entry);
            this.totalFrames++;
            if (this.currentChunk.length >= this.chunkSize) {
                this.dataChunks.push(this.currentChunk);
                this.currentChunk = [];
            }
            return entry;
        }

        updateStorage(timelineEntry) {
            this.timelineData.push(timelineEntry);
        }

        createResults(timelineEntry) {
            return {
                ...timelineEntry,
                flashCount: this.metrics.flashCount,
                riskLevel: this.metrics.riskLevel,
                framesAnalyzed: this.metrics.frameCount,
                fps: Math.round(this.metrics.frameCount / Math.max(1, timelineEntry.timestamp - this.analysisStartTime)),
                sequenceLength: this.metrics.flashSequences.length
            };
        }

        performFFT(signal) {
            return window.AnalyzerHelpers.performFFT(signal);
        }
    }

    window.VideoAnalyzer = VideoAnalyzer;
}