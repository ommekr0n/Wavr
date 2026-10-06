import * as THREE from 'three';

/** A readable resting pose and smooth record spin without another animation loop. */
export class LivingSleeveMotion {
    constructor(group, disc) { this.group = group; this.disc = disc; this.speed = 0; }
    update(dt, playing, reducedMotion, rect, pointer) {
        const hover = !reducedMotion && pointer.x >= rect.left && pointer.x <= rect.left + rect.width && pointer.y >= rect.top && pointer.y <= rect.top + rect.height;
        const px = hover ? (pointer.x - rect.left) / rect.width - .5 : 0;
        const py = hover ? (pointer.y - rect.top) / rect.height - .5 : 0;
        const rx = .12 + py * .16, ry = -.27 + px * .22;
        if (reducedMotion) { this.group.rotation.set(.12, -.27, -.025); this.speed = 0; return false; }
        this.group.rotation.x = THREE.MathUtils.damp(this.group.rotation.x, rx, 8, dt);
        this.group.rotation.y = THREE.MathUtils.damp(this.group.rotation.y, ry, 8, dt);
        this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, -.025, 8, dt);
        this.speed = THREE.MathUtils.damp(this.speed, playing ? .55 : 0, 5, dt);
        if (this.speed < .001) this.speed = 0;
        this.disc.group.rotation.z -= dt * this.speed;
        this.disc.material.uniforms.uSpin.value = this.disc.group.rotation.z;
        return this.speed > 0 || Math.abs(this.group.rotation.x - rx) + Math.abs(this.group.rotation.y - ry) + Math.abs(this.group.rotation.z + .025) > .0005;
    }
    reset() { this.speed = 0; }
}
