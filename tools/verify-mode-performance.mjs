import test from 'node:test';
import assert from 'node:assert/strict';
import { RendererViewport } from '../js/core/rendering/three/RendererViewport.js';
import { GraphicsWarmup } from '../js/core/rendering/three/GraphicsWarmup.js';
import { ThreeTextureCache, resizeTextureImage } from '../js/core/rendering/three/ThreeTextureCache.js';
import { LibraryVisibleItems } from '../js/features/library/LibraryVisibleItems.js';
import { ThreeLibraryScene } from '../js/core/rendering/three/ThreeLibraryScene.js';

const flushWarmup = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function warmupFixture(jobs, canRun = () => true) {
    const callbacks = new Map(); let id = 0;
    const warmup = new GraphicsWarmup(jobs, {
        canRun, schedule: callback => { callbacks.set(++id, callback); return id; },
        cancel: id => callbacks.delete(id)
    });
    return { warmup, callbacks, async run() {
        const [key, callback] = callbacks.entries().next().value;
        callbacks.delete(key); callback(); await flushWarmup();
    } };
}

test('hidden or disabled rendering retains warmup jobs until it can resume', async () => {
    for (const reason of ['hidden', 'disabled']) {
        let hidden = false, enabled = true; const order = [];
        const f = warmupFixture([() => order.push('player'), () => order.push('cinematic')], () => enabled && !hidden);
        if (reason === 'hidden') hidden = true; else enabled = false;
        await f.run();
        assert.equal(f.warmup.jobs.length, 2); assert.equal(f.callbacks.size, 0); assert.deepEqual(order, []);
        hidden = false; enabled = true; f.warmup.resume(); f.warmup.resume();
        assert.equal(f.callbacks.size, 1);
        await f.run(); await f.run();
        assert.deepEqual(order, ['player', 'cinematic']); assert.equal(f.callbacks.size, 0);
        f.warmup.dispose();
    }
});

test('warmup pauses pending work and rechecks eligibility before starting a shader', async () => {
    let allowed = false, compiled = 0;
    const f = warmupFixture([() => compiled++], () => allowed);
    assert.equal(f.callbacks.size, 0);
    allowed = true; f.warmup.resume(); f.warmup.pause();
    assert.equal(f.callbacks.size, 0); assert.equal(f.warmup.jobs.length, 1);
    f.warmup.resume();
    const [key, callback] = f.callbacks.entries().next().value;
    f.callbacks.delete(key); callback(); allowed = false;
    await flushWarmup();
    assert.equal(compiled, 0); assert.equal(f.warmup.jobs.length, 1); assert.equal(f.callbacks.size, 0);
    allowed = true; f.warmup.resume(); await f.run();
    assert.equal(compiled, 1); f.warmup.dispose();
});

test('interrupted warmup retries after recovery without overlapping an in-flight group', async () => {
    let allowed = true, reject; const order = [];
    const f = warmupFixture([
        () => { order.push('player'); return new Promise((_resolve, fail) => { reject = fail; }); },
        () => order.push('cinematic')
    ], () => allowed);
    await f.run(); allowed = false; f.warmup.pause();
    reject(new Error('context lost')); await flushWarmup();
    assert.equal(f.warmup.jobs.length, 2); assert.equal(f.callbacks.size, 0);
    allowed = true; f.warmup.resume(); await f.run();
    f.warmup.pause(); f.warmup.resume();
    assert.equal(f.callbacks.size, 0);
    // A failure while the renderer is available advances to the next group once.
    reject(new Error('unsupported shader')); await flushWarmup(); await f.run();
    assert.deepEqual(order, ['player', 'player', 'cinematic']);
    assert.equal(f.warmup.jobs.length, 0); f.warmup.dispose();
});

test('disposing an in-flight warmup cannot schedule later groups', async () => {
    let finish; const order = [];
    const f = warmupFixture([
        () => { order.push('player'); return new Promise(resolve => { finish = resolve; }); },
        () => order.push('cinematic')
    ]);
    await f.run(); f.warmup.dispose(); f.warmup.resume(); finish(); await flushWarmup();
    assert.deepEqual(order, ['player']); assert.equal(f.callbacks.size, 0);
});

test('repeated mini/full/mode changes preserve the buffer and resize only the entering scene', () => {
    const viewport = new RendererViewport(), allocations = [];
    const renderer = { setDrawingBufferSize: (...size) => allocations.push(size) };
    const scene = () => ({ count: 0, resize() { this.count++; } });
    const library = scene(), sleeve = scene(), atelier = scene(), stage = scene();
    viewport.sync(renderer, 1920, 1080, 1, [library]);
    for (let i = 0; i < 30; i++) {
        viewport.sync(renderer, 1920, 1080, 1, [sleeve, atelier]);
        viewport.sync(renderer, 1920, 1080, 1, [library]);
        viewport.sync(renderer, 1920, 1080, 1, [stage]);
    }
    assert.equal(allocations.length, 1);
    assert.deepEqual([library.count, sleeve.count, atelier.count, stage.count], [1, 1, 1, 1]);
    viewport.sync(renderer, 900, 1200, 1.5, [sleeve, atelier]);
    assert.equal(allocations.length, 2); assert.equal(library.count, 1);
    viewport.sync(renderer, 900, 1200, 1.5, [library]);
    assert.equal(library.count, 2); assert.equal(allocations.length, 2);
    viewport.sync(renderer, 900, 1200, 1, [stage]);
    assert.equal(allocations.length, 3); assert.equal(stage.count, 2);
});

test('shader warmup yields between groups, survives failure and cancels after disposal', async () => {
    const callbacks = new Map(), order = []; let id = 0, finish;
    const warmup = new GraphicsWarmup([
        () => { order.push('player'); return new Promise(resolve => { finish = resolve; }); },
        () => { order.push('angelic'); throw new Error('context lost'); },
        () => order.push('cinematic')
    ], { schedule: callback => { callbacks.set(++id, callback); return id; }, cancel: id => callbacks.delete(id) });
    const run = async () => {
        const [key, callback] = callbacks.entries().next().value; callbacks.delete(key); callback();
        for (let i = 0; i < 8; i++) await Promise.resolve();
    };
    await run(); assert.deepEqual(order, ['player']); assert.equal(callbacks.size, 0);
    finish(); for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(callbacks.size, 1);
    await run(); assert.deepEqual(order, ['player', 'angelic']); assert.equal(callbacks.size, 1);
    warmup.dispose(); assert.equal(callbacks.size, 0);
    assert.deepEqual(order, ['player', 'angelic']);
});

test('large player artwork keeps its aspect ratio and small sprite atlases remain untouched', t => {
    const previous = globalThis.document; t.after(() => { globalThis.document = previous; });
    let canvas, draws = 0;
    globalThis.document = { createElement() { return canvas = { getContext: () => ({ drawImage() { draws++; } }) }; } };
    const image = { naturalWidth: 6000, naturalHeight: 4000 };
    const resized = resizeTextureImage(image, 1024);
    assert.equal(resized, canvas); assert.equal(resized.width, 1024); assert.equal(resized.height, 683);
    assert.equal(draws, 1);
    const atlas = { width: 576, height: 192 };
    assert.equal(resizeTextureImage(atlas, 1024), atlas); assert.equal(draws, 1);
});

test('bounded player texture uploads retain ownership and ignore a released pending load', async () => {
    const pending = new Map(); let resized = 0, invalidated = 0;
    const cache = new ThreeTextureCache(() => invalidated++, {
        load: url => new Promise(resolve => pending.set(url, resolve)),
        resize: (_image, max) => { resized++; return { width: max, height: max }; }
    });
    const a = cache.acquire('a'); assert.equal(cache.acquire('a'), a); assert.equal(a.refs, 2);
    pending.get('a')({}); await Promise.resolve();
    assert.equal(a.texture.image.width, 1024); assert.equal(resized, 1); assert.equal(a.ready, true);
    cache.release('a'); assert.equal(a.refs, 1); cache.release('a'); assert.equal(cache.entries.size, 0);
    const stale = cache.acquire('stale'); cache.release('stale'); pending.get('stale')({});
    await Promise.resolve(); assert.equal(stale.ready, false); assert.equal(resized, 1); assert.equal(invalidated, 1);
    cache.dispose();
});

test('a suspended library preserves visible models and ignores hidden intersection updates', t => {
    const previous = globalThis.IntersectionObserver; t.after(() => { globalThis.IntersectionObserver = previous; });
    const observed = new Set(); let callback, invalidated = 0;
    globalThis.IntersectionObserver = class {
        constructor(cb) { callback = cb; }
        observe(node) { observed.add(node); } unobserve(node) { observed.delete(node); }
        disconnect() { observed.clear(); }
    };
    const visibility = new LibraryVisibleItems({}, () => invalidated++), anchor = {};
    visibility.sync(new Set([anchor])); callback([{ target: anchor, isIntersecting: true }]);
    visibility.suspend(); callback([{ target: anchor, isIntersecting: false }]);
    assert.equal(visibility.visible.has(anchor), true); assert.equal(invalidated, 1); assert.equal(observed.size, 0);
    visibility.resume(); assert.equal(observed.has(anchor), true);
    callback([{ target: anchor, isIntersecting: false }]); assert.equal(visibility.visible.size, 0);
    visibility.dispose(); assert.equal(observed.size, 0);

    let releases = 0, hidden = 0, resumed = 0;
    const library = Object.create(ThreeLibraryScene.prototype);
    const entry = { record: { anchor: { classList: { remove() { hidden++; } } } }, model: { dispose() { releases++; } } };
    library.entries = new Map([['track', entry]]); library.mode = 'library';
    library.bindings = { suspend() {}, resume() { resumed++; } }; library.drag = { clear() {} };
    library.suspend(); library.setMode('library');
    assert.equal(hidden, 1); assert.equal(resumed, 1); assert.equal(releases, 0);
    assert.equal(library.entries.get('track'), entry);
});
