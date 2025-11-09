function ensureHiDPI(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || canvas.width;
    const cssHeight = canvas.clientHeight || canvas.height;
    const targetW = Math.round(cssWidth * dpr);
    const targetH = Math.round(cssHeight * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH || canvas._dpr !== dpr) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = cssWidth + 'px';
        canvas.style.height = cssHeight + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        canvas._dpr = dpr;
    }
}

function drawGrid(ctx, left, top, w, h, xSteps = 5, ySteps = 5) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    // horizontal lines
    for (let i = 0; i <= ySteps; ++i) {
        const y = top + h - (h * (i / ySteps));
        ctx.beginPath();
        ctx.moveTo(left, y + 0.5);
        ctx.lineTo(left + w, y + 0.5);
        ctx.stroke();
    }

    // vertical ls
    for (let i = 0; i <= xSteps; ++i) {
        const x = left + w * (i / xSteps);
        ctx.beginPath();
        ctx.moveTo(x + 0.5, top);
        ctx.lineTo(x + 0.5, top + h);
        ctx.stroke();
    }

    ctx.restore();
}

function drawIsFlashScatter(canvas, chart, getMultiYAxisChartData) {
    const ctx = canvas.getContext('2d');
    ensureHiDPI(canvas);
    const DPR = window.devicePixelRatio || 1;
    const width = canvas.width / DPR;
    const height = canvas.height / DPR;
    ctx.clearRect(0, 0, width, height);

    const left = 40, right = 10, top = 20, bottom = 30;
    const w = width - left - right;
    const h = height - top - bottom;
    let data = getMultiYAxisChartData(chart);

    let minX = Math.min(...data.x), maxX = Math.max(...data.x);
    let minY = 0, maxY = 1;
    // Graph Grid
    drawGrid(ctx, left, top, w, h, 5, 2);

    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, height - bottom);
    ctx.lineTo(width - right, height - bottom);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = "#bbb";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(chart.x, left + w / 2, height - 6);
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
        // TASK 23 Scatter:Ensure that x axis label appears for different sized screens
        ctx.fillText(xVal.toFixed(2), x, height - bottom + 16); 
        ctx.beginPath();
        ctx.moveTo(x, height - bottom);
        ctx.lineTo(x, height - bottom + 3);
        ctx.stroke();
    }

    // Scatter points
    ctx.fillStyle = "#ff9800";
    for (let i = 0; i < data.x.length; i++) {
        let x = left + ((data.x[i] - minX) / (maxX - minX)) * w;
        let y = top + h - ((data.y[0][i] - minY) / (maxY - minY)) * h;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
    }
}

function drawMultiYAxisChart(canvas, chart, getChartDataForDraw, getMetricColor) {
    const ctx = canvas.getContext('2d');
    ensureHiDPI(canvas);
    const DPR = window.devicePixelRatio || 1;
    const width = canvas.width / DPR;
    const height = canvas.height / DPR;
    ctx.clearRect(0, 0, width, height);
    const bottom = 30; //Prev was not defined in X ticks

    const { xVals, yVals, left, w, h, minX, maxX, minY, maxY } = getChartDataForDraw(canvas, chart);
    // Grid Graph
    drawGrid(ctx, left, 20, w, h, 5, 5);

    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, 20);
    ctx.lineTo(left, height - 30);
    ctx.lineTo(width - 10, height - 30);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#bbb";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(chart.x, left + w / 2, height - 6);
    ctx.save();
    ctx.translate(14, 20 + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(chart.y.join(', '), 0, 0);
    ctx.restore();

    // Y ticks
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
    // X ticks
    for (let i = 0; i <= 5; ++i) {
        let xVal = minX + (maxX - minX) * (i / 5);
        let x = left + w * (i / 5);
        //TASK 23: drawMultiYAxisChart
        ctx.fillText(xVal.toFixed(2), x, height - bottom + 16);
        ctx.beginPath();
        ctx.moveTo(x, height - bottom);
        ctx.lineTo(x, height - bottom + 3);
        ctx.stroke();
    }

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

function drawMultiYAxisScatter(canvas, chart, getMultiYAxisChartData, getMetricColor) {
    const ctx = canvas.getContext('2d');
    ensureHiDPI(canvas);
    const DPR = window.devicePixelRatio || 1;
    const width = canvas.width / DPR;
    const height = canvas.height / DPR;
    ctx.clearRect(0, 0, width, height);

    const left = 40, right = 10, top = 20, bottom = 30;
    const w = width - left - right;
    const h = height - top - bottom;
    let data = getMultiYAxisChartData(chart);

    let minX = Math.min(...data.x), maxX = Math.max(...data.x);
    let minY = Math.min(...data.y.flat()), maxY = Math.max(...data.y.flat());
    if (minX === maxX) maxX += 1;
    if (minY === maxY) maxY += 1;
    drawGrid(ctx, left, top, w, h, 5, 5);

    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, height - bottom);
    ctx.lineTo(width - right, height - bottom);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#bbb";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(chart.x, left + w / 2, height - 6);
    ctx.save();
    ctx.translate(14, top + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(chart.y.join(', '), 0, 0);
    ctx.restore();

    // Y ticks
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
    // X ticks
    for (let i = 0; i <= 5; ++i) {
        let xVal = minX + (maxX - minX) * (i / 5);
        let x = left + w * (i / 5);
        // TASK 23 drawMultiYAxisScatter
        ctx.fillText(xVal.toFixed(2), x, height - bottom + 16);
        ctx.beginPath();
        ctx.moveTo(x, height - bottom);
        ctx.lineTo(x, height - bottom + 3);
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

function drawMultiYAxisBar(canvas, chart, getMultiYAxisChartData, getMetricColor) {
    const ctx = canvas.getContext('2d');
    ensureHiDPI(canvas);
    const DPR = window.devicePixelRatio || 1;
    const width = canvas.width / DPR;
    const height = canvas.height / DPR;
    ctx.clearRect(0, 0, width, height);

    const left = 40, right = 10, top = 20, bottom = 30;
    const w = width - left - right;
    const h = height - top - bottom;
    let data = getMultiYAxisChartData(chart);

    let minY = Math.min(...data.y.flat()), maxY = Math.max(...data.y.flat());
    if (minY === maxY) maxY += 1;
    const xSteps = Math.max(1, Math.min(5, data.x.length - 1 || 1));
    drawGrid(ctx, left, top, w, h, xSteps, 5);

    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, height - bottom);
    ctx.lineTo(width - right, height - bottom);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#bbb";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    let metricLabel = window.MetricColorHelpers && window.MetricColorHelpers.metricKeyToLabel
        ? window.MetricColorHelpers.metricKeyToLabel
        : (x => x);
    ctx.fillText(metricLabel(chart.x), left + w / 2, height - 6);
    ctx.save();
    ctx.translate(14, top + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(chart.y.map(metricLabel).join(', '), 0, 0);
    ctx.restore();

    // Y ticks
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
    // X ticks
    for (let i = 0; i < data.x.length; ++i) {
        let x = left + (i / (data.x.length - 1)) * w;
        // TASK 23: drawMultiYAxisBar
        ctx.fillText(String(data.x[i]), x, height - bottom + 16); 
    }

    const groupWidth = w / data.x.length;
    const barWidth = groupWidth / chart.y.length * 0.8;
    for (let i = 0; i < data.x.length; i++) {
        for (let j = 0; j < chart.y.length; j++) {
            const val = data.y[j][i];
            const color = getMetricColor(chart.y[j]);
            const x = left + i * groupWidth + j * barWidth;
            const y = top + h - ((val - minY) / (maxY - minY)) * h;
            ctx.save();
            if (!chart.visible[j]) {
                ctx.globalAlpha = 0.25;
            }
            ctx.fillStyle = color;
            ctx.fillRect(x, y, barWidth, top + h - y);
            ctx.restore();
        }
    }
}

function drawMultiYAxisMixed(canvas, chart, getMultiYAxisChartData, getMetricColor, metricChartTypes) {
    const ctx = canvas.getContext('2d');
    ensureHiDPI(canvas);
    const DPR = window.devicePixelRatio || 1;
    const width = canvas.width / DPR;
    const height = canvas.height / DPR;
    ctx.clearRect(0, 0, width, height);

    const left = 40, right = 10, top = 20, bottom = 30;
    const w = width - left - right;
    const h = height - top - bottom;
    let data = getMultiYAxisChartData(chart);

    let minX = Math.min(...data.x), maxX = Math.max(...data.x);
    let minY = Math.min(...data.y.flat()), maxY = Math.max(...data.y.flat());
    if (minX === maxX) maxX += 1;
    if (minY === maxY) maxY += 1;
    drawGrid(ctx, left, top, w, h, 5, 5);

    // Axes
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, height - bottom);
    ctx.lineTo(width - right, height - bottom);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#bbb";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    let metricLabel = window.MetricColorHelpers && window.MetricColorHelpers.metricKeyToLabel
        ? window.MetricColorHelpers.metricKeyToLabel
        : (x => x);
    ctx.fillText(metricLabel(chart.x), left + w / 2, height - 6);
    ctx.save();
    ctx.translate(14, top + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(chart.y.map(metricLabel).join(', '), 0, 0);
    ctx.restore();

    // Y ticks
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
    // X ticks
    for (let i = 0; i <= 5; ++i) {
        let xVal = minX + (maxX - minX) * (i / 5);
        let x = left + w * (i / 5);
        // TASK 23: drawMultiYAxisMixed
        ctx.fillText(xVal.toFixed(2), x, height - bottom + 16);
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - bottom);
        ctx.lineTo(x, canvas.height - bottom + 3);
        ctx.stroke();
    }

    // Draw each metric with selected type
    chart.y.forEach((yMetric, yIdx) => {
        if (!chart.visible[yIdx]) return;
        const type = metricChartTypes && metricChartTypes[yMetric] ? metricChartTypes[yMetric] : 'line';
        const color = getMetricColor(yMetric);

        if (type === 'line') {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            for (let i = 0; i < data.x.length; i++) {
                let x = left + ((data.x[i] - minX) / (maxX - minX)) * w;
                let y = top + h - ((data.y[yIdx][i] - minY) / (maxY - minY)) * h;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        } else if (type === 'scatter') {
            ctx.fillStyle = color;
            for (let i = 0; i < data.x.length; i++) {
                let x = left + ((data.x[i] - minX) / (maxX - minX)) * w;
                let y = top + h - ((data.y[yIdx][i] - minY) / (maxY - minY)) * h;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, 2 * Math.PI);
                ctx.fill();
            }
        } else if (type === 'bar') {
            // groupWidth is for all metrics, barWidth is for this metric
            const groupWidth = w / data.x.length;
            const barWidth = groupWidth / chart.y.length * 0.8;
            ctx.fillStyle = color;
            for (let i = 0; i < data.x.length; i++) {
                let x = left + i * groupWidth + yIdx * barWidth;
                let yVal = data.y[yIdx][i];
                let y = top + h - ((yVal - minY) / (maxY - minY)) * h;
                ctx.fillRect(x, y, barWidth, top + h - y);
            }
        }
    });
}


window.ChartHelpers = {
    drawIsFlashScatter,
    drawMultiYAxisChart,
    drawMultiYAxisScatter,
    drawMultiYAxisBar,
    drawMultiYAxisMixed,

};