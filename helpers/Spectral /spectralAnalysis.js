window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.spectralAnalysis = function (
    brightness,
    bufferLen = 128,
    fftLen = 64,
    fps = 60
) {
    try {
        brightness =
            typeof brightness === "number" &&
                brightness >= 0 &&
                brightness <= 1 &&
                !isNaN(brightness)
                ? brightness
                : 0;

        if (
            !this.temporalBuffer._ring ||
            this.temporalBuffer._ring.buffer.length !== bufferLen
        ) {
            this.temporalBuffer._ring = {
                buffer: new Float32Array(bufferLen),
                idx: 0,
                count: 0,
            };
        }
        const ring = this.temporalBuffer._ring;

        // Store brightness sample
        ring.buffer[ring.idx] = brightness;
        ring.idx = (ring.idx + 1) % bufferLen;
        if (ring.count < bufferLen) ring.count++;

        if (ring.count < Math.max(32, fftLen)) {
            return {
                dominantFrequency: 0,
                spectrum: [],
                spectralFlatness: 0,
                windowSize: ring.count,
            };
        }

        const N = Math.min(fftLen, ring.count);
        const signal = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            signal[i] = ring.buffer[(ring.idx + i - N + bufferLen) % bufferLen];
        }

        for (let i = 0; i < N; i++) {
            signal[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
        }

        const { re, im } = window.AnalyzerHelpers.padToPowerOfTwo(signal);
        const spectrum = [];
        for (let i = 0; i < N; i++) {
            spectrum.push({
                frequency: (i * fps) / N,
                amplitude: (2 * Math.hypot(re[i], im[i])) / N,
            });
        }

        // Find dominant frequency (risk: 3–30Hz band)
        let maxAmp = 0,
            domIdx = 1;
        const half = Math.floor(spectrum.length / 2); // Nyquist
        for (let i = 1; i < half; i++) {
            if (spectrum[i].amplitude > maxAmp) {
                maxAmp = spectrum[i].amplitude;
                domIdx = i;
            }
        }
        const dominantFrequency = spectrum[domIdx]?.frequency || 0;

        let spectralFlatness = 0;
        if (
            window.AnalyzerHelpers?.computeSpectralFlatness &&
            typeof window.AnalyzerHelpers.computeSpectralFlatness === "function"
        ) {
            spectralFlatness = window.AnalyzerHelpers.computeSpectralFlatness(
                spectrum.slice(1, half)
            );
        }

        return {
            dominantFrequency,
            spectrum: spectrum.slice(0, half),
            windowSize: N,
            spectralFlatness,
        };
    } catch (error) {
        console.error("Spectral analysis error:", error);
        return {
            dominantFrequency: 0,
            spectrum: [],
            windowSize: 0,
            spectralFlatness: 0,
        };
    }
};