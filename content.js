/**
 * @file content.js
 * @description
 * Content script for EPI-LENS browser extension. Handles initialisation, video detection, communication with background, popup scripts
 * and real-time video analysis overlay for Youtube.
 * Integrates with VideoAnalyzer to process video frames and send analysis results.
 */
"use strict";


(function() {
    if (window.analyzerInitialized) return;
    window.analyzerInitialized = true;

    let analyzer;

    function initializeAnalyzer() {
        if (typeof VideoAnalyzer !== 'undefined') {
            analyzer = new VideoAnalyzer();
        } else {
            setTimeout(initializeAnalyzer, 100);
        }
    }

    /**
     * Initialises the VideoAnalyzer instance and sets up the enviroment.
     */
    initializeAnalyzer();

    let isAnalyzing = false;
    let videoElement = null;
    let analysisOptions = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;

    /**
     * Sets up a perdiodic check for the Youtube video player and initialises handlers when found.
     */
    function setupYouTubeHandler() {
        const checkForPlayer = setInterval(() => {
            const player = document.querySelector('.html5-video-player');
            if (player) {
                clearInterval(checkForPlayer);
                handleExistingVideos();
                setupVideoMutationObserver();
            }
        }, 1000);
    }

    /**
     * Handles existing video elements on the page and sets up listeners
     */
    function handleExistingVideos() {
        const videos = document.querySelectorAll('video');
        if (videos.length > 0) {
            videoElement = videos[0]; // One video element for Youtube
            setupVideoListeners(videoElement);
        }
    }

    /**
     * Sets up event listeners for play, pause, and seek events on the video element
     * @param {HTMLVideoElement} video - The video element to attach listeners to. 
     */
    function setupVideoListeners(video) {
        video.addEventListener('play', () => {
            if (!isAnalyzing) {
                startAnalysis({
                    mode: 'professional',
                    detailed: true,
                    timeline: true
                });
            } else {
                resumeAnalysis();
            }
            notifyAnalysisStarted();
        });

        video.addEventListener('pause', () => {
            if (isAnalyzing) pauseAnalysis();
        });

        video.addEventListener('seeked', () => {
            if (isAnalyzing) handleVideoSeek();
        });
    }

    /**
     * Notifies the extension that analysis has started
     */
    function notifyAnalysisStarted() {
        chrome.runtime.sendMessage({
            type: 'ANALYSIS_STATUS',
            data: {
                status: 'started',
                videoTitle: document.title,
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Sets up a MutationObserver to detect dynamically added video elements.
     */
    function setupVideoMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                const addedNodes = Array.from(mutation.addedNodes);
                const newVideo = addedNodes.find(node => node.nodeName === 'VIDEO');
                if (newVideo) {
                    videoElement = newVideo;
                    setupVideoListeners(newVideo);
                    break;
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Handles incoming messages from the extension (start/stop/export analysis)
     * @param {Object} message - The message object from the extension.
     * @param {Object} _sender - The sender of the message. (Not used: TASK-6872)
     * @param {Function} sendResponse - Callback to send a response
     * @returns {boolean} True if the response will be sent asynchronously.
     */
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        try {
            switch(message.action) {
                case 'START_ANALYSIS':
                    try {
                        startAnalysis(message.options);
                        sendResponse({ success: true });
                    } catch (error) {
                        console.error('Analysis failed:', error);
                        sendResponse({ success: false, error: error.message });
                    }
                    return true; 

                case 'STOP_ANALYSIS':
                    stopAnalysis();
                    sendResponse({ success: true });
                    break;

                case 'EXPORT_DATA':
                    if (analyzer) {
                        if (message.format === 'json') {
                            sendResponse({ json: analyzer.generateJSON() });
                        } else {
                            sendResponse({ csv: analyzer.generateCSV() });
                        }
                    } else {
                        sendResponse({ error: 'Analyzer not initialized' });
                    }
                    break;
            }
        } catch (error) {
            if (!handleExtensionError(error)) {
                console.error('Message handling error:', error);
                sendResponse({ success: false, error: error.message });
            }
        }
        return true;
    });

    

    /**
     * Creates an overlay div for visual feedback during analysis.
     * @returns {HTMLDivElement} The overlay element. 
     */
    function createOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'analysis-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            pointer-events: none;
            transition: background-color 0.2s;
        `;
        return overlay;
    }


    /**
     * Starts the video analysis process with the given options
     * @param {Object} options - Analysis options and thresholds. 
     * @returns {void}
     */
    function startAnalysis(options) {
        reconnectAttempts = 0;
        videoElement = document.querySelector('video');
        if (!videoElement) return;

        if (options.thresholds && analyzer) {
            analyzer.updateThresholds(options.thresholds);
        }

        isAnalyzing = true;
        analysisOptions = options;

        const overlay = createOverlay();
        videoElement.parentElement.appendChild(overlay);

        if (analyzer) {
            analyzer.reset(); // Reset metrics and startTime before starting new analysis
        }

        // Store initial video time
        const initialTime = videoElement.currentTime;
        console.log('Starting analysis at video time:', initialTime);

        // Debug logging
        setInterval(() => {
            if (analyzer && analyzer.totalFrames > 0) {
                console.log('Analysis stats:', {
                    totalFrames: analyzer.totalFrames,
                    chunks: analyzer.dataChunks.length,
                    currentChunkSize: analyzer.currentChunk.length,
                    startTime: analyzer.analysisStartTime,
                    lastTime: analyzer.lastExportTime
                });
            }
        }, 5000);

        analyzeVideo(options);
    }

   

    /**
     * Handles extension context errors and attempts reconnection if possible
     * @param {Error} error - The error object. 
     * @returns {boolean} True if the error was handled. 
     */
    function handleExtensionError(error) {
        if (error.message.includes('Extension context invalidated')) {
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

                // Reset state
                isAnalyzing = false;
                analyzer = null;

                // Attempt to reinitialize
                setTimeout(() => {
                    initializeAnalyzer();
                    if (videoElement && !videoElement.paused) {
                        startAnalysis({
                            mode: 'professional',
                            detailed: true,
                            timeline: true
                        });
                    }
                }, 1000 * reconnectAttempts);
            } else {
                console.error('Maximum reconnection attempts reached');
                stopAnalysis();
                removeOverlay();
            }
            return true;
        }
        return false;
    }

    /**
     * Removes the analysis overlay from the video player
     */
    function removeOverlay() {
        const overlay = document.querySelector('.analysis-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    /**
     * Updates the overlay's appearance based on flash detection.
     * @param {boolean} isFlash - Whether a flash was detected in the current frame. 
     */
    function updateOverlay(isFlash) {
        const overlay = document.querySelector('.analysis-overlay');
        if (overlay && isFlash) {
            overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
            setTimeout(() => {
                overlay.style.backgroundColor = 'transparent';
            }, 200);
        }
    }


    /**
     * Main loop for analyzing video frames and sending results to the extension.
     * @param {Object} options - Analysis options.  
     */
    function analyzeVideo(options) {
        if (!isAnalyzing || !videoElement || videoElement.paused) return;

        try {
            const currentTime = videoElement.currentTime;
            const results = analyzer.analyzeFrame(videoElement, currentTime);

            // Update last export time
            if (analyzer) {
                analyzer.lastExportTime = currentTime;
            }

            
            if (results && results.timestamp) {
                console.log('Frame analyzed at:', {
                    videoTime: currentTime,
                    relativeTimestamp: results.timestamp,
                    absoluteTimestamp: results.absoluteTimestamp
                });
            }

            // Skip if frame was dropped due to timing
            if (!results) {
                requestAnimationFrame(() => analyzeVideo(options));
                return;
            }

            // Create a clean data object for messaging
            const messageData = {
                flashCount: results.flashCount || 0,
                riskLevel: results.riskLevel || 'low',
                framesAnalyzed: results.framesAnalyzed || 0,
                brightness: results.brightness || 0,
                currentIntensity: results.currentIntensity || 0,
                currentTime: videoElement.currentTime || 0,
                duration: videoElement.duration || 0,
                fps: results.fps || 0,
                isFlash: results.isFlash || false,
                psi: results.psi,
                spatialMap: results.spatialMap,
                chromaticFlashes: results.chromaticFlashes,
                temporalContrast: results.temporalContrast,
                colorVariance: results.colorVariance || { r: 0, g: 0, b: 0 },
                temporalChange: results.temporalChange || 0,
                flickerFrequency: results.flickerFrequency || 0,
                entropy: results.entropy || 0,
                frameDifference: results.frameDifference || { difference: 0, motion: 0 },
                spectralAnalysis: results.spectralAnalysis || { dominantFrequency: 0, spectrum: [] },
                temporalCoherence: results.temporalCoherence || { coherenceScore: 0, periodicity: null },
                edgeDetection: results.edgeDetection || { edgeDensity: 0, edgeCount: 0, temporalEdgeChange: 0 },
                ...results
            };

            // Send update to popup
            chrome.runtime.sendMessage({
                type: 'ANALYSIS_UPDATE',
                data: messageData
            }).catch(handleMessageError);

            // Update visual feedback
            updateOverlay(results.isFlash);
        } catch (error) {
            console.error('Analysis error:', error);
            // Error recovery
            if (error.message.includes('Extension context invalidated')) {
                handleExtensionError(error);
            }
        }

        // UPDATE: Replaced method requestAnimationFrame with setTimeout for stability
        setTimeout(() => analyzeVideo(options), 16);
    }

    /**
     * Handles errors when sending messages to the extension.
     * @param {Error} error - The error object. 
     */
    function handleMessageError(error) {
        console.error('Message sending failed:', error);
        if (error.message.includes('Message length exceeded')) {
            // Handle large messages
            console.warn('Message too large, reducing data size');
        }
    }

    /**
     * Pauses the analysis loop
     */
    function pauseAnalysis() {
        isAnalyzing = false;
    }

    /**
     * Resumes the analysis loop if a video element is present
     */
    function resumeAnalysis() {
        if (videoElement) {
            isAnalyzing = true;
            analyzeVideo(analysisOptions);
        }
    }

    /**
     * Handles video seek events to reset brightness tracking
     */
    function handleVideoSeek() {
        // Reset last brightness value to prevent false positives
        if (analyzer) {
            analyzer.metrics.lastFrameBrightness = 0;
        }
    }

    // Initialize only if on YouTube
    if (window.location.hostname.includes('youtube.com')) {
        initializeAnalyzer();
        setupYouTubeHandler();
    }
})();
