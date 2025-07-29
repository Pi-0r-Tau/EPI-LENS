window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.generateCSV = function () {
    try {
        const headers = [
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
            "Dominant Frequency",
            "Spectral Flatness",
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
        ];
        const allData = [...this.dataChunks.flat(), ...this.currentChunk]
            .filter((entry) => entry.timestamp >= 0)
            .sort((a, b) => a.timestamp - b.timestamp);

        console.log(
            `Exporting data: ${allData.length} frames, from ${this.analysisStartTime} to ${this.lastExportTime}`
        );
        const rows = allData.map((entry) => {
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

            return [
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
                Number(colorChangeMagnitude).toFixed(4),
            ];
        });
        return [headers, ...rows].map((row) => row.join(",")).join("\n");
    } catch (error) {
        console.error("CSV generation error:", error);
        return "Error generating CSV";
    }
};
