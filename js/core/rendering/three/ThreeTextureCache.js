import * as THREE from 'three';
import { loadImageForColorExtraction } from '../../../modules/color-extractor.js';

/** Reference-counted album texture ownership across views. */
export class ThreeTextureCache {
    constructor(onLoad) {
        this.entries = new Map();
        this.onLoad = onLoad;
        this.disposed = false;
    }

    acquire(url) {
        if (!url) return null;
        let entry = this.entries.get(url);
        if (!entry) {
            entry = { texture: new THREE.Texture(), ready: false, failed: false, refs: 0 };
            this.entries.set(url, entry);
            loadImageForColorExtraction(url).then(image => {
                if (this.disposed || this.entries.get(url) !== entry) return;
                entry.texture.image = image; entry.texture.needsUpdate = true;
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
