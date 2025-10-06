/**
 * Risk Level Helper
 * Calculates video content PSE risk
 * Uses a sticky escalation model with a risk debt integrator to inform risk decision.
 * Once a risk is escalated, it cannot be downgraded during the session
 */
(function() {
    // Risk thresholds
    // Note: FLASHES_HIGH = 3 means 'more than 3 per 1s is a violation'; exactly 3 is allowed.
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
        FLICKER_MAX: 30,
        RISK_DEBT_DECAY: 0.95, RISK_NEAR_START_FRAC: 0.8,
        RISK_DEBT_MED: 0.60, RISK_DEBT_HIGH: 0.85,
        RED_DELTA_MULTIPLIER: 1.5 // Multiplier for redDelta in color risk calculation
    };

    function clamp(value, min = 0, max = 1) {
        return Math.max(min, Math.min(max, value));
    }

    function isNumber(value, fallback = 0) {
        return typeof value === 'number' ? value : fallback;
    }

    // Escalation state per session
    let highestRiskLevel = "low";
    let riskDebt = 0;

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

    function nearScore(value, start, end) {
        if (end <= start) return value >= end ? 1 : 0;
        return clamp((value - start) / (end - start), 0, 1);
    }

    function nearFlashesScore(count) {
        return clamp((count - 1) / 2, 0, 1);
    }

    function hazardPeakScoreFromHz(hz, minHz, peakHz, maxHz) {
        if (hz < minHz || hz > maxHz) return 0;
        if (hz === peakHz) return 1;
        if (hz < peakHz) return clamp(1 - (peakHz - hz) / (peakHz - minHz), 0, 1);
        return clamp(1 - (hz - peakHz) / (maxHz - peakHz), 0, 1);
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
            patternHistory,
        } = params;

        // Prefer ring stats if available
        let flashesIn1s = 0;
        let usedFlashStats = false;
        try {
            if (
                typeof window !== 'undefined' &&
                window.AnalyzerHelpers &&
                typeof window.AnalyzerHelpers.getFlashRateStatistics === 'function' &&
                advancedMetrics && advancedMetrics.flashRate
            ) {
                const stats = window.AnalyzerHelpers.getFlashRateStatistics([1000]);
                const s1 = stats && stats['1000ms'];
                if (s1 && typeof s1.flashCount === 'number') {
                    flashesIn1s = s1.flashCount;
                    usedFlashStats = true;
                }
            }
        } catch (e) { }

        const flashSequences = metrics.flashSequences || [];
        let maxFlashesIn1s = flashesIn1s
        let sequenceViolations = 0;
        if (!usedFlashStats && flashSequences.length > 1) {
            const timestamps = flashSequences
                .map((seq) => seq.timestamp)
                .sort((a, b) => a - b);
            // Sliding window rather than previous nested loops to find max number of flashes in 1 second window.
            let start = 0;
            for (let end = 0; end < timestamps.length; end++) {
                while (timestamps[end] - timestamps[start] > 1000) start++;
                const count = end - start + 1;
                if (count > maxFlashesIn1s) maxFlashesIn1s = count;
                // Count violations (3> in any rolling 1s)
                if (count > THRESHOLDS.FLASHES_HIGH) {
                    sequenceViolations++;
                }
            }
       } else {
            maxFlashesIn1s = flashesIn1s;
            sequenceViolations = flashesIn1s > THRESHOLDS.FLASHES_HIGH ? 1 : 0;
        }

        const avgIntensity = clamp(calculateAverageIntensity());
        let coverage = 0;
        try {
            const w = Math.max(1, canvas?.width || 0);
            const h = Math.max(1, canvas?.height || 0);
            if (context && w > 0 && h > 0) {
                coverage = clamp(calculateCoverage(context.getImageData(0, 0, w, h)));
            }
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
       // RED_DELTA_MULTIPLIER is used to weight the redDelta contribution to color risk
        const colorRisk = Math.max(redDelta * THRESHOLDS.RED_DELTA_MULTIPLIER, redIntensity, latestChroma.redGreen, latestChroma.blueYellow);
        const colorRiskClamped = clamp(colorRisk);
        const patternRisk = clamp(patternedStimulusScore);
        const nearStartFrac = THRESHOLDS.RISK_NEAR_START_FRAC; // Compute near-threshold scores for key signals (0..1).
        const intensityNear = nearScore(avgIntensity, nearStartFrac * THRESHOLDS.INTENSITY_HIGH, THRESHOLDS.INTENSITY_HIGH);
        const coverageNear = nearScore(coverage, nearStartFrac * THRESHOLDS.COVERAGE_HIGH, THRESHOLDS.COVERAGE_HIGH);
        const psiNear = nearScore(psiScore, nearStartFrac * THRESHOLDS.HIGH, THRESHOLDS.HIGH);
        const flashesNear = nearFlashesScore(maxFlashesIn1s);
        const flickerNear = flickerRisk ? hazardPeakScoreFromHz(flickerHz, THRESHOLDS.FLICKER_MIN, 18 /*peak*/, THRESHOLDS.FLICKER_MAX) : 0;
        const spatialNear = Math.max(intensityNear, coverageNear);

        const riskDebtAdd =
            0.40 * spatialNear +
            0.25 * psiNear +
            0.25 * flashesNear +
            0.10 * flickerNear;
        
        // DEBUG
        // console.log('Risk Debt before', riskDebt);

        // Update integrator with decay
        riskDebt = riskDebt * THRESHOLDS.RISK_DEBT_DECAY
            + (1 - THRESHOLDS.RISK_DEBT_DECAY) * clamp(riskDebtAdd, 0, 1);
        riskDebt = clamp(riskDebt, 0, 1);

        // DEBUG
        // console.log('Risk Debt after', riskDebt);

        const nData = nPlusHistory({ flashSequences, patternHistory, lastRedIntensity, prevRedIntensity });

        // Determine risk level based on thresholds
        let level = 'low';

        if (nData) {
            if (
                psiScore >= THRESHOLDS.HIGH ||
                // Only >3 flashes/second is a high risk; exactly 3 is allowed
                maxFlashesIn1s > THRESHOLDS.FLASHES_HIGH ||
                sequenceViolations > 0 || // Any sequence violation is high risk
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
                // Do not elevate on exactly 3 flashes/second
               // maxFlashesIn1s === THRESHOLDS.FLASHES_HIGH ||
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

        // Risk debt promotion equal tot sticky escalation logic
        // If sustained near-threshold exposure has accumulated, escalate
        if (riskDebt >= THRESHOLDS.RISK_DEBT_HIGH) {
            level = 'high';
        } else if (riskDebt >= THRESHOLDS.RISK_DEBT_MED) {
            if (level === 'low') level = 'medium';
        }
        // monotonic escalation across the session
        if (levelRank(level) > levelRank(highestRiskLevel)) {
            highestRiskLevel = level;
        }
        level = highestRiskLevel;

        return {
            level,
            maxFlashesIn1s,             // peak count in 1s (from ring buffer or fallback)
            sequenceViolations,         // >3 per 1s detections
            usedFlashStats,             // indicates ring-buffer stats were used
            avgIntensity,
            coverage,
            psiScore,
            chromatic: latestChroma,
            redIntensity,
            redDelta,
            flickerHz,
            patternedStimulusScore,
            riskDebt,
            flashCount: metrics.flashCount,
            frameCount: metrics.frameCount,
        };
    }
    // TASK 5771: Risk reset between videos for playlist vidoe playing
    function reset() {
        highestRiskLevel = 'low';
        riskDebt = 0;
    }

    window.RiskLevelHelper = {
        calculateRiskLevel,
        reset,
    };
})();