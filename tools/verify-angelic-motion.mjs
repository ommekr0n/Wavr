import test from 'node:test';
import assert from 'node:assert/strict';
import { AngelicStaffMotion } from '../js/features/angelic/AngelicStaffMotion.js';
import { AngelicButterflyFlight } from '../js/core/rendering/three/AngelicButterflyFlight.js';

function element(attributes = {}, textContent = '') {
    return { attributes: { ...attributes }, textContent, style: {}, isConnected: true,
        getAttribute(name) { return this.attributes[name] ?? null; },
        setAttribute(name, value) { this.attributes[name] = String(value); }
    };
}

function wrapper() {
    const node = element({ 'data-w': 1000, 'data-staff-gap': 50, 'data-y-center': 275, 'data-amp': 50 });
    const path = element({ 'data-y': 175 });
    const motif = element({ 'data-t': 0.25, 'data-l': 1, 'data-font': 65 });
    const floral = element({ 'data-x': 250, 'data-offset': -100, 'data-up': 'true', 'data-jitter': 4 });
    node.queries = 0; node.prebuilt = false; node.exiting = false;
    node.classList = { contains: name => name === 'ink-wash-exit' && node.exiting };
    node.matches = () => !node.prebuilt && !node.exiting;
    node.querySelectorAll = selector => {
        node.queries++;
        return selector === '.staff-line' ? [path] : selector === '.staff-motif-anim' ? [motif] : [floral];
    };
    return { node, path, motif, floral };
}

function runtime(t, children) {
    const saved = new Map(['document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
    const callbacks = new Map(), listeners = new Set();
    let id = 0;
    const doc = { hidden: false, getElementById: () => ({ children }),
        addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
    globalThis.document = doc;
    globalThis.requestAnimationFrame = fn => { const key = id++; callbacks.set(key, fn); return key; };
    globalThis.cancelAnimationFrame = key => callbacks.delete(key);
    t.after(() => { for (const [key, value] of saved) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
    return { callbacks, listeners, doc,
        tick(now) { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn(now)); } };
}

test('staff retains the original curve, motif position, floral lean and depth', () => {
    const { node, path, motif, floral } = wrapper();
    const motion = new AngelicStaffMotion();
    motion.records.set(node, motion.capture(node));
    for (const phase of [-Math.PI, -1, 0, 1, Math.PI / 2, Math.PI]) {
        motion.update(phase);
        const coordinates = path.attributes.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
        assert.ok(Math.abs(coordinates[3] - (175 - 50 * Math.sin(phase))) < 0.001);
        assert.ok(Math.abs(coordinates[5] - (175 + 50 * Math.sin(phase))) < 0.001);
        const motifWave = Math.sin(phase + 3 * 0.3);
        assert.ok(Math.abs(Number(motif.attributes.y) - (325 + 65 * 0.3 - 14.0625 * motifWave)) < 0.001);
        const lean = Math.max(-35, Math.min(35, Math.atan2(150 * Math.sin(phase) * 0.125, 1000) * 180 / Math.PI + 4));
        const transform = floral.attributes.transform.match(/-?\d+(?:\.\d+)?/g).map(Number);
        assert.ok(Math.abs(transform[1] - (175 - 14.0625 * Math.sin(phase))) < 0.001);
        assert.ok(Math.abs(transform[2] - (-90 - lean)) < 0.001);
        assert.equal(transform[3], Number((1 + Math.cos(phase) * 0.15).toFixed(3)));
    }
});

test('one loop, cached selectors and steady 30Hz geometry on a 59.94Hz display', t => {
    const first = wrapper(), next = wrapper(); next.node.prebuilt = true;
    const rt = runtime(t, [first.node, next.node]);
    const motion = new AngelicStaffMotion();
    let updates = 0;
    const update = motion.update.bind(motion);
    motion.update = time => { updates++; update(time); };
    motion.start(); motion.start();
    assert.equal(rt.callbacks.size, 1);
    for (let i = 0; i < 60; i++) rt.tick(i * 1000 / 59.94);
    assert.ok(updates >= 30 && updates <= 31, `geometry updates: ${updates}`);
    assert.equal(first.node.queries, 3);
    assert.equal(next.node.queries, 0);
    next.node.prebuilt = false; motion.start();
    assert.equal(next.node.queries, 3);
    assert.equal(motion.records.size, 2);
    assert.equal(rt.callbacks.size, 1);
    motion.stop();
    assert.equal(rt.callbacks.size, 0);
    assert.equal(rt.listeners.size, 0);
    assert.equal(motion.records.size, 0);
});

test('hidden tabs cancel work and resume one loop; detached wrappers are released', t => {
    const first = wrapper();
    const rt = runtime(t, [first.node]), motion = new AngelicStaffMotion();
    motion.start();
    rt.doc.hidden = true; [...rt.listeners].forEach(fn => fn());
    assert.equal(rt.callbacks.size, 0);
    rt.doc.hidden = false; [...rt.listeners].forEach(fn => fn());
    assert.equal(rt.callbacks.size, 1);
    first.node.isConnected = false; rt.tick(0);
    assert.equal(motion.records.size, 0);
    assert.equal(rt.callbacks.size, 0);
    assert.equal(rt.listeners.size, 0);
    assert.equal(motion.running, false);
});

test('outgoing florals freeze for the dissolve while the persistent staff keeps waving', t => {
    const outgoing = wrapper(), staff = wrapper(), incoming = wrapper();
    const rt = runtime(t, [outgoing.node, staff.node]), motion = new AngelicStaffMotion();
    motion.start(); motion.update(0);
    const frozen = { ...outgoing.floral.attributes };
    const staffBefore = staff.path.attributes.d;
    outgoing.node.exiting = true;
    rt.doc.getElementById = () => ({ children: [outgoing.node, staff.node, incoming.node] });
    motion.start(); motion.update(1);
    assert.deepEqual(outgoing.floral.attributes, frozen);
    assert.notEqual(staff.path.attributes.d, staffBefore);
    assert.ok(incoming.path.attributes.d);
    assert.equal(motion.records.has(outgoing.node), false);
    motion.start();
    assert.equal(motion.records.has(outgoing.node), false, 'do not re-capture a fading line');
    motion.stop();
});

test('butterfly follows the original CSS keyframes, randomized calc midpoint and resize', t => {
    const saved = globalThis.getComputedStyle;
    let reads = 0;
    globalThis.getComputedStyle = node => { reads++; return node.dimensions; };
    t.after(() => { if (saved === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = saved; });
    const variables = { sx: '-20vw', sy: '120vh', sr: '5deg', mx: 'calc(40vw + -5vw)', my: 'calc(50vh + 8vh)', mr: '-5deg', ex: '120vw', ey: '-20vh', er: '10deg' };
    const node = { dimensions: { width: '120px', height: '120px' }, style: { getPropertyValue: key => variables[key.slice(2)] } };
    const sprite = { dimensions: { width: '96px', height: '76px' } };
    const flight = new AngelicButterflyFlight(node, sprite, 1000);
    const expected = [[0, -0.2, 1.2, 5, 0], [0.15, -0.09, 1.076, 5, 1], [0.4, 0.35, 0.58, -5, 1], [0.55, 0.35, 0.58, -5, 1], [0.8, 1.03, -0.044, 10, 1], [1, 1.2, -0.2, 10, 0]];
    const sample = flight.sample;
    for (const width of [496, 1000, 1920]) for (const [time, x, y, degrees, opacity] of expected) {
        const result = flight.update(1000 + time * 6000, width, 716), angle = degrees * Math.PI / 180;
        assert.equal(result, sample);
        assert.ok(Math.abs(result.x - (x * width + 60 - Math.cos(angle) * 12 + Math.sin(angle) * 22)) < 0.01);
        assert.ok(Math.abs(result.y - (y * 716 + 60 - Math.sin(angle) * 12 - Math.cos(angle) * 22)) < 0.01);
        assert.ok(Math.abs(result.opacity - opacity) < 0.001);
    }
    assert.equal(reads, 2, 'only read computed styles at spawn, never in the render loop');
});
