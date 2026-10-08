import * as THREE from 'three';
import { loadImageForColorExtraction } from '../../../modules/color-extractor.js';

export function libraryArtworkTier(pixels, preview = false) {
    return preview ? 256 : pixels > 200 ? 512 : 256;
}

/** Resized texture leases with a bounded inactive LRU; player textures stay separate. */
export class LibraryArtworkBudget {
    constructor(invalidate, { maxBytes = 64 * 1024 * 1024, maxInactive = 16, load = loadImageForColorExtraction, resize } = {}) {
        this.invalidate = invalidate;
        this.maxBytes = maxBytes; this.maxInactive = maxInactive;
        this.load = load;
        this.resize = resize || ((image, size) => {
            const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
            const context = canvas.getContext('2d');
            const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
            const side = Math.min(w, h);
            context.drawImage(image, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
            return canvas;
        });
        this.entries = new Map(); this.bytes = 0; this.disposed = false;
    }

    acquire(url, size = 256) {
        const key = `${size}:${url}`;
        let entry = this.entries.get(key);
        if (!entry) {
            const texture = new THREE.Texture(); texture.colorSpace = THREE.SRGBColorSpace;
            const material = new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff, toneMapped: false });
            entry = { key, texture, material, ready: false, failed: false, refs: 0, used: 0, bytes: size * size * 4 * 4 / 3 };
            this.entries.set(key, entry); this.bytes += entry.bytes;
            this.load(url).then(image => {
                if (this.disposed || this.entries.get(key) !== entry) return;
                texture.image = this.resize(image, size); texture.needsUpdate = true; entry.ready = true;
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
            const entry = inactive.shift(); entry.material.dispose(); entry.texture.dispose(); this.entries.delete(entry.key); this.bytes -= entry.bytes;
        }
    }

    dispose() { this.disposed = true; this.entries.forEach(entry => { entry.material.dispose(); entry.texture.dispose(); }); this.entries.clear(); this.bytes = 0; }
}
