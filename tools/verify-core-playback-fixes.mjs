import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    load(url, context, nextLoad) {
        if (url.endsWith('?url') || url.endsWith('.png')) {
            return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(url)};` };
        }
        return nextLoad(url, context);
    }
});

const { createMediaPlaybackGate } = await import('../js/features/vault/MediaPlaybackGate.js');
const { PlaybackEngine, PLAYBACK_STATES } = await import('../js/core/PlaybackEngine.js');
const { AudioEngine } = await import('../js/core/audio/AudioEngine.js');
const { FFTAnalyzer } = await import('../js/core/audio/FFTAnalyzer.js');
const { createPlayerViewNavigation } = await import('../js/features/player/PlayerViewNavigation.js');
const { queueManager } = await import('../js/core/QueueManager.js');
const { removeLibraryTrackFromQueue } = await import('../js/features/library/LibraryQueueMaintenance.js');
const { setupRecordingController } = await import('../js/features/player/RecordingModalController.js');
const { MiniPlayerController } = await import('../js/features/player/MiniPlayerController.js');
const { drawMiniWaveform } = await import('../js/features/player/WaveformEngine.js');

function createMockAudio() {
    const target = new EventTarget();
    let src = '';
    const audio = {
        paused: true,
        currentTime: 0,
        duration: 120,
        volume: 0.8,
        muted: false,
        error: null,
        loads: 0,
        removedSrc: false,
        get src() { return src; },
        set src(v) { src = v; this.removedSrc = false; },
        addEventListener: (...args) => target.addEventListener(...args),
        removeEventListener: (...args) => target.removeEventListener(...args),
        dispatchEvent: (e) => target.dispatchEvent(e),
        load() { this.loads++; },
        removeAttribute(attr) { if (attr === 'src') { src = ''; this.removedSrc = true; } },
        pause() {
            this.paused = true;
            target.dispatchEvent(new Event('pause'));
        },
        async play() {
            this.paused = false;
            target.dispatchEvent(new Event('play'));
        }
    };
    return audio;
}

function createClassList(...initial) {
    const set = new Set(initial);
    return {
        contains: name => set.has(name),
        add: name => set.add(name),
        remove: name => set.delete(name),
        toggle(name, force) {
            if (force === undefined) {
                if (set.has(name)) set.delete(name); else set.add(name);
            } else if (force) {
                set.add(name);
            } else {
                set.delete(name);
            }
        }
    };
}

test('first track selection opens Player View immediately even while PlaybackEngine.currentTrack is still null', () => {
    const homeView = { classList: createClassList() };
    const playerView = { offsetHeight: 100, classList: createClassList('hidden') };
    const miniPlayer = { classList: createClassList('hidden') };
    const queue = [{ id: 't1', title: 'Track 1', url: 'r2://t1.mp3' }];
    let currentIndex = -1;
    const engine = { currentTrack: null };
    const timers = [];

    const nav = createPlayerViewNavigation({
        homeView,
        playerView,
        miniPlayer,
        hasTrack: () => Boolean(queue[currentIndex]),
        schedule: (fn) => { timers.push(fn); return timers.length; },
        cancel: () => {}
    });

    nav.expand();
    assert.equal(playerView.classList.contains('hidden'), true);

    currentIndex = 0;
    assert.equal(engine.currentTrack, null);
    nav.selectTrack();
    for (const fn of timers) fn();

    assert.equal(playerView.classList.contains('hidden'), false);
    assert.equal(playerView.classList.contains('player-active'), true);
    assert.equal(homeView.classList.contains('hidden'), true);
});

test('MediaPlaybackGate resolves broken cover non-fatally, retries failed load on play, and reset() invalidates stale loads', async () => {
    let commits = 0, plays = 0;
    const coverFailGate = createMediaPlaybackGate({
        resolve: async (uri) => {
            if (uri === 'r2://broken-cover') throw new Error('cover 404');
            return uri.startsWith('https://') ? uri : `https://signed.test/${uri}`;
        },
        play: () => { plays++; },
        pause: () => {}
    });
    const track1 = { url: 'track.mp3', cover: 'r2://broken-cover' };
    await coverFailGate.load(track1, () => { commits++; });
    await coverFailGate.play();
    assert.equal(commits, 1);
    assert.equal(plays, 1);
    assert.equal(track1.url, 'https://signed.test/track.mp3');

    let attempt = 0;
    let retryCommits = 0, retryPlays = 0;
    const retryGate = createMediaPlaybackGate({
        resolve: async (uri) => {
            if (uri === 'r2://audio.mp3') {
                attempt++;
                if (attempt === 1) throw new Error('transient network error');
                return 'https://signed.test/audio.mp3';
            }
            return uri;
        },
        play: () => { retryPlays++; },
        pause: () => {}
    });
    const track2 = { url: 'r2://audio.mp3', cover: 'cover.png' };
    await assert.rejects(retryGate.load(track2, () => { retryCommits++; }), /transient/);
    assert.equal(retryCommits, 0);
    assert.equal(retryPlays, 0);

    await retryGate.play();
    assert.equal(retryCommits, 1);
    assert.equal(retryPlays, 1);
    assert.equal(track2.url, 'https://signed.test/audio.mp3');

    let resolvePending;
    let resetCommits = 0, resetPlays = 0;
    const resetGate = createMediaPlaybackGate({
        resolve: (uri) => uri === 'slow' ? new Promise(r => { resolvePending = r; }) : Promise.resolve(uri),
        play: () => { resetPlays++; },
        pause: () => {}
    });
    const pendingLoad = resetGate.load({ url: 'slow', cover: '' }, () => { resetCommits++; });
    resetGate.reset();
    resolvePending('https://signed.test/slow');
    const loadResult = await pendingLoad;
    assert.equal(loadResult, false);
    assert.equal(resetCommits, 0);
    await resetGate.play();
    assert.equal(resetPlays, 0);
});

test('PlaybackEngine.stop() remains IDLE after native pause event and clear() resets track and src', () => {
    const audio = createMockAudio();
    const engine = new PlaybackEngine(audio);
    const track = { id: '1', url: 'https://media.test/1.mp3' };

    engine.loadTrack(track);
    assert.equal(engine.currentTrack, track);
    assert.equal(engine.state, PLAYBACK_STATES.LOADING);

    audio.dispatchEvent(new Event('play'));
    assert.equal(engine.state, PLAYBACK_STATES.PLAYING);

    engine.stop();
    assert.equal(engine.state, PLAYBACK_STATES.IDLE);
    assert.equal(audio.currentTime, 0);

    audio.dispatchEvent(new Event('pause'));
    assert.equal(engine.state, PLAYBACK_STATES.IDLE);

    let lastTrackEvent = 'unset';
    engine.addEventListener('trackchange', (e) => { lastTrackEvent = e.detail.track; });
    engine.clear();
    assert.equal(engine.currentTrack, null);
    assert.equal(engine.state, PLAYBACK_STATES.IDLE);
    assert.equal(audio.removedSrc, true);
    assert.equal(lastTrackEvent, null);
});

test('AudioEngine.init() does not lock up after partial init failure, reconnects analyser on worklet wire failure, and handles rejected resume()', async (t) => {
    const origWindow = globalThis.window;
    const origDoc = globalThis.document;
    const origWorkletNode = globalThis.AudioWorkletNode;
    const origWarn = console.warn;

    const connections = new Set();
    let shouldFailSource = true;
    let resumeCalls = 0;

    function makeNode(name) {
        return {
            name,
            type: '',
            frequency: { value: 0 },
            Q: { value: 0 },
            gain: { value: 0 },
            fftSize: 0,
            frequencyBinCount: 128,
            connect(dest) {
                if (dest?.failConnect) throw new Error('worklet connect failed');
                connections.add(`${name}->${dest.name}`);
            },
            disconnect(dest) {
                connections.delete(`${name}->${dest.name}`);
            }
        };
    }

    let eqCounter = 0;
    class MockAudioContext {
        constructor() {
            this.state = 'suspended';
            this.destination = makeNode('dest');
            this.audioWorklet = { addModule: () => Promise.resolve() };
        }
        createAnalyser() { return makeNode('analyser'); }
        createMediaElementSource() {
            if (shouldFailSource) throw new Error('media source init failed');
            return makeNode('source');
        }
        createBiquadFilter() { return makeNode(`eq${eqCounter++}`); }
        resume() {
            resumeCalls++;
            return Promise.reject(new Error('autoplay policy blocked'));
        }
        close() { return Promise.resolve(); }
    }

    globalThis.window = { AudioContext: MockAudioContext };
    globalThis.document = { querySelectorAll: () => [] };
    globalThis.AudioWorkletNode = class {
        constructor() {
            this.name = 'worklet';
            this.port = {};
            this.failConnect = true;
        }
        connect() { throw new Error('worklet connect failed'); }
    };
    console.warn = () => {};

    t.after(() => {
        globalThis.window = origWindow;
        globalThis.document = origDoc;
        globalThis.AudioWorkletNode = origWorkletNode;
        console.warn = origWarn;
    });

    // First init fails inside createMediaElementSource -> audioCtx must remain null
    assert.throws(() => AudioEngine.init({}), /media source init failed/);
    assert.equal(AudioEngine.getAudioContext(), null);

    // Second init succeeds; worklet wiring fails and must reconnect eq4->analyser
    shouldFailSource = false;
    AudioEngine.init({});
    assert.notEqual(AudioEngine.getAudioContext(), null);
    assert.equal(resumeCalls, 1);

    // Let worklet microtask and resume rejection settle cleanly
    await new Promise(r => setTimeout(r, 20));
    assert.equal(connections.has('eq4->analyser'), true);
});

test('removeLibraryTrackFromQueue calls clearPlayback and resetMediaGate when last track is deleted', () => {
    const onlyTrack = { id: 'solo', title: 'Solo', url: 'https://media.test/solo.mp3' };
    queueManager.startQueue([onlyTrack], 0, 'library');

    let paused = 0, cleared = 0, reset = 0, miniUpdated = 0;
    removeLibraryTrackFromQueue(onlyTrack, {
        pauseAudio: () => { paused++; },
        loadTrack: () => { assert.fail('must not load track when queue is empty'); },
        updateMiniPlayerUI: () => { miniUpdated++; },
        clearPlayback: () => { cleared++; },
        resetMediaGate: () => { reset++; }
    });

    assert.equal(paused, 1);
    assert.equal(cleared, 1);
    assert.equal(reset, 1);
    assert.equal(miniUpdated, 1);
    assert.equal(queueManager.currentTrackIndex, -1);
});

test('FFTAnalyzer handles short arrays without NaN and maintains accurate sliding-window Welford stats', () => {
    FFTAnalyzer.reset();

    for (const arr of [new Uint8Array([128]), new Uint8Array([100, 200])]) {
        const res = FFTAnalyzer.analyze(arr);
        assert.equal(Number.isFinite(res.intensity), true);
        assert.equal(Number.isFinite(res.midIntensity), true);
        assert.equal(Number.isFinite(res.highIntensity), true);
        assert.equal(Number.isFinite(res.energy), true);
        assert.equal(Number.isFinite(res.valence), true);
    }

    FFTAnalyzer.reset();
    const loud = new Uint8Array(128).fill(220);
    const quiet = new Uint8Array(128).fill(20);
    for (let i = 0; i < 240; i++) {
        const res = FFTAnalyzer.analyze(i % 2 === 0 ? quiet : loud);
        assert.equal(Number.isFinite(res.intensity), true);
        assert.equal(Number.isFinite(res.energy), true);
    }
    const zero = new Uint8Array(128).fill(0);
    let finalRes;
    for (let i = 0; i < 200; i++) {
        finalRes = FFTAnalyzer.analyze(zero);
    }
    assert.equal(finalRes.intensity, 0);
    assert.equal(finalRes.subBassOnset, false);
    assert.equal(finalRes.ultraHighOnset, false);
    assert.equal(Number.isFinite(finalRes.energy), true);
});

test('MiniPlayerController and WaveformEngine handle non-finite duration and resize canvas dynamically', (t) => {
    const origDoc = globalThis.document;
    const canvas = {
        width: 0,
        height: 0,
        offsetWidth: 420,
        offsetHeight: 48,
        getContext: () => ({
            clearRect() {},
            save() {},
            restore() {},
            beginPath() {},
            roundRect() {},
            fill() {},
            fillRect() {},
            createLinearGradient: () => ({ addColorStop() {} })
        })
    };
    const miniPlayer = { classList: createClassList() };
    const els = new Map([
        ['mini-player', miniPlayer],
        ['mini-waveform-canvas', canvas]
    ]);
    globalThis.document = {
        hidden: false,
        getElementById: (id) => els.get(id) || null
    };
    t.after(() => { globalThis.document = origDoc; });

    // MiniPlayerController with duration 0 and Infinity must not throw or produce NaN
    for (const duration of [0, Infinity, NaN]) {
        MiniPlayerController.updateUI({
            engine: { state: PLAYBACK_STATES.PAUSED, duration, currentTime: 10 },
            getPlaybackSource: () => [{ title: 'T', artist: 'A', cover: '' }],
            PlayerController: { getCurrentTrackIndex: () => 0, getRepeatMode: () => 0, getIsShuffle: () => false }
        });
    }

    drawMiniWaveform(50);
    assert.equal(canvas.width, 420);

    // Resize layout width and redraw -> canvas must resize
    canvas.offsetWidth = 680;
    drawMiniWaveform(50);
    assert.equal(canvas.width, 680);
});

test('RecordingModalController cancels pending 200ms hide timer when popover is reopened', async (t) => {
    const originalDoc = globalThis.document;
    const makeEl = (id, classes = []) => {
        const elListeners = new Map();
        return {
            id,
            innerHTML: '',
            offsetWidth: 100,
            classList: createClassList(...classes),
            addEventListener: (type, fn) => elListeners.set(type, fn),
            click(e = { stopPropagation() {} }) { elListeners.get('click')?.(e); }
        };
    };
    const btnRecord = makeEl('btn-record');
    const recordPopover = makeEl('record-popover', ['hidden']);
    const els = new Map([
        ['btn-record', btnRecord],
        ['record-popover', recordPopover]
    ]);
    globalThis.document = {
        getElementById: (id) => els.get(id) || null,
        addEventListener: () => {}
    };
    t.after(() => { globalThis.document = originalDoc; });

    setupRecordingController({
        engine: {},
        playAudio: () => {},
        pauseAudio: () => {},
        showToast: () => {},
        getPlaybackSource: () => [],
        PlayerController: { getCurrentTrackIndex: () => -1 },
        LyricEngine: {},
        lyricsList: null,
        angelicTextContainer: null,
        cinematicTextContainer: null,
        updateProgress: () => {}
    });

    btnRecord.click();
    assert.equal(recordPopover.classList.contains('hidden'), false);
    assert.equal(recordPopover.classList.contains('active'), true);

    btnRecord.click();
    assert.equal(recordPopover.classList.contains('active'), false);

    await new Promise(r => setTimeout(r, 40));
    btnRecord.click();
    assert.equal(recordPopover.classList.contains('hidden'), false);
    assert.equal(recordPopover.classList.contains('active'), true);

    await new Promise(r => setTimeout(r, 240));
    assert.equal(recordPopover.classList.contains('hidden'), false);
    assert.equal(recordPopover.classList.contains('active'), true);
});

test('main.js and modified core/player modules contain required safeguards and zero console.log', () => {
    const files = [
        '../js/main.js',
        '../js/features/player/TrackTransitionController.js',
        '../js/features/player/PlayerEventBindings.js',
        '../js/modules/toast-service.js',
        '../js/core/audio/AudioEngine.js',
        '../js/features/player/MiniPlayerController.js',
        '../js/features/player/WaveformEngine.js',
        '../js/features/vault/MediaPlaybackGate.js',
        '../js/core/PlaybackEngine.js',
        '../js/core/audio/FFTAnalyzer.js',
        '../js/features/player/RecordingModalController.js',
        '../js/features/library/LibraryQueueMaintenance.js',
        '../js/features/library/LibraryModals.js'
    ];
    const sources = Object.fromEntries(files.map(f => [f, fs.readFileSync(new URL(f, import.meta.url), 'utf8')]));

    for (const [name, src] of Object.entries(sources)) {
        assert.equal(/\bconsole\.log\s*\(/.test(src), false, `${name} must not contain console.log`);
    }

    const mainSrc = sources['../js/main.js'];
    const transitionSrc = sources['../js/features/player/TrackTransitionController.js'];
    const bindingsSrc = sources['../js/features/player/PlayerEventBindings.js'];
    assert.match(mainSrc, /hasTrack:\s*\(\)\s*=>\s*Boolean\(getPlaybackSource\(\)\[PlayerController\.getCurrentTrackIndex\(\)\]\)/);
    assert.match(transitionSrc, /if\s*\(shuffledQueue\.length\s*!==\s*source\.length\s*\|\|\s*qIdx\s*===\s*-1\)/);
    assert.match(bindingsSrc, /lyricsList\.addEventListener\('click'/);
    assert.match(bindingsSrc, /\.am-lyric-line:not\(\.placeholder-line\)/);
    assert.match(transitionSrc, /applyTrackVersion/);
    assert.match(transitionSrc, /clearTimeout\(angelicPrepareTimer\)/);
    assert.match(transitionSrc, /!Number\.isFinite\(seconds\)\s*\|\|\s*seconds\s*<\s*0/);
    assert.match(transitionSrc, /!Number\.isFinite\(audio\.duration\)\s*\|\|\s*audio\.duration\s*<=\s*0/);
    assert.match(bindingsSrc, /playbackEngine\.addEventListener\('volumechange'/);
    assert.match(mainSrc, /mediaPlayback\.reset\(\)/);
    assert.match(mainSrc, /playbackEngine\.clear\(\)/);
});
