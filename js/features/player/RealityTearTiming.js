// CSS easing and the GPU use the same absolute clock and smoothstep curve.
export const REALITY_TEAR_DURATION = 2400;
export const tearStops = [[0, 0], [.04, .02], [.125, 1.025], [.16, 1], [.8, 1], [1, 0]];
export const tearEasing = 'cubic-bezier(.333333,0,.666667,1)';
export function sampleTearOpening(progress) {
    const t = Math.max(0, Math.min(1, progress));
    for (let i = 1; i < tearStops.length; i++) {
        const [end, b] = tearStops[i], [start, a] = tearStops[i - 1];
        if (t <= end) { const x = (t - start) / (end - start); return a + (b - a) * x * x * (3 - 2 * x); }
    }
    return 0;
}
