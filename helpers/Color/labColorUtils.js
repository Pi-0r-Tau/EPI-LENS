/**
 * Converts RGB color values to CIE L,a,b color space.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @return {Object} L a b color object with properties L, a, b
 */
window.AnalyzerHelpers = window.AnalyzerHelpers || {};

window.AnalyzerHelpers.rgbToLab = function (r, g, b) {
  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255)
    throw new Error("RGB values out of range [0,255]");

  const RGB_TO_XYZ = [
    0.4124, 0.3576, 0.1805, 0.2126, 0.7152, 0.0722, 0.0193, 0.1192, 0.9505,
  ];
  const REF_X = 0.95047,
    REF_Y = 1.0,
    REF_Z = 1.08883;

  // Normalize and gamma correct
  const srgb = [r, g, b];
  for (let i = 0; i < 3; ++i) {
    let v = srgb[i] / 255;
    srgb[i] = v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
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
  if (!data || data.length === 0 || data.length % 4 !== 0) return [];
  // Quantize each channel to 3 bits
  // Map key: 0xRRGGBB integer, value: count
  const colorMap = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // reduce computation for transparent pixels; ignore them don't want them skewing resultss
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
