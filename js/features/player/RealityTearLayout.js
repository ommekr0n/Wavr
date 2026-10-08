/** Read final layout once, before either compositor starts moving it. */
export function measureRealityTear(view) {
    for (const animation of view.getAnimations()) {
        if (animation.transitionProperty === 'transform' && animation.effect?.target === view) animation.finish();
    }
    const width = innerWidth, height = innerHeight;
    const left = view.querySelector('.am-player-left')?.getBoundingClientRect();
    const right = view.querySelector('.am-lyrics-section')?.getBoundingClientRect();
    const cover = view.querySelector('#cover-art')?.getBoundingClientRect();
    const parent = view.getBoundingClientRect();
    const horizontal = width <= 760 && height > width;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    return { width, height, horizontal, amplitude: horizontal ? .55 : 1,
        artwork: cover ? { x: cover.left - parent.x, y: cover.top - parent.y, width: cover.width, height: cover.height } : null,
        cx: horizontal ? width * .5 : clamp(left && right ? (left.right + right.left) * .5 : width * .5, width * .35, width * .7),
        cy: horizontal ? clamp(left && right ? (left.bottom + right.top) * .5 : height * .4, height * .31, height * .56) : height * .49,
        gap: horizontal ? clamp(height * .09, 54, 78) : clamp(width * .068, 64, 105),
        angle: horizontal ? .75 : .9 };
}
