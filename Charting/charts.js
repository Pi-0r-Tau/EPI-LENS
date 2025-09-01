/**
 * @file charts.js
 * @description Chart drawing uses the charts-helpers.js
 * @module charts
 */

let analysisData = [];
let availableFields = [];
let charts = [];
let playbackIndex = 0;
let playbackTimer = null;
let isPlaying = false;


let zoomMode = 'fit';
let zoomWindowSize = 40;
let chartViewMode = 'multi';

// selection zoom
let selectionZoom = null; // {startIdx, endIdx} or null
let normalizeMetrics = false;

document.addEventListener('DOMContentLoaded', async () => {
    let header = document.querySelector('header');
    if (header && !document.getElementById('loadJsonBtn')) {
        //JSON load button
        const loadBtn = document.createElement('button');
        loadBtn.id = 'loadJsonBtn';
        loadBtn.textContent = 'Load JSON';
        loadBtn.style.marginLeft = '8px';
        loadBtn.onclick = openJsonFileDialog;
        header.querySelector('div').appendChild(loadBtn);

        // NDJSON load button
        const loadNdJsonBtn = document.createElement('button');
        loadNdJsonBtn.id = 'loadNdJsonBtn';
        loadNdJsonBtn.textContent = 'Load NDJSON';
        loadNdJsonBtn.style.marginLeft = '8px';
        loadNdJsonBtn.onclick = openNdJsonFileDialog;
        header.querySelector('div').appendChild(loadNdJsonBtn);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.style.display = 'none';
        fileInput.id = 'jsonFileInput';
        fileInput.onchange = handleJsonFileSelected;
        document.body.appendChild(fileInput);

        const ndJsonFileInput = document.createElement('input');
        ndJsonFileInput.type = 'file';
        ndJsonFileInput.accept = '.ndjson,application/x-ndjson';
        ndJsonFileInput.style.display = 'none';
        ndJsonFileInput.id = 'ndJsonFileInput';
        ndJsonFileInput.onchange = handleNdJsonFileSelected;
        document.body.appendChild(ndJsonFileInput);
    }

    if (header && !document.getElementById('customizeColorsBtn')) {
        const customizeBtn = document.createElement('button');
        customizeBtn.id = 'customizeColorsBtn';
        customizeBtn.textContent = 'Customize Colors';
        customizeBtn.style.marginLeft = '8px';
        customizeBtn.onclick = () => {
            window.MetricColorHelpers.showMetricColorCustomizer(
                availableFields,
                () => renderAllCharts()
            );
        };
        header.querySelector('div').appendChild(customizeBtn);
    }

    if (header && !document.getElementById('normalizeMetricsBtn')) {
        const normalizeBtn = document.createElement('button');
        normalizeBtn.id = 'normalizeMetricsBtn';
        normalizeBtn.textContent = 'Normalize Metrics';
        normalizeBtn.style.marginLeft = '8px';
        normalizeBtn.onclick = () => {
            normalizeMetrics = !normalizeMetrics;
            normalizeBtn.textContent = normalizeMetrics ? 'Unnormalize Metrics' : 'Normalize Metrics';
            renderAllCharts();
        };
        header.querySelector('div').appendChild(normalizeBtn);
    }
    await loadData();
    setupAddChartModal();
    setupPlaybackControls();
    if (availableFields.length >= 2) {
        addChart('timestamp', 'brightness');
    }

    let exportAllBtn = document.getElementById('exportAllChartsBtn');
    if (exportAllBtn) {
        exportAllBtn.onclick = () => exportChartData();
    }
    // Zoom controls
    let zoomControls = document.getElementById('zoomControls');
    if (!zoomControls) {
        zoomControls = document.createElement('div');
        zoomControls.id = 'zoomControls';
        zoomControls.style.margin = '12px 0 8px 0';
        zoomControls.style.display = 'flex';
        zoomControls.style.gap = '10px';
        zoomControls.style.alignItems = 'center';

        const fitBtn = document.createElement('button');
        fitBtn.textContent = 'Fit All';
        fitBtn.onclick = () => {
            zoomMode = 'fit';
            renderAllCharts();
        };
        const windowBtn = document.createElement('button');
        windowBtn.textContent = 'Zoom Window';
        windowBtn.onclick = () => {
            zoomMode = 'window';
            renderAllCharts();
        };
        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Reset Zoom';
        resetBtn.onclick = () => {
            zoomMode = 'fit';
            renderAllCharts();
        };

        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'Toggle Chart View';
        viewBtn.onclick = () => {
            chartViewMode = chartViewMode === 'multi' ? 'single' : 'multi';
            renderAllCharts();
        };
        zoomControls.appendChild(fitBtn);
        zoomControls.appendChild(windowBtn);
        zoomControls.appendChild(resetBtn);
        zoomControls.appendChild(viewBtn);

        const container = document.querySelector('.charts-container');
        if (container) container.insertBefore(zoomControls, container.firstChild.nextSibling);
    }
})

async function loadData() {
    if (window.chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['epilensAnalysisData'], (result) => {
            if (result.epilensAnalysisData) {
                try {
                    const parsed = JSON.parse(result.epilensAnalysisData);
                    if (parsed.analysis && Array.isArray(parsed.analysis)) {
                        analysisData = parsed.analysis.map(row => flattenMetrics(row));
                        availableFields = Object.keys(analysisData[0] || {});
                        renderAllCharts();
                    }
                } catch (e) {
                    showError('Failed to parse analysis data.');
                }
            } else {
                showError('No analysis data found.');
            }
        });
    } else {
        showError('chrome.storage.local not available.');
    }
}

const ALL_METRICS = [
    // Rejigged to use the same case as Flatten Metrics,
    // Also added more metrics to choose from, as the NDJSON is the full analytical export and users can now import a NDJSON file.
    // Although not all of these metrics do currently export the math is there so nice task for later. Some of these are arrays so won't chart well but,
    // the user can still export them as a JSON/CSV/NDJSON. So pretty neat.
    // This was a pain to do.
    { key: "brightness", label: "Brightness", color: "#2196f3" },
    { key: "intensity", label: "Flash Intensity", color: "#f44336" },
    { key: "redIntensity", label: "Red Intensity", color: "#e53935" },
    { key: "redDelta", label: "Red Delta", color: "#ff5252" },
    { key: "riskLevel", label: "Risk", color: "#ff9800", convert: v => v === 'high' ? 1 : v === 'medium' ? 0.5 : 0 },
    { key: "psiScore", label: "PSI Score", color: "#8bc34a" },
    { key: "psi.frequency", label: "PSI Frequency", color: "#8bc34a" },
    { key: "psi.intensity", label: "PSI Intensity", color: "#8bc34a" },
    { key: "psi.coverage", label: "PSI Coverage", color: "#8bc34a" },
    { key: "psi.duration", label: "PSI Duration", color: "#8bc34a" },
    { key: "flickerFrequency", label: "Flicker Freq", color: "#00bcd4" },
    { key: "entropy", label: "Entropy", color: "#9c27b0" },
    { key: "dominantColor.r", label: "DomColor R", color: "#ff1744" },
    { key: "dominantColor.g", label: "DomColor G", color: "#00e676" },
    { key: "dominantColor.b", label: "DomColor B", color: "#2979ff" },
    { key: "dominantLab.L", label: "DomLab L", color: "#fff176" },
    { key: "dominantLab.a", label: "DomLab a", color: "#f06292" },
    { key: "dominantLab.b", label: "DomLab b", color: "#ba68c8" },
    { key: "cie76Delta", label: "CIE76 Δ", color: "#ffea00" },
    { key: "spectralFlatness", label: "Spectral Flatness", color: "#ffd600" },
    { key: "spectralAnalysis.confidence", label: "Spectral Confidence", color: "#440e0eff" },
    { key: "colorVariance.current.r", label: "Color Var R", color: "#ff9800" },
    { key: "colorVariance.current.g", label: "Color Var G", color: "#ffc107" },
    { key: "colorVariance.current.b", label: "Color Var B", color: "#ffeb3b" },
    { key: "colorVariance.temporal.r", label: "Color Temp R", color: "#ff5722" },
    { key: "colorVariance.temporal.g", label: "Color Temp G", color: "#ff9800" },
    { key: "colorVariance.temporal.b", label: "Color Temp B", color: "#ffc107" },
    { key: "colorVariance.averageChange.r", label: "Color Avg Change R", color: "#4caf50" },
    { key: "colorVariance.averageChange.g", label: "Color Avg Change G", color: "#4caf50" },
    { key: "colorVariance.averageChange.b", label: "Color Avg Change B", color: "#4caf50" },
    { key: "colorVariance.averageChange.magnitude", label: "Color Avg Change Magnitude", color: "#cddc39" },
    { key: "colorVariance.spikes", label: "Color Spikes", color: "#8bc34a" },
    { key: "patternedStimulusScore", label: "Patterned Stimulus Score", color: "#03a9f4" },
    { key: "sceneChangeScore", label: "Scene Change Score", color: "#9e9e9e" },
    { key: "temporalCoherence.coherenceScore", label: "Temporal Coherence Score", color: "#607d8b" },
    { key: "temporalContrast.currentRate", label: "Temporal Contrast Rate", color: "#c4907dff" },
    { key: "edgeDetection.edgeDensity", label: "Edge Density", color: "#3f51b5" },
    { key: "edgeDetection.edgeCount", label: "Edge Count", color: "#9c27b0" },
    { key: "edgeDetection.temporalEdgeChange", label: "Edge Change Rate", color: "#673ab7" },
    { key: "spatialMap.center", label: "Spatial Map Center", color: "#9dff00ff" },
    { key: "spatialMap.periphery", label: "Spatial Map Periphery", color: "#ffc107" },
    { key: "frameDifference.difference", label: "Frame Diff", color: "#4f36f4ff" },
    { key: "frameDifference.motion", label: "Motion Ratio", color: "#ffeb3b" },
    { key: "spectralAnalysis.dominantFrequency", label: "Spectral Dominant Freq", color: "#9c27b0" },
    { key: "spectralAnalysis.dominantInstFreq", label: "Spectral Dominant Inst Freq", color: "#e91e63" },
    { key: "spectralAnalysis.spectralFlatness", label: "Spectral Flatness", color: "#673ab7" },
    { key: "temporalContrast.maxRate", label: "Max Temporal Contrast Rate", color: "#3f51b5" },
    { key: "spatialMap.quadrant1", label: "Spatial Map Q1", color: "#8bc34a" },
    { key: "spatialMap.quadrant2", label: "Spatial Map Q2", color: "#cddc39" },
    { key: "spatialMap.quadrant3", label: "Spatial Map Q3", color: "#2bb640ff" },
    { key: "spatialMap.quadrant4", label: "Spatial Map Q4", color: "#ffc107" },
    { key: "chromaticFlashes.redGreen", label: "Red-Green Contrast", color: "#e6c715ff" },
    { key: "chromaticFlashes.blueYellow", label: "Blue-Yellow Contrast", color: "#ecf32185" },
    { key: "contrastSensitivity.sensitivity", label: "Contrast Sensitivity", color: "#ffb300" },
    { key: "contrastSensitivity.fluctuations", label: "Contrast Fluctuations", color: "#ff7043" },
    { key: "contrastSensitivity.averageDeltaE", label: "Contrast Avg DeltaE", color: "#ab47bc" },
    { key: "contrastSensitivity.maxDeltaE", label: "Contrast Max DeltaE", color: "#26a69a" },
    { key: "contrastSensitivity.significantChanges", label: "Contrast Significant Changes", color: "#789262" },
    { key: "contrastSensitivity.totalSamples", label: "Contrast Total Samples", color: "#8d6e63" },
    { key: "contrastSensitivity.fluctuationRate", label: "Contrast Fluctuation Rate", color: "#ffa726" },
    { key: "contrastSensitivity.weightedAverageDeltaE", label: "Contrast Weighted Avg DeltaE", color: "#42a5f5" },
    { key: "contrastSensitivity.windowSize", label: "Contrast Window Size", color: "#bdbdbd" },
    { key: "contrastSensitivity.weightDecay", label: "Contrast Weight Decay", color: "#789262" },
    { key: "contrastSensitivity.coefficientOfVariation", label: "Contrast Coefficient of Variation", color: "#e57373" },
    { key: "contrastSensitivity.medianDeltaE", label: "Contrast 90th Percentile DeltaE", color: "#64b5f6" },
    { key: "contrastSensitivity.p90DeltaE", label: "Contrast 90th Percentile DeltaE", color: "#81c784" },
    { key: "contrastSensitivity.p95DeltaE", label: "Contrast 95th Percentile DeltaE", color: "#ffd54f" },
    { key: "temporalContrastSensitivity.duration", label: "Temporal Contrast Duration", color: "#a1887f" },
    { key: "temporalContrastSensitivity.sampleCount", label: "Temporal Contrast Sample Count", color: "#bcaaa4" },
    { key: "temporalContrastSensitivity.sensitivity", label: "Temporal Contrast Sensitivity", color: "#d7ccc8" },
    { key: "temporalContrastSensitivity.fluctuations", label: "Temporal Contrast Fluctuations", color: "#efebe9" },
    { key: "temporalContrastSensitivity.averageDeltaE", label: "Temporal Contrast Avg DeltaE", color: "#ff6f00" },
    { key: "temporalContrastSensitivity.maxDeltaE", label: "Temporal Contrast Max DeltaE", color: "#ff8f00" },
    { key: "temporalContrastSensitivity.significantChanges", label: "Temporal Contrast Significant Changes", color: "#ffa000" },
    { key: "temporalContrastSensitivity.totalSamples", label: "Temporal Contrast Total Samples", color: "#ffb300" },
    { key: "temporalContrastSensitivity.fluctuationRate", label: "Temporal Contrast Fluctuation Rate", color: "#ffc107" },
    { key: "temporalContrastSensitivity.weightedAverageDeltaE", label: "Temporal Contrast Weighted Avg DeltaE", color: "#ffca28" },
    { key: "temporalContrastSensitivity.coefficientOfVariation", label: "Temporal Contrast Coefficient of Variation", color: "#ffe082" },
    { key: "temporalContrastSensitivity.medianDeltaE", label: "Temporal Contrast Median DeltaE", color: "#ffecb3" },
    { key: "temporalContrastSensitivity.p90DeltaE", label: "Temporal Contrast 90th Percentile DeltaE", color: "#fff3e0" },
    { key: "temporalContrastSensitivity.p95DeltaE", label: "Temporal Contrast 95th Percentile DeltaE", color: "#fff8e1" },
    { key: "temporalContrastSensitivity.streamWeightedAverageDeltaE", label: "Temporal Contrast Stream Weighted Avg DeltaE", color: "#fffde7" },
    { key: "redMetrics.redAreaAvg", label: "Red Area Average", color: "#d32f2f" },
    { key: "redMetrics.redAreaMax", label: "Red Area Maximum", color: "#f44336" },
    { key: "redMetrics.redOnFraction", label: "Red On Fraction", color: "#e57373" },
    { key: "redMetrics.redTransitions", label: "Red Transitions", color: "#ff5722" },
    { key: "redMetrics.redFlashEvents", label: "Red Flash Events", color: "#ff7043" },
    { key: "redMetrics.redFlashPerSecond", label: "Red Flash Per Second", color: "#ff8a65" },
    { key: "redMetrics.redFlickerInRiskBand", label: "Red Flicker In Risk Band", color: "#ffab91", convert: v => v ? 1 : 0 }
];


/**
 * Flattens nested metrics for charting and table display.
 * @param {Object} row
 * @returns {Object} Flattened row.
 */
function flattenMetrics(row) {
    const flat = { ...row };

    // colorVariance
    if (row.colorVariance) {
        flat['colorVariance.current.r'] = Number(row.colorVariance?.current?.r ?? 0);
        flat['colorVariance.current.g'] = Number(row.colorVariance?.current?.g ?? 0);
        flat['colorVariance.current.b'] = Number(row.colorVariance?.current?.b ?? 0);
        flat['colorVariance.temporal.r'] = Number(row.colorVariance?.temporal?.r ?? 0);
        flat['colorVariance.temporal.g'] = Number(row.colorVariance?.temporal?.g ?? 0);
        flat['colorVariance.temporal.b'] = Number(row.colorVariance?.temporal?.b ?? 0);
        flat['colorVariance.averageChange.r'] = Number(row.colorVariance?.averageChange?.r ?? 0);
        flat['colorVariance.averageChange.g'] = Number(row.colorVariance?.averageChange?.g ?? 0);
        flat['colorVariance.averageChange.b'] = Number(row.colorVariance?.averageChange?.b ?? 0);
        flat['colorVariance.averageChange.magnitude'] = Number(row.colorVariance?.averageChange?.magnitude ?? 0);
        flat['colorVariance.spikes'] = Array.isArray(row.colorVariance?.spikes) ? row.colorVariance.spikes.length : 0;
    }

    // psi
    if (row.psi) {
        flat['psi.score'] = Number(row.psi?.score ?? 0);
        flat['psi.frequency'] = Number(row.psi?.components?.frequency ?? 0);
        flat['psi.intensity'] = Number(row.psi?.components?.intensity ?? 0);
        flat['psi.coverage'] = Number(row.psi?.components?.coverage ?? 0);
        flat['psi.duration'] = Number(row.psi?.components?.duration ?? 0);
    }

    // frameDifference
    if (row.frameDifference) {
        flat['frameDifference.difference'] = Number(row.frameDifference?.difference ?? 0);
        flat['frameDifference.motion'] = Number(row.frameDifference?.motion ?? 0);
    }

    // spectralAnalysis
    if (row.spectralAnalysis) {
        flat['spectralAnalysis.dominantFrequency'] = Number(row.spectralAnalysis?.dominantFrequency ?? 0);
        flat['spectralAnalysis.dominantInstFreq'] = Number(row.spectralAnalysis?.dominantInstFreq ?? 0);
        flat['spectralAnalysis.spectralFlatness'] = Number(row.spectralAnalysis?.spectralFlatness ?? row.spectralFlatness ?? 0);
        flat['spectralAnalysis.confidence'] = Number(row.spectralAnalysis?.confidence ?? 0);
    }
    if (typeof row.spectralFlatness !== "undefined") {
        flat['spectralFlatness'] = Number(row.spectralFlatness ?? 0);
    }

    // temporalCoherence
    if (row.temporalCoherence) {
        flat['temporalCoherence.coherenceScore'] = Number(row.temporalCoherence?.coherenceScore ?? row.temporalCoherence?.score ?? 0);
    }

    // edgeDetection
    if (row.edgeDetection) {
        flat['edgeDetection.edgeDensity'] = Number(row.edgeDetection?.edgeDensity ?? row.edgeDetection?.density ?? 0);
        flat['edgeDetection.edgeCount'] = Number(row.edgeDetection?.edgeCount ?? row.edgeDetection?.count ?? 0);
        flat['edgeDetection.temporalEdgeChange'] = Number(row.edgeDetection?.temporalEdgeChange ?? row.edgeDetection?.change ?? 0);
    }

    // spatialMap
    if (row.spatialMap) {
        flat['spatialMap.center'] = Number(row.spatialMap?.center ?? 0);
        flat['spatialMap.periphery'] = Number(row.spatialMap?.periphery ?? 0);
        if (Array.isArray(row.spatialMap?.quadrants)) {
            row.spatialMap.quadrants.forEach((q, i) => {
                flat[`spatialMap.quadrant${i + 1}`] = Number(q ?? 0);
            });
        }
    }

    // chromaticFlashes
    if (row.chromaticFlashes) {
        flat['chromaticFlashes.redGreen'] = Number(row.chromaticFlashes?.redGreen ?? 0);
        flat['chromaticFlashes.blueYellow'] = Number(row.chromaticFlashes?.blueYellow ?? 0);
    }

    // temporalContrast
    if (row.temporalContrast) {
        flat['temporalContrast.currentRate'] = Number(row.temporalContrast?.currentRate ?? 0);
        flat['temporalContrast.maxRate'] = Number(row.temporalContrast?.maxRate ?? 0);
    }

    // redIntensity and redDelta
    flat['redIntensity'] = Number(row.redIntensity ?? 0);
    flat['redDelta'] = Number(row.redDelta ?? 0);


    // dominantColor
    if (row.dominantColor) {
        flat['dominantColor.r'] = Number(row.dominantColor?.r ?? 0);
        flat['dominantColor.g'] = Number(row.dominantColor?.g ?? 0);
        flat['dominantColor.b'] = Number(row.dominantColor?.b ?? 0);
    }
    // dominantLab
    if (row.dominantLab) {
        flat['dominantLab.L'] = Number(row.dominantLab?.L ?? 0);
        flat['dominantLab.a'] = Number(row.dominantLab?.a ?? 0);
        flat['dominantLab.b'] = Number(row.dominantLab?.b ?? 0);
    }
    // cie76Delta
    if (typeof row.cie76Delta !== "undefined") {
        flat['cie76Delta'] = Number(row.cie76Delta ?? 0);
    }
    // Patterned Stimulus
    if (typeof row.patternedStimulusScore !== "undefined") {
        flat['patternedStimulusScore'] = Number(row.patternedStimulusScore ?? 0);
    }

    // Scene Change Detection
    flat['sceneChangeScore'] = Number(row.sceneChangeScore ?? 0);



    // Contrast Sensitivity
    if (row.contrastSensitivity) {
        const cs = row.contrastSensitivity;
        flat['contrastSensitivity.sensitivity'] = Number(cs.sensitivity ?? 0);
        flat['contrastSensitivity.fluctuations'] = Number(cs.fluctuations ?? 0);
        flat['contrastSensitivity.averageDeltaE'] = Number(cs.averageDeltaE ?? 0);
        flat['contrastSensitivity.maxDeltaE'] = Number(cs.maxDeltaE ?? 0);
        flat['contrastSensitivity.significantChanges'] = Number(cs.significantChanges ?? 0);
        flat['contrastSensitivity.totalSamples'] = Number(cs.totalSamples ?? 0);
        flat['contrastSensitivity.fluctuationRate'] = Number(cs.fluctuationRate ?? 0);
        flat['contrastSensitivity.weightedAverageDeltaE'] = Number(cs.weightedAverageDeltaE ?? 0);
        flat['contrastSensitivity.coefficientOfVariation'] = Number(cs.coefficientOfVariation ?? 0);
        flat['contrastSensitivity.medianDeltaE'] = Number(cs.medianDeltaE ?? 0);
        flat['contrastSensitivity.p90DeltaE'] = Number(cs.p90DeltaE ?? 0);
        flat['contrastSensitivity.p95DeltaE'] = Number(cs.p95DeltaE ?? 0)
    }

    // Temporal Contrast Sensitivity
    if (row.temporalContrastSensitivity) {
        const tcs = row.temporalContrastSensitivity;
        flat['temporalContrastSensitivity.duration'] = Number(tcs.duration ?? 0);
        flat['temporalContrastSensitivity.sampleCount'] = Number(tcs.sampleCount ?? 0);
        flat['temporalContrastSensitivity.sensitivity'] = Number(tcs.sensitivity ?? 0);
        flat['temporalContrastSensitivity.fluctuations'] = Number(tcs.fluctuations ?? 0);
        flat['temporalContrastSensitivity.averageDeltaE'] = Number(tcs.averageDeltaE ?? 0);
        flat['temporalContrastSensitivity.maxDeltaE'] = Number(tcs.maxDeltaE ?? 0);
        flat['temporalContrastSensitivity.significantChanges'] = Number(tcs.significantChanges ?? 0);
        flat['temporalContrastSensitivity.totalSamples'] = Number(tcs.totalSamples ?? 0);
        flat['temporalContrastSensitivity.fluctuationRate'] = Number(tcs.fluctuationRate ?? 0);
        flat['temporalContrastSensitivity.weightedAverageDeltaE'] = Number(tcs.weightedAverageDeltaE ?? 0);
        flat['temporalContrastSensitivity.coefficientOfVariation'] = Number(tcs.coefficientOfVariation ?? 0);
        flat['temporalContrastSensitivity.medianDeltaE'] = Number(tcs.medianDeltaE ?? 0);
        flat['temporalContrastSensitivity.p90DeltaE'] = Number(tcs.p90DeltaE ?? 0);
        flat['temporalContrastSensitivity.p95DeltaE'] = Number(tcs.p95DeltaE ?? 0);
        flat['temporalContrastSensitivity.streamWeightedAverageDeltaE'] = Number(tcs.streamWeightedAverageDeltaE ?? 0);
    }
    // Red metrics
    if (row.redMetrics) {
        const rm = row.redMetrics;
        flat['redMetrics.redAreaAvg'] = Number(rm.redAreaAvg ?? 0);
        flat['redMetrics.redAreaMax'] = Number(rm.redAreaMax ?? 0);
        flat['redMetrics.redOnFraction'] = Number(rm.redOnFraction ?? 0);
        flat['redMetrics.redTransitions'] = Number(rm.redTransitions ?? 0);
        flat['redMetrics.redFlashEvents'] = Number(rm.redFlashEvents ?? 0);
        flat['redMetrics.redFlashPerSecond'] = Number(rm.redFlashPerSecond ?? 0);
        flat['redMetrics.redFlickerInRiskBand'] = rm.redFlickerInRiskBand ? 1 : 0;
    }
    return flat;
}

function showError(msg) {
    document.body.innerHTML = `<div style="color:#f44336;padding:32px;text-align:center;">${msg}</div>`;
}

/**
 * Returns a color for a metric name.
 * @param {string} metric
 * @returns {string}
 */
function getMetricColor(metric) {
    return window.MetricColorHelpers.getMetricColor(metric);
}

function setupAddChartModal() {
    const modal = document.getElementById('modal');
    const addChartBtn = document.getElementById('addChartBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const createChartBtn = document.getElementById('createChartBtn');
    const xAxisSelect = document.getElementById('xAxisSelect');
    const yAxisSelectContainer = document.getElementById('yAxisSelectContainer');
    const xAxisSearch = document.getElementById('xAxisSearch');
    const yAxisSearch = document.getElementById('yAxisSearch');

    let yAxisChecked = new Set();
    const metricLabel = window.MetricColorHelpers.metricKeyToLabel;

    const groupMetrics = [
        'colorVariance', 'psi', 'frameDifference', 'spectralAnalysis',
        'temporalCoherence', 'edgeDetection', 'dominantColor', 'dominantLab'
    ];

    function isGroupMetric(field) {
        return groupMetrics.some(g => field.toLowerCase() === g.toLowerCase());
    }

    function renderXAxisOptions(filter = "") {
        xAxisSelect.innerHTML = "";
        availableFields
            .filter(f => !isGroupMetric(f))
            .filter(f => f.toLowerCase().includes(filter.toLowerCase()))
            .forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = metricLabel(f);
                xAxisSelect.appendChild(opt);
            });
        if (xAxisSelect.options.length > 0) xAxisSelect.selectedIndex = 0;
    }

    function renderYAxisOptions(filter = "") {
        yAxisSelectContainer.innerHTML = "";
        availableFields
            .filter(f => !isGroupMetric(f))
            .filter(f => f.toLowerCase().includes(filter.toLowerCase()))
            .forEach(f => {
                const label = document.createElement('label');
                label.className = 'y-axis-checkbox-label' + (yAxisChecked.has(f) ? ' selected' : '');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'y-axis-checkbox';
                checkbox.value = f;
                checkbox.checked = yAxisChecked.has(f);
                checkbox.onchange = () => {
                    if (checkbox.checked) yAxisChecked.add(f);
                    else yAxisChecked.delete(f);
                    label.classList.toggle('selected', checkbox.checked);
                };
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(metricLabel(f)));
                yAxisSelectContainer.appendChild(label);
            });
    }

    addChartBtn.onclick = () => {
        yAxisChecked.clear();
        renderXAxisOptions();
        renderYAxisOptions();
        xAxisSearch.value = "";
        yAxisSearch.value = "";
        // Defaulted to always having brightness selected as default metric, this way annoying, keeping it incase I need it
       // if (availableFields.length > 1) {
         //   let defaultY = availableFields[1] !== availableFields[0] ? availableFields[1] : availableFields[0];
         //   yAxisChecked.add(defaultY);
        //    renderYAxisOptions();
       // }
        modal.classList.remove('hidden');
    };
    closeModalBtn.onclick = () => modal.classList.add('hidden');

    xAxisSearch.oninput = () => renderXAxisOptions(xAxisSearch.value);
    yAxisSearch.oninput = () => renderYAxisOptions(yAxisSearch.value);

    xAxisSelect.onchange = () => {
        if (yAxisChecked.has(xAxisSelect.value)) {
            yAxisChecked.delete(xAxisSelect.value);
            renderYAxisOptions(yAxisSearch.value);
        }
    };

    createChartBtn.onclick = () => {
        const x = xAxisSelect.value;
        const y = Array.from(yAxisChecked).filter(val => val !== x);
        if (x && y.length) {
            addChart(x, y);
            modal.classList.add('hidden');
        }
    };
}

function addChart(xField, yFields) {
    if (!xField || !Array.isArray(yFields) || !yFields.length) return;
    // Prevent adding charts with the same x/y combo
    if (charts.some(c => c.x === xField && JSON.stringify(c.y) === JSON.stringify(yFields))) return;
    charts.push({
        x: xField,
        y: yFields,
        showData: false,
        visible: yFields.map(() => true),
        metricChartTypes: yFields.reduce((acc, y) => { acc[y] = 'line'; return acc; }, {})
    });
    renderAllCharts();
}

function renderAllCharts() {
    const area = document.getElementById('chartsArea');
    area.innerHTML = '';
    area.className = chartViewMode === 'single' ? 'chartsArea-single' : '';
    let resetViewBtn = document.getElementById('resetViewBtn');
    if (selectionZoom && selectionZoom.start != null && selectionZoom.end != null) {
        if (!resetViewBtn) {
            resetViewBtn = document.createElement('button');
            resetViewBtn.id = 'resetViewBtn';
            resetViewBtn.textContent = 'Reset View';
            resetViewBtn.style.margin = '0 0 16px 0';
            resetViewBtn.onclick = () => {
                selectionZoom = null;
                renderAllCharts();
            };
            area.parentNode.insertBefore(resetViewBtn, area);
        }
    } else if (resetViewBtn) {
        resetViewBtn.remove();
    }
    charts.forEach((chart, idx) => {
        try {
            area.appendChild(renderChartCard(chart, idx, idx));
        } catch (e) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'chart-card';
            errorDiv.style.color = '#f44336';
            errorDiv.textContent = 'Chart error: ' + (e && e.message ? e.message : e);
            area.appendChild(errorDiv);
        }
    });
}

function renderChartCard(chart, idx) {
    const card = document.createElement('div');
    card.className = 'chart-card';
    if (chartViewMode === 'single') {
        card.style.width = '98%';
        card.style.maxWidth = 'none';
        card.style.minWidth = '0';
        card.style.margin = '0 auto 24px auto';
    } else {
        card.style.width = '';
        card.style.maxWidth = '';
        card.style.minWidth = '';
        card.style.margin = '';
    }

    const header = document.createElement('div');
    header.className = 'chart-header';
    const title = document.createElement('span');
    title.className = 'chart-title';
    const metricLabel = window.MetricColorHelpers.metricKeyToLabel;
    title.textContent = `${chart.y.map(metricLabel).join(', ')} vs ${metricLabel(chart.x)}`;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'chart-actions';

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.textContent = '-';
    zoomOutBtn.title = 'Zoom Out';
    zoomOutBtn.onclick = (e) => {
        e.stopPropagation();
        zoomMode = 'window';
        zoomWindowSize = Math.min(zoomWindowSize + 10, Math.max(analysisData.length, 10));

        if (isPlaying) {
        } else {

            playbackIndex = Math.max(0, Math.min(playbackIndex, analysisData.length - 1));
        }
        renderAllCharts();
    };
    actions.appendChild(zoomOutBtn);

    const zoomInBtn = document.createElement('button');
    zoomInBtn.textContent = '+';
    zoomInBtn.title = 'Zoom In';
    zoomInBtn.onclick = (e) => {
        e.stopPropagation();
        zoomMode = 'window';
        zoomWindowSize = Math.max(5, zoomWindowSize - 10);

        if (isPlaying) {
        } else {
            playbackIndex = Math.max(0, Math.min(playbackIndex, analysisData.length - 1));
        }
        renderAllCharts();
    };
    actions.appendChild(zoomInBtn);

    const upBtn = document.createElement('button');
    upBtn.textContent = '↑';
    upBtn.title = 'Move chart up';
    upBtn.disabled = idx === 0;
    upBtn.onclick = () => {
        if (idx > 0) {
            [charts[idx - 1], charts[idx]] = [charts[idx], charts[idx - 1]];
            renderAllCharts();
        }
    };
    const downBtn = document.createElement('button');
    downBtn.textContent = '↓';
    downBtn.title = 'Move chart down';
    downBtn.disabled = idx === charts.length - 1;
    downBtn.onclick = () => {
        if (idx < charts.length - 1) {
            [charts[idx], charts[idx + 1]] = [charts[idx + 1], charts[idx]];
            renderAllCharts();
        }
    };
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);

    const showDataBtn = document.createElement('button');
    showDataBtn.textContent = chart.showData ? 'Hide Data' : 'Show Data';
    showDataBtn.onclick = () => {
        chart.showData = !chart.showData;
        renderAllCharts();
    };
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.onclick = () => exportChartData([chart]);
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => {
        charts.splice(idx, 1);
        renderAllCharts();
    };
    actions.appendChild(showDataBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(removeBtn);
    header.appendChild(actions);

    const legend = document.createElement('div');
    legend.style.marginBottom = '6px';
    chart.y.forEach((yMetric, yIdx) => {
        const color = getMetricColor(yMetric);
        const legendItem = document.createElement('span');
        legendItem.style.display = 'inline-flex';
        legendItem.style.alignItems = 'center';
        legendItem.style.marginRight = '18px';
        legendItem.style.cursor = 'pointer';

        const chartTypeSelect = document.createElement('select');
        chartTypeSelect.style.marginLeft = '6px';
        chartTypeSelect.title = 'Change chart type for this metric';
        [
            { value: 'line', label: 'Line' },
            { value: 'scatter', label: 'Scatter' },
            { value: 'bar', label: 'Bar' }
        ].forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            chartTypeSelect.appendChild(o);
        });
        chartTypeSelect.value = chart.metricChartTypes[yMetric] || 'line';
        chartTypeSelect.onchange = (e) => {
            chart.metricChartTypes[yMetric] = chartTypeSelect.value;
            renderAllCharts();
        };

        legendItem.innerHTML = `<span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:2px;margin-right:5px;opacity:${chart.visible[yIdx] ? 1 : 0.3};"></span>
            <span style="color:${chart.visible[yIdx] ? '#fff' : '#888'};font-size:13px;">${window.MetricColorHelpers.metricKeyToLabel(yMetric)}</span>`;
        legendItem.onclick = (e) => {
            if (e.target === chartTypeSelect) return;
            chart.visible[yIdx] = !chart.visible[yIdx];
            renderAllCharts();
        };
        legendItem.appendChild(chartTypeSelect);
        legend.appendChild(legendItem);
    });
    card.appendChild(header);
    card.appendChild(legend);

    const canvas = document.createElement('canvas');
    canvas.className = 'chart-canvas';
    if (chartViewMode === 'single') {
        canvas.width = 900;
        canvas.height = 400;
        canvas.style.width = '100%';
        canvas.style.height = '400px';
    } else {
        canvas.width = 420;
        canvas.height = 220;
        canvas.style.width = '';
        canvas.style.height = '';
    }
    card.appendChild(canvas);

    if (chart.y.length === 1 && chart.y[0] === 'isFlash') {
        window.ChartHelpers.drawIsFlashScatter(canvas, chart, getMultiYAxisChartData);
    } else {
        window.ChartHelpers.drawMultiYAxisMixed(
            canvas,
            chart,
            getMultiYAxisChartData,
            getMetricColor,
            chart.metricChartTypes
        );
    }

    let isSelecting = false;
    let selectStart = null;
    let selectEnd = null;
    let selectionRect = null;

    canvas.onmousedown = (e) => {
        isSelecting = true;
        const rect = canvas.getBoundingClientRect();
        selectStart = e.clientX - rect.left;
        selectEnd = null;
        if (!selectionRect) {
            selectionRect = document.createElement('div');
            selectionRect.style.position = 'absolute';
            selectionRect.style.background = 'rgba(33,150,243,0.18)';
            selectionRect.style.border = '1.5px solid #2196f3';
            selectionRect.style.pointerEvents = 'none';
            selectionRect.style.zIndex = 20;
            card.appendChild(selectionRect);
        }
        selectionRect.style.display = 'block';
    };
    canvas.onmousemove = (e) => {
        if (!isSelecting) return;
        const rect = canvas.getBoundingClientRect();
        selectEnd = e.clientX - rect.left;
        const x1 = Math.min(selectStart, selectEnd);
        const x2 = Math.max(selectStart, selectEnd);
        selectionRect.style.left = (canvas.offsetLeft + x1) + 'px';
        selectionRect.style.top = (canvas.offsetTop) + 'px';
        selectionRect.style.width = (x2 - x1) + 'px';
        selectionRect.style.height = canvas.height + 'px';
    };
    canvas.onmouseup = (e) => {
        if (!isSelecting) return;
        isSelecting = false;
        selectionRect && (selectionRect.style.display = 'none');
        const rect = canvas.getBoundingClientRect();
        selectEnd = e.clientX - rect.left;
        const data = getMultiYAxisChartData(chart);
        const [start, end] = getZoomedIndices(data.x.length);
        const xVals = data.x;
        const left = 40, right = 10, w = canvas.width - left - right;
        let minPx = Math.min(selectStart, selectEnd);
        let maxPx = Math.max(selectStart, selectEnd);
        let minIdx = 0, maxIdx = xVals.length - 1;
        for (let i = 0; i < xVals.length; ++i) {
            let px = left + ((i) / (xVals.length - 1)) * w;
            if (px >= minPx) { minIdx = i; break; }
        }
        for (let i = xVals.length - 1; i >= 0; --i) {
            let px = left + ((i) / (xVals.length - 1)) * w;
            if (px <= maxPx) { maxIdx = i; break; }
        }
        // Set selection zoom globally for all charts
        if (minIdx < maxIdx) {
            selectionZoom = { start: start + minIdx, end: start + maxIdx + 1 };
            renderAllCharts();
        }
    };
    // Right-click to reset selection zoom TASK 2847: This is buggy, fallback is the reset zoom button.
    canvas.oncontextmenu = (e) => {
        e.preventDefault();
        selectionZoom = null;
        renderAllCharts();
    };

    if (window.TooltipHelpers && window.TooltipHelpers.setupChartTooltipAndInteraction) {
        window.TooltipHelpers.setupChartTooltipAndInteraction(
            canvas, card, chart, getChartDataForDraw, getMetricColor
        );
    }

    if (chart.showData) {
        const table = document.createElement('table');
        table.className = 'data-table';
        const thead = document.createElement('thead');
        thead.innerHTML = `<tr><th>${chart.x}</th>${chart.y.map(y => `<th>${y}</th>`).join('')}</tr>`;
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        let data = getMultiYAxisChartData(chart);
        for (let i = 0; i < data.x.length; ++i) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${formatCell(data.x[i], chart.x)}</td>` +
                chart.y.map((y, j) => `<td>${formatCell(data.y[j][i], y)}</td>`).join('');
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        card.appendChild(table);
    }

    return card;
}

function getMultiYAxisChartData(chart) {
    let data = { x: [], y: chart.y.map(() => []) };
    analysisData.forEach(row => {
        data.x.push(row[chart.x]);
        chart.y.forEach((y, j) => data.y[j].push(row[y]));
    });
    let [start, end] = getZoomedIndices(data.x.length);
    if (selectionZoom && selectionZoom.start != null && selectionZoom.end != null) {
        start = selectionZoom.start;
        end = selectionZoom.end;
    }
    data.x = data.x.slice(start, end);
    data.y = data.y.map(arr => arr.slice(start, end));

    if (normalizeMetrics) {
        data.y = data.y.map((arr, idx) => {
            const metric = chart.y[idx];
            if (
                metric === 'isFlash' ||
                metric === 'duration' ||
                metric.endsWith('.duration')
            ) return arr;
            // If all values are 0, skip normalization
            if (arr.every(v => v === 0)) return arr;
            const min = Math.min(...arr);
            const max = Math.max(...arr);
            if (min === max) return arr.map(() => 0.5);
            return arr.map(v => (v - min) / (max - min));
        });
    }
    return data;
}

function getZoomedIndices(dataLen) {
    if (zoomMode === 'fit' || !isPlaying && zoomMode !== 'window') {
        return [0, dataLen];
    }

    const half = Math.floor(zoomWindowSize / 2);
    let start = Math.max(0, playbackIndex - half);
    let end = Math.min(dataLen, playbackIndex + half + 1);
    if (start === end) end = Math.min(dataLen, start + 1);
    return [start, end];
}

/**
 * Gets chart data and drawing bounds for rendering and tooltips.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} chart
 * @returns {Object}
 */
function getChartDataForDraw(canvas, chart) {
    const left = 40, right = 10, top = 20, bottom = 30;
    const w = canvas.width - left - right;
    const h = canvas.height - top - bottom;
    let data = getMultiYAxisChartData(chart);
    let minX = Math.min(...data.x), maxX = Math.max(...data.x);
    let minY = Math.min(...data.y.flat()), maxY = Math.max(...data.y.flat());
    if (minX === maxX) maxX += 1;
    if (minY === maxY) maxY += 1;
    return { xVals: data.x, yVals: data.y, left, w, h, minX, maxX, minY, maxY };
}

function exportChartData(selectedCharts) {
    if (!selectedCharts) selectedCharts = charts;
    showExportOptionsDialog(selectedCharts);
}

function showExportOptionsDialog(selectedCharts) {
    const exportModal = document.getElementById('exportOptionsModal');
    const savedPrefs = JSON.parse(localStorage.getItem('epilens_export_preferences') || '{"csv":true,"json":true,"ndjson":true}');

    document.getElementById('exportCSVOption').checked = savedPrefs.csv;
    document.getElementById('exportJSONOption').checked = savedPrefs.json;
    document.getElementById('exportNDJSONOption').checked = savedPrefs.ndjson;

    if (!exportModal.hasInitialized) {
        document.getElementById('exportSelectedFormatsBtn').addEventListener('click', () => {
            const exportCSV = document.getElementById('exportCSVOption').checked;
            const exportJSON = document.getElementById('exportJSONOption').checked;
            const exportNDJSON = document.getElementById('exportNDJSONOption').checked;

            if (!exportCSV && !exportJSON && !exportNDJSON) {
                alert('Please select at least one export format');
                return;
            }

            localStorage.setItem('epilens_export_preferences', JSON.stringify({
                csv: exportCSV,
                json: exportJSON,
                ndjson: exportNDJSON
            }));

            exportModal.classList.add('hidden');
            performExport(selectedCharts, { exportCSV, exportJSON, exportNDJSON });
        });

        document.getElementById('cancelExportBtn').addEventListener('click', () => {
            exportModal.classList.add('hidden');
        });

        exportModal.hasInitialized = true;
    }

    exportModal.classList.remove('hidden');
}

function performExport(selectedCharts, options = {}) {
    let allMetrics = new Set();
    selectedCharts.forEach(chart => {
        allMetrics.add(chart.x);
        chart.y.forEach(y => allMetrics.add(y));
    });
    allMetrics = Array.from(allMetrics);

    let csvData = '';
    let jsonData = [];
    let ndjsonData = '';

    if (options.exportCSV) {
        csvData = allMetrics.join(',') + '\n';
        for (let i = 0; i < analysisData.length; ++i) {
            csvData += allMetrics.map(m => analysisData[i][m] ?? '').join(',') + '\n';
        }
    }

    if (options.exportJSON || options.exportNDJSON) {
        jsonData = analysisData.map(row => {
            const obj = {};
            allMetrics.forEach(m => obj[m] = row[m]);
            return obj;
        });

        if (options.exportNDJSON) {
            ndjsonData = jsonData.map(obj => JSON.stringify(obj)).join('\n');
        }
    }

    let exportDelay = 0;

    if (options.exportCSV) {
        setTimeout(() => {
            const blobCsv = new Blob([csvData], { type: 'text/csv' });
            downloadFile(blobCsv, 'epilens-charts-export.csv');
        }, exportDelay);
        exportDelay += 150;
    }

    if (options.exportJSON) {
        setTimeout(() => {
            const blobJson = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
            downloadFile(blobJson, 'epilens-charts-export.json');
        }, exportDelay);
        exportDelay += 150;
    }

    if (options.exportNDJSON) {
        setTimeout(() => {
            const blobNdjson = new Blob([ndjsonData], { type: 'application/x-ndjson' });
            downloadFile(blobNdjson, 'epilens-charts-export.ndjson');
        }, exportDelay);
    }
}

function downloadFile(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
    }, 300);
}


function formatCell(val, key) {
    if (val == null) return '';
    if (typeof val === 'object') {
        // Show the key in the tooltip for context
        return `<pre title="Field: ${key}" style="white-space:pre-wrap;font-size:11px;">${JSON.stringify(val, null, 1)}</pre>`;
    }
    // Show the key as a tooltip for all cells TASK 2849: This is buggy at the moment refer to notes regarding the Story.
    return `<span title="Field: ${key}">${val}</span>`;
}

function setupPlaybackControls() {
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const seekBar = document.getElementById('seekBar');
    const playbackTime = document.getElementById('playbackTime');

    // Restart, step, and speed controls
    let restartBtn = document.getElementById('restartBtn');
    if (!restartBtn) {
        restartBtn = document.createElement('button');
        restartBtn.id = 'restartBtn';
        restartBtn.textContent = '⏮';
        restartBtn.style.marginRight = '4px';
        playBtn.parentNode.insertBefore(restartBtn, playBtn);
    }
    let stepBtn = document.getElementById('stepBtn');
    if (!stepBtn) {
        stepBtn = document.createElement('button');
        stepBtn.id = 'stepBtn';
        stepBtn.textContent = '⏭';
        stepBtn.style.marginLeft = '4px';
        pauseBtn.parentNode.insertBefore(stepBtn, pauseBtn.nextSibling);
    }
    let speedSelect = document.getElementById('playbackSpeed');
    if (!speedSelect) {
        speedSelect = document.createElement('select');
        speedSelect.id = 'playbackSpeed';
        [0.25, 0.5, 1, 2, 4].forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = `${s}x`;
            if (s === 1) opt.selected = true;
            speedSelect.appendChild(opt);
        });
        pauseBtn.parentNode.appendChild(speedSelect);
    }

    let playbackSpeed = 1;

    playBtn.onclick = () => {
        if (!isPlaying) {
            isPlaying = true;
            playback();
        }
    };
    pauseBtn.onclick = () => {
        isPlaying = false;
        if (playbackTimer) clearTimeout(playbackTimer);
    };
    seekBar.oninput = () => {
        playbackIndex = Number(seekBar.value);
        renderAllCharts();
        updatePlaybackTime();
    };
    restartBtn.onclick = () => {
        playbackIndex = 0;
        renderAllCharts();
        updatePlaybackTime();
        if (!isPlaying) {
            isPlaying = true;
            playback();
        }
    };
    stepBtn.onclick = () => {
        playbackIndex = Math.min(playbackIndex + 1, analysisData.length - 1);
        renderAllCharts();
        updatePlaybackTime();
    };
    speedSelect.onchange = () => {
        playbackSpeed = Number(speedSelect.value);
    };

    function playback() {
        if (!isPlaying || !analysisData.length) return;
        if (playbackIndex >= analysisData.length - 1) {
            isPlaying = false;
            return;
        }
        playbackIndex++;
        renderAllCharts();
        updatePlaybackTime();
        seekBar.value = playbackIndex;
        playbackTimer = setTimeout(playback, 30 / playbackSpeed);
    }

    function updatePlaybackTime() {
        playbackTime.textContent = `${playbackIndex + 1} / ${analysisData.length}`;
        seekBar.max = analysisData.length ? analysisData.length - 1 : 0;
        seekBar.value = playbackIndex;
    }

    seekBar.max = analysisData.length ? analysisData.length - 1 : 0;
    seekBar.value = playbackIndex;
    updatePlaybackTime();
}

function openJsonFileDialog() {
    const fileInput = document.getElementById('jsonFileInput');
    if (fileInput) fileInput.click();
}

function handleJsonFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
        try {
            const json = JSON.parse(evt.target.result);
            let data;

            // Handle JSON being JSON
            if (Array.isArray(json)) {
                // Direct array of data
                data = json;
            } else if (json.analysis && Array.isArray(json.analysis)) {
                // MyEPI-LENS standard format
                data = json.analysis;
            } else if (json.data && Array.isArray(json.data)) {
                // OR format with data property
                data = json.data;
            } else {
                // When all else fails try to use the JSON object directly
                data = [json];
            }

            if (data.length > 0) {
                analysisData = data.map(row => flattenMetrics(row));
                availableFields = Object.keys(analysisData[0] || {});
                charts = [];
                playbackIndex = 0;
                renderAllCharts();
            } else {
                showError('No data found in JSON file.');
            }
        } catch (err) {
            showError('Failed to parse JSON file: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function openNdJsonFileDialog() {
    const fileInput = document.getElementById('ndJsonFileInput');
    if (fileInput) fileInput.click();
}

function handleNdJsonFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
        try {
            const content = evt.target.result;
            // Basically unwrap NDJSON into an array of objects
            const jsonLines = content.split(/\r?\n/).filter(line => line.trim());
            const parsedData = jsonLines.map(line => JSON.parse(line));

            if (parsedData.length > 0) {
                // Convert NDJSON to the same format as JSON
                analysisData = parsedData.map(row => flattenMetrics(row));
                availableFields = Object.keys(analysisData[0] || {});
                charts = [];
                playbackIndex = 0;
                renderAllCharts();
            } else {
                showError('No data found in NDJSON file.');
            }
        } catch (err) {
            showError('Failed to parse NDJSON file: ' + err.message);
        }
    };
    reader.readAsText(file);
}