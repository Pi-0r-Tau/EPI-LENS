function renderResultsTable(result) {
    return `
    <div style="background:transparent;max-width:720px;margin:auto;">
        <table style="width:100%;border-radius:10px;overflow:hidden;background:rgba(30,32,36,0.98);color:#fff;font-size:1.08em;box-shadow:0 2px 8px #0002;border:2px solid #fff;">
            <tbody>
                <tr><th style="text-align:left;padding:8px 12px;background:rgba(255,255,255,0.08);color:#fff;">Metric</th><th style="text-align:left;padding:8px 12px;background:rgba(255,255,255,0.08);color:#fff;">Value</th></tr>
                <tr><td style="padding:7px 12px;">Time</td><td style="padding:7px 12px;">${result.timestamp !== undefined ? Number(result.timestamp).toFixed(2) : ''} s</td></tr>
                <tr><td style="padding:7px 12px;">Brightness</td><td style="padding:7px 12px;">${(result.brightness ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Red Intensity</td><td style="padding:7px 12px;">${(result.redIntensity ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Red Delta</td><td style="padding:7px 12px;">${(result.redDelta ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Flash Count</td><td style="padding:7px 12px;">${result.flashCount ?? 0}</td></tr>
                <tr><td style="padding:7px 12px;">Risk Level</td><td style="padding:7px 12px;text-transform:capitalize;">${result.riskLevel ?? ''}</td></tr>
                <tr><td style="padding:7px 12px;">PSI Score</td><td style="padding:7px 12px;">${(result.psi?.score ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Flicker Frequency</td><td style="padding:7px 12px;">${(result.flickerFrequency ?? 0).toFixed(2)} Hz</td></tr>
                <tr><td style="padding:7px 12px;">Entropy</td><td style="padding:7px 12px;">${(result.entropy ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Temporal Change</td><td style="padding:7px 12px;">${(result.temporalChange ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Frame Diff</td><td style="padding:7px 12px;">${(result.frameDifference?.difference ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Motion Ratio</td><td style="padding:7px 12px;">${(result.frameDifference?.motion ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Dominant Frequency</td><td style="padding:7px 12px;">${(result.spectralAnalysis?.dominantFrequency ?? 0).toFixed(2)} Hz</td></tr>
                <tr><td style="padding:7px 12px;">Intensity</td><td style="padding:7px 12px;">${(result.intensity ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Center Intensity</td><td style="padding:7px 12px;">${(result.spatialMap?.center ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Peripheral Intensity</td><td style="padding:7px 12px;">${(result.spatialMap?.periphery ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Red-Green Contrast</td><td style="padding:7px 12px;">${(result.chromaticFlashes?.redGreen ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Blue-Yellow Contrast</td><td style="padding:7px 12px;">${(result.chromaticFlashes?.blueYellow ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Temporal Contrast Rate</td><td style="padding:7px 12px;">${(result.temporalContrast?.currentRate ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Edge Density</td><td style="padding:7px 12px;">${(result.edgeDetection?.edgeDensity ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Edge Count</td><td style="padding:7px 12px;">${(result.edgeDetection?.edgeCount ?? 0)}</td></tr>
                <tr><td style="padding:7px 12px;">Edge Change Rate</td><td style="padding:7px 12px;">${(result.edgeDetection?.temporalEdgeChange ?? 0).toFixed(4)}</td></tr>
                <tr><td style="padding:7px 12px;">Dominant Color (R,G,B)</td><td style="padding:7px 12px;">
                    ${result.dominantColor ?
                        `${Number(result.dominantColor.r).toFixed(1)}, ${Number(result.dominantColor.g).toFixed(1)}, ${Number(result.dominantColor.b).toFixed(1)}` : '-'
                    }</td></tr>
                <tr><td style="padding:7px 12px;">Dominant Lab (L,a,b)</td><td style="padding:7px 12px;">
                    ${result.dominantLab ?
                        `${Number(result.dominantLab.L).toFixed(2)}, ${Number(result.dominantLab.a).toFixed(2)}, ${Number(result.dominantLab.b).toFixed(2)}` : '-'
                    }</td></tr>
                <tr><td style="padding:7px 12px;">CIE76 Delta</td><td style="padding:7px 12px;">
                    ${typeof result.cie76Delta !== "undefined" ? Number(result.cie76Delta).toFixed(4) : '-'}
                </td></tr>
                <tr><td style="padding:7px 12px;">Patterned Stimulus Score</td><td style="padding:7px 12px;">
                    ${typeof result.patternedStimulusScore !== "undefined" ? Number(result.patternedStimulusScore).toFixed(4) : '-'}
                </td></tr>
                <tr><td style="padding:7px 12px;">Spectral Flatness</td><td style="padding:7px 12px;">${typeof result.spectralFlatness !== "undefined" ? Number(result.spectralFlatness).toFixed(4) : (result.spectralAnalysis?.spectralFlatness !== undefined ? Number(result.spectralAnalysis.spectralFlatness).toFixed(4) : '-')}</td></tr>
                <tr><td style="padding:7px 12px;">Scene Change Score</td><td style="padding:7px 12px;">${typeof result.sceneChangeScore !== "undefined" ? Number(result.sceneChangeScore).toFixed(4) : '-'}</td></tr>
            </tbody>
        </table>
    </div>
    `;
}


window.renderResultsTable = renderResultsTable;