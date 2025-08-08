
// Used for Youtube and user video files. So we fail fast and loud. While I trust users more than Youtube.
// If the data is corrupted, throw errors.
function validRGB(r, g, b, idx) { // Not the best method but it is safe
    if (typeof r !== "number" || isNaN(r) || typeof g !== "number" || isNaN(g) || typeof b !== "number" || isNaN(b)
    ) {
        throw new Error(`Invalid RGB at index ${idx}: r=${r}, g=${g}, b=${b}`);
    }
}
// TASK 3302: Rejig for ease of future updates

window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.chromaticFlashes = function (
    imageData,
    historyLen = 10
) {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) { // Cleaner er
        throw new Error("Invalid imageData");
    }
    const data = imageData.data;
    const len = data.length;
    const pixels = len >>> 2;

    // If empty return early
    if (pixels === 0) {
        const result = { redGreen: 0, blueYellow: 0 };
        window.AnalyzerHelpers._updateHistory(result, historyLen);
        return result;
    }
    let redGreenTotal = 0;
    let blueYellowTotal = 0;
    let visPixels = 0;

    // Outside of loop, really do not need to calculate these every time.. ahhh
    const sqrt2 = Math.sqrt(2);
    const sqrt6 = Math.sqrt(6);

    // Step through pixels
    for (let i = 0; i < len; i += 4) {
        // skip alpha (transparent) pixels
        const alpha = data[i + 3];
        if (alpha === 0) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        validRGB(r, g, b, i);
        const rgDiff = Math.abs(r - g);
        const byDiff = Math.abs(b - (r + g) / 2);

        redGreenTotal += rgDiff / sqrt2;
        blueYellowTotal += byDiff / sqrt6;
        visPixels++;
    }

    // Normalize
    const norm = visPixels > 0 ? 1 / (visPixels * 255) : 0;
    const result = {
        redGreen: redGreenTotal * norm,
        blueYellow: blueYellowTotal * norm,
    };


    window.AnalyzerHelpers._updateHistory(result, historyLen);

    // DEBUG
    // if (result.redGreen > 0.8 || result.blueYellow > 0.8)
    //     console.warn('High chromatic flash detected:', result);

    return result;
};
// history shouldn't of been handled directly inline, so now its here. Less Jank.
window.AnalyzerHelpers._updateHistory = function (result, historyLen) {
    if (!window.AnalyzerHelpers.advancedMetrics) {
        window.AnalyzerHelpers.advancedMetrics = { chromaticFlashes: {} };
    }
    if (!window.AnalyzerHelpers.advancedMetrics.chromaticFlashes) {
        window.AnalyzerHelpers.advancedMetrics.chromaticFlashes = {};
    }

    let lastColors = window.AnalyzerHelpers.advancedMetrics.chromaticFlashes.lastColors;
    if (!Array.isArray(lastColors)) lastColors = [];
    lastColors.push(result);

    while (lastColors.length > historyLen) {
        lastColors.shift();
    }

    window.AnalyzerHelpers.advancedMetrics.chromaticFlashes.lastColors = lastColors;
};

window.AnalyzerHelpers.getChromaticHistory = function () {
    return (
        window.AnalyzerHelpers.advancedMetrics?.chromaticFlashes?.lastColors || []
    );
};