import * as THREE from 'three';

/** A single grooved disc with an album label, reused across track changes. */
export function createLivingSleeveDisc() {
    const group = new THREE.Group();
    const geometry = new THREE.CircleGeometry(.5, 80);
    const material = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0xaaaaaa) }, uSpin: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uSpin;
            void main(){vec2 p=vUv-.5; float r=length(p); float a=atan(p.y,p.x);
            float light=pow(abs(cos(a+uSpin+.6)),18.0); float phase=r*760.0;
            float groove=.5+.5*sin(phase)*(1.0-smoothstep(1.0,3.0,fwidth(phase)));
            float pressing=pow(max(0.0,cos(a-.8)),36.0)*smoothstep(.20,.43,r);
            float etch=(1.0-smoothstep(.001,.004,abs(r-.457)))*pow(max(0.0,cos(a-1.8)),140.0);
            vec3 c=vec3(.009)+vec3(.075)*light+vec3(.007)*groove+vec3(.013)*pressing;
            c+=uColor*light*.035; c+=vec3(.15)*etch+vec3(.09)*smoothstep(.493,.5,r);
            gl_FragColor=vec4(c,1.0);
            #include <colorspace_fragment>
            }`,
        depthWrite: true
    });
    const surface = new THREE.Mesh(geometry, material); surface.position.z = .012; group.add(surface);
    const edgeGeometry = new THREE.CylinderGeometry(.5, .5, .02, 80);
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x17171b, roughness: .3, metalness: .15 });
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial); edge.rotation.x = Math.PI / 2; group.add(edge);
    const labelGeometry = new THREE.CircleGeometry(.175, 48);
    const labelMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
    const label = new THREE.Mesh(labelGeometry, labelMaterial); label.position.z = .016; group.add(label);
    const holeGeometry = new THREE.CircleGeometry(.015, 20), holeMaterial = new THREE.MeshBasicMaterial({ color: 0x0a0a0c });
    const hole = new THREE.Mesh(holeGeometry, holeMaterial); hole.position.z = .019; group.add(hole);
    return { group, material, labelMaterial, dispose() {
        for (const resource of [geometry, material, edgeGeometry, edgeMaterial, labelGeometry, labelMaterial, holeGeometry, holeMaterial]) resource.dispose();
    } };
}
