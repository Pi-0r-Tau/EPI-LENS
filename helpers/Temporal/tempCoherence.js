window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.temporalCoherence = function (
    brightness,
    windowSize = 30,
    maxLag = 10
) {
    brightness =
        typeof brightness === "number" &&
            brightness >= 0 &&
            brightness <= 1 &&
            !isNaN(brightness)
            ? brightness
            : 0;

    // Init buffer and metrics
    const tc = this.advancedMetrics.temporalCoherence;
    if (!tc._ring || tc._ring.buffer.length !== windowSize) {
        tc._ring = {
            buffer: new Float32Array(windowSize),
            idx: 0,
            count: 0,
        };
        tc.coherenceHistory = [];
    }
    const ring = tc._ring;

    // Store brightness in ring buffer
    ring.buffer[ring.idx] = brightness;
    ring.idx = (ring.idx + 1) % windowSize;
    if (ring.count < windowSize) ring.count++;

    // Early exit for buffer < 2
    const len = ring.count;
    if (len < 2)
        return {
            coherenceScore: 0,
            periodicity: { isPeriodic: false, period: 0, confidence: 0 },
            lags: [],
        };

    const validBuffer = [];
    for (let i = 0; i < len; i++) {
        const v = ring.buffer[i];
        validBuffer.push(typeof v === "number" && isFinite(v) ? v : 0);
    }

    const mean = validBuffer.reduce((a, b) => a + b, 0) / len;
    const variance =
        validBuffer.reduce((a, b) => a + (b - mean) * (b - mean), 0) / len || 1e-8;

    let coherence = 0;
    const lags = [];
    const usedMaxLag = Math.min(maxLag, len - 1);
    for (let lag = 1; lag <= usedMaxLag; lag++) {
        let corr = 0;
        let n = len - lag;
        for (let i = 0; i < n; i++) {
            corr += (validBuffer[i] - mean) * (validBuffer[i + lag] - mean);
        }
        corr = corr / (n * variance);
        coherence += Math.abs(corr);
        lags.push({ lag, correlation: corr });
    }
    const coherenceScore = usedMaxLag > 0 ? coherence / usedMaxLag : 0;

    let periodicity = { isPeriodic: false, period: 0, confidence: 0 };
    if (typeof this.detectPeriodicity === "function") {
        periodicity = this.detectPeriodicity(validBuffer);
    }

    tc.coherenceHistory = tc.coherenceHistory || [];
    tc.coherenceHistory.push({
        timestamp: Date.now(),
        coherenceScore,
        periodicity,
        buffer: [...validBuffer],
    });
    if (tc.coherenceHistory.length > 1000) tc.coherenceHistory.shift();

    // if (coherenceScore > 0.7) console.warn('High temporal coherence detected:', coherenceScore);

    return {
        coherenceScore,
        periodicity,
        lags,
    };
};