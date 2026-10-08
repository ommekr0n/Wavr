/** Finite settling: no perpetual motion in a collection or editor. */
export class LibraryObjectMotion {
    constructor() { this.hover = 0; this.drop = 0; this.animating = false; }

    update(dt, hovered, targeted, reducedMotion) {
        const settle = (value, target) => {
            if (reducedMotion) return target;
            const next = value + (target - value) * (1 - Math.exp(-18 * dt));
            return Math.abs(next - target) < .002 ? target : next;
        };
        this.hover = settle(this.hover, hovered ? 1 : 0);
        this.drop = settle(this.drop, targeted ? 1 : 0);
        this.animating = this.hover !== Number(hovered) || this.drop !== Number(targeted);
    }
}
