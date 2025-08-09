(function () {
    "use strict";
    window.AnalyzerHelpers = window.AnalyzerHelpers || {};

    window.AnalyzerHelpers.spectralAnalysis = function (
        brightness,
        bufferLen,
        fftLen,
        fps
    ) {
        try {
            // Prepare for worst
            const BLEN = bufferLen > 0 ? bufferLen : 128;
            const FLEN = fftLen > 0 ? fftLen : 64;
            const fs =
                fps > 0
                    ? fps
                    : this && this.minAnalysisInterval
                        ? 1000 / this.minAnalysisInterval
                        : 60;

            // Clamp brightness to [0,1]
            const x =
                typeof brightness === "number" && brightness >= 0 && brightness <= 1
                    ? brightness
                    : 0;

            if (!this.temporalBuffer) this.temporalBuffer = {};
            if (
                !this.temporalBuffer._ring ||
                !this.temporalBuffer._ring.buffer ||
                this.temporalBuffer._ring.buffer.length !== BLEN
            ) {
                this.temporalBuffer._ring = {
                    buffer: new Float32Array(BLEN),
                    idx: 0,
                    count: 0,
                };
            }
            const ring = this.temporalBuffer._ring;

            // update ring with new sample
            ring.buffer[ring.idx] = x;
            ring.idx = (ring.idx + 1) % BLEN;
            if (ring.count < BLEN) ring.count++;
            // return early if too few samples
            if (ring.count < Math.max(32, FLEN)) {
                return {
                    dominantFrequency: 0,
                    spectrum: [],
                    spectralFlatness: 0,
                    windowSize: ring.count,
                };
            }

            const N = Math.min(FLEN, ring.count);
            const signal = new Float32Array(N);
            const start = (ring.idx - N + BLEN) % BLEN;
            for (let i = 0; i < N; i++) {
                signal[i] = ring.buffer[(start + i) % BLEN];
            }
            let mean = 0;
            for (let i = 0; i < N; i++) mean += signal[i];
            mean /= N;
            for (let i = 0; i < N; i++) signal[i] -= mean;
            for (let i = 0; i < N; i++) {
                signal[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
            }
            const fft = window.AnalyzerHelpers.padToPowerOfTwo(signal);
            if (!fft || !fft.re || !fft.im) {
                return {
                    dominantFrequency: 0,
                    spectrum: [],
                    spectralFlatness: 0,
                    windowSize: N,
                };
            }

            const M = fft.re.length;
            if (M < 2) {
                return {
                    dominantFrequency: 0,
                    spectrum: [],
                    spectralFlatness: 0,
                    windowSize: N,
                };
            }

            // Build spectrum up to Nyquist
            const nyqBins = M >> 1;
            const spectrum = [];
            const scale = 2 / (N * 0.5); // Hann window gain

            for (let k = 0; k < nyqBins; k++) {
                const amplitude = Math.hypot(fft.re[k], fft.im[k]) * scale;
                spectrum.push({
                    frequency: (k * fs) / M,
                    amplitude,
                });
            }

            // Find dominant frequency in 3–30 Hz
            const fMin = 3,
                fMax = 30;
            const kMin = Math.max(1, Math.floor((fMin * M) / fs));
            const kMax = Math.min(nyqBins - 1, Math.ceil((fMax * M) / fs));

            let maxAmp = 0,
                domK = 0;
            for (let k = kMin; k <= kMax; k++) {
                if (spectrum[k].amplitude > maxAmp) {
                    maxAmp = spectrum[k].amplitude;
                    domK = k;
                }
            }
            const dominantFrequency = domK > 0 ? spectrum[domK].frequency : 0;

            let confidence = 0;
            if (domK > 0) {
                const lo = Math.max(kMin, domK - 4);
                const hi = Math.min(kMax, domK + 4);
                const neighbors = [];
                for (let k = lo; k <= hi; k++) {
                    if (k !== domK) neighbors.push(spectrum[k].amplitude);
                }
                if (neighbors.length) {
                    neighbors.sort((a, b) => a - b);
                    const mid = neighbors.length >> 1;
                    const median =
                        neighbors.length % 2
                            ? neighbors[mid]
                            : 0.5 * (neighbors[mid - 1] + neighbors[mid]);
                    if (maxAmp > 0) {
                        const ratio = median > 0 ? maxAmp / median : maxAmp;
                        confidence = Math.max(0, Math.min(1, (ratio - 1) / 4));
                    }
                }
            }

            let spectralFlatness = 0;
            if (
                window.AnalyzerHelpers &&
                typeof window.AnalyzerHelpers.computeSpectralFlatness === "function"
            ) {
                spectralFlatness = window.AnalyzerHelpers.computeSpectralFlatness(
                    spectrum.slice(kMin, kMax + 1)
                );
            } else {
                let sum = 0,
                    logSum = 0,
                    count = 0;
                for (let k = kMin; k <= kMax; k++) {
                    const v = spectrum[k].amplitude;
                    if (v > 0) {
                        sum += v;
                        logSum += Math.log(v);
                        count++;
                    }
                }
                if (count > 0 && sum > 0) {
                    const gm = Math.exp(logSum / count);
                    const am = sum / count;
                    spectralFlatness = gm / am;
                }
            }

            return {
                dominantFrequency,
                spectrum,
                windowSize: N,
                spectralFlatness,
                confidence, // Will be used for TASK 3021
                binResolution: fs / M, // will be used for TASK 3021
            };
        } catch (err) {
            // I messed up, catch all errors
            console.error("spectralAnalysis error:", err);
            return {
                dominantFrequency: 0,
                spectrum: [],
                windowSize: 0,
                spectralFlatness: 0,
            };
        }
    };
})();