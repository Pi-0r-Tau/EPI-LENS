window.AnalyzerHelpers = window.AnalyzerHelpers || {};

window.AnalyzerHelpers.rgbToLab = function (r, g, b) {
  const RGB_TO_XYZ = [
    0.4124, 0.3576, 0.1805, 0.2126, 0.7152, 0.0722, 0.0193, 0.1192, 0.9505,
  ];
  const REF_X = 0.95047,
    REF_Y = 1.0,
    REF_Z = 1.08883;

  // Normalize and gamma correct (sRGB to linear)
  const LUT = window.AnalyzerHelpers.sRGB_TO_LINEAR_LUT;
  let srgb;

  if (LUT) {
    srgb = [LUT[r], LUT[g], LUT[b]];
  } else {
    srgb = [r, g, b];
    for (let i = 0; i < 3; ++i) {
      let v = srgb[i] / 255;
      srgb[i] = v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
    }
  }

  // Convert to XYZ
  const X =
    (srgb[0] * RGB_TO_XYZ[0] +
      srgb[1] * RGB_TO_XYZ[1] +
      srgb[2] * RGB_TO_XYZ[2]) /
    REF_X;
  const Y =
    (srgb[0] * RGB_TO_XYZ[3] +
      srgb[1] * RGB_TO_XYZ[4] +
      srgb[2] * RGB_TO_XYZ[5]) /
    REF_Y;
  const Z =
    (srgb[0] * RGB_TO_XYZ[6] +
      srgb[1] * RGB_TO_XYZ[7] +
      srgb[2] * RGB_TO_XYZ[8]) /
    REF_Z;

  function f(t) {
    return t > Math.pow(6 / 29, 3)
      ? Math.pow(t, 1 / 3)
      : (1 / (3 * Math.pow(6 / 29, 2))) * t + 16 / 116;
  }

  const fx = f(X),
    fy = f(Y),
    fz = f(Z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
};

window.AnalyzerHelpers.calculateDominantColor = function (imageData) {
  if (!imageData || !imageData.data || imageData.data.length === 0)
    return { r: 0, g: 0, b: 0 };

  const data = imageData.data;
  const n = data.length >>> 2; // Number of pixels (RGBA per pixel)
  if (n === 0) return { r: 0, g: 0, b: 0 };

  let r = 0,
    g = 0,
    b = 0;
  let count = 0; // Track non-transparent pixels

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // Skip transparent pixels
    r += data[i]; // Red
    g += data[i + 1]; // Green
    b += data[i + 2]; // Blue
    count++;
  }

  if (count === 0) return { r: 0, g: 0, b: 0 };

  const invCount = 1 / count;
  // Returns floating point RGB values as thresholding is applied later
  return {
    r: r * invCount,
    g: g * invCount,
    b: b * invCount,
  };
};

window.AnalyzerHelpers.cie76 = function (lab1, lab2) {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
};

window.AnalyzerHelpers.extractDominantColors = function (data, n = 5) {
  if (!data || data.length === 0) return [];
  // Quantize each channel to 3 bits
  // Map key: 0xRRGGBB integer, value: count
  const colorMap = new Map();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // ignore transparent pixels; ignore them don't want them skewing resultss
    const r = (data[i] >> 5) << 5; // 0-255 reduced to 0,32,64,...224
    const g = (data[i + 1] >> 5) << 5;
    const b = (data[i + 2] >> 5) << 5;

    const key = (r << 16) | (g << 8) | b;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }
  // Sort color bins by frequency, return top N
  return Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({
      r: (key >> 16) & 0xff,
      g: (key >> 8) & 0xff,
      b: key & 0xff,
      count,
    }));
};

/* Saturated Red Detection

Adds red detection without re-linearizing sRGB
- The Lab a* and chroma always computed via rgbToLab.
- If linR/G/B are not present, skips the linear gate and rely on Lab gate only.

At some point in this project I messed up the standarization of the timings, so for some reason I pass both miliseconds and seconds. So apologies for that.
So I have some hacky way to detect the duration be it in miliseconds or seconds.
*/

(function () {
  const AH = (window.AnalyzerHelpers = window.AnalyzerHelpers || {});

  // Defaults for saturated red and area gating
  AH.defaultRedThresholds = AH.defaultRedThresholds || {
    // Linear sRGB thresholds (0..1) Only applied if color.linR/linG/linB are provided.
    rHi: 0.85, // Red threshold
    gLo: 0.15, // Green suppression
    bLo: 0.15, // Blue suppression
    // Lab cross-check thresholds
    aThresh: 30, // a* threshold
    cThresh: 35, // Chroma threshold
    // Area fraction to treat "red ON" for flash counting - higher threshold
    // W3C WCAG 2.1 0.25 for red area fraction.
    areaThreshold: 0.25,
    // Red area fraction calculation thresholds
    redDominanceThreshold: 60,
    redIntensityThreshold: 0.7,
    minRedAreaFraction: 0.3, // Minimum return value for detected red areas
    weakRedMultiplier: 0.05,
    maxWeakRedFraction: 0.1, // Maximum value for weak red content
  };

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  /**
   * Determine if a color is saturated red.
   * Uses Lab gate always; uses linear sRGB gate only if color.linR/G/B provided.
   */

  let _cachedInput = null;
  let _cachedThresholds = null;

  AH.isSaturatedRed = function isSaturatedRed(color, lab, thresholds) {
    if (thresholds !== _cachedInput) {
      _cachedThresholds = Object.assign({}, AH.defaultRedThresholds, thresholds || {});
      _cachedInput = thresholds;
    }
    const T = _cachedThresholds;
    // Linear RGB gate
    // If color.linR/G/B are not provided, skip gate
    let gateRGB = true; // default to true so Lab gate alone can pass
    if (
      typeof color.linR === "number" &&
      typeof color.linG === "number" &&
      typeof color.linB === "number"
    ) {
      gateRGB = color.linR > T.rHi && color.linG < T.gLo && color.linB < T.bLo;
    }

    // Lab cross-check gate
    const a = lab.a;
    const b = lab.b;
    const chroma = Math.sqrt(a * a + b * b);
    const gateLab = a > T.aThresh && chroma > T.cThresh;

    return gateRGB && gateLab;
  };
  
  let _cachedRedAreaThresholds = null;
  let _cachedRedAreaInput = null;

  AH.getRedAreaFraction = function getRedAreaFraction(sample, lab, thresholds) {
    if (sample && typeof sample.redAreaFraction === "number") {
      return clamp01(sample.redAreaFraction);
    }

    if (thresholds !== _cachedRedAreaInput) {
      _cachedRedAreaThresholds = Object.assign({}, AH.defaultRedThresholds, thresholds || {});
      _cachedRedAreaInput = thresholds;
    }
    const T = _cachedRedAreaThresholds;
    const color = sample.color;

    // How much red exceeds green and blue for dominance
    const redDominance = color.r - Math.max(color.g, color.b);
    const redIntensity = color.r / 255;
    // If
    // Red is significantly higher than green/blue
    // Red intensity is high enough
    // Passes Lab color space checks
    const isRed = AH.isSaturatedRed(sample.color, lab, T);
    const dominanceThreshold = T.redDominanceThreshold || 50;
    const intensityThreshold = T.redIntensityThreshold || 0.6;
    const hasRedDominance =
      redDominance > dominanceThreshold && redIntensity > intensityThreshold;

    if (isRed && hasRedDominance) {
      // Now how 'red' is it, is it really red, how 'really' red is that
      const minRedFraction = T.minRedAreaFraction || 0.3;
      return clamp01(Math.max(minRedFraction, Math.min(redIntensity, 1.0)));
    } else {
      const weakRedMultiplier = T.weakRedMultiplier || 0.05;
      const maxWeakRed = T.maxWeakRedFraction || 0.1;
      return clamp01(Math.min(redIntensity * weakRedMultiplier, maxWeakRed));
    }
  };

  AH.precomputeRedSeries = function precomputeRedSeries(
    sortedSeries,
    labs,
    thresholds
  ) {
    const T = Object.assign({}, AH.defaultRedThresholds, thresholds || {});
    const n = sortedSeries.length;
    const redAreaFractions = new Array(n);
    const redOn = new Array(n);
    for (let i = 0; i < n; i++) {
      const raf = AH.getRedAreaFraction(sortedSeries[i], labs[i], T);
      redAreaFractions[i] = raf;
      redOn[i] = raf >= T.areaThreshold ? 1 : 0;
    }
    return { redAreaFractions, redOn, thresholdsUsed: T };
  };

  AH.computePerFrameRedStates = function computePerFrameRedStates(
    redAreaFractions,
    redAreaOnThreshold
  ) {
    const n = redAreaFractions.length;
    const redStates = new Array(n);
    const redTransitions = new Array(n);

    let prevOn = null;
    for (let i = 0; i < n; i++) {
      const raf = redAreaFractions[i] ?? 0;
      const on = raf >= redAreaOnThreshold ? 1 : 0;

      redStates[i] = on;

      // Mark frame as having a transition (0 or 1)
      if (prevOn !== null && on !== prevOn) {
        redTransitions[i] = 1;
      } else {
        redTransitions[i] = 0;
      }

      prevOn = on;
    }

    return { redStates, redTransitions };
  };

  // Median of positive timestamp deltas
  function medianPositiveDelta(ts, startIdx, endIdx) {
    const i0 = Math.min(startIdx, endIdx);
    const i1 = Math.max(startIdx, endIdx);
    const deltas = [];
    for (let i = i0 + 1; i <= i1; i++) {
      const d = ts[i] - ts[i - 1];
      if (Number.isFinite(d) && d > 0) deltas.push(d);
    }
    if (deltas.length === 0) return null;
    deltas.sort((a, b) => a - b);
    const m = deltas.length >> 1;
    return deltas.length % 2 ? deltas[m] : 0.5 * (deltas[m - 1] + deltas[m]);
  }

  // Infer duration in seconds from timestamps that may be in seconds or milliseconds
  function inferDurationSec(timestamps, startIdx, endIdx) {
    const i0 = Math.min(startIdx, endIdx);
    const i1 = Math.max(startIdx, endIdx);
    let span = timestamps[i1] - timestamps[i0];

    // Try to infer unit using median frame delta
    const med = medianPositiveDelta(timestamps, i0, i1);

    // If it is a valid span, use it; otherwise fallback to med * frames
    if (!Number.isFinite(span) || span <= 0) {
      if (Number.isFinite(med) && med > 0) {
        span = med * (i1 - i0);
      } else {
        // Final fallback attempt: assume 30 FPS
        return (i1 - i0) / 30;
      }
    }

    // If the typical frame delta is < 1, timestamps are likely in seconds
    // If all fails, assume milliseconds
    const inSeconds = Number.isFinite(med) ? med < 1 : Math.abs(span) < 10;
    return inSeconds ? span : span / 1000;
  }

  AH.computeRedWindowMetrics = function computeRedWindowMetrics(
    startIdx,
    endIdx,
    timestamps,
    redAreaFractions,
    redAreaOnThreshold
  ) {
    const r3 = (x) => Math.round(x * 1000) / 1000; // Round to 3 decimal places

    const i0 = Math.min(startIdx, endIdx);
    const i1 = Math.max(startIdx, endIdx);
    const samples = i1 - i0 + 1;

    // Single-sample windows can't have transitions or rate
    if (samples <= 1) {
      const raf = redAreaFractions[i0] ?? 0;
      return {
        redAreaAvg: r3(raf),
        redAreaMax: r3(raf),
        redOnFraction: r3(raf >= redAreaOnThreshold ? 1 : 0),
        redTransitions: 0,
        redFlashEvents: 0,
        redFlashPerSecond: 0,
        redFlickerInRiskBand: false,
        redAreaThresholdUsed: redAreaOnThreshold,
        windowDurationMs: 0,
      };
    }

    let redAreaSum = 0;
    let redAreaMax = 0;
    let redOnCount = 0;
    let transitions = 0;

    let prevOn = null;
    for (let i = i0; i <= i1; i++) {
      const raf = redAreaFractions[i] ?? 0;
      redAreaSum += raf;
      if (raf > redAreaMax) redAreaMax = raf;
      const on = raf >= redAreaOnThreshold ? 1 : 0;
      redOnCount += on;
      if (prevOn !== null && on !== prevOn) transitions++;
      prevOn = on;
    }

    // Duration in seconds and ms, supporting timestamps in s or ms (Sorry for the hacky way)
    const durationSec = inferDurationSec(timestamps, i0, i1);
    const durationMs = durationSec * 1000;

    // Two opposing transitions ≈ one flash
    const redFlashEvents = transitions >= 2 ? Math.floor(transitions / 2) : 0;

    // Calculate flash rate clamp to a upper bound
    let redFlashPerSecond = 0;
    if (redFlashEvents > 0 && durationSec > 0) {
      redFlashPerSecond = redFlashEvents / durationSec;
      if (redFlashPerSecond > 60) redFlashPerSecond = 60; // Clamp to 60 flashes per second / 60 Hz
    }

    const redFlickerInRiskBand =
      redFlashPerSecond >= 3 && redFlashPerSecond <= 30;

    return {
      redAreaAvg: r3(redAreaSum / samples),
      redAreaMax: r3(redAreaMax),
      redOnFraction: r3(redOnCount / samples),
      redTransitions: transitions,
      redFlashEvents,
      redFlashPerSecond: r3(redFlashPerSecond),
      redFlickerInRiskBand,
      redAreaThresholdUsed: redAreaOnThreshold,
      windowDurationMs: Math.round(durationMs),
    };
  };
})();