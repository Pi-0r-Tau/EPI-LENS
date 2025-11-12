const MAX_SIGNAL_LENGTH = 4096;

window.AnalyzerHelpers = window.AnalyzerHelpers || {};
// TASK S117.3
// sampleRate = 1 added, want a safety net for if padPowerOfTwo in spectralAnalysis.js is called but it does not have a sample rate
// The code will always be given the correct Hz by the spectralAnalysis. But I want to be able to quickly tell if I change and break something
window.AnalyzerHelpers.performFFT = function (signal, sampleRate = 1) {
    if (!signal || !signal.length) throw new Error("Empty signal");
    if (!Array.isArray(signal) && !(signal instanceof Float32Array) && !(signal instanceof Float64Array)) {
        throw new Error("Need array or typed array");
    }

    const len = signal.length;
    if ((len & (len - 1)) !== 0 || len <= 1) throw new Error("Signal length must be power of 2");
    if (len > MAX_SIGNAL_LENGTH) throw new Error("Signal too long");

    for (let i = 0; i < len; i++) {
        if (!Number.isFinite(signal[i])) throw new Error("Bad value at " + i);
    }

    if (typeof window.FFT !== "function") throw new Error("DSP.js not loaded");

    try {
        const fft = new window.FFT(len, sampleRate || 1);
        fft.forward(signal);
        return {
            re: fft.real.slice(0, len),
            im: fft.imag.slice(0, len)
        };
    } catch (err) {
        // So prev string throws causes undefined error messages
        // Now some quality of life.. an actual error message
        const msg = (err && err.message) ? err.message : String(err);
        throw new Error("FFT failed:" + msg);
    }
};

window.AnalyzerHelpers.padToPowerOfTwo = function (signal, sampleRate = 1) {
    const n = signal.length;
    let pow2 = 1;
    while (pow2 < n) pow2 <<= 1;
    if (pow2 === n) return window.AnalyzerHelpers.performFFT(signal, sampleRate);

    let padded;
    if (signal instanceof Float32Array) {
        padded = new Float32Array(pow2);
    } else if (signal instanceof Float64Array) {
        padded = new Float64Array(pow2);
    } else {
        padded = new Array(pow2).fill(0);
    }

    for (let i = 0; i < n; i++) padded[i] = signal[i];
    return window.AnalyzerHelpers.performFFT(padded, sampleRate);
};