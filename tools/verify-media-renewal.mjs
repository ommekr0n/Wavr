import test from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../workers/wavr-media-gateway.js';
import { createPrivateMediaResolver, privateMediaPath, privateMediaUri, mediaUrlNeedsRefresh } from '../js/features/vault/PrivateMediaUrls.js';
import { createMediaPlaybackGate } from '../js/features/vault/MediaPlaybackGate.js';
import { initMediaUrlLifecycle } from '../js/features/vault/MediaUrlLifecycle.js';

const origin = 'https://media.test';
const path = 'user/tracks/Bật Chế Bắc.wav';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const signed = (key, expires) => `${origin}/v1/media/${key.split('/').map(encodeURIComponent).join('/')}?expires=${expires}&signature=test`;

test('renewal handles r2, legacy, expired and near-expiry URLs, but excludes other origins', async () => {
    const now = 1_000_000, calls = [];
    const resolve = createPrivateMediaResolver(origin, async (route, options) => {
        calls.push([route, options]);
        return Response.json({ url: signed(path, 1900) });
    }, () => now);
    const expired = signed(path, 999);
    const fresh = await resolve(expired);
    assert.equal(mediaUrlNeedsRefresh(fresh, origin, now), false);
    assert.equal(privateMediaUri(fresh, origin), `r2://${path}`);
    assert.equal(privateMediaPath(`${fresh}&_wavr_cors=1`, origin), path);
    assert.equal(await resolve(`r2://${path}`), fresh);
    assert.equal(await resolve(`https://old.r2.dev/${encodeURI(path)}`), fresh);
    assert.equal(await resolve(signed(path, 1100)), fresh);
    for (const uri of [fresh, 'blob:local', 'data:image/png,abc', null, 'https://other.test/v1/media/user/a?expires=1&signature=x']) {
        assert.equal(await resolve(uri), uri);
    }
    assert.equal(calls.length, 4);
    assert.equal(calls[0][0], `/v1/signed/${path.split('/').map(encodeURIComponent).join('/')}`);
    assert.equal(calls[0][1].cache, 'no-store');
});

test('concurrent renewal is deduplicated and a failed signer can be retried', async () => {
    let calls = 0; const pending = deferred();
    const resolve = createPrivateMediaResolver(origin, () => { calls++; return pending.promise; }, () => 1_000_000);
    const a = resolve(`r2://${path}`), b = resolve(signed(path, 1));
    pending.resolve(new Response('Unauthorized', { status: 401 }));
    await Promise.all([assert.rejects(a, /401/), assert.rejects(b, /401/)]);
    assert.equal(calls, 1);
    await assert.rejects(resolve(`r2://${path}`), /401/);
    assert.equal(calls, 2);
});

test('expired Worker URL returns 401, renewed URL serves real media; signer still enforces ownership', async t => {
    const originalFetch = globalThis.fetch, originalNow = Date.now;
    let now = originalNow();
    Date.now = () => now;
    globalThis.fetch = async () => Response.json({ id: 'user' });
    t.after(() => { globalThis.fetch = originalFetch; Date.now = originalNow; });
    const env = {
        MEDIA_SIGNING_KEY: 'test-only-signing-key', SUPABASE_URL: 'https://auth.test',
        MEDIA: { get: async key => ({ body: 'audio bytes', size: 11, httpMetadata: { contentType: 'audio/wav' } }) }
    };
    const request = (route, options = {}) => gateway.fetch(new Request(`${origin}${route}`, {
        ...options, headers: { Authorization: 'Bearer test-token' }
    }), env);
    const resolve = createPrivateMediaResolver(origin, request);
    const first = await resolve(`r2://${path}`);
    assert.equal((await gateway.fetch(new Request(first), env)).status, 200);
    now += 901_000;
    assert.equal((await gateway.fetch(new Request(first), env)).status, 401);
    const fresh = await resolve(first);
    assert.notEqual(fresh, first);
    const response = await gateway.fetch(new Request(`${fresh}&_wavr_cors=1`), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.equal(await response.text(), 'audio bytes');
    await assert.rejects(resolve('r2://someone-else/tracks/private.wav'), /401/);
});

test('playback waits for renewal, latest selection wins, and pause cancels pending autoplay', async () => {
    const a = deferred(), b = deferred(), commits = [], plays = [];
    const gate = createMediaPlaybackGate({ resolve: uri => uri === 'a' ? a.promise : uri === 'b' ? b.promise : Promise.resolve(uri),
        play: () => plays.push('play'), pause: () => {} });
    const old = gate.load({ url: 'a' }, () => commits.push('a'));
    const oldPlay = gate.play();
    const latest = gate.load({ url: 'b' }, () => commits.push('b'));
    const newPlay = gate.play();
    b.resolve('fresh-b'); await latest; await newPlay;
    a.resolve('fresh-a'); await old; await oldPlay;
    assert.deepEqual(commits, ['b']); assert.equal(plays.length, 1);
    const loading = gate.load({ url: 'a' }, () => {});
    const cancelled = gate.play(); gate.pause(); await loading; await cancelled;
    assert.equal(plays.length, 1);
});

test('cover lifecycle replaces image/background references and track URLs without touching audio', async t => {
    const old = signed(path, 1), fresh = signed(path, 9999);
    const track = { url: old, cover: old }, listeners = new Map();
    const image = { src: old, getAttribute: () => old };
    const element = { style: { backgroundImage: `url("${old}")` } };
    const doc = { hidden: true, addEventListener: (event, fn) => listeners.set(event, fn),
        removeEventListener: event => listeners.delete(event),
        querySelectorAll: query => query === 'img[src]' ? [image] : [element] };
    const cleanup = initMediaUrlLifecycle({ getTracks: () => [track], resolve: async () => fresh,
        needsRefresh: uri => uri === old, doc });
    t.after(cleanup);
    assert.equal(track.cover, old);
    doc.hidden = false; await listeners.get('visibilitychange')();
    assert.equal(track.cover, fresh); assert.equal(track.url, fresh);
    assert.equal(image.src, fresh); assert.equal(element.style.backgroundImage, `url("${fresh}")`);
});

test('resume renews the audio source and preserves position; pause during renewal cancels play', async () => {
    let commits = 0, plays = 0, restored = null, resume = false;
    const renewal = deferred(), track = { url: 'old', cover: 'cover' };
    const gate = createMediaPlaybackGate({
        resolve: async uri => resume && uri !== 'cover' ? renewal.promise : uri,
        pause: () => {}, play: () => plays++, getTime: () => 123,
        restoreTime: (time, isCurrent) => { assert.equal(isCurrent(), true); restored = time; }
    });
    await gate.load(track, () => commits++);
    resume = true;
    const cancelled = gate.play();
    await Promise.resolve(); gate.pause(); renewal.resolve('new'); await cancelled;
    assert.equal(plays, 0); assert.equal(commits, 1);
    await gate.play();
    assert.equal(plays, 1); assert.equal(commits, 2); assert.equal(restored, 123);
    assert.equal(track.url, 'new');
});

test('a failed renewal never plays the previously selected media', async () => {
    let plays = 0;
    const gate = createMediaPlaybackGate({ resolve: async () => { throw new Error('signing unavailable'); },
        pause: () => {}, play: () => plays++ });
    await assert.rejects(gate.load({ url: 'private' }, () => assert.fail('must not commit')), /unavailable/);
    await assert.rejects(gate.play(), /unavailable/);
    assert.equal(plays, 0);
});
