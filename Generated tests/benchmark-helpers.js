// Generated file for testing purposes only
// Created for quick benchmarking of helper functions, ad-hoc comparison etc.
// NOT part of the EPI-LENS library
// Updated to have reproducible results and no allocations in hot path and 
// TO avoid allocations with every call preallocates the data now, plus a pipeline sim for 
// some helpers that need contxt/state
// TDLR: Math.random() replaced with seeded PRNG, Date.now() replaced with synthetic timestamps


"use strict";

// EPI-LENS Helper Benchmarks
// Run: node benchmark-helpers.js
// Run with GC: node --expose-gc benchmark-helpers.js
// Scale iterations: ITER_SCALE=2 node benchmark-helpers.js
// So iter_scale of 2 means twice as many iterations but GC will differ and GC pauses will affect results
// So JSON file is the eposed GC run
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

// Environment controls
const ITER_SCALE = parseFloat(process.env.ITER_SCALE) || 1;
const WARMUP_OVERRIDE = process.env.WARMUP ? parseInt(process.env.WARMUP, 10) : null;
const GC_EXPOSED = typeof global.gc === 'function';

// Seeded PRNG for deterministic results (xorshift32)
function makePRNG(seed) {
    let state = seed >>> 0 || 1;
    return function() {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) / 0xFFFFFFFF;
    };
}

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

// Fail fast if helpers not available
const AH = window.AnalyzerHelpers;
if (!AH) {
    console.error(`${COLORS.red}✗ window.AnalyzerHelpers not found. Aborting.${COLORS.reset}`);
    process.exit(1);
}

// Frame size definitions
const FRAME_SIZES = {
    SD: { src: '1280x720', sampled: '320x180', w: 1280, h: 720 },
    HD: { src: '1920x1080', sampled: '480x270', w: 1920, h: 1080 },
    QHD: { src: '2560x1440', sampled: '640x360', w: 2560, h: 1440 },
    UHD: { src: '3840x2160', sampled: '960x540', w: 3840, h: 2160 }
};
const { SD, HD } = FRAME_SIZES;

// Deterministic frame generator
function makeFrame(w, h, type, rng) {
    const dw = Math.floor(w / 4);
    const dh = Math.floor(h / 4);
    const len = dw * dh * 4;
    const pixelCount = dw * dh;
    const data = new Uint8ClampedArray(len);

    if (type === 'random') {
        for (let i = 0; i < len; i += 4) {
            data[i] = (rng() * 255) | 0;
            data[i + 1] = (rng() * 255) | 0;
            data[i + 2] = (rng() * 255) | 0;
            data[i + 3] = 255;
        }
    } else if (type === 'gradient') {
        for (let y = 0; y < dh; y++) {
            for (let x = 0; x < dw; x++) {
                const i = (y * dw + x) * 4;
                data[i] = ((x / dw) * 255) | 0;
                data[i + 1] = ((y / dh) * 255) | 0;
                data[i + 2] = 128;
                data[i + 3] = 255;
            }
        }
    } else if (type === 'red') {
        for (let i = 0; i < len; i += 4) {
            data[i] = (200 + rng() * 55) | 0;
            data[i + 1] = (rng() * 50) | 0;
            data[i + 2] = (rng() * 50) | 0;
            data[i + 3] = 255;
        }
    }

    return { data, width: dw, height: dh, pixelCount };
}

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

// ═══════════════════════════════════════════════════════════════════════════
// PRE-GENERATE ALL TEST DATA (deterministic, no allocations in hot path)
// ═══════════════════════════════════════════════════════════════════════════

const rngGlobal = makePRNG(0xC0FFEE);

// Pre-built frames
const fSD_random = makeFrame(SD.w, SD.h, 'random', rngGlobal);
const fSD2_random = makeFrame(SD.w, SD.h, 'random', rngGlobal);
const fSD_red = makeFrame(SD.w, SD.h, 'red', rngGlobal);
const fHD_random = makeFrame(HD.w, HD.h, 'random', rngGlobal);
const fHD2_random = makeFrame(HD.w, HD.h, 'random', rngGlobal);

// Pre-built typed arrays
const singlePixel = new Uint8ClampedArray([128, 64, 200, 255]);
const singlePixel2 = new Uint8ClampedArray([180, 90, 50, 255]);

// Pre-built Lab colors
const lab1 = { L: 50, a: 25, b: -10 };
const lab2 = { L: 55, a: 30, b: -5 };
const labRed = AH.rgbToLab ? AH.rgbToLab(220, 40, 40) : { L: 50, a: 60, b: 40 };
const colorRed = { r: 220, g: 40, b: 40 };

// Pre-built temporal sequences
const temporalValues100 = Array.from({ length: 100 }, () => rngGlobal() * 255);
const brightnessSeq = Array.from({ length: 60 }, () => rngGlobal());

// Pre-built color changes
const colorChanges30 = {
    r: Array.from({ length: 30 }, () => rngGlobal() * 0.3),
    g: Array.from({ length: 30 }, () => rngGlobal() * 0.3),
    b: Array.from({ length: 30 }, () => rngGlobal() * 0.3)
};

// Pre-built color array for contrast sensitivity
const colors100 = Array.from({ length: 100 }, () => ({
    r: rngGlobal() * 255,
    g: rngGlobal() * 255,
    b: rngGlobal() * 255
}));

// Pre-built array for percentile tree
const percentileArr1000 = Array.from({ length: 1000 }, () => rngGlobal() * 100);
const percentileArrSmall = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Pre-built FFT signals
const fftSignal64 = new Float32Array(64);
const fftSignal256 = new Float32Array(256);
for (let i = 0; i < 64; i++) fftSignal64[i] = rngGlobal();
for (let i = 0; i < 256; i++) fftSignal256[i] = rngGlobal();

// Pre-built spectral array
const spectralArr64 = Array.from({ length: 64 }, () => rngGlobal());

// Pre-built periodicity signal
const periodicitySignal100 = Array.from({ length: 100 }, (_, i) =>
    Math.sin(2 * Math.PI * i / 10) + rngGlobal() * 0.1
);

// Pre-built monotonic timestamps (synthetic, no Date.now in hot path)
const TICKS_60FPS = Array.from({ length: 600 }, (_, i) => 1_000_000 + i * 16);
const TICKS_30FPS = Array.from({ length: 300 }, (_, i) => 1_000_000 + i * 33);

// Pre-built pipeline frames (30 frames for simulation)
const pipelineFrames = Array.from({ length: 30 }, () => makeFrame(SD.w, SD.h, 'random', rngGlobal));

// ═══════════════════════════════════════════════════════════════════════════
function benchmark(name, fn, iterations = 1000, pixelCount = null) {
    const scaledIterations = Math.max(10, Math.round(iterations * ITER_SCALE));
    const warmupCount = WARMUP_OVERRIDE ?? Math.min(500, Math.max(50, Math.round(scaledIterations * 0.1)));

    // Warmup
    for (let i = 0; i < warmupCount; i++) {
        try { fn(); } catch (e) { return { name, error: e.message }; }
    }

    // Force GC if available
    if (GC_EXPOSED) global.gc();

    const times = [];
    for (let i = 0; i < scaledIterations; i++) {
        const start = process.hrtime.bigint();
        fn();
        const end = process.hrtime.bigint();
        times.push(Number(end - start) / 1e6); // ms
    }

    times.sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    const avg = sum / scaledIterations;

    const result = {
        name,
        iterations: scaledIterations,
        warmup: warmupCount,
        totalMs: sum.toFixed(2),
        avgMs: avg.toFixed(4),
        medianMs: times[Math.floor(scaledIterations / 2)].toFixed(4),
        minMs: times[0].toFixed(4),
        maxMs: times[scaledIterations - 1].toFixed(4),
        p95Ms: times[Math.floor(scaledIterations * 0.95)].toFixed(4),
        opsPerSec: ((scaledIterations / sum) * 1000).toFixed(0)
    };

    // p99 only meaningful with enough samples
    if (scaledIterations >= 100) {
        result.p99Ms = times[Math.floor(scaledIterations * 0.99)].toFixed(4);
    }

    // ns/pixel for image operations
    if (pixelCount && pixelCount > 0) {
        const avgNs = avg * 1e6;
        result.nsPerPixel = (avgNs / pixelCount).toFixed(2);
        result.pixelCount = pixelCount;
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// BENCHMARK DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const benchmarks = [
    // === COLOR ===
    {
        category: 'Color',
        name: 'luminance',
        iterations: 10000,
        fn: () => AH.luminance(singlePixel, 0)
    },
    {
        category: 'Color',
        name: 'luminance255',
        iterations: 10000,
        fn: () => AH.luminance255(singlePixel, 0)
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
        fn: () => AH.cie76(lab1, lab2)
    },
    {
        category: 'Color',
        name: `calculateDominantColor (${SD.src} @ 25% = ${SD.sampled})`,
        iterations: 500,
        pixelCount: fSD_random.pixelCount,
        fn: () => AH.calculateDominantColor(fSD_random)
    },
    {
        category: 'Color',
        name: `calculateDominantColor (${HD.src} @ 25% = ${HD.sampled})`,
        iterations: 500,
        pixelCount: fHD_random.pixelCount,
        fn: () => AH.calculateDominantColor(fHD_random)
    },
    {
        category: 'Color',
        name: 'isSaturatedRed',
        iterations: 5000,
        fn: (() => {
            // compute Lab via library once, reuse
            const c = colorRed;
            const lab = labRed;
            return () => AH.isSaturatedRed(c, lab);
        })()
    },
    {
        category: 'Color',
        name: `chromaticFlashes (${SD.src} @ 25%)`,
        iterations: 500,
        pixelCount: fSD_random.pixelCount,
        fn: () => AH.chromaticFlashes(fSD_random, 10)
    },
    {
        category: 'Color',
        name: `coverage (${SD.src} @ 25%)`,
        iterations: 500,
        pixelCount: fSD_red.pixelCount,
        fn: () => AH.coverage(fSD_red, 0.5)
    },
    {
        category: 'Color',
        name: 'colorSpikes',
        iterations: 2000,
        fn: () => AH.colorSpikes(colorChanges30, 0.2, 2)
    },
    {
        category: 'Color',
        name: 'calculateContrastSensitivity (100 colors)',
        iterations: 200,
        fn: () => AH.calculateContrastSensitivity(colors100)
    },
    {
        category: 'Color',
        name: 'PercentileTree.fromArray (1000)',
        iterations: 500,
        fn: () => AH.PercentileTree.fromArray(percentileArr1000)
    },
    {
        category: 'Color',
        name: 'PercentileTree.quantile',
        iterations: 5000,
        fn: (() => {
            const tree = AH.PercentileTree.fromArray(percentileArrSmall);
            return () => tree.quantile(95);
        })()
    },

    // === AVERAGE ===
    {
        category: 'Average',
        name: `avgBrightness (${SD.src} @ 25%)`,
        iterations: 1000,
        pixelCount: fSD_random.pixelCount,
        fn: () => AH.avgBrightness(fSD_random.data)
    },
    {
        category: 'Average',
        name: `avgBrightness (${HD.src} @ 25%)`,
        iterations: 500,
        pixelCount: fHD_random.pixelCount,
        fn: () => AH.avgBrightness(fHD_random.data)
    },
    {
        category: 'Average',
        name: `avgRedIntensity (${SD.src} @ 25%)`,
        iterations: 1000,
        pixelCount: fSD_red.pixelCount,
        fn: () => AH.avgRedIntensity(fSD_red.data)
    },

    // === TEMPORAL ===
    {
        category: 'Temporal',
        name: 'temporalVariance (100 values)',
        iterations: 5000,
        fn: () => AH.temporalVariance(temporalValues100)
    },
    {
        category: 'Temporal',
        name: 'temporalChange',
        iterations: 5000,
        fn: (() => {
            const ctx = makeAnalyzerContext();
            let idx = 0;
            return () => {
                const brightness = brightnessSeq[idx % 60];
                const tick = TICKS_60FPS[idx % 600];
                idx++;
                return AH.temporalChange.call(ctx, brightness, tick);
            };
        })()
    },
    {
        category: 'Temporal',
        name: 'temporalContrast (warm buffer)',
        iterations: 2000,
        fn: (() => {
            const ctx = makeAnalyzerContext();
            // warm the 15-sample buffer once
            for (let i = 0; i < 14; i++) {
                AH.temporalContrast.call(ctx, brightnessSeq[i % 60], TICKS_60FPS[i], 15);
            }
            let callIdx = 0;
            return () => {
                const i = callIdx++ % 60;
                return AH.temporalContrast.call(ctx, brightnessSeq[i], TICKS_60FPS[100 + i], 15);
            };
        })()
    },
    {
        category: 'Temporal',
        name: 'temporalCoherence (warm buffer)',
        iterations: 1000,
        fn: (() => {
            const ctx = makeAnalyzerContext();
            for (let i = 0; i < 30; i++) {
                AH.temporalCoherence.call(ctx, brightnessSeq[i % 60], 30, 10);
            }
            let k = 0;
            return () => AH.temporalCoherence.call(ctx, brightnessSeq[(30 + k++) % 60], 30, 10);
        })()
    },
    {
        category: 'Temporal',
        name: 'periodicity (100 samples)',
        iterations: 1000,
        fn: () => AH.periodicity(periodicitySignal100, 2, 0.5)
    },
    {
        category: 'Temporal',
        name: `frameEntropy (${SD.src} @ 25%)`,
        iterations: 500,
        pixelCount: fSD_random.pixelCount,
        fn: (() => {
            const ctx = makeAnalyzerContext();
            let t = 0;
            return () => AH.frameEntropy.call(ctx, fSD_random, TICKS_60FPS[(t++) % 600]);
        })()
    },
    {
        category: 'Temporal',
        name: 'flashViolation tracking (60 frames)',
        iterations: 2000,
        fn: (() => {
            return () => {
                const ctx = makeAnalyzerContext();
                AH.initFlashViolationTracking && AH.initFlashViolationTracking.call(ctx);
                for (let i = 0; i < 60; i++) {
                    AH.updateFlashViolation.call(ctx, brightnessSeq[i], (i % 5) === 0, i);
                }
                return AH.getFlashViolationStats.call(ctx, 2);
            };
        })()
    },

    // === SPECTRAL ===
    {
        category: 'Spectral',
        name: 'performFFT (64-point)',
        iterations: 2000,
        fn: () => AH.performFFT(fftSignal64, 60)
    },
    {
        category: 'Spectral',
        name: 'performFFT (256-point)',
        iterations: 500,
        fn: () => AH.performFFT(fftSignal256, 60)
    },
    {
        category: 'Spectral',
        name: 'computeSpectralFlatness',
        iterations: 5000,
        fn: () => AH.computeSpectralFlatness(spectralArr64, 5, 50)
    },
    {
        category: 'Spectral',
        name: 'spectralAnalysis (warm 64-sample buffer)',
        iterations: 500,
        fn: (() => {
            const ctx = makeAnalyzerContext();
            for (let i = 0; i < 64; i++) {
                AH.spectralAnalysis.call(ctx, brightnessSeq[i % 60], 128, 64, 60, TICKS_60FPS[i]);
            }
            let tickIdx = 64;
            return () => {
                const i = tickIdx++ % 60;
                return AH.spectralAnalysis.call(ctx, brightnessSeq[i], 128, 64, 60, TICKS_60FPS[64 + i]);
            };
        })()
    },

    // === MOTION ===
    {
        category: 'Motion',
        name: `calculateFrameDifference (${SD.src} @ 25%)`,
        iterations: 500,
        pixelCount: fSD_random.pixelCount,
        fn: (() => {
            const ctx = makeAnalyzerContext();
            ctx.lastFrame = fSD_random;
            return () => AH.calculateFrameDifference.call(ctx, fSD2_random);
        })()
    },
    {
        category: 'Motion',
        name: `frameHistogramDiff (${SD.src} @ 25%)`,
        iterations: 500,
        pixelCount: fSD_random.pixelCount,
        fn: () => AH.frameHistogramDiff(fSD_random.data, fSD2_random.data)
    },
    {
        category: 'Motion',
        name: `frameHistogramDiff (${HD.src} @ 25%)`,
        iterations: 500,
        pixelCount: fHD_random.pixelCount,
        fn: () => AH.frameHistogramDiff(fHD_random.data, fHD2_random.data)
    },

    // === PIPELINE SIMULATION ===
    {
        category: 'Pipeline',
        name: 'simulated_30fps_loop (30 frames)',
        iterations: 200,
        fn: (() => {
            const ctx = makeAnalyzerContext();
            AH.initFlashViolationTracking && AH.initFlashViolationTracking.call(ctx);
            return () => {
                for (let i = 0; i < 30; i++) {
                    const fr = pipelineFrames[i];
                    const tick = TICKS_30FPS[i];

                    // Lightweight ops every frame
                    AH.avgBrightness(fr.data);
                    AH.chromaticFlashes(fr, 10);

                    // Heavier ops interleaved
                    if ((i & 1) === 0) {
                        AH.frameHistogramDiff(fr.data, fSD2_random.data);
                    }
                    if (i % 3 === 0) {
                        AH.calculateDominantColor(fr);
                    }
                    if (i % 5 === 0) {
                        AH.spectralAnalysis.call(ctx, brightnessSeq[i], 128, 64, 30, tick);
                    }
                }
            };
        })()
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// RUN BENCHMARKS
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${COLORS.bold}════════════════════════════════════════════════════════════${COLORS.reset}`);
console.log(`${COLORS.bold}  EPI-LENS Benchmarks ${COLORS.reset}`);
console.log(`${COLORS.bold}════════════════════════════════════════════════════════════${COLORS.reset}`);
console.log(`  Date: ${new Date().toISOString()}`);
console.log(`  Node: ${process.version}`);
console.log(`  Platform: ${process.platform} ${process.arch}`);
console.log(`  GC exposed: ${GC_EXPOSED ? 'yes' : 'no'}`);
console.log(`  Iteration scale: ${ITER_SCALE}x\n`);

const results = [];
let currentCategory = '';

for (const bench of benchmarks) {
    if (bench.category !== currentCategory) {
        currentCategory = bench.category;
        console.log(`\n${COLORS.cyan}${COLORS.bold}${currentCategory.toUpperCase()}${COLORS.reset}`);
        console.log('─'.repeat(75));
    }

    try {
        const result = benchmark(bench.name, bench.fn, bench.iterations, bench.pixelCount);
        results.push({ category: bench.category, ...result });

        if (result.error) {
            console.log(`  ${COLORS.red}✗${COLORS.reset} ${bench.name}: ${result.error}`);
        } else {
            const avgColor = parseFloat(result.avgMs) < 0.1 ? COLORS.green :
                parseFloat(result.avgMs) < 1 ? COLORS.yellow : COLORS.red;

            let extras = `p95: ${result.p95Ms}ms`;
            if (result.p99Ms) extras += `  p99: ${result.p99Ms}ms`;
            if (result.nsPerPixel) extras += `  ${result.nsPerPixel} ns/px`;
            extras += `  ${result.opsPerSec} ops/s`;

            console.log(
                `  ${COLORS.green}✓${COLORS.reset} ${bench.name.padEnd(50)} ` +
                `${avgColor}${result.avgMs.padStart(8)}ms${COLORS.reset}  ` +
                `${COLORS.dim}${extras}${COLORS.reset}`
            );
        }
    } catch (e) {
        console.log(`  ${COLORS.red}✗${COLORS.reset} ${bench.name}: ${e.message}`);
        results.push({ category: bench.category, name: bench.name, error: e.message });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

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
    const nsPx = r.nsPerPixel ? `  (${r.nsPerPixel} ns/px)` : '';
    console.log(`  ${i + 1}. ${r.name.padEnd(50)} ${COLORS.red}${r.avgMs}ms${COLORS.reset}${nsPx}`);
});

// Save results
const outputData = {
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    gcExposed: GC_EXPOSED,
    iterScale: ITER_SCALE,
    results: results
};

require('fs').writeFileSync(
    'benchmark-results.json',
    JSON.stringify(outputData, null, 2)
);

console.log(`\n${COLORS.green}✓${COLORS.reset} Saved: benchmark-results.json\n`);