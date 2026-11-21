import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import { ThreeLivingSleeve } from '../js/core/rendering/three/ThreeLivingSleeve.js';
import { ThreeChromaticAtelier } from '../js/core/rendering/three/ThreeChromaticAtelier.js';
import { RealityTearRenderEffect } from '../js/core/rendering/three/RealityTearRenderEffect.js';
import { attachThreeContextRecovery } from '../js/features/visualizer/ThreeContextRecovery.js';
import { setGraphicsAvailability } from '../js/features/visualizer/GraphicsAvailability.js';
import { createVignetteOverlay, updateVignette, removeVignetteOverlay } from '../js/features/visualizer/VisualFX.js';
import { buildEnhancedCinematicRows, triggerCinematicLine } from '../js/features/visualizer/CinematicTextRenderer.js';
import { parseTimeToSeconds, parseLyrics } from '../js/modules/lyric-parser.js';
import { AngelicRenderer } from '../js/core/rendering/AngelicRenderer.js';
import { AngelicStaffAnimator } from '../js/features/angelic/AngelicStaffAnimator.js';
import { AngelicClimaxFX } from '../js/features/angelic/AngelicClimaxFX.js';
import { VisualizerController } from '../js/features/visualizer/VisualizerController.js';

const COLORS = [0x6ca58e, 0x263346, 0xae8960, 0x616a86].map(c => new THREE.Color(c));

function createMockElement(tag = 'div') {
    const attrs = new Map();
    const classes = new Set();
    const styleProps = new Map();
    const children = [];
    const el = {
        nodeType: 1,
        nodeName: tag.toUpperCase(),
        tagName: tag.toUpperCase(),
        children,
        childNodes: children,
        parentNode: null,
        isConnected: true,
        textContent: '',
        innerText: '',
        dataset: {},
        style: {
            setProperty(k, v) { styleProps.set(k, String(v)); },
            getPropertyValue(k) { return styleProps.get(k) ?? ''; },
            _props: styleProps
        },
        classList: {
            add(...names) { names.forEach(n => classes.add(n)); },
            remove(...names) { names.forEach(n => classes.delete(n)); },
            contains(name) { return classes.has(name); },
            toggle(name, force) {
                const on = force === undefined ? !classes.has(name) : Boolean(force);
                if (on) classes.add(name); else classes.delete(name);
                return on;
            }
        },
        get className() { return [...classes].join(' '); },
        set className(val) {
            classes.clear();
            String(val || '').split(/\s+/).filter(Boolean).forEach(n => classes.add(n));
        },
        setAttribute(k, v) { attrs.set(k, String(v)); },
        getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
        appendChild(child) {
            child.parentNode = el;
            children.push(child);
            return child;
        },
        remove() {
            el.isConnected = false;
            if (el.parentNode) {
                const idx = el.parentNode.children.indexOf(el);
                if (idx !== -1) el.parentNode.children.splice(idx, 1);
                el.parentNode = null;
            }
        },
        querySelector(sel) {
            return el.querySelectorAll(sel)[0] || null;
        },
        querySelectorAll(sel) {
            const cls = sel.startsWith('.') ? sel.slice(1) : null;
            const out = [];
            const walk = node => {
                for (const child of node.children || []) {
                    if (cls && child.classList?.contains(cls)) out.push(child);
                    walk(child);
                }
            };
            walk(el);
            return out;
        }
    };
    return el;
}

// ── 1. ThreeLivingSleeve empty src & RealityTear try/finally ──────────────────
test('ThreeLivingSleeve handles empty cover src without TypeError and releases textures', t => {
    const savedDoc = globalThis.document;
    const savedMO = globalThis.MutationObserver;
    const savedRO = globalThis.ResizeObserver;
    t.after(() => {
        globalThis.document = savedDoc;
        globalThis.MutationObserver = savedMO;
        globalThis.ResizeObserver = savedRO;
    });

    const root = createMockElement('div');
    root.parentElement = createMockElement('div');
    const image = {
        src: '',
        closest: () => root,
        getBoundingClientRect: () => ({ x: 30, y: 40, width: 200, height: 200, left: 30, top: 40 })
    };
    const view = { getBoundingClientRect: () => ({ x: 0, y: 0 }) };
    globalThis.document = { getElementById: id => (id === 'cover-art' ? image : view) };
    globalThis.MutationObserver = globalThis.ResizeObserver = class { observe() {} disconnect() {} };

    const refs = new Map();
    const acquireCalls = [];
    const textures = {
        acquire(url) {
            acquireCalls.push(url);
            if (!url) return null;
            refs.set(url, (refs.get(url) || 0) + 1);
            return { ready: true, failed: false, texture: new THREE.Texture() };
        },
        release(url) {
            refs.set(url, (refs.get(url) || 0) - 1);
        }
    };

    const sleeve = new ThreeLivingSleeve(textures, () => {}, { x: -1000, y: -1000 });
    sleeve.resize(1000, 700);
    sleeve.setActive(true);

    // Empty src should not call acquire("") or throw TypeError
    assert.doesNotThrow(() => sleeve.update(0.016, { playing: false }, COLORS, false));
    assert.deepEqual(acquireCalls, []);
    assert.equal(sleeve.pending, null);
    assert.equal(sleeve.entry, null);
    assert.equal(sleeve.group.visible, false);

    // Load a valid cover, then clear src back to ""
    image.src = 'https://example.com/cover.jpg';
    sleeve.dirty = true;
    sleeve.update(0.016, { playing: false }, COLORS, false);
    assert.equal(refs.get('https://example.com/cover.jpg'), 1);

    image.src = '';
    sleeve.dirty = true;
    assert.doesNotThrow(() => sleeve.update(0.016, { playing: false }, COLORS, false));
    assert.equal(refs.get('https://example.com/cover.jpg'), 0);
    assert.equal(sleeve.entry, null);
    assert.equal(sleeve.pending, null);
    assert.equal(sleeve.face.map, null);
    sleeve.dispose();
});

test('ThreeRendererController wraps player tear frame in try/finally and marks atelier dirty on enable', t => {
    const src = readFileSync(new URL('../js/features/visualizer/ThreeRendererController.js', import.meta.url), 'utf8');
    assert.match(src, /this\.tear\.beginFrame\(this\.renderer,\s*now\);[\s\S]*?try\s*\{[\s\S]*?this\.sleeve\.update\([\s\S]*?\}\s*finally\s*\{[\s\S]*?this\.tear\.endFrame\(this\.renderer\);[\s\S]*?\}/);
    assert.match(src, /this\.atelier\.markDirty\(\);/);

    // Verify RealityTearRenderEffect restores previous render target when endFrame runs in finally
    const savedDoc = globalThis.document;
    globalThis.document = new EventTarget();
    const previous = { name: 'screen' };
    const renderer = {
        target: previous,
        autoClear: true,
        getPixelRatio: () => 1,
        getRenderTarget() { return this.target; },
        setRenderTarget(rt) { this.target = rt; },
        render() {}
    };
    const owner = { renderer, mode: 'player', enabled: true, reducedMotion: false, syncMode() {}, syncLoop() {} };
    const abort = new AbortController();
    const tear = new RealityTearRenderEffect(owner, abort.signal);
    t.after(() => { abort.abort(); tear.dispose(); globalThis.document = savedDoc; });

    document.dispatchEvent(new CustomEvent('wavr:artistintro', {
        detail: { active: true, start: 1000, duration: 600, field: { cx: 100, cy: 100, horizontal: false, amplitude: 1, gap: 50, angle: 0 } }
    }));

    tear.beginFrame(renderer, 1100);
    assert.equal(renderer.target, tear.target);
    assert.equal(tear.capturing, true);
    try {
        throw new Error('simulated render error');
    } catch {
        // swallow to assert finally cleanup
    } finally {
        tear.endFrame(renderer);
    }
    assert.equal(renderer.target, previous);
    assert.equal(tear.capturing, false);
});

// ── 2. ThreeChromaticAtelier context loss/restore recovery ───────────────────
test('ThreeChromaticAtelier.markDirty forces repaint on webglcontextrestored even when paused', t => {
    const savedDoc = globalThis.document;
    globalThis.document = { documentElement: { dataset: {} } };
    setGraphicsAvailability('ready');
    t.after(() => { setGraphicsAvailability('ready'); globalThis.document = savedDoc; });

    const atelier = new ThreeChromaticAtelier();
    const targetRenders = [];
    const renderer = {
        target: null,
        getRenderTarget() { return this.target; },
        setRenderTarget(rt) { this.target = rt; },
        render(scene) { if (scene === atelier.scene) targetRenders.push(this.target); }
    };

    // Initial paint clears dirty and sets nextPaint in the future
    atelier.render(renderer, 100);
    assert.equal(atelier.dirty, false);
    assert.equal(targetRenders.length, 1);

    // Context lost -> restored
    const canvas = new EventTarget();
    const states = [];
    const controller = {
        renderer: { domElement: canvas },
        atelier,
        setEnabled: on => states.push(on)
    };
    const abort = new AbortController();
    attachThreeContextRecovery(controller, abort.signal);

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    assert.deepEqual(states, [false, true]);
    assert.equal(atelier.dirty, true);
    assert.equal(atelier.nextPaint, 0);

    // Even when paused / reduced-motion (update does not set dirty) and at an earlier timestamp, render repaints
    atelier.update(0.016, { playing: false, energy: 0 }, COLORS, true);
    atelier.render(renderer, 105);
    assert.equal(targetRenders.length, 2);
    assert.equal(targetRenders[1], atelier.target);
    atelier.dispose();
});

// ── 3. VisualFX.updateVignette directional lerp ──────────────────────────────
test('VisualFX.updateVignette increases on quiet sections and decreases on loud sections', t => {
    const savedDoc = globalThis.document;
    globalThis.document = { createElement: tag => createMockElement(tag) };
    t.after(() => {
        removeVignetteOverlay();
        globalThis.document = savedDoc;
    });

    const parent = createMockElement('div');
    createVignetteOverlay(parent);
    const vignette = parent.querySelector('.vignette-overlay');
    assert.ok(vignette);

    // Quiet (energy = 0 -> target = 0.6): opacity rises toward 0.6 and stays <= 0.6
    for (let i = 0; i < 40; i++) updateVignette(0);
    const darkVal = parseFloat(vignette.style.getPropertyValue('--vignette-opacity'));
    assert.ok(darkVal > 0.3 && darkVal <= 0.6, `expected darkVal in (0.3, 0.6], got ${darkVal}`);

    // Loud (energy = 1.0 -> target = 0): opacity must decrease, not climb toward black!
    for (let i = 0; i < 60; i++) updateVignette(1.0);
    const brightVal = parseFloat(vignette.style.getPropertyValue('--vignette-opacity'));
    assert.ok(brightVal < darkVal * 0.5, `expected brightVal < ${darkVal * 0.5}, got ${brightVal}`);
    assert.ok(brightVal >= 0 && brightVal <= 1);
});

// ── 4. CinematicTextRenderer enhanced 1-to-1 word timing binding ─────────────
test('CinematicTextRenderer binds enhanced words 1-to-1 without orphan-split desync', t => {
    const savedDoc = globalThis.document;
    const savedWindow = globalThis.window;
    const savedSetTimeout = globalThis.setTimeout;
    const timers = [];
    globalThis.document = {
        createElement: tag => createMockElement(tag),
        createDocumentFragment: () => createMockElement('fragment'),
        createTextNode: text => ({ nodeType: 3, nodeValue: text, textContent: text })
    };
    globalThis.window = { innerWidth: 1280, innerHeight: 720 };
    globalThis.setTimeout = fn => { timers.push(fn); return timers.length; };
    t.after(() => {
        globalThis.document = savedDoc;
        globalThis.window = savedWindow;
        globalThis.setTimeout = savedSetTimeout;
    });

    // Backing vocals with punctuation that would shift token count under preventOrphanWords()
    const [line] = parseLyrics(
        '[00:10.00]<00:10.00>Hello <00:10.50>world <00:11.00>(oh <00:11.50>yeah)! <00:12.00>stay<00:12.80>'
    );

    // Verify row builder groups backing vocals and preserves 1-to-1 word count
    const rows = buildEnhancedCinematicRows(line.words);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].isParenthesis, false);
    assert.equal(rows[1].isParenthesis, true);
    assert.equal(rows[2].isParenthesis, false);

    const container = createMockElement('div');
    triggerCinematicLine({ ...line, index: 0 }, container, 3.0);

    const spans = container.querySelectorAll('.has-enhanced-word');
    assert.equal(spans.length, line.words.length);
    for (let i = 0; i < line.words.length; i++) {
        assert.equal(spans[i].textContent, line.words[i].word);
        assert.equal(Number(spans[i].getAttribute('data-start')), line.words[i].time);
        assert.equal(Number(spans[i].getAttribute('data-end')), line.words[i].endTime);
    }
});

// ── 5. lyric-parser.js ms < 100, malformed NaN guard, 1-digit min/frac ───────
test('lyric-parser parses 3-digit ms < 100 accurately, guards NaN, and accepts 1-digit min/frac', () => {
    // 3-digit ms < 100: 050ms = 0.05s, NOT 0.5s
    assert.equal(parseTimeToSeconds('(00:10:050)'), 10.05);
    assert.equal(parseTimeToSeconds('(00:10:005)'), 10.005);
    assert.equal(parseTimeToSeconds('(00:10:50)'), 10.5);
    assert.equal(parseTimeToSeconds('(00:10:5)'), 10.5);

    // Malformed timestamps return 0, never NaN
    assert.equal(parseTimeToSeconds('[ab:cd]'), 0);
    assert.equal(parseTimeToSeconds('[00:10:xyz]'), 0);
    assert.equal(parseTimeToSeconds('[00:]'), 0);
    assert.equal(parseTimeToSeconds('not-a-time'), 0);

    // 1-digit minute and 1-digit fractional second LRC lines are parsed, not dropped
    const parsed = parseLyrics('[1:05.5]One digit min and frac\n[0:09.0]Zero min\n[100:00.25]Long track');
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].time, 9);
    assert.equal(parsed[0].text, 'Zero min');
    assert.equal(parsed[1].time, 65.5);
    assert.equal(parsed[1].text, 'One digit min and frac');
    assert.equal(parsed[2].time, 6000.25);
    assert.equal(parsed[2].text, 'Long track');
});

// ── 6. Angelic global staff width updates on resize ──────────────────────────
test('AngelicRenderer.updateGlobalStaffWidth updates SVG attributes and refreshes AngelicStaffMotion cache', () => {
    const container = createMockElement('div');
    const wrapper = createMockElement('div');
    wrapper.className = 'global-angelic-staff-wrapper';
    wrapper.setAttribute('data-w', 1000);
    wrapper.setAttribute('data-staff-gap', 50);
    wrapper.setAttribute('data-y-center', 275);
    wrapper.setAttribute('data-amp', 50);

    const svg = createMockElement('svg');
    svg.className = 'global-angelic-staff-svg angelic-staff-svg';
    svg.setAttribute('width', 1000);
    svg.setAttribute('height', 550);
    svg.setAttribute('viewBox', '0 0 1000 550');

    const path = createMockElement('path');
    path.className = 'staff-line';
    path.setAttribute('data-y', 275);
    const clef = createMockElement('text');
    clef.className = 'staff-symbol staff-motif-anim angelic-clef-symbol';
    clef.setAttribute('x', 50);
    clef.setAttribute('data-t', 0.05);
    clef.setAttribute('data-l', 0);
    clef.setAttribute('data-font', 400);
    clef.textContent = '𝄞';

    svg.appendChild(path);
    svg.appendChild(clef);
    wrapper.appendChild(svg);
    container.appendChild(wrapper);

    AngelicStaffAnimator.records.set(wrapper, AngelicStaffAnimator.capture(wrapper));
    assert.equal(AngelicStaffAnimator.records.get(wrapper).w, 1000);

    AngelicRenderer.updateGlobalStaffWidth(container, 1920);

    assert.equal(wrapper.getAttribute('data-w'), '1920');
    assert.equal(svg.getAttribute('width'), '1920');
    assert.equal(svg.getAttribute('viewBox'), '0 0 1920 550');
    assert.ok(Math.abs(Number(clef.getAttribute('data-t')) - (50 / 1920)) < 1e-6);
    assert.equal(AngelicStaffAnimator.records.get(wrapper).w, 1920);

    AngelicStaffAnimator.update(0);
    assert.ok(path.getAttribute('d').endsWith(' 1920,275'));
    AngelicStaffAnimator.records.clear();
});

// ── 7. AngelicClimaxFX cancellation & stale .giant-butterfly cleanup ─────────
test('AngelicClimaxFX cancels staggered rAFs and exitAngelicMode removes giant-butterfly nodes', t => {
    const savedDoc = globalThis.document;
    const savedRAF = globalThis.requestAnimationFrame;
    const savedCAF = globalThis.cancelAnimationFrame;
    const frames = new Map();
    let nextId = 0;

    globalThis.requestAnimationFrame = cb => { const id = ++nextId; frames.set(id, cb); return id; };
    globalThis.cancelAnimationFrame = id => frames.delete(id);

    const body = createMockElement('body');
    const angelicView = createMockElement('div');
    const playerView = createMockElement('div');
    const textContainer = createMockElement('div');
    const particleContainer = createMockElement('div');
    const staleButterfly = createMockElement('div');
    staleButterfly.className = 'giant-butterfly';
    angelicView.appendChild(staleButterfly);

    globalThis.document = {
        body,
        createElement: tag => createMockElement(tag),
        getElementById: () => null,
        removeEventListener() {}
    };
    t.after(() => {
        AngelicClimaxFX.cancelPendingClimaxFX();
        globalThis.document = savedDoc;
        globalThis.requestAnimationFrame = savedRAF;
        globalThis.cancelAnimationFrame = savedCAF;
    });

    AngelicClimaxFX.spawnClimaxCombo(true, particleContainer, angelicView, 'Test Artist', 0);
    assert.equal(frames.size, 3);

    // Exit Angelic Mode before any staggered frame runs
    VisualizerController.exitAngelicMode(angelicView, playerView, textContainer, particleContainer);

    assert.equal(frames.size, 0, 'all pending climax rAFs should be cancelled on exit');
    assert.equal(angelicView.querySelectorAll('.giant-butterfly').length, 0, 'stale giant-butterfly removed');
    assert.equal(particleContainer.children.length, 0);
});

// ── 8. VisualizerController unified idle timer ───────────────────────────────
test('VisualizerController clears idle timer on mousemove and mode exit', t => {
    const savedDoc = globalThis.document;
    const savedSetTimeout = globalThis.setTimeout;
    const savedClearTimeout = globalThis.clearTimeout;

    const timers = new Map();
    let nextTimer = 0;
    const listeners = new Map();

    globalThis.setTimeout = (fn, delay) => {
        const id = ++nextTimer;
        timers.set(id, { fn, delay });
        return id;
    };
    globalThis.clearTimeout = id => timers.delete(id);

    const body = createMockElement('body');
    const playerView = createMockElement('div');
    const cinematicView = createMockElement('div');
    const textContainer = createMockElement('div');

    globalThis.document = {
        body,
        getElementById: id => (id === 'player-view' ? playerView : null),
        addEventListener: (evt, fn) => listeners.set(evt, fn)
    };
    t.after(() => {
        globalThis.document = savedDoc;
        globalThis.setTimeout = savedSetTimeout;
        globalThis.clearTimeout = savedClearTimeout;
    });

    VisualizerController.setupAutoHide();
    VisualizerController.enterCinematicMode(playerView, cinematicView, -1, [], () => {});
    assert.equal(timers.size, 1, 'entering cinematic schedules one idle timer');
    const firstTimerId = [...timers.keys()][0];

    // Moving mouse must replace (clear) the mode-entry timer instead of leaving two timers active
    listeners.get('mousemove')();
    assert.equal(timers.has(firstTimerId), false, 'mousemove must clear entry idle timer');
    assert.equal(timers.size, 1);

    // Exiting mode must clear the active idle timer completely
    VisualizerController.exitCinematicMode(cinematicView, playerView, textContainer);
    assert.equal(timers.size, 0, 'exiting cinematic mode must clear idle timer');
});
