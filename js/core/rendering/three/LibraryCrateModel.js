import * as THREE from 'three';
import { LibrarySleeveModel } from './LibrarySleeveModel.js';

/** A seated stack inside a complete, lit crate with a smoked acrylic front. */
export class LibraryCrateModel {
    constructor(resources, leases, color = '#8b7058') {
        this.group = new THREE.Group();
        this.body = new THREE.Group();
        this.body.rotation.set(.22, -.22, -.012);
        this.group.add(this.body, resources.contactShadow(1.35, 1.15));
        this.body.add(new THREE.Mesh(resources.crate, resources.body));
        this.trim = new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: .25 });
        const lip = new THREE.Mesh(resources.block, this.trim);
        lip.scale.set(.84, .022, .03); lip.position.set(0, -.36, .257); this.body.add(lip);
        const glass = new THREE.Mesh(resources.block, resources.glass);
        glass.scale.set(.81, .205, .012); glass.position.set(0, -.25, .244); this.body.add(glass);
        const label = new THREE.Mesh(resources.block, resources.label);
        label.scale.set(.245, .052, .006); label.position.set(-.19, -.26, .259); this.body.add(label);
        const mark = new THREE.Mesh(resources.plane, resources.ink);
        mark.scale.set(.15, .008, 1); mark.position.set(-.19, -.258, .264); this.body.add(mark);
        this.sleeves = leases.map((lease, index) => {
            const sleeve = new LibrarySleeveModel(resources, lease, { preview: true });
            sleeve.group.scale.setScalar(.69);
            sleeve.group.position.set(index * .009, .016 + index * .035, .15 - index * .09);
            sleeve.group.rotation.z = index * -.014;
            this.body.add(sleeve.group);
            return sleeve;
        });
    }

    get ready() { return this.sleeves.every(sleeve => sleeve.ready); }

    update(hover, drop = 0) {
        this.body.rotation.y = -.22 + hover * .035;
        this.sleeves.forEach((sleeve, i) => {
            sleeve.update(0);
            sleeve.group.position.y = .016 + i * .035 + hover * (i === 0 ? .08 : i * .013) + drop * .055;
            sleeve.group.rotation.z = i * -.014 - hover * i * .008;
        });
        this.trim.emissive.setScalar(drop * .13);
    }

    dispose() { this.sleeves.forEach(sleeve => sleeve.dispose()); this.trim.dispose(); }
}
