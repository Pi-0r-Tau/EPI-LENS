// Called by colorVar
// Refactor TASK 5772: 
// Updated to use Welfords method, allowing for a single pass approach previous was mean then variance two pass
window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.colorSpikes = function (
    changes,
    fixedThreshold = 0.2,
    stdDevMultiplier = 2
) {
    const spikes = [];
    const channels = ["r", "g", "b"];
    for (let c = 0; c < channels.length; c++) {
        const channel = channels[c];
        const arr =
            changes && Array.isArray(changes[channel]) ? changes[channel] : [];
        const len = arr.length;
        if (len < 2) continue;
        let mean = 0;
        let m2 = 0;
        let count = 0;

        for (let i = 0; i < len; i++) {
            const v = arr[i];
            if (typeof v !== "number" || !Number.isFinite(v)) continue;
            count++;
            const delta = v - mean;
            mean += delta / count;
            m2 += delta * (v - mean);
        }
        if (count < 2) continue;

        let variance = m2 / count; // population variance
        if (variance < 0) variance = 0; // guard against tiny FP rounding negatives
        const stdDev = Math.sqrt(variance);
        const threshold = mean + stdDevMultiplier * stdDev;

        // Detect spikes
        for (let i = 0; i < len; i++) {
            const change = arr[i];
            if (typeof change !== "number" || !Number.isFinite(change)) continue;
            if (change > fixedThreshold && change > threshold) {
                spikes.push({ channel, frameIndex: i, magnitude: change });
            }
        }
    }

    // if (spikes.length) console.warn('Color spikes detected:', spikes);
    // if (spikes.length > 100) console.log('Thats alot of spikes:', spikes.length);

    return spikes;
};