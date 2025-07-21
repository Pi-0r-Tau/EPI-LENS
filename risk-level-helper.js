/**
 * Risk Level Helper
 * Contains functions for calculating video content risk levels based on metrics.
 */
(function() {
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

        const flashSequences = metrics.flashSequences || [];
        let maxFlashesIn1s = 0;

        if (flashSequences.length > 0) {
            const timestamps = flashSequences.map(seq => seq.timestamp).sort((a, b) => a - b);
            for (let i = 0; i < timestamps.length; i++) {
                let count = 1;
                for (let j = i + 1; j < timestamps.length; j++) {
                    if (timestamps[j] - timestamps[i] <= 1000) count++;
                    else break;
                }
                if (count > maxFlashesIn1s) maxFlashesIn1s = count;
            }
        }

        const avgIntensity = calculateAverageIntensity();

        let coverage = 0;
        try {
            coverage = calculateCoverage(
                context.getImageData(0, 0, canvas.width, canvas.height)
            );
        } catch (e) {
            coverage = 0;
        }

        const chromaHistory = advancedMetrics.chromaticFlashes?.lastColors || [];
        const latestChroma = chromaHistory.length ? chromaHistory[chromaHistory.length - 1] : { redGreen: 0, blueYellow: 0 };
        const redIntensity = typeof lastRedIntensity === 'number' ? lastRedIntensity : 0;
        const redDelta = typeof lastRedIntensity === 'number' && typeof prevRedIntensity === 'number'? Math.abs(lastRedIntensity - prevRedIntensity) : 0;
        const patternedStimulusScore = patternHistory.length ? patternHistory[patternHistory.length - 1] : 0;
        const flickerHz = advancedMetrics.spectralAnalysis?.dominantFrequency || 0;
        const psiScore = advancedMetrics.psi?.score || 0;

        // Determine risk level based on thresholds
        let level = 'low';

        // High risk: Any PSE violation
        if (
            (maxFlashesIn1s > 3) &&
            (
                avgIntensity > 0.8 ||
                coverage > 0.25 ||
                psiScore > 0.8 ||
                redIntensity > 0.8 ||
                redDelta > 0.5 ||
                latestChroma.redGreen > 0.8 ||
                latestChroma.blueYellow > 0.8 ||
                (flickerHz >= 3 && flickerHz <= 30) ||
                patternedStimulusScore > 0.8
            )
        ) {
            level = 'high';
        } else if (
            (maxFlashesIn1s > 3) ||
            avgIntensity > 0.5 ||
            coverage > 0.15 ||
            psiScore > 0.5 ||
            redIntensity > 0.5 ||
            latestChroma.redGreen > 0.5 ||
            latestChroma.blueYellow > 0.5 ||
            (flickerHz >= 3 && flickerHz <= 30) ||
            patternedStimulusScore > 0.5
        ) {
            level = 'medium';
        }

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