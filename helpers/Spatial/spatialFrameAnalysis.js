window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.sobelEdgeMap = function (gray, width, height) {
    if (!gray || gray.length !== width * height)
        throw new Error('Input buffer size does not match canvas size');

    const edge = new Float32Array(width * height);
    for (let y = 1; y < height - 1; ++y) {
        const rowOffset = y * width;
        const prevRowOffset = rowOffset - width;
        const nextRowOffset = rowOffset + width;
        for (let x = 1; x < width - 1; ++x) {
            const center = rowOffset + x;
            const tl = gray[prevRowOffset + x - 1];
            const tc = gray[prevRowOffset + x];
            const tr = gray[prevRowOffset + x + 1];
            const ml = gray[rowOffset + x - 1];
            const mr = gray[rowOffset + x + 1];
            const bl = gray[nextRowOffset + x - 1];
            const bc = gray[nextRowOffset + x];
            const br = gray[nextRowOffset + x + 1];
            // Sobel X/Y gradients
            const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
            const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
            edge[center] = Math.hypot(gx, gy);
        }
    }
    // Borders remain zero
    return edge;
}

window.AnalyzerHelpers.detectPatternedStimulus = function (imageData) {
    if (!imageData || !imageData.data) return 0;
    const width = imageData.width, height = imageData.height;
    const data = imageData.data;
    const pixelCount = width * height;
    const lumi = window.AnalyzerHelpers.luminance;

    // LUT based gamma corrected luminance
    const gray = new Float32Array(pixelCount);
        for (let i = 0, j = 0; i < data.length; i += 4, j++)
            gray[j] = lumi(data, i);

    const blockSize = 8;
    const blocksY = Math.ceil(height / blockSize);
    const blocksX = Math.ceil(width / blockSize);
    const blockCount = blocksX * blocksY;
    const blockScores = new Float32Array(blockCount);
    let totalContrast = 0, blockIdx = 0;
    for (let by = 0; by < height; by += blockSize) {
        const yEnd = Math.min(by + blockSize, height);
        for (let bx = 0; bx < width; bx += blockSize) {
            const xEnd = Math.min(bx + blockSize, width);
            let count = 0, mean = 0, M2 = 0;
            for (let y = by; y < yEnd; y++) {
                const rowOffset = y * width;
                for (let x = bx; x < xEnd; x++) {
                    count++;
                    const val = gray[rowOffset + x];
                    const delta = val - mean;
                    mean += delta / count;
                    const delta2 = val - mean;
                    M2 += delta * delta2;
                }
            }
            const variance = count > 1 ? M2 / count : 0; // Treats each block of pixels as a population
            // Normalize to max std dev for 0 - 1 range
            // Gray values are via luminance.js which returns 0-1 floating point values so 0.5 not 127.5 for std dev normalization
            blockScores[blockIdx++] = Math.sqrt(variance) / 0.5;
            totalContrast += blockScores[blockIdx - 1];
        }
    }
    const avgBlockContrast = blockCount ? totalContrast / blockCount : 0;
    // namespace ref to window from this
    const edge = window.AnalyzerHelpers.sobelEdgeMap(gray, width, height);
    const edgeRowSum = new Float32Array(height);
    let totalEdge = 0;
    for (let y = 0; y < height; y++) {
        let sum = 0, rowOffset = y * width;
        for (let x = 0; x < width; x++) sum += edge[rowOffset + x];
        edgeRowSum[y] = sum;
        totalEdge += sum;
    }
    const meanEdge = totalEdge / height;

    // Autocorrelation for periodicity
    let maxCorr = 0;
    // Detects spatial patterns with a period of at least 2 pixels and up to 20 or height/2 pixels
    const maxLag = Math.min(20, height >> 1);
    const diffFromMean = new Float32Array(height);
    for (let i = 0; i < height; i++) diffFromMean[i] = edgeRowSum[i] - meanEdge;
    for (let lag = 2; lag < maxLag; lag++) {
        let corr = 0, limit = height - lag;
        for (let i = 0; i < limit; i++)
            corr += diffFromMean[i] * diffFromMean[i + lag];
        corr /= limit;
        maxCorr = Math.max(maxCorr, corr);
    }
    // Periodicity score
    let absSum = 0;
    for (let i = 0; i < height; i++) absSum += Math.abs(diffFromMean[i]);
    const periodicityScore = absSum > 1e-6 ?
        Math.min(maxCorr / (absSum / height + 1e-6), 1) : 0;

    // Composite score for PSE risk factor
    const score = Math.max(0, Math.min(0.5 * avgBlockContrast + 0.5 * periodicityScore, 1));
    return score;
}