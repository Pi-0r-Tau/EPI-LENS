window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.periodicity = function (
    signal,
    minLag = 2,
    threshold = 0.5
) {
    if (!Array.isArray(signal) || signal.length < minLag + 2) {
        return { isPeriodic: false, period: 0, confidence: 0, autocorr: [] };
    }
    const len = signal.length;
    const clean = signal.map((v) =>
        typeof v === "number" && isFinite(v) ? v : 0
    );
    const mean = clean.reduce((a, b) => a + b, 0) / len;

    const autocorr = [];
    for (let lag = minLag; lag < Math.floor(len / 2); lag++) {
        let corr = 0,
            normA = 0,
            normB = 0;
        for (let i = 0; i < len - lag; i++) {
            const a = clean[i] - mean;
            const b = clean[i + lag] - mean;
            corr += a * b;
            normA += a * a;
            normB += b * b;
        }
        const norm = Math.sqrt(normA * normB);
        autocorr[lag] = norm > 0 ? corr / norm : 0;
    }

    // Find max peak (excluding lag=0)
    let maxVal = -Infinity,
        maxLag = minLag;
    for (let lag = minLag + 1; lag < autocorr.length - 1; lag++) {
        if (
            autocorr[lag] > autocorr[lag - 1] &&
            autocorr[lag] > autocorr[lag + 1]
        ) {
            if (autocorr[lag] > maxVal) {
                maxVal = autocorr[lag];
                maxLag = lag;
            }
        }
    }

    const isPeriodic = maxVal > threshold;

    // if (isPeriodic) console.warn('Periodicity detected:', { period: maxLag, confidence: maxVal });

    return {
        isPeriodic,
        period: isPeriodic ? maxLag : 0,
        confidence: isPeriodic ? maxVal : 0,
        autocorr,
    };
};
