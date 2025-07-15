(function() {
    
   function rgbToLab(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        // Direct channel assignment for performance
        r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
        g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
        b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
        const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
        const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
        const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
        function f(t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116; }
        const fx = f(x), fy = f(y), fz = f(z);
        return {
            L: (116 * fy) - 16,
            a: 500 * (fx - fy),
            b: 200 * (fy - fz)
        };
    }


    function cie76(lab1, lab2) {
        // Direct variable assignment for squaring 
        const dL = lab1.L - lab2.L;
        const da = lab1.a - lab2.a;
        const db = lab1.b - lab2.b;
        return Math.sqrt(dL * dL + da * da + db * db);
    }


    function padToPowerOfTwo(signal) {
        const n = signal.length;
        const nextPow2 = Math.pow(2, Math.ceil(Math.log2(n)));
        const paddedSignal = new Array(nextPow2).fill(0);
        paddedSignal.splice(0, n, ...signal);
        return performFFT(paddedSignal);
    }

    function performFFT(signal) {
    const n = signal.length;
    if (n <= 1 || (n & (n - 1)) !== 0) {
        return padToPowerOfTwo(signal);
    }
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const logN = Math.log2(n);
    for (let i = 0; i < n; i++) re[i] = signal[i];
    const cosTable = new Float64Array(n / 2);
    const sinTable = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
        const angle = -2 * Math.PI * i / n;
        cosTable[i] = Math.cos(angle);
        sinTable[i] = Math.sin(angle);
    }
    if (n > 512) {
        const bitRevTable = new Uint32Array(n);
        for (let i = 0; i < n; i++) {
            let rev = 0;
            for (let j = 0; j < logN; j++) {
                rev |= ((i >> j) & 1) << (logN - 1 - j);
            }
            bitRevTable[i] = rev;
            if (i < rev) {
                const tempRe = re[i];
                re[i] = re[rev];
                re[rev] = tempRe;

                const tempIm = im[i];
                im[i] = im[rev];
                im[rev] = tempIm;
            }
        }
    } else {
        for (let i = 0; i < n; i++) {
            let rev = 0;
            for (let j = 0; j < logN; j++) {
                rev |= ((i >> j) & 1) << (logN - 1 - j);
            }
            if (i < rev) {
                const tempRe = re[i];
                re[i] = re[rev];
                re[rev] = tempRe;

                const tempIm = im[i];
                im[i] = im[rev];
                im[rev] = tempIm;
            }
        }
    }
    for (let len = 2; len <= n; len *= 2) {
        const halfLen = len / 2;
        for (let i = 0; i < n; i += len) {
            for (let j = 0; j < halfLen; j++) {
                const idx1 = i + j;
                const idx2 = idx1 + halfLen;
                const twidIdx = (j * n / len) & (n - 1);
                const reTemp = re[idx2] * cosTable[twidIdx] - im[idx2] * sinTable[twidIdx];
                const imTemp = re[idx2] * sinTable[twidIdx] + im[idx2] * cosTable[twidIdx];
                re[idx2] = re[idx1] - reTemp;
                im[idx2] = im[idx1] - imTemp;
                re[idx1] += reTemp;
                im[idx1] += imTemp;
                }
            }
        }
        return {re, im};
    }

    /**
     * Computes the Sobel edge magnitude map for a grayscale image.
     * Precomputes row offsets for each pixel, accessing neighbours using these offsets.
     * @param {Float32Array} gray
     * @param {number} width
     * @param {number} height
     * @returns {Float32Array}
     */
    function sobelEdgeMap(gray, width, height) {
        const edge = new Float32Array(width * height);
        const rowWidth = width;
        const prevRow = -rowWidth;
        const nextRow = rowWidth;

        for (let y = 1; y < height - 1; ++y) {
            const rowOffset = y * rowWidth;
            const prevRowOffset = rowOffset + prevRow;
            const nextRowOffset = rowOffset + nextRow;
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
                const gx = -tl - 2*ml - bl + tr + 2*mr + br;
                const gy = -tl - 2*tc - tr + bl + 2*bc + br;

                edge[center] = Math.hypot(gx, gy);
            }
        }
        return edge;
    }

    /**
     * Detects repetitive patterns and high-contrast visual stimuli in the frame.
     * Returns a score [0,1] indicating the likelihood of patterned stimulus.
     * @param {ImageData} imageData
     * @returns {number}  [0,1]
     */
    function detectPatternedStimulus(imageData) {
        if (!imageData || !imageData.data) return 0;
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const pixelCount = width * height;

        const gray = new Float32Array(pixelCount);
        const rWeight = 0.2126, gWeight = 0.7152, bWeight = 0.0722;
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            gray[j] = data[i] * rWeight + data[i + 1] * gWeight + data[i + 2] * bWeight;
        }

        const blockSize = 8;
        const blocksY = Math.ceil(height / blockSize);
        const blocksX = Math.ceil(width / blockSize);
        const blockCount = blocksX * blocksY;
        const blockScores = new Float32Array(blockCount);

        let totalContrast = 0;
        let blockIdx = 0;

        for (let by = 0; by < height; by += blockSize) {
            const yEnd = Math.min(by + blockSize, height);
            for (let bx = 0; bx < width; bx += blockSize) {
                const xEnd = Math.min(bx + blockSize, width);
                let count = 0;
                let mean = 0;
                let M2 = 0;
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
                blockScores[blockIdx++] = Math.sqrt(variance) / 128;
                totalContrast += blockScores[blockIdx - 1];
            }
        }
        const avgBlockContrast = blockCount > 0 ? totalContrast / blockCount : 0;
        const edge = sobelEdgeMap(gray, width, height);
        const edgeRowSum = new Float32Array(height);
        let totalEdge = 0;

        for (let y = 0; y < height; y++) {
            let sum = 0;
            const rowOffset = y * width;

            for (let x = 0; x < width; x++) {
                sum += edge[rowOffset + x];
            }

            edgeRowSum[y] = sum;
            totalEdge += sum;
        }
        const mean = totalEdge / height;
        let maxCorr = 0;
        const maxLag = Math.min(20, height >> 1);

        const diffFromMean = new Float32Array(height);
        for (let i = 0; i < height; i++) {
            diffFromMean[i] = edgeRowSum[i] - mean;
        }
        for (let lag = 2; lag < maxLag; lag++) {
            let corr = 0;
            const limit = height - lag;
            for (let i = 0; i < limit; i++) {
                corr += diffFromMean[i] * diffFromMean[i + lag];
            }
            corr /= limit;
            maxCorr = Math.max(maxCorr, corr);
        }
        let absSum = 0;
        for (let i = 0; i < height; i++) {
            absSum += Math.abs(diffFromMean[i]);
        }
        const periodicityScore = absSum > 1e-6 ?
            Math.min(maxCorr / (absSum / height + 1e-6), 1) : 0;
        const score = Math.max(0, Math.min(0.5 * avgBlockContrast + 0.5 * periodicityScore, 1));

        return score;
    }


    function calculateDominantColor(imageData) {
        const data = imageData.data;
        let r = 0, g = 0, b = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
        }
        return {
            r: r / n,
            g: g / n,
            b: b / n
        };
    }

    /**
     * Spectral flatness of an amplitude spectrum.
     * @param {Array<{amplitude:number}>|number[]} spectrum
     * @returns {number} [0,1]
     */
    function computeSpectralFlatness(spectrum) {
        let amplitudes = Array.isArray(spectrum) && typeof spectrum[0] === "object"
            ? spectrum.map(x => x.amplitude)
            : spectrum;
        amplitudes = amplitudes.filter(a => a > 0); 
        if (!amplitudes.length) return 0;
        const geoMean = Math.exp(amplitudes.reduce((sum, a) => sum + Math.log(a), 0) / amplitudes.length);
        const arithMean = amplitudes.reduce((sum, a) => sum + a, 0) / amplitudes.length;
        return arithMean === 0 ? 0 : geoMean / arithMean;
    }

    /**
     * Histogram difference between two frames for scene change detection.
     * @param {Uint8ClampedArray} data1
     * @param {Uint8ClampedArray} data2
     * @returns {number} [0,1]
     */
    function frameHistogramDiff(data1, data2) {
        if (!data1 || !data2 || data1.length !== data2.length) return 0;
        const bins = 32;
        const hist1 = new Array(bins).fill(0), hist2 = new Array(bins).fill(0);
        for (let i = 0; i < data1.length; i += 4) {
            const v1 = Math.floor((data1[i] + data1[i+1] + data1[i+2]) / 3 / 256 * bins);
            const v2 = Math.floor((data2[i] + data2[i+1] + data2[i+2]) / 3 / 256 * bins);
            hist1[v1]++;
            hist2[v2]++;
        }
        let diff = 0, total = 0;
        for (let i = 0; i < bins; ++i) {
            diff += Math.abs(hist1[i] - hist2[i]);
            total += hist1[i] + hist2[i];
        }
        return total ? diff / total : 0;
    }

    /**
     * Recalls top N dominant colors from image data
     * @param {Uint8ClampedArray} data
     * @param {number} [n=5]
     * @returns {Array<{r:number,g:number,b:number}>}
     */
    function extractDominantColors(data, n = 5) {
        const colorMap = new Map();
        for (let i = 0; i < data.length; i += 4) {
            const r = (data[i] >> 5) << 5;
            const g = (data[i + 1] >> 5) << 5;
            const b = (data[i + 2] >> 5) << 5;
            const key = (r << 16) | (g << 8) | b;
            colorMap.set(key, (colorMap.get(key) || 0) + 1);
        }
        const sorted = Array.from(colorMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([key]) => ({
                r: (key >> 16) & 0xFF,
                g: (key >> 8) & 0xFF,
                b: key & 0xFF
            }));
            return sorted;
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
        extractDominantColors
    };
})();
