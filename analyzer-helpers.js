(function () {
    const {
        sqrt, pow, log, exp, hypot, clz32, floor,
        log2, PI, cos, sin, ceil, min, max, abs
     } = Math;

    const EPSILON = 1e-10;

    const RGB_TO_XYZ = new Float64Array([
        0.4124, 0.3576, 0.1805, // X Cofficients
        0.2126, 0.7152, 0.0722, // Y Cofficients
        0.0193, 0.1192, 0.9505, // Z Cofficients
    ]);

    function rgbToLab(r, g, b) {
    if (
        r < 0 || r > 255 ||
        g < 0 || g > 255 ||
        b < 0 || b > 255
    ) throw new Error('RGB values out of range [0,255]');

    // Precompute constants
    const ONE_OVER_255 = 1 / 255;
    const REF_X = 0.95047, REF_Y = 1.0, REF_Z = 1.08883;
    const EPS = EPSILON || 1e-10; //

    // Normalize and gamma correct in-place
    const srgb = [r * ONE_OVER_255, g * ONE_OVER_255, b * ONE_OVER_255];
    for (let i = 0; i < 3; ++i) {
        srgb[i] = srgb[i] > 0.04045
            ? pow((srgb[i] + 0.055) / 1.055, 2.4)
            : srgb[i] / 12.92;
    }
    // Unroll RGB_TO_XYZ for cache locality and fewer lookups
    const m = RGB_TO_XYZ; // [xr, xg, xb, yr, yg, yb, zr, zg, zb]
    const X = (srgb[0]*m[0] + srgb[1]*m[1] + srgb[2]*m[2]) / (REF_X + EPS);
    const Y = (srgb[0]*m[3] + srgb[1]*m[4] + srgb[2]*m[5]) / (REF_Y + EPS);
    const Z = (srgb[0]*m[6] + srgb[1]*m[7] + srgb[2]*m[8]) / (REF_Z + EPS);

    // Branch for Lab conversion
    function f(t) {
        return t > 0.008856 ? pow(t, 1/3) : (7.787 * t) + 0.137931034; // 16/116 = 0.137931034
    }
    const fx = f(X), fy = f(Y), fz = f(Z);

    // Return Lab values
    return {
        L: (116 * fy) - 16,
        a: 500 * (fx - fy),
        b: 200 * (fy - fz)
    };
}

    function cie76(lab1, lab2) {
        const dL = lab1.L - lab2.L;
        const da = lab1.a - lab2.a;
        const db = lab1.b - lab2.b;
        return sqrt(dL * dL + da * da + db * db);
    }

    function padToPowerOfTwo(signal) {
    if (!signal || signal.length === 0)
        return { re: new Float64Array(0), im: new Float64Array(0) };

    if (signal.length === 1)
        return { re: new Float64Array([signal[0]]), im: new Float64Array([0]) };

    const n = signal.length;
    const nextPowerOfTwo = 1 << (32 - clz32(n - 1));

    const paddedSignal = new Float64Array(nextPowerOfTwo);
    paddedSignal.set(signal, 0);

    return performFFT(paddedSignal);
}

    function performFFT(signal) {
    const signalLength = signal.length;
    if (signalLength <= 1 || (signalLength & (signalLength - 1)) !== 0 || signalLength > 1048576) {
        return padToPowerOfTwo(signal);
    }

    const log2Size = log2(signalLength);
    const buffer = new ArrayBuffer(signalLength * 16);
    const re = new Float64Array(buffer, 0, signalLength);
    const im = new Float64Array(buffer, signalLength * 8, signalLength);
    for (let i = 0; i < signalLength; i++) re[i] = signal[i];
    const cosTable = new Float64Array(signalLength / 2);
    const sinTable = new Float64Array(signalLength / 2);
    for (let i = 0; i < signalLength / 2; i++) {
        const angle = (-2 * PI * i) / signalLength;
        cosTable[i] = cos(angle);
        sinTable[i] = sin(angle);
    }

    function bitReverse(index, log2Size) {
        let rev = 0;
        for (let j = 0; j < log2Size; j++) {
            rev |= ((index >> j) & 1) << (log2Size - 1 - j);
        }
        return rev;
    }

    if (signalLength > 512) {
        const bitRevTable = new Uint32Array(signalLength);
        for (let i = 0; i < signalLength; i++) {
            bitRevTable[i] = bitReverse(i, log2Size);
            const rev = bitRevTable[i];
            if (i < rev) {
                [re[i], re[rev]] = [re[rev], re[i]];
                [im[i], im[rev]] = [im[rev], im[i]];
            }
        }
    } else {
        for (let i = 0; i < signalLength; i++) {
            const rev = bitReverse(i, log2Size);
            if (i < rev) {
                [re[i], re[rev]] = [re[rev], re[i]];
                [im[i], im[rev]] = [im[rev], im[i]];
            }
        }
    }

    for (let len = 2; len <= signalLength; len *= 2) {
        const halfLen = len / 2;
        for (let i = 0; i < signalLength; i += len) {
            for (let j = 0; j < halfLen; j++) {
                const idx1 = i + j;
                const idx2 = idx1 + halfLen;
                const twidIdx = ((j * signalLength) / len) & (signalLength - 1); // Radix-2 indexing
                const reTemp = re[idx2] * cosTable[twidIdx] - im[idx2] * sinTable[twidIdx];
                const imTemp = re[idx2] * sinTable[twidIdx] + im[idx2] * cosTable[twidIdx];
                re[idx2] = re[idx1] - reTemp;
                im[idx2] = im[idx1] - imTemp;
                re[idx1] += reTemp;
                im[idx1] += imTemp;
            }
        }
    }

    return { re, im };
}

function sobelEdgeMap(gray, width, height) {
    if (!gray || gray.length !== width * height)
        throw new Error('Input buffer size does not match width*height');

    const edge = new Float32Array(width * height);
    // Sobel kernels:
    //   Gx: [-1 0 1; -2 0 2; -1 0 1]
    //   Gy: [-1 -2 -1; 0 0 0; 1 2 1]
    for (let y = 1; y < height - 1; ++y) {
        const rowOffset = y * width;
        const prevRowOffset = rowOffset - width;
        const nextRowOffset = rowOffset + width;
        for (let x = 1; x < width - 1; ++x) {
            const center = rowOffset + x;
            const tl = gray[prevRowOffset + x - 1];
            const tc = gray[prevRowOffset + x];
            const tr = gray[prevRowOffset + x + 1];
            const ml = gray[rowOffset + x - 1];
            const mr = gray[rowOffset + x + 1];
            const bl = gray[nextRowOffset + x - 1];
            const bc = gray[nextRowOffset + x];
            const br = gray[nextRowOffset + x + 1];
            // Sobel X/Y gradients
            const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
            const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
            edge[center] = hypot(gx, gy);
        }
    }
    // Borders remain zero
    return edge;
}

    function detectPatternedStimulus(imageData) {
    // Validate input
    if (!imageData || !imageData.data) return 0;
    const width = imageData.width, height = imageData.height;
    const data = imageData.data;
    const pixelCount = width * height;
    if (data.length !== pixelCount * 4)
        throw new Error("imageData.data length does not match width*height*4");

    // Grayscale conversion (sRGB luminance weights)
    const gray = new Float32Array(pixelCount);
    const rWeight = 0.2126, gWeight = 0.7152, bWeight = 0.0722;
    for (let i = 0, j = 0; i < data.length; i += 4, j++)
        gray[j] = data[i]*rWeight + data[i+1]*gWeight + data[i+2]*bWeight;

    const blockSize = 8;
    const blocksY = ceil(height / blockSize);
    const blocksX = ceil(width / blockSize);
    const blockCount = blocksX * blocksY;
    const blockScores = new Float32Array(blockCount);
    let totalContrast = 0, blockIdx = 0;
    for (let by = 0; by < height; by += blockSize) {
        const yEnd = min(by + blockSize, height);
        for (let bx = 0; bx < width; bx += blockSize) {
            const xEnd = min(bx + blockSize, width);
            let count = 0, mean = 0, M2 = 0;
            for (let y = by; y < yEnd; y++) {
                const rowOffset = y * width;
                for (let x = bx; x < xEnd; x++) {
                    count++;
                    const val = gray[rowOffset + x];
                    const delta = val - mean;
                    mean += delta / count;
                    const delta2 = val - mean;
                    M2 += delta * delta2;
                }
            }
            const variance = count > 1 ? M2 / count : 0;
            blockScores[blockIdx++] = sqrt(variance) / 128;
            totalContrast += blockScores[blockIdx - 1];
        }
    }
    const avgBlockContrast = blockCount ? totalContrast / blockCount : 0;

    const edge = sobelEdgeMap(gray, width, height);
    const edgeRowSum = new Float32Array(height);
    let totalEdge = 0;
    for (let y = 0; y < height; y++) {
        let sum = 0, rowOffset = y * width;
        for (let x = 0; x < width; x++) sum += edge[rowOffset + x];
        edgeRowSum[y] = sum;
        totalEdge += sum;
    }
    const meanEdge = totalEdge / height;

    // Autocorrelation for periodicity
    let maxCorr = 0;
    const maxLag = min(20, height >> 1);
    const diffFromMean = new Float32Array(height);
    for (let i = 0; i < height; i++) diffFromMean[i] = edgeRowSum[i] - meanEdge;
    for (let lag = 2; lag < maxLag; lag++) {
        let corr = 0, limit = height - lag;
        for (let i = 0; i < limit; i++)
            corr += diffFromMean[i] * diffFromMean[i + lag];
        corr /= limit;
        maxCorr = max(maxCorr, corr);
    }
    // Periodicity score
    let absSum = 0;
    for (let i = 0; i < height; i++) absSum += abs(diffFromMean[i]);
    const periodicityScore = absSum > 1e-6 ?
        min(maxCorr / (absSum / height + 1e-6), 1) : 0;

    // Composite score for PSE risk factor
    const score = max(0, min(0.5 * avgBlockContrast + 0.5 * periodicityScore, 1));
    return score;
}

function calculateDominantColor(imageData) {
    if (!imageData || !imageData.data || imageData.data.length === 0)
        return { r: 0, g: 0, b: 0 };

    const data = imageData.data;
    const n = data.length >>> 2; // Number of pixels (RGBA per pixel)
    if (n === 0) return { r: 0, g: 0, b: 0 };

    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) {
        r += data[i];     // Red
        g += data[i + 1]; // Green
        b += data[i + 2]; // Blue
    }
    const invN = 1 / n; // Precompute inverse for performance
    return {
        r: r * invN,
        g: g * invN,
        b: b * invN
    };
}


function computeSpectralFlatness(spectrum) {
    if (!spectrum || spectrum.length === 0) return 0;

    // Convert to amplitude array if needed
    let amplitudes;
    if (Array.isArray(spectrum) && typeof spectrum[0] === "object") {
        amplitudes = new Float64Array(spectrum.length);
        for (let i = 0; i < spectrum.length; ++i)
            amplitudes[i] = spectrum[i].amplitude;
    } else {
        amplitudes = spectrum;
    }

    // Compute geometric and arithmetic means of positive amplitudes
    let nonZeroCount = 0, logSum = 0, arithSum = 0;
    for (let i = 0; i < amplitudes.length; ++i) {
        const a = amplitudes[i];
        if (a > 0) {
            logSum += log(a);
            arithSum += a;
            ++nonZeroCount;
        }
    }
    if (!nonZeroCount) return 0; // All non-positive amplitudes

    const geoMean = exp(logSum / nonZeroCount);
    const arithMean = arithSum / nonZeroCount;

    return arithMean === 0 ? 0 : geoMean / arithMean;
}


function frameHistogramDiff(data1, data2) {
    if (!data1 || !data2 || data1.length !== data2.length)
        return 0;

    const bins = 32;
    const hist1 = new Uint8Array(bins), hist2 = new Uint8Array(bins);
    const rWeight = 0.2126, gWeight = 0.7152, bWeight = 0.0722;
    const binSize = 256 / bins;

    for (let i = 0; i < data1.length; i += 4) {
        const v1 = floor(
            data1[i] * rWeight +
            data1[i + 1] * gWeight +
            data1[i + 2] * bWeight
        );
        const v2 = floor(
            data2[i] * rWeight +
            data2[i + 1] * gWeight +
            data2[i + 2] * bWeight
        );
        hist1[Math.min(bins - 1, floor(v1 / binSize))]++;
        hist2[Math.min(bins - 1, floor(v2 / binSize))]++;
    }

    let diff = 0, total = 0;
    for (let i = 0; i < bins; ++i) {
        diff += Math.abs(hist1[i] - hist2[i]);
        total += hist1[i] + hist2[i];
    }
    return total ? diff / total : 0;
}

function extractDominantColors(data, n = 5) {
    if (!data || data.length === 0 || data.length % 4 !== 0) return [];
    // Quantize each channel to 3 bits
    // Map key: 0xRRGGBB integer, value: count
    const colorMap = new Map();
    for (let i = 0; i < data.length; i += 4) {
        const r = (data[i] >> 5) << 5;       // 0-255 reduced to 0,32,64,...224
        const g = (data[i + 1] >> 5) << 5;
        const b = (data[i + 2] >> 5) << 5;

        const key = (r << 16) | (g << 8) | b;
        colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }
    // Sort color bins by frequency, return top N
    return Array.from(colorMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key, count]) => ({
            r: (key >> 16) & 0xff,
            g: (key >> 8) & 0xff,
            b: key & 0xff,
            count
        }));
}

    let lastFrameBuffer = null;


function calculateFrameDifference(currentFrame) {
    if (!currentFrame || !currentFrame.data || currentFrame.data.length % 4 !== 0) {
        return { difference: 0, motion: 0 };
    }

    if (!lastFrameBuffer || lastFrameBuffer.length !== currentFrame.data.length) {
        lastFrameBuffer = new Uint8ClampedArray(currentFrame.data.length);
    }

    if (!this.lastFrame || this.lastFrame.data.length !== currentFrame.data.length) {
        this.lastFrame = {
            data: lastFrameBuffer,
            width: currentFrame.width,
            height: currentFrame.height,
        };
    }

    const data1 = currentFrame.data;
    const data2 = this.lastFrame.data;
    const len = data1.length;
    const pixelCount = len >>> 2;
    const threshold = ((this.advancedMetrics?.frameDifference?.threshold ?? 0.1) * 765);

    let totalDiff = 0;
    let motionPixels = 0;
    const blockSize = 256; // 64 pixels * 4 bytes per pixel

    for (let blockOffset = 0; blockOffset <= len - blockSize; blockOffset += blockSize) {
        let localDiff = 0, localMotion = 0;
        for (let pixelOffset = 0; pixelOffset < blockSize; pixelOffset += 16) {
            for (let k = 0; k < 16; k += 4) {
                const idx = blockOffset + pixelOffset + k;
                const rDiff = Math.abs(data1[idx] - data2[idx]);
                const gDiff = Math.abs(data1[idx + 1] - data2[idx + 1]);
                const bDiff = Math.abs(data1[idx + 2] - data2[idx + 2]);
                const diff = rDiff + gDiff + bDiff;
                localDiff += diff;
                localMotion += diff > threshold ? 1 : 0;
            }
        }
        totalDiff += localDiff;
        motionPixels += localMotion;
    }

    for (let blockOffset = (len - len % blockSize); blockOffset < len; blockOffset += 4) {
        const rDiff = Math.abs(data1[blockOffset] - data2[blockOffset]);
        const gDiff = Math.abs(data1[blockOffset + 1] - data2[blockOffset + 1]);
        const bDiff = Math.abs(data1[blockOffset + 2] - data2[blockOffset + 2]);
        const diff = rDiff + gDiff + bDiff;
        totalDiff += diff;
        motionPixels += diff > threshold ? 1 : 0;
    }

    const normalizedDiff = totalDiff / (pixelCount * 765);
    const motionRatio = motionPixels / pixelCount;

    // Update last frame buffer for next call
    this.lastFrame.data.set(currentFrame.data);

    return {
        difference: normalizedDiff,
        motion: motionRatio
    };
}

    window.AnalyzerHelpers = {
        rgbToLab,
        cie76,
        padToPowerOfTwo,
        performFFT,
        sobelEdgeMap,
        detectPatternedStimulus,
        calculateDominantColor,
        computeSpectralFlatness,
        frameHistogramDiff,
        extractDominantColors,
        calculateFrameDifference,
    };
})();