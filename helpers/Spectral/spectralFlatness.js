window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.computeSpectralFlatness = function (
    spectrum,
    kMin,
    kMax
) {
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
    const len = amplitudes.length;
    // Clamp and default kMin/kMax to full range if not provided
    const start =
        typeof kMin === "number"
            ? Math.max(0, Math.min(len - 1, Math.floor(kMin)))
            : 0;
    const end =
        typeof kMax === "number"
            ? Math.max(start, Math.min(len - 1, Math.floor(kMax)))
            : len - 1;
    // S117.8:  Prev I log 'd the amplitudes directly, which yes filtered out zeros but only 
    // if a > 0. So nice crash and small panic happened in testing
    // Also I lost info via excluding near zero bins
    // So now, as testing has shown, noisy data with amplitude spikes near zero are not lost
    // Epilson scales with signal mag, but calculated via maxA so still deterministic
    // Compute max amplitude for epsilon calc
    let maxA = 0;
    for (let i = start; i <= end; ++i) {
        const a = amplitudes[i];
        if (a > maxA) maxA = a;
    }
    const eps = Math.max(1e-20, 1e-12 * maxA * maxA);

    const count = end - start + 1;
    if (count <= 0) return 0;

    let logSum = 0, arithSum = 0;
    for (let i = start; i <= end; ++i) {
        const p = amplitudes[i] * amplitudes[i];
        logSum += Math.log(p + eps);
        arithSum += p;
    }

    const geoMean = Math.exp(logSum / count);
    const arithMean = arithSum / count;
    return arithMean === 0 ? 0 : geoMean / arithMean;
};
