window.AnalyzerHelpers = window.AnalyzerHelpers || {};
// LBW is look back window, was Window before but that was confusing with browser windows
window.AnalyzerHelpers.edgeChange = function (LBW = 2) {
  const hist = this.advancedMetrics?.edgeDetection?.history;
  if (!Array.isArray(hist) || hist.length < LBW) return 0;

  let change = 0;
  for (let i = 1; i < LBW; i++) {
    const a = hist[hist.length - i];
    const b = hist[hist.length - i - 1];
    change += Math.abs(a - b);
  }

    const edgeChange = LBW > 1 ? change / (LBW - 1) : change;

    // if (edgeChange > 0.2) console.warn('High edge change detected:', edgeChange);

    return edgeChange;
};
