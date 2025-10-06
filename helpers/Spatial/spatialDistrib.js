window.AnalyzerHelpers = window.AnalyzerHelpers || {};
window.AnalyzerHelpers.spatialDistribution = function (imageData) {
    if (!imageData?.data || !imageData.width || !imageData.height) {
        return { center: 0, periphery: 0, quadrants: [0, 0, 0, 0] };
    }

    const width = imageData.width;
    const height = imageData.height;
    const centerRadius = Math.min(width, height) * 0.2; // 20% radius: default for central risk
    const data = imageData.data;
    let centerSum = 0, peripherySum = 0;
    const quadrants = [0, 0, 0, 0];
    let centerPixels = 0, peripheryPixels = 0;
    const halfW = width / 2, halfH = height / 2;
    const quadrantCounts = [0, 0, 0, 0];
    // TASK 26: Removal of validation as Uint8ClmapedArray wil be numeric so no point it validation in hot path
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            let r = data[i],
                g = data[i + 1],
                b = data[i + 2];

            const brightness = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;

            const dx = x - halfW, dy = y - halfH;
            const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);

            if (distanceFromCenter < centerRadius) {
                centerSum += brightness;
                centerPixels++;
            } else {
                peripherySum += brightness;
                peripheryPixels++;
            }

            // Quadrant index: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
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