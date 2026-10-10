import * as THREE from 'three';
import { LibraryModelResources } from './LibraryModelResources.js';
import { LibrarySleeveModel } from './LibrarySleeveModel.js';
import { LibraryCrateModel } from './LibraryCrateModel.js';
import { LibraryArtworkBudget, libraryArtworkTier } from './LibraryArtworkBudget.js';
import { LibraryObjectMotion } from './LibraryObjectMotion.js';
import { LibraryDragVisual } from './LibraryDragVisual.js';
import { LibrarySceneBindings } from '../../../features/library/LibrarySceneBindings.js';
import { syncLibraryVisualState } from '../../../features/library/LibraryVisualState.js';
import { recordLibraryRender } from './LibraryRenderDiagnostics.js';
import { libraryPointerKey } from './LibraryPointerFocus.js';

/** One on-demand collection scene serves both browsing and organizing. */
export class ThreeLibraryScene {
    constructor(_playerTextures, invalidate = () => {}) {
        this.invalidate = invalidate;
        this.resources = new LibraryModelResources();
        this.budget = new LibraryArtworkBudget(invalidate);
        this.drag = new LibraryDragVisual(this.resources, this.budget, invalidate);
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 2000); this.camera.position.z = 1000;
        this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
        const light = new THREE.DirectionalLight(0xffefdb, 2); light.position.set(-300, 400, 800); this.scene.add(light);
        this.scene.children.filter(object => object.isLight).forEach(object => object.layers.enableAll());
        this.entries = new Map(); this.pointer = { x: -10000, y: -10000 }; this.mode = null; this.animating = false;
        this.abort = new AbortController();
        document.addEventListener('wavr:librarydrag', event => {
            if (!this.bindings) return;
            const { source, ghost, end } = event.detail;
            if (end) this.drag.clear(); else this.drag.start(source, ghost);
            this.markDirty();
        }, { signal: this.abort.signal });
        document.addEventListener('pointerleave', () => { this.pointer.x = -10000; this.pointer.y = -10000; this.pointerKey = null; this.invalidate(); }, { signal: this.abort.signal });
    }

    setMode(mode) {
        if (this.mode === mode && this.bindings) { this.bindings.resume(); return; }
        this.clear(); this.mode = mode;
        const root = document.getElementById(mode === 'edit' ? 'edit-song-grid' : 'home-song-grid');
        if (root) {
            this.bindings = new LibrarySceneBindings(root, mode, this.invalidate); this.root = root;
            this.visualState = syncLibraryVisualState(root, mode);
        }
        this.invalidate();
    }

    resize(width, height) {
        this.width = width; this.height = height;
        this.camera.left = -width / 2; this.camera.right = width / 2; this.camera.top = height / 2; this.camera.bottom = -height / 2;
        this.camera.updateProjectionMatrix(); this.markDirty();
    }

    markDirty() { this.bindings?.markDirty(); this.invalidate(); }

    pointerChanged() {
        const next = libraryPointerKey(this.entries, this.pointer);
        const changed = next !== this.pointerKey; this.pointerKey = next;
        return changed || !!this.drag.model;
    }

    followLayout(target) {
        if (this.root && (this.root.contains(target) || target.contains(this.root))) { this.followLayoutUntil = performance.now() + 500; this.markDirty(); }
    }

    create(record) {
        const size = libraryArtworkTier(record.rect.width, record.crate);
        const leases = record.urls.map(url => this.budget.acquire(url, size));
        const model = record.crate ? new LibraryCrateModel(this.resources, leases, record.color) : new LibrarySleeveModel(this.resources, leases[0]);
        model.group.traverse(object => object.layers.set(record.tray ? 2 : 1));
        this.scene.add(model.group);
        return { record, signature: `${size}:${record.color}:${record.urls.join('|')}`, model, leases, motion: new LibraryObjectMotion() };
    }

    update(dt, reducedMotion) {
        this.frameStart = performance.now();
        if (!this.bindings) { this.animating = false; return; }
        this.animating = performance.now() < (this.followLayoutUntil || 0);
        if (this.animating) this.bindings.layoutDirty = true;
        this.bindings.sync();
        const visible = this.bindings.visibility.visible;
        for (const [key, entry] of this.entries) {
            const record = this.bindings.byKey.get(key);
            if (!record || !visible.has(record.anchor)) { this.remove(entry); this.entries.delete(key); }
        }
        const dragging = document.body.classList.contains('is-dragging-active');
        for (const anchor of visible) {
            const record = this.bindings.byAnchor.get(anchor);
            if (!record?.rect?.width) continue;
            const card = record.card;
            const signature = `${libraryArtworkTier(record.rect.width, record.crate)}:${record.color}:${record.urls.join('|')}`;
            let entry = this.entries.get(record.key);
            if (entry && entry.signature !== signature) { this.remove(entry); this.entries.delete(record.key); entry = null; }
            if (!entry) { entry = this.create(record); this.entries.set(record.key, entry); }
            if (entry.record.anchor !== record.anchor) entry.record.anchor.classList.remove('library-object-ready');
            entry.record = record;
            const r = record.rect, clip = record.clip;
            const inView = r.bottom > clip.top && r.top < clip.bottom && r.right > clip.left && r.left < clip.right;
            const isSource = card.classList.contains('dragging') || card.classList.contains('inner-dragging');
            const ready = entry.model.ready && inView;
            record.anchor.classList.toggle('library-object-ready', ready);
            entry.model.group.visible = ready && !isSource;
            const hover = !dragging && !reducedMotion && (card.contains(document.activeElement) || (this.pointer.x >= r.left && this.pointer.x <= r.right && this.pointer.y >= r.top && this.pointer.y <= r.bottom && this.pointer.y >= clip.top && this.pointer.x >= clip.left && this.pointer.x < clip.right && this.pointer.y < clip.bottom));
            const targeted = record.anchor.classList.contains('drag-over');
            entry.motion.update(dt, hover, targeted, reducedMotion);
            entry.model.update(entry.motion.hover, entry.motion.drop);
            const size = Math.min(r.width, r.height) * (record.crate ? 1 : .92);
            entry.model.group.position.set(r.left + r.width / 2 - this.width / 2, this.height / 2 - r.top - r.height / 2, 40);
            entry.model.group.scale.setScalar(size);
            if (inView && entry.motion.animating) this.animating = true;
        }
        this.drag.update(this.width, this.height, reducedMotion);
    }

    render(renderer) {
        renderer.setScissorTest(false); renderer.clear(); renderer.autoClear = false;
        const draw = (layer, clip) => {
            if (!clip || clip.right <= clip.left || clip.bottom <= clip.top) return;
            this.camera.layers.set(layer);
            renderer.setScissor(Math.floor(clip.left), Math.floor(this.height - clip.bottom), Math.ceil(clip.right - clip.left), Math.ceil(clip.bottom - clip.top));
            renderer.setScissorTest(true); renderer.render(this.scene, this.camera);
        };
        try {
            draw(1, this.bindings?.clip);
            const tray = [...this.entries.values()].find(entry => entry.record.tray);
            if (tray) draw(2, tray.record.clip);
            renderer.setScissorTest(false); this.camera.layers.set(0); this.drag.render(renderer, this.camera);
        } finally { renderer.setScissorTest(false); this.camera.layers.set(0); renderer.autoClear = true; }
        recordLibraryRender(renderer, this);
    }

    remove(entry) {
        entry.record.anchor.classList.remove('library-object-ready');
        this.scene.remove(entry.model.group); entry.model.dispose(); entry.leases.forEach(lease => this.budget.release(lease));
    }

    suspend() {
        // Keep only the current visible models for a fast return; DOM art covers the exit.
        this.bindings?.suspend(); this.drag.clear(); this.animating = false;
        this.entries.forEach(entry => entry.record.anchor.classList.remove('library-object-ready'));
    }

    clear() {
        this.bindings?.dispose(); this.bindings = null; this.root = null;
        this.visualState = null;
        this.drag.clear(); this.entries.forEach(entry => this.remove(entry)); this.entries.clear();
        this.animating = false; this.followLayoutUntil = 0; this.mode = null;
        this.pointerKey = null;
    }

    dispose() { this.clear(); this.abort.abort(); this.budget.dispose(); this.resources.dispose(); }
}
