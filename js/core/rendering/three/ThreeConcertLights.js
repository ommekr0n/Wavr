import * as THREE from 'three';

/** The original two sweeping concert spotlights, with volumetric beam meshes. */
export class ThreeConcertLights {
    constructor(scene) {
        this.group = new THREE.Group(); this.group.renderOrder = 10; scene.add(this.group);
        this.geometry = new THREE.CylinderGeometry(0, 1, 1, 32, 1, true);
        this.beams = [0, 1].map(() => {
            const material = new THREE.ShaderMaterial({
                uniforms: { tint: { value: new THREE.Color() }, strength: { value: 0.3 }, time: { value: 0 } },
                vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
                fragmentShader: 'varying vec2 vUv; uniform vec3 tint; uniform float strength; uniform float time; void main(){float fade=pow(vUv.y,1.6); float haze=0.8+0.2*sin(vUv.y*17.0+time); gl_FragColor=vec4(tint,fade*strength*haze);}',
                transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
            });
            const mesh = new THREE.Mesh(this.geometry, material); mesh.renderOrder = 10; this.group.add(mesh); return mesh;
        });
        const laserMaterial = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
        this.laserGeometry = new THREE.CylinderGeometry(0.007, 0.007, 1, 6);
        this.lasers = Array.from({ length: 8 }, () => {
            const mesh = new THREE.Mesh(this.laserGeometry, laserMaterial.clone()); mesh.renderOrder = 20; this.group.add(mesh); return mesh;
        });
        laserMaterial.dispose();
        this.start = new THREE.Vector3(); this.end = new THREE.Vector3(); this.direction = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    }

    aim(mesh, start, end, radius = 1) {
        this.direction.subVectors(start, end);
        const length = this.direction.length();
        mesh.position.copy(start).add(end).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(this.up, this.direction.normalize());
        mesh.scale.set(radius, length, radius);
    }

    update(t, width, height, intensity, colors, reducedMotion) {
        const motionTime = reducedMotion ? 0 : t;
        this.beams.forEach((beam, i) => {
            const side = i ? 1 : -1;
            this.start.set(side * width * 0.47, height * 0.54, 1.1);
            this.end.set(Math.sin(motionTime * (i ? 0.33 : 0.45) + i * 1.8) * width * 0.24, -height * 0.65, -3);
            this.aim(beam, this.start, this.end, height * (0.13 + intensity * 0.055));
            beam.material.uniforms.tint.value.copy(colors[(i * 2 + Math.floor(t / 5)) % 4]);
            beam.material.uniforms.strength.value = 0.2 + intensity * 0.18;
            beam.material.uniforms.time.value = motionTime;
        });
        this.lasers.forEach((laser, i) => {
            const side = i % 2 ? 1 : -1;
            this.start.set(side * width * 0.43, -height * 0.45, 0.3);
            this.end.set(Math.sin(motionTime * 0.65 + i * 0.4) * width * 0.7, height * 0.6, -1);
            this.aim(laser, this.start, this.end);
            laser.material.color.copy(colors[i % 4]);
            laser.material.opacity = Math.max(0, intensity - 0.16) * 0.8;
        });
    }

    dispose() {
        this.geometry.dispose(); this.laserGeometry.dispose();
        this.beams.forEach(mesh => mesh.material.dispose()); this.lasers.forEach(mesh => mesh.material.dispose());
        this.group.removeFromParent();
    }
}
