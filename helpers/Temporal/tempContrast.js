window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.temporalContrast = function (
    brightness,
    timestamp,
    bufferLen = 15
) {
    brightness =
        typeof brightness === "number" &&
            brightness >= 0 &&
            brightness <= 1 &&
            !isNaN(brightness)
            ? brightness
            : 0;
    timestamp =
        typeof timestamp === "number" && !isNaN(timestamp) ? timestamp : Date.now();

    const tc = this.advancedMetrics.temporalContrast;
    if (!tc._ring || tc._ring.brightness.length !== bufferLen) {
        tc._ring = {
            brightness: new Float32Array(bufferLen),
            timestamp: new Float64Array(bufferLen),
            idx: 0,
            count: 0,
        };
        tc.maxRate = 0;
    }
    const ring = tc._ring;

    // Store values in ring buffer
    ring.brightness[ring.idx] = brightness;
    ring.timestamp[ring.idx] = timestamp;
    ring.idx = (ring.idx + 1) % bufferLen;
    if (ring.count < bufferLen) ring.count++;

    let maxRate = 0;
    for (let i = 1; i < ring.count; i++) {
        const prevIdx = (ring.idx + i - ring.count) % bufferLen;
        const currIdx = (ring.idx + i - ring.count + 1) % bufferLen;
        const timeDiff = ring.timestamp[currIdx] - ring.timestamp[prevIdx];
        if (timeDiff > 0.001) {
            const rate =
                Math.abs(ring.brightness[currIdx] - ring.brightness[prevIdx]) /
                timeDiff;
            maxRate = Math.max(maxRate, Math.min(rate, 1000));
        }
    }

    tc.current = maxRate;
    tc.maxRate = Math.max(
        maxRate,
        typeof tc.maxRate === "number" ? tc.maxRate : 0
    );

    tc.history = [];
    for (let i = 0; i < ring.count; i++) {
        const idx = (ring.idx + i - ring.count) % bufferLen;
        tc.history.push({
            brightness: ring.brightness[idx],
            timestamp: ring.timestamp[idx],
        });
    }

    // if (maxRate > 0.5) console.warn('High temporal contrast detected:', maxRate);

    return {
        currentRate: maxRate,
        maxRate: tc.maxRate,
    };
};