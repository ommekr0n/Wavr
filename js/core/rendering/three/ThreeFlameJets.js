import * as THREE from 'three';
import { FlameBurstEnvelope } from './FlameBurstEnvelope.js';
import { createFlameJetMaterial } from './ThreeFlameJetMaterial.js';
import { ThreeFlameSparks } from './ThreeFlameSparks.js';
import { createFlameNoiseVolume } from './FlameNoiseVolume.js';
import { flameJetProfile, flameJetPressure } from './FlameJetProfile.js';

/** Two foreground stage jets, sharing geometry and a bounded ember pool. */
export class ThreeFlameJets {
    constructor(scene) {
        this.group = new THREE.Group(); this.group.renderOrder = 40; scene.add(this.group);
        this.envelope = new FlameBurstEnvelope();
        this.noise = createFlameNoiseVolume();
        this.geometry = new THREE.BoxGeometry(1, 1, 1); this.geometry.translate(0, 0.5, 0);
        this.jets = [-1, 1].map((side, index) => {
            const material = createFlameJetMaterial(this.noise); material.uniforms.uSeed.value = index * 17.3;
            const mesh = new THREE.Mesh(this.geometry, material);
            mesh.renderOrder = 40; mesh.visible = false; this.group.add(mesh);
            const light = new THREE.PointLight(0xff6a12, 0, 0, 2); this.group.add(light);
            return { side, mesh, light };
        });
        this.sparks = new ThreeFlameSparks(this.group);
    }

    resize(width, height, pixelHeight) {
        for (const jet of this.jets) {
            jet.mesh.position.set(jet.side * width * 0.35, -height * 0.47, 1.0);
            jet.mesh.scale.set(Math.min(width * flameJetProfile.portraitSpread, height * flameJetProfile.spread), height * flameJetProfile.height, height * flameJetProfile.depth);
            jet.mesh.updateMatrixWorld(true);
            jet.mesh.material.uniforms.uWorldToLocal.value.copy(jet.mesh.matrixWorld).invert();
            jet.light.position.set(jet.side * width * 0.35, -height * 0.3, 2.0);
            jet.light.distance = height * 0.8;
        }
        this.sparks.resize(width, height, pixelHeight);
    }

    update(time, state, reducedMotion) {
        const burst = this.envelope.update(time, state);
        const pressure = flameJetPressure(burst.age, reducedMotion);
        for (const jet of this.jets) {
            jet.mesh.visible = burst.sparks && burst.age < 2.3;
            jet.mesh.material.uniforms.uTime.value = reducedMotion ? 0 : time;
            jet.mesh.material.uniforms.uAge.value = burst.age;
            jet.mesh.material.uniforms.uBurst.value = burst.strength * pressure * (reducedMotion ? 0.65 : 1);
            jet.light.intensity = burst.level * flameJetProfile.illumination * (reducedMotion ? 0.65 : pressure);
        }
        this.sparks.update(burst, reducedMotion);
    }

    reset() {
        this.envelope.reset(); this.sparks.mesh.visible = false;
        for (const jet of this.jets) { jet.mesh.visible = false; jet.light.intensity = 0; }
    }

    dispose() {
        this.sparks.dispose(); this.geometry.dispose(); this.noise.dispose();
        for (const jet of this.jets) { jet.mesh.removeFromParent(); jet.mesh.material.dispose(); jet.light.removeFromParent(); }
        this.group.removeFromParent();
    }
}
