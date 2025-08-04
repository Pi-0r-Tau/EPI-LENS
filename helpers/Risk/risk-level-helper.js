/**
 * Risk Level Helper
 * Contains functions for calculating video content risk levels based on metrics.
 */
(function() {
    const THRESHOLDS = {
        HIGH: 0.8, MEDIUM: 0.65,
        INTENSITY_HIGH: 0.8, INTENSITY_MEDIUM: 0.6,
        COVERAGE_HIGH: 0.25, COVERAGE_MEDIUM: 0.15,
        RED_HIGH: 0.8, RED_MEDIUM: 0.5,
        RED_DELTA_HIGH: 0.6, RED_DELTA_MEDIUM: 0.4,
        CHROMA_HIGH: 0.8, CHROMA_MEDIUM: 0.5,
        PATTERN_MEDIUM: 0.5, PATTERN_HIGH: 0.8,
        FLASHES_HIGH: 3,
        WEIGHT_PSI: 0.7, WEIGHT_COLOR: 0.2,
        WEIGHT_PATTERN: 0.1, WEIGHT_HIGH: 0.75,
        WEIGHT_MEDIUM: 0.5, FLICKER_MIN: 3,
        FLICKER_MAX: 30
    };

    function clamp(value, min = 0, max = 1) {
        return Math.max(min, Math.min(max, value));
    }

    function isNumber(value, fallback = 0) {
        return typeof value === 'number' ? value : fallback;
    }

    let highestRiskLevel = "low";

    function levelRank(level) {
        switch (level) {
            case 'high': return 3;
            case 'medium': return 2;
            default: return 1;
        }
    }

    function nPlusHistory({ flashSequences, patternHistory, lastRedIntensity, prevRedIntensity }) {
        return (
            Array.isArray(flashSequences) && flashSequences.length > 1 &&
            Array.isArray(patternHistory) && patternHistory.length > 1 &&
            typeof lastRedIntensity === 'number' &&
            typeof prevRedIntensity === 'number'
        );
    }

    function calculateRiskLevel(params) {
        const {
            metrics,
            calculateAverageIntensity,
            calculateCoverage,
            canvas,
            context,
            advancedMetrics,
            lastRedIntensity,
            prevRedIntensity,
            patternHistory
        } = params;

        // DEBUG
        // const missingParams = [];
        // if (!metrics) missingParams.push("metrics");
        // if (typeof calculateAverageIntensity !== "function") missingParams.push("calculateAverageIntensity");
        // if (typeof calculateCoverage !== "function") missingParams.push("calculateCoverage");
        // if (!canvas) missingParams.push("canvas");
        // if (!context) missingParams.push("context");

        // if (missingParams.length > 0) {
        //     const errorMsg = `Missing parameters: ${missingParams.join(", ")}.`;
        //     console.error("RiskLevelHelper:", errorMsg);
        //     return { level: "low", error: errorMsg };
        //  }

        const flashSequences = metrics.flashSequences || [];
        let maxFlashesIn1s = 0;
        // Sliding window rather than previous nested loops to find max number of flashes in 1 second window. 
        if (flashSequences.length > 1) {
            const timestamps = flashSequences.map(seq => seq.timestamp).sort((a, b) => a - b);
            let start = 0;
            for (let end = 0; end < timestamps.length; end++) {
                while (timestamps[end] - timestamps[start] > 1000) {
                    start++;
                }
                const count = end - start + 1;
                if (count > maxFlashesIn1s) maxFlashesIn1s = count;
            }
        }

        const avgIntensity = clamp(calculateAverageIntensity());
        let coverage = 0;
        try {
            coverage = clamp(calculateCoverage(context.getImageData(0, 0, canvas.width, canvas.height)));
        } catch (e) {
            console.error('Coverage calculation failed:', e);
        }

        const chromaHistory = advancedMetrics?.chromaticFlashes?.lastColors || [];
        const latestChroma = chromaHistory.length ? chromaHistory[chromaHistory.length - 1] : { redGreen: 0, blueYellow: 0 };
        const redIntensity = isNumber(lastRedIntensity);
        const prevRed = isNumber(prevRedIntensity, null);
        const redDelta = typeof prevRed === 'number' ? Math.abs(redIntensity - prevRed) : 0;
        const patternedStimulusScore = Array.isArray(patternHistory) && patternHistory.length > 0 ? patternHistory[patternHistory.length - 1] : 0;
        const flickerHz = advancedMetrics?.spectralAnalysis?.dominantFrequency || 0;
        const flickerRisk = flickerHz >= THRESHOLDS.FLICKER_MIN && flickerHz <= THRESHOLDS.FLICKER_MAX;
        const psiScore = clamp(advancedMetrics?.psi?.score || 0);
        const colorRisk = Math.max(redDelta * 1.5, redIntensity, latestChroma.redGreen, latestChroma.blueYellow);
        const colorRiskClamped = clamp(colorRisk);
        const patternRisk = clamp(patternedStimulusScore);

        const nData = nPlusHistory({ flashSequences, patternHistory, lastRedIntensity, prevRedIntensity });

        // Determine risk level based on thresholds
        let level = 'low';

        if (nData) {
            if (
                psiScore >= THRESHOLDS.HIGH ||
                maxFlashesIn1s > THRESHOLDS.FLASHES_HIGH ||
                avgIntensity >= THRESHOLDS.INTENSITY_HIGH ||
                coverage >= THRESHOLDS.COVERAGE_HIGH ||
                redIntensity >= THRESHOLDS.RED_HIGH ||
                redDelta >= THRESHOLDS.RED_DELTA_HIGH ||
                latestChroma.redGreen >= THRESHOLDS.CHROMA_HIGH ||
                latestChroma.blueYellow >= THRESHOLDS.CHROMA_HIGH ||
                (flickerRisk && (avgIntensity >= THRESHOLDS.INTENSITY_HIGH || coverage >= THRESHOLDS.COVERAGE_HIGH)) ||
                patternRisk >= THRESHOLDS.PATTERN_HIGH
            ) {
                level = 'high';
            } else if (
                psiScore >= THRESHOLDS.MEDIUM ||
                maxFlashesIn1s === THRESHOLDS.FLASHES_HIGH ||
                avgIntensity >= THRESHOLDS.INTENSITY_MEDIUM ||
                coverage >= THRESHOLDS.COVERAGE_MEDIUM ||
                redIntensity >= THRESHOLDS.RED_MEDIUM ||
                redDelta >= THRESHOLDS.RED_DELTA_MEDIUM ||
                latestChroma.redGreen >= THRESHOLDS.CHROMA_MEDIUM ||
                latestChroma.blueYellow >= THRESHOLDS.CHROMA_MEDIUM ||
                (flickerRisk && (avgIntensity >= THRESHOLDS.INTENSITY_MEDIUM || coverage >= THRESHOLDS.COVERAGE_MEDIUM)) ||
                patternRisk >= THRESHOLDS.PATTERN_MEDIUM
            ) {
                level = 'medium';
            } else {
                const weightedScore =
                    THRESHOLDS.WEIGHT_PSI * psiScore +
                    THRESHOLDS.WEIGHT_COLOR * colorRiskClamped +
                    THRESHOLDS.WEIGHT_PATTERN * patternRisk;
                if (weightedScore >= THRESHOLDS.WEIGHT_HIGH) level = 'high';
                else if (weightedScore >= THRESHOLDS.WEIGHT_MEDIUM) level = 'medium';
            }
        }

        if (levelRank(level) > levelRank(highestRiskLevel)) {
            highestRiskLevel = level;
        }
        level = highestRiskLevel;

        return {
            level,
            maxFlashesIn1s,
            avgIntensity,
            coverage,
            psiScore,
            chromatic: latestChroma,
            redIntensity,
            redDelta,
            flickerHz,
            patternedStimulusScore,
            flashCount: metrics.flashCount,
            frameCount: metrics.frameCount
        };
    }

    window.RiskLevelHelper = {
        calculateRiskLevel
    };
})();