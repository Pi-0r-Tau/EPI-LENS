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

    canvas.onmousemove = function(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const data = getChartDataForDraw(canvas, chart);
        const { xVals, yVals, left, w, h, minX, maxX, minY, maxY } = data;

        // Find closest data point
        let closestIdx = -1, closestMetric = null, minDist = Infinity;
        for (let i = 0; i < xVals.length; ++i) {
            let px = left + ((xVals[i] - minX) / (maxX - minX)) * w;
            for (let j = 0; j < yVals.length; ++j) {
                let py = 20 + h - ((yVals[j][i] - minY) / (maxY - minY)) * h;
                let dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    closestIdx = i;
                    closestMetric = j;
                }
            }
        }
        if (minDist < 12 && closestIdx !== -1 && closestMetric !== null) {
            tooltip.style.display = 'block';
            tooltip.style.left = (x + 10) + 'px';
            tooltip.style.top = (y - 10) + 'px';
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
