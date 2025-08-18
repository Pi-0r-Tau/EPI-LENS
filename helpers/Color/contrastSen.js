// Contrast sensitivity between a sequence of colors.
window.AnalyzerHelpers.calculateContrastSensitivity = function (
  colors,
  options = {}
) {
  // AH for the long preamble for the helpers
  const AH = window.AnalyzerHelpers;
  const rgbToLab = AH.rgbToLab;
  const cie76 = AH.cie76;
  const PercentileTree = AH.PercentileTree;

  // Prepare Lab input
  const hasLabsArray = Array.isArray(options.labs);
  let labsArray,
    labsStartIndex = 0,
    segmentLength;

  if (hasLabsArray) {
    labsArray = options.labs;
    labsStartIndex = options.labsStart | 0;
    segmentLength =
      typeof options.length === 'number'
        ? options.length
        : labsArray.length - labsStartIndex;
  } else {
    const inputColors = Array.isArray(colors) ? colors : [];
    if (inputColors.length < 2) {
      return {
        sensitivity: 0,
        fluctuations: 0,
        averageDeltaE: 0,
        maxDeltaE: 0,
        significantChanges: 0,
        error: 'Insufficient valid colors', // Not valid data
      };
    }
    labsArray = [];
    for (let i = 0; i < inputColors.length; i++) {
      const color = inputColors[i];
      if (
        color &&
        typeof color.r === 'number' &&
        typeof color.g === 'number' &&
        typeof color.b === 'number'
      ) {
        labsArray.push(rgbToLab(color.r, color.g, color.b));
      }
    }
    segmentLength = labsArray.length;
  }

  if (segmentLength < 2) {
    return {
      sensitivity: 0,
      fluctuations: 0,
      averageDeltaE: 0,
      maxDeltaE: 0,
      significantChanges: 0,
      error: 'Insufficient valid colors', // Not enough valid data
    };
  }

  // Threshold
  // 2.3 JND Just Noticeable Difference
  const JND = 2.3; // For CIE76, if not accurate enough will look at 1.0 for CIEDE2000
  // CIEDE2000 is more accurate but slower, SO CIE76 for now.
  const deltaEThreshold =
    typeof options.threshold === 'number' ? options.threshold : JND;

  const useWeighting = options.useWeighting !== false;

  // Index-based weighting parameters
  const indexWindowSize =
    typeof options.windowSize === 'number' && options.windowSize > 1
      ? options.windowSize
      : 50;

  const indexWeightDecay =
    typeof options.weightDecay === 'number'
      ? options.weightDecay
      : Math.log(2) / indexWindowSize;

  // Time-based weighting parameters
  const timestampsArray = Array.isArray(options.timestamps)
    ? options.timestamps
    : null;
  const timestampsStartIndex = options.timestampsStart | 0;
  const halfLifeMs = options.halfLifeMs;
  const useTimeWeighting =
    !!timestampsArray &&
    typeof halfLifeMs === 'number' &&
    halfLifeMs > 0 &&
    timestampsArray.length >= timestampsStartIndex + segmentLength;

  const lambdaMs = useTimeWeighting
    ? Math.log(2) / halfLifeMs
    : null;
  const currentTimestamp = useTimeWeighting
    ? timestampsArray[timestampsStartIndex + segmentLength - 1]
    : 0;

  let deltaECount = 0;
  let meanDeltaE = 0;
  let sumSquaredDiffs = 0;
  let maxDeltaE = 0;
  let significantChangeCount = 0;

  // Time-weighted average accumulators
  let timeWeightedSum = 0;
  let timeWeightTotal = 0; // Not the best naming, but not very good at naming things

  const computePercentiles = options.computePercentiles !== false;
  const needDeltaEsArray =
    computePercentiles || (useWeighting && !useTimeWeighting);
  const deltaCount = segmentLength - 1;
  const deltaEs = needDeltaEsArray ? new Array(deltaCount) : null;

  let previousLab = labsArray[labsStartIndex];
  for (let k = 1; k < segmentLength; k++) {
    const currentLab = labsArray[labsStartIndex + k];
    const deltaE = cie76(previousLab, currentLab);
    deltaECount++;
    const delta = deltaE - meanDeltaE;
    meanDeltaE += delta / deltaECount;
    const delta2 = deltaE - meanDeltaE;
    sumSquaredDiffs += delta * delta2;

    if (deltaE > maxDeltaE) maxDeltaE = deltaE;
    if (deltaE >= deltaEThreshold) significantChangeCount++;

    if (needDeltaEsArray) {
      deltaEs[k - 1] = deltaE;
    }

    if (useTimeWeighting) {
      const t_i = timestampsArray[timestampsStartIndex + k];
      const dt = currentTimestamp - t_i;
      const weight = Math.exp(-dt * lambdaMs);
      timeWeightedSum += deltaE * weight;
      timeWeightTotal += weight;
    }

    previousLab = currentLab;
  }

  const averageDeltaE = deltaECount ? meanDeltaE : 0;
  const useSampleStdDev = !!options.sampleStdDev;
  const variance = deltaECount
    ? sumSquaredDiffs /
    (useSampleStdDev && deltaECount > 1 ? deltaECount - 1 : deltaECount)
    : 0;
  const fluctuationScore = Math.sqrt(variance);
  const coefficientOfVariation =
    averageDeltaE !== 0 ? fluctuationScore / averageDeltaE : 0;

  let weightedAverageDeltaE;
  if (useWeighting) {
    if (useTimeWeighting) {
      weightedAverageDeltaE = timeWeightTotal
        ? timeWeightedSum / timeWeightTotal
        : 0;
    } else if (needDeltaEsArray && deltaECount) {
      const baseDecay = Math.exp(-indexWeightDecay);
      let weight = 1;
      let weightSum = 0;
      let weightedDeltaSum = 0;
      const lastIdx = deltaECount - 1;
      const startIdx = Math.max(0, deltaECount - indexWindowSize);
      for (let idx = lastIdx; idx >= startIdx; idx--) {
        const d = deltaEs[idx];
        weightedDeltaSum += d * weight;
        weightSum += weight;
        weight *= baseDecay;
      }
      weightedAverageDeltaE = weightSum ? weightedDeltaSum / weightSum : 0;
    } else {
      weightedAverageDeltaE = 0;
    }
  }

  // Percentile calculations... These are heavy but I like them.
  // Frame to frame percentiles are provide as default, however sliding window percentiles are only provide via the offline video analysis
  // This is due to the trade off of plug and play via the yt analyzer via popup.js/html meaning that timestamps are not interval enforced
  let medianDeltaE = 0,
    p90DeltaE = 0,
    p95DeltaE = 0;
  if (computePercentiles && needDeltaEsArray && deltaECount) {
    // console.log('DeltaEs:', deltaEs);
    // Weighted percentile AVL tree for percentiles
    const tree = PercentileTree.fromArray(deltaEs);
    // console.log('PercentileTree:', tree);
    medianDeltaE = tree.quantile(50) ?? 0;
    p90DeltaE = tree.quantile(90) ?? 0;
    p95DeltaE = tree.quantile(95) ?? 0;

  }

  const sensitivity = Math.min(100, (averageDeltaE / deltaEThreshold) * 100);

  // Little helper to round values to 2 decimal places, helps with sanity in the output.
  function round2(val) {
    return Math.round(val * 100) / 100;
  }

  return {
    sensitivity: round2(sensitivity),
    fluctuations: round2(fluctuationScore),
    averageDeltaE: round2(averageDeltaE),
    maxDeltaE: round2(maxDeltaE),
    significantChanges: significantChangeCount,
    totalSamples: segmentLength,
    fluctuationRate: deltaECount
      ? Math.round((significantChangeCount / deltaECount) * 10000) / 100
      : 0,
    weightedAverageDeltaE:
      weightedAverageDeltaE !== undefined
        ? round2(weightedAverageDeltaE)
        : undefined,
    windowSize: indexWindowSize,
    weightDecay: indexWeightDecay,
    coefficientOfVariation: Math.round(coefficientOfVariation * 1000) / 1000,
    medianDeltaE: round2(medianDeltaE),
    p90DeltaE: round2(p90DeltaE),
    p95DeltaE: round2(p95DeltaE),
    // DEBUG
    // lambdaMs: useTimeWeighting ? (Math.log(2) / halfLifeMs) : null,
    // halfLifeMs: halfLifeMs
  };
};

/**
 * Contrast sensitivity over time via a sliding window
 * analyzeTemporalContrastSensitivity is used explicitly in fileanalyzer.js it is toggled on and off via a checkbox in the fileanalyzer.html
 * As it is used in the fileanalyzer.js it is impacted by the analyzeVideoAtFixedIntervals function, this allows users to choose the sampling rate
 * However this means that the EMA decay and window size must be adapted to the sampling rate.
 */
window.AnalyzerHelpers.analyzeTemporalContrastSensitivity = function (
  colorTimeSeries,
  windowSizeMs = 1000,
  options = {}
) {
  const analyzer = this;
  // Only run for fileanalyzer.js/html if temporal contrast enabled
  if (!analyzer || !analyzer.isFileAnalyzer || !analyzer.temporalContrastEnabled) {
    return [];
  }

  if (!Array.isArray(colorTimeSeries) || colorTimeSeries.length === 0) {
    console.warn('No color time series data provided.');
    return [];
  }

  const validSamples = colorTimeSeries.filter(
    (sample) => sample && typeof sample.timestamp === 'number' && sample.color
  );
  const sortedSeries = options.sorted
    ? validSamples
    : validSamples.sort((a, b) => a.timestamp - b.timestamp);

  if (sortedSeries.length === 0) {
    console.warn('No valid samples with timestamps in color time series.');
    return [];
  }

  // Adapt to analysis interval use provided values or calculate from data
  const analysisInterval = options.analysisInterval || analyzer.analysisInterval || (1 / 30);
  const effectiveFPS = options.effectiveFPS || (1 / analysisInterval);

  // Adjust window size based on analysis interval
  const minSamplesPerWindow = Math.max(5, Math.ceil(1 / analysisInterval)); // give or take 1 second worth of samples

  const adaptiveWindowSize = Math.max(
    windowSizeMs,
    minSamplesPerWindow * analysisInterval * 1000
  );

  // Sampling rate adapative time decay
  const halfLifeMs = options.halfLifeMs || Math.max(250, adaptiveWindowSize / 4);
  const lambdaMs = Math.log(2) / halfLifeMs;
  let lastTimestamp = null;
  let rollingWeightedSum = 0;
  let rollingWeightTotal = 0;
  let lastLab = null;

  const n = sortedSeries.length;
  const labs = new Array(n);
  const timestamps = new Array(n);
  for (let i = 0; i < n; i++) {
    const sample = sortedSeries[i];
    labs[i] = window.AnalyzerHelpers.rgbToLab(
      sample.color.r,
      sample.color.g,
      sample.color.b
    );
    timestamps[i] = sample.timestamp;
  }

  const windows = [];
  let startIdx = 0;

  const indexWindowSize =
    typeof options.windowSize === 'number'
      ? options.windowSize
      : Math.max(10, Math.round(adaptiveWindowSize / (analysisInterval * 1000)));

  const luminanceWindowSize =
    typeof options.luminanceWindowSize === 'number'
      ? options.luminanceWindowSize
      : indexWindowSize;

  const analysisOptions = {
    threshold: options.threshold,
    useWeighting: options.useWeighting,
    windowSize: luminanceWindowSize,
    weightDecay: options.weightDecay || (Math.log(2) / indexWindowSize),
    sampleStdDev: options.sampleStdDev,
    computePercentiles: options.computePercentiles,
    labs,
    timestamps,
    halfLifeMs: halfLifeMs,
    labsStart: 0, // set in loop (SIL)
    timestampsStart: 0, // SIL
    length: 0, // SIL
  };

  for (let endIdx = 0; endIdx < n; endIdx++) {
    const windowEndTime = timestamps[endIdx];
    const currentLab = labs[endIdx];

    // Streaming EMA of deltaE across the entire series
    if (lastLab) {
      const deltaE = window.AnalyzerHelpers.cie76(lastLab, currentLab);
      const dt =
        lastTimestamp !== null ? timestamps[endIdx] - lastTimestamp : 0;
      const decay = Math.exp(-dt * lambdaMs);
      rollingWeightedSum *= decay;
      rollingWeightTotal *= decay;
      rollingWeightedSum += deltaE;
      rollingWeightTotal += 1;
    }
    lastLab = currentLab;
    lastTimestamp = timestamps[endIdx];

    // Slide start to maintain duration within adaptive window size
    while (
      startIdx < endIdx &&
      windowEndTime - timestamps[startIdx] > adaptiveWindowSize
    ) {
      startIdx++;
    }

    if (endIdx - startIdx + 1 >= minSamplesPerWindow) {
      analysisOptions.labsStart = startIdx;
      analysisOptions.timestampsStart = startIdx;
      analysisOptions.length = endIdx - startIdx + 1;

      const analysis = window.AnalyzerHelpers.calculateContrastSensitivity(
        null,
        analysisOptions
      );

      if (rollingWeightTotal > 0) {
        analysis.streamWeightedAverageDeltaE =
          Math.round((rollingWeightedSum / rollingWeightTotal) * 100) / 100;
      }
      analysis.analysisInterval = analysisInterval;
      analysis.effectiveFPS = effectiveFPS;
      analysis.adaptiveWindowSize = adaptiveWindowSize;

      windows.push({
        startTime: timestamps[startIdx],
        endTime: timestamps[endIdx],
        duration: timestamps[endIdx] - timestamps[startIdx],
        sampleCount: analysisOptions.length,
        ...analysis,
      });
    }
  }

  return windows;
};