
/**
 * Est. flicker freq in Hz via analyzing time differences between significant brightness changes
 * Analyzer.js threshold for brightnessChange is 0.1
 * Flicker freq from brightness change peaks, via median time between peaks.
 */
window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.estFlickerFrequency = function () {
    const changes = this.advancedMetrics.temporalChanges;
    const n = changes.length;
    if (n < 2) return 0;

    const diffs = [];
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
                    diffs.push(diff);
                }
            }
            prevTimestamp = entry.timestamp;
        }
    }

    if (diffs.length === 0) return 0;
    // TASK 1940: Median rather than mean, median is less sensitive to abrupt changes or time issues
    // Quick median via sorting, as diffs should be small
    const sorted = diffs.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianDiff = sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;

    const frequency = medianDiff > 0 ? Math.min(1000 / medianDiff, 100) : 0;

    // if (frequency > 3) console.warn('Flicker detected:', frequency, 'Hz');

    return frequency;
};