"use strict";

if (!window.VideoAnalyzer) {
    /**
     * @class VideoAnalyzer
     * @classdesc Video analysis utility for detecting visual risks such as flash, flickering and chromatic anomalies. It computes metrics including brightness, colour variance, entropy and temporal coherence to assess visual risk levels. Uses helper functions
     * from the /helpers and the legacy analyzer-helpers.js.
     */
    class VideoAnalyzer {
        constructor({
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
                console.log('imageData', imageData);
                const redIntensity = this.calculateAverageRedIntensity(imageData.data);
                console.log('redIntensity', redIntensity);
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

        calculateAverageBrightness(data) {
            return window.AnalyzerHelpers.avgBrightness(data);
        }

        calculateAverageRedIntensity(data) {
            return window.AnalyzerHelpers.avgRedIntensity(data);
        }

        calculateCoverage(imageData, brightnessThreshold = 0.5) {
            return window.AnalyzerHelpers.coverage(imageData, brightnessThreshold);
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
            return window.AnalyzerHelpers.avgIntensity.call(this);
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
            return window.AnalyzerHelpers.calculateColorVariance(imageData);
        }

        analyzeColorHistory() {
            return window.AnalyzerHelpers.colorHistory.call(this);
        }

        calculateTemporalVariance(values) {
            return window.AnalyzerHelpers.temporalVariance(values);
        }

        detectColorSpikes(changes, fixedThreshold = 0.2, stdDevMultiplier = 2) {
            return window.AnalyzerHelpers.colorSpikes(changes, fixedThreshold, stdDevMultiplier);
        }

        calculateTemporalChange(currentBrightness, maxHistory = 1000) {
            return window.AnalyzerHelpers.temporalChange.call(this, currentBrightness, maxHistory);
        }

        estimateFlickerFrequency() {
            return window.AnalyzerHelpers.estFlickerFrequency.call(this);
        }

        calculateFrameEntropy(imageData, maxHistory = 1000) {
            return window.AnalyzerHelpers.frameEntropy.call(this, imageData, maxHistory);
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
            return window.AnalyzerHelpers.spatialDistribution(imageData);
        }

        analyzeChromaticFlashes(imageData, historyLen = 10) {
            return window.AnalyzerHelpers.chromaticFlashes.call(this, imageData, historyLen);
        }

        analyzeTemporalContrast(brightness, timestamp, bufferLen = 15) {
            return window.AnalyzerHelpers.temporalContrast.call(this, brightness, timestamp, bufferLen);
        }

        performSpectralAnalysis(brightness, bufferLen = 128, fftLen = 64, fps = 60) {
            return window.AnalyzerHelpers.spectralAnalysis.call(this, brightness, bufferLen, fftLen, fps);
        }

        detectPeriodicity(signal, minLag = 2, threshold = 0.5) {
            return window.AnalyzerHelpers.periodicity(signal, minLag, threshold);
        }

        calculateTemporalCoherence(brightness, windowSize = 30, maxLag = 10) {
            return window.AnalyzerHelpers.temporalCoherence.call(this, brightness, windowSize, maxLag);
        }

        detectEdges(imageData, sobelThreshold = 50, maxHistory = 500) {
            return window.AnalyzerHelpers.detectEdges.call(this, imageData, sobelThreshold, maxHistory);
        }


        getLuminance(data, idx, weights = [0.2126, 0.7152, 0.0722]) {
            return window.AnalyzerHelpers.luminance(data, idx, weights);
        }

        calculateEdgeChange(window = 2) {
            return window.AnalyzerHelpers.edgeChange.call(this, window);
        }

        generateCSV() {
            return window.AnalyzerHelpers.generateCSV.call(this);
        }

        generateReport() {
            return window.AnalyzerHelpers.generateReport.call(this);
        }

        generateRecommendations() {
            return window.AnalyzerHelpers.generateRecommendations.call(this);
        }

        generateJSON() {
            return window.AnalyzerHelpers.generateJSON.call(this);
        }

        generateNDJSON() {
            return window.AnalyzerHelpers.generateNDJSON.call(this);
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