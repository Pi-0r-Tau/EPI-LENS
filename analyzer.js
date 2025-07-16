"use strict";

if (!window.VideoAnalyzer) {
    /**
     * @class VideoAnalyzer
     * @classdesc Video analysis utility for detecting visual risks such as flash, flickering and chromatic anomalies. It computes metrics including brightness, colour variance, entropy and temporal coherence to assess visual risk levels. Uses helper functions
     * from the analyzer-helpers.js.
     */
    class VideoAnalyzer {
    /**
     * Constructs a new VideoAnalyzer instance.
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

            // FFT implementation
            // TASK 2786: O(m log m) Cooley-Turkey FTT Improvements
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
            try {
                if (this.analysisStartTime === null) {
                    this.analysisStartTime = timestamp;
                    this.lastExportTime = timestamp;
                }

                // Calculate relative timestamp from start
                const relativeTime = timestamp - this.analysisStartTime;

                // Frame rate limiting
                const currentTime = performance.now();
                const timeSinceLastFrame = currentTime - this.lastAnalysisTime;

                if (timeSinceLastFrame < 16.67) { // 60 frames per second
                    return null;
                }

                if (!video.videoWidth || !video.videoHeight) {
                    return { error: 'Video not ready' };
                }

                // Reset metrics if more than 1 second has passed since last analysis
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
                frameDiffData: this.calculateFrameDifference(imageData),
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
         * Calculates the average brightness of the given pixel data.
         * @param {Uint8ClampedArray} data 
         * @returns {number} [0,1].
         */
        calculateAverageBrightness(data) {
            let total = 0;
            const len = data.length;
            const inv255 = 1 / 255;
            for (let i = 0; i < len; i += 4) {
                total += (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) * inv255;
            }
            return total / (len / 4);
        }

        /**
         * Calculates the average red channel intensity from RGBA pixel data.
         * @param {Uint8ClampedArray} data 
         * @returns {number}  [0,1].
         */
        calculateAverageRedIntensity(data) {
            const len = data?.length || 0;
            if (len < 4) return 0;
            let totalRed = 0, i = 0;
            const max = len - (len % 16);
            for (; i < max; i += 16) {
                totalRed += data[i] + data[i+4]  + data[i+8]  + data[i+12];
            }
            for (; i < len; i += 4) {
                totalRed += data[i];
            }
            const numPixels = len >>> 2; 
            if (numPixels === 0) return 0;

            // Normalize
            return totalRed / (numPixels * 255);
        }

        /**
         * Calculates the proportion of bright pixels in a given image frame.
         * @param {ImageData} imageData 
         * @returns {number}  [0,1].
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

         /**
         * Updates the overall risk level based on flash rate, total flash count, and average intensity.
         * Risk levels:
         * - `'high'`: If flash rate > 3, flash count > 30, or intensity > 0.8
         * - `'medium'`: If flash rate > 2, flash count > 15, or intensity > 0.5
         * - `'low'`: Else
         * @returns {{ Level: 'low' | 'medium' | 'high', flashCount: number, flashRate: number, intensity: number}}
         */
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
         * Calculates the color variance for the current video frame and updates the color history
         * @param {ImageData} imageData 
         * @returns {{current: { r: number, g: number, b: number}, temporal: { r: number, g: number, b: number}, spikes: Array<{ frame: number, channel: 'r' | 'g' | 'b', magnitude: number }>, averageChange: { r: number, g: number, b: number}
         * }}
         */
        calculateColorVariance(imageData) {
            if (!imageData || !imageData.data) return { r: 0, g: 0, b: 0 };

            try {
                const pixelCount = imageData.data.length / 4;
                const means = { r: 0, g: 0, b: 0 };
                const sumSquaredDiff = { r: 0, g: 0, b: 0 };

                for (let i = 0; i < imageData.data.length; i += 4) {
                    means.r += imageData.data[i];
                    means.g += imageData.data[i + 1];
                    means.b += imageData.data[i + 2];
                }

                means.r /= pixelCount;
                means.g /= pixelCount;
                means.b /= pixelCount;

                for (let i = 0; i < imageData.data.length; i += 4) {
                    sumSquaredDiff.r += Math.pow(imageData.data[i] - means.r, 2);
                    sumSquaredDiff.g += Math.pow(imageData.data[i + 1] - means.g, 2);
                    sumSquaredDiff.b += Math.pow(imageData.data[i + 2] - means.b, 2);
                }

                const currentVariance = {
                    r: Math.sqrt(sumSquaredDiff.r / pixelCount) / 255,
                    g: Math.sqrt(sumSquaredDiff.g / pixelCount) / 255,
                    b: Math.sqrt(sumSquaredDiff.b / pixelCount) / 255
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
         * - Temporal variance for each RGB channel.
         * - Detected spikes in color changes.
         * - Average frame-to-frame color changes.
         * @returns {{variance: { r: number, g: number, b: number }, spikes: Array<{frame: number, channel: 'r' | 'g' | 'b', magnitude: number}>, averageChange: { r: number, g: number, b: number }
         * }} 
         */
        analyzeColorHistory() {
            const history = this.advancedMetrics.colorHistory;
            if (history.r.length < 2) {
                return { variance: { r: 0, g: 0, b: 0 }, spikes: [], averageChange: { r: 0, g: 0, b: 0 } };
            }

            const temporalVariance = {
                r: this.calculateTemporalVariance(history.r),
                g: this.calculateTemporalVariance(history.g),
                b: this.calculateTemporalVariance(history.b)
            };

            const changes = {
                r: [],
                g: [],
                b: []
            };

            for (let i = 1; i < history.r.length; i++) {
                changes.r.push(Math.abs(history.r[i] - history.r[i - 1]));
                changes.g.push(Math.abs(history.g[i] - history.g[i - 1]));
                changes.b.push(Math.abs(history.b[i] - history.b[i - 1]));
            }

            const spikes = this.detectColorSpikes(changes);
            const averageChange = {
                r: changes.r.reduce((a, b) => a + b, 0) / changes.r.length,
                g: changes.g.reduce((a, b) => a + b, 0) / changes.g.length,
                b: changes.b.reduce((a, b) => a + b, 0) / changes.b.length
            };

            return {
                variance: temporalVariance,
                spikes,
                averageChange
            };
        }

        calculateTemporalVariance(values) {
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
            return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length) / 255;
        }

        /**
         * Detects significant colour spikes in the frame changes.
         * Spike: When a change exceeds both the fixed threshold and two standard deviations above the mean.
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

        calculateTemporalChange(currentBrightness) {
            const changes = this.advancedMetrics.temporalChanges;
            const change = changes.length > 0 ?
                Math.abs(currentBrightness - changes[changes.length - 1].brightness) : 0;

            changes.push({ timestamp: Date.now(), brightness: currentBrightness, change });
            return change;
        }

        estimateFlickerFrequency() {
            const changes = this.advancedMetrics.temporalChanges;
            if (changes.length < 2) return 0;

            const timeDiffs = [];
            for (let i = 1; i < changes.length; i++) {
                if (changes[i].change > this.thresholds.brightnessChange) {
                    timeDiffs.push(changes[i].timestamp - changes[i-1].timestamp);
                }
            }

            if (timeDiffs.length === 0) return 0;
            const avgTimeDiff = timeDiffs.reduce((a, b) => a + b) / timeDiffs.length;
            return 1000 / avgTimeDiff;
        }

        /**
         * Calculates the entropy of the frame based on brightness histogram.
         * @param {ImageData} imageData 
         * @returns {number} 
         */
        calculateFrameEntropy(imageData) {
            const histogram = new Array(256).fill(0);
            for (let i = 0; i < imageData.data.length; i += 4) {
                const brightness = Math.floor(
                    (imageData.data[i] * 0.2126 +
                    imageData.data[i + 1] * 0.7152 +
                    imageData.data[i + 2] * 0.0722)
                );
                histogram[brightness]++;
            }

            let entropy = 0;
            const pixels = imageData.width * imageData.height;
            for (let i = 0; i < 256; i++) {
                if (histogram[i] > 0) {
                    const probability = histogram[i] / pixels;
                    entropy -= probability * Math.log2(probability);
                }
            }

            this.advancedMetrics.frameEntropy.push(entropy);
            return entropy;
        }

        /**
         * Calculates the Photosensitive Seizure Index (PSI), a composite score estimating the risk of photosensitive seizures.
         * @param {number} brightness 
         * @param {number} brightnessDiff 
         * @returns {{score: number, frequency: number, intensity: number, coverage: number, duration: number, brightness: number}}
         */
        calculatePSI(brightness, brightnessDiff) {
            const frequency = this.metrics.flashCount / (this.metrics.frameCount / 60);
            const coverage = this.calculateCoverage(this.context.getImageData(0, 0, this.canvas.width, this.canvas.height));
            const duration = this.metrics.flashSequences.length > 0 ?
                this.metrics.flashSequences[this.metrics.flashSequences.length - 1].frameDuration : 0;

            const psi = {
                frequency: Math.min(frequency / 3, 1),
                intensity: Math.min(brightnessDiff / 0.2, 1),
                coverage: coverage,
                duration: Math.min(duration / 50, 1),
                brightness: Math.min(brightness, 1)
            };

            const score = (
                psi.frequency * 0.3 +
                psi.intensity * 0.25 +
                psi.coverage * 0.2 +
                psi.duration * 0.15 +
                psi.brightness * 0.1
            );

            this.advancedMetrics.psi = { score, components: psi };
            return { score, components: psi };
        }

        /**
         * Computes average brightness in the center region, periphery, and each of the quadrants.
         * @param {ImageData} imageData 
         * @returns {{center: number, periphery: number, quadrants: number[]}} 
         */
        analyzeSpatialDistribution(imageData) {
            const width = this.canvas.width;
            const height = this.canvas.height;
            const centerRadius = Math.min(width, height) * 0.2;
            const data = imageData.data;

            let centerSum = 0;
            let peripherySum = 0;
            const quadrants = [0, 0, 0, 0];
            let centerPixels = 0;
            let peripheryPixels = 0;

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    const brightness = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;

                    const distanceFromCenter = Math.sqrt(
                        Math.pow(x - width/2, 2) + Math.pow(y - height/2, 2)
                    );

                    if (distanceFromCenter < centerRadius) {
                        centerSum += brightness;
                        centerPixels++;
                    } else {
                        peripherySum += brightness;
                        peripheryPixels++;
                    }

                    const quadrantIndex = (x < width/2 ? 0 : 1) + (y < height/2 ? 0 : 2);
                    quadrants[quadrantIndex] += brightness;
                }
            }

            return {
                center: centerPixels > 0 ? centerSum / centerPixels : 0,
                periphery: peripheryPixels > 0 ? peripherySum / peripheryPixels : 0,
                quadrants: quadrants.map(sum => sum / (width * height / 4))
            };
        }

        /**
         * Chromatic flashes in video frame by measuring red-green and blue-yellow color contrasts.
         * @param {ImageData} imageData
         * @returns {{redGreen: number, blueYellow: number}} 
         */
        analyzeChromaticFlashes(imageData) {
            const data = imageData.data;
            const pixels = data.length / 4;
            let redGreen = 0;
            let blueYellow = 0;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i] / 255;
                const g = data[i + 1] / 255;
                const b = data[i + 2] / 255;
                redGreen += Math.abs(r - g);
                blueYellow += Math.abs(b - ((r + g) / 2));
            }

            const result = {
                redGreen: redGreen / pixels,
                blueYellow: blueYellow / pixels
            };

            this.advancedMetrics.chromaticFlashes.lastColors.push(result);
            if (this.advancedMetrics.chromaticFlashes.lastColors.length > 10) {
                this.advancedMetrics.chromaticFlashes.lastColors.shift();
            }

            return result;
        }

        analyzeTemporalContrast(brightness, timestamp) {
            const history = this.advancedMetrics.temporalContrast.history;
            history.push({ brightness, timestamp });

            if (history.length > 10) history.shift();

            let maxRate = 0;
            for (let i = 1; i < history.length; i++) {
                const timeDiff = history[i].timestamp - history[i-1].timestamp;
                if (timeDiff > 0.001) {
                    const rate = Math.abs(history[i].brightness - history[i-1].brightness) / timeDiff;
                    maxRate = Math.max(maxRate, Math.min(rate, 1000));
                }
            }

            this.advancedMetrics.temporalContrast = {
                current: maxRate,
                history: history,
                maxRate: Math.min(Math.max(maxRate, this.advancedMetrics.temporalContrast.maxRate), 1000)
            };

            return {
                currentRate: maxRate,
                maxRate: this.advancedMetrics.temporalContrast.maxRate
            };
        }

        calculateFrameDifference(currentFrame) {
            if (!this.lastFrame) {
                this.lastFrame = currentFrame;
                return { difference: 0, motion: 0 };
            }

            let totalDiff = 0;
            let motionPixels = 0;
            const data1 = currentFrame.data;
            const data2 = this.lastFrame.data;

            for (let i = 0; i < data1.length; i += 4) {
                const diff = Math.abs(data1[i] - data2[i]) +
                           Math.abs(data1[i+1] - data2[i+1]) +
                           Math.abs(data1[i+2] - data2[i+2]);

                totalDiff += diff;
                if (diff > this.advancedMetrics.frameDifference.threshold * 765) {
                    motionPixels++;
                }
            }

            const normalizedDiff = totalDiff / (data1.length * 765);
            const motionRatio = motionPixels / (data1.length / 4);

            this.lastFrame = currentFrame;
            return {
                difference: normalizedDiff,
                motion: motionRatio
            };
        }

            performSpectralAnalysis(brightness) {

                try {

                    this.temporalBuffer.add(brightness);

                    if (this.temporalBuffer.data.length < 32) {
                    return { dominantFrequency: 0, spectrum: [], spectralFlatness: 0 };
                    }

                const signal = [...this.temporalBuffer.data.slice(-64)];
                const windowed = signal.map((x, i) =>
                    x * (0.5 * (1 - Math.cos((2 * Math.PI * i) / (signal.length - 1)))));

                // TASK 2381 Convert typed arrays to complex number objects
                const { re, im } = this.fft.forward(windowed);

                const spectrum = Array.from({ length: re.length }, (_, i) => ({
                    re: re[i],
                    im: im[i]
                }));

                const magnitudes = spectrum.map((bin, i) => ({
                    frequency: (i * 60) / signal.length,
                    amplitude: 2 * Math.sqrt(bin.re * bin.re + bin.im * bin.im) / signal.length
                }));

                const dominantBin = magnitudes
                    .slice(1, Math.floor(magnitudes.length / 2))
                    .reduce((max, curr) => curr.amplitude > max.amplitude ? curr : max, { amplitude: 0 });

                const spectralFlatness = window.AnalyzerHelpers.computeSpectralFlatness(
                    magnitudes.slice(1, Math.floor(magnitudes.length / 2))
                );

                return {
                    dominantFrequency: dominantBin.frequency,
                    spectrum: magnitudes.slice(0, Math.floor(magnitudes.length / 2)),
                    windowSize: signal.length,
                    spectralFlatness: spectralFlatness
                };
            } catch (error) {
                console.error('Spectral analysis error:', error);
                return { dominantFrequency: 0, spectrum: [], windowSize: 0, spectralFlatness: 0 };
            }
        }

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

        detectEdges(imageData) {
            const width = imageData.width;
            const height = imageData.height;
            const data = imageData.data;
            let edgeCount = 0;
            const sobelThreshold = this.advancedMetrics.edgeDetection.threshold;
            const gray = new Float32Array(width * height);
            for (let i = 0; i < data.length; i += 4) {
                gray[i / 4] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            }

            const edge = window.AnalyzerHelpers.sobelEdgeMap(gray, width, height);

            for (let i = 0; i < edge.length; ++i) {
                if (edge[i] > sobelThreshold) {
                    edgeCount++;
                }
            }

            const edgeDensity = edgeCount / ((width - 2) * (height - 2));
            this.advancedMetrics.edgeDetection.history.push(edgeDensity);

            return {
                edgeDensity,
                edgeCount,
                temporalEdgeChange: this.calculateEdgeChange()
            };
        }

        /**
         * Gets the luminance value at a given pixel index.
         * @param {Uint8ClampedArray} data - RGBA pixel data array.
         * @param {number} idx 
         * @returns {number}
         */
        getLuminance(data, idx) {
            if (idx < 0 || idx >= data.length) return 0;
            return data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
        }


        calculateEdgeChange() {
            const history = this.advancedMetrics.edgeDetection.history;
            if (history.length < 2) return 0;
            return Math.abs(history[history.length - 1] - history[history.length - 2]);
        }


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
                    'Scene Change Score'

                ];

                // TASK 2383: Ensure data export is meaningful data from postive timestamped data
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
                    return [
                        Number(entry.timestamp || 0).toFixed(6), // Increased precision to 6 decimal places as TEST returned rows with same timestamp
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
                        Number(entry.sceneChangeScore || 0).toFixed(4)
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
                    // TASK 2384: Ensure data export is meaningful data from postive timestamped data
                    analysis: [...this.dataChunks.flat(), ...this.currentChunk]
                        .filter(entry => entry.timestamp >= 0)
                        .sort((a, b) => a.timestamp - b.timestamp)
                        .map(entry => ({
                            timestamp: Number(entry.timestamp || 0).toFixed(6),
                            brightness: Number(entry.brightness || 0).toFixed(4),
                            isFlash: entry.isFlash,
                            intensity: Number(entry.intensity || 0).toFixed(4),
                            colorVariance: {
                                current: {
                                    r: Number(entry.dominantColor?.r || 0).toFixed(1),
                                    g: Number(entry.dominantColor?.g || 0).toFixed(1),
                                    b: Number(entry.dominantColor?.b || 0).toFixed(1)
                                },
                                temporal: {
                                    r: Number(entry.dominantLab?.L || 0).toFixed(2),
                                    a: Number(entry.dominantLab?.a || 0).toFixed(2),
                                    b: Number(entry.dominantLab?.b || 0).toFixed(2)
                                },
                                averageChange: {
                                    r: Number(entry.colorVariance?.averageChange?.r || 0).toFixed(4),
                                    g: Number(entry.colorVariance?.averageChange?.g || 0).toFixed(4),
                                    b: Number(entry.colorVariance?.averageChange?.b || 0).toFixed(4)
                                },
                                spikes: entry.colorVariance?.spikes || []
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
                        })),
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

        /**
         * Resets the analyzer state, clearing all metrics and buffers.
         */
        reset() {
            this.startTime = null;
            this.metrics = {
                flashCount: 0,
                riskLevel: 'low',
                timeline: [],
                lastFrameBrightness: 0,
                frameCount: 0,
                flashSequences: [],
                lastTimestamp: 0
            };
            this.timelineData = [];
            this.lastAnalysisTime = 0;
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
            this.temporalBuffer.clear();
            this.dataChunks = [];
            this.currentChunk = [];
            this.totalFrames = 0;
            this.analysisStartTime = null;
            this.lastExportTime = 0;
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

            // Store data in chunks
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

        /**
         * Performs a FFT on the input signal using the helper.
         * @param {number[]} signal
         * @returns {{re: Float64Array, im: Float64Array}}
         */
        performFFT(signal) {
            return window.AnalyzerHelpers.performFFT(signal);
        }

    }

    window.VideoAnalyzer = VideoAnalyzer;
}