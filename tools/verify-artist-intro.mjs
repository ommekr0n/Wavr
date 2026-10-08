import test from 'node:test';
import assert from 'node:assert/strict';
import { getArtistIntroProfile } from '../js/features/player/BvtgvngArtistRegistry.js';
import { setupArtistIntro } from '../js/features/player/ArtistIntroController.js';
import { REALITY_TEAR_DURATION } from '../js/features/player/RealityTearTiming.js';

test('artist intro recognizes full solo/collaboration credits, aliases, accents and explicit title features', () => {
    for (const track of [
        { artist: 'XOLITXO' }, { artist: 'wAvy182 & Bloodring' }, { artist: 'DJ Đại Vương' },
        { artist: 'MINHPHAM x XOLITXO' }, { artist: 'Other Artist feat. Rev' },
        { artist: ['Other Artist', { name: 'Wwt Sauce' }] }, { artist: 'bvtgvng' },
        { artist: 'Other Artist', title: 'Song (feat. Bloodring)' },
        { artist: 'Other Artist', title: 'Song [ft. MINHPHAM]' }
    ]) assert.equal(getArtistIntroProfile(track)?.id, 'bvtgvng', JSON.stringify(track));
});

test('title mentions, partial names and unconfirmed album guests do not trigger the intro', () => {
    for (const track of [null, {}, { artist: 'Rev Theory' }, { artist: 'NotBloodring' },
        { artist: 'Bluebby' }, { artist: 'sleepat6pm' }, { artist: 'KYTE' }, { artist: 'Woozy' },
        { artist: 'Other Artist', title: 'Rev / Bloodring / wAvy' },
        { artist: 'Other Artist', title: 'Song (feat. Rev Theory)' }
    ]) assert.equal(getArtistIntroProfile(track), null);
});

function fixture(t) {
    const keys = ['document', 'window', 'matchMedia', 'MutationObserver', 'setTimeout', 'clearTimeout', 'Image', 'innerWidth', 'innerHeight', 'getComputedStyle', 'performance'];
    const saved = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
    globalThis.performance = { now: () => 1000 };
    const timers = new Map(), animations = []; let timerId = 0, observer;
    class Node extends EventTarget {
        constructor() { super(); this.hidden = false; this.inert = false; this.isConnected = true; this.children = [];
            const values = new Map();
            this.style = { setProperty(key, value, priority = '') { values.set(key, [value, priority]); },
                getPropertyValue: key => values.get(key)?.[0] || '', getPropertyPriority: key => values.get(key)?.[1] || '', removeProperty: key => values.delete(key) };
            this.attributes = new Map();
            const names = new Set(); this.classList = { contains: key => names.has(key), add: key => names.add(key), remove: key => names.delete(key) }; }
        append(...nodes) { nodes.forEach(node => { node.parent = this; this.children.push(node); }); }
        setAttribute(key, value) { this.attributes.set(key, value); }
        getAttribute(key) { return this.attributes.get(key); }
        getAnimations() { return []; }
        querySelectorAll() { return this.children; }
        querySelector(selector) { return selector === '.am-player-left' ? this.children[0] : selector === '.am-lyrics-section' ? this.children[1] : null; }
        getBoundingClientRect() { return this.rect; }
        animate(frames, options) {
            let resolve;
            const animation = { element: this, frames, options, cancelled: false, finished: new Promise(done => { resolve = done; }),
                cancel() { this.cancelled = true; }, finish() { resolve(); } };
            animations.push(animation); return animation;
        }
        focus() { document.activeElement = this; }
        remove() { this.isConnected = false; this.parent.children = this.parent.children.filter(node => node !== this); }
    }
    const view = new Node(), cinematic = new Node(), angelic = new Node(), previousFocus = new Node();
    view.rect = { x: 0, y: 0, left: 0, top: 0, width: 1200, height: 800 };
    const left = new Node(), right = new Node();
    left.rect = { left: 100, top: 150, width: 420, height: 560, right: 520, bottom: 710 };
    right.rect = { left: 650, top: 180, width: 470, height: 520, right: 1120, bottom: 700 };
    view.append(left, right);
    globalThis.innerWidth = 1200; globalThis.innerHeight = 800;
    globalThis.getComputedStyle = () => ({ transform: 'none' });
    for (const node of [view, cinematic, angelic]) node.classList.add('hidden');
    const nodes = { 'player-view': view, 'cinematic-view': cinematic, 'angelic-view': angelic };
    globalThis.document = Object.assign(new EventTarget(), { body: new Node(), hidden: false, activeElement: previousFocus, timeline: { currentTime: 1000 },
        createElement: () => new Node(), getElementById: id => nodes[id] });
    globalThis.Image = class {};
    globalThis.window = new EventTarget(); const media = Object.assign(new EventTarget(), { matches: false }); globalThis.matchMedia = () => media;
    globalThis.MutationObserver = class { constructor(callback) { observer = this; this.callback = callback; } observe() {} disconnect() { this.disconnected = true; } };
    globalThis.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; }; globalThis.clearTimeout = id => timers.delete(id);
    const engine = Object.assign(new EventTarget(), { currentTime: 17, playing: true });
    const emit = (target, type, detail, properties = {}) => { const event = new Event(type, { cancelable: true }); Object.assign(event, { detail }, properties); target.dispatchEvent(event); return event; };
    const events = []; document.addEventListener('wavr:artistintro', event => events.push(event.detail));
    const dispose = setupArtistIntro({ engine }); const overlay = document.body.children[0];
    const open = () => { view.classList.remove('hidden'); view.classList.add('player-active'); observer.callback(); };
    const load = artist => emit(engine, 'trackchange', { track: { artist } });
    const finish = () => [...timers.values()][0]?.callback();
    t.after(() => { dispose(); Object.assign(globalThis, saved); });
    return { view, left, right, cinematic, angelic, previousFocus, engine, media, overlay, events, timers, animations, observer, open, load, finish, emit, dispose };
}

test('mini player waits for opening, runs once and never blocks playback controls or audio', t => {
    const f = fixture(t); f.load('Bloodring'); assert.equal(f.overlay.hidden, true);
    f.open(); assert.equal(f.overlay.hidden, false); assert.equal(f.view.inert, false);
    assert.equal(document.activeElement, f.previousFocus); assert.equal(f.events.at(-1).active, true);
    assert.equal([...f.timers.values()][0].delay, REALITY_TEAR_DURATION + 32);
    assert.equal(f.animations.length, 7); assert.ok(f.animations.every(animation => animation.options.duration === REALITY_TEAR_DURATION));
    assert.ok(f.animations.every(animation => animation.startTime === 1000));
    f.finish(); assert.equal(f.overlay.hidden, true); assert.equal(f.timers.size, 0);
    const count = f.events.length; f.view.classList.remove('player-active'); f.observer.callback(); f.open();
    assert.equal(f.events.length, count); assert.equal(f.engine.currentTime, 17); assert.equal(f.engine.playing, true);
});

test('rapid tracks cancel the old timeline and stale deadlines cannot dismiss the next intro', t => {
    const f = fixture(t); f.open(); f.load('XOLITXO'); const old = [...f.timers.values()][0].callback;
    f.load('Other Artist'); assert.equal(f.overlay.hidden, true); assert.equal(f.events.at(-1).active, false);
    f.load('Rev'); old(); assert.equal(f.overlay.hidden, false); assert.equal(f.timers.size, 1);
    f.finish(); assert.equal(f.overlay.hidden, true); assert.equal(document.body.children.length, 1);
});

test('mode exits and hidden pages cancel active intros; Cinematic does not queue a late reveal', t => {
    const f = fixture(t); f.open(); f.load('Bloodring');
    f.cinematic.classList.remove('hidden'); f.observer.callback(); assert.equal(f.overlay.hidden, true);
    f.load('Rev'); f.cinematic.classList.add('hidden'); f.observer.callback(); assert.equal(f.overlay.hidden, true);
    f.load('MINHPHAM'); document.hidden = true; f.emit(document, 'visibilitychange'); assert.equal(f.overlay.hidden, true);
    document.hidden = false; f.emit(document, 'visibilitychange'); assert.equal(f.overlay.hidden, true);
    f.load('XOLITXO'); f.view.classList.remove('player-active'); f.observer.callback(); f.open();
    assert.equal(f.overlay.hidden, true); assert.equal(f.timers.size, 0);
});

test('Escape, skip and errors cancel; Tab remains usable and focus restores only from Skip', t => {
    const f = fixture(t); f.open(); f.load('Bloodring');
    assert.equal(f.emit(document, 'keydown', undefined, { key: 'Tab' }).defaultPrevented, false);
    assert.equal(f.emit(document, 'keydown', undefined, { key: 'Escape' }).defaultPrevented, true);
    assert.equal(f.overlay.hidden, true); assert.equal(document.activeElement, f.previousFocus);
    f.load('XOLITXO'); f.overlay.children[0].focus(); f.emit(f.overlay.children[0], 'click');
    assert.equal(document.activeElement, f.previousFocus);
    f.load('Rev'); f.emit(f.engine, 'statechange', { state: 'error' }); assert.equal(f.timers.size, 0);
});

test('reduced motion omits the tear and disposal removes all lifetimes', t => {
    const f = fixture(t); f.media.matches = true; f.open(); f.load('Wwt Sauce');
    assert.equal(f.events.length, 0); assert.equal(f.timers.size, 0); assert.equal(f.overlay.hidden, true);
    f.media.matches = false; f.load('Bloodring'); f.dispose();
    assert.equal(f.events.at(-1).active, false); assert.equal(f.observer.disconnected, true);
    assert.equal(document.body.children.length, 0); assert.equal(f.timers.size, 0);
    const count = f.events.length; f.load('Bloodring'); assert.equal(f.events.length, count);
});

test('an open queue owns Escape while an artist intro runs behind it', t => {
    const f = fixture(t); f.open(); f.load('Bloodring');
    const getNode = document.getElementById, queue = { open: true };
    document.getElementById = id => id === 'queue-dialog' ? queue : getNode(id);
    assert.equal(f.emit(document, 'keydown', undefined, { key: 'Escape' }).defaultPrevented, false);
    assert.equal(f.overlay.hidden, false);
    queue.open = false;
    assert.equal(f.emit(document, 'keydown', undefined, { key: 'Escape' }).defaultPrevented, true);
    assert.equal(f.overlay.hidden, true);
});

test('compositor completion releases all layers; the deadline also handles a stalled compositor', async t => {
    const f = fixture(t); f.open(); f.load('Rev'); const first = [...f.animations];
    for (const animation of first) animation.finish(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.overlay.hidden, true); assert.equal(f.timers.size, 0);
    assert.ok(first.every(animation => animation.cancelled));
    f.load('Bloodring'); f.finish(); assert.equal(f.overlay.hidden, true);
    assert.ok(f.animations.every(animation => animation.cancelled));
    assert.equal(f.overlay.children[1].attributes.get('aria-hidden'), 'true');
});

test('the tear only animates transform and opacity and never rebuilds the existing player', t => {
    const f = fixture(t); f.open(); f.load('Bloodring'); const stage = f.overlay.children[1];
    for (const animation of f.animations) for (const frame of animation.frames) {
        assert.ok(Object.keys(frame).every(key => ['transform', 'opacity', 'offset', 'easing'].includes(key)));
    }
    for (let i = 0; i < 30; i++) f.load('Rev');
    assert.equal(f.overlay.children[1], stage); assert.equal(document.body.children.length, 1);
    assert.deepEqual(f.view.children, [f.left, f.right]); assert.equal(f.timers.size, 1);
    assert.ok(f.animations.slice(0, -7).every(animation => animation.cancelled));
});

test('the original panes move in opposite directions and clipping/origins restore exactly on every exit', t => {
    const f = fixture(t);
    f.left.style.setProperty('transform-origin', '10px 20px', 'important');
    f.open(); f.load('Bloodring');
    const left = f.animations.find(a => a.element === f.left), right = f.animations.find(a => a.element === f.right);
    assert.match(left.frames[2].transform, /translate\(-/); assert.doesNotMatch(right.frames[2].transform, /translate\(-/);
    assert.match(f.left.style.getPropertyValue('clip-path'), /^polygon\(/);
    assert.equal(f.events.at(-1).field.cx, 585);
    f.finish();
    assert.equal(f.left.style.getPropertyValue('transform-origin'), '10px 20px');
    assert.equal(f.left.style.getPropertyPriority('transform-origin'), 'important');
    assert.equal(f.left.style.getPropertyValue('clip-path'), '');
    f.load('Rev'); f.emit(window, 'resize');
    assert.equal(f.overlay.hidden, true); assert.equal(f.right.style.getPropertyValue('transform-origin'), '');
    assert.equal(f.timers.size, 0);
});

test('portrait uses a horizontal cut and only completes the player entrance transition', t => {
    const f = fixture(t); innerWidth = 390; innerHeight = 844;
    f.left.rect = { left: 24, top: 80, width: 342, height: 200, right: 366, bottom: 280 };
    f.right.rect = { left: 24, top: 340, width: 342, height: 470, right: 366, bottom: 810 };
    let entrance = 0, other = 0;
    f.view.getAnimations = () => [
        { transitionProperty: 'transform', effect: { target: f.view }, finish() { entrance++; } },
        { transitionProperty: 'opacity', effect: { target: f.view }, finish() { other++; } }
    ];
    f.open(); f.load('Bloodring');
    const field = f.events.at(-1).field;
    assert.equal(field.horizontal, true); assert.equal(field.cy, 310);
    assert.equal(entrance, 1); assert.equal(other, 0);
    f.media.matches = true; f.emit(f.media, 'change');
    assert.equal(f.left.style.getPropertyValue('clip-path'), ''); assert.equal(f.overlay.hidden, true);
});

test('a pre-centered toolbar transform keeps its translation and rotates around the screen cut', t => {
    const f = fixture(t);
    globalThis.getComputedStyle = element => ({ transform: element === f.left ? 'matrix(1, 0, 0, 1, -120, 0)' : 'none' });
    f.open(); f.load('Bloodring');
    assert.equal(f.left.style.getPropertyValue('transform-origin'), '365px 242px');
    const animation = f.animations.find(a => a.element === f.left);
    assert.ok(animation.frames.every(frame => frame.transform.endsWith('matrix(1, 0, 0, 1, -120, 0)')));
    f.finish(); assert.equal(f.left.style.getPropertyValue('transform-origin'), '');
});

test('the logo remains readable during a real hold and its finite idle cancels with the player motion', t => {
    const f = fixture(t); f.open(); f.load('Bloodring');
    const mark = f.overlay.children[1].children[0], logo = mark.children[0];
    const reveal = f.animations.find(a => a.element === mark), idle = f.animations.find(a => a.element === logo);
    const opaque = reveal.frames.filter(frame => frame.opacity === 1);
    assert.ok((opaque.at(-1).offset - opaque[0].offset) * REALITY_TEAR_DURATION >= 1500);
    assert.ok(idle); assert.equal(idle.startTime, reveal.startTime);
    assert.equal(idle.options.iterations, undefined); assert.ok(Number.isFinite(idle.options.duration));
    const pane = f.animations.find(a => a.element === f.left);
    const hold = pane.frames.filter(frame => frame.offset >= .16 && frame.offset <= .8);
    assert.equal(hold[0].transform, hold.at(-1).transform);
    f.emit(document, 'keydown', undefined, { key: 'Escape' });
    assert.ok(f.animations.every(a => a.cancelled)); assert.equal(f.timers.size, 0);
    assert.equal(f.left.style.getPropertyValue('clip-path'), '');
});

test('logo afterimages use the approved asset and all presence layers share cancellation', t => {
    const f = fixture(t); f.open(); f.load('Bloodring');
    const mark = f.overlay.children[1].children[0], source = mark.children[0];
    const echoes = mark.children.slice(2).map(node => node.children[0]);
    assert.equal(echoes.length, 2); assert.ok(echoes.every(image => image.src === source.src));
    const presence = f.animations.filter(animation => mark.children.slice(1).includes(animation.element));
    assert.equal(presence.length, 3);
    assert.ok(presence.every(animation => animation.startTime === 1000 && animation.options.duration === REALITY_TEAR_DURATION));
    assert.ok(presence.every(animation => animation.options.iterations !== Infinity));
    f.load('Other Artist');
    assert.ok(presence.every(animation => animation.cancelled)); assert.equal(f.overlay.hidden, true);
    assert.equal(f.timers.size, 0); assert.equal(mark.children.length, 4);
});

test('the intro clock starts after layout preparation even when the document timeline is stale', t => {
    const f = fixture(t); let clock = 1400;
    globalThis.performance = { now: () => clock };
    globalThis.getComputedStyle = () => { clock += 25; return { transform: 'none' }; };
    document.timeline.currentTime = 1000;
    f.open(); f.load('Bloodring');
    assert.equal(f.events.at(-1).start, 1450);
    assert.ok(f.animations.every(animation => animation.startTime === 1450));
});
