import * as THREE from 'three';
import { loadImageForColorExtraction } from '../../../modules/color-extractor.js';
import { resizeArtwork } from './ArtworkResizer.js';

export function libraryArtworkTier(pixels, preview = false) {
    return preview ? 256 : pixels > 512 ? 1024 : pixels > 200 ? 512 : 256;
}

/** Resized texture leases with a bounded inactive LRU; player textures stay separate. */
export class LibraryArtworkBudget {
    constructor(invalidate, { maxBytes = 64 * 1024 * 1024, maxInactive = 16, load = loadImageForColorExtraction, resize } = {}) {
        this.invalidate = invalidate;
        this.maxBytes = maxBytes; this.maxInactive = maxInactive;
        this.load = load;
        this.resize = resize || ((image, size, options) => resizeArtwork(image, size, { ...options, square: true }));
        this.entries = new Map(); this.bytes = 0; this.disposed = false;
    }

    acquire(url, size = 256) {
        const key = `${size}:${url}`;
        let entry = this.entries.get(key);
        if (!entry) {
            const texture = new THREE.Texture(); texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            const material = new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff, toneMapped: false });
            entry = { key, texture, material, ready: false, failed: false, refs: 0, used: 0, bytes: size * size * 4 * 4 / 3, abort: new AbortController() };
            this.entries.set(key, entry); this.bytes += entry.bytes;
            this.load(url, { signal: entry.abort.signal }).then(async image => {
                if (this.disposed || this.entries.get(key) !== entry) return;
                const resized = await this.resize(image, size, { signal: entry.abort.signal });
                if (this.disposed || this.entries.get(key) !== entry) { resized.close?.(); return; }
                texture.image = resized; texture.needsUpdate = true; entry.ready = true;
                this.invalidate();
            }).catch(() => {
                if (this.disposed || this.entries.get(key) !== entry) return;
                entry.failed = true; this.invalidate();
            });
        }
        entry.refs++; entry.used = performance.now(); this.trim();
        return entry;
    }

    release(entry) {
        if (!entry || this.entries.get(entry.key) !== entry || entry.refs <= 0) return;
        entry.refs--; entry.used = performance.now(); this.trim();
    }

    trim() {
        const inactive = [...this.entries.values()].filter(entry => !entry.refs).sort((a, b) => a.used - b.used);
        while (inactive.length && (this.bytes > this.maxBytes || inactive.length > this.maxInactive)) {
            const entry = inactive.shift(); this.destroy(entry); this.entries.delete(entry.key); this.bytes -= entry.bytes;
        }
    }

    destroy(entry) { entry.abort.abort(); entry.texture.image?.close?.(); entry.material.dispose(); entry.texture.dispose(); }
    dispose() { this.disposed = true; this.entries.forEach(entry => this.destroy(entry)); this.entries.clear(); this.bytes = 0; }
}
