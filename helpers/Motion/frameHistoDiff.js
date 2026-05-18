window.AnalyzerHelpers = window.AnalyzerHelpers || {};
// 229.1.O
// So in generated tests/ benchmark-helpers.js this was flagged as pretty poor:
// with 0.85ms median for 57,600px and 2.38 ms for 129,600 px 
// redid testing:
// 1280x720 @25% : Median of 0.523ms
// Avg to 0.662ms
// 1920X1080 @25: Median of 1.182ms
// Avg to 1.584ms
// Nicely pushed simulated_30fps_loop 30 frames from Avg of 34.14ms to 27.86ms, with median of 30.77ms to 25.62ms and also ops per second from 28 to roughly 36

let _histR, _histG, _histB;

window.AnalyzerHelpers.frameHistogramDiff = function (data1, data2) {
    if (!data1 || !data2 || data1.length !== data2.length) return 0;

    const bins = 32; // Sweet spot, less bins = less sensitivity, more bins = more noise.
    // Unint32Array as in testing csv results were all zero, this change has seemed to fix it
    const hist1 = new Uint32Array(bins),
        hist2 = new Uint32Array(bins);
    if (!_histR) {
        // cache the LUT-based histograms
        const LUT = window.AnalyzerHelpers.sRGB_TO_LINEAR_LUT;
        _histR = new Float64Array(256);
        _histG = new Float64Array(256);
        _histB = new Float64Array(256);
        for (let k = 0; k < 256; k++) {
            _histR[k] = LUT[k] * 0.2126;
            _histG[k] = LUT[k] * 0.7152;
            _histB[k] = LUT[k] * 0.0722;
        }
    }

    for (let i = 0; i < data1.length; i += 4) {
        // Skip if both pixels are fully transparentt, reduce computation and it's pretty pointless to skew results for pixels that I can't even see.
        if (!(data1[i + 3] | data2[i + 3])) continue;
        
        // Linear luminance is closer to human vision, Harding FPA and PEAT use it so why not.
        const lum1 = _histR[data1[i]] + _histG[data1[i + 1]] + _histB[data1[i + 2]];
        const lum2 = _histR[data2[i]] + _histG[data2[i + 1]] + _histB[data2[i + 2]];
        hist1[(lum1 * 255) >>> 3]++;
        hist2[(lum2 * 255) >>> 3]++;
    }

    let diff = 0,
        total = 0;
    for (let i = 0; i < bins; ++i) {
        // Unint32Array values are always non-negative integers so ternary beats Math.abs,
        // and binDiff<1 for integers is just !binDiff
        const binDiff = hist1[i] > hist2[i] ? hist1[i] - hist2[i] : hist2[i] - hist1[i];
        if (!binDiff) continue;
        diff += binDiff;
        total += hist1[i] + hist2[i];
    }
    return total ? diff / total : 0;
};