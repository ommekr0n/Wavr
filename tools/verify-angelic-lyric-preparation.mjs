import test from 'node:test';
import assert from 'node:assert/strict';
import { warmAngelicLyric } from '../js/features/angelic/AngelicLyricWarmup.js';
import { scheduleAngelicLyricPreparation, cancelAngelicLyricPreparation } from '../js/features/angelic/AngelicLyricPreparation.js';

function runtime(t) {
    const saved = new Map(['window', 'document', 'setTimeout', 'clearTimeout'].map(key => [key, globalThis[key]]));
    const timers = new Map(), idle = new Map(); let id = 0;
    const view = { hidden: false, classList: { contains: () => view.hidden } };
    globalThis.document = { getElementById: () => view };
    globalThis.setTimeout = (fn, delay) => { const key = ++id; timers.set(key, { fn, delay }); return key; };
    globalThis.clearTimeout = key => timers.delete(key);
    globalThis.window = {
        requestIdleCallback(fn, options) { const key = ++id; idle.set(key, { fn, options }); return key; },
        cancelIdleCallback: key => idle.delete(key)
    };
    t.after(() => { for (const [key, value] of saved) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
    const anchor = { isConnected: true }, container = { querySelector: () => anchor };
    return { timers, idle, view, anchor, container,
        timeout() { const [key, task] = timers.entries().next().value; timers.delete(key); task.fn(); },
        work() { const [key, task] = idle.entries().next().value; idle.delete(key); task.fn(); } };
}

test('prepare after the pop peak but retain a 500ms lead for a short next line', t => {
    const rt = runtime(t); let prepared = 0;
    scheduleAngelicLyricPreparation(rt.container, () => prepared++, 4);
    assert.equal([...rt.timers.values()][0].delay, 1050);
    rt.timeout();
    assert.equal(prepared, 0);
    assert.equal([...rt.idle.values()][0].options.timeout, 150);
    rt.work(); assert.equal(prepared, 1);
    scheduleAngelicLyricPreparation(rt.container, () => prepared++, .8);
    assert.equal([...rt.timers.values()][0].delay, 300);
    cancelAngelicLyricPreparation(rt.container);
    assert.equal(rt.timers.size, 0);
});

test('seeks replace pending work; exit cancels idle work; old track nodes cannot prepare', t => {
    const rt = runtime(t); let prepared = '';
    scheduleAngelicLyricPreparation(rt.container, () => prepared = 'old', 3);
    scheduleAngelicLyricPreparation(rt.container, () => prepared = 'new', 3);
    assert.equal(rt.timers.size, 1);
    rt.timeout(); rt.work(); assert.equal(prepared, 'new');
    scheduleAngelicLyricPreparation(rt.container, () => prepared = 'exit', 3);
    rt.timeout(); cancelAngelicLyricPreparation(rt.container);
    assert.equal(rt.idle.size, 0);
    scheduleAngelicLyricPreparation(rt.container, () => prepared = 'stale', 3);
    rt.anchor.isConnected = false;
    rt.timeout(); rt.work(); assert.equal(prepared, 'new');
    rt.anchor.isConnected = true; rt.view.hidden = true;
    scheduleAngelicLyricPreparation(rt.container, () => prepared = 'hidden', 3);
    rt.timeout(); rt.work(); assert.equal(prepared, 'new');
});

test('warming remains bounded to two prepared lines even after many seeks', () => {
    const wrappers = [];
    const root = { querySelectorAll: () => wrappers.filter(w => w.warm) };
    for (let i = 0; i < 30; i++) {
        const node = { parentElement: root, warm: false, setAttribute(key, value) { this[key] = value; } };
        node.classList = { add: () => node.warm = true, remove: () => node.warm = false };
        wrappers.push(node); warmAngelicLyric(node);
        assert.equal(node['aria-hidden'], 'true');
        assert.ok(root.querySelectorAll().length <= 2);
    }
    assert.deepEqual(wrappers.map(w => w.warm), Array(28).fill(false).concat(true, true));
});
