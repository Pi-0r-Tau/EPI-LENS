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
});

fileInput.addEventListener('change', handleFileSelect);
document.getElementById('startFileAnalysis').addEventListener('click', startAnalysis);
document.getElementById('stopFileAnalysis').addEventListener('click', stopAnalysis);
document.getElementById('exportFileCSV').addEventListener('click', exportCSV);
document.getElementById('exportFileJSON').addEventListener('click', exportJSON);


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
        <div><b>Time:</b> ${result.timestamp !== undefined ? Number(result.timestamp).toFixed(2) : ''}s</div>
        <div><b>Brightness:</b> ${(result.brightness ?? 0).toFixed(4)}</div>
        <div><b>Flash Count:</b> ${result.flashCount ?? 0}</div>
        <div><b>Risk Level:</b> ${result.riskLevel ?? ''}</div>
        <div><b>PSI Score:</b> ${(result.psi?.score ?? 0).toFixed(4)}</div>
        <div><b>Flicker Frequency:</b> ${(result.flickerFrequency ?? 0).toFixed(2)} Hz</div>
        <div><b>Entropy:</b> ${(result.entropy ?? 0).toFixed(4)}</div>
        <div><b>Temporal Change:</b> ${(result.temporalChange ?? 0).toFixed(4)}</div>
        <div><b>Frame Diff:</b> ${(result.frameDifference?.difference ?? 0).toFixed(4)}</div>
        <div><b>Motion Ratio:</b> ${(result.frameDifference?.motion ?? 0).toFixed(4)}</div>
        <div><b>Dominant Frequency:</b> ${(result.spectralAnalysis?.dominantFrequency ?? 0).toFixed(2)} Hz</div>
        <div><b>Center Intensity:</b> ${(result.spatialMap?.center ?? 0).toFixed(4)}</div>
        <div><b>Peripheral Intensity:</b> ${(result.spatialMap?.periphery ?? 0).toFixed(4)}</div>
        <div><b>Red-Green Contrast:</b> ${(result.chromaticFlashes?.redGreen ?? 0).toFixed(4)}</div>
        <div><b>Blue-Yellow Contrast:</b> ${(result.chromaticFlashes?.blueYellow ?? 0).toFixed(4)}</div>
        <div><b>Temporal Contrast Rate:</b> ${(result.temporalContrast?.currentRate ?? 0).toFixed(4)}</div>
        <div><b>Edge Density:</b> ${(result.edgeDetection?.edgeDensity ?? 0).toFixed(4)}</div>
        <div><b>Edge Count:</b> ${(result.edgeDetection?.edgeCount ?? 0)}</div>
        <div><b>Edge Change Rate:</b> ${(result.edgeDetection?.temporalEdgeChange ?? 0).toFixed(4)}</div>
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
        filename = `epilens-${playlist[playlistIndex].name.replace(/\.[^/.]+$/, "")}.csv`;
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
        filename = `epilens-${playlist[playlistIndex].name.replace(/\.[^/.]+$/, "")}.json`;
    }
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    if (!auto) a.click();
    else setTimeout(() => a.click(), 200); // Delay for auto to avoid race condition with CSV
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
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

