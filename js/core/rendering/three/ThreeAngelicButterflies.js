import * as THREE from 'three';
import butterflyUrl from '../../../../assets/images/butterfly3.png';
import { AngelicButterflyFlight } from './AngelicButterflyFlight.js';

/** Upgrades the actual climax sprite and flight paths, leaving the original FX triggers. */
export class ThreeAngelicButterflies {
    constructor(textures, invalidate = () => {}) {
        this.textures = textures; this.texture = textures.acquire(butterflyUrl);
        this.invalidate = invalidate;
        this.active = false;
        this.scene = new THREE.Scene(); this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000); this.camera.position.z = 1000;
        this.geometry = new THREE.PlaneGeometry(1, 1); this.records = [];
        this.root = document.getElementById('angelic-view');
        this.observer = new MutationObserver(mutations => {
            for (const mutation of mutations) for (const node of mutation.addedNodes) {
                if (node instanceof HTMLElement && node.classList.contains('giant-butterfly')) this.add(node);
            }
        });
        this.observer.observe(this.root, { childList: true });
    }

    add(node) {
        if (!this.active || this.records.length >= 4) return;
        const group = new THREE.Group(); this.scene.add(group);
        const wings = [-1, 1].map((side, index) => {
            const material = new THREE.ShaderMaterial({
                uniforms: { atlas: { value: this.texture.texture }, frame: { value: 0 }, wingOffset: { value: index * 0.5 }, tint: { value: new THREE.Color(0xaaddff) }, opacity: { value: 0 } },
                vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
                fragmentShader: 'varying vec2 vUv; uniform sampler2D atlas; uniform float frame; uniform float wingOffset; uniform vec3 tint; uniform float opacity; void main(){vec2 uv=vec2((frame+wingOffset+vUv.x*0.5)/3.0,1.0-38.0/192.0+vUv.y*38.0/192.0); vec4 tex=texture2D(atlas,uv); if(tex.a<0.05) discard; gl_FragColor=vec4(mix(tint,vec3(1.0),vUv.y*0.5),tex.a*opacity);}',
                transparent: true, depthWrite: false, side: THREE.DoubleSide
            });
            const pivot = new THREE.Group(); group.add(pivot);
            const mesh = new THREE.Mesh(this.geometry, material); mesh.scale.x = 0.5; mesh.position.x = side * 0.25; pivot.add(mesh);
            return { pivot, mesh, material };
        });
        const sprite = node.querySelector('.sprite-butterfly');
        const scale = Number(sprite?.style.transform.match(/scale\((.*?)\)/)?.[1] || 2);
        const start = performance.now();
        this.records.push({ node, sprite, group, wings, scale, start, flight: new AngelicButterflyFlight(node, sprite, start) });
        this.invalidate();
    }

    resize(width, height) {
        this.width = width; this.height = height;
        this.camera.left = -width / 2; this.camera.right = width / 2; this.camera.top = height / 2; this.camera.bottom = -height / 2; this.camera.updateProjectionMatrix();
    }

    update(now, colors, reducedMotion) {
        for (let i = this.records.length - 1; i >= 0; i--) {
            const record = this.records[i];
            const progress = Math.min(1, (now - record.start) / 6000);
            if (progress >= 1 || !record.node.isConnected) { this.remove(record); this.records.splice(i, 1); continue; }
            // Follow the original CSS animation's position, rotation and fade exactly.
            const flight = record.flight.update(now, this.width, this.height);
            record.group.position.set(flight.x - this.width / 2, this.height / 2 - flight.y, 0);
            record.group.rotation.z = -flight.rotation;
            record.group.scale.set(96 * record.scale, 76 * record.scale, 96 * record.scale);
            record.group.visible = this.texture.ready;
            record.node.classList.toggle('three-butterfly-ready', this.texture.ready);
            for (const [index, wing] of record.wings.entries()) {
                wing.pivot.rotation.y = reducedMotion ? 0 : Math.sin(now * 0.02) * 0.5 * (index ? -1 : 1);
                wing.material.uniforms.frame.value = reducedMotion ? 0 : Math.floor(now / 100) % 3;
                wing.material.uniforms.tint.value.copy(colors[1]);
                wing.material.uniforms.opacity.value = flight.opacity;
            }
        }
    }

    remove(record) {
        record.node.classList.remove('three-butterfly-ready'); record.group.removeFromParent(); record.wings.forEach(wing => wing.material.dispose());
    }

    clear() { this.records.forEach(record => this.remove(record)); this.records = []; }
    dispose() { this.observer.disconnect(); this.clear(); this.geometry.dispose(); this.textures.release(butterflyUrl); }
}
