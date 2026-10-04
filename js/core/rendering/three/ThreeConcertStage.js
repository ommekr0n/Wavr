import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ThreeConcertLights } from './ThreeConcertLights.js';
import { ThreeStageSmoke } from './ThreeStageSmoke.js';
import { ThreeFlameJets } from './ThreeFlameJets.js';

/** Four LED columns retain Wavr's established Cinematic positions and proportions. */
export class ThreeConcertStage {
    constructor() {
        this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x000000);
        this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80); this.camera.position.z = 12;
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        const light = new THREE.PointLight(0xffffff, 35); light.position.set(0, 4, 8); this.scene.add(light);
        this.geometry = new RoundedBoxGeometry(1, 1, 0.12, 2, 0.04);
        this.ghosts = new THREE.InstancedMesh(this.geometry, new THREE.MeshBasicMaterial({ color: 0x17171c }), 60);
        this.blocks = new THREE.InstancedMesh(this.geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.28, emissive: 0x222222, emissiveIntensity: 0.3 }), 60);
        this.blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.ghosts, this.blocks);
        this.dummy = new THREE.Object3D(); this.levels = new Float32Array(4);
        this.lights = new ThreeConcertLights(this.scene); this.smoke = new ThreeStageSmoke(this.scene);
        this.fire = new ThreeFlameJets(this.scene);
    }

    resize(width, height) {
        this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
        this.height = 2 * Math.tan(THREE.MathUtils.degToRad(24)) * 12;
        this.width = this.height * width / height;
        this.blockHeight = this.height * 0.055; this.step = this.height * 0.067;
        this.fire.resize(this.width, this.height, height);
        for (let pillar = 0; pillar < 4; pillar++) {
            for (let block = 0; block < 15; block++) {
                this.placeBlock(pillar, block, 1);
                this.ghosts.setMatrixAt(pillar * 15 + block, this.dummy.matrix);
            }
        }
        this.ghosts.instanceMatrix.needsUpdate = true;
    }

    placeBlock(pillar, block, size) {
        this.dummy.position.set((pillar - 1.5) * this.width * 0.22, -this.height / 2 + this.blockHeight / 2 + block * this.step, 0);
        this.dummy.scale.set(this.width * 0.18 * size, this.blockHeight * size, size);
        this.dummy.updateMatrix();
    }

    update(dt, t, state, colors, reducedMotion) {
        const bins = state.data;
        const bucketSize = bins ? Math.max(1, Math.floor(bins.length * 0.75 / 4)) : 1;
        for (let pillar = 0; pillar < 4; pillar++) {
            let sum = 0;
            if (bins && state.playing) for (let j = 0; j < bucketSize; j++) sum += bins[pillar * bucketSize + j] || 0;
            const raw = sum / bucketSize / 255;
            this.levels[pillar] = THREE.MathUtils.damp(this.levels[pillar], raw, raw > this.levels[pillar] ? 18 : 7, dt);
            const count = Math.floor(this.levels[pillar] * 14);
            for (let block = 0; block < 15; block++) {
                const lit = block < count;
                this.placeBlock(pillar, block, lit ? 1 : 0);
                this.blocks.setMatrixAt(pillar * 15 + block, this.dummy.matrix);
                this.blocks.setColorAt(pillar * 15 + block, colors[pillar]);
            }
        }
        this.blocks.instanceMatrix.needsUpdate = true;
        if (this.blocks.instanceColor) this.blocks.instanceColor.needsUpdate = true;
        this.lights.update(t, this.width, this.height, state.intensity, colors, reducedMotion);
        this.smoke.update(dt, t, this.width, this.height, state.energy, colors, reducedMotion);
        this.fire.update(t, state, reducedMotion);
        this.camera.position.x = reducedMotion ? 0 : Math.sin(t * 41) * state.intensity * 0.007;
        this.camera.position.y = reducedMotion ? 0 : Math.cos(t * 37) * state.intensity * 0.005;
        this.camera.lookAt(0, 0, 0);
        const dim = document.getElementById('reactive-dim');
        if (dim) dim.style.opacity = state.playing ? Math.max(0.05, 0.55 - state.intensity ** 2 * 1.2) : 0;
    }

    dispose() {
        this.lights.dispose(); this.smoke.dispose(); this.fire.dispose(); this.geometry.dispose(); this.blocks.material.dispose(); this.ghosts.material.dispose();
        this.blocks.dispose(); this.ghosts.dispose();
    }
}
