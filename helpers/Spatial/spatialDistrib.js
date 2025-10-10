window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.spatialDistribution = function (imageData) {
    if (!imageData?.data || !imageData.width || !imageData.height) {
        return { center: 0, periphery: 0, quadrants: [0, 0, 0, 0] };
    }

    const width = imageData.width;
    const height = imageData.height;
    const centerRadius = Math.min(width, height) * 0.2; // 20% radius: default for central risk
    const data = imageData.data;
    const lumi = window.AnalyzerHelpers.luminance;
    let centerSum = 0, peripherySum = 0;
    const quadrants = [0, 0, 0, 0];
    let centerPixels = 0, peripheryPixels = 0;
    const halfW = width / 2, halfH = height / 2;
    const quadrantCounts = [0, 0, 0, 0];
    // TASK 422b
    // Profiled to avoid sqrt in loop, testing did show little impact but want every bit of performance possible:
    // 480p 1.030ms for squared version versus 1.790ms for sqrt version
    // 720p 2.320ms versus 3ms
    // 1080p 3.74 verus 8.250ms

    const centerRadiusSq = centerRadius * centerRadius;
    // TASK 26: Removal of validation as Uint8ClmapedArray wil be numeric so no point it validation in hot path
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const brightness = lumi(data, i);

            const dx = x - halfW, dy = y - halfH;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq < centerRadiusSq) {
                centerSum += brightness;
                centerPixels++;
            } else {
                peripherySum += brightness;
                peripheryPixels++;
            }

            const quadrantIndex = (x < halfW ? 0 : 1) + (y < halfH ? 0 : 2);
            quadrants[quadrantIndex] += brightness;
            quadrantCounts[quadrantIndex]++;
        }
    }

    const normalizedQuadrants = quadrants.map((sum, idx) => quadrantCounts[idx] > 0 ? sum / quadrantCounts[idx] : 0);

    //normalizedQuadrants.forEach((q, idx) => {
    //   if (q > 0.8) console.warn(`Quadrant ${idx} unusually bright:`, q);
    // });

    return {
        center: centerPixels > 0 ? centerSum / centerPixels : 0,
        periphery: peripheryPixels > 0 ? peripherySum / peripheryPixels : 0,
        quadrants: normalizedQuadrants
    };
}