export function artworkResizePlan(image, size, square = false) {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    if (square) {
        const side = Math.min(width, height);
        return { width: size, height: size, crop: [(width - side) / 2, (height - side) / 2, side, side] };
    }
    const scale = Math.min(1, size / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), crop: [0, 0, width, height] };
}

export function resizeArtworkOnMain(image, plan) {
    const canvas = document.createElement('canvas'); canvas.width = plan.width; canvas.height = plan.height;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(image, ...plan.crop, 0, 0, plan.width, plan.height);
    return canvas;
}

const aborted = () => new DOMException('Artwork no longer needed', 'AbortError');

/** One worker and one transferred source bitmap at a time, with cancellable queued work. */
export class ArtworkResizer {
    constructor({ workerFactory = () => new Worker(new URL('./ArtworkResizeWorker.js', import.meta.url), { type: 'module' }),
        bitmapFactory = image => createImageBitmap(image, { premultiplyAlpha: 'none' }),
        fallback = resizeArtworkOnMain,
        supported = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function',
        timeout = 5000 } = {}) {
        Object.assign(this, { workerFactory, bitmapFactory, fallback, supported, timeout });
        this.queue = []; this.active = null; this.worker = null; this.nextId = 0; this.disposed = false;
    }

    resize(image, size, { square = false, signal } = {}) {
        if (signal?.aborted || this.disposed) return Promise.reject(aborted());
        const plan = artworkResizePlan(image, size, square);
        if (!square && plan.width === plan.crop[2] && plan.height === plan.crop[3]) return image;
        // Tiny images cost less to resize locally than to transfer to a worker.
        if (!this.supported || plan.crop[2] * plan.crop[3] < 1024 * 1024) return this.fallback(image, plan);
        const promise = new Promise((resolve, reject) => {
            const job = { id: ++this.nextId, image, plan, signal, resolve, reject, cancelled: false };
            job.abort = () => {
                job.cancelled = true; job.reject(aborted());
                if (this.active !== job) { this.queue = this.queue.filter(item => item !== job); this.cleanup(job); }
            };
            signal?.addEventListener('abort', job.abort, { once: true });
            this.queue.push(job); this.pump();
        });
        return promise.catch(error => {
            if (signal?.aborted || this.disposed || error.name === 'AbortError') throw aborted();
            return this.fallback(image, plan);
        });
    }

    async pump() {
        if (this.active || this.disposed || !this.queue.length) return;
        const job = this.queue.shift(); this.active = job;
        try {
            if (!this.worker) {
                this.worker = this.workerFactory();
                this.worker.onmessage = event => this.complete(event.data);
                this.worker.onerror = this.worker.onmessageerror = () => this.failWorker();
            }
            // Cover bitmap preparation too; a stalled decoder cannot hold the queue forever.
            job.timer = setTimeout(() => this.failWorker(), this.timeout);
            const bitmap = await this.bitmapFactory(job.image);
            if (job.cancelled || this.active !== job || this.disposed) { bitmap.close(); this.finish(job); return; }
            try { this.worker.postMessage({ id: job.id, bitmap, ...job.plan }, [bitmap]); }
            catch (error) { bitmap.close(); throw error; }
        } catch (error) {
            if (!this.worker) this.failWorker();
            else { job.reject(error); this.finish(job); }
        }
    }

    complete({ id, bitmap, error }) {
        const job = this.active;
        if (!job || id !== job.id) { bitmap?.close(); return; }
        if (job.cancelled) bitmap?.close();
        else if (error) job.reject(new Error('Artwork resize failed'));
        else job.resolve(bitmap);
        this.finish(job);
    }
    cleanup(job) { clearTimeout(job.timer); job.signal?.removeEventListener('abort', job.abort); }
    finish(job) {
        this.cleanup(job);
        if (this.active !== job) return;
        this.active = null; this.pump();
    }
    failWorker() {
        this.supported = false; this.worker?.terminate(); this.worker = null;
        for (const job of [this.active, ...this.queue]) {
            if (!job) continue;
            this.cleanup(job); job.reject(new Error('Artwork worker unavailable'));
        }
        this.active = null; this.queue = [];
    }
    dispose() { this.disposed = true; this.failWorker(); }
}

let sharedResizer;
export function resizeArtwork(image, size, options) {
    if (!sharedResizer) {
        sharedResizer = new ArtworkResizer();
        globalThis.window?.addEventListener('pagehide', event => {
            if (!event.persisted) { sharedResizer?.dispose(); sharedResizer = null; }
        });
    }
    return sharedResizer.resize(image, size, options);
}
