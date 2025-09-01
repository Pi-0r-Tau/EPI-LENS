"use strict";

if (!window.CanvasPool) {
    class CanvasPool {
        constructor() {
            this.maxPoolSize = 10;
            this.sizeBuckets = new Map();
            this._count = 0; // no. of canvases currently in the pool
        }

        getSizeBucket(width, height) {
            return `${width}x${height}`;
        }

        get(width, height) {
            const key = this.getSizeBucket(width, height);
            const bucket = this.sizeBuckets.get(key);

            if (bucket && bucket.length) {
                this._count--;
                return bucket.pop();
            }

            return this.createCanvas(width, height);
        }

        createCanvas(width, height) {
            if (typeof OffscreenCanvas !== "undefined") {
                return new OffscreenCanvas(width, height);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }

        release(canvas) {
            if (!canvas) return;
            if (this._count >= this.maxPoolSize) return;

            const ctx = canvas.getContext("2d");
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

            const key = this.getSizeBucket(canvas.width, canvas.height);
            if (!this.sizeBuckets.has(key)) this.sizeBuckets.set(key, []);
            this.sizeBuckets.get(key).push(canvas);
            this._count++;
        }

        clear() {
            this.sizeBuckets.clear();
            this._count = 0;
        }

        // DEBUG
        //  getStats() {
        //      return {
        //          poolSize: this._count,
        //          buckets: Array.from(this.sizeBuckets.entries()).map(([bucket, arr]) => ({
        //              bucket,
        //              count: arr.length
        //          }))
        //      };
        //   }
    }

    window.CanvasPool = CanvasPool;
}