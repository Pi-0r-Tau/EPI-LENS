window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.luminance = function (
    data,
    idx,
    weights = [0.2126, 0.7152, 0.0722]
) {
    if (!Array.isArray(data) && !(data instanceof Uint8ClampedArray)) return 0;
    const len = data.length;
    if (typeof idx !== "number" || idx < 0 || idx > len - 3) return 0;

    const r =
        typeof data[idx] === "number" && isFinite(data[idx]) ? data[idx] : 0;
    const g =
        typeof data[idx + 1] === "number" && isFinite(data[idx + 1])
            ? data[idx + 1]
            : 0;
    const b =
        typeof data[idx + 2] === "number" && isFinite(data[idx + 2])
            ? data[idx + 2]
            : 0;

    // BT.709 weights for perceptual luminance
    return r * weights[0] + g * weights[1] + b * weights[2];
};
