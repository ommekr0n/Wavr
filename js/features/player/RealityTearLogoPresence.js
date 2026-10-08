/** Cached, softly filtered copies of the approved SVG provide a delayed image and light halo. */
export class RealityTearLogoPresence {
    constructor(mark) {
        this.halo = document.createElement('div'); this.halo.className = 'reality-tear-logo-halo';
        this.echoes = ['near', 'far'].map(depth => {
            const element = document.createElement('div'); element.className = `reality-tear-logo-echo ${depth}`;
            const image = document.createElement('img'); image.alt = ''; image.decoding = 'async'; element.append(image);
            return { element, image };
        });
        mark.append(this.halo, ...this.echoes.map(echo => echo.element));
    }
    setLogo(url) {
        for (const { image } of this.echoes) {
            if (image.getAttribute('src') === url) continue;
            image.src = url; image.decode?.().catch(() => {});
        }
    }
    animate(duration) {
        const pose = (x, y, scale, angle = 0) => `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${scale})`;
        const tracks = [
            { element: this.halo, frames: [
                [0, 0, 0, 1, 0], [.16, 0, 0, 1, .2], [.3, 0, -3, 1.28, .55],
                [.43, 1, 2, 1.05, .22], [.56, -2, -3, 1.4, .65], [.7, 0, 2, 1.12, .25], [.8, 0, 0, 1, .2], [1, 0, 0, 1, 0]
            ] },
            { element: this.echoes[0].element, frames: [
                [0, 0, 0, 1, 0], [.16, 2, 1, 1.015, .08], [.32, 7, 2, 1.06, .3],
                [.43, 2, -2, 1.025, .12], [.5, -7, 3, 1.08, .4], [.61, -3, 1, 1.035, .14], [.76, 6, 2, 1.06, .25], [.85, 0, 0, 1, 0], [1, 0, 0, 1, 0]
            ] },
            { element: this.echoes[1].element, frames: [
                [0, 0, 0, 1, 0], [.2, -2, 2, 1.06, .04], [.37, -9, 5, 1.12, .24],
                [.46, -2, 1, 1.06, .08], [.59, 10, 4, 1.15, .3], [.74, 3, 2, 1.06, .1], [.85, 0, 0, 1, 0], [1, 0, 0, 1, 0]
            ] }
        ];
        return tracks.map(({ element, frames }) => element.animate(frames.map(([offset, x, y, scale, opacity]) => ({ offset, opacity, transform: pose(x, y, scale) })), { duration, easing: 'ease-in-out', fill: 'both' }));
    }
}
