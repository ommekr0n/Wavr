import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLyrics } from '../js/modules/lyric-parser.js';
import { LyricTimeline } from '../js/features/lyrics/LyricTimeline.js';
import { EnhancedWordHighlighter } from '../js/features/lyrics/EnhancedWordHighlighter.js';
import { LyricListFocus } from '../js/features/lyrics/LyricListFocus.js';
import { LyricReleaseController } from '../js/features/lyrics/LyricReleaseController.js';
import { buildAngelicEnhancedWords } from '../js/features/angelic/AngelicEnhancedWords.js';
import { AngelicLyricBuilder } from '../js/features/angelic/AngelicLyricBuilder.js';
import { expandEnhancedDisplayWords } from '../js/features/lyrics/EnhancedLrcText.js';
import { activateAngelicLine, clearAngelicLine, cancelAngelicLineTransitions } from '../js/features/angelic/AngelicLineLifecycle.js';
import { exitAngelicLyric, discardAngelicLyric } from '../js/features/angelic/AngelicLyricExit.js';

function node(classes = [], attrs = {}) {
    const names = new Set(classes), variables = new Map();
    return { attrs, variables, names, writes: 0, reads: 0, isConnected: true, children: [],
        classList: { contains: key => names.has(key), add(...keys) { keys.forEach(key => names.add(key)); },
            remove(...keys) { keys.forEach(key => names.delete(key)); }, toggle(key, on) { if (on) names.add(key); else names.delete(key); } },
        style: { setProperty(key, value) { variables.set(key, value); } },
        getAttribute: key => attrs[key], removeAttribute: key => delete attrs[key],
        addEventListener() {}, removeEventListener() {},
        closest() { return this.view; },
        querySelectorAll(selector) { return selector === '.has-enhanced-word' ? this.children.filter(child => child.names.has('has-enhanced-word')) : this.children; },
        remove() { this.isConnected = false; if (this.root) this.root.children = this.root.children.filter(child => child !== this); }
    };
}

function highlightFixture() {
    const view = node(), root = node(), wrapper = node();
    root.view = view; root.selection = wrapper;
    root.querySelector = () => { root.reads++; return root.selection; };
    const words = [node(['has-enhanced-word'], { 'data-start': '10', 'data-end': '10.1' }), node(['has-enhanced-word'], { 'data-start': '10.1', 'data-end': '13' })];
    wrapper.children = words;
    for (const word of words) {
        const toggle = word.classList.toggle;
        word.classList.toggle = (...args) => { word.writes++; toggle(...args); };
        const write = word.style.setProperty;
        word.style.setProperty = (...args) => { word.writes++; write(...args); };
    }
    return { view, root, wrapper, words, sync: new EnhancedWordHighlighter() };
}

function clockFixture(t) {
    const original = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame, globalThis.setTimeout, globalThis.clearTimeout];
    const frames = new Map(), timers = new Map(); let next = 0;
    globalThis.requestAnimationFrame = callback => { const id = ++next; frames.set(id, callback); return id; };
    globalThis.cancelAnimationFrame = id => frames.delete(id);
    globalThis.setTimeout = (callback, duration) => { const id = ++next; timers.set(id, { callback, duration }); return id; };
    globalThis.clearTimeout = id => timers.delete(id);
    t.after(() => { [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame, globalThis.setTimeout, globalThis.clearTimeout] = original; });
    return { frames, timers };
}

function lifecycleRoot() {
    const root = node();
    root.querySelector = () => null;
    root.querySelectorAll = selector => root.children.filter(child => {
        if (selector === '.ink-wash-exit') return child.names.has('ink-wash-exit');
        return child.names.has('angelic-line-wrapper') && (!selector.includes(':not') || (!child.names.has('angelic-prebuilt') && !child.names.has('ink-wash-exit')));
    });
    root.append = (index, prepared = false) => {
        const child = node(['angelic-line-wrapper', ...(prepared ? ['angelic-prebuilt'] : [])], { 'data-lyric-index': String(index) });
        child.root = root; root.children.push(child); return child;
    };
    return root;
}

test('enhanced parser preserves a sustained word and the bare final vocal end tag', () => {
    const [line] = parseLyrics('[00:10.00]<00:10.00>Hold <00:14.00>me<00:15.50>');
    assert.deepEqual(line.words.map(word => [word.word, word.time, word.endTime]), [['Hold', 10, 14], ['me', 14, 15.5]]);
    assert.ok(line.words.every(word => word.explicitEnd));
});

test('tagged phrases and untagged prefixes retain their full text and shared display timing', () => {
    const [line] = parseLyrics('[00:10.00]Oh <00:11.00>stay with me<00:14.00>');
    assert.equal(line.text, 'Oh stay with me');
    assert.deepEqual(expandEnhancedDisplayWords(line.words).map(word => [word.word, word.time, word.endTime]),
        [['Oh', 10, 11], ['stay', 11, 14], ['with', 11, 14], ['me', 11, 14]]);
});

test('colon word tags, backing vocals and inferred endings remain compatible with standard LRC', () => {
    const [line, normal] = parseLyrics('[00:10.00](00:10:200)(say (00:10:500)my (00:10:800)name) (00:11:000)now\n[00:11.20]Normal line');
    assert.deepEqual(line.words.map(word => word.isBackingVocal), [true, true, true, false]);
    assert.equal(line.words.at(-1).endTime, 11.2);
    assert.equal(normal.text, 'Normal line'); assert.equal(normal.isEnhanced, false);
});

test('enhanced Angelic uses one unit per timestamp and escapes authored text', () => {
    const [line] = parseLyrics('[00:10.00]<00:10.00>imagination & <b><00:12.00>(sing along)<00:13.00>');
    const html = buildAngelicEnhancedWords(line);
    assert.equal((html.match(/has-enhanced-word/g) || []).length, 2);
    assert.match(html, /imagination &amp; &lt;b&gt;/);
    assert.match(html, /angelic-parenthesis/);
});

test('tag-only markers do not create empty visible lines and standard lyrics keep their syllable pop', t => {
    assert.equal(parseLyrics('[00:10.00]<00:10.00>\n[00:12.00]Hello').length, 1);
    const saved = globalThis.document;
    globalThis.document = { body: { classList: { contains: () => false } } };
    t.after(() => { globalThis.document = saved; });
    const html = AngelicLyricBuilder.buildWordsHTML('imagination sings');
    assert.ok((html.match(/class="angelic-word-pop"/g) || []).length > 2);
    assert.match(html, /animation-delay: 0.15s/);
    assert.doesNotMatch(html, /has-enhanced-word|data-start/);
});

test('line selection uses 40ms enhanced attack, preserves 120ms standard anticipation and seeks backwards', () => {
    const timeline = new LyricTimeline(parseLyrics('[00:10.00]Standard\n[00:12.00]<00:12.00>Enhanced<00:13.00>'));
    assert.equal(timeline.indexAt(9.879), -1); assert.equal(timeline.indexAt(9.88), 0);
    assert.equal(timeline.indexAt(11.959), 0); assert.equal(timeline.indexAt(11.96), 1);
    assert.equal(timeline.indexAt(10), 0);
    timeline.setLyrics(timeline.lyrics, 1.1);
    assert.equal(timeline.indexAt(13.159), 0); assert.equal(timeline.indexAt(13.16), 1);
});

test('mixed short lines keep reveal times ordered and dense fades remain bounded', () => {
    const timeline = new LyricTimeline(parseLyrics('[00:10.00]<00:10.00>A<00:10.03>\n[00:10.05]B\n[00:14.00]C'));
    assert.equal(timeline.indexAt(9.96), 1);
    assert.equal(timeline.lines[0].exitDuration, .24);
    assert.equal(timeline.lines[1].exitDuration, .88);
    assert.equal(timeline.lines[2].exitDuration, .88);
});

test('gap release follows the latest vocal end, 1.2s reading hold and enough room for the dissolve', () => {
    const timeline = new LyricTimeline(parseLyrics('[00:10.00]<00:10.00>Hold<00:15.00>\n[00:20.00]<00:20.00>Last<00:23.00>'));
    assert.equal(timeline.canRelease(0, 16.199, true), false);
    assert.equal(timeline.canRelease(0, 16.2, true), true);
    assert.equal(timeline.canRelease(0, 19.1, true), false);
    assert.equal(timeline.canRelease(1, 24.2, true), true);
});

test('word synchronization performs no writes or selectors between word boundaries', () => {
    const { root, words, sync } = highlightFixture();
    sync.sync(root, 0, 9.96, 1, 'angelic');
    const writes = words.map(word => word.writes), reads = root.reads;
    for (let time = 9.97; time < 10.05; time += .001) sync.sync(root, 0, time, 1, 'angelic');
    assert.deepEqual(words.map(word => word.writes), writes); assert.equal(root.reads, reads);
    assert.ok(words[0].names.has('word-active'));
    assert.equal(words[0].variables.get('--word-attack'), '0.050s');
    assert.ok(words.every(word => !word.variables.has('--word-progress')));
});

test('fast, overlapping attacks and sustained words update correctly when skipping frames or seeking', () => {
    const { root, words, sync } = highlightFixture();
    sync.sync(root, 0, 10.07, 1, 'normal');
    assert.ok(words.every(word => word.names.has('word-active')));
    sync.sync(root, 0, 12, 1, 'normal');
    assert.ok(words[0].names.has('word-past')); assert.ok(words[1].names.has('word-active'));
    sync.sync(root, 0, 9, 1, 'normal');
    assert.ok(words.every(word => !word.names.has('word-active') && !word.names.has('word-past')));
    sync.sync(root, 0, 12, 1.2, 'normal'); assert.ok(words[0].names.has('word-active'));
});

test('hidden modes do no selector work and a replaced wrapper with the same lyric index refreshes its cache', () => {
    const { root, view, wrapper, words, sync } = highlightFixture();
    view.names.add('hidden'); sync.sync(root, 0, 10, 1, 'angelic'); assert.equal(root.reads, 0);
    view.names.delete('hidden'); sync.sync(root, 0, 10, 1, 'angelic');
    wrapper.names.add('ink-wash-exit'); const replacement = node();
    const newWord = node(['has-enhanced-word'], { 'data-start': '10', 'data-end': '14' }); replacement.children = [newWord]; root.selection = replacement;
    sync.sync(root, 0, 11, 1, 'angelic');
    assert.ok(newWord.names.has('word-active')); assert.ok(words[0].names.has('word-active'));
    assert.equal(root.reads, 2);
});

test('hidden normal lyric panel never reads geometry, and centers once after returning', () => {
    const view = node(['hidden']), root = node(), container = node(); root.view = view;
    let reads = 0, scrolls = 0;
    const rows = [node(), node(), node()]; root.children = rows;
    for (const row of rows) for (const key of ['offsetTop', 'clientHeight']) Object.defineProperty(row, key, { get: () => { reads++; return 40; } });
    Object.defineProperty(container, 'clientHeight', { get: () => { reads++; return 300; } });
    const focus = new LyricListFocus(), scroll = () => scrolls++;
    focus.update(root, container, 0, scroll); focus.update(root, container, 1, scroll);
    assert.equal(reads, 0); assert.equal(scrolls, 0);
    assert.ok(rows[1].names.has('active')); assert.ok(rows[2].names.has('next-line'));
    view.names.delete('hidden'); focus.update(root, container, 1, scroll); focus.update(root, container, 1, scroll);
    assert.equal(reads, 3); assert.equal(scrolls, 1);
});

test('gap clearing happens only once per shown view and resets on a seek', () => {
    const timeline = new LyricTimeline(parseLyrics('[00:10.00]<00:10.00>Last<00:12.00>'));
    const highlighter = new EnhancedWordHighlighter(), root = node(), releases = new LyricReleaseController(); let calls = 0;
    const update = () => releases.update(timeline, 0, 13.2, highlighter, null, root, null, () => calls++);
    update(); update(); assert.equal(calls, 1); releases.reset(); update(); assert.equal(calls, 2);
});

test('rapid lyric changes retain only one outgoing surface and cancel its former entry frame', t => {
    const { frames, timers } = clockFixture(t), root = lifecycleRoot();
    root.append(0); const one = root.append(1, true); root.append(8, true);
    activateAngelicLine(root, one, 1, { currentTime: 10, exitDuration: .3 });
    assert.equal(root.children.length, 2); assert.equal(frames.size, 1);
    const two = root.append(2, true);
    activateAngelicLine(root, two, 2, { currentTime: 11, exitDuration: .24 });
    assert.equal(root.children.length, 2); assert.equal(frames.size, 1); assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].duration, 260);
    assert.equal(root.querySelectorAll('.ink-wash-exit').length, 1);
    cancelAngelicLineTransitions(root); assert.equal(frames.size, 0); assert.equal(timers.size, 0);
});

test('enhanced flight delay catches up to audio time and mode exit cancels pending entry', t => {
    const { frames, timers } = clockFixture(t), root = lifecycleRoot(), wrapper = root.append(0, true);
    const word = node([], { 'data-word-start': '10' }); wrapper.children = [word];
    activateAngelicLine(root, wrapper, 0, { currentTime: 12, driftRatio: 1.1 });
    assert.equal(word.variables.get('--word-delay'), '-0.850s');
    clearAngelicLine(root, .4); assert.equal(frames.size, 0); assert.equal(timers.size, 1);
    cancelAngelicLineTransitions(root); assert.equal(timers.size, 0);
});

test('exit snapshots dim future words before changing classes and releases the adaptive fallback', t => {
    const { timers } = clockFixture(t), wrapper = node(), word = node(['has-enhanced-word']); wrapper.children = [word];
    const saved = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ opacity: '.12', transform: 'matrix(.9,0,0,.9,0,12)' });
    t.after(() => { globalThis.getComputedStyle = saved; });
    exitAngelicLyric(wrapper, .36);
    assert.equal(word.variables.get('--exit-word-opacity'), '.12');
    assert.equal(word.variables.get('--exit-word-transform'), 'matrix(.9,0,0,.9,0,12)');
    assert.equal([...timers.values()][0].duration, 380);
    discardAngelicLyric(wrapper); assert.equal(timers.size, 0); assert.equal(wrapper.isConnected, false);
});
