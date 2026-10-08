/** A finite idle on the inner image, leaving the mark's reveal/exit transform independent. */
export function createRealityTearLogoIdle(logo, duration) {
    const pose = (x, y, tilt, scale) => `perspective(650px) translate3d(${x}px, ${y}px, 0px) rotateY(${tilt}deg) rotateZ(${tilt * .16}deg) scale(${scale})`;
    const rest = pose(0, 0, 0, 1);
    return logo.animate([
        { offset: 0, transform: rest },
        { offset: .16, transform: rest },
        { offset: .28, transform: pose(-2, -5, -6, 1.035) },
        { offset: .4, transform: pose(1, 2, 3, 1.004) },
        { offset: .49, transform: pose(-1, -2, -3, 1.028) },
        { offset: .57, transform: pose(2, -4, 7, 1.04) },
        { offset: .7, transform: pose(-1, 2, -2, 1.006) },
        { offset: .8, transform: rest },
        { offset: 1, transform: rest }
    ], { duration, easing: 'ease-in-out', fill: 'both' });
}
