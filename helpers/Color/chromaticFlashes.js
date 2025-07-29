
// Used for Youtube and user video files. So we fail fast and loud. While I trust users more than Youtube.
// If the data is corrupted, throw errors.
function validRGB(r, g, b, idx) {
    if (typeof r !== "number" || isNaN(r) || typeof g !== "number" || isNaN(g) || typeof b !== "number" || isNaN(b)
    ) {
        throw new Error(`Invalid RGB at index ${idx}: r=${r}, g=${g}, b=${b}`);
    }
}

window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.chromaticFlashes = function (
    imageData,
    historyLen = 10
) {
    if (!imageData?.data || !imageData.width || !imageData.height) {
        throw new Error("Invalid imageData");
    }
    const data = imageData.data;
    const len = data.length;
    const pixels = len >>> 2;
    let redGreenTotal = 0,
        blueYellowTotal = 0;
    let i = 0;
    for (; i <= len - 16; i += 16) {
        for (let k = 0; k < 16; k += 4) {
            let r = data[i + k],
                g = data[i + k + 1],
                b = data[i + k + 2];
            validRGB(r, g, b, i + k);
            redGreenTotal += Math.abs(r - g) / Math.sqrt(2);
            blueYellowTotal += Math.abs(b - (r + g) / 2) / Math.sqrt(6);
        }
    }
    for (; i < len; i += 4) {
        let r = data[i],
            g = data[i + 1],
            b = data[i + 2];
        validRGB(r, g, b, i);
        redGreenTotal += Math.abs(r - g) / Math.sqrt(2);
        blueYellowTotal += Math.abs(b - (r + g) / 2) / Math.sqrt(6);
    }

    const norm = pixels > 0 ? 1 / (pixels * 255) : 0;
    const result = {
        redGreen: redGreenTotal * norm,
        blueYellow: blueYellowTotal * norm,
    };

    const lastColors = this.advancedMetrics.chromaticFlashes.lastColors || [];
    lastColors.push(result);
    if (lastColors.length > historyLen) lastColors.shift();
    this.advancedMetrics.chromaticFlashes.lastColors = lastColors;

    // DEBUG
    // if (result.redGreen > 0.8 || result.blueYellow > 0.8) console.warn('High chromatic flash detected:', result);
    // if (result.redGreen < 0.1 && result.blueYellow < 0.1) console.warn('Low chromatic flash detected:', result);
    return result;
};
