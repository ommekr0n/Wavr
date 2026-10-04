/** Release a finished enhanced line once, only when its fade fits in the vocal gap. */
export class LyricReleaseController {
    constructor() { this.reset(); }
    reset() { this.released = new Set(); }
    update(timeline, index, time, highlighter, cinematicRoot, angelicRoot, onCinematicClear, onAngelicClear) {
        for (const [root, callback, angelic] of [[cinematicRoot, onCinematicClear, false], [angelicRoot, onAngelicClear, true]]) {
            if (!root || !callback || !highlighter.visible(root) || this.released.has(root)) continue;
            if (index < 0 || (timeline.lyrics[index]?.isEnhanced && timeline.canRelease(index, time, angelic))) {
                this.released.add(root);
                callback(timeline.lines[index]?.exitDuration ?? .88);
            }
        }
    }
}
