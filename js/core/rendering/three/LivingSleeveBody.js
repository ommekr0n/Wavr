import * as THREE from 'three';

/** Beveled paper jacket, lit laminate and a cheap soft contact shadow. */
export function createLivingSleeveBody() {
    const group = new THREE.Group(), shape = new THREE.Shape();
    shape.moveTo(-.5, -.5); shape.lineTo(.5, -.5); shape.lineTo(.5, .5); shape.lineTo(-.5, .5); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .04, bevelEnabled: true, bevelSize: .004, bevelThickness: .004, bevelSegments: 2, steps: 1 });
    geometry.translate(0, 0, -.02);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + .5, uv.getY(i) + .5);
    const edge = new THREE.MeshStandardMaterial({ color: 0xb7ad98, roughness: .92 });
    const face = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .7, metalness: 0, clearcoat: .18, clearcoatRoughness: .48, transparent: true, toneMapped: false });
    const cover = new THREE.Mesh(geometry, [face, edge]); cover.position.z = .085; group.add(cover);
    const paperMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d0bf, roughness: 1 });
    const paper = new THREE.Mesh(geometry, paperMaterial); paper.scale.set(1.025, 1.025, .65); paper.position.set(-.012, -.016, .045); paper.rotation.z = -.014; group.add(paper);
    const shadowGeometry = new THREE.PlaneGeometry(1.55, 1.55);
    const shadowMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `varying vec2 vUv; void main(){
            vec2 p=abs(vUv-.5)-vec2(.305); float d=length(max(p,0.0));
            gl_FragColor=vec4(0.0,0.0,0.0,.32*exp(-d*d/0.008));
        }` });
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial); shadow.position.set(.055, -.085, -.105); group.add(shadow);
    return { group, face, cover, dispose() {
        for (const resource of [geometry, edge, face, paperMaterial, shadowGeometry, shadowMaterial]) resource.dispose();
    } };
}
