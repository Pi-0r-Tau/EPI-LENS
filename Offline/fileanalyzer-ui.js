// TASK 8910.1
// UI stuff from fileanalyzer.js as its own class, was making it bulky, so it is now here.
// Same thing for the offline/ fileanalyzer-exporter.js, ''-settings.js.


'use strict'

class FileAnalyzerUIControls {
    constructor(drawLiveMetricsGraphCallback) {
        this.drawLiveMetricsGraphCallback = drawLiveMetricsGraphCallback;
        this.videoSizes = [
            { width: '320px', height: '180px' },
            { width: '480px', height: '270px' },
            { width: '640px', height: '360px' },
            { width: '800px', height: '450px' },
            { width: '100%', height: 'auto' }
        ];
        // Defaults to size 2 as when the page loads for the first time I do non want to have to resize anything.
        // I want some bethesda level of "It just works", even though I do not have 4 times the detail. I have 80 metrics.
        this.videoSizeIdx = 2;
        this.graphSizes = [
            { w: 400, h: 200 },
            { w: 600, h: 300 },
            { w: 750, h: 400 },
            { w: 1000, h: 500 },
            { w: 1200, h: 600 }
        ];

        // Same here, default to size 2.
        this.graphSizeIdx = 2;
        this.videoPlayer = null;
        this.videoSizeDown = null;
        this.videoSizeUp = null;
        this.liveMetricsGraph = null;
        this.graphSizeDown = null;
        this.graphSizeUp = null;
    }

    initialize() {
        this._queryDOMElements();
        this._setupVideoControls();
        this._setupGraphControls();
        this._applyVideoSize();
        this._applyGraphSize();
    }

    _queryDOMElements() {
        this.videoPlayer = document.getElementById('videoPlayer');
        this.videoSizeDown = document.getElementById('videoSizeDown');
        this.videoSizeUp = document.getElementById('videoSizeUp');
        this.liveMetricsGraph = document.getElementById('liveMetricsGraph');
        this.graphSizeDown = document.getElementById('graphSizeDown');
        this.graphSizeUp = document.getElementById('graphSizeUp');
    }

    _setupVideoControls() {
        if (this.videoSizeDown) {
            this.videoSizeDown.addEventListener('click', () => {
                if (this.videoSizeIdx > 0) {
                    this.videoSizeIdx--;
                    this._applyVideoSize();
                }
            });
        }

        if (this.videoSizeUp) {
            this.videoSizeUp.addEventListener('click', () => {
                if (this.videoSizeIdx < this.videoSizes.length - 1) {
                    this.videoSizeIdx++;
                    this._applyVideoSize();
                }
            });
        }
    }

    _setupGraphControls() {
        if (this.graphSizeDown) {
            this.graphSizeDown.addEventListener('click', () => {
                if (this.graphSizeIdx > 0) {
                    this.graphSizeIdx--;
                    this._applyGraphSize();
                }
            });
        }

        if (this.graphSizeUp) {
            this.graphSizeUp.addEventListener('click', () => {
                if (this.graphSizeIdx < this.graphSizes.length - 1) {
                    this.graphSizeIdx++;
                    this._applyGraphSize();
                }
            });
        }
    }

    _applyVideoSize() {
        if (!this.videoPlayer) return;
        const sz = this.videoSizes[this.videoSizeIdx];
        this.videoPlayer.style.width = sz.width;
        this.videoPlayer.style.height = sz.height;
        this.videoPlayer.style.maxWidth = "100%";
        this.videoPlayer.style.maxHeight = "600px";
    }

    _applyGraphSize() {
        if (!this.liveMetricsGraph) return;
        const sz = this.graphSizes[this.graphSizeIdx];
        this.liveMetricsGraph.width = sz.w;
        this.liveMetricsGraph.height = sz.h;
        this.liveMetricsGraph.style.width = "100%";
        this.liveMetricsGraph.style.height = sz.h + "px";

        if (this.drawLiveMetricsGraphCallback) {
            this.drawLiveMetricsGraphCallback();
        }
    }

    getVideoPlayer() {
        return this.videoPlayer;
    }

    getLiveMetricsGraph() {
        return this.liveMetricsGraph;
    }

    getCurrentVideoSize() {
        return this.videoSizes[this.videoSizeIdx];
    }

    getCurrentGraphSize() {
        return this.graphSizes[this.graphSizeIdx];
    }

    resetVideoSize() {
        this.videoSizeIdx = 2;
        this._applyVideoSize();
    }

    resetGraphSize() {
        this.graphSizeIdx = 2;
        this._applyGraphSize();
    }

}