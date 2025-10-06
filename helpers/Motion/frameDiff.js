window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.calculateFrameDifference = function (currentFrame) {
    if (
        !currentFrame ||
        !currentFrame.data ||
        currentFrame.data.length % 4 !== 0
    ) {
        return { difference: 0, motion: 0 };
    }
    if (
        !this.lastFrame ||
        !this.lastFrame.data ||
        this.lastFrame.data.length !== currentFrame.data.length
    ) {
        this.lastFrame = {
            data: new Uint8ClampedArray(currentFrame.data.length),
            width: currentFrame.width,
            height: currentFrame.height,
        };
    }

    const data1 = currentFrame.data;
    const data2 = this.lastFrame.data;
    const len = data1.length;
    const maxDiff = 765; // Max diff per pixel (R + G + B)
    const pixelCount = len >>> 2;
    const threshold =
        (this.advancedMetrics?.frameDifference?.threshold ?? 0.1) * maxDiff;

    let totalDiff = 0;
    let motionPixels = 0;
    const blockSize = 256; // 64 pixels * 4 bytes per pixel

    // Overkill for default Youtube analysis, but analyzer is used for user videos too.
    // So.... Overkill it is.
    // Don't want to use too small blocks, as it would increase noise.
    // Overkill is better than underkill. 
    // TASK 25:
    // Clean up of loop unrolling, to a more simple approach
    // Loop unrolling just added extra variable overhead, more operations basically overthought the logic 
    for (
        let blockOffset = 0;
        blockOffset <= len - blockSize;
        blockOffset += blockSize
    ) {
        let localDiff = 0,
            localMotion = 0;
        for (let pixelOffset = 0; pixelOffset < blockSize; pixelOffset += 4) {
            const idx = blockOffset + pixelOffset;
            // Ignores alpha channel
            const rDiff = Math.abs(data1[idx] - data2[idx]);
            const gDiff = Math.abs(data1[idx + 1] - data2[idx + 1]);
            const bDiff = Math.abs(data1[idx + 2] - data2[idx + 2]);
            const diff = rDiff + gDiff + bDiff;
            localDiff += diff;
            localMotion += diff > threshold ? 1 : 0;
        }
        totalDiff += localDiff;
        motionPixels += localMotion;
    }
    // Cleanup any remaining pixels remaining
    for (
        let blockOffset = len - (len % blockSize);
        blockOffset < len;
        blockOffset += 4
    ) {
        const rDiff = Math.abs(data1[blockOffset] - data2[blockOffset]);
        const gDiff = Math.abs(data1[blockOffset + 1] - data2[blockOffset + 1]);
        const bDiff = Math.abs(data1[blockOffset + 2] - data2[blockOffset + 2]);
        const diff = rDiff + gDiff + bDiff;
        totalDiff += diff;
        motionPixels += diff > threshold ? 1 : 0;
    }

    const normalizedDiff = totalDiff / (pixelCount * maxDiff);
    const motionRatio = motionPixels / pixelCount;

    // Update last frame buffer for next call
    this.lastFrame.data.set(currentFrame.data);

    return {
        difference: normalizedDiff,
        motion: motionRatio,
    };
};