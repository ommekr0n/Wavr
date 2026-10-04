// Share the existing audio analysis with the single Three.js renderer.
let adapter = null;

export function registerVisualRenderer(renderer) {
    adapter = renderer;
    return () => { if (adapter === renderer) adapter = null; };
}

export function publishVisualFrame(frame) {
    adapter?.setAudioFrame(frame);
}
