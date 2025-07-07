(function() {

    function rgbToLab(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        [r, g, b] = [r, g, b].map(v => v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92);
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
        return Math.sqrt(
            Math.pow(lab1.L - lab2.L, 2) +
            Math.pow(lab1.a - lab2.a, 2) +
            Math.pow(lab1.b - lab2.b, 2)
        );
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
        const logN = Math.log2(n);
        const re = new Float64Array(n);
        const im = new Float64Array(n);
        for(let i = 0; i < n; i++) re[i] = signal[i];
        const cosTable = new Float64Array(n/2);
        const sinTable = new Float64Array(n/2);
        for(let i = 0; i < n/2; i++) {
            const angle = -2 * Math.PI * i / n;
            cosTable[i] = Math.cos(angle);
            sinTable[i] = Math.sin(angle);
        }
        const bitReverseShuffle = (reArr, imArr) => {
            for(let i = 0; i < n; i++) {
                let rev = 0;
                for(let j = 0; j < logN; j++) {
                    rev |= ((i >> j) & 1) << (logN - 1 - j);
                }
                if(i < rev) {
                    [reArr[i], reArr[rev]] = [reArr[rev], reArr[i]];
                    [imArr[i], imArr[rev]] = [imArr[rev], imArr[i]];
                }
            }
        };
        bitReverseShuffle(re, im);
        for(let len = 2; len <= n; len *= 2) {
            const halfLen = len / 2;
            for(let i = 0; i < n; i += len) {
                let wRe = 1, wIm = 0;
                for(let j = 0; j < halfLen; j++) {
                    const idx1 = i + j;
                    const idx2 = idx1 + halfLen;
                    const twiddleIdx = (j * (n/len)) >> 0;
                    const twRe = cosTable[twiddleIdx];
                    const twIm = sinTable[twiddleIdx];
                    const tempRe = wRe * re[idx2] - wIm * im[idx2];
                    const tempIm = wRe * im[idx2] + wIm * re[idx2];
                    re[idx2] = re[idx1] - tempRe;
                    im[idx2] = im[idx1] - tempIm;
                    re[idx1] += tempRe;
                    im[idx1] += tempIm;
                    const tmpRe = wRe * twRe - wIm * twIm;
                    wIm = wRe * twIm + wIm * twRe;
                    wRe = tmpRe;
                }
            }
        }
        return {re, im};
    }

    /**
     * Computes the Sobel edge magnitude map for a grayscale image.
     * @param {Float32Array} gray 
     * @param {number} width
     * @param {number} height
     * @returns {Float32Array}
     */
    function sobelEdgeMap(gray, width, height) {
        const edge = new Float32Array(width * height);
        for (let y = 1; y < height - 1; ++y) {
            for (let x = 1; x < width - 1; ++x) {
                let gx =
                    -gray[(y - 1) * width + (x - 1)] - 2 * gray[y * width + (x - 1)] - gray[(y + 1) * width + (x - 1)] +
                    gray[(y - 1) * width + (x + 1)] + 2 * gray[y * width + (x + 1)] + gray[(y + 1) * width + (x + 1)];
                let gy =
                    -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)] +
                    gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];
                edge[y * width + x] = Math.sqrt(gx * gx + gy * gy);
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

        const gray = new Float32Array(width * height);
        for (let i = 0; i < data.length; i += 4) {
            gray[i / 4] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }

        let blockSize = 8;
        let blockScores = [];
        for (let by = 0; by < height; by += blockSize) {
            for (let bx = 0; bx < width; bx += blockSize) {
                let sum = 0, sum2 = 0, count = 0;
                for (let y = by; y < Math.min(by + blockSize, height); ++y) {
                    for (let x = bx; x < Math.min(bx + blockSize, width); ++x) {
                        let v = gray[y * width + x];
                        sum += v;
                        sum2 += v * v;
                        count++;
                    }
                }
                if (count > 0) {
                    let mean = sum / count;
                    let variance = sum2 / count - mean * mean;
                    blockScores.push(Math.sqrt(Math.max(variance, 0)));
                }
            }
        }
        // Normalize
        let avgBlockContrast = blockScores.length ? blockScores.reduce((a, b) => a + b, 0) / blockScores.length / 128 : 0;

        const edge = sobelEdgeMap(gray, width, height);

        let edgeRowSum = new Float32Array(height);
        for (let y = 0; y < height; ++y) {
            let sum = 0;
            for (let x = 0; x < width; ++x) {
                sum += edge[y * width + x];
            }
            edgeRowSum[y] = sum;
        }

        let mean = edgeRowSum.reduce((a, b) => a + b, 0) / height;
        let maxCorr = 0;
        for (let lag = 2; lag < Math.min(20, height / 2); ++lag) {
            let corr = 0;
            for (let i = 0; i < height - lag; ++i) {
                corr += (edgeRowSum[i] - mean) * (edgeRowSum[i + lag] - mean);
            }
            corr /= (height - lag);
            if (corr > maxCorr) maxCorr = corr;
        }
        // Normalize
        let periodicityScore = Math.min(maxCorr / (edgeRowSum.reduce((a, b) => a + Math.abs(b - mean), 0) / height + 1e-6), 1);

        let score = 0.5 * avgBlockContrast + 0.5 * periodicityScore;
        score = Math.max(0, Math.min(score, 1));

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

    window.AnalyzerHelpers = {
        rgbToLab,
        cie76,
        padToPowerOfTwo,
        performFFT,
        sobelEdgeMap,
        detectPatternedStimulus,
        calculateDominantColor
    };
})();
