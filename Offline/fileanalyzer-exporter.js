// TASK 8907: fileanalyzer.js logic for exporting data, sanitizing and violation JSON exports
// Removed from main fileanalyzer.js due as it was getting way too bulky, so I have hidden it within a folder..
// JK its here because I want to improve it with out everything falling over

"use strict"

class FileAnalyzerExporter {
    constructor() {
        this.baseFilename = null;
    }
    // Sanitizes file names for export
    sanitizeFileName(name) {
        return name.replace(/[^a-z0-9_\-\.]/gi, '_');
    }

    downloadFile(content, filename, mimeType) {
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
    // Get base filename
    generateBaseFilename(playlist, playlistIndex, prefix = 'epilens-file-analysis') {
        let filename = `${prefix}-${Date.now()}`;
        if (playlist.length && playlist[playlistIndex]) {
            filename = `${prefix}-${this.sanitizeFileName(playlist[playlistIndex].name.replace(/\.[^/.]+$/, ""))}`;
        }
        return filename;
    }

    async exportSelectedFormats(analyzer, playlist, playlistIndex) {
        if (!analyzer) return;
        // Automatically export in all selected formats, be it one, two or three
        // Nice to know thingy: By selecting NDJSON the analysis speed is lighyears faster,
        // and even better if speed is important. Just export the Summary stats
        const exportCSV = document.getElementById('exportCSVOption')?.checked || false;
        const exportJSON = document.getElementById('exportJSONOption')?.checked || false;
        const exportNDJSON = document.getElementById('exportNDJSONOption')?.checked || false;
        // Get base filename
        const baseFilename = this.generateBaseFilename(playlist, playlistIndex);

        // TASK 1962: Await all exports to complete before proceeding
        // fixes issue with large exports being cut off, aka the NDJSON export
        const exportPromises = []
        let exportDelay = 100;

        if (exportCSV) {
            exportPromises.push(this.exportCSV(analyzer, baseFilename, exportDelay));
            exportDelay += 150;
        }

        if (exportJSON) {
            exportPromises.push(this.exportJSON(analyzer, baseFilename, exportDelay));
            exportDelay += 150;
        }

        if (exportNDJSON) {
            exportPromises.push(this.exportNDJSON(analyzer, baseFilename, exportDelay));
            exportDelay += 150;
        }

        await Promise.all(exportPromises);
    }

    exportCSV(analyzer, baseFilename, delay = 0) {
        return new Promise(resolve => {
            setTimeout(() => {
                // Stream CSV
                let csv = '';
                for (const line of analyzer.streamCSV()) {
                    csv += line;
                }
                this.downloadFile(csv, `${baseFilename}.csv`, 'text/csv');
                resolve();
            }, delay);
        });
    }

    exportJSON(analyzer, baseFilename, delay = 0) {
        return new Promise(resolve => {
            // JSON requires full data object for generation, so no streaming
            setTimeout(() => {
                const json = analyzer.generateJSON();
                this.downloadFile(json, `${baseFilename}.json`, 'application/json');
                resolve();
            }, delay);
        });
    }

    exportNDJSON(analyzer, baseFilename, delay = 0) {
        return new Promise(resolve => {
            // Stream NDJSON
            setTimeout(() => {
                let ndjson = '';
                for (const line of analyzer.streamNDJSON()) {
                    ndjson += line;
                }
                this.downloadFile(ndjson, `${baseFilename}.ndjson`, 'application/x-ndjson');
                resolve();
            }, delay);
        });
    }

    // TASK 8902.19: Export of summary stats in JSON file
    exportSummaryStats(analyzer, video, playlist, playlistIndex, thresholds) {
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
                flashesPerSecond: parseFloat(thresholds.flashesPerSecond || 3),
                flashIntensity: parseFloat(thresholds.flashIntensity || 0.2)
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
        const baseFilename = this.generateBaseFilename(playlist, playlistIndex, 'epilens-summary');
        this.downloadFile(summaryJson, `${baseFilename}.json`, 'application/json');
    }

    async exportAnalysisComplete(
        analyzer,
        video,
        playlist,
        playlistIndex,
        clusterGapThreshold,
        analysisInterval
    ) {
        if (!analyzer) return;

        const exportCSV = document.getElementById('exportCSVOption')?.checked || false;
        const exportJSON = document.getElementById('exportJSONOption')?.checked || false;
        const exportNDJSON = document.getElementById('exportNDJSONOption')?.checked || false;
        const exportSummary = document.getElementById('exportSummaryStatsOption')?.checked || false;

        const baseFilename = this.generateBaseFilename(playlist, playlistIndex);
        const duration = video.duration;
        const violationStats = analyzer.getViolationStatistics ?
            analyzer.getViolationStatistics(duration) : null;

        const exportPromises = [];
        let exportDelay = 100;

        if (exportCSV) {
            exportPromises.push(this.exportCSV(analyzer, baseFilename, exportDelay));
            exportDelay += 150;
        }

        if (exportJSON) {
            exportPromises.push(this.exportJSON(analyzer, baseFilename, exportDelay));
            exportDelay += 150;
        }

        if (exportNDJSON) {
            exportPromises.push(this.exportNDJSON(analyzer, baseFilename, exportDelay));
            exportDelay += 150;
        }

        if (exportSummary) {
            exportPromises.push(
                this.exportSummaryWMetadata(
                    analyzer,
                    baseFilename,
                    duration,
                    violationStats,
                    clusterGapThreshold,
                    analysisInterval,
                    playlist,
                    playlistIndex,
                    exportDelay
                )
            );
        }

        await Promise.all(exportPromises);
    }

    exportSummaryWMetadata(
        analyzer,
        baseFilename,
        duration,
        violationStats,
        clusterGapThreshold,
        analysisInterval,
        playlist,
        playlistIndex,
        delay = 0
    ) {
        return new Promise(resolve => {
            setTimeout(() => {
                const summary = this.buildSummary(
                    analyzer,
                    duration,
                    violationStats,
                    clusterGapThreshold,
                    analysisInterval,
                    playlist,
                    playlistIndex
                );

                const summaryJson = JSON.stringify(summary, null, 2);
                this.downloadFile(summaryJson, `${baseFilename}.json`, 'application/json');
                resolve();
            }, delay);
        });
    }

    buildSummary(
        analyzer,
        duration,
        violationStats,
        clusterGapThreshold,
        analysisInterval,
        playlist,
        playlistIndex
    ) {
        const summary = {
            fileName: playlist.length && playlist[playlistIndex] ?
                playlist[playlistIndex].name : 'unknown',
                // T8902.20.3: Flash violation stats info and def for JSON export
            violationExplanation: {
                wcagCriteria: 'WCAG 2.1 Success Criterion 2.3.1: Three Flashes or Below Threshold (Level A)',
                definition: 'A violation occurs when more than 3 flashes happen per second within any 1 second window, or when flashes exceed the general flash and red flash intensity thresholds.',
                windowBehavior: 'Flash triggered discrete windows: each window starts at the first flash and lasts exactly 1 second.',
                frameCountCalculation: 'Frames are analyzed at fixed intervals. Each 1-second window captures all frames from the window start through the last frame before crossing the 1-second boundary (inclusive counting).',
                expectedFramesPerWindow: analysisInterval > 0 ? Math.round(1.0 / analysisInterval) : null,
                note: 'Frame count per window = (endFrame - startFrame + 1). Both boundary frames are included in the count.'
            },
            //T8902.30.4: Cluster statistics info and def for JSON export
            clusterExplanation: {
                definition: `Flash clusters are temporal groupings of flashes separated by gaps greater than the cluster gap threshold (${clusterGapThreshold} seconds).`,
                gapThreshold: clusterGapThreshold,
                algorithm: `Single-linkage temporal clustering: flashes are grouped into the same cluster if they occur within ${clusterGapThreshold} seconds of any other flash in the cluster.`,
                purpose: 'Clusters help identify patterns in flash distribution.',
                note: 'Clusters may overlap with violation windows but are independent groupings based on temporal proximity.'
            },
            analysisDate: new Date().toISOString(),
            duration: duration,
            flashCount: analyzer.metrics ? analyzer.metrics.flashCount : 0,
            riskLevel: analyzer.metrics ? analyzer.metrics.riskLevel : 'unknown',
            violationStatistics: violationStats,
            //T8902.20.5: cluster statistics for export
            clusterStatistics: this.buildClusterStatistics(analyzer),
            thresholds: {
                analysisInterval: analysisInterval,
                analysisFPS: analysisInterval > 0 ? parseFloat((1.0 / analysisInterval).toFixed(2)) : null
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

        return summary;
    }

    buildClusterStatistics(analyzer) {
        if (!analyzer?.flashViolations?.flashClusters) {
            return null;
        }

        const clusters = analyzer.flashViolations.flashClusters;
        if (clusters.length === 0) {
            return null;
        }

        const clusterSizes = clusters.map(c => c.count);
        const totalFlashes = clusterSizes.reduce((sum, c) => sum + c, 0);
        const timeSpan = Math.max(...clusters.map(c => c.endTime)) -
                         Math.min(...clusters.map(c => c.startTime));

        return {
            totalClusters: clusters.length,
            averageClusterSize: (clusterSizes.reduce((a, b) => a + b, 0) / clusterSizes.length).toFixed(2),
            minClusterSize: Math.min(...clusterSizes),
            maxClusterSize: Math.max(...clusterSizes),
            medianClusterSize: window.AnalyzerHelpers._median?.(clusterSizes).toFixed(2) || 0,
            clusterDensity: timeSpan > 0 ? (totalFlashes / timeSpan).toFixed(2) : 0,
            totalFlashesInClusters: totalFlashes,
            clusters: clusters.map((c, idx) => ({
                clusterId: idx + 1,
                startTime: c.startTime.toFixed(3),
                endTime: c.endTime.toFixed(3),
                duration: (c.endTime - c.startTime).toFixed(3),
                startFrame: c.startFrame,
                endFrame: c.endFrame,
                flashCount: c.count,
                flashes: c.flashes?.map(f => ({
                    timestamp: f.timestamp.toFixed(3),
                    frameNumber: f.frameNumber
                })) || []
            }))
        };
    }
}

if (typeof window !== 'undefined') {
    window.FileAnalyzerExporter = FileAnalyzerExporter;
}
