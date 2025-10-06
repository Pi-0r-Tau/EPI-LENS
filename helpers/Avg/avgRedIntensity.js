/**
 * Avg red channel intensity via single pass.
 * @param {Uint8ClampedArray} data - RGBA pixel array.
 * @returns {number} Normalized [0,1] average red intensity.
 * @returns {number} 0 if data is invalid or empty.
 */
window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.avgRedIntensity = function (data) {
  if (!data?.length || data.length < 4) return 0;

  let redTotal = 0;
  for (let i = 0; i < data.length; i += 4) {
    redTotal += data[i];
  }
  const pixelCount = data.length >>> 2;
  return redTotal / (pixelCount * 255);
};