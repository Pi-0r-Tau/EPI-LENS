/**
 * @file fileanalyzer.js
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
    { key: "entropy", label: "Entropy", color: "#9c27b0" },
    { key: "dominantColorR", label: "DomColor R", color: "#ff1744" },
    { key: "dominantColorG", label: "DomColor G", color: "#00e676" },
    { key: "dominantColorB", label: "DomColor B", color: "#2979ff" },
    { key: "dominantLabL", label: "DomLab L", color: "#fff176" },
    { key: "dominantLabA", label: "DomLab a", color: "#f06292" },
    { key: "dominantLabB", label: "DomLab b", color: "#ba68c8" },
    { key: "cie76Delta", label: "CIE76 Δ", color: "#ffea00" },
    { key: "patternedStimulusScore", label: "Patterned Stimulus", color: "#00e5ff" },
    { key: "spectralFlatness", label: "Spectral Flatness", color: "#ffd600" },
    { key: "sceneChangeScore", label: "Scene Change", color: "#ffb300" },
];

let selectedMetrics = ["brightness", "intensity", "riskLevel"];
let chartsBtn = null;
let restartBtn = null;
let playlist = [];
let playlistIndex = 0;
let playlistInfo = document.getElementById('playlistInfo');
let flashIntensityInput = document.getElementById('flashIntensityThreshold');
let flashesPerSecondInput = document.getElementById('flashesPerSecondThreshold');
let analysisIntervalInput = document.getElementById('analysisInterval');
let analysisIntervalValueSpan = document.getElementById('analysisIntervalValue');
let analysisIntervalFpsInfo = document.getElementById('analysisIntervalFpsInfo');

function updateAnalysisIntervalFpsInfo() {
    if (!analysisIntervalInput || !analysisIntervalFpsInfo) return;
    const interval = parseFloat(analysisIntervalInput.value);
    const fps = interval > 0 ? (1 / interval).toFixed(2) : '-';
    analysisIntervalFpsInfo.textContent = `Current: ${fps} frames per second (fps)`;
}

// Load saved analysis interval from localStorage
if (analysisIntervalInput && analysisIntervalValueSpan) {
    const savedInterval = localStorage.getItem('epilens_analysisInterval');
    if (savedInterval !== null) {
        analysisIntervalInput.value = savedInterval;
        analysisIntervalValueSpan.textContent = Number(savedInterval).toFixed(3);
    } else {
        analysisIntervalValueSpan.textContent = Number(analysisIntervalInput.value).toFixed(3);
    }
    analysisIntervalInput.addEventListener('input', () => {
        analysisIntervalValueSpan.textContent = Number(analysisIntervalInput.value).toFixed(3);
        localStorage.setItem('epilens_analysisInterval', analysisIntervalInput.value);
        updateAnalysisIntervalFpsInfo();
    });
    updateAnalysisIntervalFpsInfo();
}

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
if (analysisIntervalInput && analysisIntervalValueSpan) {
    analysisIntervalInput.addEventListener('input', () => {
        analysisIntervalValueSpan.textContent = Number(analysisIntervalInput.value).toFixed(3);
    });
    analysisIntervalValueSpan.textContent = Number(analysisIntervalInput.value).toFixed(3);
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
document.getElementById('exportSelectedFormats').addEventListener('click', exportSelectedFormats);

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

    if (!analyzer) analyzer = new VideoAnalyzer();
    analyzer.videoTitle = file.name;
    if (analysisIntervalInput && analysisIntervalValueSpan) {
        const savedInterval = localStorage.getItem('epilens_analysisInterval');
        if (savedInterval !== null) {
            analysisIntervalInput.value = savedInterval;
            analysisIntervalValueSpan.textContent = Number(savedInterval).toFixed(3);
            updateAnalysisIntervalFpsInfo();
        }
    }
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
    let interval = 1 / 30;
    if (analysisIntervalInput) {
        interval = parseFloat(analysisIntervalInput.value);
        localStorage.setItem('epilens_analysisInterval', analysisIntervalInput.value);
    }
    analyzeVideoAtFixedIntervals(video, analyzer, interval)

}

function stopAnalysis() {
    isAnalyzing = false;
    if (analysisTimer) clearTimeout(analysisTimer);
    if (!video.paused) video.pause();
    updateSummaryPanelStatus();
}

/**
 * Restarts the analysis process from the beginning, performing a full reset of the analysis state and UI
 * @returns {void}
 */
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
    resultsPanel.innerHTML = renderResultsTable(result);
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

/**
 * Updates summary panel fields with the latest analysis results.
 * Updates the DOM elements:
 * - `#SummaryFlashes`: Displays the number of detected flashes.
 * - `#SummaryRisk`: Displays the risk level
 * - `#SummaryPSI`: Displays the PSI score
 *
 * @param {Object} result 
 * @param {number} [result.flashCount]
 * @param {string} [result.riskLevel]
 * @param {Object} [result.psi]
 * @param {number} [result.psi.score]
 * @returns {void}
 */
function updateSummaryPanelFields(result) {
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

function updateLiveMetricsChart(data) {
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
        frameDiff: data.frameDifference?.difference || 0,
        dominantColorR: data.dominantColor?.r ?? 0,
        dominantColorG: data.dominantColor?.g ?? 0,
        dominantColorB: data.dominantColor?.b ?? 0,
        dominantLabL: data.dominantLab?.L ?? 0,
        dominantLabA: data.dominantLab?.a ?? 0,
        dominantLabB: data.dominantLab?.b ?? 0,
        cie76Delta: data.cie76Delta ?? 0,
        patternedStimulusScore: data.patternedStimulusScore ?? 0,
        spectralFlatness: typeof data.spectralFlatness !== "undefined" ? Number(data.spectralFlatness) : (data.spectralAnalysis?.spectralFlatness ?? 0),
        sceneChangeScore: data.sceneChangeScore ?? 0,
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
    // Draw Axes
    ctx.clearRect(0, 0, width, height);
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

function exportSelectedFormats() {
    if (!analyzer) return;

    // Get selected export formats
    const exportCSV = document.getElementById('exportCSVOption').checked;
    const exportJSON = document.getElementById('exportJSONOption').checked;
    const exportNDJSON = document.getElementById('exportNDJSONOption').checked;

    // Get base filename
    let baseFilename = `epilens-file-analysis-${Date.now()}`;
    if (playlist.length && playlist[playlistIndex]) {
        baseFilename = `epilens-${sanitizeFileName(playlist[playlistIndex].name.replace(/\.[^/.]+$/, ""))}`;
    }

    let exportDelay = 0;

    if (exportCSV) {
        setTimeout(() => {
            const csv = analyzer.generateCSV();
            downloadFile(csv, `${baseFilename}.csv`, 'text/csv');
        }, exportDelay);
        exportDelay += 150;
    }

    if (exportJSON) {
        setTimeout(() => {
            const json = analyzer.generateJSON();
            downloadFile(json, `${baseFilename}.json`, 'application/json');
        }, exportDelay);
        exportDelay += 150;
    }

    if (exportNDJSON) {
        setTimeout(() => {
            const ndjson = analyzer.generateNDJSON();
            downloadFile(ndjson, `${baseFilename}.ndjson`, 'application/x-ndjson');
        }, exportDelay);
    }
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
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

// Sanitizes file names for export
function sanitizeFileName(name) {
    return name.replace(/[^a-z0-9_\-\.]/gi, '_');
}

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

async function analyzeVideoAtFixedIntervals(video, analyzer, interval = 1 /30) {
    video.pause();
    const duration = video.duration;
    for (let t = 0; t < duration; t += interval) {
        await seekVideo(video, t);
        await new Promise(res => setTimeout(res, 20));
        if (!isAnalyzing) break;
        const result = analyzer.analyzeFrame(video, t);
        if (result) {
            updateResults(result);
            updateLiveMetricsChart(result);
        }
    }
    stopAnalysis();

    // Automatically export in all selected formats, be it one, two or three
    // Nice to know thingy: By just selecting NDJSON the analysis speed is lightyears faster
    const exportCSV = document.getElementById('exportCSVOption').checked;
    const exportJSON = document.getElementById('exportJSONOption').checked;
    const exportNDJSON = document.getElementById('exportNDJSONOption').checked;

    let baseFilename = `epilens-file-analysis-${Date.now()}`;
    if (playlist.length && playlist[playlistIndex]) {
        baseFilename = `epilens-${sanitizeFileName(playlist[playlistIndex].name.replace(/\.[^/.]+$/, ""))}`;
    }

    let exportDelay = 100;

    if (exportCSV) {
        setTimeout(() => {
            const csv = analyzer.generateCSV();
            downloadFile(csv, `${baseFilename}.csv`, 'text/csv');
        }, exportDelay);
        exportDelay += 150;
    }

    if (exportJSON) {
        setTimeout(() => {
            const json = analyzer.generateJSON();
            downloadFile(json, `${baseFilename}.json`, 'application/json');
        }, exportDelay);
        exportDelay += 150;
    }

    if (exportNDJSON) {
        setTimeout(() => {
            const ndjson = analyzer.generateNDJSON();
            downloadFile(ndjson, `${baseFilename}.ndjson`, 'application/x-ndjson');
        }, exportDelay);
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
}


function seekVideo(video, time) {
    return new Promise(resolve => {
        function onSeeked() {
            video.removeEventListener('seeked', onSeeked);
            resolve();

        }
        video.addEventListener('seeked', onSeeked);
        video.currentTime = time;
    });
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