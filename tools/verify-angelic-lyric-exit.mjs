import test from 'node:test';
import assert from 'node:assert/strict';
import { exitAngelicLyric } from '../js/features/angelic/AngelicLyricExit.js';

function fixture(t) {
    const saved = [globalThis.setTimeout, globalThis.clearTimeout];
    const timers = new Map(); let id = 0;
    globalThis.setTimeout = (fn, duration) => { const key = ++id; timers.set(key, { fn, duration }); return key; };
    globalThis.clearTimeout = key => timers.delete(key);
    t.after(() => { [globalThis.setTimeout, globalThis.clearTimeout] = saved; });
    const listeners = new Map(), classes = new Set(), variables = new Map();
    const node = {
        removed: 0,
        classList: { add: name => classes.add(name) },
        style: { setProperty: (key, value) => variables.set(key, value) },
        addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: name => listeners.delete(name),
        remove() { this.removed++; }
    };
    return { node, listeners, classes, variables, timers };
}

test('one exit lease; only the wrapper completion releases DOM and fallback', t => {
    const { node, listeners, classes, variables, timers } = fixture(t);
    exitAngelicLyric(null); exitAngelicLyric(node); exitAngelicLyric(node);
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].duration, 900);
    assert.ok(classes.has('ink-wash-exit'));
    assert.ok(Math.abs(parseFloat(variables.get('--exit-rot'))) <= 1);
    const end = listeners.get('animationend');
    end({ target: {}, animationName: 'ink-wash-text-mist' });
    end({ target: node, animationName: 'unrelated' });
    assert.equal(node.removed, 0);
    end({ target: node, animationName: 'ink-wash-float-composite' });
    assert.equal(node.removed, 1);
    assert.equal(timers.size, 0);
    assert.equal(listeners.size, 0);
});

test('fallback cleans up when animationend is unavailable or the mode was closed', t => {
    const { node, listeners, timers } = fixture(t);
    exitAngelicLyric(node);
    [...timers.values()][0].fn();
    assert.equal(node.removed, 1);
    assert.equal(listeners.size, 0);
    assert.equal(timers.size, 0);
});
