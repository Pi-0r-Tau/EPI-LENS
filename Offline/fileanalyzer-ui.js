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

    }