import { LyricTransitionStats } from '../../../features/lyrics/LyricTransitionStats.js';

/** Development-only sampling; one DOM snapshot per second for performance checks. */
export class RenderFrameStats {
    constructor(canvas, { enabled = import.meta.env?.DEV || new URLSearchParams(globalThis.location?.search).has('perf'), createLyricStats = canvas => new LyricTransitionStats(canvas) } = {}) {
        this.canvas = canvas;
        this.enabled = enabled;
        this.lyrics = this.enabled ? createLyricStats(canvas) : null;
        this.resetSampling();
    }

    resetSampling(now = performance.now()) {
        this.started = now;
        this.lastFrame = 0; this.frames = 0; this.cpu = 0;
        this.calls = 0; this.triangles = 0; this.gaps = [];
        this.lyrics?.resetSampling();
        delete this.canvas.dataset.frameStats;
    }

    inspectContext(renderer) {
        if (!this.enabled) return;
        const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
        if (extension) this.canvas.dataset.gpuRenderer = gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
    }

    record(now, cpu, info, mode, burst) {
        if (!this.enabled) return;
        this.lyrics.record(now);
        if (this.lastFrame) this.gaps.push(now - this.lastFrame);
        this.lastFrame = now; this.frames++; this.cpu += cpu;
        this.calls += info.render.calls; this.triangles += info.render.triangles;
        const elapsed = now - this.started;
        if (elapsed < 1000) return;
        const sorted = this.gaps.slice().sort((a, b) => a - b);
        this.canvas.dataset.frameStats = JSON.stringify({
            mode, fps: +(this.frames * 1000 / elapsed).toFixed(1),
            cpuMs: +(this.cpu / this.frames).toFixed(2),
            p95GapMs: +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(1),
            drawCalls: Math.round(this.calls / this.frames), triangles: Math.round(this.triangles / this.frames),
            buffer: `${this.canvas.width}x${this.canvas.height}`,
            ...(burst ? { fire: { level: +burst.level.toFixed(2), age: +burst.age.toFixed(2), sparks: burst.sparks } } : {})
        });
        this.started = now; this.frames = 0; this.cpu = 0;
        this.calls = 0; this.triangles = 0; this.gaps.length = 0;
    }

    dispose() { this.lyrics?.dispose(); delete this.canvas.dataset.frameStats; delete this.canvas.dataset.gpuRenderer; }
}
