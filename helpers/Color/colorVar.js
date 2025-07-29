window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.calculateColorVariance = function (imageData) {
    if (!imageData?.data || imageData.data.length < 4)
        return { r: 0, g: 0, b: 0 };

    this.advancedMetrics = this.advancedMetrics || {};
    const historyLen = typeof this.advancedMetrics.historyLength === "number"
        ? this.advancedMetrics.historyLength
        : 30;

    const SAMPLE_SIZE = 1024;
    const data = imageData.data;
    const pixelCount = data.length >>> 2;
    const stride = Math.max(1, Math.floor(pixelCount / SAMPLE_SIZE));

    let rSum = 0,
        gSum = 0,
        bSum = 0;
    let rSumSq = 0,
        gSumSq = 0,
        bSumSq = 0;
    let sampleCount = 0;

    for (let i = 0; i < data.length; i += stride * 4, sampleCount++) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Ignores outliers outside 0-255 (corrupted data)
        if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) continue;
        rSum += r;
        rSumSq += r * r;
        gSum += g;
        gSumSq += g * g;
        bSum += b;
        bSumSq += b * b;
    }

    if (sampleCount === 0) return { r: 0, g: 0, b: 0 };

    const rMean = rSum / sampleCount,
        gMean = gSum / sampleCount,
        bMean = bSum / sampleCount;
    const rVar = Math.max(0, rSumSq / sampleCount - rMean * rMean);
    const gVar = Math.max(0, gSumSq / sampleCount - gMean * gMean);
    const bVar = Math.max(0, bSumSq / sampleCount - bMean * bMean);

    const currentVariance = {
        r: Math.sqrt(rVar) / 255,
        g: Math.sqrt(gVar) / 255,
        b: Math.sqrt(bVar) / 255,
    };

    // Ring buffer for temporal color history
    if (!this.advancedMetrics.colorHistory) {
        this.advancedMetrics.colorHistory = {};
    }
    if (!this.advancedMetrics.colorHistory._ring) {
        this.advancedMetrics.colorHistory._ring = {
            r: new Float32Array(historyLen).fill(0),
            g: new Float32Array(historyLen).fill(0),
            b: new Float32Array(historyLen).fill(0),
            idx: 0,
            count: 0,
        };
    }

    const ring = this.advancedMetrics.colorHistory._ring;
    ring.r[ring.idx] = rMean;
    ring.g[ring.idx] = gMean;
    ring.b[ring.idx] = bMean;
    ring.idx = (ring.idx + 1) % historyLen;
    if (ring.count < historyLen) ring.count++;

    // Create proper arrays from ring buffer for temporal analysis, fixes issue with correct historical data for variance calculation
    const rHistory = new Float32Array(ring.count);
    const gHistory = new Float32Array(ring.count);
    const bHistory = new Float32Array(ring.count);

    for (let i = 0; i < ring.count; i++) {
        // Calculate index in the ring buffer
        const idx = (ring.idx - 1 - i + historyLen) % historyLen;
        rHistory[i] = ring.r[idx];
        gHistory[i] = ring.g[idx];
        bHistory[i] = ring.b[idx];
    }

    // Store current color history for temporal analysis
    this.advancedMetrics.colorHistory.r = Array.from(rHistory);
    this.advancedMetrics.colorHistory.g = Array.from(gHistory);
    this.advancedMetrics.colorHistory.b = Array.from(bHistory);


    const temporalAnalysis = window.AnalyzerHelpers.colorHistory.call(this);

    return {
        current: currentVariance,
        temporal: temporalAnalysis.variance,
        spikes: temporalAnalysis.spikes,
        averageChange: temporalAnalysis.averageChange,
    };
};
