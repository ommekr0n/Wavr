import * as THREE from 'three';

/** Same 60vh record, 35vh cover and centered position as the Angelic CSS vinyl. */
export class ThreeAngelicVinyl {
    constructor(textures, invalidate = () => {}) {
        this.textures = textures;
        this.invalidate = invalidate;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000); this.camera.position.z = 1000;
        this.scene.add(new THREE.AmbientLight(0xffffff, 2));
        const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(-200, 300, 500); this.scene.add(light);
        this.record = new THREE.Group(); this.scene.add(this.record);
        const material = new THREE.MeshStandardMaterial({ color: 0x101010, metalness: 0.6, roughness: 0.32, transparent: true, opacity: 0.25 });
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.005, 96), material);
        disc.rotation.x = Math.PI / 2; this.record.add(disc);
        const grooves = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.06 });
        this.grooves = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.002, 3, 64), grooves, 34);
        const ring = new THREE.Object3D(); ring.position.z = 0.003;
        for (let i = 0; i < 34; i++) {
            ring.scale.setScalar(0.184 + i * 0.0032); ring.updateMatrix(); this.grooves.setMatrixAt(i, ring.matrix);
        }
        this.record.add(this.grooves);
        this.coverMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.25, toneMapped: false });
        this.cover = new THREE.Mesh(new THREE.CircleGeometry(0.175, 80), this.coverMaterial); this.cover.position.z = 0.004; this.record.add(this.cover);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.01, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        hole.position.z = 0.006; this.record.add(hole);
        this.image = document.getElementById('angelic-vinyl-art');
        this.original = document.getElementById('angelic-vinyl-container');
        this.observer = new MutationObserver(() => this.syncCover());
        this.observer.observe(this.image, { attributes: true, attributeFilter: ['src'] });
        this.syncCover();
    }

    syncCover() {
        const url = this.image.src;
        if (url === this.url) return;
        if (this.url) this.textures.release(this.url);
        this.url = url; this.texture = this.textures.acquire(url);
        this.coverMaterial.map = this.texture?.texture || null; this.coverMaterial.needsUpdate = true;
        this.invalidate();
    }

    resize(width, height) {
        this.camera.left = -width / 2; this.camera.right = width / 2; this.camera.top = height / 2; this.camera.bottom = -height / 2;
        this.camera.updateProjectionMatrix(); this.record.scale.setScalar(height);
    }

    update(dt, playing, reducedMotion) {
        const ready = Boolean(this.texture?.ready);
        this.record.visible = ready;
        this.original.classList.toggle('three-vinyl-ready', ready);
        if (playing && !reducedMotion) this.record.rotation.z -= dt * Math.PI * 2 / 15;
    }

    dispose() {
        this.original.classList.remove('three-vinyl-ready');
        this.observer.disconnect(); if (this.url) this.textures.release(this.url);
        const geometries = new Set(), materials = new Set();
        this.scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
        geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
        this.grooves.dispose();
    }
}
