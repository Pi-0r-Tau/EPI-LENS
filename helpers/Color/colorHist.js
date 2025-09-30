window.AnalyzerHelpers = window.AnalyzerHelpers || {};
/**
 * Analyzes color history and returns variance, spikes and, AVG change for RGB channels
 * @returns {{
 *   variance: { r: number, g: number, b: number },
 *   spikes: Array<any>,
 *   averageChange: { r: number, g: number, b: number }
 * }}
 */
window.AnalyzerHelpers.colorHistory = function () {
    const history = this.advancedMetrics.colorHistory;
    const n = Math.min(history.r.length, history.g.length, history.b.length);

    if (n < 2) {
        return {
            variance: { r: 0, g: 0, b: 0 },
            spikes: [],
            averageChange: { r: 0, g: 0, b: 0 },
        };
    }

    const variance = { r: 0, g: 0, b: 0 };
    ["r", "g", "b"].forEach((ch) => {
        variance[ch] = window.AnalyzerHelpers.temporalVariance(history[ch].slice(0, n));
    });

    const changes = { r: [], g: [], b: [] };
    for (let i = 1; i < n; i++) {
        ["r", "g", "b"].forEach((ch) => {
            const prev = history[ch][i - 1];
            const curr = history[ch][i];
            changes[ch].push(Math.abs(curr - prev));

        });
    }

    const spikes = window.AnalyzerHelpers.colorSpikes(changes);

    const averageChange = { r: 0, g: 0, b: 0 };
    ["r", "g", "b"].forEach((ch) => {
        const arr = changes[ch];
        if (arr.length > 0) {
            let total = 0;
            for (let i = 0; i < arr.length; i++) {
                total += arr[i];
            }
            averageChange[ch] = total / arr.length;
        }
    });
    return {
        variance,
        spikes,
        averageChange,
    };
};
