window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.frameHistogramDiff = function (data1, data2) {
    if (!data1 || !data2 || data1.length !== data2.length) return 0;


    const bins = 32; // Sweet spot, less bins = less sensitivity, more bins = more noise.
    // Unint32Array as in testing csv results were all zero, this change has seemed to fix it
    const hist1 = new Uint32Array(bins),
        hist2 = new Uint32Array(bins);
    const rWeight = 0.2126,
        gWeight = 0.7152,
        bWeight = 0.0722; // sRGB luminance
    const binSize = 256 / bins;

    // Linear luminance is closer to human vision, Harding FPA and PEAT use it so why not.
    function srgb2linear(v) {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }

    for (let i = 0; i < data1.length; i += 4) {
        // Skip if both pixels are fully transparent, reduce computation and it's pretty pointless to skew results for pixels that I can't even see.
        if (data1[i + 3] === 0 && data2[i + 3] === 0) continue;

        // Calculate luminance for each pixel
        const lum1 =
            srgb2linear(data1[i]) * rWeight +
            srgb2linear(data1[i + 1]) * gWeight +
            srgb2linear(data1[i + 2]) * bWeight;
        const lum2 =
            srgb2linear(data2[i]) * rWeight +
            srgb2linear(data2[i + 1]) * gWeight +
            srgb2linear(data2[i + 2]) * bWeight;

        const v1 = Math.floor(lum1 * 255);
        const v2 = Math.floor(lum2 * 255);
        hist1[Math.min(bins - 1, Math.floor(v1 / binSize))]++;
        hist2[Math.min(bins - 1, Math.floor(v2 / binSize))]++;
    }

    let diff = 0,
        total = 0;
    for (let i = 0; i < bins; ++i) {
        const binDiff = Math.abs(hist1[i] - hist2[i]);
        // Ignore tiny changes
        if (binDiff < 1) continue;
        diff += binDiff;
        total += hist1[i] + hist2[i];
    }
    return total ? diff / total : 0;
};
