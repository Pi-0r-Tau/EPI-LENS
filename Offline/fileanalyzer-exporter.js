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

}