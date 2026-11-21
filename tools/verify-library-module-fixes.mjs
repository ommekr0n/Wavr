import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function makeClassList(initial = []) {
    const set = new Set(initial);
    return {
        add: (...cls) => cls.forEach((c) => set.add(c)),
        remove: (...cls) => cls.forEach((c) => set.delete(c)),
        contains: (c) => set.has(c),
        toggle: (c) => (set.has(c) ? (set.delete(c), false) : (set.add(c), true)),
        toArray: () => [...set]
    };
}

function makeEventTarget() {
    const listeners = new Map();
    return {
        addEventListener(type, fn, opts) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            const entry = { fn, signal: opts?.signal };
            listeners.get(type).add(entry);
            if (opts?.signal) {
                opts.signal.addEventListener('abort', () => {
                    listeners.get(type)?.delete(entry);
                }, { once: true });
            }
        },
        removeEventListener(type, fn) {
            const set = listeners.get(type);
            if (!set) return;
            for (const entry of set) {
                if (entry.fn === fn) set.delete(entry);
            }
        },
        dispatchEvent(event) {
            const set = listeners.get(event.type);
            if (!set) return true;
            for (const entry of [...set]) {
                entry.fn(event);
            }
            return true;
        },
        listenerCount(type) {
            return listeners.get(type)?.size || 0;
        }
    };
}

// ── 1. DragDropEngine.js ──────────────────────────────────────────────────────
test('DragDropEngine scopes card queries to direct children and filters null IDs', () => {
    const src = readFileSync(path.join(rootDir, 'js/features/library/DragDropEngine.js'), 'utf8');
    assert.match(src, /editGrid\.querySelectorAll\(':scope > \.song-card'\)/);
    assert.doesNotMatch(src, /editGrid\.querySelectorAll\('\.song-card'\)/);
    assert.match(src, /state\.libraryOrder\s*=\s*currentCards\.map\(c\s*=>\s*c\.getAttribute\('data-id'\)\)\.filter\(Boolean\)/);
});

// ── 2. background-manager.js ──────────────────────────────────────────────────
test('background-manager setStoredBackground rejects cleanly and applyBackgroundImage revokes blob URLs on cloud string switch', async () => {
    const revoked = [];
    const origCreateObjectURL = globalThis.URL.createObjectURL;
    const origRevokeObjectURL = globalThis.URL.revokeObjectURL;
    const origIndexedDB = globalThis.indexedDB;

    let blobCounter = 0;
    globalThis.URL.createObjectURL = () => `blob:test-bg-${++blobCounter}`;
    globalThis.URL.revokeObjectURL = (u) => revoked.push(u);

    // Mock IndexedDB whose put() fires onerror
    const mockError = new Error('QuotaExceededError');
    globalThis.indexedDB = {
        open: () => {
            const req = {};
            queueMicrotask(() => {
                req.result = {
                    objectStoreNames: { contains: () => true },
                    transaction: () => ({
                        objectStore: () => ({
                            put: () => {
                                const putReq = { error: mockError };
                                queueMicrotask(() => putReq.onerror?.());
                                return putReq;
                            }
                        })
                    })
                };
                req.onsuccess?.();
            });
            return req;
        }
    };

    try {
        const { setStoredBackground, applyBackgroundImage } = await import('../js/modules/background-manager.js');

        // 1. Verify setStoredBackground rejects with req.error (not ReferenceError: reject is not defined)
        await assert.rejects(
            () => setStoredBackground(new Blob(['img'])),
            (err) => err === mockError
        );

        // 2. Verify applyBackgroundImage revokes previous blob URL when switching to a cloud string URL
        const bgLayer = {
            dataset: {},
            style: {},
            classList: makeClassList()
        };
        const fakeDoc = { getElementById: (id) => (id === 'app-custom-bg-layer' ? bgLayer : null) };

        applyBackgroundImage(new Blob(['local-wallpaper']), fakeDoc);
        assert.equal(bgLayer.dataset.bgUrl, 'blob:test-bg-1');
        assert.equal(revoked.length, 0);

        applyBackgroundImage('https://cdn.example.com/cloud-wallpaper.webp', fakeDoc);
        assert.deepEqual(revoked, ['blob:test-bg-1']);
        assert.equal(bgLayer.style.backgroundImage, "url('https://cdn.example.com/cloud-wallpaper.webp')");
    } finally {
        globalThis.URL.createObjectURL = origCreateObjectURL;
        globalThis.URL.revokeObjectURL = origRevokeObjectURL;
        globalThis.indexedDB = origIndexedDB;
    }
});

// ── 3. recorder.js ────────────────────────────────────────────────────────────
test('recorder guards missing MediaRecorder, cleans up stream on MediaRecorder failure, removes ended listener, and derives mime/extension', async () => {
    const origDocument = globalThis.document;
    const origNavigator = globalThis.navigator;
    const origMediaRecorder = globalThis.MediaRecorder;
    const origWindow = globalThis.window;

    const toasts = [];
    let getDisplayMediaCalls = 0;
    let trackStopped = 0;
    let exitFullscreenCalls = 0;

    const audioEl = { ...makeEventTarget(), currentTime: 0, src: '' };
    const bodyClassList = makeClassList();

    globalThis.document = {
        fullscreenElement: {},
        documentElement: { requestFullscreen: async () => {} },
        exitFullscreen: async () => { exitFullscreenCalls++; },
        body: { classList: bodyClassList },
        getElementById: (id) => (id === 'audio-player' ? audioEl : null)
    };
    globalThis.window = {};
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
            mediaDevices: {
                getDisplayMedia: async () => {
                    getDisplayMediaCalls++;
                    return {
                        getTracks: () => [{ stop: () => { trackStopped++; } }],
                        getVideoTracks: () => [{ onended: null }]
                    };
                }
            }
        }
    });

    try {
        const { startScreenRecording, stopRecording } = await import('../js/modules/recorder.js');

        // Case A: MediaRecorder undefined -> early exit before getDisplayMedia
        globalThis.MediaRecorder = undefined;
        await startScreenRecording('normal', { showToast: (m) => toasts.push(m) });
        assert.equal(getDisplayMediaCalls, 0);
        assert.equal(toasts.length, 1);

        // Case B: MediaRecorder constructor / start throws -> stops tracks & removes is-recording
        globalThis.MediaRecorder = class BrokenRecorder {
            static isTypeSupported() { return false; }
            constructor() { throw new Error('Codec not supported'); }
        };
        globalThis.document.fullscreenElement = null;
        await startScreenRecording('normal', { showToast: (m) => toasts.push(m) });
        assert.equal(getDisplayMediaCalls, 1);
        assert.equal(trackStopped, 1);
        assert.equal(bodyClassList.contains('is-recording'), false);

        // Case C: Source invariants for isStarting guard, teardown on catch, onAudioEnded cleanup, recordedChunks finally reset, mp4 extension, 15s revoke
        const src = readFileSync(path.join(rootDir, 'js/modules/recorder.js'), 'utf8');
        assert.match(src, /if \(isStarting \|\| activeStream \|\| mediaRecorder\?\.state === 'recording'\) return;/);
        assert.match(src, /if \(modeConfig\.teardown\) \{\s*modeConfig\.teardown\(\);/);
        assert.match(src, /audioElement\.removeEventListener\('ended', onAudioEndedHandler\)/);
        assert.match(src, /finally\s*\{\s*recordedChunks = \[\];\s*\}/);
        assert.match(src, /parsedBase === 'video\/mp4'/);
        assert.match(src, /15000/);

        stopRecording();
    } finally {
        globalThis.document = origDocument;
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: origNavigator });
        globalThis.MediaRecorder = origMediaRecorder;
        globalThis.window = origWindow;
    }
});

// ── 4. UploadHandler.js, LibraryModals.js, SongCardDropHandler.js ─────────────
test('UploadHandler, LibraryModals, and SongCardDropHandler enforce submit locks, file validation, and blob URL cleanup', () => {
    const uploadSrc = readFileSync(path.join(rootDir, 'js/features/library/UploadHandler.js'), 'utf8');
    assert.match(uploadSrc, /let isUploading = false;/);
    assert.match(uploadSrc, /if \(isUploading\) return;/);
    assert.match(uploadSrc, /MAX_COVER_FILE_BYTES = 15 \* 1024 \* 1024/);
    assert.match(uploadSrc, /MAX_LRC_FILE_BYTES = 2 \* 1024 \* 1024/);
    assert.match(uploadSrc, /audioFile\.size \+ \(coverFile \? coverFile\.size : 0\)/);
    assert.match(uploadSrc, /coverFile\.type !== 'image\/svg\+xml'/);
    assert.match(uploadSrc, /URL\.revokeObjectURL\(tempAudioBlobUrl\)/);
    assert.match(uploadSrc, /URL\.revokeObjectURL\(tempCoverBlobUrl\)/);

    const modalsSrc = readFileSync(path.join(rootDir, 'js/features/library/LibraryModals.js'), 'utf8');
    assert.match(modalsSrc, /let isEditing = false;/);
    assert.match(modalsSrc, /if \(isEditing\) return;/);
    assert.match(modalsSrc, /MAX_EDIT_AUDIO_BYTES = 100 \* 1024 \* 1024/);
    assert.match(modalsSrc, /MAX_EDIT_COVER_BYTES = 15 \* 1024 \* 1024/);
    assert.match(modalsSrc, /MAX_EDIT_LRC_BYTES = 2 \* 1024 \* 1024/);
    assert.match(modalsSrc, /coverFile\.type !== 'image\/svg\+xml'/);
    assert.match(modalsSrc, /song\.url = resolvedAudioUrl;\s*if \(_getCurrentTrackIndex\(\) === idx\) \{\s*const wasPlaying = _getIsPlaying\(\);\s*_loadTrack\(idx\);\s*if \(wasPlaying\) _playAudio\(\);\s*\}\s*if \(tempAudioBlobUrl && resolvedAudioUrl !== tempAudioBlobUrl\) \{\s*URL\.revokeObjectURL\(tempAudioBlobUrl\);/);
    assert.match(modalsSrc, /URL\.revokeObjectURL\(tempCoverBlobUrl\)/);

    const dropSrc = readFileSync(path.join(rootDir, 'js/features/library/SongCardDropHandler.js'), 'utf8');
    assert.match(dropSrc, /MAX_COVER_IMAGE_BYTES = 15 \* 1024 \* 1024/);
    assert.match(dropSrc, /if \(track\.url && track\.url\.startsWith\('blob:'\)\) \{\s*URL\.revokeObjectURL\(track\.url\);/);
});

// ── 5. GlobalKeyHandlers.js & TutorialDismissal.js ────────────────────────────
test('GlobalKeyHandlers hides playlist context menu on Escape and guards playback shortcuts; TutorialDismissal stops propagation', async () => {
    const origWindow = globalThis.window;
    const origDocument = globalThis.document;

    const winTarget = makeEventTarget();
    const docTarget = makeEventTarget();

    const playlistMenu = { classList: makeClassList() };
    const openModal = { classList: makeClassList(['modal']) };
    let hasModal = false;
    let hasPlaylistMenu = true;
    let activeEl = { tagName: 'BODY', isContentEditable: false, classList: makeClassList(), getAttribute: () => null };

    globalThis.window = {
        ...winTarget,
        location: { pathname: '/index.html' }
    };
    globalThis.document = {
        ...docTarget,
        get activeElement() { return activeEl; },
        getElementById: () => null,
        querySelector: (sel) => {
            if (sel === '.playlist-context-menu:not(.hidden)') return hasPlaylistMenu ? playlistMenu : null;
            if (sel === '.modal:not(.hidden)') return hasModal ? openModal : null;
            return null;
        }
    };

    try {
        const { initGlobalKeyHandlers } = await import('../js/features/navigation/GlobalKeyHandlers.js');
        const { setupTutorialDismissal } = await import('../js/features/splash/TutorialDismissal.js');

        let toggleCount = 0;
        let seekCount = 0;
        initGlobalKeyHandlers({
            closePlayer: () => {},
            togglePlay: () => { toggleCount++; },
            prevTrack: () => {},
            nextTrack: () => {},
            pauseAudio: () => {},
            updateProgress: () => {},
            prepareLyricNearTime: () => {},
            volumeSlider: null,
            updateVolumeIcon: () => {},
            engine: {
                audioElement: { src: 'https://example.com/song.mp3', currentTime: 10, duration: 100, volume: 0.5 },
                isPaused: false,
                seek: () => { seekCount++; },
                setVolume: () => {}
            }
        });

        // 1. Escape hides .playlist-context-menu:not(.hidden)
        winTarget.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
        assert.equal(playlistMenu.classList.contains('hidden'), true);
        hasPlaylistMenu = false;

        // 2. SELECT / contentEditable blocks Space
        activeEl = { tagName: 'SELECT', isContentEditable: false, classList: makeClassList(), getAttribute: () => null };
        winTarget.dispatchEvent({ type: 'keydown', code: 'Space', preventDefault() {} });
        assert.equal(toggleCount, 0);

        activeEl = { tagName: 'DIV', isContentEditable: true, classList: makeClassList(), getAttribute: () => null };
        winTarget.dispatchEvent({ type: 'keydown', code: 'Space', preventDefault() {} });
        assert.equal(toggleCount, 0);

        // 3. BUTTON / .song-card blocks Space
        activeEl = { tagName: 'BUTTON', isContentEditable: false, classList: makeClassList(), getAttribute: () => null };
        winTarget.dispatchEvent({ type: 'keydown', code: 'Space', preventDefault() {} });
        assert.equal(toggleCount, 0);

        activeEl = { tagName: 'DIV', isContentEditable: false, classList: makeClassList(['song-card']), getAttribute: () => null };
        winTarget.dispatchEvent({ type: 'keydown', code: 'Space', preventDefault() {} });
        assert.equal(toggleCount, 0);

        // 4. Open modal blocks Space and ArrowLeft
        activeEl = { tagName: 'BODY', isContentEditable: false, classList: makeClassList(), getAttribute: () => null };
        hasModal = true;
        winTarget.dispatchEvent({ type: 'keydown', code: 'Space', preventDefault() {} });
        winTarget.dispatchEvent({ type: 'keydown', code: 'ArrowLeft', preventDefault() {} });
        assert.equal(toggleCount, 0);
        assert.equal(seekCount, 0);

        // 5. Normal body focus with no modal triggers Space & ArrowLeft
        hasModal = false;
        winTarget.dispatchEvent({ type: 'keydown', code: 'Space', preventDefault() {} });
        winTarget.dispatchEvent({ type: 'keydown', code: 'ArrowLeft', preventDefault() {} });
        assert.equal(toggleCount, 1);
        assert.equal(seekCount, 1);

        // 6. TutorialDismissal stops propagation on Escape
        const tutorialModal = { ...makeEventTarget(), classList: makeClassList() };
        setupTutorialDismissal(tutorialModal);
        let stopped = false;
        docTarget.dispatchEvent({
            type: 'keydown',
            key: 'Escape',
            stopPropagation() { stopped = true; }
        });
        assert.equal(stopped, true);
        assert.equal(tutorialModal.classList.contains('hidden'), true);
    } finally {
        globalThis.window = origWindow;
        globalThis.document = origDocument;
    }
});

// ── 6. SelectionManager.js ────────────────────────────────────────────────────
test('SelectionManager cleans up lasso on window blur and Escape', () => {
    const src = readFileSync(path.join(rootDir, 'js/features/library/SelectionManager.js'), 'utf8');
    assert.match(src, /window\.addEventListener\('blur',\s*finishLassoSelection,\s*\{\s*signal\s*\}\)/);
    assert.match(src, /window\.addEventListener\('keydown',\s*\(e\)\s*=>\s*\{\s*if\s*\(e\.key === 'Escape'\)\s*finishLassoSelection\(\);\s*\},\s*\{\s*signal\s*\}\)/);
});

// ── 7. EditLibraryState.js ────────────────────────────────────────────────────
test('EditLibraryState discards stale async cloud preferences after a local mutation', async () => {
    const origLocalStorage = globalThis.localStorage;
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    };

    let resolveCloud;
    globalThis.__wavrTestMocks = {
        SupabaseService: {
            isConfigured: () => true,
            getUserPreferences: () => new Promise((resolve) => { resolveCloud = resolve; })
        },
        cachedBoxes: [],
        cachedOrder: [],
        getCachedVinylBoxes: () => globalThis.__wavrTestMocks.cachedBoxes,
        getCachedLibraryOrder: () => globalThis.__wavrTestMocks.cachedOrder,
        updateBoxCache: (b, o) => {
            globalThis.__wavrTestMocks.cachedBoxes = b || [];
            globalThis.__wavrTestMocks.cachedOrder = o || [];
        },
        saveLibraryToDB: () => {}
    };

    try {
        const rawSrc = readFileSync(path.join(rootDir, 'js/shared/EditLibraryState.js'), 'utf8');
        const patchedSrc = rawSrc
            .replace(
                /import\s+\{\s*SupabaseService\s*\}\s+from\s+['"][^'"]+['"];/,
                'const { SupabaseService } = globalThis.__wavrTestMocks;'
            )
            .replace(
                /import\s+\{[^}]+\}\s+from\s+['"][^'"]+HomeGridRenderer\.js['"];/,
                'const { getCachedVinylBoxes, getCachedLibraryOrder, updateBoxCache, saveLibraryToDB } = globalThis.__wavrTestMocks;'
            );

        const modUrl = `data:text/javascript;base64,${Buffer.from(patchedSrc, 'utf8').toString('base64')}`;
        const { state, loadFromStorage, setVinylBoxes } = await import(modUrl);

        loadFromStorage();
        // User mutates local boxes while cloud fetch is still in flight
        const localBoxes = [{ id: 'box-local', name: 'Local Edit', songIds: ['s1'] }];
        setVinylBoxes(localBoxes);

        // Now stale cloud response arrives
        resolveCloud({
            vinyl_boxes: [{ id: 'box-stale-cloud', name: 'Stale Cloud', songIds: ['s9'] }],
            library_order: ['box-stale-cloud']
        });
        await new Promise((r) => setTimeout(r, 10));

        assert.deepEqual(state.vinylBoxes, localBoxes);
    } finally {
        delete globalThis.__wavrTestMocks;
        globalThis.localStorage = origLocalStorage;
    }
});

// ── 8. LibraryModals delete scrub, openAddSongsModal sync & HomeGridRenderer ──
test('Deleting a song scrubs vinylBoxes/libraryOrder, HomeGridRenderer uses boxSongs.length, and openAddSongsModal syncs', () => {
    const modalsSrc = readFileSync(path.join(rootDir, 'js/features/library/LibraryModals.js'), 'utf8');
    assert.match(modalsSrc, /box\.songIds\.filter\(\(id\)\s*=>\s*id !== song\.id\)/);
    assert.match(modalsSrc, /setCachedLibraryOrder\(currentOrder\.filter\(\(id\)\s*=>\s*id !== song\.id\)\)/);
    assert.match(modalsSrc, /_setCachedVinylBoxes\(currentVinylBoxesArray\);\s*if\s*\(_saveLibraryToDB\)\s*_saveLibraryToDB\(\);/);

    const gridSrc = readFileSync(path.join(rootDir, 'js/features/library/HomeGridRenderer.js'), 'utf8');
    assert.match(gridSrc, /\$\{boxSongs\.length\} Tracks/);
    assert.doesNotMatch(gridSrc, /\$\{box\.songIds \? box\.songIds\.length : 0\} Tracks/);
});

// ── 9. lrc-fetcher.js & color-extractor.js ────────────────────────────────────
test('lrc-fetcher isolates /api/get errors from /api/search with timeout signal, and color-extractor guards missing callback', async () => {
    const origFetch = globalThis.fetch;
    const origDocument = globalThis.document;

    const seenSignals = [];
    globalThis.fetch = async (url, init) => {
        seenSignals.push(init?.signal);
        if (String(url).includes('/api/get')) {
            throw new Error('Simulated /api/get network error');
        }
        return {
            ok: true,
            json: async () => [{ id: 42, trackName: 'Demo', syncedLyrics: '[00:01.00] Hello' }]
        };
    };

    try {
        const { searchLRCLIB } = await import('../js/modules/lrc-fetcher.js');
        const results = await searchLRCLIB('Demo', 'Artist');
        assert.equal(results.length, 1);
        assert.equal(results[0].id, 42);
        assert.equal(seenSignals.length, 2);
        assert.ok(seenSignals[0] instanceof AbortSignal);
        assert.ok(seenSignals[1] instanceof AbortSignal);

        // color-extractor callback guard
        globalThis.document = {
            createElement: () => ({
                width: 0,
                height: 0,
                getContext: () => ({
                    drawImage: () => {},
                    getImageData: () => ({ data: new Uint8ClampedArray(10 * 10 * 4).fill(128) })
                })
            })
        };
        const { extractColorsFromImage } = await import('../js/modules/color-extractor.js');
        const colors = extractColorsFromImage({}, null);
        assert.equal(Array.isArray(colors), true);
        assert.equal(colors.length, 4);
    } finally {
        globalThis.fetch = origFetch;
        globalThis.document = origDocument;
    }
});

// ── 10. GEMINI.md hygiene: zero console.log in all modified files ─────────────
test('Modified Task 4 files contain zero console.log calls', () => {
    const modifiedFiles = [
        'js/features/library/DragDropEngine.js',
        'js/modules/background-manager.js',
        'js/modules/recorder.js',
        'js/features/library/UploadHandler.js',
        'js/features/library/LibraryModals.js',
        'js/features/library/SongCardDropHandler.js',
        'js/features/navigation/GlobalKeyHandlers.js',
        'js/features/splash/TutorialDismissal.js',
        'js/features/library/SelectionManager.js',
        'js/shared/EditLibraryState.js',
        'js/features/library/HomeGridRenderer.js',
        'js/modules/lrc-fetcher.js',
        'js/modules/color-extractor.js'
    ];
    for (const rel of modifiedFiles) {
        const content = readFileSync(path.join(rootDir, rel), 'utf8');
        assert.doesNotMatch(content, /\bconsole\.log\s*\(/, `${rel} must not contain console.log`);
    }
});
