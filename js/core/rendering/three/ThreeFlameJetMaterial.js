import * as THREE from 'three';
import { flameVolumeFragmentShader } from './FlameVolumeShader.js';

/** Material configuration for the shared 3D flame field. */
export function createFlameJetMaterial(noise) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 }, uBurst: { value: 0 }, uAge: { value: 10 }, uSeed: { value: 0 },
            uNoise: { value: noise }, uWorldToLocal: { value: new THREE.Matrix4() }
        },
        vertexShader: `
            varying vec3 vLocalPosition;
            void main() {
                vLocalPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: flameVolumeFragmentShader,
        transparent: true, depthTest: false, depthWrite: false,
        side: THREE.FrontSide, blending: THREE.NormalBlending, toneMapped: false
    });
}
