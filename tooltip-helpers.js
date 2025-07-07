/**
 * Sets up tooltip and mouse interaction for a chart canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} card
 * @param {Object} chart
 * @param {Function} getChartDataForDraw
 * @param {Function} getMetricColor
 */
function setupChartTooltipAndInteraction(canvas, card, chart, getChartDataForDraw, getMetricColor) {
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
}

window.TooltipHelpers = {
    setupChartTooltipAndInteraction
};
