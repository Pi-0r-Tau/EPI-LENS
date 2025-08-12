// Calls colorSpikes helper
// Refactor TASK 5772
window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.calculateColorVariance = function (imageData) {
    this.advancedMetrics = this.advancedMetrics || {};

    const defaultTemporal = {
        variance: { r: 0, g: 0, b: 0 },
        averageChange: { r: 0, g: 0, b: 0 },
    };
    const makeResult = (current, temporal, spikes) => ({
        current: current || { r: 0, g: 0, b: 0 },
        temporal: (temporal && temporal.variance) || { r: 0, g: 0, b: 0 },
        spikes: Array.isArray(spikes) ? spikes : [],
        averageChange: (temporal && temporal.averageChange) || { r: 0, g: 0, b: 0 },
    });

    if (!imageData || !imageData.data || imageData.data.length < 4) {
        return makeResult({ r: 0, g: 0, b: 0 }, defaultTemporal, []);
    }

    const data = imageData.data;
    const SAMPLE_SIZE = 1024;
    const pixelCount = data.length >>> 2;
    const rawLen = this.advancedMetrics.historyLength;
    const historyLen =
        typeof rawLen === "number" && rawLen > 1 ? Math.floor(rawLen) : 30;
    const stride = Math.max(1, Math.floor(pixelCount / SAMPLE_SIZE));

    let rTotal = 0,
        gSum = 0,
        bSum = 0;
    let rSum = 0,
        gSumSq = 0,
        bSumSq = 0;
    let sampleCount = 0;

    for (let i = 0; i < data.length; i += stride * 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Ignores outliers outside 0-255 (corrupted data)
        if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) continue;
        rTotal += r;
        rSum += r * r;
        gSum += g;
        gSumSq += g * g;
        bSum += b;
        bSumSq += b * b;
        sampleCount++;
    }

    if (sampleCount === 0) {
        return makeResult({ r: 0, g: 0, b: 0 }, defaultTemporal, []);
    }

    const invN = 1 / sampleCount;
    const rMean = rTotal * invN,
        gMean = gSum * invN,
        bMean = bSum * invN;

    const rVar = Math.max(0, rSum * invN - rMean * rMean);
    const gVar = Math.max(0, gSumSq * invN - gMean * gMean);
    const bVar = Math.max(0, bSumSq * invN - bMean * bMean);

    const norm = 1 / 255;
    const currentVariance = {
        r: Math.sqrt(rVar) * norm,
        g: Math.sqrt(gVar) * norm,
        b: Math.sqrt(bVar) * norm,
    };

    // Preserve history on resize
    this.advancedMetrics.colorHistory = this.advancedMetrics.colorHistory || {};
    const ch = this.advancedMetrics.colorHistory;

    if (!ch._ring || !ch._ring.r || ch._ring.r.length !== historyLen) {
        const old = ch._ring;
        const newRing = {
            r: new Float32Array(historyLen),
            g: new Float32Array(historyLen),
            b: new Float32Array(historyLen),
            idx: 0,
            count: 0,
        };

        if (old && old.r && old.g && old.b) {
            const oldLen = old.r.length;
            const available = Math.min(old.count || 0, oldLen);
            const copyCount = Math.min(available, historyLen);
            for (let i = 0; i < copyCount; i++) {
                const srcIdx = (old.idx - copyCount + i + oldLen) % oldLen;
                newRing.r[i] = old.r[srcIdx];
                newRing.g[i] = old.g[srcIdx];
                newRing.b[i] = old.b[srcIdx];
            }
            newRing.idx = copyCount % historyLen;
            newRing.count = copyCount;
        }

        ch._ring = newRing;
    }

    const ring = ch._ring;
    ring.r[ring.idx] = rMean;
    ring.g[ring.idx] = gMean;
    ring.b[ring.idx] = bMean;
    ring.idx = (ring.idx + 1) % ring.r.length;
    if (ring.count < ring.r.length) ring.count++;

    // Create proper arrays from ring buffer for temporal analysis, fixes issue with correct historical data for variance calculation
    // build reverse-chronological arrays 0 = newest
    if (ring.count > 0) {
        const rHistory = new Float32Array(ring.count);
        const gHistory = new Float32Array(ring.count);
        const bHistory = new Float32Array(ring.count);

        for (let i = 0; i < ring.count; i++) {
            // Calculate index in the ring buffer
            const idx = (ring.idx - 1 - i + ring.r.length) % ring.r.length;
            rHistory[i] = ring.r[idx];
            gHistory[i] = ring.g[idx];
            bHistory[i] = ring.b[idx];
        }

        ch.r = Array.from(rHistory);
        ch.g = Array.from(gHistory);
        ch.b = Array.from(bHistory);
    } else {
        ch.r = [];
        ch.g = [];
        ch.b = [];
    }

    const temporalAnalysis =
        typeof window.AnalyzerHelpers.colorHistory === "function"
            ? window.AnalyzerHelpers.colorHistory.call(this)
            : defaultTemporal;

    // spike detection using per-frame mean changes, normalized 0..1
    let spikes = [];
    if (typeof window.AnalyzerHelpers.colorSpikes === "function") {
        const changes = { r: [], g: [], b: [] };
        const hr = ch.r || [],
            hg = ch.g || [],
            hb = ch.b || [];

        for (let i = 0; i + 1 < hr.length; i++)
            changes.r.push(Math.abs(hr[i] - hr[i + 1]) * norm);
        for (let i = 0; i + 1 < hg.length; i++)
            changes.g.push(Math.abs(hg[i] - hg[i + 1]) * norm);
        for (let i = 0; i + 1 < hb.length; i++)
            changes.b.push(Math.abs(hb[i] - hb[i + 1]) * norm);

        spikes = window.AnalyzerHelpers.colorSpikes(changes) || [];
    }

    return makeResult(currentVariance, temporalAnalysis, spikes);
};
