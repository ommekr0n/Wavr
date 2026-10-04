import * as THREE from 'three';

/** Fixed-size smoke pool; no particle allocation in the frame loop. */
export class ThreeStageSmoke {
    constructor(scene) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.3, '#ffffff80'); gradient.addColorStop(1, '#ffffff00');
        context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
        this.texture = new THREE.CanvasTexture(canvas);
        this.group = new THREE.Group(); this.group.renderOrder = 30; scene.add(this.group);
        const geometry = new THREE.PlaneGeometry(1, 1);
        this.opacity = new THREE.InstancedBufferAttribute(new Float32Array(48), 1);
        this.opacity.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('smokeOpacity', this.opacity);
        // Foreground haze remains visible over the opaque LED columns.
        const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
        material.onBeforeCompile = shader => {
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float smokeOpacity; varying float vSmokeOpacity;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSmokeOpacity = smokeOpacity;');
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSmokeOpacity;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vSmokeOpacity;');
        };
        this.mesh = new THREE.InstancedMesh(geometry, material, 48);
        this.mesh.renderOrder = 30;
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
        this.group.add(this.mesh); this.dummy = new THREE.Object3D();
        this.pool = Array.from({ length: 48 }, (_, index) => {
            return { age: index * 0.14, life: 4 + index % 3, speed: 0.12 + (index % 5) * 0.018, phase: index * 2.4, x: (index / 47 - 0.5), z: -(index % 6) * 0.4 };
        });
    }

    update(dt, t, width, height, energy, colors, reducedMotion) {
        for (let i = 0; i < this.pool.length; i++) {
            const particle = this.pool[i];
            if (!reducedMotion) particle.age = (particle.age + dt * (0.7 + energy)) % particle.life;
            const progress = particle.age / particle.life;
            const size = (0.9 + progress * 1.4) * (1 + energy * 0.15);
            this.dummy.position.set(particle.x * width + Math.sin(t * 0.25 + particle.phase) * 0.25, -height * 0.55 + progress * height * particle.speed * 2, particle.z);
            this.dummy.scale.set(size, size, 1); this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix); this.mesh.setColorAt(i, colors[i % 4]);
            this.opacity.setX(i, Math.sin(progress * Math.PI) * (0.09 + energy * 0.09));
        }
        this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; this.opacity.needsUpdate = true;
    }

    dispose() {
        this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose();
        this.texture.dispose(); this.group.removeFromParent();
    }
}
