window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.computeSpectralFlatness = function (spectrum) {
    if (!spectrum || spectrum.length === 0) return 0;

    // Convert to amplitude array if needed
    let amplitudes;
    if (Array.isArray(spectrum) && typeof spectrum[0] === "object") {
        amplitudes = new Float64Array(spectrum.length);
        for (let i = 0; i < spectrum.length; ++i)
            amplitudes[i] = spectrum[i].amplitude;
    } else {
        amplitudes = spectrum;
    }

    // Compute geometric and arithmetic means of positive amplitudes
    let nonZeroCount = 0, logSum = 0, arithSum = 0;
    for (let i = 0; i < amplitudes.length; ++i) {
        const a = amplitudes[i];
        if (a > 0) {
            logSum += Math.log(a);
            arithSum += a;
            ++nonZeroCount;
        }
    }
    if (!nonZeroCount) return 0; // All non-positive amplitudes

    const geoMean = Math.exp(logSum / nonZeroCount);
    const arithMean = arithSum / nonZeroCount;

    return arithMean === 0 ? 0 : geoMean / arithMean;
}
