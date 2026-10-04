/** Development-only frame gaps for lyric changes, separate from steady playback FPS. */
export class LyricTransitionStats {
    constructor(canvas) {
        this.canvas = canvas;
        this.samples = []; this.pending = null; this.lastFrame = 0;
        this.audio = document.getElementById('audio-player');
        this.seen = new WeakSet();
        this.observer = new MutationObserver(changes => {
            const targets = changes.flatMap(change => change.type === 'childList' ? Array.from(change.addedNodes) : [change.target]);
            for (const target of targets) {
                if (target.nodeType !== 1) continue;
                if (!target.matches('.angelic-enter-wrapper, .cinematic-line-wrapper.cine-enter') || this.seen.has(target)) continue;
                this.seen.add(target);
                if (this.audio.paused || document.hidden) continue;
                this.pending = {
                    mode: target.classList.contains('angelic-enter-wrapper') ? 'angelic' : 'cinematic',
                    text: target.querySelector('.angelic-line, .cinematic-line')?.textContent.replace(/\s+/g, ' ').trim(),
                    started: performance.now(), gaps: [],
                    buffer: `${canvas.width}x${canvas.height}`
                };
            }
        });
        for (const id of ['angelic-text-container', 'cinematic-text-container']) {
            const root = document.getElementById(id);
            if (root) this.observer.observe(root, { childList: true, attributes: true, attributeFilter: ['class'], subtree: true });
        }
    }

    record(now) {
        if (this.audio.paused || document.hidden) { this.pending = null; this.lastFrame = 0; return; }
        const gap = this.lastFrame ? now - this.lastFrame : 0;
        this.lastFrame = now;
        const sample = this.pending;
        if (!sample) return;
        if (this.audio.paused || document.hidden || sample.buffer !== `${this.canvas.width}x${this.canvas.height}`) { this.pending = null; return; }
        if (gap > 0) sample.gaps.push(gap);
        if (now - sample.started < 1200) return;
        const sorted = sample.gaps.slice().sort((a, b) => a - b);
        this.samples.push({
            mode: sample.mode, text: sample.text, buffer: sample.buffer,
            fps: +(sample.gaps.length * 1000 / (now - sample.started)).toFixed(1),
            p95GapMs: +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(1),
            maxGapMs: +(sorted.at(-1) || 0).toFixed(1)
        });
        if (this.samples.length > 12) this.samples.shift();
        this.canvas.dataset.lyricTransitionStats = JSON.stringify(this.samples);
        this.pending = null;
    }

    resetSampling() { this.pending = null; this.lastFrame = 0; }

    dispose() { this.observer.disconnect(); this.pending = null; delete this.canvas.dataset.lyricTransitionStats; }
}
