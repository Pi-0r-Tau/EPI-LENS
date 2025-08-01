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
        const arr = Array.isArray(changes[channel]) ? changes[channel] : [];
        if (arr.length < 2) continue;

        let sum = 0, count = 0;
        for (let i = 0; i < arr.length; i++) {
            const v = arr[i];
            if (typeof v === "number" && !isNaN(v)) {
                sum += v;
                count++;
            }
        }
        if (count < 2) continue;
        const mean = sum / count;

        let sqDiffSum = 0;
        for (let i = 0; i < arr.length; i++) {
            const v = arr[i];
            if (typeof v === "number" && !isNaN(v)) {
                sqDiffSum += (v - mean) * (v - mean);
            }
        }
        const stdDev = Math.sqrt(sqDiffSum / count);
        const spikeThreshold = mean + stdDevMultiplier * stdDev;

        for (let i = 0; i < arr.length; i++) {
            const change = arr[i];
            if (
                typeof change === "number" &&
                !isNaN(change) &&
                change > spikeThreshold &&
                change > fixedThreshold
            ) {
                spikes.push({ channel, frameIndex: i, magnitude: change });
            }
        }
    }
    // DEBUG
    // if (spikes.length) console.warn('Color spikes detected:', spikes);
    // if (spikes.length > 100) {
    //     console.log('Thats alot of spikes:', spikes.length);
    // }
    return spikes;
};