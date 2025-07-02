/**
 * @file fileanalyzer.js
 * @description
 * Local video analysis suite for EPI-LENS. Handles UI logic, playlist management, live charting, and
 * real-time analysis of user-selected video files. Supports batch/playlist analysis, auto-export,
 * metric selection for live charts, and seamless integration with the main VideoAnalyzer engine.
 *
 * Features:
 * - Multi-file playlist support with auto-advance and auto-export (CSV/JSON) per video
 * - Live metrics chart with selectable metrics
 * - Real-time results panel with all computed metrics
 * - Export, restart, and charts view integration
 * - Responsive UI for analysis suite experience
 *
 * @module fileanalyzer
 */

"use strict";

let analyzer = null;
let isAnalyzing = false;
let analysisTimer = null;
let video = document.getElementById('videoPlayer');
let fileInput = document.getElementById('videoFileInput');
let controls = document.getElementById('analysisControls');
let resultsPanel = document.getElementById('fileAnalysisResults');
let liveChartArea = document.getElementById('liveChartArea');
let liveMetricsGraph = document.getElementById('liveMetricsGraph');
let liveMetricsLegend = document.getElementById('liveMetricsLegend');
let liveMetricsHistory = [];
let metricSelector = null;

const ALL_METRICS = [
    { key: "brightness", label: "Brightness", color: "#2196f3" },
    { key: "intensity", label: "Flash Intensity", color: "#f44336" },
    { key: "redIntensity", label: "Red Intensity", color: "#e53935" },
    { key: "redDelta", label: "Red Delta", color: "#ff5252" },
    { key: "riskLevel", label: "Risk", color: "#ff9800", convert: v => v === 'high' ? 1 : v === 'medium' ? 0.5 : 0 },
    { key: "psiScore", label: "PSI Score", color: "#8bc34a" },
    { key: "flickerFrequency", label: "Flicker Freq", color: "#00bcd4" },
    { key: "entropy", label: "Entropy", color: "#9c27b0" }
];

let selectedMetrics = ["brightness", "intensity", "riskLevel"];
let chartsBtn = null;
let restartBtn = null;
let playlist = [];
let playlistIndex = 0;
let playlistInfo = document.getElementById('playlistInfo');
let flashIntensityInput = document.getElementById('flashIntensityThreshold');
let flashesPerSecondInput = document.getElementById('flashesPerSecondThreshold');

// Threshold value displays
if (flashIntensityInput) {
    flashIntensityInput.addEventListener('input', () => {
        document.getElementById('flashIntensityValue').textContent = Number(flashIntensityInput.value).toFixed(2);
    });
}
if (flashesPerSecondInput) {
    flashesPerSecondInput.addEventListener('input', () => {
        document.getElementById('flashesPerSecondValue').textContent = Number(flashesPerSecondInput.value).toFixed(1);
    });
}

window.addEventListener('DOMContentLoaded', () => {
    if (!chartsBtn) {
        chartsBtn = document.createElement('button');
        chartsBtn.id = 'openChartsViewBtn';
        chartsBtn.textContent = 'Open Charts View';
        chartsBtn.style.background = '#ff9800';
        chartsBtn.style.color = '#fff';
        chartsBtn.style.marginLeft = '0';
        chartsBtn.style.marginRight = '8px';
        chartsBtn.onclick = openChartsView;
        if (controls) controls.appendChild(chartsBtn);
    }
    if (!restartBtn) {
        restartBtn = document.createElement('button');
        restartBtn.id = 'restartAnalysisBtn';
        restartBtn.textContent = 'Restart Analysis';
        restartBtn.style.background = '#f44336';
        restartBtn.style.color = '#fff';
        restartBtn.style.marginLeft = '0';
        restartBtn.onclick = restartAnalysis;
        if (controls) controls.appendChild(restartBtn);
    }
    if (controls) {
        Array.from(controls.children).forEach(btn => {
            btn.style.marginRight = '8px';
            btn.style.marginBottom = '8px';
        });
    }
    const flashesList = document.getElementById('SummaryFlashesList');
    const toggleBtn = document.getElementById('toggleFlashesListBtn');
    if (toggleBtn && flashesList) {
        toggleBtn.onclick = function() {
            if (flashesList.style.display === 'none' || flashesList.style.display === '') {
                flashesList.style.display = 'block';
                toggleBtn.textContent = 'Hide';
            } else {
                flashesList.style.display = 'none';
                toggleBtn.textContent = 'Show';
            }
        };
        // Default to hidden
        flashesList.style.display = 'none';
        toggleBtn.textContent = 'Show';
    }

    // Video resizing
    const videoPlayer = document.getElementById('videoPlayer');
    const videoSizeDown = document.getElementById('videoSizeDown');
    const videoSizeUp = document.getElementById('videoSizeUp');
    let videoSizes = [
        { width: "320px", height: "180px" },
        { width: "480px", height: "270px" },
        { width: "640px", height: "360px" },
        { width: "800px", height: "450px" },
        { width: "100%", height: "auto" }
    ];
    let videoSizeIdx = 2;
    
    function applyVideoSize() {
        if (!videoPlayer) return;
        const sz = videoSizes[videoSizeIdx];
        videoPlayer.style.width = sz.width;
        videoPlayer.style.height = sz.height;
        videoPlayer.style.maxWidth = "100%";
        videoPlayer.style.maxHeight = "600px";
    }
    if (videoPlayer) applyVideoSize();
    if (videoSizeDown) videoSizeDown.onclick = function() {
        if (videoSizeIdx > 0) { videoSizeIdx--; applyVideoSize(); }
    };
    if (videoSizeUp) videoSizeUp.onclick = function() {
        if (videoSizeIdx < videoSizes.length - 1) { videoSizeIdx++; applyVideoSize(); }
    };

    // Graoh resizing
    const liveMetricsGraph = document.getElementById('liveMetricsGraph');
    const graphSizeDown = document.getElementById('graphSizeDown');
    const graphSizeUp = document.getElementById('graphSizeUp');
    let graphSizes = [
        { w: 400, h: 200 },
        { w: 600, h: 300 },
        { w: 750, h: 400 },
        { w: 1000, h: 500 },
        { w: 1200, h: 600 }
    ];
    let graphSizeIdx = 2;

    function applyGraphSize() {
        if (!liveMetricsGraph) return;
        const sz = graphSizes[graphSizeIdx];
        liveMetricsGraph.width = sz.w;
        liveMetricsGraph.height = sz.h;
        liveMetricsGraph.style.width = "100%";
        liveMetricsGraph.style.height = sz.h + "px";
        drawLiveMetricsGraph();
    }
    if (liveMetricsGraph) applyGraphSize();
    if (graphSizeDown) graphSizeDown.onclick = function() {
        if (graphSizeIdx > 0) { graphSizeIdx--; applyGraphSize(); }
    };
    if (graphSizeUp) graphSizeUp.onclick = function() {
        if (graphSizeIdx < graphSizes.length - 1) { graphSizeIdx++; applyGraphSize(); }
    };
});

fileInput.addEventListener('change', handleFileSelect);
document.getElementById('startFileAnalysis').addEventListener('click', startAnalysis);
document.getElementById('stopFileAnalysis').addEventListener('click', stopAnalysis);
document.getElementById('exportFileCSV').addEventListener('click', exportCSV);
document.getElementById('exportFileJSON').addEventListener('click', exportJSON);

/**
 * Opens the charts view in a new browser tab using the analysis data
 * @param {object} analyzer - An object with `generateJSON` that returns analysis data
 * @param {HTMLVideoElement} video - The video element to be paused if playing
 * @returns {void}
 */
function openChartsView() {
    if (!analyzer) return;
    if (!video.paused) video.pause();
    const json = analyzer.generateJSON();
    chrome.storage.local.set({ epilensAnalysisData: json }, () => {
        window.open('charts.html', '_blank');
    });
}

function handleFileSelect(e) {
    playlist = Array.from(e.target.files);
    playlistIndex = 0;
    if (playlist.length === 0) return;
    loadVideoFromPlaylist(playlistIndex);
    updatePlaylistInfo();
}

function loadVideoFromPlaylist(index) {
    if (index < 0 || index >= playlist.length) return;
    const file = playlist[index];
    const url = URL.createObjectURL(file);
    video.src = url;
    video.style.display = 'block';
    controls.style.display = 'flex';
    resultsPanel.innerHTML = '';
    stopAnalysis();
    if (liveChartArea) liveChartArea.style.display = 'block';
    liveMetricsHistory = [];
    renderMetricSelector();
    drawLiveMetricsGraph();
    updatePlaylistInfo();

    // Sets videoTitle for metadata
    if (!analyzer) analyzer = new VideoAnalyzer();
    analyzer.videoTitle = file.name;
}

function updatePlaylistInfo() {
    if (!playlistInfo) return;
    if (playlist.length > 1) {
        playlistInfo.textContent = `Playlist: ${playlistIndex + 1} / ${playlist.length} — ${playlist[playlistIndex]?.name || ''}`;
    } else if (playlist.length === 1) {
        playlistInfo.textContent = `Loaded: ${playlist[0].name}`;
    } else {
        playlistInfo.textContent = '';
    }
}

function startAnalysis() {
    if (!video.src) return;
    if (!analyzer) analyzer = new VideoAnalyzer();
    analyzer.reset();

    let intensity = 0.2, flashesPerSecond = 3;
    if (flashIntensityInput && flashesPerSecondInput) {
        intensity = parseFloat(flashIntensityInput.value);
        flashesPerSecond = parseFloat(flashesPerSecondInput.value);
    }
    analyzer.updateThresholds({
        intensity: intensity,
        flashesPerSecond: flashesPerSecond
    });

    // Sets videoTitle for metadata
    if (playlist.length && playlist[playlistIndex]) {
        analyzer.videoTitle = playlist[playlistIndex].name;
    }

    try {
        const imageData = analyzer.captureFrame(video);
        if (imageData) {
            analyzer.metrics.lastFrameBrightness = analyzer.calculateAverageBrightness(imageData.data);
        }
    } catch (e) {
    }
    isAnalyzing = true;
    resultsPanel.innerHTML = '<div>Analyzing...</div>';
    liveMetricsHistory = [];
    drawLiveMetricsGraph();
    setSummaryPanelStatus("Analyzing");
    setSummaryPanelFile();
    if (video.paused) video.play();
    analyzeFrameLoop();

}

function stopAnalysis() {
    isAnalyzing = false;
    if (analysisTimer) clearTimeout(analysisTimer);
    if (!video.paused) video.pause();
    updateSummaryPanelStatus();
}

function restartAnalysis() {
    stopAnalysis();
    if (analyzer) analyzer.reset();
    liveMetricsHistory = [];
    resultsPanel.innerHTML = '';
    drawLiveMetricsGraph();
    updateLiveMetricsLegend();
    selectedMetrics = ["brightness", "intensity", "riskLevel"];
    renderMetricSelector();
    if (video) video.currentTime = 0;
    updateSummaryPanelStatus();
}

video.addEventListener('play', () => {
    if (isAnalyzing) analyzeFrameLoop();
    updateSummaryPanelStatus();
});
video.addEventListener('pause', () => {
    stopAnalysis();
    updateSummaryPanelStatus();
});
video.addEventListener('ended', () => {
    if (analyzer) {
        exportCSV(true);
        exportJSON(true);
    }

    try {
        if (analyzer && analyzer.timelineData && analyzer.timelineData.length > 0) {
            const psiScores = analyzer.timelineData
                .map(entry => Number(entry.psi?.score))
                .filter(score => typeof score === 'number' && !isNaN(score) && score !== 0);
            if (psiScores.length > 0) {
                const avgPsi = psiScores.reduce((a, b) => a + b, 0) / psiScores.length;
                const maxPsi = Math.max(...psiScores);
                document.getElementById('SummaryAvgPSI').textContent = avgPsi.toFixed(4);
                document.getElementById('SummaryMaxPSI').textContent = maxPsi.toFixed(4);
            } else {
                document.getElementById('SummaryAvgPSI').textContent = '-';
                document.getElementById('SummaryMaxPSI').textContent = '-';
            }

            const flashes = analyzer.timelineData
                .filter(entry => entry.isFlash)
                .map(entry => ({
                    timestamp: entry.timestamp,
                    intensity: entry.intensity
                }));
            let flashesDiv = document.getElementById('SummaryFlashesList');
            if (flashesDiv) {
                flashesDiv.innerHTML = renderFlashTimestamps(flashes);
            }
        }
    } catch (e) {}
    if (playlistIndex < playlist.length - 1) {
        playlistIndex++;
        loadVideoFromPlaylist(playlistIndex);
        setTimeout(() => {
            startAnalysis();
        }, 300);
    }
});

// Renders flash metrics as table
function renderFlashTimestamps(flashes) {
    if (!flashes || flashes.length === 0) {
        return '<div style="color:#888;">None</div>';
    }
    let html = `<table style="width:100%;border-collapse:collapse;font-size:0.98em;">
        <thead>
            <tr>
                <th style="text-align:left;padding:2px 6px;color:#90caf9;">t (s)</th>
                <th style="text-align:left;padding:2px 6px;color:#90caf9;">intensity</th>
            </tr>
        </thead>
        <tbody>`;
    flashes.forEach(f => {
        html += `<tr>
            <td style="padding:2px 6px;">${Number(f.timestamp).toFixed(2)}</td>
            <td style="padding:2px 6px;">${Number(f.intensity).toFixed(4)}</td>
        </tr>`;
    });
    html += `</tbody></table>`;
    return html;
}

function updateResults(result) {
    resultsPanel.innerHTML = `
    <div style="background:transparent;max-width:720px;margin:auto;">
        <table style="width:100%;border-radius:10px;overflow:hidden;background:rgba(30,32,36,0.98);color:#fff;font-size:1.08em;box-shadow:0 2px 8px #0002;border:2px solid #fff;">
            <tbody>
                <tr><th style="text-align:left;padding:8px 12px;background:rgba(255,255,255,0.08);color:#fff;">Metric</th><th style="text-align:left;padding:8px 12px;background:rgba(255,255,255,0.08);color:#fff;">Value</th></tr>
                <tr><td style="padding:7px 12px;">Time</td><td style="padding:7px 12px;">${result.timestamp !== undefined ? Number(result.timestamp).toFixed(2) : ''} s</td></tr>
                <tr><td style="padding:7px 12px;">Brightness</td><td style="padding:7px 12px;">${(result.brightness ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Red Intensity</td><td style="padding:7px 12px;">${(result.redIntensity ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Red Delta</td><td style="padding:7px 12px;">${(result.redDelta ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Flash Count</td><td style="padding:7px 12px;">${result.flashCount ?? 0}</td></tr>
                <tr><td style="padding:7px 12px;">Risk Level</td><td style="padding:7px 12px;text-transform:capitalize;">${result.riskLevel ?? ''}</td></tr>
                <tr><td style="padding:7px 12px;">PSI Score</td><td style="padding:7px 12px;">${(result.psi?.score ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Flicker Frequency</td><td style="padding:7px 12px;">${(result.flickerFrequency ?? 0).toFixed(2)} Hz</td></tr>
                <tr><td style="padding:7px 12px;">Entropy</td><td style="padding:7px 12px;">${(result.entropy ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Temporal Change</td><td style="padding:7px 12px;">${(result.temporalChange ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Frame Diff</td><td style="padding:7px 12px;">${(result.frameDifference?.difference ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Motion Ratio</td><td style="padding:7px 12px;">${(result.frameDifference?.motion ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Dominant Frequency</td><td style="padding:7px 12px;">${(result.spectralAnalysis?.dominantFrequency ?? 0).toFixed(2)} Hz</td></tr>
                <tr><td style="padding:7px 12px;">Intensity</td><td style="padding:7px 12px;">${(result.intensity ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Center Intensity</td><td style="padding:7px 12px;">${(result.spatialMap?.center ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Peripheral Intensity</td><td style="padding:7px 12px;">${(result.spatialMap?.periphery ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Red-Green Contrast</td><td style="padding:7px 12px;">${(result.chromaticFlashes?.redGreen ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Blue-Yellow Contrast</td><td style="padding:7px 12px;">${(result.chromaticFlashes?.blueYellow ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Temporal Contrast Rate</td><td style="padding:7px 12px;">${(result.temporalContrast?.currentRate ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Edge Density</td><td style="padding:7px 12px;">${(result.edgeDetection?.edgeDensity ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Edge Count</td><td style="padding:7px 12px;">${(result.edgeDetection?.edgeCount ?? 0)}</td></tr>
                <tr><td style="padding:7px 12px;">Edge Change Rate</td><td style="padding:7px 12px;">${(result.edgeDetection?.temporalEdgeChange ?? 0).toFixed(4)}</td></tr>
            </tbody>
        </table>
    </div>
    `;

    updateSummaryPanelFields(result);
    try {
        if (analyzer && analyzer.timelineData) {
            const flashes = analyzer.timelineData
                .filter(entry => entry.isFlash)
                .map(entry => ({
                    timestamp: entry.timestamp,
                    intensity: entry.intensity
                }));
            let flashesDiv = document.getElementById('SummaryFlashesList');
            if (flashesDiv) {
                flashesDiv.innerHTML = renderFlashTimestamps(flashes);
            }
        }
    } catch (e) {}
    try {
        if (analyzer && analyzer.timelineData) {
            const psiScores = analyzer.timelineData
                .map(entry => Number(entry.psi?.score))
                .filter(score => typeof score === 'number' && !isNaN(score) && score !== 0);
            if (psiScores.length > 0) {
                const avgPsi = psiScores.reduce((a, b) => a + b, 0) / psiScores.length;
                const maxPsi = Math.max(...psiScores);
                document.getElementById('SummaryAvgPSI').textContent = avgPsi.toFixed(4);
                document.getElementById('SummaryMaxPSI').textContent = maxPsi.toFixed(4);
            } else {
                document.getElementById('SummaryAvgPSI').textContent = '-';
                document.getElementById('SummaryMaxPSI').textContent = '-';
            }
        }
    } catch (e) {}
}

function updateSummaryPanelFields(result) {
    try {
        // Flashes, Risk, PSI
        document.getElementById('SummaryFlashes').textContent = result && result.flashCount !== undefined
            ? result.flashCount
            : '0';
        document.getElementById('SummaryRisk').textContent = result && result.riskLevel
            ? result.riskLevel
            : '-';
        document.getElementById('SummaryPSI').textContent = result && result.psi && result.psi.score !== undefined
            ? Number(result.psi.score).toFixed(4)
            : '-';
    } catch (e) {}
}

function updateLiveMetricsChart(data) {
    // Store a rolling history of metrics
    const maxPoints = 120;
    liveMetricsHistory.push({
        brightness: data.brightness || 0,
        intensity: data.intensity || 0,
        redIntensity: data.redIntensity || 0,
        redDelta: data.redDelta || 0,
        riskLevel: typeof data.riskLevel === "string" ? (data.riskLevel === 'high' ? 1 : data.riskLevel === 'medium' ? 0.5 : 0) : (data.riskLevel || 0),
        psiScore: data.psi?.score ?? 0,
        flickerFrequency: data.flickerFrequency || 0,
        entropy: data.entropy || 0,
        temporalChange: data.temporalChange || 0,
        frameDiff: data.frameDifference?.difference || 0
    });
    if (liveMetricsHistory.length > maxPoints) liveMetricsHistory.shift();
    drawLiveMetricsGraph();
    updateLiveMetricsLegend();
}

function drawLiveMetricsGraph() {
    if (!liveMetricsGraph) return;
    const ctx = liveMetricsGraph.getContext('2d');
    if (!ctx) return;
    const width = liveMetricsGraph.width;
    const height = liveMetricsGraph.height;
    ctx.clearRect(0, 0, width, height);

    // Draw axes
    ctx.strokeStyle = "#444";
    ctx.beginPath();
    ctx.moveTo(30, 10);
    ctx.lineTo(30, height - 10);
    ctx.lineTo(width - 10, height - 10);
    ctx.stroke();

    const metrics = ALL_METRICS.filter(m => selectedMetrics.includes(m.key));
    metrics.forEach(metric => {
        ctx.beginPath();
        ctx.strokeStyle = metric.color;
        ctx.lineWidth = 2;
        for (let i = 0; i < liveMetricsHistory.length; i++) {
            let val = liveMetricsHistory[i][metric.key];
            if (typeof val === "undefined") continue;
            const x = 30 + ((width - 40) * i) / (liveMetricsHistory.length - 1 || 1);
            let y = height - 10 - val * (height - 20);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    });
}

function updateLiveMetricsLegend() {
    if (!liveMetricsLegend) return;
    const metrics = ALL_METRICS.filter(m => selectedMetrics.includes(m.key));
    liveMetricsLegend.innerHTML = metrics.map(m =>
        `<span style="display:inline-flex;align-items:center;margin-right:18px;">
            <span style="display:inline-block;width:14px;height:14px;background:${m.color};border-radius:3px;margin-right:6px;"></span>
            <span style="color:#fff;font-size:13px;">${m.label}</span>
        </span>`
    ).join('');
}

function exportCSV(auto = false) {
    if (!analyzer) return;
    const csv = analyzer.generateCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    let filename = `epilens-file-analysis-${Date.now()}.csv`;
    if (playlist.length && playlist[playlistIndex]) {
        filename = `epilens-${sanitizeFileName(playlist[playlistIndex].name.replace(/\.[^/.]+$/, ""))}.csv`;
    }
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    if (!auto) a.click();
    else setTimeout(() => a.click(), 100); // Delay for auto to avoid race condition with JSON
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
}

function exportJSON(auto = false) {
    if (!analyzer) return;
    const json = analyzer.generateJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    let filename = `epilens-file-analysis-${Date.now()}.json`;
    if (playlist.length && playlist[playlistIndex]) {
        filename = `epilens-${sanitizeFileName(playlist[playlistIndex].name.replace(/\.[^/.]+$/, ""))}.json`;
    }
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    if (!auto) a.click();
    else setTimeout(() => a.click(), 200); // Delay for auto to avoid race condition with CSV
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
}

// Sanitizes file names for export
function sanitizeFileName(name) {
    return name.replace(/[^a-z0-9_\-\.]/gi, '_');
}

/**
 * Renders the metric selector UI for live chart metrics.
 */
function renderMetricSelector() {
    if (!liveChartArea) return;
    let metricSelectorDiv = document.getElementById('metricSelector');
    if (!metricSelectorDiv) {
        metricSelectorDiv = document.createElement('div');
        metricSelectorDiv.id = 'metricSelector';
        metricSelectorDiv.className = 'metric-selector';
        liveChartArea.insertBefore(metricSelectorDiv, liveMetricsGraph);
    }
    metricSelectorDiv.innerHTML = '<span style="margin-right:8px;color:#bbb;">Show:</span>';
    ALL_METRICS.forEach(metric => {
        const label = document.createElement('label');
        label.style.display = 'inline-flex';
        label.style.alignItems = 'center';
        label.style.cursor = 'pointer';
        label.style.marginRight = '10px';
        label.style.fontSize = '13px';
        label.innerHTML = `
            <input type="checkbox" value="${metric.key}" ${selectedMetrics.includes(metric.key) ? 'checked' : ''} style="margin-right:4px;">
            <span style="color:${metric.color};">${metric.label}</span>
        `;
        label.querySelector('input').onchange = function() {
            if (this.checked) {
                if (!selectedMetrics.includes(metric.key)) selectedMetrics.push(metric.key);
            } else {
                selectedMetrics = selectedMetrics.filter(k => k !== metric.key);
            }
            drawLiveMetricsGraph();
            updateLiveMetricsLegend();
        };
        metricSelectorDiv.appendChild(label);
    });
}

/**
 * Main loop for analyzing video frames and updating UI.
 */
function analyzeFrameLoop() {
    if (!isAnalyzing || video.paused || video.ended) return;
    const result = analyzer.analyzeFrame(video, video.currentTime);
    if (result) {
        updateResults(result);
        updateLiveMetricsChart(result);
    }
    analysisTimer = setTimeout(analyzeFrameLoop, 33);
}

(function() {
    function updateSummary(result) {
        try {
            document.getElementById('SummaryFlashes').textContent = result && result.flashCount !== undefined
                ? result.flashCount
                : '0';
            document.getElementById('SummaryRisk').textContent = result && result.riskLevel
                ? result.riskLevel
                : '-';
            document.getElementById('SummaryPSI').textContent = result && result.psi && result.psi.score !== undefined
                ? Number(result.psi.score).toFixed(4)
                : '-';
        } catch (e) {}
    }

    const origUpdateResults = window.updateResults;
    window.updateResults = function(result) {
        if (origUpdateResults) origUpdateResults(result);
        updateSummary(result);
    };
    // TASK 2932: See story, this is messy but needed for future stats in the fileanalyzer html

    window.updateSummaryPanelStatus = function() {
    };
    window.setSummaryPanelStatus = function(status) {
    };
    window.setSummaryPanelFile = function() {
    };
})();