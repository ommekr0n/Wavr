import * as THREE from 'three';
import { atelierVertex, atelierFragment } from './ChromaticAtelierShader.js';

/** A cached low-resolution color field composed through the existing GPU context. */
export class ThreeChromaticAtelier {
    constructor() {
        this.scene = new THREE.Scene(); this.camera = new THREE.Camera();
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.uniforms = { uTime: { value: 0 }, uEnergy: { value: 0 }, uAspect: { value: 1 },
            uColors: { value: [0xff2d55, 0x5856d6, 0xff9500, 0xaf52de].map(color => new THREE.Color(color)) } };
        this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: atelierVertex, fragmentShader: atelierFragment, depthTest: false, depthWrite: false });
        this.scene.add(new THREE.Mesh(this.geometry, this.material));
        this.target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
        this.displayScene = new THREE.Scene();
        this.displayMaterial = new THREE.MeshBasicMaterial({ map: this.target.texture, depthTest: false, depthWrite: false, toneMapped: false });
        this.displayScene.add(new THREE.Mesh(this.geometry, this.displayMaterial));
        this.dirty = true; this.settling = false; this.nextPaint = 0;
    }
    resize(width, height) {
        const scale = Math.min(.5, Math.sqrt(360000 / (width * height)));
        this.target.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
        this.uniforms.uAspect.value = width / height; this.dirty = true;
    }
    update(dt, state, colors, reducedMotion) {
        const mix = 1 - Math.exp(-dt * 2.5);
        this.settling = false;
        this.uniforms.uColors.value.forEach((color, i) => {
            const target = colors[i];
            if (Math.abs(color.r - target.r) + Math.abs(color.g - target.g) + Math.abs(color.b - target.b) > .002) {
                color.lerp(target, mix); this.settling = true; this.dirty = true;
            } else color.copy(target);
        });
        if (state.playing && !reducedMotion) { this.uniforms.uTime.value += dt; this.dirty = true; }
        const energy = state.playing && !reducedMotion ? Math.min(.8, state.energy || 0) : 0;
        const previous = this.uniforms.uEnergy.value;
        this.uniforms.uEnergy.value = THREE.MathUtils.damp(previous, energy, 3, dt);
        if (Math.abs(previous - energy) > .002) { this.dirty = true; this.settling = true; }
    }
    render(renderer, now) {
        if (this.dirty && now >= this.nextPaint) {
            const previous = renderer.getRenderTarget();
            renderer.setRenderTarget(this.target); renderer.render(this.scene, this.camera); renderer.setRenderTarget(previous);
            this.nextPaint = now + 1000 / 30; this.dirty = false;
        }
        renderer.render(this.displayScene, this.camera);
    }
    dispose() { this.geometry.dispose(); this.material.dispose(); this.displayMaterial.dispose(); this.target.dispose(); }
}
