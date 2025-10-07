window.AnalyzerHelpers = window.AnalyzerHelpers || {};

window.AnalyzerHelpers.streamCSV = function* () {
    try {
        const baseHeaders = [
            "Timestamp",
            "Brightness",
            "Flash Detected",
            "Intensity",
            "Current R Variance",
            "Current G Variance",
            "Current B Variance",
            "Temporal R Variance",
            "Temporal G Variance",
            "Temporal B Variance",
            "R Change Rate",
            "G Change Rate",
            "B Change Rate",
            "Color Spikes Count",
            "Temporal Change",
            "Flicker Frequency (Hz)",
            "Frame Entropy",
            "PSI Score",
            "PSI Frequency",
            "PSI Intensity",
            "PSI Coverage",
            "PSI Duration",
            "Center Flash Intensity",
            "Peripheral Flash Intensity",
            "Red-Green Contrast",
            "Blue-Yellow Contrast",
            "Temporal Contrast Rate",
            "Frame Difference",
            "Motion Ratio",
            "Dominant Frequency (Hz)",
            "Dominant Inst. Frequency (Hz)",
            "Spectral Flatness",
            "Spectral Confidence",
            "Temporal Coherence",
            "Edge Density",
            "Edge Count",
            "Edge Change Rate",
            "Red Intensity",
            "Red Delta",
            "Dominant Color R",
            "Dominant Color G",
            "Dominant Color B",
            "Dominant Lab L",
            "Dominant Lab a",
            "Dominant Lab b",
            "CIE76 Delta",
            "Patterned Stimulus Score",
            "Scene Change Score",
            "Color Change Magnitude",
            "Contrast Sensitivity",
            "Contrast Fluctuations",
            "Contrast Avg DeltaE",
            "Contrast Max DeltaE",
            "Contrast Significant Changes",
            "Contrast Total Samples",
            "Contrast Fluctuation Rate",
            "Contrast Weighted Avg DeltaE",
            "Contrast Window Size",
            "Contrast Weight Decay",
            "Contrast Coefficient of Variation",
            "Contrast Median DeltaE",
            "Contrast 90th Percentile DeltaE",
            "Contrast 95th Percentile DeltaE",
        ];

        const temporalContrastHeaders = [
            "Temporal Window Duration",
            "Temporal Window Sample Count",
            "Temporal Window Sensitivity",
            "Temporal Window Fluctuations",
            "Temporal Window Avg DeltaE",
            "Temporal Window Max DeltaE",
            "Temporal Window Significant Changes",
            "Temporal Stream Weighted Avg DeltaE",
        ];

        const redMetricsHeaders = [
            "Red Area Avg",
            "Red Area Max",
            "Red On Fraction",
            "Red Transitions",
            "Red Flash Events",
            "Red Flash Per Second",
            "Red Flicker In Risk Band",
            "Red State",
            "Red Transition"
        ];

        let headers = [...baseHeaders];
        if (this.temporalContrastEnabled && this.isFileAnalyzer) {
            headers = [...headers, ...temporalContrastHeaders];
        }
        if (this.redMetricsEnabled) {
            headers = [...headers, ...redMetricsHeaders];
        }

        yield headers.join(",") + "\n";

        const allData = [...this.dataChunks.flat(), ...this.currentChunk]
            .filter((entry) => entry.timestamp >= 0)
            .sort((a, b) => a.timestamp - b.timestamp);

        for (const entry of allData) {
            const colorVar = entry.colorVariance || {
                current: { r: 0, g: 0, b: 0 },
                temporal: { r: 0, g: 0, b: 0 },
                averageChange: { r: 0, g: 0, b: 0 },
                spikes: [],
            };

            // Inline Temporal color change magnitude (Euclidean distance)
            const rChange = Number(colorVar.averageChange?.r || 0);
            const gChange = Number(colorVar.averageChange?.g || 0);
            const bChange = Number(colorVar.averageChange?.b || 0);
            const colorChangeMagnitude = Math.sqrt(
                rChange * rChange + gChange * gChange + bChange * bChange
            );

            const cs = entry.contrastSensitivity || {};
            const tcs = entry.temporalContrastSensitivity || {};
            const baseRow = [
                Number(entry.timestamp || 0).toFixed(6),
                Number(entry.brightness || 0).toFixed(4),
                entry.isFlash ? "1" : "0",
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
                Number(entry.spectralAnalysis?.dominantInstFreq || 0).toFixed(2),
                Number(entry.spectralFlatness || 0).toFixed(4),
                Number(entry.spectralAnalysis?.confidence || 0).toFixed(4),
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
                Number(colorChangeMagnitude).toFixed(4),
                Number(cs.sensitivity || 0).toFixed(4),
                Number(cs.fluctuations || 0).toFixed(4),
                Number(cs.averageDeltaE || 0).toFixed(4),
                Number(cs.maxDeltaE || 0).toFixed(4),
                cs.significantChanges || 0,
                cs.totalSamples || 0,
                Number(cs.fluctuationRate || 0).toFixed(4),
                Number(cs.weightedAverageDeltaE || 0).toFixed(4),
                cs.windowSize || 0,
                Number(cs.weightDecay || 0).toFixed(6),
                Number(cs.coefficientOfVariation || 0).toFixed(4),
                Number(cs.medianDeltaE || 0).toFixed(4),
                Number(cs.p90DeltaE || 0).toFixed(4),
                Number(cs.p95DeltaE || 0).toFixed(4),
            ];

            const temporalContrastRow = [
                Number(tcs.duration || 0).toFixed(2),
                tcs.sampleCount || 0,
                Number(tcs.sensitivity || 0).toFixed(4),
                Number(tcs.fluctuations || 0).toFixed(4),
                Number(tcs.averageDeltaE || 0).toFixed(4),
                Number(tcs.maxDeltaE || 0).toFixed(4),
                tcs.significantChanges || 0,
                Number(tcs.streamWeightedAverageDeltaE || 0).toFixed(4),
            ];

            const redMetricsRow = [
                Number(entry.redMetrics?.redAreaAvg || 0).toFixed(4),
                Number(entry.redMetrics?.redAreaMax || 0).toFixed(4),
                Number(entry.redMetrics?.redOnFraction || 0).toFixed(4),
                entry.redMetrics?.redTransitions || 0,
                entry.redMetrics?.redFlashEvents || 0,
                Number(entry.redMetrics?.redFlashPerSecond || 0).toFixed(4),
                entry.redMetrics?.redFlickerInRiskBand ? "1" : "0",
                entry.redMetrics?.redState || 0,
                entry.redMetrics?.redTransitions || 0
            ];

            // Builds row based on enabled features from fileanalyzer.js
            let row = [...baseRow];
            if (this.temporalContrastEnabled && this.isFileAnalyzer) {
                row = [...row, ...temporalContrastRow];
            }
            if (this.redMetricsEnabled) {
                row = [...row, ...redMetricsRow];
            }
            yield row.join(",") + "\n";
        }
    } catch (error) {
        yield "Error generating CSV\n";
    }
};

window.AnalyzerHelpers.generateCSV = function () {
    let csv = "";
    for (const line of window.AnalyzerHelpers.streamCSV.call(this)) {
        csv += line;
    }
    return csv;
};
