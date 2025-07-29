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
            };

            return JSON.stringify(frameData);
        });

        return lines.join("\n");
    } catch (error) {
        console.error("NDJSON generation error:", error);
        return JSON.stringify({ error: "Error generating NDJSON" }) + "\n";
    }
};