import * as THREE from 'three';
import { createLivingSleeveDisc } from './LivingSleeveDisc.js';
import { createLivingSleeveBody } from './LivingSleeveBody.js';
import { LivingSleeveMotion } from './LivingSleeveMotion.js';

/** Physical sleeve, paper insert and record aligned to the accessible DOM artwork. */
export class ThreeLivingSleeve {
    constructor(textures, invalidate, pointer) {
        this.textures = textures; this.invalidate = invalidate; this.pointer = pointer;
        this.node = document.getElementById('cover-art'); this.root = this.node.closest('.am-art-container');
        this.view = document.getElementById('player-view');
        this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(35, 1, 10, 10000);
        this.scene.add(new THREE.AmbientLight(0xffffff, 1.45));
        const light = new THREE.DirectionalLight(0xfff4de, 2.6); light.position.set(-300, 400, 900); this.scene.add(light);
        this.group = new THREE.Group(); this.scene.add(this.group);
        this.body = createLivingSleeveBody(); this.face = this.body.face; this.group.add(this.body.group);
        this.disc = createLivingSleeveDisc(); this.group.add(this.disc.group);
        this.motion = new LivingSleeveMotion(this.group, this.disc);
        this.observer = new MutationObserver(() => { this.dirty = true; this.invalidate(); });
        this.resizeObserver = new ResizeObserver(() => { this.dirty = true; this.invalidate(); });
        this.active = false; this.entry = null; this.pending = null; this.dirty = true; this.animating = false; this.reveal = 0;
    }
    setActive(active) {
        this.active = active;
        if (active) {
            this.observer.observe(this.node, { attributes: true, attributeFilter: ['src'] });
            this.resizeObserver.observe(this.root.parentElement); this.dirty = true; this.reveal = 0;
        } else this.clear();
    }
    resize(width, height) {
        this.width = width; this.height = height; this.dirty = true;
        this.camera.aspect = width / height; this.camera.position.z = height / (2 * Math.tan(THREE.MathUtils.degToRad(17.5))); this.camera.updateProjectionMatrix();
    }
    sync() {
        if (!this.dirty) return;
        this.dirty = false;
        const rect = this.node.getBoundingClientRect(), view = this.view.getBoundingClientRect();
        this.rect = { x: rect.x - view.x, y: rect.y - view.y, width: rect.width, height: rect.height, left: rect.x - view.x, top: rect.y - view.y };
        const url = this.node.src;
        if (url !== (this.pending?.url || this.entry?.url)) {
            if (this.pending) this.textures.release(this.pending.url);
            this.pending = { url, resource: this.textures.acquire(url) };
            this.reveal = this.entry ? 1 : 0;
        }
    }
    update(dt, state, colors, reducedMotion) {
        if (!this.active) return;
        this.sync(); this.animating = false;
        if (this.pending?.resource.ready) {
            // A short withdrawal precedes the new sleeve's reveal. Rapid changes reuse the same meshes.
            this.reveal = reducedMotion ? 0 : Math.max(0, this.reveal - dt * 4);
            if (this.reveal <= 0) {
                if (this.entry) this.textures.release(this.entry.url);
                this.entry = this.pending; this.pending = null;
                this.face.map = this.entry.resource.texture; this.face.needsUpdate = true;
                this.disc.labelMaterial.map = this.entry.resource.texture; this.disc.labelMaterial.needsUpdate = true;
            }
        } else if (this.pending?.resource.failed) {
            if (this.entry) { this.textures.release(this.entry.url); this.entry = null; }
            this.textures.release(this.pending.url); this.pending = null;
        }
        const visible = Boolean(this.entry?.resource.ready && this.rect?.width > 0);
        this.group.visible = visible; this.root.classList.toggle('living-sleeve-ready', visible);
        if (!visible) return;
        if (!this.pending) this.reveal = reducedMotion ? 1 : Math.min(1, this.reveal + dt * 1.5);
        const ease = 1 - (1 - this.reveal) ** 3, r = this.rect;
        this.group.position.set(r.x + r.width / 2 - this.width / 2, this.height / 2 - r.y - r.height / 2 - (1 - ease) * 22, 0);
        this.group.scale.set(r.width, r.height, r.width);
        this.disc.group.position.set(.38 * ease, .15 * ease, 0);
        this.disc.group.scale.setScalar(.94); this.disc.material.uniforms.uColor.value.copy(colors[0]);
        this.face.opacity = .25 + ease * .75;
        const moving = this.motion.update(dt, state.playing, reducedMotion, r, this.pointer);
        this.animating = this.reveal < 1 || Boolean(this.pending?.resource.ready) || moving;
    }
    clear() {
        this.active = false; this.observer.disconnect(); this.resizeObserver.disconnect();
        for (const entry of [this.entry, this.pending]) if (entry) this.textures.release(entry.url);
        this.entry = this.pending = null; this.face.map = this.disc.labelMaterial.map = null;
        this.group.visible = false; this.root.classList.remove('living-sleeve-ready'); this.animating = false;
        this.motion.reset();
    }
    dispose() { this.clear(); this.body.dispose(); this.disc.dispose(); }
}
