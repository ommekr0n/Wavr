import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RenderScheduler } from '../js/core/rendering/three/RenderScheduler.js';

function harness(render = () => {}) {
    let id = 0;
    const callbacks = new Map(), canvas = { dataset: {} };
    const scheduler = new RenderScheduler(render, { raf: callback => {
        callbacks.set(++id, callback); return id;
    }, cancel: frame => callbacks.delete(frame),
    onStateChange: state => { canvas.dataset.renderState = state; } });
    return { scheduler, canvas, callbacks, step(now) {
        const batch = [...callbacks.values()]; callbacks.clear(); batch.forEach(callback => callback(now));
    } };
}

test('steady 59.94 Hz callbacks do not drop alternating frames', () => {
    let count = 0; const h = harness(() => count++); h.scheduler.resume(true);
    for (let frame = 1; frame <= 600; frame++) h.step(frame * 1000 / 59.94);
    assert.equal(count, 600); assert.equal(h.callbacks.size, 1);
});

test('scheduling works without a DOM target and reports only changes when diagnostics are supplied', () => {
    let callback, count = 0;
    const scheduler = new RenderScheduler(() => count++, { raf: cb => { callback = cb; return 1; }, cancel: () => {} });
    scheduler.resume(false); callback(17); scheduler.stop();
    assert.equal(count, 1);
    const states = [];
    const monitored = new RenderScheduler(() => {}, {
        raf: cb => { callback = cb; return 1; }, cancel: () => {}, onStateChange: state => states.push(state)
    });
    monitored.resume(true); callback(17); callback(34);
    monitored.stop(); monitored.stop();
    assert.deepEqual(states, ['active', 'stopped']);
});

test('144 Hz displays stay near 60 draws per second with one pending callback', () => {
    let count = 0; const h = harness(() => count++); h.scheduler.resume(true);
    for (let frame = 1; frame <= 1440; frame++) { h.step(frame * 1000 / 144); assert.equal(h.callbacks.size, 1); }
    assert.ok(count >= 599 && count <= 602, `Unexpected draw count: ${count}`);
});

test('idle updates coalesce and stopping cancels pending work', () => {
    let count = 0; const h = harness(() => count++); h.scheduler.resume(false); h.step(17);
    assert.equal(h.canvas.dataset.renderState, 'idle'); assert.equal(h.callbacks.size, 0);
    for (let i = 0; i < 20; i++) h.scheduler.requestFrame();
    assert.equal(h.callbacks.size, 1); h.step(34); assert.equal(count, 2); assert.equal(h.callbacks.size, 0);
    h.scheduler.requestFrame(); h.scheduler.stop(); h.step(51);
    assert.equal(count, 2); assert.equal(h.canvas.dataset.renderState, 'stopped');
    h.scheduler.resume(false); h.step(1000); assert.equal(count, 3);
});

test('a background-tab stall does not produce a burst of catch-up draws', () => {
    let count = 0; const h = harness(() => count++); h.scheduler.resume(true);
    h.step(17); h.step(5000); h.step(5008);
    assert.equal(count, 2); h.step(5017); assert.equal(count, 3);
});
