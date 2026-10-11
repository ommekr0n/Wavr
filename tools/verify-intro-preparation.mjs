import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerIntroPreparation } from '../js/core/rendering/three/PlayerIntroPreparation.js';
import { RendererViewport } from '../js/core/rendering/three/RendererViewport.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture(t, compile = () => Promise.resolve()) {
    const previous = globalThis.document; globalThis.document = { hidden: false };
    t.after(() => { globalThis.document = previous; });
    const allocations = [], compiles = [], initialized = new WeakMap();
    const module = name => ({ name, target: { width: 1, height: 1 }, resizes: 0,
        resize(width, height) { this.resizes++; this.target.width = width; this.target.height = height; } });
    const atelier = module('atelier'), sleeve = module('sleeve'), tear = module('tear');
    atelier.displayScene = 'display';
    const previousTarget = { name: 'caller' }, renderer = {
        target: previousTarget, getPixelRatio: () => 1.5, getRenderTarget() { return this.target; },
        setRenderTarget(target) { this.target = target; },
        initRenderTarget(target) {
            const size = `${target.width}x${target.height}`;
            if (initialized.get(target) === size) return;
            initialized.set(target, size); allocations.push(size);
        }
    };
    const owner = { renderer, atelier, sleeve, tear, viewport: new RendererViewport(), enabled: true,
        warmScene(module, scene) {
            compiles.push({ name: scene === 'display' ? 'display' : module.name, target: renderer.getRenderTarget() });
            return compile();
        }, warmSleeve() { return this.warmScene(sleeve); }
    };
    let yields = 0;
    const preparation = new PlayerIntroPreparation(owner, { yieldTask: () => { yields++; return Promise.resolve(); } });
    return { preparation, owner, renderer, allocations, compiles, previousTarget, yields: () => yields };
}

test('cold intro prepares full-size buffers and screen/offscreen variants before becoming ready', async t => {
    const f = fixture(t), pending = f.preparation.prepare(1200, 800);
    assert.deepEqual(f.allocations, ['1200x800', '1200x800']); assert.equal(f.preparation.ready, false);
    assert.equal(await pending, true); assert.equal(f.yields(), 6);
    assert.deepEqual(f.compiles.map(entry => [entry.name, entry.target]), [
        ['atelier', f.owner.atelier.target], ['display', null], ['sleeve', null],
        ['display', f.owner.tear.target], ['sleeve', f.owner.tear.target], ['tear', null]
    ]);
    assert.equal(f.renderer.getRenderTarget(), f.previousTarget);
    assert.equal(f.preparation.ready, true);
    f.owner.viewport.resizeModules(1200, 800, 1.5, [f.owner.atelier, f.owner.sleeve, f.owner.tear]);
    assert.deepEqual([f.owner.atelier.resizes, f.owner.sleeve.resizes, f.owner.tear.resizes], [1, 1, 1]);
    await f.preparation.prepare(1200, 800);
    assert.equal(f.compiles.length, 6); assert.equal(f.allocations.length, 2);
    await f.preparation.prepare(900, 1200);
    assert.equal(f.compiles.length, 6); assert.deepEqual(f.allocations.slice(2), ['900x1200', '900x1200']);
});

test('simultaneous idle warmup and first track opening share one preparation and restore render state while awaiting compilation', async t => {
    let finish;
    const f = fixture(t, () => new Promise(resolve => { finish = resolve; }));
    const first = f.preparation.prepare(1200, 800), second = f.preparation.prepare(1200, 800);
    assert.equal(first, second); await flush();
    assert.equal(f.compiles.length, 1); assert.equal(f.renderer.getRenderTarget(), f.previousTarget);
    for (let i = 0; i < 6; i++) { finish(); await flush(); }
    assert.equal(await first, true); assert.equal(f.compiles.length, 6);
});

test('failed compilation restores the caller target and can be retried on the next opening', async t => {
    let fail = true;
    const f = fixture(t, () => { if (fail) throw new Error('compile failed'); return Promise.resolve(); });
    await assert.rejects(f.preparation.prepare(1200, 800), /compile failed/);
    assert.equal(f.renderer.getRenderTarget(), f.previousTarget); assert.equal(f.preparation.ready, false);
    assert.equal(f.preparation.pending, null); fail = false;
    assert.equal(await f.preparation.prepare(1200, 800), true);
});

test('context loss invalidates in-flight readiness; disabled and hidden rendering allocate nothing', async t => {
    let finish, wait = true;
    const f = fixture(t, () => wait ? new Promise(resolve => { finish = resolve; }) : Promise.resolve());
    f.owner.enabled = false; assert.equal(await f.preparation.prepare(1200, 800), false);
    f.owner.enabled = true; document.hidden = true; assert.equal(await f.preparation.prepare(1200, 800), false);
    assert.equal(f.allocations.length, 0); document.hidden = false;
    const stale = f.preparation.prepare(1200, 800); await flush(); f.preparation.reset();
    finish(); assert.equal(await stale, false); assert.equal(f.compiles.length, 1); assert.equal(f.preparation.ready, false);
    wait = false; assert.equal(await f.preparation.prepare(1200, 800), true);
    assert.equal(f.compiles.length, 7);
});
