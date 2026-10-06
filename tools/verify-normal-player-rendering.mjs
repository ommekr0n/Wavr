import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ThreeChromaticAtelier } from '../js/core/rendering/three/ThreeChromaticAtelier.js';
import { ThreeLivingSleeve } from '../js/core/rendering/three/ThreeLivingSleeve.js';

const colors = [0x6ca58e, 0x263346, 0xae8960, 0x616a86].map(color => new THREE.Color(color));

test('Atelier keeps a bounded buffer, paints at 30Hz and restores the renderer target', () => {
    const atelier = new ThreeChromaticAtelier(); atelier.resize(3840, 2160);
    assert.ok(atelier.target.width * atelier.target.height < 362000);
    const previous = {}, targets = [], renderer = { target: previous, getRenderTarget() { return this.target; }, setRenderTarget(target) { this.target = target; targets.push(target); }, render() {} };
    for (const now of [0, 10, 20, 34]) { atelier.dirty = true; atelier.render(renderer, now); assert.equal(renderer.target, previous); }
    assert.equal(targets.filter(target => target === atelier.target).length, 2);
    let disposed = 0; atelier.target.addEventListener('dispose', () => disposed++); atelier.dispose(); assert.equal(disposed, 1);
});

test('a paused or reduced-motion Atelier freezes flow while the new palette settles', () => {
    const atelier = new ThreeChromaticAtelier();
    const paused = { playing: false, energy: 1 };
    for (let i = 0; i < 200; i++) atelier.update(.05, paused, colors, false);
    assert.equal(atelier.uniforms.uTime.value, 0); assert.equal(atelier.settling, false);
    const playing = { playing: true, energy: .5 };
    atelier.update(.05, playing, colors, true); assert.equal(atelier.uniforms.uTime.value, 0);
    atelier.update(.05, playing, colors, false); assert.ok(atelier.uniforms.uTime.value > 0); atelier.dispose();
});

function sleeveFixture() {
    const names = new Set();
    const root = { parentElement: {}, classList: { toggle(key, value) { value ? names.add(key) : names.delete(key); }, remove(key) { names.delete(key); } } };
    const image = { src: 'first', closest: () => root, getBoundingClientRect: () => ({ x: 30, y: 40, width: 200, height: 200, left: 30, top: 40 }) };
    const view = { getBoundingClientRect: () => ({ x: 0, y: 0 }) };
    globalThis.document = { getElementById: id => id === 'cover-art' ? image : view };
    globalThis.MutationObserver = globalThis.ResizeObserver = class { observe() {} disconnect() {} };
    const refs = new Map(), resources = new Map();
    const textures = { acquire(url) { refs.set(url, (refs.get(url) || 0) + 1); const resource = { ready: false, texture: new THREE.Texture() }; resources.set(url, resource); return resource; },
        release(url) { refs.set(url, refs.get(url) - 1); } };
    const sleeve = new ThreeLivingSleeve(textures, () => {}, { x: -1000, y: -1000 }); sleeve.resize(1000, 700); sleeve.setActive(true);
    const update = () => sleeve.update(.05, { playing: false }, colors, false);
    return { sleeve, image, refs, resources, names, update };
}

test('rapid album changes release superseded textures and mode exit releases every lease', () => {
    const f = sleeveFixture(); f.update(); f.resources.get('first').ready = true; f.update();
    assert.ok(f.names.has('living-sleeve-ready'));
    for (let i = 0; i < 50; i++) { f.image.src = `cover-${i}`; f.sleeve.dirty = true; f.update(); }
    assert.equal([...f.refs.values()].reduce((a, b) => a + b, 0), 2);
    f.resources.get('cover-49').ready = true;
    for (let i = 0; i < 30; i++) f.update();
    assert.equal(f.sleeve.entry.url, 'cover-49'); assert.equal(f.sleeve.reveal, 1);
    f.sleeve.setActive(false); assert.equal([...f.refs.values()].reduce((a, b) => a + b, 0), 0);
    assert.equal(f.names.has('living-sleeve-ready'), false); f.sleeve.dispose();
});

test('an unreadable album texture returns artwork to DOM fallback and releases the old cover', () => {
    const f = sleeveFixture(); f.update(); f.resources.get('first').ready = true; f.update();
    f.image.src = 'unreadable'; f.sleeve.dirty = true; f.update(); f.resources.get('unreadable').failed = true; f.update();
    assert.equal(f.names.has('living-sleeve-ready'), false); assert.equal(f.sleeve.group.visible, false);
    assert.equal([...f.refs.values()].reduce((a, b) => a + b, 0), 0); f.sleeve.dispose();
});

test('record spins during playback, coasts to an idle pause and freezes for reduced motion', () => {
    const f = sleeveFixture(); f.update(); f.resources.get('first').ready = true;
    for (let i = 0; i < 30; i++) f.update();
    for (let i = 0; i < 50; i++) f.sleeve.update(.05, { playing: true }, colors, false);
    assert.ok(f.sleeve.disc.group.rotation.z < -1);
    const beforePause = f.sleeve.disc.group.rotation.z;
    for (let i = 0; i < 100; i++) f.update();
    assert.ok(f.sleeve.disc.group.rotation.z < beforePause);
    assert.equal(f.sleeve.animating, false);
    const stopped = f.sleeve.disc.group.rotation.z;
    for (let i = 0; i < 20; i++) f.update();
    assert.equal(f.sleeve.disc.group.rotation.z, stopped);
    for (let i = 0; i < 30; i++) f.sleeve.update(.05, { playing: true }, colors, true);
    assert.equal(f.sleeve.disc.group.rotation.z, stopped);
    assert.equal(f.sleeve.animating, false); f.sleeve.dispose();
});
