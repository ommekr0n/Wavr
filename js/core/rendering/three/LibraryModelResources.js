import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Geometry and quiet materials shared by every visible record and crate. */
export class LibraryModelResources {
    constructor() {
        const shape = new THREE.Shape();
        shape.moveTo(-.5, -.5); shape.lineTo(.5, -.5); shape.lineTo(.5, .5); shape.lineTo(-.5, .5); shape.closePath();
        this.jacket = new THREE.ExtrudeGeometry(shape, { depth: .025, bevelEnabled: true, bevelSize: .003, bevelThickness: .003, bevelSegments: 1, steps: 1 });
        this.jacket.translate(0, 0, -.0125);
        const uv = this.jacket.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + .5, uv.getY(i) + .5);
        this.plane = new THREE.PlaneGeometry(1, 1);
        this.record = new THREE.RingGeometry(.025, .485, 64);
        this.block = new RoundedBoxGeometry(1, 1, 1, 1, .035);
        const parts = [
            [.86, .035, .48, 0, -.37, 0],
            [.028, .42, .48, -.416, -.17, 0], [.028, .42, .48, .416, -.17, 0],
            [.86, .42, .026, 0, -.17, -.23],
            [.82, .018, .032, 0, -.368, .245],
        ].map(([w, h, d, x, y, z]) => this.block.clone().scale(w, h, d).translate(x, y, z));
        this.crate = mergeGeometries(parts);
        parts.forEach(part => part.dispose());
        this.paper = new THREE.MeshStandardMaterial({ color: 0xd2c9b8, roughness: 1 });
        this.inner = new THREE.MeshStandardMaterial({ color: 0xe5dfd4, roughness: .95 });
        this.body = new THREE.MeshStandardMaterial({ color: 0x282a2e, roughness: .72, metalness: .18 });
        this.label = new THREE.MeshStandardMaterial({ color: 0xc2b9a7, roughness: .82 });
        this.ink = new THREE.MeshBasicMaterial({ color: 0x47443e });
        this.glass = new THREE.MeshPhongMaterial({ color: 0x9aabb8, transparent: true, opacity: .24, shininess: 95, specular: 0x71828f, depthWrite: false });
        this.grooves = new THREE.ShaderMaterial({
            vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
            fragmentShader: `varying vec2 vUv; void main(){
                vec2 p=vUv-.5; float r=length(p); float a=atan(p.y,p.x);
                float groove=.5+.5*sin(r*1500.0);
                float sheen=pow(abs(sin(a+.65)),14.0);
                vec3 c=vec3(.021,.023,.028)+groove*.013+sheen*.115;
                gl_FragColor=vec4(c,1.0);
            }`,
        });
        this.laminate = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
            vertexShader: 'varying vec2 vUv; varying vec3 vNormal; void main(){vUv=uv; vNormal=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
            fragmentShader: `varying vec2 vUv; varying vec3 vNormal; void main(){
                float band=exp(-pow((vUv.x*.62+vUv.y-.95+vNormal.x*.8)/.17,2.0));
                float edge=pow(1.0-abs(vNormal.z),2.0);
                gl_FragColor=vec4(.96,.97,1.0,band*.055+edge*.16);
            }`,
        });
        this.shadow = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
            vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
            fragmentShader: `varying vec2 vUv; void main(){
                vec2 p=abs(vUv-.5)-vec2(.285,.28);
                float d=length(max(p,0.0));
                gl_FragColor=vec4(0.0,0.0,0.0,.4*exp(-d*d/.009));
            }`,
        });
    }

    contactShadow(width = 1.4, height = 1.4) {
        const mesh = new THREE.Mesh(this.plane, this.shadow);
        mesh.scale.set(width, height, 1); mesh.position.set(.035, -.075, -.3);
        return mesh;
    }

    dispose() {
        for (const value of Object.values(this)) if (value.isBufferGeometry || value.isMaterial) value.dispose();
    }
}
