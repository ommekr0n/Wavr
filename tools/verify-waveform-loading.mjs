import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WaveformLoader, sampleWaveform } from '../js/features/player/WaveformLoader.js';
import { WaveformStore, waveformSourceKey, validWaveform } from '../js/features/player/WaveformStore.js';
import { initVaultSessionBoundary } from '../js/features/vault/VaultSessionBoundary.js';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const decoded = { getChannelData: () => new Float32Array(1400).fill(.5) };
function fixture(options = {}) {
    const timers = new Map(), fetched = [], decodes = [], writes = []; let id = 0;
    const loader = new WaveformLoader({
        schedule: cb => { timers.set(++id, cb); return id; }, cancel: key => timers.delete(key),
        store: { get: async () => null, put: async (...args) => writes.push(args), clear: async () => writes.splice(0) },
        fetchAudio: async (url, signal) => { fetched.push({ url, signal }); return url; },
        decode: value => { const job = deferred(); decodes.push({ value, ...job }); return job.promise; }, ...options
    });
    return { loader, timers, fetched, decodes, writes, async start() {
        for (const [key, callback] of timers) { timers.delete(key); callback(); }
        await flush();
    } };
}

test('rapid skips coalesce before fetching; duplicate current selections share the same job', async () => {
    const f = fixture(), a = f.loader.load('a'), b = f.loader.load('b'), c = f.loader.load('c');
    assert.equal(f.loader.load('c'), c); assert.equal(f.timers.size, 1);
    assert.equal(await a, null); assert.equal(await b, null);
    await f.start(); assert.deepEqual(f.fetched.map(item => item.url), ['c']);
    assert.equal(f.loader.load('c'), c);
    f.decodes[0].resolve(decoded); assert.equal((await c).length, 140); await flush();
    assert.equal(f.writes.length, 1); assert.equal(f.loader.cache.size, 1);
});

test('default timer cancellation calls browser timer APIs without a loader receiver', async t => {
    let cancelled = 0;
    t.mock.method(globalThis, 'clearTimeout', function () {
        assert.equal(this, undefined); cancelled++;
    });
    const loader = new WaveformLoader({ schedule: () => 1 });
    const first = loader.load('first'); loader.load('second'); loader.clear();
    assert.equal(await first, null); assert.equal(cancelled, 2);
});

test('an uncancellable old decode finishes before the latest song starts; intermediate songs never decode', async () => {
    const f = fixture(), a = f.loader.load('a'); await f.start();
    const b = f.loader.load('b'); await f.start(); const c = f.loader.load('c'); await f.start();
    assert.equal(await a, null); assert.equal(await b, null);
    assert.equal(f.fetched[0].signal.aborted, true); assert.equal(f.decodes.length, 1);
    f.decodes[0].resolve(decoded); await flush();
    assert.deepEqual(f.decodes.map(item => item.value), ['a', 'c']); assert.equal(f.writes.length, 0);
    f.decodes[1].resolve(decoded); await c; await flush(); assert.equal(f.writes[0][0], 'c');
});

test('obsolete fetches abort and their late bytes cannot enter the decoder', async () => {
    const network = deferred();
    const f = fixture({ fetchAudio: (url, signal) => {
        f.fetched.push({ url, signal }); return url === 'a' ? network.promise : Promise.resolve(url);
    } });
    const a = f.loader.load('a'); await f.start(); const b = f.loader.load('b'); await f.start();
    assert.equal(f.fetched[0].signal.aborted, true); network.resolve('a'); await flush();
    assert.equal(await a, null); assert.deepEqual(f.decodes.map(job => job.value), ['b']);
    f.decodes[0].resolve(decoded); await b;
});

test('stored peaks skip network and decode, and the memory LRU stays bounded', async () => {
    const points = sampleWaveform(decoded.getChannelData());
    const f = fixture({ maxEntries: 2, store: { get: async () => points } });
    for (const url of ['a', 'b', 'c']) { const result = f.loader.load(url); await f.start(); assert.deepEqual(await result, points); await flush(); }
    assert.equal(f.fetched.length, 0); assert.equal(f.decodes.length, 0);
    assert.deepEqual([...f.loader.cache.keys()], ['b', 'c']);
    assert.deepEqual(await f.loader.load('b'), points); assert.deepEqual([...f.loader.cache.keys()], ['c', 'b']);
});

test('failed decodes are retryable and never persist fallback data; clearing rejects late completions', async () => {
    const errors = [], f = fixture({ onError: error => errors.push(error) });
    const a = f.loader.load('a'); await f.start(); f.decodes[0].reject(new Error('bad audio'));
    assert.equal(await a, null); await flush(); assert.equal(f.loader.cache.size, 0); assert.equal(f.writes.length, 0);
    const retry = f.loader.load('a'); await f.start(); assert.equal(f.decodes.length, 2);
    await f.loader.clear(); f.decodes[1].resolve(decoded); assert.equal(await retry, null); await flush();
    assert.equal(f.writes.length, 0); assert.equal(f.loader.cache.size, 0); assert.equal(errors.length, 1);
});

test('storage failures and absent IndexedDB fall back to on-demand processing', async () => {
    const store = new WaveformStore({ storage: null });
    assert.equal(await store.get('https://audio.test/a'), null);
    await store.put('a', sampleWaveform([])); await store.clear();
    const f = fixture({ store }); const a = f.loader.load('a'); await f.start();
    f.decodes[0].resolve(decoded); assert.equal(validWaveform(await a), true);
});

test('a transient IndexedDB open failure can retry on a later selection', async () => {
    let attempts = 0;
    const database = { close() {} };
    const store = new WaveformStore({ storage: { open() {
        if (++attempts === 1) throw new Error('Temporarily unavailable');
        const request = { result: database };
        queueMicrotask(() => request.onsuccess()); return request;
    } } });
    assert.equal(await store.open(), null);
    assert.equal(await store.open(), database); assert.equal(attempts, 2);
});

test('waveform keys survive gateway signature renewal but distinguish media replacement and other query variants', async () => {
    const a = 'https://media.test/v1/media/user/tracks/1.mp3?expires=1&signature=old';
    const b = 'https://media.test/v1/media/user/tracks/1.mp3?expires=2&signature=new';
    const store = new WaveformStore({ storage: null });
    assert.equal(waveformSourceKey(a), waveformSourceKey(b)); assert.equal(await store.key(a), await store.key(b));
    assert.notEqual(await store.key(a), await store.key(b.replace('1.mp3', '2.mp3')));
    assert.notEqual(waveformSourceKey('https://audio.test/a?v=1'), waveformSourceKey('https://audio.test/a?v=2'));
    assert.match(await store.key(a), /^[a-f0-9]{64}$/);
});

test('identity changes stop private UI immediately and reload once after persistent cache cleanup settles', async () => {
    for (const fail of [false, true]) {
        const cleanup = deferred(), order = []; let callback;
        initVaultSessionBoundary({ onAuthStateChange(cb) { callback = cb; } }, {
            clearPrivateState: () => { order.push('clear'); return cleanup.promise; }, reload: () => order.push('reload')
        });
        callback('INITIAL_SESSION', { user: { id: 'a' } }); callback('SIGNED_OUT', null); callback('SIGNED_OUT', null);
        assert.deepEqual(order, ['clear']);
        if (fail) cleanup.reject(new Error('storage unavailable')); else cleanup.resolve();
        await flush(); assert.deepEqual(order, ['clear', 'reload']);
    }
});

test('silence, tiny audio and invalid cached arrays cannot produce nonfinite peaks', () => {
    for (const source of [[], [.2], new Float32Array(14000)]) assert.equal(validWaveform(sampleWaveform(source)), true);
    assert.equal(validWaveform(Array(140).fill(NaN)), false); assert.equal(validWaveform([.5]), false);
});

test('returning-user splash makes no waveform requests, regardless of library size', async t => {
    const originals = { document: globalThis.document, storage: globalThis.localStorage, timer: globalThis.setTimeout };
    t.after(() => Object.assign(globalThis, { document: originals.document, localStorage: originals.storage, setTimeout: originals.timer }));
    const nodes = new Map(['app-splash-loader', 'splash-progress-bar', 'splash-status-text', 'splash-status-pct'].map(id => [id, { style: {}, classList: { add(value) { this.value = value; } } }]));
    globalThis.document = { getElementById: id => nodes.get(id) }; globalThis.localStorage = { getItem: () => 'true' };
    globalThis.setTimeout = callback => { callback(); return 0; };
    const { runSplashBootstrapper } = await import('../js/features/splash/AppBootstrapper.js');
    await runSplashBootstrapper(Array.from({ length: 500 }, () => ({ url: 'unused' })));
    assert.equal(nodes.get('splash-status-pct').textContent, '100%');
    assert.equal(nodes.get('app-splash-loader').classList.value, 'splash-fade-out');
    const source = await readFile(new URL('../js/features/splash/AppBootstrapper.js', import.meta.url), 'utf8');
    assert.equal(source.includes('loadAndDecodeWaveform'), false);
});
