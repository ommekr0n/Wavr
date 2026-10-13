import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLyrics } from '../js/modules/lyric-parser.js';
import { LyricTimeline } from '../js/features/lyrics/LyricTimeline.js';
import { resolveNostalgiaCue, resolveNostalgiaFrame, buildNostalgiaSlides } from '../js/features/visualizer/NostalgiaCue.js';
import { wrapNostalgiaText, createNostalgiaRaster } from '../js/features/visualizer/NostalgiaRaster.js';
import { setupNostalgiaMode } from '../js/features/visualizer/NostalgiaController.js';
import { VisualizerController } from '../js/features/visualizer/VisualizerController.js';
import { LyricEngine } from '../js/features/lyrics/LyricEngine.js';

// A small DOM fixture keeps controller tests independent of a browser and network.
class Element extends EventTarget {
    constructor(tag = 'div') {
        super(); this.tag = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.names = new Set();
        this.style = { setProperty() {} }; this.isConnected = true; this.paints = 0;
        this.classList = { contains: key => this.names.has(key), add: key => this.names.add(key), remove: key => this.names.delete(key),
            toggle: (key, on) => on ? this.names.add(key) : this.names.delete(key) };
    }
    set className(value) { this.names = new Set(value.split(' ')); }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.children.length ? this.children.map(child => child.textContent).join('') : this.text || ''; }
    setAttribute(key, value) { this.attrs[key] = value; }
    getAttribute(key) { return key.startsWith('data-') ? this.dataset[key.slice(5)] : this.attrs[key]; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.paints++; this.children = nodes; this.text = ''; }
    closest() { return this.view; }
    querySelector(selector) { return this.children.find(child => selector === `[data-index="${child.dataset.index}"]`) || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.names.has(selector.slice(1)) ? [child] : []), ...child.querySelectorAll(selector)]); }
    click() { this.dispatchEvent(new Event('click')); }
    focus() { this.focused = true; }
}

function fixture(t) {
    const previous = { document: globalThis.document, MutationObserver: globalThis.MutationObserver };
    const elements = new Map();
    const document = new EventTarget();
    document.getElementById = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
    document.createElement = tag => new Element(tag);
    document.createTextNode = text => { const node = new Element('#text'); node.textContent = text; return node; };
    const get = document.getElementById;
    for (const id of ['cinematic-view', 'angelic-view', 'nostalgia-view']) get(id).classList.add('hidden');
    get('nostalgia-text-container').view = get('nostalgia-view');
    get('song-title').textContent = 'Memory <img src=x>';
    get('song-artist').textContent = 'Test Artist';
    get('cover-art').src = 'cover-a.png'; get('cover-art').setAttribute('src', 'cover-a.png');
    globalThis.document = document;
    globalThis.MutationObserver = class { observe() {} disconnect() {} };
    const audio = Object.assign(new EventTarget(), { currentTime: 0, duration: 40, paused: true });
    let toggles = 0, next = 0, seekTime = null;
    const controller = setupNostalgiaMode({ audio, playerView: get('player-view'), togglePlay: () => toggles++,
        prevTrack() {}, nextTrack: () => next++, seek: time => { seekTime = time; } });
    t.after(() => { controller.dispose(); LyricEngine.setLyrics(''); Object.assign(globalThis, previous); });
    return { get, audio, controller, counts: () => ({ toggles, next, seekTime }) };
}

test('Nostalgia shows a title before lyrics and clears instrumental gaps', () => {
    const timeline = new LyricTimeline(parseLyrics('[00:05.00]A memory\n[00:15.00]Coming back'));
    assert.equal(resolveNostalgiaCue(timeline, 0).kind, 'title');
    assert.equal(resolveNostalgiaCue(timeline, 5).line.text, 'A memory');
    assert.equal(resolveNostalgiaCue(timeline, 10).kind, 'blank');
    assert.equal(resolveNostalgiaCue(timeline, 15).line.text, 'Coming back');
    assert.equal(resolveNostalgiaCue(timeline, 22).kind, 'blank');
    assert.equal(resolveNostalgiaCue(new LyricTimeline(), 2).kind, 'title');
    assert.equal(resolveNostalgiaCue(new LyricTimeline(), 20).kind, 'blank');
    assert.equal(resolveNostalgiaCue(new LyricTimeline(), 40, 40).kind, 'blank');
    assert.equal(resolveNostalgiaCue(new LyricTimeline([{ time: 0, text: '' }]), 1).kind, 'blank');
});

test('sustained enhanced vocals, lyric drift and backward seeks use the audio clock', () => {
    const timeline = new LyricTimeline(parseLyrics('[00:10.00]<00:10.00>Hold <00:14.00>me<00:18.00>\n[00:30.00]Again'), 1.2);
    assert.equal(resolveNostalgiaCue(timeline, 11).kind, 'blank');
    assert.equal(resolveNostalgiaCue(timeline, 20).line.text, 'Hold me');
    assert.equal(resolveNostalgiaCue(timeline, 24).kind, 'blank');
    assert.equal(resolveNostalgiaCue(timeline, 36).line.text, 'Again');
    assert.equal(resolveNostalgiaCue(timeline, 12).index, 0);
    assert.equal(resolveNostalgiaCue(timeline, 0).kind, 'title');
});

test('paused entry, enhanced highlights, seeks, track replacement and exit retain one subtitle surface', t => {
    const f = fixture(t), root = f.get('nostalgia-text-container');
    LyricEngine.setDriftRatio(1);
    LyricEngine.setLyrics('[00:05.00]<00:05.00>Hold <00:08.00>me<00:10.00>\n[00:20.00]Again');
    f.get('btn-nostalgia').click();
    assert.equal(VisualizerController.getIsNostalgiaMode(), true);
    assert.equal(f.get('player-view').classList.contains('hidden'), true);
    assert.equal(root.children[0].textContent, 'Memory <img src=x>.mp4');
    assert.equal(root.children[0].tag, 'div');
    assert.equal(f.get('nostalgia-view').classList.contains('nostalgia-paused'), true);
    f.audio.currentTime = 6; f.controller.sync();
    assert.equal(root.children.length, 1);
    assert.equal(root.querySelectorAll('.word-active')[0].textContent, 'Hold');
    const paints = root.paints;
    for (const time of [6.1, 6.2, 6.3]) f.controller.sync(time);
    assert.equal(root.paints, paints);
    f.audio.currentTime = 9; f.controller.sync();
    assert.equal(root.querySelectorAll('.word-active')[0].textContent, 'me');
    f.audio.currentTime = 21; f.controller.sync();
    assert.equal(root.textContent, 'Again');
    f.audio.currentTime = 0; f.controller.sync();
    assert.equal(root.dataset.cue, 'title');
    LyricEngine.setLyrics('[00:00.00]A new track'); f.controller.sync();
    assert.equal(root.textContent, 'A new track');
    f.get('nostalgia-play').click(); f.get('nostalgia-next').click();
    f.get('nostalgia-progress').value = 500; f.get('nostalgia-progress').dispatchEvent(new Event('input'));
    assert.deepEqual(f.counts(), { toggles: 1, next: 1, seekTime: 20 });
    f.get('btn-exit-nostalgia').click();
    assert.equal(VisualizerController.getIsNostalgiaMode(), false);
    assert.equal(f.get('player-view').classList.contains('hidden'), false);
    assert.equal(root.children.length, 0);
    assert.equal(f.get('btn-nostalgia').focused, true);
});

test('entering another recording mode closes Nostalgia and its subtitle state', t => {
    const f = fixture(t);
    LyricEngine.setLyrics(''); f.get('btn-nostalgia').click();
    f.get('btn-cinematic').click();
    assert.equal(VisualizerController.getIsNostalgiaMode(), false);
    assert.equal(f.get('nostalgia-view').classList.contains('hidden'), true);
    assert.equal(f.get('nostalgia-text-container').children.length, 0);
});

test('two-line slides keep gaps, empty lines and enhanced phrases separate', () => {
    const lyrics = [{ time: 2, text: 'First' }, { time: 5, text: 'Second' }, { time: 16, text: '' },
        { time: 20, text: 'Hold', isEnhanced: true }, { time: 25, text: 'After' }, { time: 40, text: 'Later' }];
    const slides = buildNostalgiaSlides(lyrics);
    assert.deepEqual(slides, [[0, 1], [0, 1], [2], [3], [4], [5]]);
});

test('introduction fades away before vocals and stays off during a long intro or a track without lyrics', () => {
    const timeline = new LyricTimeline(parseLyrics('[00:16.00]First vocal'));
    assert.equal(resolveNostalgiaCue(timeline, 0).opacity, 0);
    assert.ok(resolveNostalgiaCue(timeline, .3).opacity > 0);
    assert.equal(resolveNostalgiaCue(timeline, 2).opacity, 1);
    assert.ok(resolveNostalgiaCue(timeline, 5.7).opacity < 1);
    for (const time of [6, 10, 15]) assert.equal(resolveNostalgiaCue(timeline, time).kind, 'blank');
    assert.equal(resolveNostalgiaCue(timeline, 16).kind, 'lyric');
    assert.equal(resolveNostalgiaCue(timeline, 2).opacity, 1); // Backwards seek restores the intro.
    const early = new LyricTimeline(parseLyrics('[00:02.00]Early vocal'));
    assert.equal(resolveNostalgiaCue(early, 1.5).kind, 'blank');
    assert.equal(resolveNostalgiaCue(new LyricTimeline(), 7).kind, 'blank');
});

test('slide fades follow timestamps without restarting between paired lines or resurrecting in gaps', () => {
    const timeline = new LyricTimeline(parseLyrics('[00:10.00]First\n[00:16.00]Second\n[00:30.00]Next'));
    const slides = buildNostalgiaSlides(timeline.lyrics);
    const at = time => resolveNostalgiaCue(timeline, time, Infinity, slides);
    assert.equal(at(9.88).opacity, 0);
    assert.ok(at(10).opacity > 0 && at(10).opacity < 1);
    assert.equal(at(12).opacity, 1);
    assert.equal(at(15).kind, 'lyric'); // No release midway through a two-line slide.
    assert.equal(at(15.95).slideIndex, at(12).slideIndex);
    assert.equal(at(16).opacity, 1);
    assert.ok(at(20).opacity > 0 && at(20).opacity < 1);
    for (const time of [20.2, 24, 29.7]) assert.equal(at(time).kind, 'blank');
    assert.equal(at(12).opacity, 1);
    assert.equal(at(30.5).slideIndex, 2);
    assert.equal(resolveNostalgiaCue(timeline, 31, 31, slides).kind, 'blank');
});

test('crossfade reconstructs complementary old/new slides and never bridges gaps or empty lyrics', () => {
    const timeline = new LyricTimeline(parseLyrics('[00:10.00]Old A\n[00:12.00]Old B\n[00:14.00]New A\n[00:16.00]New B\n[00:30.00]After gap'));
    const slides = buildNostalgiaSlides(timeline.lyrics);
    const at = time => resolveNostalgiaFrame(timeline, time, 40, slides);
    const boundary = timeline.lines[2].revealAt;
    const middle = at(boundary + .325);
    assert.equal(middle.current.slideIndex, 2); assert.equal(middle.outgoing.slideIndex, 0);
    assert.ok(Math.abs(middle.current.opacity - .5) < 1e-6);
    assert.ok(Math.abs(middle.current.opacity + middle.outgoing.opacity - 1) < 1e-6);
    assert.equal(at(boundary).current.opacity, 0); assert.equal(at(boundary).outgoing.opacity, 1);
    assert.equal(at(boundary + .66).outgoing.kind, 'blank');
    assert.equal(at(12).outgoing.kind, 'blank'); // The second line stays on its original slide.
    assert.equal(at(25).current.kind, 'blank'); assert.equal(at(30).outgoing.kind, 'blank');
    assert.deepEqual(at(boundary + .325), middle); // A backwards seek needs no previous frame.
    assert.equal(at(40).outgoing.kind, 'blank');
    const empty = new LyricTimeline([{ time: 10, text: 'A' }, { time: 12, text: '' }, { time: 13, text: 'B' }]);
    assert.equal(resolveNostalgiaFrame(empty, 12).outgoing.kind, 'blank');
    assert.equal(resolveNostalgiaFrame(empty, 13).outgoing.kind, 'blank');
    const rapid = new LyricTimeline([10, 10.2, 10.4].map((time, index) => ({ time, text: String(index), isEnhanced: true })));
    const shortBlend = resolveNostalgiaFrame(rapid, rapid.lines[1].revealAt + .05);
    assert.ok(shortBlend.outgoing.opacity > 0 && shortBlend.current.opacity > 0);
    assert.equal(resolveNostalgiaFrame(rapid, rapid.lines[1].revealAt + .11).outgoing.kind, 'blank');
});

test('controller keeps two stable crossfade surfaces and clears old lyrics on seeks, track changes and exit', t => {
    const f = fixture(t), root = f.get('nostalgia-text-container'), old = f.get('nostalgia-outgoing-text');
    old.view = f.get('nostalgia-view');
    LyricEngine.setDriftRatio(1);
    LyricEngine.setLyrics('[00:10.00]Old A\n[00:12.00]Old B\n[00:14.00]New A\n[00:16.00]New B');
    f.audio.currentTime = 14.205; f.get('btn-nostalgia').click();
    assert.equal(root.textContent, 'New ANew B'); assert.equal(old.textContent, 'Old AOld B');
    assert.equal(f.get('nostalgia-view').dataset.cue, 'lyric');
    const paints = [root.paints, old.paints];
    for (const time of [14.3, 14.4]) f.controller.sync(time);
    assert.deepEqual([root.paints, old.paints], paints);
    f.controller.sync(22); assert.equal(root.children.length, 0); assert.equal(old.children.length, 0);
    f.controller.sync(14.205); assert.equal(old.textContent, 'Old AOld B');
    LyricEngine.setLyrics('[00:00.00]Replacement'); f.controller.sync();
    assert.equal(old.children.length, 0);
    f.get('btn-exit-nostalgia').click(); assert.equal(root.children.length, 0); assert.equal(old.children.length, 0);
});

test('raster wrapping preserves Vietnamese accents, Japanese marks and authored line breaks', () => {
    const measure = text => [...text].length;
    const vietnamese = 'Ngày cũ vẫn ở đây'.normalize('NFD');
    const rows = wrapNostalgiaText(vietnamese, measure, 9);
    assert.equal(rows.join(' '), vietnamese.normalize('NFC'));
    assert.ok(rows.every(row => measure(row) <= 9));
    const japanese = 'あの日のメロディー、思い出はここにある';
    const jaRows = wrapNostalgiaText(japanese, measure, 8);
    assert.equal(jaRows.join(''), japanese);
    assert.ok(jaRows.every(row => !/^[、。ーィ]/u.test(row)));
    assert.deepEqual(wrapNostalgiaText('First\nSecond', measure, 20), ['First', 'Second']);
});

test('small subtitle raster does not repaint between cues, clears gaps, and ignores hidden mode', t => {
    const f = fixture(t);
    const view = f.get('nostalgia-view'), root = f.get('nostalgia-text-container');
    const previousStyle = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'sans-serif' });
    t.after(() => { globalThis.getComputedStyle = previousStyle; });
    view.getBoundingClientRect = () => ({ width: 1280, height: 720 });
    let clears = 0;
    const context = { clearRect() { clears++; }, measureText: text => ({ width: text.length * 10 }), fillText() {} };
    const canvas = { getContext: () => context };
    const raster = createNostalgiaRaster(view, root, canvas);
    t.after(() => raster.dispose());
    LyricEngine.setLyrics('[00:02.00]Ngày cũ\n[00:06.00]思い出');
    f.audio.currentTime = 3; f.get('btn-nostalgia').click(); raster.paint();
    assert.equal(canvas.width, 480); assert.equal(canvas.height, 270);
    const initial = clears;
    for (let i = 0; i < 60; i++) raster.paint();
    assert.equal(clears, initial);
    root.replaceChildren(); root.dataset.cue = 'blank'; raster.paint();
    assert.equal(clears, initial + 1);
    view.classList.add('hidden'); raster.paint(true);
    assert.equal(clears, initial + 1);
});
