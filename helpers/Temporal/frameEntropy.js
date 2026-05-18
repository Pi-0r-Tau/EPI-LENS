const R = 0.2126, G = 0.7152, B = 0.0722;
window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.frameEntropy = function (imageData, maxHistory = 1000) {
  if (!imageData?.data || !imageData.width || !imageData.height) return 0;

  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const pixels = width * height;
  if (pixels === 0) return 0;

  const histogram = new Uint32Array(256); // 8-bit brightness bins
  const LUT255 = window.AnalyzerHelpers.sRGB_TO_LINEAR_255_LUT;
  let visiblePixels = 0;
  let i = 0,
    len = data.length;
  for (; i <= len - 32; i += 32) {
    for (let k = 0; k < 32; k += 4) {
      const alpha = data[i + k + 3];
      if (alpha === 0) continue;

      const brightness = (LUT255[data[i+k]] * R + LUT255[data[i+k+1]] * G + LUT255[data[i+k+2]] * B + 0.5) | 0;
      histogram[brightness]++;
      visiblePixels++;
    }
  }

  for (; i < len; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;

    const brightness = (LUT255[data[i]] * R + LUT255[data[i+1]] * G + LUT255[data[i+2]] * B + 0.5) | 0;
    histogram[brightness]++;
    visiblePixels++;
  }
  if (visiblePixels === 0) return 0;

  let entropy = 0;
  for (let j = 0; j < 256; j++) {
    const h = histogram[j];
    if (h) {
      const p = h / visiblePixels;
      entropy -= p * Math.log2(p);
    }
  }

  if (this?.advancedMetrics?.frameEntropy) {
    const history = this.advancedMetrics.frameEntropy;
    history.push(entropy);
    if (history.length > maxHistory) history.shift();
  }

  // if (entropy < 3 || entropy > 7) console.warn('Entropy outlier:', entropy);

  return entropy;
};
