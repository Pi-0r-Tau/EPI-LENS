(function () {
  "use strict";
  window.AnalyzerHelpers = window.AnalyzerHelpers || {};

  const SMALL_ARRAY_THRESHOLD = 64;
  const FREQ_MIN = 3;
  const FREQ_MAX = 50;
  // QS: Quick Select for median, cant be asked to type it out each time
  // FLEN: fft length
  // BLEN: buffer length for temporal buffer

  function float32Buf(obj, key, len) {
    if (!obj[key] || obj[key].length < len) {
      obj[key] = new Float32Array(len);
    }
    return obj[key];
  }
  function signalQS(arr, k, n) {
    if (!arr || n <= 0 || k < 0 || k >= n) return undefined;
    let left = 0, right = n - 1;
    while (left < right) {
      const mid = left + ((right - left) >> 1);
      const a = arr[left], b = arr[mid], c = arr[right];
      let pivotIdx = ((a <= b && b <= c) || (c <= b && b <= a))
        ? mid
        : ((b <= a && a <= c) || (c <= a && a <= b) ? left : right);

      const pivotVal = arr[pivotIdx];
      [arr[pivotIdx], arr[right]] = [arr[right], arr[pivotIdx]];

      let store = left;
      for (let i = left; i < right; i++) {
        if (arr[i] < pivotVal) {
          [arr[store], arr[i]] = [arr[i], arr[store]];
          store++;
        }
      }
      [arr[right], arr[store]] = [arr[store], arr[right]];

      if (k === store) return arr[k];
      if (k < store) right = store - 1;
      else left = store + 1;
    }
    return arr[left];
  }

  function MedianQS(arr, n) {
    if (n === 0) return 0;
    const mid = n >> 1;
    if (n % 2) {
      return signalQS(arr, mid, n);
    } else {
      return 0.5 * (signalQS(arr, mid - 1, n) + signalQS(arr, mid, n));
    }
  }

  if (!window.AnalyzerHelpers._prevPhase) {
    window.AnalyzerHelpers._prevPhase = {};
  }
  if (!window.AnalyzerHelpers._prevTimestamp) {
    window.AnalyzerHelpers._prevTimestamp = 0;
  }

  window.AnalyzerHelpers.spectralAnalysis = function (
    brightness,
    bufferLen,
    fftLen,
    fps,
    timestamp
  ) {
    const BLEN = bufferLen || 128;
    const FLEN = fftLen || SMALL_ARRAY_THRESHOLD;
    const fs = fps || (this && this.minAnalysisInterval ? 1000 / this.minAnalysisInterval : 60);
    const x = typeof brightness === "number" && brightness >= 0 && brightness <= 1 ? brightness : 0;

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

    ring.buffer[ring.idx] = x;
    ring.idx = (ring.idx + 1) % BLEN;
    if (ring.count < BLEN) ring.count++;

    // Filling buffer, return early
    if (ring.count < Math.max(32, FLEN)) {
      return {
        dominantFrequency: 0,
        spectrum: [],
        spectralFlatness: 0,
        windowSize: ring.count,
      };
    }
    let _signalBase  = float32Buf(this.temporalBuffer, '_signalBuffer', FLEN);
    let _medianBase  = float32Buf(this.temporalBuffer, '_medianBuffer', FLEN);
    // max needed for SNR window is around 8 for 3-50Hz range
    // domK - 4 to domk + 4, so 8 in total but I use 9 so buffer is large enough for the max expected window
    let _windowBase  = float32Buf(this.temporalBuffer, '_windowBuffer', 9);

    const N = Math.min(FLEN, ring.count);
    const signal = _signalBase.length === N ? _signalBase : _signalBase.subarray(0, N);
    const medBuf = _medianBase.length === N ? _medianBase : _medianBase.subarray(0, N);

    // Fill signal buffer from ring
    const start = (ring.idx - N + BLEN) % BLEN;
    for (let i = 0; i < N; i++) {
      signal[i] = ring.buffer[(start + i) % BLEN];
    }

  // Quick Select mutates so copy to median buffer
    for (let i = 0; i < N; i++) medBuf[i] = signal[i];
    const median = MedianQS(medBuf, N);

    if (!this.temporalBuffer._hannCache) {
      this.temporalBuffer._hannCache = {};
    }
    let hann = this.temporalBuffer._hannCache[N];
    if (!hann || hann.length !== N) {
      hann = new Float32Array(N);
      const denom = N > 1 ? N - 1 : 1;
      for (let i = 0; i < N; i++) {
        hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
      }
      this.temporalBuffer._hannCache[N] = hann;
    }
    for (let i = 0; i < N; i++) {
      signal[i] = (signal[i] - median) * hann[i];
    }
    // fft.js for padToPowerOfTwo, then dsp.js for fft
    // TASK S117.4 pass the fs (aka sampleRate) through 
    const fft = window.AnalyzerHelpers.padToPowerOfTwo(signal, fs);
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
    const nyqBins = M >> 1;
    const spectrum = [];
    let windowSum = 0;
    for (let i = 0; i < N; i++) windowSum += hann[i];
    // TASK S117.5
    // Amplitude scaling factors have special cases for DC and Nyquist bins
    // tests indicates that I had stupidly double-scaled these bins.
    const SCALE_OS = windowSum > 0 ? 2 / windowSum : 0;  // 1<k<Nyquist
    const SCALE_DC = windowSum > 0 ? 1 / windowSum : 0;  // k=0 or k=Nyquist

    const prevPhase = window.AnalyzerHelpers._prevPhase;
    const prevTimestamp = typeof window.AnalyzerHelpers._prevTimestamp === "number"
      ? window.AnalyzerHelpers._prevTimestamp
      : undefined;
    // Also now it subtrats expected phase advance from bin center frequency making sure that te
    // phase state is reset when fs or M changes

    if (window.AnalyzerHelpers._prevM !== M || window.AnalyzerHelpers._prevFs !== fs) {
      for (const k in prevPhase) delete prevPhase[k];
    }

    window.AnalyzerHelpers._prevM = M;
    window.AnalyzerHelpers._prevFs = fs;

    const instFreqs = [];
    const deltaT = (typeof timestamp === "number" && typeof prevTimestamp === "number" && timestamp !== prevTimestamp)
      ? (timestamp - prevTimestamp) / 1000
      : 1 / fs;
    for (let k = 0; k < nyqBins; k++) {
      const re = fft.re[k], im = fft.im[k];
      const mag = Math.hypot(re, im);
      const isDc = (k === 0);
      const isNyquist = (M % 2 === 0) && (k === nyqBins);
      const amplitude = mag * ((isDc || isNyquist) ? SCALE_DC : SCALE_OS);
      const phase = Math.atan2(im, re);

      let instFreqHz = 0;
      if (typeof prevPhase[k] === "number" && deltaT > 0) {
        let dphi = phase - prevPhase[k];
        while (dphi > Math.PI) dphi -= 2 * Math.PI;
        while (dphi < -Math.PI) dphi += 2 * Math.PI;

        // instFreqHz = bin center + offset
        const fk = (k * fs) / M; // bin center frequency in Hz
        const offsetHz = (dphi / (2 * Math.PI)) / deltaT;
        instFreqHz = fk + offsetHz;
      }

      instFreqs[k] = instFreqHz;
      spectrum.push({
        frequency: (k * fs) / M,  // bin center Hz
        amplitude,
        phase,
        instFreq: instFreqHz,
      });
      prevPhase[k] = phase;
    }
    if (typeof timestamp === "number") {
      window.AnalyzerHelpers._prevTimestamp = timestamp;
    }

    // Find dominant frequency in 3–50 Hz range
    const fMin = FREQ_MIN, fMax = FREQ_MAX;
    const kMin = Math.max(1, Math.floor((fMin * M) / fs));
    const kMax = Math.min(nyqBins - 1, Math.ceil((fMax * M) / fs));

    let maxAmp = 0, domK = 0;
    for (let k = kMin; k <= kMax; k++) {
      if (spectrum[k].amplitude > maxAmp) {
        maxAmp = spectrum[k].amplitude;
        domK = k;
      }
    }
    const dominantFrequency = domK > 0 ? spectrum[domK].frequency : 0;
    const dominantInstFreq = domK > 0 ? spectrum[domK].instFreq : 0;

    // Confidence is SNR in dB with noise power, TODO: rename to SNR? Maybe, maybe not.
    let confidence = 0;
    if (domK > 0) {
      const lo = Math.max(kMin, domK - 4);
      const hi = Math.min(kMax, domK + 4);
      const winNeeded = Math.max(0, hi - lo + 1) - 1; // excluding domK
      const windowBuf = _windowBase.length >= winNeeded ? _windowBase : (this.temporalBuffer._windowBuffer = new Float32Array(Math.max(_windowBase.length * 2, winNeeded)));
      let nCount = 0;
      for (let k = lo; k <= hi; k++) {
        if (k !== domK) {
          windowBuf[nCount++] = spectrum[k].amplitude;
        }
      }
      if (nCount) {
        let pNoise = 0;
        for (let i = 0; i < nCount; i++) {
          pNoise += windowBuf[i] * windowBuf[i];
        }
        pNoise /= nCount;
        const pSignal = maxAmp * maxAmp;
        const EPS = 1e-12; // Don't let noise power be zero, needs tests
        confidence = 10 * Math.log10(pSignal / Math.max(pNoise, EPS));
      }
    }

    let spectralFlatness = 0;
    if (
      window.AnalyzerHelpers &&
      typeof window.AnalyzerHelpers.computeSpectralFlatness === "function"
    ) {
      spectralFlatness = window.AnalyzerHelpers.computeSpectralFlatness(
        spectrum,
        kMin,
        kMax
      );
    } else {
      throw new Error('spectralAnalysis: failed to use spectralFlatness.js');
      // If this ever happens, little checklist:
      // Have I included spectralFlatness.js? in the html files and manifest?
      // Is it included before spectralAnalysis.js?
      // Am I sane?
      // Answers should be yes, yes, no.
    }
    return {
      dominantFrequency,
      dominantInstFreq, // TASK 1950: Instantaneous dominant frequency added to JSON, CSV, NDJSON exports
      spectrum,
      windowSize: N,
      spectralFlatness,
      confidence, // TASK 3021: Confidence metric added to JSON, CSV, NDJSON exports
      binResolution: fs / M, // TASK 3021: Frequency resolution of each bin in Hz added to metadata for JSON, CSV, NDJSON exports
      };
  };
}());