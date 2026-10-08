import * as THREE from 'three';
import { tearVertex, tearFragment } from './RealityTearShader.js';
import { sampleTearOpening } from '../../../features/player/RealityTearTiming.js';
import { pinSleeveForTear } from './RealityTearSleeveAnchor.js';

/** Distorts the live Atelier + sleeve render using the existing context and scheduler. */
export class RealityTearRenderEffect {
    constructor(owner, signal) {
        this.owner = owner; this.active = false; this.disposed = false; this.capturing = false;
        this.motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
        this.target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
        this.uniforms = { uScene: { value: this.target.texture }, uResolution: { value: new THREE.Vector2(1, 1) },
            uCenter: { value: new THREE.Vector2() }, uHorizontal: { value: 0 }, uAmplitude: { value: 1 },
            uGap: { value: 0 }, uAngle: { value: 0 }, uOpening: { value: 0 }, uPixelTime: { value: 0 } };
        this.geometry = new THREE.PlaneGeometry(2, 2); this.scene = new THREE.Scene(); this.camera = new THREE.Camera();
        this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: tearVertex, fragmentShader: tearFragment,
            depthTest: false, depthWrite: false, toneMapped: false });
        this.scene.add(new THREE.Mesh(this.geometry, this.material));
        this.listener = event => this.setIntro(event.detail);
        document.addEventListener('wavr:artistintro', this.listener, { signal });
        const warm = () => {
            if (this.disposed) return;
            owner.renderer.initRenderTarget(this.target);
            Promise.resolve(owner.renderer.compileAsync(this.scene, this.camera)).catch(() => {});
        };
        if (globalThis.requestIdleCallback) {
            this.idle = requestIdleCallback(warm, { timeout: 1200 }); this.cancelWarm = () => cancelIdleCallback(this.idle);
        } else { this.idle = setTimeout(warm, 100); this.cancelWarm = () => clearTimeout(this.idle); }
    }
    setIntro(detail) {
        if (this.disposed) return;
        this.cancel();
        if (detail?.active && detail.field && !(this.motionQuery?.matches ?? this.owner.reducedMotion) && this.owner.enabled) {
            this.owner.syncMode();
            if (this.owner.mode === 'player') {
                const f = detail.field;
                pinSleeveForTear(this.owner.sleeve, f.artwork);
                this.start = detail.start; this.duration = detail.duration;
                this.uniforms.uCenter.value.set(f.cx, f.cy);
                this.uniforms.uHorizontal.value = f.horizontal ? 1 : 0;
                this.uniforms.uAmplitude.value = f.amplitude;
                this.uniforms.uGap.value = f.gap; this.uniforms.uAngle.value = f.angle * Math.PI / 180;
                this.active = true;
            }
        }
        this.owner.syncLoop();
    }
    resize(width, height) {
        const scale = Math.min(this.owner.renderer.getPixelRatio(), Math.sqrt(1200000 / (width * height)));
        this.target.setSize(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)));
        this.uniforms.uResolution.value.set(width, height);
    }
    beginFrame(renderer, now) {
        if (!this.active || (this.motionQuery?.matches ?? this.owner.reducedMotion) || this.owner.mode !== 'player') return;
        const progress = (now - this.start) / this.duration;
        if (progress >= 1) { this.cancel(); return; }
        this.uniforms.uOpening.value = sampleTearOpening(progress);
        this.uniforms.uPixelTime.value = Math.max(0, (now - this.start) / 1000);
        this.previous = renderer.getRenderTarget(); this.capturing = true;
        renderer.setRenderTarget(this.target);
    }
    endFrame(renderer) {
        if (!this.capturing) return;
        this.capturing = false;
        renderer.setRenderTarget(this.previous);
        const autoClear = renderer.autoClear; renderer.autoClear = true;
        renderer.render(this.scene, this.camera); renderer.autoClear = autoClear;
    }
    cancel() { this.active = false; pinSleeveForTear(this.owner.sleeve, null); }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.cancelWarm(); this.cancel();
        document.removeEventListener('wavr:artistintro', this.listener);
        this.geometry.dispose(); this.material.dispose(); this.target.dispose();
    }
}
