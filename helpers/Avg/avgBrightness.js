/**
 * Avg brightness (luminance) of RGBA pixel data using BT.709 coefficients.
 * @param {Uint8ClampedArray} data - RGBA pixel array.
 * @returns {number} Normalized [0,1] avg. brightness.
 */
window.AnalyzerHelpers = window.AnalyzerHelpers || {};
AnalyzerHelpers.avgBrightness = function (data) {
    const len = data.length;
    if (len < 4) return 0;

    // BT.709 coefficients for luminance
    const R_COEF = 0.2126,
        G_COEF = 0.7152,
        B_COEF = 0.0722;

    let luminanceSum = 0,
        i = 0;
    const pixelCount = len >>> 2;

    const max = len - (len % 32);
    for (; i < max; i += 32) {
        // Loop is unrolled to reduce loop interations
        // Each iteration processes 8 pixels (32 bytes)
        luminanceSum +=
            data[i] * R_COEF +
            data[i + 1] * G_COEF +
            data[i + 2] * B_COEF +
            data[i + 4] * R_COEF +
            data[i + 5] * G_COEF +
            data[i + 6] * B_COEF +
            data[i + 8] * R_COEF +
            data[i + 9] * G_COEF +
            data[i + 10] * B_COEF +
            data[i + 12] * R_COEF +
            data[i + 13] * G_COEF +
            data[i + 14] * B_COEF +
            data[i + 16] * R_COEF +
            data[i + 17] * G_COEF +
            data[i + 18] * B_COEF +
            data[i + 20] * R_COEF +
            data[i + 21] * G_COEF +
            data[i + 22] * B_COEF +
            data[i + 24] * R_COEF +
            data[i + 25] * G_COEF +
            data[i + 26] * B_COEF +
            data[i + 28] * R_COEF +
            data[i + 29] * G_COEF +
            data[i + 30] * B_COEF;
    }

    for (; i < len; i += 4) {
        luminanceSum +=
            data[i] * R_COEF + data[i + 1] * G_COEF + data[i + 2] * B_COEF;
    }

    return luminanceSum / (pixelCount * 255);
};
