export const WAVEFORM_BARS = 140;

export function sampleWaveform(channel) {
    const block = Math.max(1, Math.floor(channel.length / WAVEFORM_BARS));
    const step = Math.max(1, Math.floor(block / 24));
    let maximum = 0;
    const points = Array.from({ length: WAVEFORM_BARS }, (_, i) => {
        let peak = 0, sum = 0, count = 0;
        for (let j = i * block; j < Math.min(channel.length, (i + 1) * block); j += step) {
            const value = Math.abs(channel[j]);
            peak = Math.max(peak, value); sum += value * value; count++;
        }
        const value = peak * .75 + (count ? Math.sqrt(sum / count) : 0) * .25;
        maximum = Math.max(maximum, value);
        return value;
    });
    return points.map(value => maximum ? .1 + Math.pow(value / maximum, .75) * .9 : .12);
}

/** Latest selection wins; an uncancellable decoder owns the only processing slot until it finishes. */
export class WaveformLoader {
    constructor({ fetchAudio, decode, store, delay = 80, maxEntries = 30, onError = () => {},
        schedule = callback => setTimeout(callback, delay), cancel = handle => clearTimeout(handle) }) {
        Object.assign(this, { fetchAudio, decode, store, maxEntries, onError, schedule, cancel });
        this.cache = new Map(); this.active = null; this.pending = null; this.timer = null;
    }

    load(url) {
        if (this.pending?.url === url) return this.pending.promise;
        if (this.active?.url === url && !this.active.cancelled) return this.active.promise;
        this.cancelCurrent();
        if (!url) return Promise.resolve(null);
        if (this.cache.has(url)) {
            const points = this.cache.get(url); this.remember(url, points);
            return Promise.resolve(points);
        }
        const job = { url, controller: new AbortController(), cancelled: false, ready: false };
        job.promise = new Promise(resolve => { job.resolve = resolve; });
        this.pending = job;
        this.timer = this.schedule(() => { this.timer = null; job.ready = true; this.pump(); });
        return job.promise;
    }

    cancelCurrent() {
        if (this.timer !== null) this.cancel(this.timer);
        this.timer = null;
        for (const job of [this.pending, this.active]) {
            if (!job || job.cancelled) continue;
            job.cancelled = true; job.controller.abort(); job.resolve(null);
        }
        this.pending = null;
    }

    remember(url, points) {
        this.cache.delete(url); this.cache.set(url, points);
        if (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value);
    }

    pump() {
        if (this.active || !this.pending?.ready) return;
        const job = this.pending; this.pending = null; this.active = job;
        this.run(job).finally(() => { this.active = null; this.pump(); });
    }

    async run(job) {
        try {
            let points = await this.store?.get(job.url);
            if (job.cancelled) return;
            if (!points) {
                const buffer = await this.fetchAudio(job.url, job.controller.signal);
                if (job.cancelled) return;
                const audio = await this.decode(buffer);
                if (job.cancelled) return;
                points = sampleWaveform(audio.getChannelData(0));
                // Persist only completed real waveforms, never placeholders or failed decodes.
                this.store?.put(job.url, points)?.catch(() => {});
            }
            this.remember(job.url, points); job.resolve(points);
        } catch (error) {
            if (!job.cancelled) { this.onError(error); job.resolve(null); }
        }
    }

    clear() { this.cancelCurrent(); this.cache.clear(); return this.store?.clear(); }
}
