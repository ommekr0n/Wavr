import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LyricEngine } from '../js/features/lyrics/LyricEngine.js';
import { AngelicLyricBuilder } from '../js/features/angelic/AngelicLyricBuilder.js';
import { escapeHtml, safeImageUrl, safeHexColor } from '../js/modules/safe-html.js';
import { clearVaultBrowserState } from '../js/features/vault/VaultSessionBoundary.js';
import { clearStoredBackground } from '../js/modules/background-manager.js';
import { CloudSyncIndicator } from '../js/features/vault/CloudSyncIndicator.js';
import { SupabaseService, supabase } from '../js/services/SupabaseService.js';
import worker from '../workers/wavr-media-gateway.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function makeMockElement(tag = 'div') {
    const attrs = new Map();
    const classes = new Set();
    const children = [];
    return {
        tagName: tag.toUpperCase(),
        nodeName: tag.toUpperCase(),
        className: '',
        innerHTML: '',
        textContent: '',
        title: '',
        style: {},
        dataset: {},
        children,
        childNodes: children,
        nodeType: 1,
        classList: {
            add: (...c) => c.forEach(x => classes.add(x)),
            remove: (...c) => c.forEach(x => classes.delete(x)),
            contains: (c) => classes.has(c)
        },
        setAttribute: (k, v) => attrs.set(k, String(v)),
        getAttribute: (k) => attrs.get(k) ?? null,
        removeAttribute: (k) => attrs.delete(k),
        appendChild: (child) => { children.push(child); return child; },
        prepend: (child) => { children.unshift(child); return child; },
        replaceChildren: () => { children.length = 0; },
        querySelector: () => null,
        querySelectorAll: () => []
    };
}

// ── 1. LyricEngine Standard LRC XSS ──────────────────────────────────────────
test('LyricEngine escapes standard LRC HTML payloads while preserving parenthesis wrapping', (t) => {
    const originalDocument = globalThis.document;
    globalThis.document = {
        createElement: (tag) => makeMockElement(tag),
        getElementById: () => null
    };
    t.after(() => { globalThis.document = originalDocument; });

    const listEl = makeMockElement('div');
    LyricEngine.setLyrics([
        '[00:01.00]<img src=x onerror=alert(1)> (backing <script>alert(2)</script>)',
        '[00:05.00]Hello world (backing vocal)'
    ].join('\n'));
    LyricEngine.renderLyrics(listEl, null, null);

    assert.equal(listEl.children.length, 2);

    const firstHtml = listEl.children[0].innerHTML;
    assert.doesNotMatch(firstHtml, /<img\b/i);
    assert.doesNotMatch(firstHtml, /<script\b/i);
    assert.match(firstHtml, /&lt;img src=x onerror=alert\s*\(1\)\s*&gt;/);
    assert.match(firstHtml, /&lt;script&gt;alert\(2\)/);
    assert.match(firstHtml, /&lt;\/script&gt;/);

    const secondHtml = listEl.children[1].innerHTML;
    assert.match(secondHtml, /<span class="lyric-parenthesis"[^>]*>\(backing vocal\)<\/span>/);
});

// ── 2. AngelicLyricBuilder Standard LRC XSS ──────────────────────────────────
test('AngelicLyricBuilder escapes words and syllables in standard LRC mode', (t) => {
    const originalDocument = globalThis.document;
    globalThis.document = {
        body: { classList: { contains: () => false } }
    };
    t.after(() => { globalThis.document = originalDocument; });

    const html = AngelicLyricBuilder.buildWordsHTML('<img src=x onerror=alert(1)> <script>alert("xss")</script>');
    assert.doesNotMatch(html, /<img\b/i);
    assert.doesNotMatch(html, /<script\b/i);
    assert.match(html, /&lt;img/);
    assert.match(html, /&lt;scrip/);
    assert.match(html, /t&gt;/);
    assert.match(html, /&quot;xss&quot;/);
});

// ── 3. safe-html.js (safeImageUrl & safeHexColor) ────────────────────────────
test('safeImageUrl allows safe schemes and relative paths while rejecting SVG, scripts and CSS breakouts', () => {
    const fallback = 'assets/images/cover.png';

    // Allowed
    assert.equal(safeImageUrl('https://cdn.example.com/art.jpg?v=1&sig=abc', fallback), 'https://cdn.example.com/art.jpg?v=1&sig=abc');
    assert.equal(safeImageUrl('http://localhost:5173/cover.png', fallback), 'http://localhost:5173/cover.png');
    assert.equal(safeImageUrl('blob:https://wavr.example/1234-5678', fallback), 'blob:https://wavr.example/1234-5678');
    assert.equal(safeImageUrl('data:image/png;base64,iVBORw0KGgo=', fallback), 'data:image/png;base64,iVBORw0KGgo=');
    assert.equal(safeImageUrl('data:image/webp;base64,UklGRh4AAABXRUJQ', fallback), 'data:image/webp;base64,UklGRh4AAABXRUJQ');
    assert.equal(safeImageUrl('assets/images/cover.png', fallback), 'assets/images/cover.png');
    assert.equal(safeImageUrl('./assets/images/cover.png', fallback), './assets/images/cover.png');
    assert.equal(safeImageUrl('/assets/cover-abc123.png', fallback), '/assets/cover-abc123.png');

    // Rejected
    assert.equal(safeImageUrl('data:image/svg+xml;base64,PHN2Zz4=', fallback), fallback);
    assert.equal(safeImageUrl('data:image/svg+xml,<svg onload=alert(1)>', fallback), fallback);
    assert.equal(safeImageUrl('javascript:alert(1)', fallback), fallback);
    assert.equal(safeImageUrl('//evil.example/cover.png', fallback), fallback);
    assert.equal(safeImageUrl('../secret/cover.png', fallback), fallback);
    assert.equal(safeImageUrl("https://evil.example/a.jpg') no-repeat; background:red", fallback), fallback);
    assert.equal(safeImageUrl('https://evil.example/a.jpg" onerror="alert(1)', fallback), fallback);
    assert.equal(safeImageUrl('https://evil.example/a.jpg\n;x', fallback), fallback);
    assert.equal(safeImageUrl('https://evil.example/a.jpg\\', fallback), fallback);
    assert.equal(safeImageUrl('', fallback), fallback);
});

test('safeHexColor validates CSS hex colors and rejects injection payloads', () => {
    assert.equal(safeHexColor('#fff'), '#fff');
    assert.equal(safeHexColor('#5a4232'), '#5a4232');
    assert.equal(safeHexColor('#5a4232cc'), '#5a4232cc');
    assert.equal(safeHexColor('#ffb300; background:url(javascript:alert(1))', '#5a4232'), '#5a4232');
    assert.equal(safeHexColor('expression(alert(1))'), '#d8c3a7');
    assert.equal(safeHexColor('#12345', '#000'), '#000');
    assert.equal(escapeHtml('a"b\'c<d>e&f'), 'a&quot;b&#39;c&lt;d&gt;e&amp;f');
});

// ── 4. Cloudflare Worker Hardening ───────────────────────────────────────────
function createWorkerEnv() {
    const store = new Map();
    const calls = { head: 0, get: 0, put: 0, canceledBodies: 0, lastGetOpts: null };
    const makeStreamBody = (bytes) => {
        const stream = new ReadableStream({
            start(controller) {
                if (bytes.byteLength) controller.enqueue(bytes);
                controller.close();
            }
        });
        const origCancel = stream.cancel.bind(stream);
        stream.cancel = (...args) => {
            calls.canceledBodies++;
            return origCancel(...args);
        };
        return stream;
    };
    return {
        calls,
        store,
        env: {
            ALLOWED_ORIGINS: 'https://wavr.example',
            SUPABASE_URL: 'https://supabase.example',
            SUPABASE_PUBLISHABLE_KEY: 'pub-key',
            MEDIA_SIGNING_KEY: 'test-signing-secret-key-32-bytes!!',
            MEDIA: {
                async put(key, body, opts) {
                    calls.put++;
                    const buf = body ? new Uint8Array(await new Response(body).arrayBuffer()) : new Uint8Array(0);
                    store.set(key, { data: buf, size: buf.byteLength, httpMetadata: opts?.httpMetadata || {} });
                },
                async head(key) {
                    calls.head++;
                    const item = store.get(key);
                    if (!item) return null;
                    return { size: item.size, httpMetadata: item.httpMetadata };
                },
                async get(key, opts) {
                    calls.get++;
                    calls.lastGetOpts = opts || null;
                    const item = store.get(key);
                    if (!item) return null;
                    if (opts?.range) {
                        const rawRange = opts.range.get('Range');
                        const m = /^bytes=(\d+)-(\d*)$/.exec(rawRange || '');
                        if (m) {
                            const start = Number(m[1]);
                            const end = m[2] ? Math.min(Number(m[2]), item.size - 1) : item.size - 1;
                            const slice = start < item.size && end >= start ? item.data.slice(start, end + 1) : new Uint8Array(0);
                            return {
                                body: makeStreamBody(slice),
                                size: item.size,
                                range: { offset: start, length: slice.byteLength },
                                httpMetadata: item.httpMetadata
                            };
                        }
                    }
                    return { body: makeStreamBody(item.data), size: item.size, httpMetadata: item.httpMetadata };
                },
                async delete(key) { store.delete(key); }
            }
        }
    };
}

test('Cloudflare Worker enforces upload allowlist, size limits, signature validation, HEAD, Range 206, and security headers', async (t) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        if (String(url).endsWith('/auth/v1/user')) {
            return new Response(JSON.stringify({ id: 'user-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    const { env, calls } = createWorkerEnv();
    const authHeaders = { Authorization: 'Bearer token', Origin: 'https://wavr.example' };

    // Reject HTML / SVG / JS uploads with 415
    for (const badType of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/javascript']) {
        const res = await worker.fetch(new Request('https://media.example/v1/media/user-1/bad.file', {
            method: 'PUT',
            headers: { ...authHeaders, 'Content-Type': badType },
            body: '<svg onload=alert(1)>'
        }), env);
        assert.equal(res.status, 415, `Expected 415 for ${badType}`);
    }

    // Reject missing Content-Length with 411 Length Required
    const missingLen = await worker.fetch(new Request('https://media.example/v1/media/user-1/chunked.mp3', {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'audio/mpeg' },
        body: new Uint8Array(4)
    }), env);
    assert.equal(missingLen.status, 411);

    // Reject oversized image (>15MB) and audio (>100MB) with 413
    const oversizedImg = await worker.fetch(new Request('https://media.example/v1/media/user-1/huge.png', {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'image/png', 'Content-Length': String(16 * 1024 * 1024) },
        body: new Uint8Array(4)
    }), env);
    assert.equal(oversizedImg.status, 413);

    const oversizedAudio = await worker.fetch(new Request('https://media.example/v1/media/user-1/huge.mp3', {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'audio/mpeg', 'Content-Length': String(101 * 1024 * 1024) },
        body: new Uint8Array(4)
    }), env);
    assert.equal(oversizedAudio.status, 413);

    // Valid audio upload succeeds
    const payload = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const putRes = await worker.fetch(new Request('https://media.example/v1/media/user-1/song.mp3', {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'audio/mpeg', 'Content-Length': String(payload.byteLength) },
        body: payload
    }), env);
    assert.equal(putRes.status, 201);

    // Sign URL
    const signRes = await worker.fetch(new Request('https://media.example/v1/signed/user-1/song.mp3', {
        method: 'POST',
        headers: authHeaders
    }), env);
    assert.equal(signRes.status, 200);
    const { url: signedUrl } = await signRes.json();

    // Reject malformed URI, control chars, traversal, NaN expiry, bad base64 signature with 401 (never 500)
    for (const badUrl of [
        'https://media.example/v1/media/%E0%A4%A?expires=9999999999&signature=abc',
        'https://media.example/v1/media/user-1/song.mp3%0a9999999999?expires=NaN&signature=abc',
        'https://media.example/v1/media/user-1/..%2Fother/song.mp3?expires=9999999999&signature=abc',
        'https://media.example/v1/media/user-1/song.mp3?expires=NaN&signature=abc',
        'https://media.example/v1/media/user-1/song.mp3?expires=123abc&signature=abc',
        `https://media.example/v1/media/user-1/song.mp3?expires=${Math.floor(Date.now() / 1000) + 60}&signature=!!!invalid!!!`
    ]) {
        const res = await worker.fetch(new Request(badUrl, { method: 'GET' }), env);
        assert.equal(res.status, 401, `Expected 401 for ${badUrl}`);
    }

    // HEAD uses env.MEDIA.head (not get) and sets security headers
    const headRes = await worker.fetch(new Request(signedUrl, { method: 'HEAD', headers: { Origin: 'https://wavr.example' } }), env);
    assert.equal(headRes.status, 200);
    assert.equal(calls.head, 1);
    assert.equal(calls.get, 0);
    assert.equal(headRes.headers.get('Content-Length'), '10');
    assert.equal(headRes.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(headRes.headers.get('Content-Security-Policy'), "default-src 'none'; sandbox");
    assert.match(headRes.headers.get('Access-Control-Allow-Headers') || '', /Range/);
    assert.match(headRes.headers.get('Access-Control-Expose-Headers') || '', /Content-Range/);

    // GET with Range returns 206 Partial Content
    const rangeRes = await worker.fetch(new Request(signedUrl, {
        method: 'GET',
        headers: { Origin: 'https://wavr.example', Range: 'bytes=2-5' }
    }), env);
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('Content-Range'), 'bytes 2-5/10');
    assert.equal(rangeRes.headers.get('Content-Length'), '4');
    assert.equal(rangeRes.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(rangeRes.headers.get('Content-Security-Policy'), "default-src 'none'; sandbox");
    const rangeBytes = new Uint8Array(await rangeRes.arrayBuffer());
    assert.deepEqual([...rangeBytes], [2, 3, 4, 5]);

    // Unsatisfiable Range returns 416 and cancels unread R2 stream
    const badRangeRes = await worker.fetch(new Request(signedUrl, {
        method: 'GET',
        headers: { Origin: 'https://wavr.example', Range: 'bytes=50-60' }
    }), env);
    assert.equal(badRangeRes.status, 416);
    assert.equal(badRangeRes.headers.get('Content-Range'), 'bytes */10');
    assert.equal(calls.canceledBodies, 1);

    // Range on a 0-byte object returns 416 and cancels unread R2 stream
    const emptyPut = await worker.fetch(new Request('https://media.example/v1/media/user-1/empty.mp3', {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'audio/mpeg', 'Content-Length': '0' },
        body: new Uint8Array(0)
    }), env);
    assert.equal(emptyPut.status, 201);
    const emptySignRes = await worker.fetch(new Request('https://media.example/v1/signed/user-1/empty.mp3', {
        method: 'POST',
        headers: authHeaders
    }), env);
    const { url: emptySignedUrl } = await emptySignRes.json();
    const emptyRangeRes = await worker.fetch(new Request(emptySignedUrl, {
        method: 'GET',
        headers: { Origin: 'https://wavr.example', Range: 'bytes=0-0' }
    }), env);
    assert.equal(emptyRangeRes.status, 416);
    assert.equal(emptyRangeRes.headers.get('Content-Range'), 'bytes */0');
    assert.equal(calls.canceledBodies, 2);
});

// ── 5. Supabase SQL Hardening ────────────────────────────────────────────────
test('supabase_schema.sql enforces track ownership in playlist_tracks, non-negative checks, indexes, and bucket limits', () => {
    const sql = fs.readFileSync(path.join(rootDir, 'supabase_schema.sql'), 'utf8');
    assert.match(sql, /CHECK\s*\(\s*file_size\s*>=\s*0\s*\)/i);
    assert.match(sql, /CHECK\s*\(\s*duration\s*>=\s*0\s*\)/i);
    assert.match(sql, /tracks_file_size_nonnegative/i);
    assert.match(sql, /tracks_duration_nonnegative/i);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON public\.playlists\(user_id\)/i);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON public\.playlist_tracks\(track_id\)/i);
    const trackOwnerChecks = sql.match(/FROM public\.tracks t\s+WHERE t\.id = playlist_tracks\.track_id AND t\.user_id = auth\.uid\(\)/gi) || [];
    assert.equal(trackOwnerChecks.length, 2, 'playlist_tracks USING and WITH CHECK must both verify track ownership');
    assert.match(sql, /file_size_limit[\s\S]*104857600/i);
    assert.match(sql, /allowed_mime_types/i);
    assert.doesNotMatch(sql, /image\/svg\+xml|text\/html/i);
});

// ── 6. Vault, Wallpaper Cleanup, CloudSyncIndicator, SupabaseService, .gitignore
test('clearVaultBrowserState and clearStoredBackground clear wallpaper DOM, blob URL and IndexedDB key', async (t) => {
    const bgLayer = makeMockElement('div');
    bgLayer.classList.add('active');
    bgLayer.style.backgroundImage = 'url("blob:https://wavr.example/bg-1")';
    bgLayer.dataset.bgUrl = 'blob:https://wavr.example/bg-1';

    const revoked = [];
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (u) => revoked.push(u);
    t.after(() => { URL.revokeObjectURL = originalRevoke; });

    clearVaultBrowserState({ getElementById: (id) => (id === 'app-custom-bg-layer' ? bgLayer : null) }, { removeItem() {} });
    assert.equal(bgLayer.style.backgroundImage, '');
    assert.equal(bgLayer.classList.contains('active'), false);
    assert.equal(bgLayer.dataset.bgUrl, undefined);
    assert.deepEqual(revoked, ['blob:https://wavr.example/bg-1']);

    // Test clearStoredBackground deletes wavr_custom_bg from IndexedDB
    const deletedKeys = [];
    const originalIndexedDB = globalThis.indexedDB;
    globalThis.indexedDB = {
        open() {
            const req = {};
            queueMicrotask(() => {
                req.result = {
                    transaction() {
                        return {
                            objectStore() {
                                return {
                                    delete(key) {
                                        deletedKeys.push(key);
                                        const delReq = {};
                                        queueMicrotask(() => delReq.onsuccess?.());
                                        return delReq;
                                    }
                                };
                            }
                        };
                    }
                };
                req.onsuccess?.();
            });
            return req;
        }
    };
    t.after(() => { globalThis.indexedDB = originalIndexedDB; });

    await clearStoredBackground({ getElementById: () => bgLayer });
    assert.deepEqual(deletedKeys, ['wavr_custom_bg']);
});

test('CloudSyncIndicator stays offline using local session instead of downgrading to local via network getUser', async (t) => {
    const originalDocument = globalThis.document;
    const originalGetCurrentUser = SupabaseService.getCurrentUser;
    const originalGetSession = SupabaseService.getSession;
    const originalIsConfigured = SupabaseService.isConfigured;

    const homeBtn = makeMockElement('button');
    const btnText = makeMockElement('span');
    homeBtn.querySelector = (sel) => (sel === '.vault-btn-text' ? btnText : null);
    globalThis.document = {
        getElementById: (id) => (id === 'btn-cloud-vault-home' ? homeBtn : null),
        createElement: (tag) => makeMockElement(tag)
    };

    let networkCalls = 0;
    SupabaseService.isConfigured = () => true;
    SupabaseService.getCurrentUser = async () => { networkCalls++; throw new Error('offline'); };
    SupabaseService.getSession = async () => ({ user: { id: 'u1', email: 'u1@example.com' } });

    t.after(async () => {
        CloudSyncIndicator.setState('local');
        await CloudSyncIndicator.updateUI();
        globalThis.document = originalDocument;
        SupabaseService.getCurrentUser = originalGetCurrentUser;
        SupabaseService.getSession = originalGetSession;
        SupabaseService.isConfigured = originalIsConfigured;
    });

    CloudSyncIndicator.setState('offline');
    await CloudSyncIndicator.updateUI();
    assert.equal(networkCalls, 0);
    assert.equal(CloudSyncIndicator.getState(), 'offline');
    assert.equal(btnText.textContent, '⚠️ Offline');
});

test('SupabaseService.fetchUserTracks isolates per-track URL resolution errors', async (t) => {
    const originalGetCurrentUser = SupabaseService.getCurrentUser;
    const originalResolve = SupabaseService.resolveMediaUrl;
    const originalFrom = supabase.from;

    SupabaseService.getCurrentUser = async () => ({ id: 'u1' });
    supabase.from = () => ({
        select: () => ({
            order: async () => ({
                data: [
                    { id: 't1', audio_url: 'r2://u1/good.mp3', cover_url: 'r2://u1/good.png' },
                    { id: 't2', audio_url: 'r2://u1/bad.mp3', cover_url: 'r2://u1/bad.png' }
                ],
                error: null
            })
        })
    });
    SupabaseService.resolveMediaUrl = async (uri) => {
        if (uri.includes('bad.mp3')) throw new Error('worker timeout');
        return `https://signed.example/${uri}`;
    };

    t.after(() => {
        SupabaseService.getCurrentUser = originalGetCurrentUser;
        SupabaseService.resolveMediaUrl = originalResolve;
        supabase.from = originalFrom;
    });

    const tracks = await SupabaseService.fetchUserTracks();
    assert.equal(tracks.length, 2);
    assert.equal(tracks[0].audio_url, 'https://signed.example/r2://u1/good.mp3');
    assert.equal(tracks[1].audio_url, 'r2://u1/bad.mp3');
    assert.equal(tracks[1].cover_url, 'https://signed.example/r2://u1/bad.png');
});

test('SupabaseService.deleteTrack deletes DB row first with ownership check, strips query/hash, and ignores R2 errors', async (t) => {
    const originalGetCurrentUser = SupabaseService.getCurrentUser;
    const originalWorkerReq = SupabaseService.requestMediaWorker;
    const originalFrom = supabase.from;

    const events = [];
    const deletedPaths = [];
    SupabaseService.getCurrentUser = async () => ({ id: 'u1' });
    supabase.from = () => ({
        delete: () => ({
            eq: (col1, val1) => {
                events.push(`eq:${col1}=${val1}`);
                return {
                    eq: (col2, val2) => {
                        events.push(`eq:${col2}=${val2}`);
                        return {
                            select: () => ({
                                maybeSingle: async () => {
                                    events.push('db-deleted');
                                    return {
                                        data: {
                                            audio_url: 'r2://u1/audio/track.mp3',
                                            cover_url: 'https://old.example/storage/v1/object/public/wavr-media/u1/covers/art%201.png?token=abc#frag'
                                        },
                                        error: null
                                    };
                                }
                            })
                        };
                    }
                };
            }
        })
    });
    SupabaseService.requestMediaWorker = async (reqPath) => {
        events.push('worker-delete');
        deletedPaths.push(reqPath);
        throw new Error('R2 temporarily unavailable');
    };

    t.after(() => {
        SupabaseService.getCurrentUser = originalGetCurrentUser;
        SupabaseService.requestMediaWorker = originalWorkerReq;
        supabase.from = originalFrom;
    });

    await SupabaseService.deleteTrack('track-42');
    assert.equal(events[0], 'eq:id=track-42');
    assert.equal(events[1], 'eq:user_id=u1');
    assert.equal(events[2], 'db-deleted');
    assert.equal(events[3], 'worker-delete');
    assert.deepEqual(deletedPaths, [
        '/v1/media/u1/audio/track.mp3',
        '/v1/media/u1/covers/art%201.png'
    ]);
});

test('.gitignore excludes .dev.vars and .env.* while keeping .env.example', () => {
    const gitignore = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
    assert.match(gitignore, /^\.dev\.vars$/m);
    assert.match(gitignore, /^\.dev\.vars\.\*$/m);
    assert.match(gitignore, /^\.env\.\*$/m);
    assert.match(gitignore, /^!\.env\.example$/m);
});
