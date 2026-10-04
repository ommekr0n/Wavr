import * as THREE from 'three';
import { flameJetProfile } from './FlameJetProfile.js';
import { flameEmberVertexShader, flameEmberFragmentShader } from './FlameEmberShaders.js';

/** Fixed GPU ember pool; flight and lifetime are evaluated in the vertex shader. */
export class ThreeFlameSparks {
    constructor(scene) {
        const count = flameJetProfile.sparkCount, seeds = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
            seeds.set([i % 2 ? 1 : -1, (i * 0.618034) % 1, (i * 0.754878) % 1, (i * 0.569841) % 1], i * 4);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
        this.material = new THREE.ShaderMaterial({
            uniforms: { uAge: { value: 10 }, uStrength: { value: 0 }, uWidth: { value: 1 }, uHeight: { value: 1 }, uColumnWidth: { value: 1 }, uPixelScale: { value: 1 } },
            vertexShader: flameEmberVertexShader,
            fragmentShader: flameEmberFragmentShader,
            transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
        });
        this.mesh = new THREE.Points(geometry, this.material);
        this.mesh.frustumCulled = false; this.mesh.renderOrder = 50; this.mesh.visible = false;
        scene.add(this.mesh);
    }

    resize(width, height, pixelHeight) {
        this.material.uniforms.uWidth.value = width; this.material.uniforms.uHeight.value = height;
        this.material.uniforms.uColumnWidth.value = Math.min(width * flameJetProfile.portraitSpread, height * flameJetProfile.spread);
        this.material.uniforms.uPixelScale.value = pixelHeight / (2 * Math.tan(THREE.MathUtils.degToRad(24)));
    }

    update(burst, reducedMotion) {
        this.mesh.visible = burst.sparks && !reducedMotion;
        this.material.uniforms.uAge.value = burst.age;
        this.material.uniforms.uStrength.value = burst.strength;
    }

    dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.material.dispose(); }
}
