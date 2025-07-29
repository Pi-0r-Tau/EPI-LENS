window.AnalyzerHelpers = window.AnalyzerHelpers || {};
AnalyzerHelpers.coverage = function (imageData, brightnessThreshold = 0.5) {
    if (!imageData?.data || imageData.data.length < 4) return 0;

    const data = imageData.data;
    const pixelCount = data.length >>> 2;
    let brightPixels = 0;

    // BT.709 perceptual weights for sRGB
    const R_COEF = 0.2126,
        G_COEF = 0.7152,
        B_COEF = 0.0722;

    let i = 0;
    const max = data.length - (data.length % 16);
    for (; i < max; i += 16) {
        // Pixel 1
        if (
            (data[i] * R_COEF + data[i + 1] * G_COEF + data[i + 2] * B_COEF) / 255 >
            brightnessThreshold
        )
            brightPixels++;
        // Pixel 2
        if (
            (data[i + 4] * R_COEF + data[i + 5] * G_COEF + data[i + 6] * B_COEF) /
            255 >
            brightnessThreshold
        )
            brightPixels++;
        // Pixel 3
        if (
            (data[i + 8] * R_COEF + data[i + 9] * G_COEF + data[i + 10] * B_COEF) /
            255 >
            brightnessThreshold
        )
            brightPixels++;
        // Pixel 4
        if (
            (data[i + 12] * R_COEF + data[i + 13] * G_COEF + data[i + 14] * B_COEF) /
            255 >
            brightnessThreshold
        )
            brightPixels++;
    }
    for (; i < data.length; i += 4) {
        if (
            (data[i] * R_COEF + data[i + 1] * G_COEF + data[i + 2] * B_COEF) / 255 >
            brightnessThreshold
        )
            brightPixels++;
    }

    return pixelCount ? brightPixels / pixelCount : 0;
};
