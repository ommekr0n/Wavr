/** One cancellable rAF, with steady pacing and no idle redraws. */
export class RenderScheduler {
    constructor(render, {
        raf = callback => requestAnimationFrame(callback),
        cancel = id => cancelAnimationFrame(id),
        onStateChange = () => {}
    } = {}) {
        this.render = render; this.raf = raf; this.cancel = cancel;
        this.onStateChange = onStateChange; this.state = null;
        this.running = false; this.continuous = false; this.pending = false;
        this.frame = null; this.nextFrame = 0;
        this.tick = now => {
            this.frame = null;
            if (!this.running) return;
            if (now + 0.5 < this.nextFrame) { this.queue(); return; }
            this.pending = false;
            const interval = 1000 / 60;
            this.nextFrame = this.nextFrame && now - this.nextFrame < interval * 2 ? this.nextFrame + interval : now + interval;
            this.render(now);
            if (this.continuous || this.pending) this.queue();
            else this.status('idle');
        };
    }

    status(value) {
        if (this.state === value) return;
        this.state = value; this.onStateChange(value);
    }
    queue() { if (this.running && this.frame === null) { this.status('active'); this.frame = this.raf(this.tick); } }
    requestFrame() { this.pending = true; this.queue(); }
    setContinuous(value) { this.continuous = value; if (value) this.queue(); }
    resume(continuous) { this.running = true; this.nextFrame = 0; this.setContinuous(continuous); this.requestFrame(); }
    stop() {
        this.running = false; this.continuous = false;
        if (this.frame !== null) this.cancel(this.frame);
        this.frame = null; this.nextFrame = 0; this.status('stopped');
    }
}
