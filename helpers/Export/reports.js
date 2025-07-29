window.AnalyzerHelpers = window.AnalyzerHelpers || {};

window.AnalyzerHelpers.generateReport = function () {
    return {
        videoTitle: this.videoTitle || document.title,
        duration: document.querySelector("video")?.duration || 0,
        metrics: {
            totalFlashes: this.metrics.flashCount,
            riskLevel: this.metrics.riskLevel,
            framesAnalyzed: this.metrics.frameCount,
            averageFlashRate:
                this.metrics.flashCount / (this.metrics.frameCount / 60),
        },
        recommendations: this.generateRecommendations(),
        timeline: this.timelineData,
    };
};

window.AnalyzerHelpers.generateRecommendations = function () {
    const recommendations = [];
    const flashRate = this.metrics.flashCount / (this.metrics.frameCount / 60);
    if (flashRate > 3) {
        recommendations.push("Warning: High flash rate detected");
    }
    if (this.calculateAverageIntensity() > 0.5) {
        recommendations.push("Warning: High intensity flashes detected");
    }
    if (this.metrics.flashSequences.length > 5) {
        recommendations.push("Multiple flash sequences detected");
    }
    return recommendations.length
        ? recommendations
        : ["No significant issues detected"];
};
