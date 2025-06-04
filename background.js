"use strict";

let analysisState = {
    isAnalyzing: false,
    mode: 'professional',
    results: null
};


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

function handleStartAnalysis(options) {
    analysisState.isAnalyzing = true;
    analysisState.mode = options.mode;
}

function handleStopAnalysis() {
    analysisState.isAnalyzing = false;
}

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

// Connection monitoring
chrome.runtime.onConnect.addListener(function(port) {
    port.onDisconnect.addListener(function() {
        if (chrome.runtime.lastError) {
            console.log('Port disconnected due to error:', chrome.runtime.lastError);
        }
    });
});
