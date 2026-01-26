// Generated file for testing purposes only
// Created for quick benchmarking of helper functions, ad-hoc comparison etc.
// NOT part of the EPI-LENS library

"use strict";

// EPI-LENS Helper Benchmarks
// Run: node benchmark-helpers.js
// Outputs: benchmark-results.json

const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    bold: '\x1b[1m'
};

// Setup Node environment
global.window = global;
global.document = {
    createElement: () => ({ getContext: () => null }),
    title: 'Benchmark'
};

// Load all helpers
const helperFiles = [
    'helpers/Color/luminance.js',
    'helpers/Color/percentileTree.js',
    'helpers/Color/labColorUtils.js',
    'helpers/Color/coverage.js',
    'helpers/Color/colorSpikes.js',
    'helpers/Color/colorHist.js',
    'helpers/Color/colorVar.js',
    'helpers/Color/contrastSen.js',
    'helpers/Color/chromaticFlashes.js',
    'helpers/Avg/avgBrightness.js',
    'helpers/Avg/avgRedIntensity.js',
    'helpers/Avg/avgIntensity.js',
    'helpers/Spectral/dsp.js',
    'helpers/Spectral/fft.js',
    'helpers/Spectral/spectralFlatness.js',
    'helpers/Spectral/spectralAnalysis.js',
    'helpers/Temporal/tempVar.js',
    'helpers/Temporal/tempChange.js',
    'helpers/Temporal/tempContrast.js',
    'helpers/Temporal/tempCoherence.js',
    'helpers/Temporal/periodicity.js',
    'helpers/Temporal/frameEntropy.js',
    'helpers/Temporal/estFlickerFreq.js',
    'helpers/Temporal/flashViolation.js',
    'helpers/Spatial/spatialDistrib.js',
    'helpers/Spatial/spatialEdges.js',
    'helpers/Spatial/spatialEdgeChange.js',
    'helpers/Spatial/spatialFrameAnalysis.js',
    'helpers/Motion/frameDiff.js',
    'helpers/Motion/frameHistoDiff.js',
    'helpers/Risk/risk-level-helper.js',
];

const loaded = [];
const failed = [];

helperFiles.forEach(f => {
    try {
        require('./' + f);
        loaded.push(f);
    } catch (e) {
        failed.push({ file: f, error: e.message });
    }
});

console.log(`\n${COLORS.bold}Loaded ${loaded.length}/${helperFiles.length} helpers${COLORS.reset}`);
if (failed.length) {
    failed.forEach(f => console.log(`  ${COLORS.yellow}⚠ ${f.file}${COLORS.reset}`));
}

// Test data generators
function makeFrame(w, h, type = 'random') {
    const dw = Math.floor(w / 4);
    const dh = Math.floor(h / 4);
    const len = dw * dh * 4;
    const data = new Uint8ClampedArray(len);

    if (type === 'random') {
        for (let i = 0; i < len; i += 4) {
            data[i] = Math.random() * 255 | 0;
            data[i + 1] = Math.random() * 255 | 0;
            data[i + 2] = Math.random() * 255 | 0;
            data[i + 3] = 255;
        }
    } else if (type === 'gradient') {
        for (let y = 0; y < dh; y++) {
            for (let x = 0; x < dw; x++) {
                const i = (y * dw + x) * 4;
                data[i] = (x / dw) * 255 | 0;
                data[i + 1] = (y / dh) * 255 | 0;
                data[i + 2] = 128;
                data[i + 3] = 255;
            }
        }
    } else if (type === 'red') {
        for (let i = 0; i < len; i += 4) {
            data[i] = 200 + Math.random() * 55 | 0;
            data[i + 1] = Math.random() * 50 | 0;
            data[i + 2] = Math.random() * 50 | 0;
            data[i + 3] = 255;
        }
    }

    return { data, width: dw, height: dh };
}

const FRAME_SIZES = {
    SD: { src: '1280x720', sampled: '320x180', w: 1280, h: 720 },
    HD: { src: '1920x1080', sampled: '480x270', w: 1920, h: 1080 },
    QHD: { src: '2560x1440', sampled: '640x360', w: 2560, h: 1440 },
    UHD: { src: '3840x2160', sampled: '960x540', w: 3840, h: 2160 }
};

function makeAnalyzerContext() {
    return {
        metrics: {
            flashCount: 0,
            frameCount: 100,
            flashSequences: [],
            lastFrameBrightness: null,
            riskLevel: 'low'
        },
        advancedMetrics: {
            colorHistory: { r: [], g: [], b: [], maxLen: 30 },
            temporalChanges: [],
            spectralAnalysis: { bufferLen: 128, fftLen: 64 },
            temporalCoherence: { windowSize: 30 },
            chromaticFlashes: { lastColors: [], maxLen: 10 },
            temporalContrast: { bufferLen: 15 },
            frameDifference: { threshold: 0.1 },
            edgeDetection: { threshold: 30, maxHistory: 500, history: [] },
            frameEntropy: []
        },
        thresholds: { brightnessChange: 0.1 },
        temporalBuffer: {},
        minAnalysisInterval: 1000 / 60,
        lastFrame: null
    };
}

// Benchmark runner
function benchmark(name, fn, iterations = 1000) {
    // Warmup
    for (let i = 0; i < 50; i++) {
        try { fn(); } catch (e) { return { name, error: e.message }; }
    }

    // Force GC if available
    if (global.gc) global.gc();

    const times = [];
    for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        fn();
        const end = process.hrtime.bigint();
        times.push(Number(end - start) / 1e6); // ms
    }

    times.sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);

    return {
        name,
        iterations,
        totalMs: sum.toFixed(2),
        avgMs: (sum / iterations).toFixed(4),
        medianMs: times[Math.floor(iterations / 2)].toFixed(4),
        minMs: times[0].toFixed(4),
        maxMs: times[times.length - 1].toFixed(4),
        p95Ms: times[Math.floor(iterations * 0.95)].toFixed(4),
        opsPerSec: ((iterations / sum) * 1000).toFixed(0)
    };
}

// Define benchmarks
const AH = window.AnalyzerHelpers;

const benchmarks = [
    // === COLOR ===
    {
        category: 'Color',
        name: 'luminance',
        iterations: 10000,
        fn: () => {
            const d = new Uint8ClampedArray([128, 64, 200, 255]);
            return AH.luminance(d, 0);
        }
    },
    {
        category: 'Color',
        name: 'luminance255',
        iterations: 10000,
        fn: () => {
            const d = new Uint8ClampedArray([128, 64, 200, 255]);
            return AH.luminance255(d, 0);
        }
    },
    {
        category: 'Color',
        name: 'rgbToLab',
        iterations: 5000,
        fn: () => AH.rgbToLab(220, 50, 50)
    },
    {
        category: 'Color',
        name: 'cie76',
        iterations: 10000,
        fn: () => {
            const lab1 = { L: 50, a: 25, b: -10 };
            const lab2 = { L: 55, a: 30, b: -5 };
            return AH.cie76(lab1, lab2);
        }
    },
    {
        category: 'Color',
        name: `calculateDominantColor (${FRAME_SIZES.SD.src} @ 25% = ${FRAME_SIZES.SD.sampled})`,
        iterations: 500,
        fn: () => AH.calculateDominantColor(makeFrame(FRAME_SIZES.SD.w, FRAME_SIZES.SD.h))
    },
    {
        category: 'Color',
        name: `calculateDominantColor (${FRAME_SIZES.HD.src} @ 25% = ${FRAME_SIZES.HD.sampled})`,
        iterations: 50,
        fn: () => AH.calculateDominantColor(makeFrame(FRAME_SIZES.HD.w, FRAME_SIZES.HD.h))
    },
    {
        category: 'Color',
        name: 'isSaturatedRed',
        iterations: 5000,
        fn: () => {
            const c = { r: 220, g: 40, b: 40 };
            const lab = AH.rgbToLab(220, 40, 40);
            return AH.isSaturatedRed(c, lab);
        }
    },
    {
        category: 'Color',
        name: `chromaticFlashes (${FRAME_SIZES.SD.src} @ 25%)`,
        iterations: 500,
        fn: () => AH.chromaticFlashes(makeFrame(FRAME_SIZES.SD.w, FRAME_SIZES.SD.h), 10)
    },
    {
        category: 'Color',
        name: `coverage (${FRAME_SIZES.SD.src} @ 25%)`,
        iterations: 500,
        fn: () => AH.coverage(makeFrame(FRAME_SIZES.SD.w, FRAME_SIZES.SD.h), 0.5)
    },
    {
        category: 'Color',
        name: 'colorSpikes',
        iterations: 2000,
        fn: () => {
            const changes = {
                r: Array.from({ length: 30 }, () => Math.random() * 0.3),
                g: Array.from({ length: 30 }, () => Math.random() * 0.3),
                b: Array.from({ length: 30 }, () => Math.random() * 0.3)
            };
            return AH.colorSpikes(changes, 0.2, 2);
        }
    },
    {
        category: 'Color',
        name: 'calculateContrastSensitivity (100 colors)',
        iterations: 200,
        fn: () => {
            const colors = Array.from({ length: 100 }, () => ({
                r: Math.random() * 255,
                g: Math.random() * 255,
                b: Math.random() * 255
            }));
            return AH.calculateContrastSensitivity(colors);
        }
    },
    {
        category: 'Color',
        name: 'PercentileTree.fromArray (1000)',
        iterations: 500,
        fn: () => {
            const arr = Array.from({ length: 1000 }, () => Math.random() * 100);
            return AH.PercentileTree.fromArray(arr);
        }
    },
    {
        category: 'Color',
        name: 'PercentileTree.quantile',
        iterations: 5000,
        fn: () => {
            const tree = AH.PercentileTree.fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            return tree.quantile(95);
        }
    },

    // === AVERAGE ===
    {
        category: 'Average',
        name: `avgBrightness (${FRAME_SIZES.SD.src} @ 25%)`,
        iterations: 1000,
        fn: () => AH.avgBrightness(makeFrame(FRAME_SIZES.SD.w, FRAME_SIZES.SD.h).data)
    },
    {
        category: 'Average',
        name: `avgBrightness (${FRAME_SIZES.HD.src} @ 25%)`,
        iterations: 50,
        fn: () => AH.avgBrightness(makeFrame(FRAME_SIZES.HD.w, FRAME_SIZES.HD.h).data)
    },
    {
        category: 'Average',
        name: `avgRedIntensity (${FRAME_SIZES.SD.src} @ 25%)`,
        iterations: 1000,
        fn: () => AH.avgRedIntensity(makeFrame(FRAME_SIZES.SD.w, FRAME_SIZES.SD.h, 'red').data)
    },

    // === TEMPORAL ===
    {
        category: 'Temporal',
        name: 'temporalVariance (100 values)',
        iterations: 5000,
        fn: () => {
            const vals = Array.from({ length: 100 }, () => Math.random() * 255);
            return AH.temporalVariance(vals);
        }
    },
    {
        category: 'Temporal',
        name: 'temporalChange',
        iterations: 5000,
        fn: () => {
            const ctx = makeAnalyzerContext();
            return AH.temporalChange.call(ctx, Math.random(), 1000);
        }
    },
    {
        category: 'Temporal',
        name: 'temporalContrast',
        iterations: 2000,
        fn: () => {
            const ctx = makeAnalyzerContext();
            for (let i = 0; i < 10; i++) {
                AH.temporalContrast.call(ctx, Math.random(), Date.now() + i * 16, 15);
            }
            return AH.temporalContrast.call(ctx, Math.random(), Date.now() + 160, 15);
        }
    },
    {
        category: 'Temporal',
        name: 'temporalCoherence',
        iterations: 1000,
        fn: () => {
            const ctx = makeAnalyzerContext();
            for (let i = 0; i < 30; i++) {
                AH.temporalCoherence.call(ctx, Math.random(), 30, 10);
            }
            return AH.temporalCoherence.call(ctx, Math.random(), 30, 10);
        }
    },
    {
        category: 'Temporal',
        name: 'periodicity (100 samples)',
        iterations: 1000,
        fn: () => {
            const sig = Array.from({ length: 100 }, (_, i) =>
                Math.sin(2 * Math.PI * i / 10) + Math.random() * 0.1
            );
            return AH.periodicity(sig, 2, 0.5);
        }
    },
    {
        category: 'Temporal',
        name: `frameEntropy (${FRAME_SIZES.SD.src} @ 25%)`,
        iterations: 500,
        fn: () => {
            const ctx = makeAnalyzerContext();
            return AH.frameEntropy.call(ctx, makeFrame(FRAME_SIZES.SD.w, FRAME_SIZES.SD.h), 1000);
        }
    },
    {
        category: 'Temporal',
        name: 'flashViolation tracking',
        iterations: 2000,
        fn: () => {
            const ctx = makeAnalyzerContext();
            AH.initFlashViolationTracking.call(ctx);
            for (let i = 0; i < 60; i++) {
                AH.updateFlashViolation.call(ctx, i / 30, i % 5 === 0, i);
            }
            return AH.getFlashViolationStats.call(ctx, 2);
        }
    },

    // === SPECTRAL ===
    {
        category: 'Spectral',
        name: 'performFFT (64-point)',
        iterations: 2000,
        fn: () => {
            const sig = new Float32Array(64).map(() => Math.random());
            return AH.performFFT(sig, 60);
        }
    },
    {
        category: 'Spectral',
        name: 'performFFT (256-point)',
        iterations: 500,
        fn: () => {
            const sig = new Float32Array(256).map(() => Math.random());
            return AH.performFFT(sig, 60);
        }
    },
    {
        category: 'Spectral',
        name: 'computeSpectralFlatness',
        iterations: 5000,
        fn: () => {
            const spec = Array.from({ length: 64 }, () => Math.random());
            return AH.computeSpectralFlatness(spec, 5, 50);
        }
    },
    {
        category: 'Spectral',
        name: 'spectralAnalysis (full)',
        iterations: 500,
        fn: () => {
            const ctx = makeAnalyzerContext();
            for (let i = 0; i < 64; i++) {
                AH.spectralAnalysis.call(ctx, Math.random(), 128, 64, 60, Date.now() + i * 16);
            }
            return AH.spectralAnalysis.call(ctx, Math.random(), 128, 64, 60, Date.now());
        }
    },

    // === MOTION ===
    {
        category: 'Motion',
        name: `calculateFrameDifference (${FRAME_SIZES.SD.src} @ 25%)`,
        iterations: 500,
        fn: () => {
            const ctx = makeAnalyzerContext();
            ctx.lastFrame = makeFrame(FRAME_SIZES.SD.w, FRAME_SIZES.SD.h);
            return AH.calculateFrameDifference.call(ctx, makeFrame(FRAME_SIZES.SD.w, FRAME_SIZES.SD.h));
        }
    },
    {
        category: 'Motion',
        name: `frameHistogramDiff (${FRAME_SIZES.SD.src} @ 25%)`,
        iterations: 500,
        fn: () => {
            const f1 = makeFrame(FRAME_SIZES.SD.w, FRAME_SIZES.SD.h);
            const f2 = makeFrame(FRAME_SIZES.SD.w, FRAME_SIZES.SD.h);
            return AH.frameHistogramDiff(f1.data, f2.data);
        }
    },
    {
        category: 'Motion',
        name: `frameHistogramDiff (${FRAME_SIZES.HD.src} @ 25%)`,
        iterations: 50,
        fn: () => {
            const f1 = makeFrame(FRAME_SIZES.HD.w, FRAME_SIZES.HD.h);
            const f2 = makeFrame(FRAME_SIZES.HD.w, FRAME_SIZES.HD.h);
            return AH.frameHistogramDiff(f1.data, f2.data);
        }
    },
];

// Run benchmarks
console.log(`\n${COLORS.bold}════════════════════════════════════════════════════════════${COLORS.reset}`);
console.log(`${COLORS.bold}  EPI-LENS Benchmarks ${COLORS.reset}`);
console.log(`${COLORS.bold}════════════════════════════════════════════════════════════${COLORS.reset}`);
console.log(`  Date: ${new Date().toISOString()}`);
console.log(`  Node: ${process.version}`);
console.log(`  Platform: ${process.platform} ${process.arch}\n`);

const results = [];
let currentCategory = '';

for (const bench of benchmarks) {
    if (bench.category !== currentCategory) {
        currentCategory = bench.category;
        console.log(`\n${COLORS.cyan}${COLORS.bold}${currentCategory.toUpperCase()}${COLORS.reset}`);
        console.log('─'.repeat(70));
    }

    try {
        const result = benchmark(bench.name, bench.fn, bench.iterations);
        results.push({ category: bench.category, ...result });

        if (result.error) {
            console.log(`  ${COLORS.red}✗${COLORS.reset} ${bench.name}: ${result.error}`);
        } else {
            const avgColor = parseFloat(result.avgMs) < 0.1 ? COLORS.green :
                parseFloat(result.avgMs) < 1 ? COLORS.yellow : COLORS.red;
            console.log(
                `  ${COLORS.green}✓${COLORS.reset} ${bench.name.padEnd(40)} ` +
                `${avgColor}${result.avgMs.padStart(8)}ms${COLORS.reset}  ` +
                `${COLORS.dim}p95: ${result.p95Ms}ms  ${result.opsPerSec} ops/s${COLORS.reset}`
            );
        }
    } catch (e) {
        console.log(`  ${COLORS.red}✗${COLORS.reset} ${bench.name}: ${e.message}`);
        results.push({ category: bench.category, name: bench.name, error: e.message });
    }
}

// Summary
console.log(`\n${COLORS.bold}════════════════════════════════════════════════════════════${COLORS.reset}`);
console.log(`${COLORS.bold}  SUMMARY BY CATEGORY${COLORS.reset}`);
console.log(`${COLORS.bold}════════════════════════════════════════════════════════════${COLORS.reset}`);

const categories = [...new Set(results.map(r => r.category))];
for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat && !r.error);
    if (catResults.length === 0) continue;

    const avgTimes = catResults.map(r => parseFloat(r.avgMs));
    const totalAvg = avgTimes.reduce((a, b) => a + b, 0) / avgTimes.length;
    const fastest = catResults.reduce((a, b) => parseFloat(a.avgMs) < parseFloat(b.avgMs) ? a : b);
    const slowest = catResults.reduce((a, b) => parseFloat(a.avgMs) > parseFloat(b.avgMs) ? a : b);

    console.log(`\n${COLORS.cyan}${cat}${COLORS.reset} (${catResults.length} benchmarks)`);
    console.log(`  Avg: ${totalAvg.toFixed(4)}ms`);
    console.log(`  ${COLORS.green}Fastest:${COLORS.reset} ${fastest.name} (${fastest.avgMs}ms)`);
    console.log(`  ${COLORS.red}Slowest:${COLORS.reset} ${slowest.name} (${slowest.avgMs}ms)`);
}

// Top 5 slowest
console.log(`\n${COLORS.bold}════════════════════════════════════════════════════════════${COLORS.reset}`);
console.log(`${COLORS.bold}  OPTIMIZATION TARGETS (slowest operations)${COLORS.reset}`);
console.log(`${COLORS.bold}════════════════════════════════════════════════════════════${COLORS.reset}\n`);

const sorted = results
    .filter(r => !r.error)
    .sort((a, b) => parseFloat(b.avgMs) - parseFloat(a.avgMs))
    .slice(0, 5);

sorted.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name.padEnd(45)} ${COLORS.red}${r.avgMs}ms${COLORS.reset}`);
});

// Save results
const outputData = {
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    results: results
};

require('fs').writeFileSync(
    'benchmark-results.json',
    JSON.stringify(outputData, null, 2)
);

console.log(`\n${COLORS.green}✓${COLORS.reset} Saved: benchmark-results.json\n`);