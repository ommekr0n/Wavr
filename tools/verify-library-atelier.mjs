import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LibraryArtworkBudget } from '../js/core/rendering/three/LibraryArtworkBudget.js';
import { LibraryModelResources } from '../js/core/rendering/three/LibraryModelResources.js';
import { LibrarySleeveModel } from '../js/core/rendering/three/LibrarySleeveModel.js';
import { LibraryCrateModel } from '../js/core/rendering/three/LibraryCrateModel.js';
import { LibraryObjectMotion } from '../js/core/rendering/three/LibraryObjectMotion.js';
import { ThreeLibraryScene } from '../js/core/rendering/three/ThreeLibraryScene.js';
import { LibraryVisibleItems } from '../js/features/library/LibraryVisibleItems.js';
import { bindLibraryBoxPointer, clearLibraryBoxPointer } from '../js/features/library/LibraryBoxListenerScope.js';
import { readLibraryBackgroundUrl } from '../js/features/library/LibraryArtworkSource.js';
import { libraryPointerKey } from '../js/core/rendering/three/LibraryPointerFocus.js';
import { armLibraryDragCancellation } from '../js/features/library/LibraryDragCancellation.js';

test('library texture leases share a tier, bound inactive memory and ignore superseded loads', async () => {
    const pending = new Map(); let invalidations = 0;
    const budget = new LibraryArtworkBudget(() => invalidations++, {
        maxBytes: 400000, maxInactive: 1,
        load: url => new Promise(resolve => pending.set(url, resolve)), resize: (_image, size) => ({ width: size, height: size }),
    });
    const a = budget.acquire('a', 256), again = budget.acquire('a', 256);
    assert.equal(a, again); assert.equal(a.refs, 2);
    budget.release(a); assert.equal(a.refs, 1);
    const b = budget.acquire('b', 256), c = budget.acquire('c', 256);
    let disposed = 0; a.texture.addEventListener('dispose', () => disposed++);
    budget.release(a); budget.release(b); budget.release(c);
    assert.equal(disposed, 1); assert.ok(budget.bytes <= budget.maxBytes); assert.equal(budget.entries.size, 1);
    pending.get('a')({}); pending.get('b')({}); pending.get('c')({});
    await Promise.resolve(); await Promise.resolve();
    assert.equal(invalidations, 1); assert.equal(c.ready, true);
    const fresh = budget.acquire('a', 256);
    budget.dispose(); pending.get('a')({}); await Promise.resolve();
    assert.equal(fresh.ready, false); assert.equal(budget.entries.size, 0);
});

test('a failed artwork settles once and does not strand a pending texture lease', async () => {
    let notices = 0;
    const budget = new LibraryArtworkBudget(() => notices++, { load: () => Promise.reject(new Error('missing cover')), maxInactive: 0 });
    const lease = budget.acquire('bad', 256);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(lease.failed, true); assert.equal(notices, 1);
    budget.release(lease); assert.equal(budget.bytes, 0); budget.dispose();
});

test('hundreds of sleeves and empty/full crates reuse geometry; entity disposal preserves the shared assets', () => {
    const resources = new LibraryModelResources(); const lease = { ready: true, texture: null };
    const models = Array.from({ length: 120 }, () => new LibrarySleeveModel(resources, lease));
    models.push(new LibraryCrateModel(resources, []), new LibraryCrateModel(resources, [lease, lease, lease, lease]));
    const geometries = new Set();
    models.forEach(model => model.group.traverse(object => { if (object.geometry) geometries.add(object.geometry); }));
    assert.ok(geometries.size <= 5);
    let sharedDisposals = 0; resources.jacket.addEventListener('dispose', () => sharedDisposals++);
    models.forEach(model => { assert.equal(model.ready, true); model.update(.7, 1); model.dispose(); });
    assert.equal(sharedDisposals, 0); resources.dispose(); assert.equal(sharedDisposals, 1);
});

test('hover/drop motion settles to idle and reduced motion resolves immediately', () => {
    const motion = new LibraryObjectMotion();
    motion.update(1 / 60, true, true, false); assert.equal(motion.animating, true);
    for (let i = 0; i < 60; i++) motion.update(1 / 60, true, true, false);
    assert.equal(motion.animating, false); assert.equal(motion.hover, 1); assert.equal(motion.drop, 1);
    for (let i = 0; i < 60; i++) motion.update(1 / 60, false, false, false);
    assert.equal(motion.animating, false); assert.equal(motion.hover, 0);
    motion.update(1 / 60, true, true, true); assert.equal(motion.animating, false); assert.equal(motion.drop, 1);
});

test('visible-row membership retires removed anchors and disconnects on a view exit', () => {
    const original = globalThis.IntersectionObserver; let callback, disconnected = false; const observed = new Set();
    globalThis.IntersectionObserver = class {
        constructor(cb) { callback = cb; }
        observe(node) { observed.add(node); } unobserve(node) { observed.delete(node); }
        disconnect() { disconnected = true; }
    };
    try {
        const items = new LibraryVisibleItems({}, () => {}); const a = {}, b = {};
        items.sync(new Set([a, b])); callback([{ target: a, isIntersecting: true }, { target: b, isIntersecting: false }]);
        assert.deepEqual([...items.visible], [a]); items.sync(new Set([b]));
        assert.equal(observed.has(a), false); assert.equal(items.visible.size, 0);
        items.dispose(); assert.equal(disconnected, true); assert.equal(items.nodes.size, 0);
    } finally { globalThis.IntersectionObserver = original; }
});

test('grid/tray rendering restores scissor, camera and autoClear even when drawing fails', () => {
    const scene = Object.create(ThreeLibraryScene.prototype); scene.height = 720;
    scene.bindings = { clip: { left: 0, right: 1280, top: 92, bottom: 720 } }; scene.entries = new Map();
    let layer = 0, scissor = false, autoClear = true;
    scene.camera = { layers: { set(value) { layer = value; } } };
    const renderer = { setScissorTest(value) { scissor = value; }, clear() {}, setScissor() {}, render() { throw new Error('lost'); },
        set autoClear(value) { autoClear = value; }, get autoClear() { return autoClear; } };
    assert.throws(() => scene.render(renderer), /lost/);
    assert.equal(scissor, false); assert.equal(layer, 0); assert.equal(autoClear, true);
});

test('reopening a crate owns one inner-drag listener and closing releases it', () => {
    const card = new EventTarget(); let old = 0, current = 0;
    bindLibraryBoxPointer(card, () => old++); bindLibraryBoxPointer(card, () => current++);
    card.dispatchEvent(new Event('pointerdown')); assert.equal(old, 0); assert.equal(current, 1);
    clearLibraryBoxPointer(card); card.dispatchEvent(new Event('pointerdown')); assert.equal(current, 1);
});

test('crate previews preserve data SVGs and URLs containing parentheses', () => {
    const source = 'data:image/svg+xml,%3Csvg%20fill%3D%22hsl(53%2C26%25%2C32%25)%22%3E';
    assert.equal(readLibraryBackgroundUrl(`url("${source}")`), source);
    assert.equal(readLibraryBackgroundUrl("url('https://art.test/album (deluxe).jpg')"), 'https://art.test/album (deluxe).jpg');
    assert.equal(readLibraryBackgroundUrl('none'), null);
});

test('re-rendering a card with the same ID keeps its model and lease; offscreen retirement releases both', () => {
    const oldDocument = globalThis.document;
    globalThis.document = { body: { classList: { contains: () => false } }, activeElement: null };
    let acquired = 0, released = 0;
    const resources = new LibraryModelResources();
    const collection = Object.create(ThreeLibraryScene.prototype);
    Object.assign(collection, { scene: new THREE.Scene(), resources, entries: new Map(), pointer: { x: -1000, y: -1000 },
        width: 800, height: 600, visualState: { sync() {} }, drag: { update() {} },
        budget: { acquire() { acquired++; return { texture: new THREE.Texture(), ready: true }; }, release(lease) { released++; lease.texture.dispose(); } } });
    const flags = () => ({ contains: () => false, toggle() {}, remove() {} });
    const record = () => ({ key: 'song:grid:a', urls: ['a'], color: '#444444', card: { classList: flags(), contains: () => false },
        anchor: { classList: flags() }, rect: { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }, clip: { left: 0, top: 0, right: 800, bottom: 600 } });
    const first = record();
    const bind = item => { collection.bindings = { sync() {}, visibility: { visible: new Set([item.anchor]) }, byKey: new Map([[item.key, item]]), byAnchor: new Map([[item.anchor, item]]) }; };
    try {
        bind(first); collection.update(1 / 60, false);
        const model = collection.entries.get(first.key).model;
        const next = record(); bind(next); collection.update(1 / 60, false);
        assert.equal(collection.entries.get(next.key).model, model); assert.equal(acquired, 1); assert.equal(released, 0);
        collection.bindings.visibility.visible.clear(); collection.update(1 / 60, false);
        assert.equal(collection.entries.size, 0); assert.equal(released, 1);
    } finally { resources.dispose(); globalThis.document = oldDocument; }
});

test('pointer invalidation only identifies visible artwork within its scroll clip', () => {
    const entries = new Map([['a', { model: { group: { visible: true } }, record: {
        rect: { left: 10, top: 0, right: 100, bottom: 100 }, clip: { left: 0, top: 30, right: 80, bottom: 600 },
    } }]]);
    assert.equal(libraryPointerKey(entries, { x: 50, y: 50 }), 'a');
    assert.equal(libraryPointerKey(entries, { x: 50, y: 10 }), null);
    assert.equal(libraryPointerKey(entries, { x: 90, y: 50 }), null);
    entries.get('a').model.group.visible = false;
    assert.equal(libraryPointerKey(entries, { x: 50, y: 50 }), null);
});

test('Escape and leaving the editor cancel a drag once and release global handlers', () => {
    const originals = { window: globalThis.window, document: globalThis.document, observer: globalThis.MutationObserver };
    globalThis.window = new EventTarget(); let callback, disconnected = 0, hidden = false;
    globalThis.document = { getElementById: () => ({ classList: { contains: () => hidden } }) };
    globalThis.MutationObserver = class { constructor(cb) { callback = cb; } observe() {} disconnect() { disconnected++; } };
    let cancellations = 0, stop;
    try {
        stop = armLibraryDragCancellation(event => { cancellations++; assert.equal(event.type, 'pointercancel'); assert.equal(event.clientX, 20); stop(); }, { x: 20, y: 30 });
        const escape = new Event('keydown'); escape.key = 'Escape'; window.dispatchEvent(escape); window.dispatchEvent(new Event('blur'));
        assert.equal(cancellations, 1); assert.equal(disconnected, 1);
        stop = armLibraryDragCancellation(() => { cancellations++; stop(); }, { x: 20, y: 30 });
        hidden = true; callback(); window.dispatchEvent(new Event('blur')); assert.equal(cancellations, 2); assert.equal(disconnected, 2);
    } finally { stop?.(); globalThis.window = originals.window; globalThis.document = originals.document; globalThis.MutationObserver = originals.observer; }
});

test('cached artwork retains its face material across view models and releases it with the texture', () => {
    const resources = new LibraryModelResources();
    const budget = new LibraryArtworkBudget(() => {}, { load: () => new Promise(() => {}), maxInactive: 1 });
    const lease = budget.acquire('shared'); let materialsDisposed = 0;
    lease.material.addEventListener('dispose', () => materialsDisposed++);
    const home = new LibrarySleeveModel(resources, lease);
    const editor = new LibrarySleeveModel(resources, budget.acquire('shared'));
    assert.equal(home.face, editor.face);
    home.dispose(); budget.release(lease); editor.dispose(); budget.release(lease);
    assert.equal(materialsDisposed, 0); assert.equal(budget.entries.size, 1);
    budget.dispose(); assert.equal(materialsDisposed, 1); resources.dispose();
});
