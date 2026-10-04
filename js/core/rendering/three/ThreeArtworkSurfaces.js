import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Projects the existing cover rectangles into WebGL without changing layout. */
export class ThreeArtworkSurfaces {
    constructor(textures, invalidate = () => {}) {
        this.textures = textures;
        this.invalidate = invalidate;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
        this.camera.position.z = 1000;
        this.scene.add(new THREE.AmbientLight(0xffffff, 2.3));
        const light = new THREE.DirectionalLight(0xccefff, 2);
        light.position.set(-300, 400, 800);
        this.scene.add(light);
        this.geometry = new RoundedBoxGeometry(1, 1, 0.035, 2, 0.04);
        const groups = this.geometry.groups.slice();
        this.geometry.clearGroups();
        this.geometry.addGroup(0, groups.slice(0, 4).reduce((sum, group) => sum + group.count, 0), 0);
        this.geometry.addGroup(groups[4].start, groups[4].count, 1);
        this.geometry.addGroup(groups[5].start, groups[5].count, 0);
        this.entries = [];
        this.dirty = true;
        this.mode = null;
        this.followLayoutUntil = 0;
        this.animating = false;
        this.pointer = { x: -10000, y: -10000 };
        this.observer = new MutationObserver(() => this.markDirty());
    }

    setMode(mode) {
        if (mode === this.mode) return;
        this.clear();
        this.mode = mode;
        this.root = document.querySelector(mode === 'player' ? '.am-art-container' : '#home-song-grid');
        if (this.root) this.observer.observe(this.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'style'] });
        this.dirty = true;
    }

    resize(width, height) {
        this.width = width; this.height = height;
        this.camera.left = -width / 2; this.camera.right = width / 2;
        this.camera.top = height / 2; this.camera.bottom = -height / 2;
        this.camera.updateProjectionMatrix();
        this.dirty = true;
    }

    followLayout(target) {
        if (this.root && (this.root.contains(target) || target.contains(this.root))) {
            this.followLayoutUntil = performance.now() + 1000;
            this.invalidate();
        }
    }

    markDirty() { this.dirty = true; this.invalidate(); }

    sync() {
        if (!this.dirty || !this.root) return;
        this.dirty = false;
        const selector = this.mode === 'player' ? '#cover-art' : '.song-card-inner > img, .song-cover-wrapper > img, .peeking-sleeve';
        const nodes = new Set(this.root.querySelectorAll(selector));
        this.entries = this.entries.filter(entry => {
            if (nodes.has(entry.node)) return true;
            this.remove(entry); return false;
        });
        for (const node of nodes) {
            const url = node.src || node.currentSrc || node.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
            if (!url) continue;
            let entry = this.entries.find(item => item.node === node);
            if (entry && entry.url !== url) { this.remove(entry); this.entries.splice(this.entries.indexOf(entry), 1); entry = null; }
            if (!entry) {
                const texture = this.textures.acquire(url);
                const face = new THREE.MeshBasicMaterial({ map: texture.texture, toneMapped: false });
                const side = new THREE.MeshStandardMaterial({ color: 0x17171b, metalness: 0.3, roughness: 0.35 });
                const mesh = new THREE.Mesh(this.geometry, [side, face]);
                this.scene.add(mesh);
                entry = { node, url, texture, mesh, face, side, rect: null };
                this.entries.push(entry);
            }
            entry.rect = node.getBoundingClientRect();
        }
    }

    update(dt, reducedMotion) {
        if (performance.now() < this.followLayoutUntil) this.dirty = true;
        this.animating = performance.now() < this.followLayoutUntil;
        this.sync();
        for (const entry of this.entries) {
            const r = entry.rect;
            const visible = r?.width > 0 && r.bottom > 0 && r.top < this.height && entry.texture.ready;
            entry.mesh.visible = visible;
            entry.node.classList.toggle('three-surface-ready', visible);
            if (!visible) continue;
            const isSleeve = entry.node.classList.contains('peeking-sleeve');
            const index = isSleeve ? Number(entry.node.className.match(/sleeve-(\d)/)?.[1] || 0) : 0;
            const hover = !reducedMotion && this.pointer.x >= r.left && this.pointer.x <= r.right && this.pointer.y >= r.top && this.pointer.y <= r.bottom;
            const rx = hover ? (this.pointer.y - r.top - r.height / 2) / r.height * 0.15 : 0;
            const ry = hover ? (this.pointer.x - r.left - r.width / 2) / r.width * 0.18 : isSleeve ? -0.07 : 0;
            entry.mesh.position.set(r.left + r.width / 2 - this.width / 2, this.height / 2 - r.top - r.height / 2, isSleeve ? 20 - index * 7 : 40);
            entry.mesh.scale.set(r.width, r.height, Math.min(r.width, r.height));
            entry.mesh.rotation.x = THREE.MathUtils.damp(entry.mesh.rotation.x, rx, 8, dt);
            entry.mesh.rotation.y = THREE.MathUtils.damp(entry.mesh.rotation.y, ry, 8, dt);
            if (Math.abs(entry.mesh.rotation.x - rx) + Math.abs(entry.mesh.rotation.y - ry) > 0.0005) this.animating = true;
            else { entry.mesh.rotation.x = rx; entry.mesh.rotation.y = ry; }
            entry.face.color.setScalar(isSleeve ? 1 - index * 0.12 : 1);
        }
    }

    remove(entry) {
        entry.node.classList.remove('three-surface-ready');
        this.scene.remove(entry.mesh); entry.face.dispose(); entry.side.dispose();
        this.textures.release(entry.url);
    }

    clear() {
        this.observer.disconnect(); this.entries.forEach(entry => this.remove(entry)); this.entries = [];
        this.animating = false; this.followLayoutUntil = 0;
    }

    dispose() { this.clear(); this.geometry.dispose(); }
}
