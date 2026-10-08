import test from 'node:test';
import assert from 'node:assert/strict';
import { RealityTearRenderEffect } from '../js/core/rendering/three/RealityTearRenderEffect.js';
import { ThreeChromaticAtelier } from '../js/core/rendering/three/ThreeChromaticAtelier.js';
import { sampleTearOpening, REALITY_TEAR_DURATION } from '../js/features/player/RealityTearTiming.js';
import { tearCurve, tearDistance, tearPose } from '../js/features/player/RealityTearGeometry.js';
import { pinSleeveForTear, readSleeveLayout } from '../js/core/rendering/three/RealityTearSleeveAnchor.js';

const field = { cx: 600, cy: 400, width: 1200, height: 800, horizontal: false, amplitude: 1, gap: 82, angle: .9 };
function fixture(t) {
    const saved = { document: globalThis.document, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
    globalThis.document = new EventTarget(); let warm, allocations = 0, compiled = 0;
    globalThis.setTimeout = callback => { warm = callback; return 1; }; globalThis.clearTimeout = () => {};
    const renderer = { target: null, autoClear: false, draws: [], getPixelRatio: () => 1.5,
        getRenderTarget() { return this.target; }, setRenderTarget(target) { this.target = target; },
        render(scene) { this.draws.push({ scene, target: this.target, autoClear: this.autoClear }); },
        initRenderTarget() { allocations++; }, compileAsync() { compiled++; return Promise.resolve(); } };
    const owner = { renderer, mode: 'player', enabled: true, reducedMotion: false, loops: 0, syncMode() {}, syncLoop() { this.loops++; } };
    const abort = new AbortController(), effect = new RealityTearRenderEffect(owner, abort.signal);
    effect.resize(1200, 800);
    const intro = (active, extras = {}) => document.dispatchEvent(new CustomEvent('wavr:artistintro', { detail: { active, field, start: 1000, duration: 680, ...extras } }));
    t.after(() => { abort.abort(); effect.dispose(); Object.assign(globalThis, saved); });
    return { renderer, owner, effect, intro, warm: () => warm(), counts: () => ({ allocations, compiled }) };
}

test('a cut captures the live scene, composes once, and restores nested renderer targets', t => {
    const f = fixture(t), previous = {}; f.renderer.target = previous;
    f.effect.beginFrame(f.renderer, 1000); f.effect.endFrame(f.renderer);
    assert.equal(f.renderer.draws.length, 0); assert.equal(f.renderer.target, previous);
    f.intro(true); assert.equal(f.owner.loops, 1); assert.equal(f.effect.active, true);
    f.effect.beginFrame(f.renderer, 1272); assert.equal(f.renderer.target, f.effect.target);
    const atelier = new ThreeChromaticAtelier(); atelier.render(f.renderer, 1272);
    assert.equal(f.renderer.target, f.effect.target);
    f.effect.endFrame(f.renderer); assert.equal(f.renderer.target, previous);
    assert.equal(f.renderer.draws.at(-1).scene, f.effect.scene); assert.equal(f.renderer.draws.at(-1).autoClear, true);
    assert.equal(f.renderer.autoClear, false);
    assert.equal(f.effect.uniforms.uOpening.value, sampleTearOpening(.4)); atelier.dispose();
    f.intro(false); assert.equal(f.effect.active, false);
    const count = f.renderer.draws.length; f.effect.beginFrame(f.renderer, 1300); f.effect.endFrame(f.renderer);
    assert.equal(f.renderer.draws.length, count);
});

test('absolute timing catches up after missed frames and ends without a lingering postprocess', t => {
    const f = fixture(t); f.intro(true);
    for (const now of [1000, 1016, 1080, 1333]) { f.effect.beginFrame(f.renderer, now); f.effect.endFrame(f.renderer); }
    assert.equal(f.effect.uniforms.uOpening.value, sampleTearOpening(333 / 680));
    f.effect.beginFrame(f.renderer, 1700); assert.equal(f.effect.active, false); assert.equal(f.effect.capturing, false);
    f.owner.reducedMotion = true; f.intro(true); assert.equal(f.effect.active, false);
    f.owner.reducedMotion = false; f.owner.mode = 'angelic'; f.intro(true); assert.equal(f.effect.active, false);
});

test('buffers stay bounded at 4K, warm once, and all GPU resources are disposed', t => {
    const f = fixture(t); f.effect.resize(3840, 2160);
    assert.ok(f.effect.target.width * f.effect.target.height <= 1200000);
    f.warm(); assert.deepEqual(f.counts(), { allocations: 1, compiled: 1 });
    let disposed = 0;
    for (const resource of [f.effect.geometry, f.effect.material, f.effect.target]) resource.addEventListener('dispose', () => disposed++);
    f.effect.dispose(); assert.equal(disposed, 3); f.warm(); assert.equal(f.counts().compiled, 1);
});

test('organic cut coordinates and sheet transforms work in both orientations and close exactly', () => {
    for (const horizontal of [false, true]) {
        const f = { ...field, horizontal };
        for (const t of [-400, -100, 0, 100, 400]) {
            const edge = tearCurve(t);
            const x = f.cx + (horizontal ? t : edge), y = f.cy + (horizontal ? edge : t);
            assert.ok(Math.abs(tearDistance(x, y, f)) < 1e-10);
        }
        for (const side of [-1, 1]) assert.deepEqual(tearPose(f, side, sampleTearOpening(1)), { x: side * 0, y: side * 0, angle: side * 0, scale: 1 });
    }
});

test('artwork texture changes retain unwarped source bounds and release the anchor on cancellation', t => {
    const f = fixture(t); f.owner.sleeve = { dirty: false };
    const artwork = { x: 120, y: 160, width: 250, height: 250 };
    f.intro(true, { field: { ...field, artwork } });
    assert.deepEqual(f.owner.sleeve.introRect, { ...artwork, left: 120, top: 160 });
    let reads = 0;
    const node = { getBoundingClientRect() { reads++; return { x: 121, y: 160, width: 250, height: 250 }; } };
    const view = { getBoundingClientRect: () => ({ x: 0, y: 0 }) };
    assert.equal(readSleeveLayout(node, view, f.owner.sleeve.introRect).x, 120); assert.equal(reads, 0);
    f.intro(false); assert.equal(f.owner.sleeve.introRect, null); assert.equal(f.owner.sleeve.dirty, true);
    assert.equal(readSleeveLayout(node, view, null).x, 121); assert.equal(reads, 1);
    pinSleeveForTear(f.owner.sleeve, artwork); f.effect.cancel(); assert.equal(f.owner.sleeve.introRect, null);
});

test('the render holds the sheets steady while the pixel idle clock advances, then closes exactly', t => {
    const f = fixture(t); f.intro(true, { duration: REALITY_TEAR_DURATION });
    for (const elapsed of [600, 1200, 1800]) {
        f.effect.beginFrame(f.renderer, 1000 + elapsed);
        assert.equal(f.effect.uniforms.uOpening.value, 1);
        assert.equal(f.effect.uniforms.uPixelTime.value, elapsed / 1000);
        f.effect.endFrame(f.renderer);
    }
    assert.ok(sampleTearOpening(300 / REALITY_TEAR_DURATION) >= 1);
    assert.equal(sampleTearOpening(1), 0);
    f.effect.beginFrame(f.renderer, 1000 + REALITY_TEAR_DURATION);
    assert.equal(f.effect.active, false); assert.equal(f.effect.capturing, false);
});
