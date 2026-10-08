import * as THREE from 'three';

/** Printed artwork stays color accurate; bevel, paper and laminate supply depth. */
export class LibrarySleeveModel {
    constructor(resources, lease, { preview = false } = {}) {
        this.group = new THREE.Group();
        this.body = new THREE.Group();
        this.group.add(this.body);
        this.ownsFace = !lease?.material;
        this.face = lease?.material || new THREE.MeshBasicMaterial({ map: lease?.texture || null, color: lease ? 0xffffff : 0x87827b, toneMapped: false });
        this.cover = new THREE.Mesh(resources.jacket, [this.face, resources.paper]);
        this.cover.position.z = .055;
        const paper = new THREE.Mesh(resources.jacket, resources.inner);
        paper.scale.set(.99, 1.005, .55); paper.position.set(.012, -.014, .025);
        this.body.add(paper, this.cover);
        const laminate = new THREE.Mesh(resources.plane, resources.laminate);
        laminate.position.z = .071; this.body.add(laminate);
        if (!preview) {
            this.disc = new THREE.Mesh(resources.record, resources.grooves);
            this.disc.position.set(.035, 0, 0);
            this.body.add(this.disc);
            this.group.add(resources.contactShadow());
        }
        this.lease = lease;
    }

    get ready() { return !this.lease || this.lease.ready || this.lease.failed; }

    update(hover, drop = 0) {
        if (this.lease?.failed && this.face.map) { this.face.map = null; this.face.color.setHex(0x87827b); this.face.needsUpdate = true; }
        this.body.position.y = hover * .025 + drop * .055;
        this.body.rotation.set(hover * .035, -.035 - hover * .045, -.009 - hover * .008);
        if (this.disc) this.disc.position.x = .035 + hover * .12;
    }

    dispose() { if (this.ownsFace) this.face.dispose(); }
}
