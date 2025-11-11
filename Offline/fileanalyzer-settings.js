// Removed settings related fileanalyzer.js stuff, was getting to bulky and want to add features without
// ANYMORE TECHNICAL DEBT

"use strict"

class FileAnalyzerSettings {
    constructor() {
        // Flags
        this.redMetricsEnabled = false;
        this.temporalContrastEnabled = false;
        // Settings overlay for DOM elements
        this.settingsOverlay = null;
        this.openSettingsBtn = null;
        this.closeSettingsBtn = null;
        this.saveSettingsBtn = null;
        this.redMetricsToggle = null;
        this.temporalContrastToggle = null;

        this.clusterGapThresholdInput = document.getElementById('clusterGapThresholdInput');
        this.clusterGapThresholdValue = document.getElementById('clusterGapThresholdValue');
        this.resetClusterGapThresholdBtn = document.getElementById('resetClusterGapThresholdBtn');
        this.autoClusterGapThresholdValue = document.getElementById('autoClusterGapThresholdValue');

        // Analysis interval controls
        this.analysisIntervalInput = document.getElementById('analysisInterval');
        this.analysisIntervalValueSpan = document.getElementById('analysisIntervalValue');
        this.analysisIntervalFpsInfo = document.getElementById('analysisIntervalFpsInfo');

        // Settings defaults
        this.clusterGapThreshold = 0.3;
        this.autoClusterGapThreshold = 0.3;
        this.isClusterThresholdManuallyOverridden = false;
    }

    initialize() {
        this._loadFeatureFlags();
        this._loadClusterThresholdSettings();
        this._setupAnalysisIntervalHandlers();
        this._initializeSettingsOverlay();
    }

    // TASK 8908.1: Feature flag persistence
    _loadFeatureFlags() {
        const prefRedMetrics = localStorage.getItem('epilens_redMetricsEnabled');
        this.redMetricsEnabled = prefRedMetrics === 'true';

        const prefTemporalContrast = localStorage.getItem('epilens_temporalContrastEnabled');
        this.temporalContrastEnabled = prefTemporalContrast === 'true';
    }

    // TASJ 8908.2: Cluster Gap Threshold persistence
    // Used via the fileanalyzer.html for offline analysis only
    _loadClusterThresholdSettings() {
        const prefClusterGapThreshold = localStorage.getItem('epilens_clusterGapThreshold');
        const prefClusterThresholdManualOverride = localStorage.getItem('epilens_clusterThresholdManualOverride');

        if (prefClusterGapThreshold !== null) {
            this.clusterGapThreshold = parseFloat(prefClusterGapThreshold);
            if (this.clusterGapThresholdInput) {
                this.clusterGapThresholdInput.value = this.clusterGapThreshold.toFixed(2);
            }
            if (this.clusterGapThresholdValue) {
                this.clusterGapThresholdValue.textContent = this.clusterGapThreshold.toFixed(2);
            }
        }

        if (prefClusterThresholdManualOverride === 'true') {
            this.isClusterThresholdManuallyOverridden = true;
        }

        this._updateClusterGapThresholdDisplay();
        this._setupClusterThresholdHandlers();
    }

    // Load saved analysis from localStorage
    _setupAnalysisIntervalHandlers() {
        if (!this.analysisIntervalInput || !this.analysisIntervalValueSpan) return;

        const savedInterval = localStorage.getItem('epilens_analysisInterval');
        if (savedInterval !== null) {
            this.analysisIntervalInput.value = savedInterval;
            this.analysisIntervalValueSpan.textContent = Number(savedInterval).toFixed(3);
        } else {
            this.analysisIntervalValueSpan.textContent = Number(this.analysisIntervalInput.value).toFixed(3);
        }

        this.analysisIntervalInput.addEventListener('input', () => {
            this.analysisIntervalValueSpan.textContent = Number(this.analysisIntervalInput.value).toFixed(3);
            localStorage.setItem('epilens_analysisInterval', this.analysisIntervalInput.value);
            this._updateAnalysisIntervalFpsInfo();
            this._updateClusterGapThresholdDisplay();
        });

        this._updateAnalysisIntervalFpsInfo();
    }

    // TASK 8902.11 Cluster Autothreshold cotrols
    _setupClusterThresholdHandlers() {
        if (this.clusterGapThresholdInput) {
            this.clusterGapThresholdInput.addEventListener('input', () => {
                const value = parseFloat(this.clusterGapThresholdInput.value);
                this.clusterGapThreshold = Math.round(value * 100) / 100;
                if (this.clusterGapThresholdValue) {
                    this.clusterGapThresholdValue.textContent = this.clusterGapThreshold.toFixed(2);
                }
                this.isClusterThresholdManuallyOverridden = true;
                localStorage.setItem('epilens_clusterGapThreshold', value.toFixed(2));
                localStorage.setItem('epilens_clusterThresholdManualOverride', 'true');
            });
        }

        if (this.resetClusterGapThresholdBtn) {
            this.resetClusterGapThresholdBtn.addEventListener('click', () => {
                this.isClusterThresholdManuallyOverridden = false;
                localStorage.setItem('epilens_clusterThresholdManualOverride', 'false');
                this._updateClusterGapThresholdDisplay();
            });
        }
    }

    // TASK 8908.3 Initialize settings overlay
    _initializeSettingsOverlay() {
        this.settingsOverlay = document.getElementById("settingsOverlay");
        this.openSettingsBtn = document.getElementById("openSettingsBtn");
        this.closeSettingsBtn = document.getElementById("closeSettingsBtn");
        this.saveSettingsBtn = document.getElementById("saveSettingsBtn");
        this.redMetricsToggle = document.getElementById("redMetricsToggle");
        this.temporalContrastToggle = document.getElementById("temporalContrastToggle");

        if (this.redMetricsToggle) {
            this.redMetricsToggle.checked = this.redMetricsEnabled;
        }

        if (this.temporalContrastToggle) {
            this.temporalContrastToggle.checked = this.temporalContrastEnabled;
        }

        if (this.openSettingsBtn) {
            this.openSettingsBtn.addEventListener('click', () => this.openSettings());
        }

        if (this.closeSettingsBtn) {
            this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        }

        if (this.saveSettingsBtn) {
            this.saveSettingsBtn.addEventListener('click', () => this._saveSettings());
        }

        if (this.settingsOverlay) {
            this.settingsOverlay.addEventListener('click', (e) => {
                if (e.target === this.settingsOverlay) {
                    this.closeSettings();
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (
                e.key === 'Escape' &&
                this.settingsOverlay &&
                this.settingsOverlay.style.display === 'flex'
            ) {
                this.closeSettings();
            }
        });
    }

    openSettings() {
        if (this.settingsOverlay) {
            this.settingsOverlay.style.display = 'flex';
            this.settingsOverlay.setAttribute('aria-hidden', 'false'); // WCAG Focus order bug fix
            if (this.redMetricsToggle) this.redMetricsToggle.checked = this.redMetricsEnabled;
            if (this.temporalContrastToggle) this.temporalContrastToggle.checked = this.temporalContrastEnabled;
            setTimeout(() => {
                if (this.closeSettingsBtn) this.closeSettingsBtn.focus();
            }, 100);
        }
    }

    closeSettings() {
        if (this.settingsOverlay) {
            this.settingsOverlay.style.display = 'none';
            this.settingsOverlay.setAttribute('aria-hidden', 'true'); // WCAG Focus order bug fix
            // Return focus to the trigger button
            if (this.openSettingsBtn) this.openSettingsBtn.focus();
        }
    }

    _saveSettings() {
        if (this.redMetricsToggle) {
            this.redMetricsEnabled = this.redMetricsToggle.checked;
            localStorage.setItem('epilens_redMetricsEnabled', this.redMetricsEnabled.toString());
        }

        if (this.temporalContrastToggle) {
            this.temporalContrastEnabled = this.temporalContrastToggle.checked;
            localStorage.setItem('epilens_temporalContrastEnabled', this.temporalContrastEnabled.toString());
            console.log('Temporal contrast sensitivity', this.temporalContrastEnabled ? 'enabled' : 'disabled');
        }

        this.closeSettings();
    }

    // TASK 8902.10: Calculates the ideal cluster gap threshold based on the analysis
    // interval using multiplier
    _calculateRecommendedClusterGapThreshold(analysisInterval) {
        const multiplier = 3.5;
        const calculatedThreshold = analysisInterval * multiplier;
        const minThreshold = 0.05;
        const maxThreshold = 2.0;
        const clamped = Math.max(minThreshold, Math.min(maxThreshold, calculatedThreshold));
        return Math.round(clamped * 100) / 100;
    }

    // Used via the fileanalyzer.html for offline analysis only
    _updateClusterGapThresholdDisplay() {
        if (!this.analysisIntervalInput) return;

        const interval = parseFloat(this.analysisIntervalInput.value);
        const recommended = this._calculateRecommendedClusterGapThreshold(interval);

        if (this.autoClusterGapThresholdValue) {
            this.autoClusterGapThresholdValue.textContent = recommended.toFixed(2);
        }

        if (!this.isClusterThresholdManuallyOverridden && this.clusterGapThresholdInput) {
            this.clusterGapThresholdInput.value = recommended.toFixed(2);
            if (this.clusterGapThresholdValue) {
                this.clusterGapThresholdValue.textContent = recommended.toFixed(2);
            }
            this.clusterGapThreshold = recommended;
        }
    }

    _updateAnalysisIntervalFpsInfo() {
        if (!this.analysisIntervalInput || !this.analysisIntervalFpsInfo) return;
        const interval = parseFloat(this.analysisIntervalInput.value);
        const fps = interval > 0 ? (1 / interval).toFixed(2) : '-';
        this.analysisIntervalFpsInfo.textContent = `Current: ${fps} frames per second (fps)`;
    }


    getAnalysisInterval() {
        return this.analysisIntervalInput ? parseFloat(this.analysisIntervalInput.value) : 1 / 30;
    }

    getClusterGapThreshold() {
        return this.clusterGapThreshold;
    }

    isRedMetricsEnabled() {
        return this.redMetricsEnabled;
    }

    isTemporalContrastEnabled() {
        return this.temporalContrastEnabled;
    }

}