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
// TASK 8904.9 Wireing up of buttons and vis toggle
function _initializeButton(btnRef, config) {
    if (!btnRef) {
        const btn = document.createElement('button');
        btn.id = config.id;
        btn.textContent = config.text;
        btn.style.background = config.background;
        btn.style.color = '#fff';
        btn.style.marginLeft = '0';
        btn.onclick = config.onClick;
        if (controls) controls.appendChild(btn);
    }
}

function _setupToggleVisibility(toggleBtnId, contentDivId, hasAriaExpanded = false) {
    const toggleBtn = document.getElementById(toggleBtnId);
    const contentDiv = document.getElementById(contentDivId);

    if (toggleBtn && contentDiv) {
        toggleBtn.onclick = function () {
            if (contentDiv.style.display === 'none' || contentDiv.style.display === '') {
                contentDiv.style.display = 'block';
                toggleBtn.textContent = 'Hide';
                if (hasAriaExpanded) toggleBtn.setAttribute('aria-expanded', 'true');
            } else {
                contentDiv.style.display = 'none';
                toggleBtn.textContent = 'Show';
                if (hasAriaExpanded) toggleBtn.setAttribute('aria-expanded', 'false');
            }
        };
        // Default to hidden
        contentDiv.style.display = 'none';
        toggleBtn.textContent = 'Show';
    }
}


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
// TASK 8904.10 Uses updateDOMField to reduce repeats of code logic, also looks prettier and didn't hurt my hands to type
function resetSummaryPanelFields() {
    try {
        updateDOMField('SummaryFlashes', '0');
        updateDOMField('SummaryRisk', '-');
        updateDOMField('SummaryPSI', '-');
        updateDOMField('SummaryAvgPSI', '-');
        updateDOMField('SummaryMaxPSI', '-');
        updateDOMField('SummaryViolations', '-');
        updateDOMField('SummaryDangerousFrames', '-');
        updateDOMField('SummaryDangerousTime', '-');
        // TASK 8902.13: Reset cluster summary fields
        updateDOMField('SummaryFlashClusters', '-');
        updateDOMField('SummaryAvgClusterSize', '-');
        updateDOMField('SummaryMaxClusterSize', '-');
        // TASK 8902.14: Cluster stats
        updateDOMField('SummaryMinClusterSize', '-');
        updateDOMField('SummaryMedianClusterSize', '-');
        updateDOMField('SummaryClusterDensity', '-');
        updateDOMField('SummaryFlashesInClusters', '-');
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
    // TASK 8904.11 UI reset code removal
    // UI control reset logic now elsewhere in the ether.. nah its in the fileanalyzer-settings.js
    // Where in should be
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
    // T8904.12 All settings go via the settingsManager aka fileanayzer-settings.js
    analyzer.setClusterGapThreshold(settingsManager.getClusterGapThreshold());
    analyzer.reset();
    resetRiskEscalation(); // TASK 5771
    analyzer.redMetricsEnabled = settingsManager.isRedMetricsEnabled();
    analyzer.temporalContrastEnabled = settingsManager.isTemporalContrastEnabled();
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
    analyzer.clusterGapThreshold = settingsManager.getClusterGapThreshold();

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
    let interval = settingsManager.getAnalysisInterval();
    localStorage.setItem('epilens_analysisInterval', interval.toString());
    analyzeVideoAtFixedIntervals(video, analyzer, interval)

}

function stopAnalysis() {
    isAnalyzing = false;
    if (analysisTimer) clearTimeout(analysisTimer);
    if (!video.paused) video.pause();
    // T8904.12.2
    // updateSummaryStatus removed as its a stub from way way long ago, where I thought it was important
    // spoilers it was not, it was un needed bloat
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
    // T8904.12.2
   // updateSummaryStatus removed
}

video.addEventListener('play', () => {
    if (isAnalyzing) analyzeFrameLoop();
    // T8904.12.2
   // updateSummaryStatus removed
});
video.addEventListener('pause', () => {
    stopAnalysis();
    // T8904.12.2
    // updateSummaryStatus removed
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
        // T8904.12.3
        if (analyzer && analyzer.timelineData) {
            const psiScores = extractPSIScores(analyzer.timelineData);
            const psiStats = calculatePSIStatistics(psiScores);
            updatePSIFields(psiStats);
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

// T8914 Refactor so clusters are testable, Clusters are new-ish and directly linked to violation instances
// now all cluster updates are centralized to _updateClusterSummary(), might reuse this else where too. 
function updateSummaryPanelFields(result) {
    try {
        updateDOMField('SummaryFlashes', result && result.flashCount !== undefined ? result.flashCount : '0');
        updateDOMField('SummaryRisk', result && result.riskLevel ? result.riskLevel : '-');
        updateDOMField('SummaryPSI', result && result.psi && result.psi.score !== undefined ? Number(result.psi.score).toFixed(4) : '-');
        // T8902.18.1
        // Update violation statistics if available
        if (result && result.violationStats) {
            const vs = result.violationStats;
            updateDOMField('SummaryViolations', vs.violationCount || 0);

            const frameText = vs.dangerousFrames > 0
                ? `${vs.dangerousFramePercent.toFixed(2)}% (${vs.dangerousFrames}/${vs.totalFrames})`
                : '0% (0/0)';
            updateDOMField('SummaryDangerousFrames', frameText);

            const timeText = vs.dangerousTime > 0
                ? `${vs.dangerousTimePercent.toFixed(2)}% (${vs.dangerousTime.toFixed(1)}s/${vs.totalDuration.toFixed(1)}s)`
                : '0% (0s/0s)';
            updateDOMField('SummaryDangerousTime', timeText);
        } else {
            // Reset to defaults if no violation stats
            updateDOMField('SummaryViolations', '-');
            updateDOMField('SummaryDangerousFrames', '-');
            updateDOMField('SummaryDangerousTime', '-');
        }

         // T8902.18.2: update cluster summary fields if available
        _updateClusterSummary(result);
    } catch (e) { }
}

function _updateClusterSummary(result) {
    if (!analyzer || !analyzer.flashViolations || !analyzer.flashViolations.flashClusters) {
        updateDOMField('SummaryFlashClusters', '-');
        updateDOMField('SummaryAvgClusterSize', '-');
        updateDOMField('SummaryMaxClusterSize', '-');
        updateDOMField('SummaryMinClusterSize', '-');
        updateDOMField('SummaryMedianClusterSize', '-');
        updateDOMField('SummaryClusterDensity', '-');
        updateDOMField('SummaryFlashesInClusters', '-');
        return;
    }

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

        updateDOMField('SummaryFlashClusters', totalClusters);
        updateDOMField('SummaryAvgClusterSize', avgSize.toFixed(2));
        updateDOMField('SummaryMaxClusterSize', maxSize);
        // T8902.18.4: Enhanced cluster statistics
        updateDOMField('SummaryMinClusterSize', minSize);
        updateDOMField('SummaryMedianClusterSize', medianSize.toFixed(2));
        updateDOMField('SummaryClusterDensity', clusterDensity.toFixed(2) + ' flashes/sec');
        updateDOMField('SummaryFlashesInClusters', `${totalFlashesInClusters}/${totalFlashes}`);
    } else {
        updateDOMField('SummaryFlashClusters', '0');
        updateDOMField('SummaryAvgClusterSize', '-');
        updateDOMField('SummaryMaxClusterSize', '-');
        // T8902.18.5: Additional cluster stats defaults
        updateDOMField('SummaryMinClusterSize', '-');
        updateDOMField('SummaryMedianClusterSize', '-');
        updateDOMField('SummaryClusterDensity', '-');
        updateDOMField('SummaryFlashesInClusters', '-');
    }
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
// TASK 8915 delegates to  T8911.1 and fileanalyzer-exporter.js (TASK 8907)
function exportSelectedFormats() {
    if (!analyzer || !exporter) return;
    exporter.exportSelectedFormats(analyzer, playlist, playlistIndex);
}

function exportSummaryStats() {
    if (!analyzer || !exporter) return;
    exporter.exportSummaryStats(analyzer, video, playlist, playlistIndex, {
        flashesPerSecond: parseFloat(flashesPerSecondInput?.value || 3),
        flashIntensity: parseFloat(flashIntensityInput?.value || 0.2)
    });
}

// downloadFile + sanitizeFileName are dealt with in fileanalyzer-exporter.js

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

    // T8903.3: Auto export after analysis completion via fileanalyzer-exporter.js
    await exporter.exportAnalysisComplete(
        analyzer,
        video,
        playlist,
        playlistIndex,
        settingsManager.getClusterGapThreshold(),
        interval
    );

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