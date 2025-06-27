/**
 * @file background.js
 * @description Background script for the EPI-LENS browser extension. Handles tab updates, script injection,
 * analysis state management, and communication between popup, content, and analyzer scripts.
 * @module background
 */
"use strict";

/**
 * Holds the current analysis state.
 * @typedef {Object} AnalysisState
 * @property {boolean} isAnalyzing - Indicates if analysis is currently running.
 * @property {string} mode - The current analysis mode, in debugging other modes are used instead of professional.
 * @property {Object|null} results - The latest analysis results, or null if not available.
 * @property {number} [lastUpdate] - Timestamp of the last update, used for throttling updates.
 */
let analysisState = {
    isAnalyzing: false,
    mode: 'professional',
    results: null
};


/**
 * Enables or disables the extension action button based on the current tabs URL.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        if (tab.url?.includes('youtube.com')) {
            chrome.action.enable(tabId);
            // Check if scripts are already injected
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                function: () => {
                    return typeof VideoAnalyzer !== 'undefined' && window.analyzerInitialized;
                }
            }).then(results => {
                if (!results?.[0]?.result) {
                    // Only inject if not already present
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['analyzer.js', 'content.js']
                    }).catch(console.error);
                }
            }).catch(console.error);
        } else {
            chrome.action.disable(tabId);
        }
    }
});

/**
 * Handles messages from other extension components (popup, content, analyzer).
 * @param {Object} message - The message object containing the type and data.
 * @param {Object} _sender - The sender of the message (Not used: TASK-6872)
 * @param {function} sendResponse - Callback function to send a response.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch(message.type) {
        case 'START_ANALYSIS':
            handleStartAnalysis(message.options);
            break;
        case 'STOP_ANALYSIS':
            handleStopAnalysis();
            break;
        case 'ANALYSIS_UPDATE':
            handleAnalysisUpdate(message.data);
            break;
        case 'GET_STATE':
            sendResponse(analysisState);
            break;
    }
});

/**
 * Handles the start of an analysis session.
 * @param {Object} options - Analysis options.
 */
function handleStartAnalysis(options) {
    analysisState.isAnalyzing = true;
    analysisState.mode = options.mode;
}

/**
 * Handles stopping of the analysis session.
 */
function handleStopAnalysis() {
    analysisState.isAnalyzing = false;
}

/**
 * Handles updates to the analysis data and notifies the UI.
 * @param {Object} data - The latest analysis data.
 */
function handleAnalysisUpdate(data) {
    if (!data || data.error) return;

    try {
        analysisState.results = data;
        analysisState.lastUpdate = Date.now();

        chrome.runtime.sendMessage({
            type: 'UPDATE_UI',
            data: {
                ...data,
                state: analysisState
            }
        }).catch(() => {
        
        });
    } catch (error) {
        console.error('Error updating analysis state:', error);
        // If the extension context is invalid, the tab probably needs to be reloaded
        if (error.message.includes('Extension context invalidated')) {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0]) {
                    chrome.tabs.reload(tabs[0].id);
                }
            });
        }
    }
}

/**
 * Monitors for port disconnections and logs errors if any occur.
 */
chrome.runtime.onConnect.addListener(function(port) {
    port.onDisconnect.addListener(function() {
        if (chrome.runtime.lastError) {
            console.log('Port disconnected due to error:', chrome.runtime.lastError);
        }
    });
});