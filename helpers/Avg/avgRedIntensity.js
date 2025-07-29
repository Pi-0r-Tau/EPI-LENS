/**
 * Avg red channel intensity via single pass.
 * @param {Uint8ClampedArray} data - RGBA pixel array.
 * @returns {number} Normalized [0,1] average red intensity.
 * @returns {number} 0 if data is invalid or empty.
 */
window.AnalyzerHelpers = window.AnalyzerHelpers || {};
AnalyzerHelpers.avgRedIntensity = function (data) {
    const len = data?.length || 0;
    if (len < 4) return 0;
    let redTotal = 0,
        i = 0;
    // Bitwise shift to quickly calculate pixel count
    const pixelCount = len >>> 2;

    // Unrolling to reduce loop iterations
    const max = len - (len % 32);
    for (; i < max; i += 32) {
        redTotal +=
            data[i] +
            data[i + 4] +
            data[i + 8] +
            data[i + 12] +
            data[i + 16] +
            data[i + 20] +
            data[i + 24] +
            data[i + 28];
    }
    // Handle remaining pixels
    for (; i < len; i += 4) {
        redTotal += data[i];
    }

    if (pixelCount === 0) return 0;

    // Normalize
    return redTotal / (pixelCount * 255);
};