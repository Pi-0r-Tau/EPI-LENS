window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.frameEntropy = function (imageData, maxHistory = 1000) {
  if (!imageData?.data || !imageData.width || !imageData.height) return 0;

  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const pixels = width * height;
  if (pixels === 0) return 0;

  const histogram = new Uint32Array(256); // 8-bit brightness bins
  const rWeight = 0.2126,
    gWeight = 0.7152,
    bWeight = 0.0722;

  let i = 0,
    len = data.length;
  for (; i <= len - 32; i += 32) {
    for (let k = 0; k < 32; k += 4) {
      let r = data[i + k],
        g = data[i + k + 1],
        b = data[i + k + 2];
      r = typeof r === "number" && !isNaN(r) ? r : 0;
      g = typeof g === "number" && !isNaN(g) ? g : 0;
      b = typeof b === "number" && !isNaN(b) ? b : 0;
      let brightness = Math.round(r * rWeight + g * gWeight + b * bWeight);
      brightness = Math.max(0, Math.min(255, brightness));
      histogram[brightness]++;
    }
  }

  for (; i < len; i += 4) {
    let r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    r = typeof r === "number" && !isNaN(r) ? r : 0;
    g = typeof g === "number" && !isNaN(g) ? g : 0;
    b = typeof b === "number" && !isNaN(b) ? b : 0;
    let brightness = Math.round(r * rWeight + g * gWeight + b * bWeight);
    brightness = Math.max(0, Math.min(255, brightness));
    histogram[brightness]++;
  }

  let entropy = 0;
  for (let j = 0; j < 256; j++) {
    const h = histogram[j];
    if (h) {
      const p = h / pixels;
      entropy -= p * Math.log2(p);
    }
  }

  // Manage capped entropy history
  const history = this.advancedMetrics.frameEntropy;
  history.push(entropy);
  if (history.length > maxHistory) history.shift();

  // if (entropy < 3 || entropy > 7) console.warn('Entropy outlier:', entropy);

  return entropy;
};
