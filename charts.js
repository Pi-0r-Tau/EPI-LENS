/**
 * @description Interactive charting module for EPI-LENS data analysis.
 * 
 * This file provides a dark themed, dependency free UI for visuals of analysis metrics
 * This includes:
 * - Dynamic chart creation (Scatter/Line/Multiline or single view)
 * - Playback controls for timestamped data
 * - Data export
 * - Tooltip and lengend interactivity
 * Designed for in browser enviroments, essentially PEAT for web.
 */

let analysisData = [];
let availableFields = [];
let charts = [];
let playbackIndex = 0;
let playbackTimer = null;
let isPlaying = false;


let zoomMode = 'fit'; 
let zoomWindowSize = 40; 
let chartViewMode = 'multi';

// selection zoom
let selectionZoom = null; // {startIdx, endIdx} or null

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupAddChartModal();
    setupPlaybackControls();
    if (availableFields.length >= 2) {
        addChart('timestamp', 'brightness');
    }
    // Export all button to the page 
    let exportAllBtn = document.getElementById('exportAllChartsBtn');
    if (exportAllBtn) {
        exportAllBtn.onclick = () => exportChartData();
    }
    // Zoom controls
    let zoomControls = document.getElementById('zoomControls');
    if (!zoomControls) {
        zoomControls = document.createElement('div');
        zoomControls.id = 'zoomControls';
        zoomControls.style.margin = '12px 0 8px 0';
        zoomControls.style.display = 'flex';
        zoomControls.style.gap = '10px';
        zoomControls.style.alignItems = 'center';

        const fitBtn = document.createElement('button');
        fitBtn.textContent = 'Fit All';
        fitBtn.onclick = () => {
            zoomMode = 'fit';
            renderAllCharts();
        };
        const windowBtn = document.createElement('button');
        windowBtn.textContent = 'Zoom Window';
        windowBtn.onclick = () => {
            zoomMode = 'window';
            renderAllCharts();
        };
        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Reset Zoom';
        resetBtn.onclick = () => {
            zoomMode = 'fit';
            renderAllCharts();
        };
        
        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'Toggle Chart View';
        viewBtn.onclick = () => {
            chartViewMode = chartViewMode === 'multi' ? 'single' : 'multi';
            renderAllCharts();
        };
        zoomControls.appendChild(fitBtn);
        zoomControls.appendChild(windowBtn);
        zoomControls.appendChild(resetBtn);
        zoomControls.appendChild(viewBtn);

        const container = document.querySelector('.charts-container');
        if (container) container.insertBefore(zoomControls, container.firstChild.nextSibling);
    }

    // Load JSON button TASK 2860
    const loadJsonBtn = document.getElementById('loadJsonBtn');
    const jsonFileInput = document.getElementById('jsonFileInput');
    if (loadJsonBtn && jsonFileInput) {
        loadJsonBtn.onclick = () => jsonFileInput.click();
        jsonFileInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const parsed = JSON.parse(evt.target.result);
                    if (parsed.analysis && Array.isArray(parsed.analysis)) {
                        analysisData = parsed.analysis.map(row => flattenMetrics(row));
                        availableFields = Object.keys(analysisData[0] || {});
                        charts = [];
                        playbackIndex = 0;
                        selectionZoom = null;
                        if (availableFields.length >= 2) {
                            addChart('timestamp', ['brightness']);
                        }
                        renderAllCharts();
                        setupPlaybackControls();
                    } else {
                        showError('Invalid JSON: No analysis array found.');
                    }
                } catch (err) {
                    showError('Failed to parse JSON file.');
                }
            };
            reader.readAsText(file);
            
            jsonFileInput.value = '';
        };
    }
})

async function loadData() {
    if (window.chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['epilensAnalysisData'], (result) => {
            if (result.epilensAnalysisData) {
                try {
                    const parsed = JSON.parse(result.epilensAnalysisData);
                    if (parsed.analysis && Array.isArray(parsed.analysis)) {
                        analysisData = parsed.analysis.map(row => flattenMetrics(row));
                        availableFields = Object.keys(analysisData[0] || {});
                        renderAllCharts();
                    }
                } catch (e) {
                    showError('Failed to parse analysis data.');
                }
            } else {
                showError('No analysis data found.');
            }
        });
    } else {
        showError('chrome.storage.local not available.');
    }
}
/**
 * Flattens nested metrics for charting and table display.
 * @param {Object} row - The analysis data row.
 * @returns {Object} Flattened row.
 */
function flattenMetrics(row) {
    const flat = { ...row };

    // colorVariance
    if (row.colorVariance) {
        flat['colorVariance.current.r'] = Number(row.colorVariance?.current?.r ?? 0);
        flat['colorVariance.current.g'] = Number(row.colorVariance?.current?.g ?? 0);
        flat['colorVariance.current.b'] = Number(row.colorVariance?.current?.b ?? 0);
        flat['colorVariance.temporal.r'] = Number(row.colorVariance?.temporal?.r ?? 0);
        flat['colorVariance.temporal.g'] = Number(row.colorVariance?.temporal?.g ?? 0);
        flat['colorVariance.temporal.b'] = Number(row.colorVariance?.temporal?.b ?? 0);
        flat['colorVariance.averageChange.r'] = Number(row.colorVariance?.averageChange?.r ?? 0);
        flat['colorVariance.averageChange.g'] = Number(row.colorVariance?.averageChange?.g ?? 0);
        flat['colorVariance.averageChange.b'] = Number(row.colorVariance?.averageChange?.b ?? 0);
        flat['colorVariance.spikes'] = Array.isArray(row.colorVariance?.spikes) ? row.colorVariance.spikes.length : 0;
    }

    // psi
    if (row.psi) {
        flat['psi.score'] = Number(row.psi?.score ?? 0);
        flat['psi.frequency'] = Number(row.psi?.components?.frequency ?? 0);
        flat['psi.intensity'] = Number(row.psi?.components?.intensity ?? 0);
        flat['psi.coverage'] = Number(row.psi?.components?.coverage ?? 0);
        flat['psi.duration'] = Number(row.psi?.components?.duration ?? 0);
    }

    // frameDifference
    if (row.frameDifference) {
        flat['frameDifference.difference'] = Number(row.frameDifference?.difference ?? 0);
        flat['frameDifference.motion'] = Number(row.frameDifference?.motion ?? 0);
    }

    // spectralAnalysis
    if (row.spectralAnalysis) {
        flat['spectralAnalysis.dominantFrequency'] = Number(row.spectralAnalysis?.dominantFrequency ?? 0);
    }

    // temporalCoherence
    if (row.temporalCoherence) {
        flat['temporalCoherence.coherenceScore'] = Number(row.temporalCoherence?.coherenceScore ?? row.temporalCoherence?.score ?? 0);
    }

    // edgeDetection
    if (row.edgeDetection) {
        flat['edgeDetection.edgeDensity'] = Number(row.edgeDetection?.edgeDensity ?? row.edgeDetection?.density ?? 0);
        flat['edgeDetection.edgeCount'] = Number(row.edgeDetection?.edgeCount ?? row.edgeDetection?.count ?? 0);
        flat['edgeDetection.temporalEdgeChange'] = Number(row.edgeDetection?.temporalEdgeChange ?? row.edgeDetection?.change ?? 0);
    }

    // spatialMap
    if (row.spatialMap) {
        flat['spatialMap.center'] = Number(row.spatialMap?.center ?? 0);
        flat['spatialMap.periphery'] = Number(row.spatialMap?.periphery ?? 0);
        if (Array.isArray(row.spatialMap?.quadrants)) {
            row.spatialMap.quadrants.forEach((q, i) => {
                flat[`spatialMap.quadrant${i+1}`] = Number(q ?? 0);
            });
        }
    }

    // chromaticFlashes
    if (row.chromaticFlashes) {
        flat['chromaticFlashes.redGreen'] = Number(row.chromaticFlashes?.redGreen ?? 0);
        flat['chromaticFlashes.blueYellow'] = Number(row.chromaticFlashes?.blueYellow ?? 0);
    }

    // temporalContrast
    if (row.temporalContrast) {
        flat['temporalContrast.currentRate'] = Number(row.temporalContrast?.currentRate ?? 0);
        flat['temporalContrast.maxRate'] = Number(row.temporalContrast?.maxRate ?? 0);
    }


    return flat;
}

/**
 * Displays an error message in the document body.
 * @param {string} msg - The error message.
 */
function showError(msg) {
    document.body.innerHTML = `<div style="color:#f44336;padding:32px;text-align:center;">${msg}</div>`;
}

const METRIC_COLORS = [
    "#2196f3", "#f44336", "#ff9800", "#4caf50", "#9c27b0", "#00bcd4", "#e91e63", "#8bc34a",
    "#ffc107", "#3f51b5", "#607d8b", "#ff5722", "#cddc39", "#795548", "#673ab7", "#009688"
];
/**
 * Returns a deterministic color for a metric name.
 * @param {string} metric
 * @returns {string}
 */
function getMetricColor(metric) {
    let idx = Math.abs(hashString(metric)) % METRIC_COLORS.length;
    return METRIC_COLORS[idx];
}

/**
 * Hashes a string to a numeric value.
 * @param {string} str
 * @returns {number}
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
    return hash;
}
/**
 * Sets up the modal dialog for adding a new chart.
 */
function setupAddChartModal() {
    const modal = document.getElementById('modal');
    const addChartBtn = document.getElementById('addChartBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const createChartBtn = document.getElementById('createChartBtn');
    const xAxisSelect = document.getElementById('xAxisSelect');
    const yAxisSelectContainer = document.getElementById('yAxisSelectContainer');
    const xAxisSearch = document.getElementById('xAxisSearch');
    const yAxisSearch = document.getElementById('yAxisSearch');

    let yAxisChecked = new Set();

    function renderXAxisOptions(filter = "") {
        xAxisSelect.innerHTML = "";
        availableFields
            .filter(f => f.toLowerCase().includes(filter.toLowerCase()))
            .forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                xAxisSelect.appendChild(opt);
            });
        if (xAxisSelect.options.length > 0) xAxisSelect.selectedIndex = 0;
    }

    function renderYAxisOptions(filter = "") {
        yAxisSelectContainer.innerHTML = "";
        availableFields
            .filter(f => f.toLowerCase().includes(filter.toLowerCase()))
            .forEach(f => {
                const label = document.createElement('label');
                label.className = 'y-axis-checkbox-label' + (yAxisChecked.has(f) ? ' selected' : '');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'y-axis-checkbox';
                checkbox.value = f;
                checkbox.checked = yAxisChecked.has(f);
                checkbox.onchange = () => {
                    if (checkbox.checked) yAxisChecked.add(f);
                    else yAxisChecked.delete(f);
                    label.classList.toggle('selected', checkbox.checked);
                };
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(f));
                yAxisSelectContainer.appendChild(label);
            });
    }

    addChartBtn.onclick = () => {
        yAxisChecked.clear();
        renderXAxisOptions();
        renderYAxisOptions();
        xAxisSearch.value = "";
        yAxisSearch.value = "";
        if (availableFields.length > 1) {
            let defaultY = availableFields[1] !== availableFields[0] ? availableFields[1] : availableFields[0];
            yAxisChecked.add(defaultY);
            renderYAxisOptions();
        }
        modal.classList.remove('hidden');
    };
    closeModalBtn.onclick = () => modal.classList.add('hidden');

    xAxisSearch.oninput = () => renderXAxisOptions(xAxisSearch.value);
    yAxisSearch.oninput = () => renderYAxisOptions(yAxisSearch.value);

    xAxisSelect.onchange = () => {
        if (yAxisChecked.has(xAxisSelect.value)) {
            yAxisChecked.delete(xAxisSelect.value);
            renderYAxisOptions(yAxisSearch.value);
        }
    };

    createChartBtn.onclick = () => {
        const x = xAxisSelect.value;
        const y = Array.from(yAxisChecked).filter(val => val !== x);
        if (x && y.length) {
            addChart(x, y);
            modal.classList.add('hidden');
        }
    };
}
/**
 * Adds a new chart configuration to the charts array and renders all charts.
 * @param {string} xField - The field for the X axis.
 * @param {string[]} yFields - The fields for the Y axes.
 */
function addChart(xField, yFields) {
    if (!xField || !Array.isArray(yFields) || !yFields.length) return;
    // Prevent adding charts with the same x/y combo
    if (charts.some(c => c.x === xField && JSON.stringify(c.y) === JSON.stringify(yFields))) return;
    charts.push({
        x: xField,
        y: yFields,
        showData: false,
        visible: yFields.map(() => true)
    });
    renderAllCharts();
}

/**
 * Renders all chart cards in the charts container.
 */
function renderAllCharts() {
    const area = document.getElementById('chartsArea');
    area.innerHTML = '';
    area.className = chartViewMode === 'single' ? 'chartsArea-single' : '';
    let resetViewBtn = document.getElementById('resetViewBtn');
    if (selectionZoom && selectionZoom.start != null && selectionZoom.end != null) {
        if (!resetViewBtn) {
            resetViewBtn = document.createElement('button');
            resetViewBtn.id = 'resetViewBtn';
            resetViewBtn.textContent = 'Reset View';
            resetViewBtn.style.margin = '0 0 16px 0';
            resetViewBtn.onclick = () => {
                selectionZoom = null;
                renderAllCharts();
            };
            area.parentNode.insertBefore(resetViewBtn, area);
        }
    } else if (resetViewBtn) {
        resetViewBtn.remove();
    }
    charts.forEach((chart, idx) => {
        try {
            area.appendChild(renderChartCard(chart, idx, idx));
        } catch (e) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'chart-card';
            errorDiv.style.color = '#f44336';
            errorDiv.textContent = 'Chart error: ' + (e && e.message ? e.message : e);
            area.appendChild(errorDiv);
        }
    });
}
/**
 * Renders a single chart card, including header, legend, chart, and data table.
 * @param {Object} chart - Chart configuration.
 * @param {number} idx - Chart index.
 * @returns {HTMLElement} The chart card element.
 */
function renderChartCard(chart, idx) {
    const card = document.createElement('div');
    card.className = 'chart-card';
    if (chartViewMode === 'single') {
        card.style.width = '98%';
        card.style.maxWidth = 'none';
        card.style.minWidth = '0';
        card.style.margin = '0 auto 24px auto';
    } else {
        card.style.width = '';
        card.style.maxWidth = '';
        card.style.minWidth = '';
        card.style.margin = '';
    }

    // Header
    const header = document.createElement('div');
    header.className = 'chart-header';
    const title = document.createElement('span');
    title.className = 'chart-title';
    title.textContent = `${chart.y.join(', ')} vs ${chart.x}`;
    header.appendChild(title);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'chart-actions';
    const upBtn = document.createElement('button');
    upBtn.textContent = '↑';
    upBtn.title = 'Move chart up';
    upBtn.disabled = idx === 0;
    upBtn.onclick = () => {
        if (idx > 0) {
            [charts[idx - 1], charts[idx]] = [charts[idx], charts[idx - 1]];
            renderAllCharts();
        }
    };
    const downBtn = document.createElement('button');
    downBtn.textContent = '↓';
    downBtn.title = 'Move chart down';
    downBtn.disabled = idx === charts.length - 1;
    downBtn.onclick = () => {
        if (idx < charts.length - 1) {
            [charts[idx], charts[idx + 1]] = [charts[idx + 1], charts[idx]];
            renderAllCharts();
        }
    };
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);

    const showDataBtn = document.createElement('button');
    showDataBtn.textContent = chart.showData ? 'Hide Data' : 'Show Data';
    showDataBtn.onclick = () => {
        chart.showData = !chart.showData;
        renderAllCharts();
    };
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.onclick = () => exportChartData([chart]);
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => {
        charts.splice(idx, 1);
        renderAllCharts();
    };
    actions.appendChild(showDataBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(removeBtn);
    header.appendChild(actions);

    card.appendChild(header);

    // Legend for toggling series
    const legend = document.createElement('div');
    legend.style.marginBottom = '6px';
    chart.y.forEach((yMetric, yIdx) => {
        const color = getMetricColor(yMetric);
        const legendItem = document.createElement('span');
        legendItem.style.display = 'inline-flex';
        legendItem.style.alignItems = 'center';
        legendItem.style.marginRight = '12px';
        legendItem.style.cursor = 'pointer';
        legendItem.innerHTML = `<span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:2px;margin-right:5px;opacity:${chart.visible[yIdx] ? 1 : 0.3};"></span>
            <span style="color:${chart.visible[yIdx] ? '#fff' : '#888'};font-size:13px;">${yMetric}</span>`;
        legendItem.onclick = () => {
            chart.visible[yIdx] = !chart.visible[yIdx];
            renderAllCharts();
        };
        legend.appendChild(legendItem);
    });
    card.appendChild(legend);

    // Chart canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'chart-canvas';
    if (chartViewMode === 'single') {
        canvas.width = 900;
        canvas.height = 400;
        canvas.style.width = '100%';
        canvas.style.height = '400px';
    } else {
        canvas.width = 420;
        canvas.height = 220;
        canvas.style.width = '';
        canvas.style.height = '';
    }
    card.appendChild(canvas);

    // Draw chart (no flash overlay) TASK 2848: Implement flash overlay correctly, there is the groundwork but it needs to be implemented correctly.
    if (chart.y.length === 1 && chart.y[0] === 'isFlash') {
        drawIsFlashScatter(canvas, chart);
    } else if (chart.x === 'timestamp') {
        drawMultiYAxisChart(canvas, chart);
    } else {
        drawMultiYAxisScatter(canvas, chart);
    }

    // Selection zoom logic
    let isSelecting = false;
    let selectStart = null;
    let selectEnd = null;
    let selectionRect = null;

    canvas.onmousedown = (e) => {
        isSelecting = true;
        const rect = canvas.getBoundingClientRect();
        selectStart = e.clientX - rect.left;
        selectEnd = null;
        if (!selectionRect) {
            selectionRect = document.createElement('div');
            selectionRect.style.position = 'absolute';
            selectionRect.style.background = 'rgba(33,150,243,0.18)';
            selectionRect.style.border = '1.5px solid #2196f3';
            selectionRect.style.pointerEvents = 'none';
            selectionRect.style.zIndex = 20;
            card.appendChild(selectionRect);
        }
        selectionRect.style.display = 'block';
    };
    canvas.onmousemove = (e) => {
        if (!isSelecting) return;
        const rect = canvas.getBoundingClientRect();
        selectEnd = e.clientX - rect.left;
        const x1 = Math.min(selectStart, selectEnd);
        const x2 = Math.max(selectStart, selectEnd);
        selectionRect.style.left = (canvas.offsetLeft + x1) + 'px';
        selectionRect.style.top = (canvas.offsetTop) + 'px';
        selectionRect.style.width = (x2 - x1) + 'px';
        selectionRect.style.height = canvas.height + 'px';
    };
    canvas.onmouseup = (e) => {
        if (!isSelecting) return;
        isSelecting = false;
        selectionRect && (selectionRect.style.display = 'none');
        const rect = canvas.getBoundingClientRect();
        selectEnd = e.clientX - rect.left;
        // Calculate indices for zoom
        const data = getMultiYAxisChartData(chart);
        const [start, end] = getZoomedIndices(data.x.length);
        const xVals = data.x;
        const left = 40, right = 10, w = canvas.width - left - right;
        let minPx = Math.min(selectStart, selectEnd);
        let maxPx = Math.max(selectStart, selectEnd);
        // Find closest indices
        let minIdx = 0, maxIdx = xVals.length - 1;
        for (let i = 0; i < xVals.length; ++i) {
            let px = left + ((i) / (xVals.length - 1)) * w;
            if (px >= minPx) { minIdx = i; break; }
        }
        for (let i = xVals.length - 1; i >= 0; --i) {
            let px = left + ((i) / (xVals.length - 1)) * w;
            if (px <= maxPx) { maxIdx = i; break; }
        }
        // Set selection zoom globally for all charts
        if (minIdx < maxIdx) {
            selectionZoom = { start: start + minIdx, end: start + maxIdx + 1 };
            renderAllCharts();
        }
    };
    // Right-click to reset selection zoom TASK 2847: This is buggy, fallback is the reset zoom button. 
    canvas.oncontextmenu = (e) => {
        e.preventDefault();
        selectionZoom = null;
        renderAllCharts();
    };

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.background = '#222';
    tooltip.style.color = '#fff';
    tooltip.style.padding = '4px 8px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.fontSize = '12px';
    tooltip.style.display = 'none';
    tooltip.style.zIndex = 10;
    card.appendChild(tooltip);

    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const { xVals, yVals, left, w, h, minX, maxX, minY, maxY } = getChartDataForDraw(canvas, chart);
        let closestIdx = -1, minDist = 1e9;
        for (let i = 0; i < xVals.length; ++i) {
            const px = left + ((xVals[i] - minX) / (maxX - minX)) * w;
            const pyArr = yVals.map((arr, j) => chart.visible[j] ? (canvas.height - 30 - ((arr[i] - minY) / (maxY - minY)) * h) : null);
            pyArr.forEach((py, j) => {
                if (py !== null) {
                    const dist = Math.abs(mx - px) + Math.abs(my - py);
                    if (dist < minDist) {
                        minDist = dist;
                        closestIdx = i;
                    }
                }
            });
        }
        if (closestIdx >= 0 && minDist < 20) {
            tooltip.style.display = 'block';
            tooltip.style.left = (mx + 10) + 'px';
            tooltip.style.top = (my - 10) + 'px';
            let html = `<b>${chart.x}:</b> ${xVals[closestIdx]}<br>`;
            chart.y.forEach((yMetric, j) => {
                if (chart.visible[j]) {
                    html += `<span style="color:${getMetricColor(yMetric)}">${yMetric}:</span> ${yVals[j][closestIdx]}<br>`;
                }
            });
            tooltip.innerHTML = html;
        } else {
            tooltip.style.display = 'none';
        }
    };
    canvas.onmouseleave = () => { tooltip.style.display = 'none'; };

    if (chart.showData) {
        const table = document.createElement('table');
        table.className = 'data-table';
        const thead = document.createElement('thead');
        thead.innerHTML = `<tr><th>${chart.x}</th>${chart.y.map(y => `<th>${y}</th>`).join('')}</tr>`;
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        let data = getMultiYAxisChartData(chart);
        for (let i = 0; i < data.x.length; ++i) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${formatCell(data.x[i], chart.x)}</td>` +
                chart.y.map((y, j) => `<td>${formatCell(data.y[j][i], y)}</td>`).join('');
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        card.appendChild(table);
    }

    return card;
}

/**
 * Draws a scatter plot for isFlash metric.
 * TASK 2848: This is the groundwork, need to fix this feature refer to TASK 2848 in notes.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} chart
 */
function drawIsFlashScatter(canvas, chart) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const left = 40, right = 10, top = 20, bottom = 30;
    const w = canvas.width - left - right;
    const h = canvas.height - top - bottom;
    let data = getMultiYAxisChartData(chart);

    let minX = Math.min(...data.x), maxX = Math.max(...data.x);
    let minY = 0, maxY = 1; 

    // Axes
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, canvas.height - bottom);
    ctx.lineTo(canvas.width - right, canvas.height - bottom);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = "#bbb";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(chart.x, left + w / 2, canvas.height - 6);
    ctx.save();
    ctx.translate(14, top + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('isFlash', 0, 0);
    ctx.restore();

    // Ticks
    ctx.fillStyle = "#666";
    ctx.font = "11px sans-serif";
    for (let i = 0; i <= 1; ++i) {
        let y = top + h - (h * (i / 1));
        ctx.fillText(i.toString(), left - 8, y + 3);
        ctx.beginPath();
        ctx.moveTo(left - 3, y);
        ctx.lineTo(left, y);
        ctx.stroke();
    }
    for (let i = 0; i <= 5; ++i) {
        let xVal = minX + (maxX - minX) * (i / 5);
        let x = left + w * (i / 5);
        ctx.fillText(xVal.toFixed(2), x, canvas.height - bottom + 16);
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - bottom);
        ctx.lineTo(x, canvas.height - bottom + 3);
        ctx.stroke();
    }

    // Draw scatter points
    ctx.fillStyle = "#ff9800";
    for (let i = 0; i < data.x.length; i++) {
        let x = left + ((data.x[i] - minX) / (maxX - minX)) * w;
        let y = top + h - ((data.y[0][i] - minY) / (maxY - minY)) * h;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
    }
}
/**
 * Draws a multi-Y-axis line chart for timestamp X axis.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} chart
 */
function drawMultiYAxisChart(canvas, chart) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { xVals, yVals, left, w, h, minX, maxX, minY, maxY } = getChartDataForDraw(canvas, chart);

    // Axes
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, 20);
    ctx.lineTo(left, canvas.height - 30);
    ctx.lineTo(canvas.width - 10, canvas.height - 30);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = "#bbb";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(chart.x, left + w / 2, canvas.height - 6);
    ctx.save();
    ctx.translate(14, 20 + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(chart.y.join(', '), 0, 0);
    ctx.restore();

    // Y axis ticks
    ctx.fillStyle = "#666";
    ctx.font = "11px sans-serif";
    for (let i = 0; i <= 5; ++i) {
        let yVal = minY + (maxY - minY) * (i / 5);
        let y = 20 + h - (h * (i / 5));
        ctx.fillText(yVal.toFixed(2), left - 8, y + 3);
        ctx.beginPath();
        ctx.moveTo(left - 3, y);
        ctx.lineTo(left, y);
        ctx.stroke();
    }
    // X axis ticks
    for (let i = 0; i <= 5; ++i) {
        let xVal = minX + (maxX - minX) * (i / 5);
        let x = left + w * (i / 5);
        ctx.fillText(xVal.toFixed(2), x, canvas.height - 30 + 16);
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - 30);
        ctx.lineTo(x, canvas.height - 30 + 3);
        ctx.stroke();
    }

    // Draw each metric as a line
    chart.y.forEach((yMetric, yIdx) => {
        if (!chart.visible[yIdx]) return;
        ctx.beginPath();
        ctx.strokeStyle = getMetricColor(yMetric);
        ctx.lineWidth = 2;
        for (let i = 0; i < xVals.length; i++) {
            let x = left + ((xVals[i] - minX) / (maxX - minX)) * w;
            let y = 20 + h - ((yVals[yIdx][i] - minY) / (maxY - minY)) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    });
}

/**
 * Draws a multi-Y-axis scatter plot for non-timestamp X axis.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} chart
 */
function drawMultiYAxisScatter(canvas, chart) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const left = 40, right = 10, top = 20, bottom = 30;
    const w = canvas.width - left - right;
    const h = canvas.height - top - bottom;
    let data = getMultiYAxisChartData(chart);

    let minX = Math.min(...data.x), maxX = Math.max(...data.x);
    let minY = Math.min(...data.y.flat()), maxY = Math.max(...data.y.flat());
    if (minX === maxX) maxX += 1;
    if (minY === maxY) maxY += 1;

    // Axes
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, canvas.height - bottom);
    ctx.lineTo(canvas.width - right, canvas.height - bottom);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = "#bbb";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(chart.x, left + w / 2, canvas.height - 6);
    ctx.save();
    ctx.translate(14, top + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(chart.y.join(', '), 0, 0);
    ctx.restore();

    // Y axis ticks
    ctx.fillStyle = "#666";
    ctx.font = "11px sans-serif";
    for (let i = 0; i <= 5; ++i) {
        let yVal = minY + (maxY - minY) * (i / 5);
        let y = top + h - (h * (i / 5));
        ctx.fillText(yVal.toFixed(2), left - 8, y + 3);
        ctx.beginPath();
        ctx.moveTo(left - 3, y);
        ctx.lineTo(left, y);
        ctx.stroke();
    }
    // X axis ticks
    for (let i = 0; i <= 5; ++i) {
        let xVal = minX + (maxX - minX) * (i / 5);
        let x = left + w * (i / 5);
        ctx.fillText(xVal.toFixed(2), x, canvas.height - bottom + 16);
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - bottom);
        ctx.lineTo(x, canvas.height - bottom + 3);
        ctx.stroke();
    }

    chart.y.forEach((yMetric, yIdx) => {
        if (!chart.visible[yIdx]) return;
        ctx.fillStyle = getMetricColor(yMetric);
        for (let i = 0; i < data.x.length; i++) {
            let x = left + ((data.x[i] - minX) / (maxX - minX)) * w;
            let y = top + h - ((data.y[yIdx][i] - minY) / (maxY - minY)) * h;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        }
    });
}

/**
 * Gets chart data for the current chart, respecting selection zoom.
 * @param {Object} chart
 * @returns {{x: any[], y: any[][]}}
 */
function getMultiYAxisChartData(chart) {
    let data = { x: [], y: chart.y.map(() => []) };
    analysisData.forEach(row => {
        data.x.push(row[chart.x]);
        chart.y.forEach((y, j) => data.y[j].push(row[y]));
    });
    let [start, end] = getZoomedIndices(data.x.length);
    // If selection zoom is active, override start/end
    if (selectionZoom && selectionZoom.start != null && selectionZoom.end != null) {
        start = selectionZoom.start;
        end = selectionZoom.end;
    }
    data.x = data.x.slice(start, end);
    data.y = data.y.map(arr => arr.slice(start, end));
    return data;
}

/**
 * Gets the data range indices for the current zoom mode.
 * @param {number} dataLen
 * @returns {[number, number]}
 */
function getZoomedIndices(dataLen) {
    if (zoomMode === 'fit' || !isPlaying) {
        return [0, dataLen];
    }
    // 'window' mode: show a window around playbackIndex
    const half = Math.floor(zoomWindowSize / 2);
    let start = Math.max(0, playbackIndex - half);
    let end = Math.min(dataLen, playbackIndex + half + 1);
    if (start === end) end = Math.min(dataLen, start + 1);
    return [start, end];
}

/**
 * Gets chart data and drawing bounds for rendering and tooltips.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} chart
 * @returns {Object}
 */
function getChartDataForDraw(canvas, chart) {
    const left = 40, right = 10, top = 20, bottom = 30;
    const w = canvas.width - left - right;
    const h = canvas.height - top - bottom;
    let data = getMultiYAxisChartData(chart);
    let minX = Math.min(...data.x), maxX = Math.max(...data.x);
    let minY = Math.min(...data.y.flat()), maxY = Math.max(...data.y.flat());
    if (minX === maxX) maxX += 1;
    if (minY === maxY) maxY += 1;
    return { xVals: data.x, yVals: data.y, left, w, h, minX, maxX, minY, maxY };
}

/**
 * Exports chart data as CSV and JSON for all or selected charts. TASK 2850: Refer to story regarding current JSON only export, works better with large data but CSV would also be helpful too.
 * @param {Object[]} [selectedCharts]
 */
function exportChartData(selectedCharts) {
    // If not specified, export all
    if (!selectedCharts) selectedCharts = charts;
    // Gather all unique metrics
    let allMetrics = new Set();
    selectedCharts.forEach(chart => {
        allMetrics.add(chart.x);
        chart.y.forEach(y => allMetrics.add(y));
    });
    allMetrics = Array.from(allMetrics);

    // Build CSV
    let csv = allMetrics.join(',') + '\n';
    for (let i = 0; i < analysisData.length; ++i) {
        csv += allMetrics.map(m => analysisData[i][m] ?? '').join(',') + '\n';
    }

    // Build JSON
    let json = analysisData.map(row => {
        const obj = {};
        allMetrics.forEach(m => obj[m] = row[m]);
        return obj;
    });

    // Download dialog
    const blobCsv = new Blob([csv], { type: 'text/csv' });
    const blobJson = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const aCsv = document.createElement('a');
    aCsv.href = URL.createObjectURL(blobCsv);
    aCsv.download = 'epilens-charts-export.csv';
    aCsv.style.display = 'none';
    document.body.appendChild(aCsv);
    aCsv.click();
    setTimeout(() => {
        URL.revokeObjectURL(aCsv.href);
        aCsv.remove();
    }, 100);

    const aJson = document.createElement('a');
    aJson.href = URL.createObjectURL(blobJson);
    aJson.download = 'epilens-charts-export.json';
    aJson.style.display = 'none';
    document.body.appendChild(aJson);
    aJson.click();
    setTimeout(() => {
        URL.revokeObjectURL(aJson.href);
        aJson.remove();
    }, 100);
}

/**
 * Formats a value for display in a data table cell.
 * @param {*} val
 * @param {string} key
 * @returns {string}
 */
function formatCell(val, key) {
    if (val == null) return '';
    if (typeof val === 'object') {
        // Show the key in the tooltip for context
        return `<pre title="Field: ${key}" style="white-space:pre-wrap;font-size:11px;">${JSON.stringify(val, null, 1)}</pre>`;
    }
    // Also show the key as a tooltip for all cells TASK 2849: This is buggy at the moment refer to notes regarding the Story.
    return `<span title="Field: ${key}">${val}</span>`;
}

/**
 * Sets up playback controls for chart playback and animation.
 */
function setupPlaybackControls() {
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const seekBar = document.getElementById('seekBar');
    const playbackTime = document.getElementById('playbackTime');

    // Restart, step, and speed controls
    let restartBtn = document.getElementById('restartBtn');
    if (!restartBtn) {
        restartBtn = document.createElement('button');
        restartBtn.id = 'restartBtn';
        restartBtn.textContent = '⏮';
        restartBtn.style.marginRight = '4px';
        playBtn.parentNode.insertBefore(restartBtn, playBtn);
    }
    let stepBtn = document.getElementById('stepBtn');
    if (!stepBtn) {
        stepBtn = document.createElement('button');
        stepBtn.id = 'stepBtn';
        stepBtn.textContent = '⏭';
        stepBtn.style.marginLeft = '4px';
        pauseBtn.parentNode.insertBefore(stepBtn, pauseBtn.nextSibling);
    }
    let speedSelect = document.getElementById('playbackSpeed');
    if (!speedSelect) {
        speedSelect = document.createElement('select');
        speedSelect.id = 'playbackSpeed';
        [0.25, 0.5, 1, 2, 4].forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = `${s}x`;
            if (s === 1) opt.selected = true;
            speedSelect.appendChild(opt);
        });
        pauseBtn.parentNode.appendChild(speedSelect);
    }

    let playbackSpeed = 1;

    playBtn.onclick = () => {
        if (!isPlaying) {
            isPlaying = true;
            playback();
        }
    };
    pauseBtn.onclick = () => {
        isPlaying = false;
        if (playbackTimer) clearTimeout(playbackTimer);
    };
    seekBar.oninput = () => {
        playbackIndex = Number(seekBar.value);
        renderAllCharts();
        updatePlaybackTime();
    };
    restartBtn.onclick = () => {
        playbackIndex = 0;
        renderAllCharts();
        updatePlaybackTime();
        if (!isPlaying) {
            isPlaying = true;
            playback();
        }
    };
    stepBtn.onclick = () => {
        playbackIndex = Math.min(playbackIndex + 1, analysisData.length - 1);
        renderAllCharts();
        updatePlaybackTime();
    };
    speedSelect.onchange = () => {
        playbackSpeed = Number(speedSelect.value);
    };

    function playback() {
        if (!isPlaying || !analysisData.length) return;
        if (playbackIndex >= analysisData.length - 1) {
            isPlaying = false;
            return;
        }
        playbackIndex++;
        renderAllCharts();
        updatePlaybackTime();
        seekBar.value = playbackIndex;
        playbackTimer = setTimeout(playback, 30 / playbackSpeed);
    }

    function updatePlaybackTime() {
        playbackTime.textContent = `${playbackIndex + 1} / ${analysisData.length}`;
        seekBar.max = analysisData.length ? analysisData.length - 1 : 0;
        seekBar.value = playbackIndex;
    }

    seekBar.max = analysisData.length ? analysisData.length - 1 : 0;
    seekBar.value = playbackIndex;
    updatePlaybackTime();
}