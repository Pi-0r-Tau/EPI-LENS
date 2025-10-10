window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.detectEdges = function (
    imageData,
    sobelThreshold = 50,
    maxHistory = 500
) {
    if (!imageData?.data || !imageData.width || !imageData.height) {
        return {
            edgeDensity: 0,
            edgeCount: 0,
            temporalEdgeChange: 0,
            edgeMap: null,
        };
    }

    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const gray = new Float32Array(width * height);

    // LUT for sRGB to linear ( 0 - 255 range) as sobel is in the same range
    const lumi = window.AnalyzerHelpers.luminance255;

    // Grayscale conversion (sRGB luminance weights)
    for (let i = 0, j = 0; i < data.length; i += 4, j++)
        gray[j] = lumi(data, i);

    let edgeCount = 0;
    const edgeMap = new Uint8Array(width * height); // Binary edge mask

    // Sobel edge detection
    for (let y = 1; y < height - 1; ++y) {
        let yw = y * width,
            ym1w = (y - 1) * width,
            yp1w = (y + 1) * width;
        for (let x = 1; x < width - 1; ++x) {
            let gx =
                -gray[ym1w + (x - 1)] -
                2 * gray[yw + (x - 1)] -
                gray[yp1w + (x - 1)] +
                gray[ym1w + (x + 1)] +
                2 * gray[yw + (x + 1)] +
                gray[yp1w + (x + 1)];
            let gy =
                -gray[ym1w + (x - 1)] -
                2 * gray[ym1w + x] -
                gray[ym1w + (x + 1)] +
                gray[yp1w + (x - 1)] +
                2 * gray[yp1w + x] +
                gray[yp1w + (x + 1)];
            let mag = Math.hypot(gx, gy);

            if (mag > sobelThreshold) {
                edgeCount++;
                edgeMap[yw + x] = 255; // Mark edge pixel
            }
        }
    }

    const validPixels = (width - 2) * (height - 2);
    const edgeDensity = validPixels > 0 ? edgeCount / validPixels : 0;

    const hist = this.advancedMetrics.edgeDetection.history;
    hist.push(edgeDensity);
    if (hist.length > maxHistory) hist.shift();

    // if (edgeDensity > 0.3) console.warn('High edge density detected:', edgeDensity);

    return {
        edgeDensity,
        edgeCount,
        temporalEdgeChange: window.AnalyzerHelpers.edgeChange.call(this),
        edgeMap,
    };
};
