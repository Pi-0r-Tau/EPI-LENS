export function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function variance(arr) {
    if (!arr.length) return 0;
    const m = mean(arr);
    return arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length;
}

export function toGrayscale(data) {
    const gray = new Float32Array(data.length / 4);
    for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    return gray;
}

export function sobelAt(gray, width, x, y) {
    let gx =
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[y * width + (x - 1)] - gray[(y + 1) * width + (x - 1)] +
        gray[(y - 1) * width + (x + 1)] + 2 * gray[y * width + (x + 1)] + gray[(y + 1) * width + (x + 1)];
    let gy =
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];
    return { gx, gy, mag: Math.sqrt(gx * gx + gy * gy) };
}

export function padToPowerOfTwoArray(arr) {
    const n = arr.length;
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(n)));
    if (n === nextPow2) return arr.slice();
    const padded = new Array(nextPow2).fill(0);
    for (let i = 0; i < n; ++i) padded[i] = arr[i];
    return padded;
}

export function bitReverseShuffle(reArr, imArr, n, logN) {
    for (let i = 0; i < n; i++) {
        let rev = 0;
        for (let j = 0; j < logN; j++) {
            rev |= ((i >> j) & 1) << (logN - 1 - j);
        }
        if (i < rev) {
            [reArr[i], reArr[rev]] = [reArr[rev], reArr[i]];
            [imArr[i], imArr[rev]] = [imArr[rev], imArr[i]];
        }
    }
}

export function normalizeArray(arr, divisor) {
    if (!divisor) return arr.slice();
    return arr.map(x => x / divisor);
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function arrayDiff(arr) {
    const out = [];
    for (let i = 1; i < arr.length; i++) out.push(arr[i] - arr[i - 1]);
    return out;
}