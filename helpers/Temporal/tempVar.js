window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.temporalVariance = function (values) {
    if (!Array.isArray(values) || values.length < 2) return 0;

    let sum = 0,
        count = 0;
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (typeof v === "number" && !isNaN(v)) {
            sum += v;
            count++;
        }
    }
    if (count < 2) return 0;
    const mean = sum / count;

    let sqDiffSum = 0;
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (typeof v === "number" && !isNaN(v)) {
            sqDiffSum += (v - mean) * (v - mean);
        }
    }
    const variance = sqDiffSum / count;

    // The division by 255 caused values that were 0 basically only allowing [0,255]
    // Only normalize if the input values are in the 0-255 range so allows [0,1] or [0,255]
    const maxValue = Math.max(
        ...values.filter((v) => typeof v === "number" && !isNaN(v))
    );
    const normalizationFactor = maxValue > 1 ? 255 : 1;

    return Math.sqrt(variance) / normalizationFactor;
};
