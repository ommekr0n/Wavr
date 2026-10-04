import test from 'node:test';
import assert from 'node:assert/strict';
import { attachThreeContextRecovery } from '../js/features/visualizer/ThreeContextRecovery.js';
import { setGraphicsAvailability, observeGraphicsAvailability } from '../js/features/visualizer/GraphicsAvailability.js';

function fixture(t) {
    const original = globalThis.document;
    globalThis.document = { documentElement: { dataset: {} } };
    setGraphicsAvailability('ready');
    t.after(() => { setGraphicsAvailability('ready'); globalThis.document = original; });
    const canvas = new EventTarget(), states = [], messages = [];
    const controller = { renderer: { domElement: canvas }, setEnabled: state => states.push(state) };
    const abort = new AbortController();
    observeGraphicsAvailability(message => messages.push(message));
    attachThreeContextRecovery(controller, abort.signal);
    return { canvas, states, messages, abort };
}

test('context loss pauses graphics, prevents permanent loss and restores rendering with one notification', t => {
    const { canvas, states, messages } = fixture(t);
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    assert.equal(lost.defaultPrevented, true);
    assert.deepEqual(states, [false]);
    assert.equal(document.documentElement.dataset.graphicsState, 'recovering');
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Music and lyrics still work/);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    assert.deepEqual(states, [false, true]);
    assert.equal(document.documentElement.dataset.graphicsState, 'ready');
    assert.equal(messages.length, 1);
});

test('renderer disposal cancels recovery handlers so stale canvas events cannot restart graphics', t => {
    const { canvas, states, abort } = fixture(t);
    abort.abort();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    assert.deepEqual(states, []);
});

test('graphics startup failure can be reported after the app UI finishes loading', t => {
    fixture(t);
    setGraphicsAvailability('unavailable');
    const messages = [];
    observeGraphicsAvailability(message => messages.push(message));
    assert.equal(messages.length, 1);
    assert.match(messages[0], /unavailable in this browser/);
    setGraphicsAvailability('ready');
    assert.equal(messages.length, 1);
});
