const value = (element, name, fallback) => parseFloat(element.style.getPropertyValue(name)) || fallback;
const clamp = value => Math.min(1, Math.max(0, value));
const cubic = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;

function ease(progress, x1, y1, x2, y2) {
    if (progress <= 0 || progress >= 1) return progress;
    let low = 0, high = 1;
    for (let i = 0; i < 15; i++) {
        const middle = (low + high) / 2;
        if (cubic(middle, x1, x2) < progress) low = middle; else high = middle;
    }
    return cubic((low + high) / 2, y1, y2);
}

/** Sample the original SVG growth curves in the same paint pass as the 30Hz wave. */
export class AngelicFloralReveal {
    constructor(wrapper) {
        this.wrapper = wrapper; this.started = null; this.done = false;
        this.branches = Array.from(wrapper.querySelectorAll('.angelic-branch'), element => ({
            element, length: value(element, '--blen', 0), delay: value(element, '--branch-delay', 0),
            duration: value(element, '--branch-dur', 1.5), previous: -1
        }));
        this.blooms = Array.from(wrapper.querySelectorAll('.angelic-bloom'), element => ({
            element, delay: value(element, '--bloom-delay', 0), duration: .7, previous: -1
        }));
        for (const branch of this.branches) branch.element.style.strokeDashoffset = `${branch.length}px`;
        for (const bloom of this.blooms) { bloom.element.style.opacity = '0'; bloom.element.style.transform = 'scale(0)'; }
        wrapper.classList.add('angelic-sampled-reveal');
    }

    update(now) {
        if (this.done || !this.wrapper.classList.contains('angelic-enter-wrapper')) return;
        if (this.started === null) this.started = now;
        const elapsed = (now - this.started) / 1000;
        let completed = 0;
        for (const item of this.branches) {
            const progress = clamp((elapsed - item.delay) / item.duration);
            if (progress !== item.previous) {
                const growth = ease(progress, .2, .8, .2, 1);
                item.element.style.strokeDashoffset = `${(item.length * (1 - growth)).toFixed(3)}px`;
                item.previous = progress;
            }
            if (progress === 1) completed++;
        }
        for (const item of this.blooms) {
            const progress = clamp((elapsed - item.delay) / item.duration);
            if (progress !== item.previous) {
                const growth = ease(progress, .34, 1.56, .64, 1);
                item.element.style.transform = `scale(${growth.toFixed(4)})`;
                item.element.style.opacity = clamp(growth).toFixed(3);
                item.previous = progress;
            }
            if (progress === 1) completed++;
        }
        this.done = completed === this.branches.length + this.blooms.length;
    }
}
