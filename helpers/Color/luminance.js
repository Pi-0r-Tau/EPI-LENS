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
  // So there are two types of LUT here
  // Unbeknowst to me when I started this the LUT is used in two different ways, so previous commit did slightly break things
  // This is fixed now.
  // sRGB_TO_LINEAR_LUT To convert sRGB 0..255 values to linear 0..1 values for color calculations (labColorUtils.js)
  // sRGB_TO_LINEAR_255_LUT To convert sRGB 0..255 values to linear 0..255 values for pixel level processing (spatialEdges.js)
  // Hence two versions of the LUT and two luminance functions
  // The weights can be overridden if needed but the defaults are the standard Rec. 709 / sRGB weights

  // Scaled version for 0..255 range
  const LUT255 = new Float32Array(256);
  for (let i = 0; i < 256; i++) LUT255[i] = LUT[i] * 255;

  // LUT used for RGB to XYZ conversion in labColorUtils.js
  window.AnalyzerHelpers.sRGB_TO_LINEAR_LUT = LUT;
  
  window.AnalyzerHelpers.luminance = function(data, idx, weights = [0.2126, 0.7152, 0.0722]) {
    return LUT[data[idx]] * weights[0] +
           LUT[data[idx + 1]] * weights[1] +
           LUT[data[idx + 2]] * weights[2];
  };

  // LUT used for Sobel edge detection in spatialEdges.js
  window.AnalyzerHelpers.sRGB_TO_LINEAR_255_LUT = LUT255;

  window.AnalyzerHelpers.luminance255 = function(data, idx, weights = [0.2126, 0.7152, 0.0722]) {
    return LUT255[data[idx]] * weights[0] +
           LUT255[data[idx + 1]] * weights[1] +
           LUT255[data[idx + 2]] * weights[2];
  };
})();