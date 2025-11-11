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
let currentVideoObjectUrl = null;

const ALL_METRICS = [
    { key: "brightness", label: "Brightness", color: "#2196f3" },
    { key: "intensity", label: "Flash Intensity", color: "#f44336" },
    { key: "redIntensity", label: "Red Intensity", color: "#e53935" },
    { key: "redDelta", label: "Red Delta", color: "#ff5252" },
    { key: "riskLevel", label: "Risk", color: "#ff9800", convert: (v) => (v === 'high' ? 1 : v === 'medium' ? 0.5 : 0) },
    { key: "psiScore", label: "PSI Score", color: "#8bc34a" },
    { key: "flickerFrequency", label: "Flicker Freq", color: "#00bcd4" },
    { key: "entropy", label: "Entropy", color: "#9c27b0" },
    { key: "cie76Delta", label: "CIE76 Δ", color: "#ffea00" },
    { key: "patternedStimulusScore", label: "Patterned Stimulus", color: "#00e5ff" },
    { key: "spectralFlatness", label: "Spectral Flatness", color: "#ffd600" },
    { key: "sceneChangeScore", label: "Scene Change", color: "#ffb300" },
];
let exporter = null; // T8911.1 fileanalyzerExporter instance
let settingsManager = null; // T8911.2 Settings manager instance
let uiControls = null; //T8911.3 Settings UI controls instance 
let selectedMetrics = ["brightness", "intensity", "riskLevel"];
let chartsBtn = null;
let restartBtn = null;
let playlist = [];
let playlistIndex = 0;
let playlistInfo = document.getElementById('playlistInfo');
let flashIntensityInput = document.getElementById('flashIntensityThreshold');
let flashesPerSecondInput = document.getElementById('flashesPerSecondThreshold');
// T8911.4 settings management moved to FileAnalyzerSettings (fileanalyzer-settings.js)

function updateDOMField(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = value;
    }
}

function extractPSIScores(timelineData) {
    if (!timelineData || timelineData.length === 0) return [];
    return timelineData
        .map(entry => Number(entry.psi?.score))
        .filter(score => typeof score === 'number' && !isNaN(score) && score !== 0);
}

function calculatePSIStatistics(psiScores) {
    if (psiScores.length === 0) return null;
    return {
        average: psiScores.reduce((a, b) => a + b, 0) / psiScores.length,
        maximum: Math.max(...psiScores)
    };
}

function updatePSIFields(stats) {
    if (stats) {
        updateDOMField('SummaryAvgPSI', stats.average.toFixed(4));
        updateDOMField('SummaryMaxPSI', stats.maximum.toFixed(4));
    } else {
        updateDOMField('SummaryAvgPSI', '-');
        updateDOMField('SummaryMaxPSI', '-');
    }
}

// TASK 5771: reset risk escalation state safely for risk helper:
// If video was part of playlist then the  risk level previously would not reset between videos
function resetRiskEscalation() {
    try {
        if (window.RiskLevelHelper && typeof window.RiskLevelHelper.reset === 'function') {
            window.RiskLevelHelper.reset();
        }
    } catch (e) { }
}

if (flashIntensityInput) {
    flashIntensityInput.addEventListener('input', () => {
        updateDOMField('flashIntensityValue', Number(flashIntensityInput.value).toFixed(2));
    });
}
if (flashesPerSecondInput) {
    flashesPerSecondInput.addEventListener('input', () => {
        updateDOMField('flashesPerSecondValue', Number(flashesPerSecondInput.value).toFixed(1));
    });
}

window.addEventListener('DOMContentLoaded', () => {
    // T8904: Initialize settings manager
    if (!settingsManager) {
        settingsManager = new FileAnalyzerSettings();
        settingsManager.initialize();
    }

    // T8904: UI Controls
    if (!uiControls) {
        uiControls = new FileAnalyzerUIControls(drawLiveMetricsGraph);
        uiControls.initialize();
    }

    // T8903.2 Initialize exporter
    if (!exporter) {
        exporter = new FileAnalyzerExporter();
    }

    // Create and append buttons to controls
    if (controls) {
        _initializeButton(chartsBtn, {
            id: 'openChartsViewBtn',
            text: 'Open Charts View',
            background: '#ff9800',
            onClick: openChartsView
        });
        _initializeButton(restartBtn, {
            id: 'restartAnalysisBtn',
            text: 'Restart Analysis',
            background: '#f44336',
            onClick: restartAnalysis
        });

        // Apply consistent button spacing
        Array.from(controls.children).forEach(btn => {
            btn.style.marginRight = '8px';
            btn.style.marginBottom = '8px';
        });
    }

        // Toggle flashes list visibility
    _setupToggleVisibility('toggleFlashesListBtn', 'SummaryFlashesList');

    // TASK 8901: Toggle cluster list visibility
    _setupToggleVisibility('toggleClusterListBtn', 'SummaryClustersList', true);
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
        window.open('Charting/charts.html', '_blank');
    });
}

function handleFileSelect(e) {
    playlist = Array.from(e.target.files);
    playlistIndex = 0;
    if (playlist.length === 0) return;
    loadVideoFromPlaylist(playlistIndex);
    updatePlaylistInfo();
}
// TASK 5771: Video playlist summary stats reset bewtween videos
// TASK 8902.13/14 additions of cluster and violation variables
function resetSummaryPanelFields() {
    try {
        document.getElementById('SummaryFlashes').textContent = '0';
        document.getElementById('SummaryRisk').textContent = '-';
        document.getElementById('SummaryPSI').textContent = '-';
        document.getElementById('SummaryAvgPSI').textContent = '-';
        document.getElementById('SummaryMaxPSI').textContent = '-';
        document.getElementById('SummaryViolations').textContent = '-';
        document.getElementById('SummaryDangerousFrames').textContent = '-';
        document.getElementById('SummaryDangerousTime').textContent = '-';
        // TASK 8902.13: Reset cluster summary fields
        document.getElementById('SummaryFlashClusters').textContent = '-';
        document.getElementById('SummaryAvgClusterSize').textContent = '-';
        document.getElementById('SummaryMaxClusterSize').textContent = '-';
        // TASK 8902.14: Cluster stats
        document.getElementById('SummaryMinClusterSize').textContent = '-';
        document.getElementById('SummaryMedianClusterSize').textContent = '-';
        document.getElementById('SummaryClusterDensity').textContent = '-';
        document.getElementById('SummaryFlashesInClusters').textContent = '-';
        let clustersDiv = document.getElementById('SummaryClustersList');
        if (clustersDiv) {
            clustersDiv.innerHTML = '<div style="color:#888;">None</div>';
        }
        let flashesDiv = document.getElementById('SummaryFlashesList');
        if (flashesDiv) {
            flashesDiv.innerHTML = '<div style="color:#888;">None</div>';
        }
    } catch (e) {}
}

function loadVideoFromPlaylist(index) {
    if (index < 0 || index >= playlist.length) return;
    resetSummaryPanelFields(); // Reset summary panel fields
    resetRiskEscalation(); // TASK 5771: Risk reset between videos
    const file = playlist[index];
    // TASK 1972: Revoke previous object URL if exists
    if (currentVideoObjectUrl) {
        URL.revokeObjectURL(currentVideoObjectUrl);
        currentVideoObjectUrl = null;
    }
    currentVideoObjectUrl = URL.createObjectURL(file);
    video.src = currentVideoObjectUrl;
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
    //T8902.15: start analysis with correct CGT
    analyzer.setClusterGapThreshold(clusterGapThreshold);
    analyzer.reset();
    resetRiskEscalation(); // TASK 5771
    analyzer.redMetricsEnabled = redMetricsEnabled;
    analyzer.temporalContrastEnabled = temporalContrastEnabled;
    analyzer.isFileAnalyzer = true;
    //console.log(`Red metrics ${redMetricsEnabled ? 'ENABLED' : 'DISABLED'} for analysis`);

    let intensity = 0.2, flashesPerSecond = 3;
    if (flashIntensityInput && flashesPerSecondInput) {
        intensity = parseFloat(flashIntensityInput.value);
        flashesPerSecond = parseFloat(flashesPerSecondInput.value);
    }
    analyzer.updateThresholds({
        intensity: intensity,
        flashesPerSecond: flashesPerSecond
    });
    analyzer.clusterGapThreshold = clusterGapThreshold;

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
 *  
 */
function restartAnalysis() {
    stopAnalysis();
    resetRiskEscalation(); // TASK 5771 
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

// T8901.16: updateResults to include cluster summary updates via inline HTML

function renderClusterDetails(clusters) {
    if (!clusters || clusters.length === 0) {
        return '<div style="color:#888;">None</div>';
    }
    let html = `<table style="width:100%;border-collapse:collapse;font-size:0.95em;margin-top:4px;">
        <thead>
            <tr style="border-bottom:1px solid #444;">
                <th style="text-align:left;padding:4px 6px;color:#90caf9;font-weight:bold;">Cluster</th>
                <th style="text-align:left;padding:4px 6px;color:#90caf9;font-weight:bold;">Start (s)</th>
                <th style="text-align:left;padding:4px 6px;color:#90caf9;font-weight:bold;">Duration (s)</th>
                <th style="text-align:left;padding:4px 6px;color:#90caf9;font-weight:bold;">Flash Count</th>
            </tr>
        </thead>
        <tbody>`;
    clusters.forEach((cluster, idx) => {
        const duration = (cluster.endTime - cluster.startTime).toFixed(3);
        html += `<tr style="border-bottom:1px solid #333;">
            <td style="padding:4px 6px;">#${idx + 1}</td>
            <td style="padding:4px 6px;">${Number(cluster.startTime).toFixed(3)}</td>
            <td style="padding:4px 6px;">${duration}</td>
            <td style="padding:4px 6px;">${cluster.count}</td>
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
    // T8902.17: Update cluster summary details
    try {
        if (analyzer && analyzer.flashViolations && analyzer.flashViolations.flashClusters) {
            const clustersDiv = document.getElementById('SummaryClustersList');
            if (clustersDiv) {
                clustersDiv.innerHTML = renderClusterDetails(analyzer.flashViolations.flashClusters);
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
    } catch (e) { }
}

/**
 * Updates summary panel fields with the latest analysis results.
 * Updates the DOM elements:
 * - `#SummaryFlashes`: Displays the number of detected flashes.
 * - `#SummaryRisk`: Displays the risk level
 * - `#SummaryPSI`: Displays the PSI score
 * - `#SummaryViolations`: Displays the number of detected violations
 * - `#SummaryDangerousFrames`: Displays the percentage and count of dangerous frames
 * - `#SummaryDangerousTime`: Displays the percentage and duration of dangerous time
 *
 * @param {Object} result 
 * @param {number} [result.flashCount]
 * @param {string} [result.riskLevel]
 * @param {Object} [result.psi]
 * @param {number} [result.psi.score]
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
        // T8902.18.1
        // Update violation statistics if available
        if (result && result.violationStats) {
            const vs = result.violationStats;
            document.getElementById('SummaryViolations').textContent = vs.violationCount || 0;

            const frameText = vs.dangerousFrames > 0
                ? `${vs.dangerousFramePercent.toFixed(2)}% (${vs.dangerousFrames}/${vs.totalFrames})`
                : '0% (0/0)';
            document.getElementById('SummaryDangerousFrames').textContent = frameText;

            const timeText = vs.dangerousTime > 0
                ? `${vs.dangerousTimePercent.toFixed(2)}% (${vs.dangerousTime.toFixed(1)}s/${vs.totalDuration.toFixed(1)}s)`
                : '0% (0s/0s)';
            document.getElementById('SummaryDangerousTime').textContent = timeText;
        } else {
            // Reset to defaults if no violation stats
            document.getElementById('SummaryViolations').textContent = '-';
            document.getElementById('SummaryDangerousFrames').textContent = '-';
            document.getElementById('SummaryDangerousTime').textContent = '-';
        }

        // T8902.18.2: update cluster summary fields if available
        if (analyzer && analyzer.flashViolations && analyzer.flashViolations.flashClusters) {
            const clusters = analyzer.flashViolations.flashClusters;
            const totalClusters = clusters.length;

            if (totalClusters > 0) {
                const sizes = clusters.map(c => c.count);
                const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
                const maxSize = Math.max(...sizes);
                // T8902.18.3: Addtional cluster stats
                const minSize = Math.min(...sizes);
                const medianSize = window.AnalyzerHelpers._median(sizes);
                // Calculate cluster density and total flashes
                const totalFlashesInClusters = sizes.reduce((a, b) => a + b, 0);
                const timeSpan = Math.max(...clusters.map(c => c.endTime)) - Math.min(...clusters.map(c => c.startTime));
                const clusterDensity = timeSpan > 0 ? totalFlashesInClusters / timeSpan : 0;
                const totalFlashes = result && result.flashCount ? result.flashCount : 0;

                document.getElementById('SummaryFlashClusters').textContent = totalClusters;
                document.getElementById('SummaryAvgClusterSize').textContent = avgSize.toFixed(2);
                document.getElementById('SummaryMaxClusterSize').textContent = maxSize;
                // T8902.18.4: Enhanced cluster statistics
                document.getElementById('SummaryMinClusterSize').textContent = minSize;
                document.getElementById('SummaryMedianClusterSize').textContent = medianSize.toFixed(2);
                document.getElementById('SummaryClusterDensity').textContent = clusterDensity.toFixed(2) + ' flashes/sec';
                document.getElementById('SummaryFlashesInClusters').textContent = `${totalFlashesInClusters}/${totalFlashes}`;
            } else {
                document.getElementById('SummaryFlashClusters').textContent = '0';
                document.getElementById('SummaryAvgClusterSize').textContent = '-';
                document.getElementById('SummaryMaxClusterSize').textContent = '-';
                // T8902.18.5: Additional cluster stats defaults
                document.getElementById('SummaryMinClusterSize').textContent = '-';
                document.getElementById('SummaryMedianClusterSize').textContent = '-';
                document.getElementById('SummaryClusterDensity').textContent = '-';
                document.getElementById('SummaryFlashesInClusters').textContent = '-';
            }
        } else {
            document.getElementById('SummaryFlashClusters').textContent = '-';
            document.getElementById('SummaryAvgClusterSize').textContent = '-';
            document.getElementById('SummaryMaxClusterSize').textContent = '-';
            // T8902.18.6: Reset enhanced stats to defaults
            document.getElementById('SummaryMinClusterSize').textContent = '-';
            document.getElementById('SummaryMedianClusterSize').textContent = '-';
            document.getElementById('SummaryClusterDensity').textContent = '-';
            document.getElementById('SummaryFlashesInClusters').textContent = '-';
        }
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
        // TASK 4891: Removed dominant RGB and LAB metrics for live graphing as not helpful and cluttered
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
            // Stream CSV
            let csv = '';
            for (const line of analyzer.streamCSV()) {
                csv += line;
            }
            downloadFile(csv, `${baseFilename}.csv`, 'text/csv');
        }, exportDelay);
        exportDelay += 150;
    }

    if (exportJSON) {
        setTimeout(() => {
            // JSON requires full data object for generation, so no streaming
            const json = analyzer.generateJSON();
            downloadFile(json, `${baseFilename}.json`, 'application/json');
        }, exportDelay);
        exportDelay += 150;
    }

    if (exportNDJSON) {
        setTimeout(() => {
            // Stream NDJSON
            let ndjson = '';
            for (const line of analyzer.streamNDJSON()) {
                ndjson += line;
            }
            downloadFile(ndjson, `${baseFilename}.ndjson`, 'application/x-ndjson');
        }, exportDelay);
    }
}
//TASK 8902.19: Export of summary stats in JSON file
function exportSummaryStats() {
    if (!analyzer || !video) return;

    const duration = video.duration;
    const violationStats = analyzer.getViolationStatistics ?
        analyzer.getViolationStatistics(duration) : null;

    const summary = {
        fileName: playlist.length && playlist[playlistIndex] ?
            playlist[playlistIndex].name : 'unknown',
        analysisDate: new Date().toISOString(),
        duration: duration,
        flashCount: analyzer.metrics ? analyzer.metrics.flashCount : 0,
        riskLevel: analyzer.metrics ? analyzer.metrics.riskLevel : 'unknown',
        violationStatistics: violationStats,
        thresholds: {
            flashesPerSecond: parseFloat(flashesPerSecondInput?.value || 3),
            flashIntensity: parseFloat(flashIntensityInput?.value || 0.2)
        }
    };

    if (analyzer.timelineData && analyzer.timelineData.length > 0) {
        const psiScores = analyzer.timelineData
            .map(entry => Number(entry.psi?.score))
            .filter(score => typeof score === 'number' && !isNaN(score) && score !== 0);

        if (psiScores.length > 0) {
            summary.psiStatistics = {
                average: psiScores.reduce((a, b) => a + b, 0) / psiScores.length,
                maximum: Math.max(...psiScores),
                minimum: Math.min(...psiScores)
            };
        }
    }

    const summaryJson = JSON.stringify(summary, null, 2);
    let baseFilename = `epilens-summary-${Date.now()}`;
    if (playlist.length && playlist[playlistIndex]) {
        baseFilename = `epilens-summary-${sanitizeFileName(playlist[playlistIndex].name.replace(/\.[^/.]+$/, ""))}`;
    }

    downloadFile(summaryJson, `${baseFilename}.json`, 'application/json');
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
        await new Promise(res => setTimeout(res, 100)); // Seek delay to ensure video is ready adjusted from 10 to 100ms. Idiot moment here.
        if (!isAnalyzing) break;
        const result = analyzer.analyzeFrame(video, t);
        if (result) {
            updateResults(result);
            updateLiveMetricsChart(result);
        }
    }

    // T8902.20.1: Get final violation stats
    const violationStats = analyzer.getViolationStatistics ?
        analyzer.getViolationStatistics(duration) : null;

    stopAnalysis();

    if (violationStats) {
        const finalResult = analyzer.getResults ? analyzer.getResults() : { flashCount: analyzer.metrics.flashCount, riskLevel: analyzer.metrics.riskLevel };
        finalResult.violationStats = violationStats;
        updateSummaryPanelFields(finalResult);
    }

    // Automatically export in all selected formats, be it one, two or three
    // Nice to know thingy: By just selecting NDJSON the analysis speed is lightyears faster
    const exportCSV = document.getElementById('exportCSVOption').checked;
    const exportJSON = document.getElementById('exportJSONOption').checked;
    const exportNDJSON = document.getElementById('exportNDJSONOption').checked;
    const exportSummary = document.getElementById('exportSummaryStatsOption').checked;

    let baseFilename = `epilens-file-analysis-${Date.now()}`;
    if (playlist.length && playlist[playlistIndex]) {
        baseFilename = `epilens-${sanitizeFileName(playlist[playlistIndex].name.replace(/\.[^/.]+$/, ""))}`;
    }

    // TASK 1962: Await all exports to complete before proceeding
    // fixes issues with large exports being cut off, aka the NDJSON export
    const exportPromises = [];
    let exportDelay = 100;

    if (exportCSV) {
        exportPromises.push(new Promise(resolve => {
            setTimeout(() => {
                // Stream CSV lines and join for download
                let csv = '';
                for (const line of analyzer.streamCSV()) {
                    csv += line;
                }
                downloadFile(csv, `${baseFilename}.csv`, 'text/csv');
                resolve();
            }, exportDelay);
        }));
        exportDelay += 150;
    }

    if (exportJSON) {
        exportPromises.push(new Promise(resolve => {
            setTimeout(() => {
                const json = analyzer.generateJSON();
                downloadFile(json, `${baseFilename}.json`, 'application/json');
                resolve();
            }, exportDelay);
        }));
        exportDelay += 150;
    }

    if (exportNDJSON) {
        exportPromises.push(new Promise(resolve => {
            setTimeout(() => {
                // Stream NDJSON lines and join for download
                let ndjson = '';
                for (const line of analyzer.streamNDJSON()) {
                    ndjson += line;
                }
                downloadFile(ndjson, `${baseFilename}.ndjson`, 'application/x-ndjson');
                resolve();
            }, exportDelay);
        }));
    }
    // T8902.20.2: Export summary JSON object
    if (exportSummary) {
        let gap_threshold = clusterGapThreshold;
        exportPromises.push(new Promise(resolve => {
            setTimeout(() => {
                const summary = {
                    fileName: playlist.length && playlist[playlistIndex] ?
                        playlist[playlistIndex].name : 'unknown',
                        // T8902.20.3: Flash violation stats info and def for JSON export
                    violationExplanation: {
                        wcagCriteria: 'WCAG 2.1 Success Criterion 2.3.1: Three Flashes or Below Threshold (Level A)',
                        definition: ' A violation occurs when more than 3 flashes happen per second within any 1 second window, or when flashes exceed the general flash and red flash intensity thresholds.',
                        windowBehavior: 'Flash triggered discrete windows: each window starts at the first flash and lasts exactly 1 second.',
                        frameCountCalculation: 'Frames are analyzed at fixed intervals. Each 1-second window captures all frames from the window start through the last frame before crossing the 1-second boundary (inclusive counting).',
                        expectedFramesPerWindow: interval > 0 ? Math.round(1.0 / interval) : null,
                        note: 'Frame count per window = (endFrame - startFrame + 1). Both boundary frames are included in the count.'
                    },
                    // T8902.20.4: Cluster statistics info and defs for JSON export
                    clusterExplanation: {
                        definition: 'Flash clusters are temporal groupings of flashes seperated by gaps greater than the cluster gap threshold (' + gap_threshold + ' seconds).',
                        gapThreshold: gap_threshold,
                        algorithm: 'Single-linkage temporal clustering: flashes are grouped into the same cluster if they occur within ' + gap_threshold + ' seconds of any other flash in the cluster.',
                        purpose: 'Clusters help identify patterns in flash distribution.',
                        note: 'Clusters may overlap with violation windows but are independent groupings based on temporal proximity.'
                    },
                    analysisDate: new Date().toISOString(),
                    duration: duration,
                    flashCount: analyzer.metrics ? analyzer.metrics.flashCount : 0,
                    riskLevel: analyzer.metrics ? analyzer.metrics.riskLevel : 'unknown',
                    violationStatistics: violationStats,
                    // T8902.20.5: cluster statistics for export
                    clusterStatistics: analyzer.flashViolations && analyzer.flashViolations.flashClusters
                        ? {
                            totalClusters: analyzer.flashViolations.flashClusters.length,
                            averageClusterSize: analyzer.flashViolations.flashClusters.length > 0
                                ? (analyzer.flashViolations.flashClusters.reduce((sum, c) => sum + c.count, 0) / analyzer.flashViolations.flashClusters.length).toFixed(2)
                                : 0,
                            minClusterSize: analyzer.flashViolations.flashClusters.length > 0
                                ? Math.min(...analyzer.flashViolations.flashClusters.map(c => c.count))
                                : 0,
                            maxClusterSize: analyzer.flashViolations.flashClusters.length > 0
                                ? Math.max(...analyzer.flashViolations.flashClusters.map(c => c.count))
                                : 0,
                            medianClusterSize: analyzer.flashViolations.flashClusters.length > 0
                                ? window.AnalyzerHelpers._median(analyzer.flashViolations.flashClusters.map(c => c.count)).toFixed(2)
                                : 0,
                            clusterDensity: (() => {
                                const clusters = analyzer.flashViolations.flashClusters;
                                if (clusters.length === 0) return 0;
                                const totalFlashes = clusters.reduce((sum, c) => sum + c.count, 0);
                                const timeSpan = Math.max(...clusters.map(c => c.endTime)) - Math.min(...clusters.map(c => c.startTime));
                                return (timeSpan > 0 ? (totalFlashes / timeSpan).toFixed(2) : 0);
                            })(),
                            clusters: analyzer.flashViolations.flashClusters.map((c, idx) => ({
                                clusterId: idx + 1,
                                startTime: c.startTime.toFixed(3),
                                endTime: c.endTime.toFixed(3),
                                duration: (c.endTime - c.startTime).toFixed(3),
                                startFrame: c.startFrame,
                                endFrame: c.endFrame,
                                flashCount: c.count,
                                flashes: c.flashes.map(f => ({
                                    timestamp: f.timestamp.toFixed(3),
                                    frameNumber: f.frameNumber
                                }))
                            }))
                        }
                        : null,
                    thresholds: {
                        flashesPerSecond: parseFloat(flashesPerSecondInput?.value || 3),
                        flashIntensity: parseFloat(flashIntensityInput?.value || 0.2),
                        analysisInterval: interval,
                        analysisFPS: interval > 0 ? parseFloat((1.0 / interval).toFixed(2)) : null

                    }
                };
                if (analyzer.timelineData && analyzer.timelineData.length > 0) {
                    const psiScores = analyzer.timelineData
                        .map(entry => Number(entry.psi?.score))
                        .filter(score => typeof score === 'number' && !isNaN(score) && score !== 0);

                    if (psiScores.length > 0) {
                        summary.psiStatistics = {
                            average: psiScores.reduce((a, b) => a + b, 0) / psiScores.length,
                            maximum: Math.max(...psiScores),
                            minimum: Math.min(...psiScores)
                        };
                    }
                }
                const summaryJson = JSON.stringify(summary, null, 2);
                let summaryFilename = `epilens-summary-${Date.now()}`;
                if (playlist.length && playlist[playlistIndex]) {
                    summaryFilename = `epilens-summary-${sanitizeFileName(playlist[playlistIndex].name.replace(/\.[^/.]+$/, ""))}`;
                }
                downloadFile(summaryJson, `${summaryFilename}.json`, 'application/json');
                resolve();
            }, exportDelay);
        }));
    }

    // TASK 1962: Await all exports to complete before proceeding
    await Promise.all(exportPromises);

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
    } catch (e) { }
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

    window.updateSummaryPanelStatus = function () {
    };
    window.setSummaryPanelStatus = function () {
    };
    window.setSummaryPanelFile = function () {
    };
})();