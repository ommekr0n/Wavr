import * as THREE from 'three';
import { loadImageForColorExtraction } from '../../../modules/color-extractor.js';

/** Reference-counted album texture ownership across views. */
export class ThreeTextureCache {
    constructor(onLoad, { load = loadImageForColorExtraction, maxDimension = 1024, resize = resizeTextureImage } = {}) {
        this.entries = new Map();
        this.onLoad = onLoad;
        this.disposed = false;
        this.load = load; this.maxDimension = maxDimension; this.resize = resize;
    }

    acquire(url) {
        if (!url) return null;
        let entry = this.entries.get(url);
        if (!entry) {
            entry = { texture: new THREE.Texture(), ready: false, failed: false, refs: 0 };
            this.entries.set(url, entry);
            this.load(url).then(image => {
                if (this.disposed || this.entries.get(url) !== entry) return;
                entry.texture.image = this.resize(image, this.maxDimension); entry.texture.needsUpdate = true;
                entry.ready = true;
                this.onLoad?.();
            }).catch(() => {
                if (this.disposed || this.entries.get(url) !== entry) return;
                entry.failed = true;
                this.onLoad?.();
            });
            entry.texture.colorSpace = THREE.SRGBColorSpace;
        }
        entry.refs++;
        return entry;
    }

    release(url) {
        const entry = this.entries.get(url);
        if (!entry) return;
        if (--entry.refs <= 0) {
            entry.texture.dispose();
            this.entries.delete(url);
        }
    }

    dispose() {
        this.disposed = true;
        this.entries.forEach(entry => entry.texture.dispose());
        this.entries.clear();
    }
}

/** Avoid uploading full camera-resolution cover art during a view change. */
export function resizeTextureImage(image, maxDimension) {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    if (scale === 1) return image;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
}
