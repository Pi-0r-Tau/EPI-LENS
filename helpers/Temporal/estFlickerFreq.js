
/**
 * Est. flicker freq in Hz via analyzing time differences between significant brightness changes
 */
window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.estFlickerFrequency = function () {
    const changes = this.advancedMetrics.temporalChanges;
    const n = changes.length;
    if (n < 2) return 0;

    let sumDiff = 0,
        count = 0;
    let prevTimestamp = null;

    for (let i = 0; i < n; i++) {
        const entry = changes[i];
        if (
            entry &&
            typeof entry.brightness === "number" &&
            typeof entry.change === "number" &&
            typeof entry.timestamp === "number" &&
            !isNaN(entry.timestamp) &&
            entry.change > this.thresholds.brightnessChange
        ) {
            if (prevTimestamp !== null) {
                const diff = entry.timestamp - prevTimestamp;
                if (diff > 0 && diff < 10000) {
                    sumDiff += diff;
                    count++;
                }
            }
            prevTimestamp = entry.timestamp;
        }
    }

    if (count === 0 || sumDiff === 0) return 0;
    const avgTimeDiff = sumDiff / count;

    const frequency = avgTimeDiff > 0 ? Math.min(1000 / avgTimeDiff, 100) : 0;

    // if (frequency > 3) console.warn('Flicker detected:', frequency, 'Hz');

    return frequency;
};