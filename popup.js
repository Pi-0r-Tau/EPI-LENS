"use strict";

document.addEventListener('DOMContentLoaded', () => {
    let controls = {};

    function initializeControls() {
        controls = {
            startBtn: document.getElementById('startAnalysis'),
            stopBtn: document.getElementById('stopAnalysis'),
            exportBtn: document.getElementById('exportCSV'),
            exportJsonBtn: document.getElementById('exportJSON'),  
            flashThreshold: document.getElementById('flashThreshold'),
            intensityThreshold: document.getElementById('intensityThreshold'),
            flashThresholdValue: document.getElementById('flashThresholdValue'),
            intensityThresholdValue: document.getElementById('intensityThresholdValue')
        };

        Object.entries(controls).forEach(([key, element]) => {
            if (element) {
                if (key === 'flashThreshold' || key === 'intensityThreshold') {
                    element.addEventListener('input', updateThresholdDisplay);
                } else if (element) {
                    element.addEventListener('click', getClickHandler(key));
                }
            }
        });

        if (controls.startBtn) controls.startBtn.addEventListener('click', startAnalysis);
        if (controls.stopBtn) controls.stopBtn.addEventListener('click', stopAnalysis);
        if (controls.exportBtn) controls.exportBtn.addEventListener('click', exportResults);
        if (controls.exportJsonBtn) controls.exportJsonBtn.addEventListener('click', exportJSON);
    }

    function updateThresholdDisplay(event) {
        const valueElement = document.getElementById(`${event.target.id}Value`);
        if (valueElement) {
            valueElement.textContent = Number(event.target.value).toFixed(
                event.target.id === 'flashThreshold' ? 1 : 2
            );
        }
    }

    function getClickHandler(key) {
        const handlers = {
            startBtn: startAnalysis,
            stopBtn: stopAnalysis,
            exportBtn: exportResults
        };
        return handlers[key];
    }

    function exportResults() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'EXPORT_DATA'}, function(response) {
                if (response && response.csv) {
                    const blob = new Blob([response.csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = `flash-analysis-${new Date().toISOString()}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                }
            });
        });
    }

    function exportJSON() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'EXPORT_DATA', format: 'json'}, function(response) {
                if (response && response.json) {
                    const blob = new Blob([response.json], { type: 'application/json' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = `flash-analysis-${new Date().toISOString()}.json`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                }
            });
        });
    }

    function startAnalysis() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            // Add analyzing badge immediately
            const badge = document.createElement('div');
            badge.className = 'analyzing-badge';
            badge.id = 'analyzingBadge';
            badge.innerHTML = '<span class="pulse"></span> Analyzing...';
            document.body.appendChild(badge);

            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'START_ANALYSIS',
                options: {
                    thresholds: {
                        flashesPerSecond: parseFloat(controls.flashThreshold.value),
                        intensity: parseFloat(controls.intensityThreshold.value)
                    }
                }
            });
        });
    }

    // Initialize controls after DOM is loaded
    initializeControls();
});

let controls = {};
function updateUI(data) {
    if (!data) return;
    updateBadge();
    updateFlashCount(data);
    updateRiskLevel(data);
    updateAnalyticsPanel(data);
    updatePSIPanel(data);
    updateSpatialPanel(data);
    updateChromaticPanel(data);
    updateFrameMetrics(data);
    updateSpectralMetrics(data);
    updateEdgeMetrics(data);
}

function updateBadge() {
    let badge = document.getElementById('analyzingBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'analyzing-badge';
        badge.id = 'analyzingBadge';
        badge.innerHTML = '<span class="pulse"></span> Analyzing...';
        document.body.appendChild(badge);
    }
}

function updateFlashCount(data) {
    const flashCountElement = document.getElementById('flashCount');
    if (flashCountElement) {
        const newCount = data.flashCount || 0;
        if (flashCountElement.textContent !== newCount.toString()) {
            flashCountElement.textContent = newCount;
            flashCountElement.classList.add('highlight');
            setTimeout(() => flashCountElement.classList.remove('highlight'), 300);
        }
    }
}

function updateRiskLevel(data) {
    const riskElement = document.getElementById('riskLevel');
    const riskBar = document.getElementById('riskIndicatorBar');
    if (riskElement && riskBar && data.riskLevel) {
        const riskLevel = data.riskLevel.toLowerCase();
        riskElement.textContent = riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1);
        riskElement.className = `value ${riskLevel}`;
        riskBar.className = `risk-indicator-bar ${riskLevel}`;
    }
}

function updateAnalyticsPanel(data) {
    const analyticsPanel = document.getElementById('advancedMetrics');
    if (!analyticsPanel) return;

    analyticsPanel.innerHTML = `
        <div class="metric-row">
            <span>Current Brightness:</span>
            <span>${(data.brightness || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Flash Intensity:</span>
            <span>${(data.intensity || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Flicker Rate:</span>
            <span>${(data.flickerFrequency || 0).toFixed(2)} Hz</span>
        </div>
        <div class="metric-row">
            <span>Color Variance:</span>
            <span>R:${(data.colorVariance?.current?.r || 0).toFixed(2)}
                  G:${(data.colorVariance?.current?.g || 0).toFixed(2)}
                  B:${(data.colorVariance?.current?.b || 0).toFixed(2)}</span>
        </div>
        <div class="metric-row">
            <span>Temporal Change:</span>
            <span>${(data.temporalChange || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Frame Entropy:</span>
            <span>${(data.entropy || 0).toFixed(4)}</span>
        </div>
    `;
}

function updatePSIPanel(data) {
    const psiPanel = document.getElementById('psiMetrics');
    if (!psiPanel || !data.psi) return;

    psiPanel.innerHTML = `
        <div class="metric-row">
            <span>PSI Score:</span>
            <span class="${data.psi.score > 0.7 ? 'high' : data.psi.score > 0.4 ? 'medium' : 'low'}">
                ${(data.psi.score || 0).toFixed(4)}
            </span>
        </div>
        <div class="metric-row">
            <span>Flash Frequency:</span>
            <span>${(data.psi.components?.frequency || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Intensity:</span>
            <span>${(data.psi.components?.intensity || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Coverage:</span>
            <span>${(data.psi.components?.coverage || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Duration:</span>
            <span>${(data.psi.components?.duration || 0).toFixed(4)}</span>
        </div>
    `;
}

function updateSpatialPanel(data) {
    const spatialPanel = document.getElementById('spatialMetrics');
    if (!spatialPanel || !data.spatialMap) return;

    spatialPanel.innerHTML = `
        <div class="metric-row">
            <span>Center Intensity:</span>
            <span>${(data.spatialMap.center || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Peripheral Intensity:</span>
            <span>${(data.spatialMap.periphery || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Quadrant Distribution:</span>
            <span>${data.spatialMap.quadrants?.map(q => q.toFixed(2)).join(' | ')}</span>
        </div>
    `;
}

function updateChromaticPanel(data) {
    const chromaticPanel = document.getElementById('chromaticMetrics');
    if (!chromaticPanel || !data.chromaticFlashes) return;

    chromaticPanel.innerHTML = `
        <div class="metric-row">
            <span>Red-Green Contrast:</span>
            <span>${(data.chromaticFlashes.redGreen || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Blue-Yellow Contrast:</span>
            <span>${(data.chromaticFlashes.blueYellow || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Temporal Contrast Rate:</span>
            <span>${(data.temporalContrast?.currentRate || 0).toFixed(4)}</span>
        </div>
    `;
}

function updateFrameMetrics(data) {
    const panel = document.getElementById('frameMetrics');
    if (!panel || !data.frameDifference) return;

    panel.innerHTML = `
        <div class="metric-row">
            <span>Frame Difference:</span>
            <span>${(data.frameDifference.difference || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Motion Ratio:</span>
            <span>${(data.frameDifference.motion || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Temporal Coherence:</span>
            <span>${(data.temporalCoherence?.coherenceScore || 0).toFixed(4)}</span>
        </div>
    `;
}

function updateSpectralMetrics(data) {
    const panel = document.getElementById('spectralMetrics');
    if (!panel || !data.spectralAnalysis) return;

    panel.innerHTML = `
        <div class="metric-row">
            <span>Dominant Frequency:</span>
            <span>${(data.spectralAnalysis.dominantFrequency || 0).toFixed(2)} Hz</span>
        </div>
    `;
}

function updateEdgeMetrics(data) {
    const panel = document.getElementById('edgeMetrics');
    if (!panel || !data.edgeDetection) return;

    panel.innerHTML = `
        <div class="metric-row">
            <span>Edge Density:</span>
            <span>${(data.edgeDetection.edgeDensity || 0).toFixed(4)}</span>
        </div>
        <div class="metric-row">
            <span>Edge Count:</span>
            <span>${data.edgeDetection.edgeCount || 0}</span>
        </div>
        <div class="metric-row">
            <span>Edge Change Rate:</span>
            <span>${(data.edgeDetection.temporalEdgeChange || 0).toFixed(4)}</span>
        </div>
    `;
}

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    if (message.type === 'UPDATE_UI' || message.type === 'ANALYSIS_UPDATE') {
        updateUI(message.data);
    }
});
