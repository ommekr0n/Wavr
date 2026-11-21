import * as THREE from 'three';
import { loadImageForColorExtraction } from '../../../modules/color-extractor.js';
import { resizeArtwork, resizeArtworkOnMain, artworkResizePlan } from './ArtworkResizer.js';

/** Reference-counted album texture ownership across views. */
export class ThreeTextureCache {
    constructor(onLoad, { load = loadImageForColorExtraction, maxDimension = 2048, anisotropy = 4, resize = resizeArtwork } = {}) {
        this.entries = new Map();
        this.onLoad = onLoad;
        this.disposed = false;
        this.load = load; this.maxDimension = maxDimension; this.anisotropy = anisotropy; this.resize = resize;
    }

    acquire(url) {
        if (!url) return null;
        let entry = this.entries.get(url);
        if (!entry) {
            entry = { texture: new THREE.Texture(), ready: false, failed: false, refs: 0, abort: new AbortController() };
            this.entries.set(url, entry);
            this.load(url, { signal: entry.abort.signal }).then(async image => {
                if (this.disposed || this.entries.get(url) !== entry) return;
                const resized = await this.resize(image, this.maxDimension, { signal: entry.abort.signal });
                if (this.disposed || this.entries.get(url) !== entry) { resized.close?.(); return; }
                entry.texture.image = resized; entry.texture.needsUpdate = true;
                entry.ready = true;
                this.onLoad?.();
            }).catch(() => {
                if (this.disposed || this.entries.get(url) !== entry) return;
                entry.failed = true;
                this.onLoad?.();
            });
            entry.texture.colorSpace = THREE.SRGBColorSpace;
            entry.texture.anisotropy = this.anisotropy;
        }
        entry.refs++;
        return entry;
    }

    release(url) {
        const entry = this.entries.get(url);
        if (!entry) return;
        if (--entry.refs <= 0) {
            entry.abort.abort(); entry.texture.image?.close?.();
            entry.texture.dispose();
            this.entries.delete(url);
        }
    }

    dispose() {
        this.disposed = true;
        this.entries.forEach(entry => { entry.abort.abort(); entry.texture.image?.close?.(); entry.texture.dispose(); });
        this.entries.clear();
    }
}

/** Avoid uploading full camera-resolution cover art during a view change. */
export function resizeTextureImage(image, maxDimension) {
    const plan = artworkResizePlan(image, maxDimension);
    return plan.width === plan.crop[2] && plan.height === plan.crop[3] ? image : resizeArtworkOnMain(image, plan);
}
