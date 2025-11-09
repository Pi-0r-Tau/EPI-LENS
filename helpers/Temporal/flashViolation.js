window.AnalyzerHelpers = window.AnalyzerHelpers || {};

// WCAG 2.1 flash violation tracker - detects >3 flashes per second
// Discrete 1 second windows starting at first flash; windows are measured from the first flash
// If more than 3 flashes occur within 1 second window, this is a violation

// TASK 8901: Flash cluster detection indentifies temporal grouping of flashes
// Clusters are continious  temporal regions where multiple flashes occur in close proximity
// This is here with the flash violation tracker as I want a dedicated file for both, but for my sanity no more file bloat
// Famous last words

// Further sanity enforcement shall be referring to subtasks of TASK 8901 as T8901.xx 

window.AnalyzerHelpers.initFlashViolationTracking = function () {
    this.flashViolations = {
        instances: [],
        currentWindowFlashes: [],
        windowStartTime: null,
        windowStartFrame: null,
        isInWindow: false,
        totalViolationFrames: 0,
        totalAnalyzedFrames: 0,
        flashThreshold: 3,
        // T8901.1: Cluster detection state
        flashClusters: [],
        currentCluster: null,
        clusterGapThreshold: 0.3, // Gap in seconds between flashes to consider them separate clusters
        lastFlashTime: null,
        allFlashes: [] // Track all flashes for post-processing and analysis
    };
};

window.AnalyzerHelpers.updateFlashViolation = function (timestamp, isFlash, frameNumber) {
    const v = this.flashViolations;
    v.totalAnalyzedFrames++;

    if (isFlash) {
        // T8901.2: Track all flashes for post-processing
        v.allFlashes.push({ timestamp, frameNumber });

        if (!v.isInWindow) {
            v.isInWindow = true;
            v.windowStartTime = timestamp; // window starts at first flash

            // So although confusing as hell this late at night,
            // If flashes are detected at 5.9, 6.1, 6.3 and say 6.5 seconds; this counts as 4 flashes in the 1 second window
            // Even though the window is technically 5.9 to 6.9 seconds, the 6.5 flash is still within that window
            // Therefore we track all flashes within the window, and only at window end determine which frames were within the window
            // This allows accurate frame counts for violations that straddle window boundaries

            v.windowStartFrame = frameNumber;
            v.currentWindowFlashes = [{ timestamp, frameNumber }];
        } else {
            v.currentWindowFlashes.push({ timestamp, frameNumber });
        }

        // TT8901.3: Clustering based on gap threshold
        if (v.lastFlashTime === null || (timestamp - v.lastFlashTime) > v.clusterGapThreshold) {
            // Start new cluster
            if (v.currentCluster !== null) {
                v.flashClusters.push(v.currentCluster);
            }
            v.currentCluster = {
                startTime: timestamp,
                startFrame: frameNumber,
                endTime: timestamp,
                endFrame: frameNumber,
                count: 1,
                flashes: [{ timestamp, frameNumber }],
            };
        } else {
            // Add to current cluster
            v.currentCluster.endTime = timestamp;
            v.currentCluster.endFrame = frameNumber;
            v.currentCluster.count++;
            v.currentCluster.flashes.push({ timestamp, frameNumber });
        }

        v.lastFlashTime = timestamp;
    }

    // Window complete after 1 second
    if (v.isInWindow && timestamp >= v.windowStartTime + 1.0) {
        const flashCount = v.currentWindowFlashes.length;

        if (flashCount > v.flashThreshold) {  // Use configurable threshold
            const windowEndTime = v.windowStartTime + 1.0;

            // Since current frame timestamp >= windowEndTime, the previous frame (frameNumber - 1)
            // is the last frame that was analyzed before crossing the boundary
            // This is guaranteed to be correct because we're called on every frame in sequence
            const windowEndFrame = frameNumber - 1;

            // BOTH START and END FRAMES are INCLUSIVE.
            // Keep making the mistake of "correcting" this.
            const violationFrameCount = windowEndFrame - v.windowStartFrame + 1;

            v.instances.push({
                startTime: v.windowStartTime,
                endTime: windowEndTime,
                duration: 1.0,
                startFrame: v.windowStartFrame,
                endFrame: windowEndFrame,
                frameCount: violationFrameCount,
                flashCount,
                // T8901.4: Associate violation with clusters that overlap this window
                associatedClusters: window.AnalyzerHelpers._getAssociatedClusters(
                    v.windowStartTime,
                    windowEndTime,
                    v.currentCluster,
                    v.flashClusters
                )
            });

            v.totalViolationFrames += violationFrameCount;
        }

        v.isInWindow = false;
        v.currentWindowFlashes = [];
    }

    return {
        // inViolation indicates a window is active tracking flashes
        // NOT that a violation has been confirmed determined at window end
        inViolation: v.isInWindow,
        flashesInWindow: v.currentWindowFlashes.length,
        violationFrameCount: v.totalViolationFrames,
        violationInstanceCount: v.instances.length,
        // T8901.5: Cluster detection output
        clusterCount: v.flashClusters.length + (v.currentCluster !== null ? 1 : 0),
        flashClusters: v.flashClusters.concat(v.currentCluster !== null ? [v.currentCluster] : [])
    };
};