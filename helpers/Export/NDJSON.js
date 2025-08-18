window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.generateNDJSON = function () {
    try {
        const allData = [...this.dataChunks.flat(), ...this.currentChunk]
            .filter((entry) => entry.timestamp >= 0)
            .sort((a, b) => a.timestamp - b.timestamp);
            
        const lines = allData.map((entry) => {
            const colorVar = entry.colorVariance || {
                current: { r: 0, g: 0, b: 0 },
                temporal: { r: 0, g: 0, b: 0 },
                averageChange: { r: 0, g: 0, b: 0 },
                spikes: [],
            };

            // Calculate color change magnitude
            const rChange = Number(colorVar.averageChange?.r || 0);
            const gChange = Number(colorVar.averageChange?.g || 0);
            const bChange = Number(colorVar.averageChange?.b || 0);
            const colorChangeMagnitude = Math.sqrt(
                rChange * rChange + gChange * gChange + bChange * bChange
            );
            const cs = entry.contrastSensitivity || {};
            const tcs = entry.temporalContrastSensitivity || {};

            const frameData = {
                timestamp: Number(entry.timestamp || 0).toFixed(6),
                brightness: Number(entry.brightness || 0).toFixed(4),
                isFlash: entry.isFlash,
                intensity: Number(entry.intensity || 0).toFixed(4),
                colorVariance: {
                    current: {
                        r: Number(colorVar.current?.r || 0).toFixed(4),
                        g: Number(colorVar.current?.g || 0).toFixed(4),
                        b: Number(colorVar.current?.b || 0).toFixed(4),
                    },
                    temporal: {
                        r: Number(colorVar.temporal?.r || 0).toFixed(4),
                        g: Number(colorVar.temporal?.g || 0).toFixed(4),
                        b: Number(colorVar.temporal?.b || 0).toFixed(4),
                    },
                    averageChange: {
                        r: Number(colorVar.averageChange?.r || 0).toFixed(4),
                        g: Number(colorVar.averageChange?.g || 0).toFixed(4),
                        b: Number(colorVar.averageChange?.b || 0).toFixed(4),
                        magnitude: Number(colorChangeMagnitude).toFixed(4),
                    },
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
                        duration: Number(entry.psi?.components?.duration || 0).toFixed(4),
                    },
                },
                frameDifference: {
                    difference: Number(entry.frameDifference?.difference || 0).toFixed(4),
                    motion: Number(entry.frameDifference?.motion || 0).toFixed(4),
                },
                spectralAnalysis: {
                    dominantFrequency: Number(
                        entry.spectralAnalysis?.dominantFrequency || 0
                    ).toFixed(2),
                    spectralFlatness: Number(entry.spectralFlatness || 0).toFixed(4),
                    spectrum: entry.spectralAnalysis?.spectrum || [],
                },
                temporalCoherence: {
                    score: Number(entry.temporalCoherence?.coherenceScore || 0).toFixed(
                        4
                    ),
                    periodicity: entry.temporalCoherence?.periodicity || null,
                },
                edgeDetection: {
                    density: Number(entry.edgeDetection?.edgeDensity || 0).toFixed(4),
                    count: entry.edgeDetection?.edgeCount,
                    change: Number(entry.edgeDetection?.temporalEdgeChange || 0).toFixed(
                        4
                    ),
                },
                redIntensity: Number(entry.redIntensity || 0).toFixed(4),
                redDelta: Number(entry.redDelta || 0).toFixed(4),
                dominantColor: entry.dominantColor
                    ? {
                        r: Number(entry.dominantColor.r || 0).toFixed(1),
                        g: Number(entry.dominantColor.g || 0).toFixed(1),
                        b: Number(entry.dominantColor.b || 0).toFixed(1),
                    }
                    : null,
                dominantLab: entry.dominantLab
                    ? {
                        l: Number(entry.dominantLab.l || 0).toFixed(2),
                        a: Number(entry.dominantLab.a || 0).toFixed(2),
                        b: Number(entry.dominantLab.b || 0).toFixed(2),
                    }
                    : null,
                cie76Delta: Number(entry.cie76Delta || 0).toFixed(4),
                patternedStimulusScore: Number(
                    entry.patternedStimulusScore || 0
                ).toFixed(4),
                sceneChangeScore: Number(entry.sceneChangeScore || 0).toFixed(4),
                spatialMap: entry.spatialMap
                    ? {
                        center: Number(entry.spatialMap.center || 0).toFixed(4),
                        periphery: Number(entry.spatialMap.periphery || 0).toFixed(4),
                        quadrants: entry.spatialMap.quadrants || [],
                    }
                    : null,
                chromaticFlashes: entry.chromaticFlashes
                    ? {
                        redGreen: Number(entry.chromaticFlashes.redGreen || 0).toFixed(4),
                        blueYellow: Number(
                            entry.chromaticFlashes.blueYellow || 0
                        ).toFixed(4),
                    }
                    : null,
                contrastSensitivity: {
                    sensitivity: Number(cs.sensitivity || 0).toFixed(4),
                    fluctuations: Number(cs.fluctuations || 0).toFixed(4),
                    averageDeltaE: Number(cs.averageDeltaE || 0).toFixed(4),
                    maxDeltaE: Number(cs.maxDeltaE || 0).toFixed(4),
                    significantChanges: cs.significantChanges || 0,
                    totalSamples: cs.totalSamples || 0,
                    fluctuationRate: Number(cs.fluctuationRate || 0).toFixed(4),
                    weightedAverageDeltaE: Number(cs.weightedAverageDeltaE || 0).toFixed(4),
                    windowSize: cs.windowSize || 0,
                    weightDecay: Number(cs.weightDecay || 0).toFixed(6),
                    coefficientOfVariation: Number(cs.coefficientOfVariation || 0).toFixed(4),
                    medianDeltaE: Number(cs.medianDeltaE || 0).toFixed(4),
                    p90DeltaE: Number(cs.p90DeltaE || 0).toFixed(4),
                    p95DeltaE: Number(cs.p95DeltaE || 0).toFixed(4)
                },
                temporalContrastSensitivity: {
                    startTime: Number(tcs.startTime || 0).toFixed(2),
                    endTime: Number(tcs.endTime || 0).toFixed(2),
                    duration: Number(tcs.duration || 0).toFixed(2),
                    sampleCount: tcs.sampleCount || 0,
                    sensitivity: Number(tcs.sensitivity || 0).toFixed(4),
                    fluctuations: Number(tcs.fluctuations || 0).toFixed(4),
                    averageDeltaE: Number(tcs.averageDeltaE || 0).toFixed(4),
                    maxDeltaE: Number(tcs.maxDeltaE || 0).toFixed(4),
                    significantChanges: tcs.significantChanges || 0,
                    totalSamples: tcs.totalSamples || 0,
                    fluctuationRate: Number(tcs.fluctuationRate || 0).toFixed(4),
                    weightedAverageDeltaE: Number(tcs.weightedAverageDeltaE || 0).toFixed(4),
                    windowSize: tcs.windowSize || 0,
                    weightDecay: Number(tcs.weightDecay || 0).toFixed(6),
                    coefficientOfVariation: Number(tcs.coefficientOfVariation || 0).toFixed(4),
                    medianDeltaE: Number(tcs.medianDeltaE || 0).toFixed(4),
                    p90DeltaE: Number(tcs.p90DeltaE || 0).toFixed(4),
                    p95DeltaE: Number(tcs.p95DeltaE || 0).toFixed(4),
                    streamWeightedAverageDeltaE: Number(tcs.streamWeightedAverageDeltaE || 0).toFixed(4)
                },
            };

            // Include temporal contrast sensitivity only if enabled via fileanalyzer.js
            if (this.temporalContrastEnabled && this.isFileAnalyzer) {
                frameData.temporalContrastSensitivity = {
                    startTime: Number(tcs.startTime || 0).toFixed(2),
                    endTime: Number(tcs.endTime || 0).toFixed(2),
                    duration: Number(tcs.duration || 0).toFixed(2),
                    sampleCount: tcs.sampleCount || 0,
                    sensitivity: Number(tcs.sensitivity || 0).toFixed(4),
                    fluctuations: Number(tcs.fluctuations || 0).toFixed(4),
                    averageDeltaE: Number(tcs.averageDeltaE || 0).toFixed(4),
                    maxDeltaE: Number(tcs.maxDeltaE || 0).toFixed(4),
                    significantChanges: tcs.significantChanges || 0,
                    totalSamples: tcs.totalSamples || 0,
                    fluctuationRate: Number(tcs.fluctuationRate || 0).toFixed(4),
                    weightedAverageDeltaE: Number(tcs.weightedAverageDeltaE || 0).toFixed(4),
                    windowSize: tcs.windowSize || 0,
                    weightDecay: Number(tcs.weightDecay || 0).toFixed(6),
                    coefficientOfVariation: Number(tcs.coefficientOfVariation || 0).toFixed(4),
                    medianDeltaE: Number(tcs.medianDeltaE || 0).toFixed(4),
                    p90DeltaE: Number(tcs.p90DeltaE || 0).toFixed(4),
                    p95DeltaE: Number(tcs.p95DeltaE || 0).toFixed(4),
                    streamWeightedAverageDeltaE: Number(tcs.streamWeightedAverageDeltaE || 0).toFixed(4)
                };
            }

            // Include red metrics only if enabled via fileanalyzer.js, toggled via fileanalyzer.html
            if (this.redMetricsEnabled) {
                frameData.redMetrics = {
                    redAreaAvg: Number(entry.redMetrics?.redAreaAvg || 0).toFixed(4),
                    redAreaMax: Number(entry.redMetrics?.redAreaMax || 0).toFixed(4),
                    redOnFraction: Number(entry.redMetrics?.redOnFraction || 0).toFixed(4),
                    redTransitions: entry.redMetrics?.redTransitions || 0,
                    redFlashEvents: entry.redMetrics?.redFlashEvents || 0,
                    redFlashPerSecond: Number(entry.redMetrics?.redFlashPerSecond || 0).toFixed(4),
                    redFlickerInRiskBand: !!entry.redMetrics?.redFlickerInRiskBand,
                };
            }

            return JSON.stringify(frameData);
        });

        return lines.join("\n");
    } catch (error) {
        console.error("NDJSON generation error:", error);
        return JSON.stringify({ error: "Error generating NDJSON" }) + "\n";
    }
};