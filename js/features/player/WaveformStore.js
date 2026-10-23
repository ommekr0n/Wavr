import { WAVEFORM_BARS } from './WaveformLoader.js';

// Gateway paths include the owner's ID and an immutable uploaded filename. Other URLs retain their query.
export function waveformSourceKey(source) {
    try {
        const url = new URL(source);
        if (url.pathname.startsWith('/v1/media/') && url.searchParams.has('signature') && url.searchParams.has('expires')) {
            url.searchParams.delete('signature'); url.searchParams.delete('expires');
        }
        return url.href;
    } catch { return source; }
}

export function validWaveform(points) {
    return Array.isArray(points) && points.length === WAVEFORM_BARS && points.every(value => Number.isFinite(value) && value >= 0 && value <= 1);
}

function finishTransaction(transaction) {
    return new Promise(resolve => {
        const timer = setTimeout(() => { try { transaction.abort(); } catch {} resolve(); }, 500);
        transaction.oncomplete = transaction.onerror = transaction.onabort = () => { clearTimeout(timer); resolve(); };
    });
}

/** Small derived peaks only; no audio, titles or signed access URLs are stored. Storage is optional. */
export class WaveformStore {
    constructor({ storage = globalThis.indexedDB, crypto = globalThis.crypto, maxEntries = 128, database = 'wavr_waveforms_v1' } = {}) {
        Object.assign(this, { storage, crypto, maxEntries, database }); this.opening = null; this.version = 0;
    }
    async key(source) {
        if (!this.crypto?.subtle) return null;
        const bytes = new TextEncoder().encode(waveformSourceKey(source));
        const hash = new Uint8Array(await this.crypto.subtle.digest('SHA-256', bytes));
        return [...hash].map(value => value.toString(16).padStart(2, '0')).join('');
    }
    open() {
        if (!this.storage) return Promise.resolve(null);
        if (!this.opening) this.opening = new Promise(resolve => {
            let finished = false;
            const finish = db => { if (finished) { db?.close(); return; } finished = true; clearTimeout(timer); resolve(db); };
            const timer = setTimeout(() => finish(null), 1000);
            try {
                const request = this.storage.open(this.database, 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains('peaks')) db.createObjectStore('peaks', { keyPath: 'key' });
                };
                request.onsuccess = () => {
                    request.result.onversionchange = () => { request.result.close(); this.opening = null; };
                    finish(request.result);
                };
                request.onerror = request.onblocked = () => finish(null);
            } catch { finish(null); }
        }).then(db => { if (!db) this.opening = null; return db; });
        return this.opening;
    }
    async get(source) {
        if (!this.storage) return null;
        try {
            const [db, key] = await Promise.all([this.open(), this.key(source)]);
            if (!db || !key) return null;
            return await new Promise(resolve => {
                const timer = setTimeout(() => resolve(null), 150);
                const request = db.transaction('peaks', 'readonly').objectStore('peaks').get(key);
                const finish = value => { clearTimeout(timer); resolve(value); };
                request.onsuccess = () => finish(validWaveform(request.result?.points) ? request.result.points : null);
                request.onerror = () => finish(null);
            });
        } catch { return null; }
    }
    async put(source, points) {
        if (!this.storage) return;
        const version = this.version;
        try {
            const [db, key] = await Promise.all([this.open(), this.key(source)]);
            if (version !== this.version || !db || !key || !validWaveform(points)) return;
            const transaction = db.transaction('peaks', 'readwrite'), store = transaction.objectStore('peaks');
            store.put({ key, points, used: Date.now() });
            const request = store.getAll();
            request.onsuccess = () => {
                const oldest = request.result.sort((a, b) => a.used - b.used);
                for (const entry of oldest.slice(0, Math.max(0, oldest.length - this.maxEntries))) store.delete(entry.key);
            };
            await finishTransaction(transaction);
        } catch { /* Private mode, quota and disabled storage must not affect playback. */ }
    }
    async clear() {
        this.version++;
        try {
            const db = await this.open();
            if (!db) return;
            const transaction = db.transaction('peaks', 'readwrite'); transaction.objectStore('peaks').clear();
            await finishTransaction(transaction);
        } catch { /* Optional cache. */ }
    }
}
