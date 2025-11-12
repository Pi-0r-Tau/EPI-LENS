"use strict";

if (!window.VideoAnalyzer) {
    const canvasPool = new window.CanvasPool();
    /**
     * @description EPI LENS orchestrator analysis engine:
     * Metrics are accessed via window.AnalyzerHelpers. to ensure modularity, quick debugging and maintainability.
     * Analyses YouTube and user videos (locally) in real time, so all data is not trusted. Think dropped frames, corrupted frames etc.
     * YouTube videos are analyzed as fast as the engine can, so for this quick and dirty analysis it is a screening analysis
     * User videos are analyzed (locally) with fileanalyzer.js provding rigid analysis intervals, tunable from 2 fps to 100 fps.
     * Both YouTube and user videos can be visualised via the charting tools, and exported to CSV, JSON, or NDJSON, or imported as JSON or NDJSON.
     * @requires helpers/Avg/*
     * @requires helpers/Color/*
     * @requires helpers/Spectral/*
     * @requires helpers/Temporal/*
     * @requires helpers/Spatial/*
     * @requires helpers/Export/*
     * @requires helpers/Risk/*
     * @requires helpers/Motion/*
     *
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
                lastFrameBrightness: null,
                frameCount: 0,
                flashSequences: [],
                lastTimestamp: 0
            };
            this.lastRedIntensity = null;
            this.lastDominantLab = null;
            this.lastFrame = null;
            this.thresholds = {
                brightnessChange: 0.1,
                flashThreshold: 0.1,
                minSequenceLength: 3
            };
            this.canvas = null; // Obtained via canvaspool.js
            this.context = null;
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
                    },
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
                },
            };

            // FFT implementation
            this.fft = {
                forward: (signal) => this.performFFT(signal),
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
                },
            };

            this.startTime = null;
            this.dataChunks = [];
            this.currentChunk = [];
            this.chunkSize = 1000;
            this.totalFrames = 0;
            this.analysisStartTime = null;
            this.lastExportTime = 0;
            this.patternHistory = [];
            this.sceneChangeHistory = [];
            this._frameDiffHistory = new Float32Array(8);
            this._frameDiffIdx = 0;
            this.redMetricsEnabled = false; // Default disabled
            this.temporalContrastEnabled = false; // Default disabled
            this.isFileAnalyzer = false;
            this.temporalContrastSeries = [];
            this.temporalContrastResults = [];
        }

        updateThresholds(thresholds) {
            this.thresholds = {
                brightnessChange: thresholds.intensity,
                flashThreshold: thresholds.intensity,
                flashesPerSecond: thresholds.flashesPerSecond,
                minSequenceLength: 3,
                psi: {
                    critical: 0.8,
                    warning: 0.5,
                },
                chromaticContrast: 0.4,
            };
        }
        // TASK 8902: Wiring in of TASK 8901.xx
        // TASK 8902.1: Validates that threshold is a number, its greater than zero and not greater than 2.0
        // If any check fails, skip method.
        setClusterGapThreshold(threshold) {
            if (typeof threshold === 'number' && threshold > 0 && threshold <= 2.0) {
                this.savedClusterGapThreshold = threshold;
                if (window.AnalyzerHelpers && window.AnalyzerHelpers.flashViolations) {
                    window.AnalyzerHelpers.flashViolations.clusterGapThreshold = threshold;
                }
            }
        }

        analyzeFrame(video, timestamp) {
            const FRAME_INTERVAL_MS = 1000 / 60;
            const MAX_INACTIVITY_MS = 1000;

            try {
                if (!video || !video.videoWidth || !video.videoHeight) {
                    return { error: "Video not ready" };
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

                // Capture frame and compute color metrics
                const imageData = this.captureFrame(video);
                // DEBUG
                // console.log('imageData', imageData);
                const redIntensity = this.calculateAverageRedIntensity(imageData.data);
                // DEBUG
                // console.log('redIntensity', redIntensity);
                const prevRedIntensity =
                    typeof this.lastRedIntensity === "number" &&
                        isFinite(this.lastRedIntensity)
                        ? this.lastRedIntensity
                        : null;
                let redDelta = 0;
                if (prevRedIntensity !== null) {
                    redDelta = Math.abs(redIntensity - prevRedIntensity);
                }
                this.lastRedIntensity = redIntensity;
                this.prevRedIntensity = prevRedIntensity;
                this.metrics.lastTimestamp = timestamp;
                const results = this.processFrame(
                    imageData,
                    timestamp,
                    relativeTime,
                    redIntensity,
                    redDelta
                );

                return results;
            } catch (error) {
                console.error("Analysis error:", error);
                return { error: error.message || "Unknown analysis error" };
            }
        }

        processFrame(
            imageData,
            timestamp,
            relativeTime,
            redIntensity = 0,
            redDelta = 0
        ) {
            // TASK 7982: First frame set lastFrameBrightness to 0 from null, avoiding the false positive flash at frame 1
            const brightness = this.calculateAverageBrightness(imageData.data);
            let brightnessDiff = 0;
            let isFlash = false;

            if (this.metrics.lastFrameBrightness !== null) {
                brightnessDiff = Math.abs(
                    brightness - this.metrics.lastFrameBrightness
                );
                isFlash = brightnessDiff > this.thresholds.brightnessChange;
            } else {
                this.metrics.lastFrameBrightness = brightness;
                brightnessDiff = 0;
                isFlash = false;

            }
            // TASK 8902.2
            if (window.AnalyzerHelpers && window.AnalyzerHelpers.updateFlashViolation) {
                this.currentViolationState = window.AnalyzerHelpers.updateFlashViolation.call(
                    this,
                    relativeTime,
                    isFlash,
                    this.metrics.frameCount
                );
            }

            const dominantColor =
                window.AnalyzerHelpers.calculateDominantColor(imageData);
            const dominantLab = window.AnalyzerHelpers.rgbToLab(
                dominantColor.r,
                dominantColor.g,
                dominantColor.b
            );

            let cie76Delta = 0;
            // TASK 7982
            if (this.lastDominantLab !== null) {
                cie76Delta = window.AnalyzerHelpers.cie76(
                    dominantLab,
                    this.lastDominantLab
                );
            }
            this.lastDominantLab = dominantLab;

            const patternedStimulusScore = this.detectPatternedStimulus(imageData);

            let sceneChangeScore = 0;
            if (this.lastFrame && imageData) {
                sceneChangeScore = window.AnalyzerHelpers.frameHistogramDiff(
                    imageData.data,
                    this.lastFrame.data
                );
            }
            this.sceneChangeHistory.push(sceneChangeScore);

            // Calculate red metrics for current frame only if enabled and in fileanalyzer.js/html
            let redMetrics = null;
            // TASK 4128 Per frame red metric for red state and transition wiring
            let redState = 0;
            let redTransition = 0;

            if (this.redMetricsEnabled && this.isFileAnalyzer) {
                try {
                    const redAreaFraction = this.getRedAreaFraction(
                        { color: dominantColor },
                        dominantLab
                    );
                    if (!this.redSeries) {
                        this.redSeries = [];
                        this.redAreaFractions = [];
                    }
                    this.redSeries.push({
                        timestamp: timestamp,
                        color: dominantColor,
                        redAreaFraction: redAreaFraction
                    });
                    this.redAreaFractions.push(redAreaFraction);
                    const maxFrames = 30;
                    if (this.redSeries.length > maxFrames) {
                        this.redSeries.shift();
                        this.redAreaFractions.shift();
                    }

                    // TASK 4128
                    const perFrameStates = this.computePerFrameRedStates(
                        this.redAreaFractions,
                        0.25 // WCAG 2.1 red area threshold
                    );

                    // Get current frames state 
                    const currentIdx = this.redAreaFractions.length - 1;
                    redState = perFrameStates.redStates[currentIdx];
                    redTransition = perFrameStates.redTransitions[currentIdx];

                    // If data is enough compute red window metrics
                    if (this.redSeries.length >= 5) {
                        // At least 5 frames needed
                        const timestamps = this.redSeries.map((s) => s.timestamp);
                        redMetrics = this.computeRedWindowMetrics(
                            0,
                            this.redSeries.length - 1,
                            timestamps,
                            this.redAreaFractions,
                            0.25 // WCAG 2.1 red area threshold
                        );
                    } else {
                        // Lack of data, push default values
                        redMetrics = {
                            redAreaAvg: redAreaFraction,
                            redAreaMax: redAreaFraction,
                            redOnFraction: redAreaFraction >= 0.25 ? 1 : 0,
                            redTransitions: 0,
                            redFlashEvents: 0,
                            redFlashPerSecond: 0,
                            redFlickerInRiskBand: false,
                            redAreaThresholdUsed: 0.25,
                            windowDurationMs: 0,
                            windowSampleCount: this.redSeries.length // debug
                        };
                    }
                } catch (error) {
                    console.warn('Red metrics calculation error:', error);
                    redMetrics = null;
                    redState = 0;
                    redTransition = 0;
                }
            }
            this.temporalContrastSeries.push({
                timestamp: timestamp,
                color: dominantColor
            });

            // Keep recent frames for temporal analysis (last 2 seconds) or 120 fps
            const maxFrames = 120;
            if (this.temporalContrastSeries.length > maxFrames) {
                this.temporalContrastSeries.shift();
            }

            // Temporal contrast sensitivity if enabled and data is enough
            let temporalContrastSensitivity = null;
            if (
                this.temporalContrastEnabled &&
                this.isFileAnalyzer &&
                this.temporalContrastSeries.length >= 10
            ) {
                const analysisInterval = this.analysisInterval || 1 / 30; // Default of 30fps
                const effectiveFPS = 1 / analysisInterval;
                const windowSizeMs = Math.max(1000, analysisInterval * 1000 * 10);
                const adaptiveHalfLife = Math.min(500, windowSizeMs / 3);

                this.temporalContrastResults =
                    window.AnalyzerHelpers.analyzeTemporalContrastSensitivity.call(
                        this,
                        this.temporalContrastSeries,
                        windowSizeMs,
                        {
                            threshold: 2.3,
                            useWeighting: true,
                            weightDecay: 0.1,
                            halfLifeMs: adaptiveHalfLife,
                            computePercentiles: true,
                            analysisInterval: analysisInterval,
                            effectiveFPS: effectiveFPS
                        }
                    );
                if (this.temporalContrastResults.length > 0) {
                    temporalContrastSensitivity =
                        this.temporalContrastResults[
                        this.temporalContrastResults.length - 1
                        ];
                }
            }

            const metrics = {
                colorVariance: this.calculateColorVariance(imageData),
                temporalChange: this.calculateTemporalChange(brightness),
                flickerFrequency: this.estimateFlickerFrequency(),
                entropy: this.calculateFrameEntropy(imageData),
                psi: this.calculatePSI(brightness, brightnessDiff),
                spatialData: this.analyzeSpatialDistribution(imageData),
                chromaticData: this.analyzeChromaticFlashes(imageData),
                temporalContrastData: this.analyzeTemporalContrast(
                    brightness,
                    timestamp
                ),
                frameDiffData: window.AnalyzerHelpers.calculateFrameDifference.call(
                    this,
                    imageData
                ),
                spectralData: this.performSpectralAnalysis(brightness),
                coherenceData: this.calculateTemporalCoherence(brightness),
                edgeData: this.detectEdges(imageData),
                dominantColor: dominantColor,
                dominantLab: dominantLab,
                cie76Delta: cie76Delta,
                patternedStimulusScore: patternedStimulusScore,
                sceneChangeScore: sceneChangeScore,
                contrastSensitivity: this.analyzeContrastSensitivity(imageData, {
                    threshold: 2.3,
                    useWeighting: true,
                    weightDecay: 0.1,
                }),
                redMetrics: redMetrics,
                redState: redState,
                redTransition: redTransition,
                temporalContrastSensitivity: temporalContrastSensitivity
            };

            if (
                this.metrics.lastFrameBrightness !== null &&
                isFlash &&
                brightnessDiff > this.thresholds.flashThreshold
            ) {
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
                relativeTime,
                timestamp,
                brightness,
                isFlash,
                brightnessDiff,
                metrics,
                redIntensity,
                redDelta
            );

            if (isFlash || brightnessDiff > 0.001 || metrics.temporalChange > 0.001) {
                this.updateStorage(timelineEntry);
            }
            this.lastFrame = imageData;
            return this.createResults(timelineEntry);
        }

        captureFrame(video) {
            if (!video.videoWidth || !video.videoHeight) {
                throw new Error('Invalid video dimensions');
            }

            // Calc canvas dimensions
            const canvasWidth = Math.max(video.videoWidth / this.sampleSize, 1);
            const canvasHeight = Math.max(video.videoHeight / this.sampleSize, 1);

            if (!this.canvas || this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
                if (this.canvas) {
                    canvasPool.release(this.canvas);
                }
                this.canvas = canvasPool.get(canvasWidth, canvasHeight);
                this.context = this.canvas.getContext("2d", { willReadFrequently: true });
            }

            try {
                this.context.drawImage(
                    video,
                    0,
                    0,
                    this.canvas.width,
                    this.canvas.height
                );
                return this.context.getImageData(
                    0,
                    0,
                    this.canvas.width,
                    this.canvas.height
                );
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
        // reduces false positive for first frame by setting value if null 
        detectFlashSequence(brightness, timestamp) {
            if (this.metrics.lastFrameBrightness === null) {
                this.metrics.lastFrameBrightness = brightness;
                return;
            }
            const brightnessDiff = Math.abs(
                brightness - this.metrics.lastFrameBrightness
            );
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
            const flashRate =
                this.metrics.flashCount / (this.metrics.frameCount / 60);
            if (flashRate > 3) factors.push('High Flash Rate');
            if (this.calculateAverageIntensity() > 0.5)
                factors.push('High Intensity');
            if (this.metrics.flashSequences.length > 5)
                factors.push('Multiple Sequences');
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

        // DEBUG
        // Values are passed to the helper functions for ease of calibration
        // If different values are provided, will override helper defaults

        detectColorSpikes(changes, fixedThreshold = 0.2, stdDevMultiplier = 2) {
            return window.AnalyzerHelpers.colorSpikes(
                changes,
                fixedThreshold,
                stdDevMultiplier
            );
        }

        calculateTemporalChange(currentBrightness, maxHistory = 1000) {
            return window.AnalyzerHelpers.temporalChange.call(
                this,
                currentBrightness,
                maxHistory
            );
        }

        estimateFlickerFrequency() {
            return window.AnalyzerHelpers.estFlickerFrequency.call(this);
        }

        calculateFrameEntropy(imageData, maxHistory = 1000) {
            return window.AnalyzerHelpers.frameEntropy.call(
                this,
                imageData,
                maxHistory
            );
        }

        calculatePSI(
            brightness,
            brightnessDiff,
            weights = {
                frequency: 0.3,
                intensity: 0.25,
                coverage: 0.2,
                duration: 0.15,
                brightness: 0.1,
            }
        ) {
            brightness =
                typeof brightness === "number" && brightness >= 0 && brightness <= 1
                    ? brightness
                    : 0;
            brightnessDiff =
                typeof brightnessDiff === "number" &&
                    brightnessDiff >= 0 &&
                    brightnessDiff <= 1
                    ? brightnessDiff
                    : 0;

            const frameCount = this.metrics.frameCount || 1;
            const flashCount = this.metrics.flashCount || 0;
            const frequency = frameCount > 0 ? flashCount / (frameCount / 60) : 0;

            const normFrequency = Math.min(frequency / 3, 1);

            let coverage = 0;
            try {
                coverage = this.calculateCoverage(
                    this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
                );
                coverage =
                    typeof coverage === "number" && coverage >= 0 && coverage <= 1
                        ? coverage
                        : 0;
            } catch (e) {
                coverage = 0;
            }

            let duration = 0;
            if (
                Array.isArray(this.metrics.flashSequences) &&
                this.metrics.flashSequences.length > 0
            ) {
                const lastSeq =
                    this.metrics.flashSequences[this.metrics.flashSequences.length - 1];
                duration =
                    lastSeq &&
                        typeof lastSeq.frameDuration === "number" &&
                        lastSeq.frameDuration >= 0
                        ? lastSeq.frameDuration
                        : 0;
            }

            const normDuration = Math.min(duration / 50, 1);
            const normIntensity = Math.min(brightnessDiff / 0.2, 1);

            const psi = {
                frequency: normFrequency,
                intensity: normIntensity,
                coverage: coverage,
                duration: normDuration,
                brightness: brightness,
            };

            const score =
                psi.frequency * (weights.frequency || 0.3) +
                psi.intensity * (weights.intensity || 0.25) +
                psi.coverage * (weights.coverage || 0.2) +
                psi.duration * (weights.duration || 0.15) +
                psi.brightness * (weights.brightness || 0.1);

            if (!Array.isArray(this.advancedMetrics.psiHistory))
                this.advancedMetrics.psiHistory = [];
            this.advancedMetrics.psi = { score, components: psi };
            this.advancedMetrics.psiHistory.push({
                timestamp: Date.now(),
                score,
                components: psi,
            });
            if (this.advancedMetrics.psiHistory.length > 1000)
                this.advancedMetrics.psiHistory.shift();

            // if (score > 0.8) console.warn('High PSI risk score:', score, psi);

            return { score, components: psi };
        }

        analyzeSpatialDistribution(imageData) {
            return window.AnalyzerHelpers.spatialDistribution(imageData);
        }

        analyzeChromaticFlashes(imageData, historyLen = 10) {
            return window.AnalyzerHelpers.chromaticFlashes.call(
                this,
                imageData,
                historyLen
            );
        }

        analyzeTemporalContrast(brightness, timestamp, bufferLen = 15) {
            return window.AnalyzerHelpers.temporalContrast.call(
                this,
                brightness,
                timestamp,
                bufferLen
            );
        }
        // TASK S117: performSpectralAnalysis expects 5 params but also the analyzer.js is shared between the default yt analyzer and the offine fileanalyzer
        // So what this means, on one hand I  can be completely certain of the fps and for the yt analyzer, I have no clue  as I am sampling as fast as I can
        // So this is the S117 (spectral 117)
        performSpectralAnalysis(
            brightness,
            bufferLen = 128,
            fftLen = 64,
            fps = 60,
            timestamp
        ) {
            const spectFps = fps || (this.minAnalysisInterval ? 1000 / this.minAnalysisInterval : 60);
            return window.AnalyzerHelpers.spectralAnalysis.call(
                this,
                brightness,
                bufferLen,
                fftLen,
                spectFps,
                timestamp
            );
        }

        detectPeriodicity(signal, minLag = 2, threshold = 0.5) {
            return window.AnalyzerHelpers.periodicity(signal, minLag, threshold);
        }

        calculateTemporalCoherence(brightness, windowSize = 30, maxLag = 10) {
            return window.AnalyzerHelpers.temporalCoherence.call(
                this,
                brightness,
                windowSize,
                maxLag
            );
        }

        isSaturatedRed(color, lab, thresholds) {
            return window.AnalyzerHelpers.isSaturatedRed.call(
                this,
                color,
                lab,
                thresholds
            );
        }

        getRedAreaFraction(sample, lab, thresholds) {
            return window.AnalyzerHelpers.getRedAreaFraction.call(
                this,
                sample,
                lab,
                thresholds
            );
        }

        precomputeRedSeries(sortedSeries, labs, thresholds) {
            return window.AnalyzerHelpers.precomputeRedSeries.call(
                this,
                sortedSeries,
                labs,
                thresholds
            );
        }

        computeRedWindowMetrics(
            startIdx,
            endIdx,
            timestamps,
            redAreaFractions,
            redAreaOnThreshold
        ) {
            return window.AnalyzerHelpers.computeRedWindowMetrics.call(
                this,
                startIdx,
                endIdx,
                timestamps,
                redAreaFractions,
                redAreaOnThreshold
            );
        }
        // TASK 4128
        computePerFrameRedStates(redAreaFractions, redAreaOnThreshold) {
            return window.AnalyzerHelpers.computePerFrameRedStates.call(
                this,
                redAreaFractions,
                redAreaOnThreshold
            );
        }

        detectEdges(imageData, sobelThreshold = 50, maxHistory = 500) {
            return window.AnalyzerHelpers.detectEdges.call(
                this,
                imageData,
                sobelThreshold,
                maxHistory
            );
        }

        getLuminance(data, idx, weights = [0.2126, 0.7152, 0.0722]) {
            return window.AnalyzerHelpers.luminance(data, idx, weights);
        }

        calculateEdgeChange(window = 2) {
            return window.AnalyzerHelpers.edgeChange.call(this, window);
        }
        // Used via yt analyzer instance only
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
        // Used via yt analyzer instance only
        generateNDJSON() {
            return window.AnalyzerHelpers.generateNDJSON.call(this);
        }

        // Used via fileanalyzer instance only
        streamNDJSON() {
            return window.AnalyzerHelpers.streamNDJSON.call(this);
        }

        // Used via fileanalyzer instance only
        streamCSV() {
            return window.AnalyzerHelpers.streamCSV.call(this);
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
                lastFrameBrightness: null,
                frameCount: 0,
                flashSequences: [],
                lastTimestamp: 0
            };
            this.lastRedIntensity = null;
            this.lastDominantLab = null;
            this.lastFrame = null;
            this.timelineData = [];
            this.dataChunks = [];
            this.currentChunk = [];
            this._frameDiffHistory = new Float32Array(8);
            // TASK 8902.3: Init flash violation tracking with stored default cluster gap threshold
            const savedClusterGapThreshold = this.savedClusterGapThreshold || 0.3;
            if (window.AnalyzerHelpers && window.AnalyzerHelpers.initFlashViolationTracking) {
                window.AnalyzerHelpers.initFlashViolationTracking.call(this, savedClusterGapThreshold);
            }
            // TASK 8902.4
            // Reset flash violation tracking
            if (window.AnalyzerHelpers && window.AnalyzerHelpers.resetFlashViolationTracking) {
                const threshold = this.savedClusterGapThreshold || 0.3;
                window.AnalyzerHelpers.resetFlashViolationTracking.call(this, threshold);
            }

            // Return canvas to pool
            if (this.canvas) {
                canvasPool.release(this.canvas);
                this.canvas = null;
                this.context = null;
            }

            if (this.redMetricsEnabled && this.isFileAnalyzer) {
                this.redSeries = [];
                this.redAreaFractions = [];
            }

            if (this.temporalContrastEnabled && this.isFileAnalyzer) {
                this.temporalContrastSeries = [];
                this.temporalContrastResults = [];
            }

            const coherenceWindowSize =
                this.advancedMetrics.temporalCoherence.windowSize || 30;
            const edgeHistoryMax =
                this.advancedMetrics.edgeDetection.maxHistory || 500;
            const chromaticHistoryLen =
                this.advancedMetrics.chromaticFlashes.maxLen || 10;
            const colorHistoryLen = this.advancedMetrics.colorHistory.maxLen || 30;
            const spectralBufferLen =
                this.advancedMetrics.spectralAnalysis.bufferLen || 128;
            const spectralFftLen = this.advancedMetrics.spectralAnalysis.fftLen || 64;

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
                    },
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

        destroy() {
            if (this.canvas) {
                canvasPool.release(this.canvas);
                this.canvas = null;
                this.context = null;
            }
            canvasPool.clear();
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

        createTimelineEntry(
            relativeTime,
            timestamp,
            brightness,
            isFlash,
            brightnessDiff,
            metrics,
            redIntensity = 0,
            redDelta = 0
        ) {
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
                sceneChangeScore: metrics.sceneChangeScore,
                contrastSensitivity: metrics.contrastSensitivity,
                redMetrics: metrics.redMetrics,
                redState: metrics.redState || 0,
                redTransition: metrics.redTransition || 0,
                temporalContrastSensitivity: metrics.temporalContrastSensitivity,
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
                fps: Math.round(
                    (1000 * this.metrics.frameCount) /
                    Math.max(1, timelineEntry.timestamp - this.analysisStartTime)
                ),
                sequenceLength: this.metrics.flashSequences.length,
            };
        }

        performFFT(signal) {
            return window.AnalyzerHelpers.performFFT(signal);
        }

        analyzeContrastSensitivity(imageData, options = {}) {
            if (
                window.AnalyzerHelpers &&
                typeof window.AnalyzerHelpers
                    .calculateContrastSensitivityFromImageData === "function"
            ) {
                return window.AnalyzerHelpers.calculateContrastSensitivityFromImageData(
                    imageData,
                    options
                );
            }

            const data = imageData && imageData.data;
            if (!data || !data.length) return null;

            const colors = [];
            for (let i = 0; i < data.length; i += 4) {
                colors.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
            }

            return this.calculateContrastSensitivity(colors, options);
        }

        calculateContrastSensitivity(colors, options = {}) {
            return window.AnalyzerHelpers.calculateContrastSensitivity(
                colors,
                options
            );
        }
        // TASK 8902.5: Retrieve flash violation stats for analyzed video
        // returns defaults if helpers are not loading
        getViolationStatistics(totalDuration) {
            if (window.AnalyzerHelpers && window.AnalyzerHelpers.getFlashViolationStats) {
                return window.AnalyzerHelpers.getFlashViolationStats.call(this, totalDuration);
            }
            return {
                violationCount: 0,
                dangerousFrames: 0,
                totalFrames: this.metrics.frameCount,
                dangerousFramePercent: 0,
                dangerousTime: 0,
                totalDuration: totalDuration || 0,
                dangerousTimePercent: 0,
                instances: []
            };
        }
    }

    window.VideoAnalyzer = VideoAnalyzer;
}
