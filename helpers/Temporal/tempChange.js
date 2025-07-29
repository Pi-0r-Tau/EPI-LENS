window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.temporalChange = function (
    currentBrightness,
    maxHistory = 1000
) {
    if (
        typeof currentBrightness !== "number" ||
        isNaN(currentBrightness) ||
        currentBrightness < 0 ||
        currentBrightness > 1
    )
        currentBrightness = 0;

    const changes = this.advancedMetrics.temporalChanges;
    let change = 0;

    if (changes.length > 0) {
        const last = changes[changes.length - 1];
        if (typeof last.brightness === "number" && !isNaN(last.brightness)) {
            change = Math.abs(currentBrightness - last.brightness);
        }
    }

    changes.push({
        timestamp: Date.now(),
        brightness: currentBrightness,
        change,
    });

    if (changes.length > maxHistory) changes.shift();

    // if (change > 0.5) console.warn('Sudden brightness spike detected:', change);

    return change;
};
