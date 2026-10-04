// The same segments and ease-in-out curve as @keyframes giant-fly.
const times = [0, 0.15, 0.4, 0.55, 0.8, 1];
const blend = (a, b, t) => a + (b - a) * t;
const curve = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;

export function butterflyEase(progress) {
    let low = 0, high = 1;
    for (let i = 0; i < 14; i++) {
        const middle = (low + high) / 2;
        if (curve(middle, 0.42, 0.58) < progress) low = middle; else high = middle;
    }
    return curve((low + high) / 2, 0, 1);
}

// GiantButterfly supplies vw/vh terms, including its randomized calc() midpoint.
const coordinate = value => Array.from(value.matchAll(/(-?\d+(?:\.\d+)?)\s*(vw|vh)/g))
    .reduce((sum, match) => sum + Number(match[1]) / 100, 0);

/** Read the CSS path once, then follow it without synchronous DOM layout reads. */
export class AngelicButterflyFlight {
    constructor(node, sprite, start) {
        const style = getComputedStyle(node), spriteStyle = getComputedStyle(sprite);
        this.start = start;
        this.originX = parseFloat(style.width) / 2; this.originY = parseFloat(style.height) / 2;
        this.offsetX = parseFloat(spriteStyle.width) / 2 - this.originX;
        this.offsetY = parseFloat(spriteStyle.height) / 2 - this.originY;
        const read = name => node.style.getPropertyValue(`--${name}`);
        const sx = coordinate(read('sx')), sy = coordinate(read('sy'));
        const mx = coordinate(read('mx')), my = coordinate(read('my'));
        const ex = coordinate(read('ex')), ey = coordinate(read('ey'));
        const sr = parseFloat(read('sr')), mr = parseFloat(read('mr')), er = parseFloat(read('er'));
        this.x = [sx, blend(sx, mx, 0.2), mx, mx, blend(mx, ex, 0.8), ex];
        this.y = [sy, blend(sy, my, 0.2), my, my, blend(my, ey, 0.8), ey];
        this.rotation = [sr, sr, mr, mr, er, er];
        this.sample = { x: 0, y: 0, rotation: 0, opacity: 0 };
    }

    update(now, width, height) {
        const progress = Math.min(1, Math.max(0, (now - this.start) / 6000));
        let segment = 0;
        while (segment < times.length - 2 && progress > times[segment + 1]) segment++;
        const t = butterflyEase((progress - times[segment]) / (times[segment + 1] - times[segment]));
        const rotation = blend(this.rotation[segment], this.rotation[segment + 1], t) * Math.PI / 180;
        this.sample.x = blend(this.x[segment], this.x[segment + 1], t) * width + this.originX + Math.cos(rotation) * this.offsetX - Math.sin(rotation) * this.offsetY;
        this.sample.y = blend(this.y[segment], this.y[segment + 1], t) * height + this.originY + Math.sin(rotation) * this.offsetX + Math.cos(rotation) * this.offsetY;
        this.sample.rotation = rotation;
        this.sample.opacity = progress < 0.15 ? butterflyEase(progress / 0.15) : progress > 0.8 ? 1 - butterflyEase((progress - 0.8) / 0.2) : 1;
        return this.sample;
    }
}
