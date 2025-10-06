window.AnalyzerHelpers = window.AnalyzerHelpers || {};
AnalyzerHelpers.coverage = function (imageData, brightnessThreshold = 0.5) {
  if (!imageData?.data || imageData.data.length < 4) return 0;
  const { data, width, height } = imageData;

  const luminanceFn = AnalyzerHelpers.luminance;
  const totalPixels = width * height;
  let brightPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (luminanceFn(data, i) > brightnessThreshold) {
      brightPixels++;
    }
  }

  return totalPixels ? brightPixels / totalPixels : 0;
};