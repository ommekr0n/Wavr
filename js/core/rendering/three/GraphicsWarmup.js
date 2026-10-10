/** Prepare one shader group per idle task, without waiting inside a view transition. */
export class GraphicsWarmup {
    constructor(jobs, {
        schedule = callback => globalThis.requestIdleCallback
            ? requestIdleCallback(callback) : setTimeout(callback, 100),
        cancel = id => globalThis.cancelIdleCallback ? cancelIdleCallback(id) : clearTimeout(id),
        canRun = () => true
    } = {}) {
        this.jobs = [...jobs]; this.schedule = schedule; this.cancel = cancel;
        this.canRun = canRun;
        this.disposed = false; this.paused = false; this.running = false; this.pending = null;
        this.queue();
    }

    queue() {
        if (this.disposed || this.paused || this.running || this.pending !== null || !this.jobs.length || !this.canRun()) return;
        this.pending = this.schedule(() => {
            this.pending = null;
            if (this.disposed || this.paused || !this.canRun()) return;
            this.running = true;
            Promise.resolve().then(async () => {
                // Visibility can change between the idle callback and this microtask.
                if (this.disposed || this.paused || !this.canRun()) return;
                try {
                    await this.jobs[0]();
                    this.jobs.shift();
                } catch {
                    // Context loss may interrupt compilation; keep that group for recovery.
                    // Other shader failures must not block later groups.
                    if (!this.disposed && !this.paused && this.canRun()) this.jobs.shift();
                }
            }).finally(() => { this.running = false; this.queue(); });
        });
    }

    pause() {
        this.paused = true;
        if (this.pending !== null) this.cancel(this.pending);
        this.pending = null;
    }

    resume() {
        if (this.disposed) return;
        this.paused = false; this.queue();
    }

    dispose() {
        this.disposed = true;
        this.pause(); this.jobs.length = 0;
    }
}
