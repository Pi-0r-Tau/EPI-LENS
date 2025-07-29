window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.edgeChange = function (window = 2) {
    const hist = this.advancedMetrics?.edgeDetection?.history;
    if (!Array.isArray(hist) || hist.length < window) return 0;

    let change = 0;
    for (let i = 1; i < window; i++) {
        const a =
            typeof hist[hist.length - i] === "number" &&
                isFinite(hist[hist.length - i])
                ? hist[hist.length - i]
                : 0;
        const b =
            typeof hist[hist.length - i - 1] === "number" &&
                isFinite(hist[hist.length - i - 1])
                ? hist[hist.length - i - 1]
                : 0;
        change += Math.abs(a - b);
    }

    const edgeChange = window > 1 ? change / (window - 1) : change;

    // if (edgeChange > 0.2) console.warn('High edge change detected:', edgeChange);

    return edgeChange;
};
