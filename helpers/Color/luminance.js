// relative luminance with sRGB gamma correction
window.AnalyzerHelpers = window.AnalyzerHelpers || {};

// Pre-compute linearization lookup table (LUT)
(function() {
  const LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const val = i / 255;
    LUT[i] = val > 0.04045
      ? Math.pow((val + 0.055) / 1.055, 2.4)
      : val / 12.92;
  }

  AnalyzerHelpers.luminance = function(data, idx) {
    return LUT[data[idx]] * 0.2126 +
           LUT[data[idx + 1]] * 0.7152 +
           LUT[data[idx + 2]] * 0.0722;
  };
})();