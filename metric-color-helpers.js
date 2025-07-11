const DEFAULT_METRIC_COLORS = [
    "#2196f3", "#f44336", "#ff9800", "#4caf50", "#9c27b0", "#00bcd4", "#e91e63", "#8bc34a",
    "#ffc107", "#3f51b5", "#607d8b", "#ff5722", "#cddc39", "#795548", "#673ab7", "#009688"
];

function getStoredMetricColors() {
    try {
        const stored = localStorage.getItem('epilensMetricColors');
        if (stored) return JSON.parse(stored);
    } catch {}
    return {};
}

function saveMetricColors(colors) {
    localStorage.setItem('epilensMetricColors', JSON.stringify(colors));
}

function getMetricColor(metric) {
    const custom = getStoredMetricColors();
    if (custom[metric]) return custom[metric];

    let idx = Math.abs(hashString(metric)) % DEFAULT_METRIC_COLORS.length;
    return DEFAULT_METRIC_COLORS[idx];
}

function setMetricColor(metric, color) {
    const custom = getStoredMetricColors();
    custom[metric] = color;
    saveMetricColors(custom);
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
    return hash;
}


function metricKeyToLabel(key) {
    const parts = key.split('.');
    if (parts.length === 1) {
        return capitalize(parts[0]);
    }
    // dominantColor.b => "Dominant Color b"
    // edgeDetection.edgeCount => "Edge Count"
    // spatialMap.quadrant1 => "Spatial Map quadrant1"
    let label = '';
    if (parts.length === 2) {
        label = splitCamelCase(parts[0]) + ' ' + parts[1];
    } else {
        label = parts.slice(0, -1).map(splitCamelCase).join(' ') + ' ' + parts[parts.length - 1];
    }

    const ignorePrefixes = [
        'edgeDetection', 'colorVariance', 'psi', 'frameDifference', 'spectralAnalysis',
        'temporalCoherence', 'spatialMap', 'chromaticFlashes', 'temporalContrast', 'dominantColor', 'dominantLab'
    ];
    if (parts.length === 2 && ignorePrefixes.includes(parts[0])) {
        return splitCamelCase(parts[1]);
    }
    return capitalizeWords(label.trim());
}

function splitCamelCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, m => m.toUpperCase());
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function capitalizeWords(str) {
    return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1));
}

function showMetricColorCustomizer(metrics, onChange) {
    let modal = document.getElementById('metricColorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'metricColorModal';
        modal.style.position = 'fixed';
        modal.style.top = 0;
        modal.style.left = 0;
        modal.style.right = 0;
        modal.style.bottom = 0;
        modal.style.background = 'rgba(0,0,0,0.7)';
        modal.style.zIndex = 2000;
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.innerHTML = `
            <div style="background:#232323;padding:24px 32px;border-radius:8px;min-width:320px;max-width:90vw;">
                <h3 style="margin-top:0;">Customize Metric Colors</h3>
                <input id="metricColorSearch" type="text" placeholder="Search metrics..." style="width:98%;margin-bottom:10px;padding:4px 8px;border-radius:3px;border:1px solid #444;background:#181818;color:#fff;">
                <div id="metricColorList" style="max-height:350px;overflow-y:auto;margin-bottom:18px;"></div>
                <div style="text-align:right;">
                    <button id="closeMetricColorModalBtn" style="background:#2196f3;color:#fff;border:none;border-radius:3px;padding:6px 14px;cursor:pointer;">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    const colorList = modal.querySelector('#metricColorList');
    const searchInput = modal.querySelector('#metricColorSearch');
    const custom = getStoredMetricColors();

    function renderMetricList(filter = "") {
        colorList.innerHTML = '';
        metrics
            .filter(metric => metricKeyToLabel(metric).toLowerCase().includes(filter.toLowerCase()))
            .forEach(metric => {
                const color = getMetricColor(metric);
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.marginBottom = '10px';
                const label = metricKeyToLabel(metric);
                row.innerHTML = `
                    <span style="min-width:140px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;">${label}</span>
                    <input type="color" value="${color}" style="margin-left:12px;width:32px;height:32px;border:none;background:none;">
                    <button style="margin-left:10px;background:#444;color:#fff;border:none;border-radius:2px;padding:3px 8px;cursor:pointer;">Reset</button>
                `;
                const colorInput = row.querySelector('input[type=color]');
                colorInput.oninput = () => {
                    setMetricColor(metric, colorInput.value);
                    if (onChange) onChange();
                };
                const resetBtn = row.querySelector('button');
                resetBtn.onclick = () => {
                    delete custom[metric];
                    saveMetricColors(custom);
                    colorInput.value = getMetricColor(metric);
                    if (onChange) onChange();
                };
                colorList.appendChild(row);
            });
    }

    renderMetricList();

    searchInput.oninput = () => {
        renderMetricList(searchInput.value);
    };

    modal.style.display = 'flex';
    modal.querySelector('#closeMetricColorModalBtn').onclick = () => {
        modal.style.display = 'none';
    };
}

window.MetricColorHelpers = {
    getMetricColor,
    setMetricColor,
    showMetricColorCustomizer,
    getStoredMetricColors,
    metricKeyToLabel 
};
