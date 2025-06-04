"use strict";

if (!window.VideoAnalyzer) {
    /**
     * @class VideoAnalyzer
     * @classdesc Video analysis utility for detecting visual risks such as flash, flickering and chromatic anomalies. It computes metrics including brightness, colour variance, entropy and temporal coherence to assess visual risk levels.
     */
    class VideoAnalyzer {
    /**
     * Constructs a new VideoAnalyzer instance.
     * Initializes metrics, thresholds, analysis buffers, and metrics for video frame analysis.
     *
     * @constructor
     * @property {Object} metrics - Stores flash count, risk level, timeline, and frame statistics.
     * @property {Object} thresholds - Thresholds for brightness change, flash detection, and sequence length.
     * @property {HTMLCanvasElement} canvas - Offscreen canvas for frame processing.
     * @property {CanvasRenderingContext2D} context - 2D context for the canvas.
     * @property {number} sampleSize - Downsampling factor for performance.
     * @property {Array} timelineData - Stores timeline entries for analyzed frames.
     * @property {Array} detailedData - Stores detailed analysis per frame.
     * @property {number} lastAnalysisTime - Timestamp of the last frame analysis.
     * @property {number} minAnalysisInterval - Minimum interval between analyses (ms).
     * @property {Object} advancedMetrics - Stores analysis data (color variance, entropy, etc).
     * @property {Object} fft - Fast Fourier Transform implementation for spectral analysis.
     * @property {Object} temporalBuffer - Circular buffer for temporal data (brightness history).
     * @property {number|null} startTime - Start time of the analysis session.
     * @property {Array} dataChunks - Stores chunks of analyzed frame data.
     * @property {Array} currentChunk - Current chunk of frame data.
     * @property {number} chunkSize - Number of frames per chunk.
     * @property {number} totalFrames - Total frames analyzed.
     * @property {number|null} analysisStartTime - Timestamp when analysis started.
     * @property {number} lastExportTime - Timestamp of last data export.
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
            this.sampleSize = 4; // Reduce resolution for better performance
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
                historyLength: 30, // Store last 30 frames for temporal analysis
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
            this.fft = {
                forward: (signal) => {
                    const n = signal.length;
                    if (n <= 1) return signal;

                    const spectrum = Array(n).fill().map(() => ({ re: 0, im: 0 }));

                    for (let k = 0; k < n; k++) {
                        for (let t = 0; t < n; t++) {
                            const angle = -2 * Math.PI * k * t / n;
                            spectrum[k].re += signal[t] * Math.cos(angle);
                            spectrum[k].im += signal[t] * Math.sin(angle);
                        }
                    }

                    return spectrum;
                }
            };

            // Add circular buffer for temporal data
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
            this.chunkSize = 1000; // Store 1000 frames per chunk
            this.totalFrames = 0;
            this.analysisStartTime = null;
            this.lastExportTime = 0;
        }


        /**
         * Updates the analysis thresholds based on brightness change, flash detection, and sequence length.
         * @param {Object} thresholds - Threshold values to update.
         * @param {number} thresholds.intensity - Brightness change threshold for flash detection.
         * @param {number} thresholds.flashesPerSecond - Maximum allowed flashes per second.
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

        /**
         * Sets or updates analysis options for the analyzer.
         * @param {object} options - Analysis  options to set.
         */
        setAnalysisOptions(options) {
            this.analysisOptions = { ...this.analysisOptions, ...options };
        }

        /**
         * Analyses a video frame at a given timestamp, handles frame rate limiting, resets metrics and processes the frame.
         * @param {HTMLVideoElement} video - The video element to analyse.
         * @param {number} timestamp - The current timestamp of the video in miliseconds.
         * @returns {Object|null} - Returns analysis results or null if frame rate limit is exceeded.
         */
        analyzeFrame(video, timestamp) {
            try {
                // Initialize start time if not set
                if (this.analysisStartTime === null) {
                    this.analysisStartTime = timestamp;
                    this.lastExportTime = timestamp;
                }

                // Calculate relative timestamp from start
                const relativeTime = timestamp - this.analysisStartTime;

                // Add frame rate limiting
                const currentTime = performance.now();
                const timeSinceLastFrame = currentTime - this.lastAnalysisTime;

                if (timeSinceLastFrame < 16.67) { // Limit to ~60fps
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
                const results = this.processFrame(imageData, timestamp, relativeTime);

                this.lastAnalysisTime = timestamp;
                return results;
            } catch (error) {
                console.error('Analysis error:', error);
                return { error: error.message };
            }
        }

        /**
         * Process the captured frame image data and computes all relevant metrics. Updates flash metrics, risk level and storage.
         * @param {ImageData} imageData - The image data of the current frame.
         * @param {number} timestamp - The current timestamp of the video in milliseconds.
         * @param {number} relativeTime - Time since analysis started in seconds
         * @returns {Object} - Returns results object containing all computed metrics.
         */
        processFrame(imageData, timestamp, relativeTime) {
            const brightness = this.calculateAverageBrightness(imageData.data);
            const brightnessDiff = Math.abs(brightness - this.metrics.lastFrameBrightness);
            const isFlash = brightnessDiff > this.thresholds.brightnessChange;

            // Process metrics 
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
                edgeData: this.detectEdges(imageData)
            };

            // Update flash metrics
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

            // Create timeline entry
            const timelineEntry = this.createTimelineEntry(relativeTime, timestamp, brightness, isFlash, brightnessDiff, metrics);

            // Update storage if detection of meaningful change present
            if (isFlash || brightnessDiff > 0.001 || metrics.temporalChange > 0.001) {
                this.updateStorage(timelineEntry);
            }

            return this.createResults(timelineEntry);
        }

        /**
         * Captures the current video frame and returns its ImageData.
         * @param {HTMLVideoElement} video - The video element to capture from
         * @returns {ImageData|null} The captured frame's ImageData, or null on error.
         */
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
         * @param {Uint8ClampedArray} data - RGBA pixel data array.
         * @returns {number} Average brightness value [0,1].
         */
        calculateAverageBrightness(data) {
            let totalBrightness = 0;
            for (let i = 0; i < data.length; i += 4) {
                totalBrightness += (
                    data[i] * 0.2126 +     // Red
                    data[i + 1] * 0.7152 + // Green
                    data[i + 2] * 0.0722   // Blue
                ) / 255;
            }
            return totalBrightness / (data.length / 4);
        }

        /**
         * Calculates the proportion of bright pixels in the frame.
         * @param {ImageData} imageData - The frame ImageData.
         * @returns {number} Ratio of bright pixels [0,1].
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

        // TASK-7672
        // Colour analysis logic see notes TASK-7672

        /**
         * Returns a detailed analysis summary of the current session.
         * @returns {Object} Detailed analysis including frame rate, flash sequences, average intensity, and risk factors.
         */
        getDetailedAnalysis() {
            return {
                frameRate: this.metrics.frameCount / (this.metrics.lastTimestamp || 1),
                flashSequences: this.metrics.flashSequences,
                averageIntensity: this.calculateAverageIntensity(),
                riskFactors: this.analyzeRiskFactors()
            };
        }

        /**
         * Returns the timeline data of analyzed frames.
         * @returns {Array} Timeline data array.
         */
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

            // Risk assessment
            if (flashRate > 3 || this.metrics.flashCount > 30 || intensity > 0.8) {
                this.metrics.riskLevel = 'high';
            } else if (flashRate > 2 || this.metrics.flashCount > 15 || intensity > 0.5) {
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

        calculateColorVariance(imageData) {
            if (!imageData || !imageData.data) return { r: 0, g: 0, b: 0 };

            try {
                // Single frame variance calculation
                const pixelCount = imageData.data.length / 4;
                const means = { r: 0, g: 0, b: 0 };
                const sumSquaredDiff = { r: 0, g: 0, b: 0 };

                // First pass: calculate means
                for (let i = 0; i < imageData.data.length; i += 4) {
                    means.r += imageData.data[i];
                    means.g += imageData.data[i + 1];
                    means.b += imageData.data[i + 2];
                }

                means.r /= pixelCount;
                means.g /= pixelCount;
                means.b /= pixelCount;

                // Second pass: calculate sum of squared differences
                for (let i = 0; i < imageData.data.length; i += 4) {
                    sumSquaredDiff.r += Math.pow(imageData.data[i] - means.r, 2);
                    sumSquaredDiff.g += Math.pow(imageData.data[i + 1] - means.g, 2);
                    sumSquaredDiff.b += Math.pow(imageData.data[i + 2] - means.b, 2);
                }

                // Calculate current frame variance
                const currentVariance = {
                    r: Math.sqrt(sumSquaredDiff.r / pixelCount) / 255,
                    g: Math.sqrt(sumSquaredDiff.g / pixelCount) / 255,
                    b: Math.sqrt(sumSquaredDiff.b / pixelCount) / 255
                };

                // Updates color history
                this.advancedMetrics.colorHistory.r.push(means.r);
                this.advancedMetrics.colorHistory.g.push(means.g);
                this.advancedMetrics.colorHistory.b.push(means.b);

                // Fixed length history
                if (this.advancedMetrics.colorHistory.r.length > this.advancedMetrics.historyLength) {
                    this.advancedMetrics.colorHistory.r.shift();
                    this.advancedMetrics.colorHistory.g.shift();
                    this.advancedMetrics.colorHistory.b.shift();
                }

                // Calculate temporal variance and detect spikes
                const temporalAnalysis = this.analyzeColorHistory();

                // Combine current frame and temporal analysis
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

        analyzeColorHistory() {
            const history = this.advancedMetrics.colorHistory;
            if (history.r.length < 2) {
                return { variance: { r: 0, g: 0, b: 0 }, spikes: [], averageChange: { r: 0, g: 0, b: 0 } };
            }

            // Calculate temporal variance
            const temporalVariance = {
                r: this.calculateTemporalVariance(history.r),
                g: this.calculateTemporalVariance(history.g),
                b: this.calculateTemporalVariance(history.b)
            };

            // Calculate frame-to-frame changes
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

            // Detect spikes 
            const spikes = this.detectColorSpikes(changes);

            // Calculate average change
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

        detectColorSpikes(changes) {
            const threshold = 0.2; 
            const spikes = [];

            ['r', 'g', 'b'].forEach(channel => {
                const meanChange = changes[channel].reduce((a, b) => a + b, 0) / changes[channel].length;
                const stdDev = Math.sqrt(
                    changes[channel].reduce((a, b) => a + Math.pow(b - meanChange, 2), 0) / changes[channel].length
                );

                const spikeThreshold = meanChange + (stdDev * 2); // 2 standard deviations

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
            return 1000 / avgTimeDiff; // Convert to Hz
        }

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

                    // Quadrant analysis
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

        analyzeChromaticFlashes(imageData) {
            const data = imageData.data;
            const pixels = data.length / 4;
            let redGreen = 0;
            let blueYellow = 0;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i] / 255;
                const g = data[i + 1] / 255;
                const b = data[i + 2] / 255;

                // Red-Green contrast
                redGreen += Math.abs(r - g);
                // Blue-Yellow contrast
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
                const rate = Math.abs(history[i].brightness - history[i-1].brightness) /
                            (history[i].timestamp - history[i-1].timestamp);
                maxRate = Math.max(maxRate, rate);
            }

            this.advancedMetrics.temporalContrast = {
                current: maxRate,
                history: history,
                maxRate: Math.max(maxRate, this.advancedMetrics.temporalContrast.maxRate)
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
                // Update temporal buffer
                this.temporalBuffer.add(brightness);

                if (this.temporalBuffer.data.length < 32) {
                    return { dominantFrequency: 0, spectrum: [] };
                }

                // Use last 64 samples for FFT
                const signal = [...this.temporalBuffer.data.slice(-64)];
                const spectrum = this.fft.forward(signal);

                // Calculate magnitude spectrum
                const magnitudes = spectrum.map((bin, i) => ({
                    frequency: (i * 60) / 64, // Bin index to Hz
                    amplitude: Math.sqrt(bin.re * bin.re + bin.im * bin.im)
                }));

                // Find dominant frequency (exclude DC component)
                const dominantBin = magnitudes
                    .slice(1, Math.floor(magnitudes.length / 2))
                    .reduce((max, curr) => curr.amplitude > max.amplitude ? curr : max, { amplitude: 0 });

                return {
                    dominantFrequency: dominantBin.frequency,
                    spectrum: magnitudes.slice(0, 32)
                };
            } catch (error) {
                console.error('Spectral analysis error:', error);
                return { dominantFrequency: 0, spectrum: [] };
            }
        }

        detectPeriodicity(signal) {
            if (signal.length < 4) return { isPeriodic: false, period: 0 };

            const autocorr = [];
            const mean = signal.reduce((a, b) => a + b) / signal.length;
            const normalizedSignal = signal.map(x => x - mean);

            // Calculate autocorrelation for different lags
            for (let lag = 0; lag < Math.floor(signal.length / 2); lag++) {
                let sum = 0;
                for (let i = 0; i < signal.length - lag; i++) {
                    sum += normalizedSignal[i] * normalizedSignal[i + lag];
                }
                autocorr[lag] = sum / (signal.length - lag);
            }

            // Find peaks in autocorrelation
            const peaks = [];
            for (let i = 1; i < autocorr.length - 1; i++) {
                if (autocorr[i] > autocorr[i - 1] && autocorr[i] > autocorr[i + 1]) {
                    peaks.push({
                        lag: i,
                        value: autocorr[i]
                    });
                }
            }

            // Sort peaks by correlation value
            peaks.sort((a, b) => b.value - a.value);

            // Check if signal is periodic
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

            // Calculate autocorrelation
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

            // Sobel operators
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;

                    // Calculate Sobel gradients
                    const gx = this.sobelGradientX(data, idx, width);
                    const gy = this.sobelGradientY(data, idx, width);

                    // Calculate gradient magnitude
                    const magnitude = Math.sqrt(gx * gx + gy * gy);

                    if (magnitude > sobelThreshold) {
                        edgeCount++;
                    }
                }
            }

            const edgeDensity = edgeCount / (width * height);
            this.advancedMetrics.edgeDetection.history.push(edgeDensity);

            return {
                edgeDensity,
                edgeCount,
                temporalEdgeChange: this.calculateEdgeChange()
            };
        }

        sobelGradientX(data, idx, width) {
            const topLeft = this.getLuminance(data, idx - width * 4 - 4);
            const topRight = this.getLuminance(data, idx - width * 4 + 4);
            const middleLeft = this.getLuminance(data, idx - 4);
            const middleRight = this.getLuminance(data, idx + 4);
            const bottomLeft = this.getLuminance(data, idx + width * 4 - 4);
            const bottomRight = this.getLuminance(data, idx + width * 4 + 4);

            return topRight + 2 * middleRight + bottomRight -
                   (topLeft + 2 * middleLeft + bottomLeft);
        }

        sobelGradientY(data, idx, width) {
            const topLeft = this.getLuminance(data, idx - width * 4 - 4);
            const topMiddle = this.getLuminance(data, idx - width * 4);
            const topRight = this.getLuminance(data, idx - width * 4 + 4);
            const bottomLeft = this.getLuminance(data, idx + width * 4 - 4);
            const bottomMiddle = this.getLuminance(data, idx + width * 4);
            const bottomRight = this.getLuminance(data, idx + width * 4 + 4);

            return bottomLeft + 2 * bottomMiddle + bottomRight -
                   (topLeft + 2 * topMiddle + topRight);
        }

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
                    'Temporal Coherence',
                    'Edge Density',
                    'Edge Count',
                    'Edge Change Rate'
                ];

                const allData = [...this.dataChunks.flat(), ...this.currentChunk];

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
                        Number(entry.temporalCoherence?.coherenceScore || 0).toFixed(4),
                        Number(entry.edgeDetection?.edgeDensity || 0).toFixed(4),
                        Number(entry.edgeDetection?.edgeCount || 0),
                        Number(entry.edgeDetection?.temporalEdgeChange || 0).toFixed(4)
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
                videoTitle: document.title,
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
                        videoTitle: document.title,
                        analysisDate: new Date().toISOString(),
                        totalFramesAnalyzed: this.metrics.frameCount,
                        totalFlashesDetected: this.metrics.flashCount,
                        riskLevel: this.metrics.riskLevel
                    },
                    analysis: this.timelineData.map(entry => ({
                        timestamp: Number(entry.timestamp || 0).toFixed(6), // Increased precision to 6 decimal places
                        brightness: Number(entry.brightness || 0).toFixed(4),
                        isFlash: entry.isFlash,
                        intensity: Number(entry.intensity || 0).toFixed(4),
                        colorVariance: {
                            current: {
                                r: Number(entry.colorVariance?.current?.r || 0).toFixed(4),
                                g: Number(entry.colorVariance?.current?.g || 0).toFixed(4),
                                b: Number(entry.colorVariance?.current?.b || 0).toFixed(4)
                            },
                            temporal: {
                                r: Number(entry.colorVariance?.temporal?.r || 0).toFixed(4),
                                g: Number(entry.colorVariance?.temporal?.g || 0).toFixed(4),
                                b: Number(entry.colorVariance?.temporal?.b || 0).toFixed(4)
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
                            spectrum: entry.spectralAnalysis?.spectrum || []
                        },
                        temporalCoherence: {
                            score: Number(entry.temporalCoherence?.coherenceScore || 0).toFixed(4),
                            periodicity: entry.temporalCoherence?.periodicity
                        },
                        edgeDetection: {
                            density: Number(entry.edgeDetection?.edgeDensity || 0).toFixed(4),
                            count: entry.edgeDetection?.edgeCount,
                            change: Number(entry.edgeDetection?.temporalEdgeChange || 0).toFixed(4)
                        }
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

        reset() {
            this.startTime = null;  // Add this line
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

        createTimelineEntry(relativeTime, timestamp, brightness, isFlash, brightnessDiff, metrics) {
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
                edgeDetection: metrics.edgeData
            };

            // Store data in chunks
            this.currentChunk.push(entry);
            this.totalFrames++;

            if (this.currentChunk.length >= this.chunkSize) {
                this.dataChunks.push(this.currentChunk);
                this.currentChunk = [];
            }

            return entry;
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

        updateStorage(timelineEntry) {
            this.timelineData.push(timelineEntry);

            // Keep timeline data size manageable
            if (this.timelineData.length > 300) {
                this.timelineData.shift();
            }
        }
    }

    // Make VideoAnalyzer globally available only if it doesn't exist
    window.VideoAnalyzer = VideoAnalyzer;
}
