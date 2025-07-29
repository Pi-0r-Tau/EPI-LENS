/**
 * Avg intensity for valid flash sequences.
 * If `intensity` is not a number or is out of range [0,1] it is ignored.
 *@returns {number} The avg. intensity of valid flash sequences, or 0 if none are valid.
 */
window.AnalyzerHelpers = window.AnalyzerHelpers || {};
AnalyzerHelpers.avgIntensity = function () {
    const seq = this.metrics.flashSequences;
    const count = seq.length;
    if (count === 0) return 0;

    let sum = 0;
    let validCount = 0;

    for (let i = 0; i < count; i++) {
        let intensity = seq[i]?.intensity;
        if (
            typeof intensity === "number" &&
            !isNaN(intensity) &&
            intensity >= 0 &&
            intensity <= 1
        ) {
            sum += intensity;
            validCount++;
        }
    }

    return validCount > 0 ? sum / validCount : 0;
};
