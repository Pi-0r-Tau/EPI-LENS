/*
 *  DSP.js - a comprehensive digital signal processing  library for javascript
 *
 *  Created by Corban Brook <corbanbrook@gmail.com> on 2010-01-01.
 *  Copyright 2010 Corban Brook. All rights reserved.
 *
 */

// FFT from DSP.js (Corban Brook, 2010)
// Setup arrays for platforms which do not support byte arrays
function setupTypedArray(name, fallback) {
    // check if TypedArray exists
    // typeof on Minefield and chrome return function, typeof on webkit returns object
    if (typeof this[name] !== "function" && typeof this[name] !== "object") {
        // nope.. check if WebGLArray exists
        if (
            typeof this[fallback] === "function" &&
            typeof this[fallback] !== "object"
        ) {
            this[name] = this[fallback];
        } else {
            // nope.. set as Native JS array
            this[name] = function (obj) {
                if (obj instanceof Array) {
                    return obj;
                } else if (typeof obj === "number") {
                    return new Array(obj);
                }
            };
        }
    }
}
setupTypedArray("Float64Array", "WebGLFloatArray");
setupTypedArray("Uint32Array", "WebGLIntArray");

// Fourier Transform Module used by FFT
function FourierTransform(bufferSize, sampleRate) {
    this.bufferSize = bufferSize;
    this.sampleRate = sampleRate;
    this.spectrum = new Float64Array(bufferSize / 2);
    this.real = new Float64Array(bufferSize);
    this.imag = new Float64Array(bufferSize);
    this.peakBand = 0;
    this.peak = 0;
    this.calculateSpectrum = function () {
        var spectrum = this.spectrum,
            real = this.real,
            imag = this.imag,
            bSi = 2 / this.bufferSize,
            sqrt = Math.sqrt,
            rval,
            ival,
            mag;
        for (var i = 0, N = this.bufferSize / 2; i < N; i++) {
            rval = real[i];
            ival = imag[i];
            mag = bSi * sqrt(rval * rval + ival * ival);
            if (mag > this.peak) {
                this.peakBand = i;
                this.peak = mag;
            }
            spectrum[i] = mag;
        }
    };
}

/**
 * FFT is a class for calculating the Discrete Fourier Transform of a signal
 * with the Fast Fourier Transform algorithm.
 *
 * @param {Number} bufferSize The size of the sample buffer to be computed. Must be power of 2
 * @param {Number} sampleRate The sampleRate of the buffer (eg. 44100)
 *
 * @constructor
 */
function FFT(bufferSize, sampleRate) {
    FourierTransform.call(this, bufferSize, sampleRate);
    this.reverseTable = new Uint32Array(bufferSize);
    var limit = 1;
    var bit = bufferSize >> 1;
    var i;
    while (limit < bufferSize) {
        for (i = 0; i < limit; i++) {
            this.reverseTable[i + limit] = this.reverseTable[i] + bit;
        }
        limit = limit << 1;
        bit = bit >> 1;
    }
    this.sinTable = new Float64Array(bufferSize);
    this.cosTable = new Float64Array(bufferSize);
    // PATCH
    // Orignal code used -Math.PI/i, which is undefined for i=0

    for (i = 0; i < bufferSize; i++) {
        this.sinTable[i] = Math.sin((-2 * Math.PI * i) / bufferSize);
        this.cosTable[i] = Math.cos((-2 * Math.PI * i) / bufferSize);
    }
    // END OF PATCH
}
/**
 * Performs a forward transform on the sample buffer.
 * Converts a time domain signal to frequency domain spectra.
 *
 * @param {Array} buffer The sample buffer. Buffer Length must be power of 2
 *
 * @returns The frequency spectrum array
 */
FFT.prototype.forward = function (buffer) {
    var bufferSize = this.bufferSize,
        cosTable = this.cosTable,
        sinTable = this.sinTable,
        reverseTable = this.reverseTable,
        real = this.real,
        imag = this.imag;
    var k = Math.floor(Math.log(bufferSize) / Math.LN2);
    if (Math.pow(2, k) !== bufferSize) {
        throw "Invalid buffer size, must be a power of 2.";
    }
    if (bufferSize !== buffer.length) {
        throw (
            "Supplied buffer is not the same size as defined FFT. FFT Size: " +
            bufferSize +
            " Buffer Size: " +
            buffer.length
        );
    }

    var halfSize = 1,
        phaseShiftStepReal,
        phaseShiftStepImag,
        currentPhaseShiftReal,
        currentPhaseShiftImag,
        off,
        tr,
        ti,
        tmpReal,
        i;

    for (i = 0; i < bufferSize; i++) {
        real[i] = buffer[reverseTable[i]];
        imag[i] = 0;
    }
    while (halfSize < bufferSize) {
        //phaseShiftStepReal = Math.cos(-Math.PI/halfSize);
        //phaseShiftStepImag = Math.sin(-Math.PI/halfSize);
        phaseShiftStepReal = cosTable[halfSize];
        phaseShiftStepImag = sinTable[halfSize];

        currentPhaseShiftReal = 1;
        currentPhaseShiftImag = 0;

        for (var fftStep = 0; fftStep < halfSize; fftStep++) {
            i = fftStep;

            while (i < bufferSize) {
                off = i + halfSize;
                tr =
                    currentPhaseShiftReal * real[off] - currentPhaseShiftImag * imag[off];
                ti =
                    currentPhaseShiftReal * imag[off] + currentPhaseShiftImag * real[off];

                real[off] = real[i] - tr;
                imag[off] = imag[i] - ti;
                real[i] += tr;
                imag[i] += ti;

                i += halfSize << 1;
            }

            tmpReal = currentPhaseShiftReal;
            currentPhaseShiftReal =
                tmpReal * phaseShiftStepReal -
                currentPhaseShiftImag * phaseShiftStepImag;
            currentPhaseShiftImag =
                tmpReal * phaseShiftStepImag +
                currentPhaseShiftImag * phaseShiftStepReal;
        }
        halfSize = halfSize << 1;
    }
    this.calculateSpectrum();
    return this.spectrum;
};
// Extract to window for fft.js,
if (typeof window !== "undefined") {
    window.FFT = FFT;
}
