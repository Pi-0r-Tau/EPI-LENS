/**
 * Avg brightness (luminance) of RGBA pixel data using BT.709 coefficients.
 * @param {Uint8ClampedArray} data - RGBA pixel array.
 * @returns {number} Normalized [0,1] avg. brightness.
 */
window.AnalyzerHelpers = window.AnalyzerHelpers || {};
AnalyzerHelpers.avgBrightness = function (data) {
  const len = data.length;
  if (len < 4) return 0;

  const pixelCount = len >>> 2; // Number of pixels (4 bytes each)
  const lumi = AnalyzerHelpers.luminance;

  let sum = 0, i = 0;
  const max = len - (len % 32);

  // process 8 pixels per iteration (32 bytes)
  for (; i < max; i += 32) {
    sum += lumi(data, i) + lumi(data, i + 4) +
           lumi(data, i + 8) + lumi(data, i + 12) +
           lumi(data, i + 16) + lumi(data, i + 20) +
           lumi(data, i + 24) + lumi(data, i + 28);
  }

  // clean up
  for (; i < len; i += 4) {
    sum += lumi(data, i);
  }

  return sum / pixelCount;
};
