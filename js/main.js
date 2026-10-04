/**
 * main.js — App Orchestrator & Bootstrapper
 * ==========================================
 * Wires all modular engines (core/) and feature controllers (features/)
 * into the main entry point.
 *
 * Phase 3 changes
 * ───────────────
 * • PlaybackCoordinator owns icon/class/renderLoop sync and auto-next.
 * • RenderLoop receives engine directly (no more PlayerController import).
 * • MediaSessionManager, GlobalKeyHandlers, MiniPlayerController,
 *   RecordingModalController all receive engine instead of raw audio.
 * • PlayerController.setIsPlaying() is a no-op; state is authoritative in
 *   PlaybackEngine.  getIsPlaying() delegates to engine.state.
 * • The inline audio.pause and audio.ended listeners are removed; the
 *   coordinator handles them via statechange events.
 * • playAudio() / pauseAudio() are leaner: no manual UI sync needed.
 */

// ── 1. Core & Service Imports ────────────────────────────────────────────────
import { FFTAnalyzer } from './core/audio/FFTAnalyzer.js';
import { AngelicRenderer } from './core/rendering/AngelicRenderer.js';
import { scheduleAngelicLyricPreparation } from './features/angelic/AngelicLyricPreparation.js';
import { createRenderLoop } from './core/RenderLoop.js';
import { PlaybackEngine } from './core/PlaybackEngine.js';
import { SupabaseService } from './services/SupabaseService.js';
import './floral-templates.js';

// ── 2. Feature & Controller Imports ──────────────────────────────────────────
import { PlayerController, setPlaybackEngine } from './features/player/PlayerController.js';
import { LyricEngine } from './features/lyrics/LyricEngine.js';
import { VisualizerController } from './features/visualizer/VisualizerController.js';
import { observeGraphicsAvailability } from './features/visualizer/GraphicsAvailability.js';
import { LibraryModals } from './features/library/LibraryModals.js';
import { setupEQController } from './features/eq/EQController.js';
import { initCloudVaultUI } from './features/vault/CloudVaultUI.js';
import { initVaultSessionBoundary, clearVaultBrowserState } from './features/vault/VaultSessionBoundary.js';
import { initWaveform, loadAndDecodeWaveform, drawMiniWaveform } from './features/player/WaveformEngine.js';
import { setupMediaSession, updateMediaSessionMetadata } from './features/player/MediaSessionManager.js';
import { MiniPlayerController } from './features/player/MiniPlayerController.js';
import { setupRecordingController } from './features/player/RecordingModalController.js';
import { initPlaybackCoordinator } from './features/player/PlaybackCoordinator.js';
import { initGlobalKeyHandlers } from './features/navigation/GlobalKeyHandlers.js';
import { setupIdleAutoHide } from './features/navigation/IdleController.js';
import { preloadAngelicAssets, preloadCinematicAssets } from './features/visualizer/AssetPreloader.js';
import { runSplashBootstrapper } from './features/splash/AppBootstrapper.js';
import { setupSongCardDropHandler } from './features/library/SongCardDropHandler.js';
import { CloudSyncIndicator } from './features/vault/CloudSyncIndicator.js';

import {
    renderSongGrid,
    saveLibraryToDB,
    updateBoxCache,
    getCachedVinylBoxes,
    setCachedVinylBoxes,
    setCachedLibraryOrder
} from './features/library/HomeGridRenderer.js';
import { setupBoxExpansionListeners } from './features/library/HomeBoxExpansion.js';
import { setupUploadHandler } from './features/library/UploadHandler.js';
import { triggerCinematicLine, clearCinematicLine } from './features/visualizer/CinematicTextRenderer.js';
import {
    attachParallax,
    createVignetteOverlay,
    removeVignetteOverlay
} from './features/visualizer/VisualFX.js';

// ── 3. Utility Modules & Assets ──────────────────────────────────────────────
import { extractColorsFromImage, loadImageForColorExtraction } from './modules/color-extractor.js';
import { initSettings, initEditLibrary } from './modules/edit-library.js';
import { BackgroundManager } from './modules/background-manager.js';
import coverImgUrl from '../assets/images/cover.png';

// ── 4. DOM Elements ──────────────────────────────────────────────────────────
const homeView   = document.getElementById('home-view');
const playerView = document.getElementById('player-view');
const uploadModal   = document.getElementById('upload-modal');
const homeSongGrid  = document.getElementById('home-song-grid');
const btnAddSong    = document.getElementById('btn-add-song');
const btnCloseModal = document.getElementById('btn-close-modal');

const uploadForm   = document.getElementById('upload-form');
const uploadAudio  = document.getElementById('upload-audio');
const uploadLrc    = document.getElementById('upload-lrc');
const uploadCover  = document.getElementById('upload-cover');
const uploadTitle  = document.getElementById('upload-title');
const uploadArtist = document.getElementById('upload-artist');
const editAudio    = document.getElementById('edit-audio');
const editCover    = document.getElementById('edit-cover');

const btnBackHome = document.getElementById('btn-back-home');
const audio       = document.getElementById('audio-player');
audio.addEventListener('seeking', () => { LyricEngine.invalidateSeek(); updateProgress(); });

const playbackEngine = new PlaybackEngine(audio);
// Register engine with PlayerController so getIsPlaying() reads engine state.
setPlaybackEngine(playbackEngine);

const coverArt      = document.getElementById('cover-art');
const songTitleEl   = document.getElementById('song-title');
const songArtistEl  = document.getElementById('song-artist');
const lyricsContainer = document.getElementById('lyrics-container');
const lyricsList      = document.getElementById('lyrics-list');

const playBtn  = document.getElementById('btn-play');
const playIcon  = playBtn.querySelector('.play-icon');
const pauseIcon = playBtn.querySelector('.pause-icon');
const prevBtn  = document.getElementById('btn-prev');
const nextBtn  = document.getElementById('btn-next');
const volumeSlider = document.getElementById('volume-slider');
const btnMute      = document.getElementById('btn-mute');

const btnToggleDrift = document.getElementById('btn-toggle-drift');
const driftContainer = document.getElementById('drift-container');
const driftSlider    = document.getElementById('drift-slider');
const driftVal       = document.getElementById('drift-val');

const progressSlider  = document.getElementById('progress-slider');
const progressBarFill = document.querySelector('.progress-bar-fill');
const progressThumb   = document.querySelector('.progress-thumb');
const currentTimeEl   = document.getElementById('current-time');
const totalTimeEl     = document.getElementById('total-time');

const btnAngelic            = document.getElementById('btn-angelic');
const angelicView           = document.getElementById('angelic-view');
const btnExitAngelic        = document.getElementById('btn-exit-angelic');
const angelicVinylArt       = document.getElementById('angelic-vinyl-art');
const angelicTextContainer  = document.getElementById('angelic-text-container');
const angelicParticleContainer = document.getElementById('angelic-particle-container');
const vinylRecord           = document.querySelector('.vinyl-record');

const cinematicView          = document.getElementById('cinematic-view');
const cinematicTextContainer = document.getElementById('cinematic-text-container');
const btnCinematic           = document.getElementById('btn-cinematic');
const btnExitCinematic       = document.getElementById('btn-exit-cinematic');

// ── 5. State Variables ───────────────────────────────────────────────────────
let isDraggingSlider    = false;
let lastVolume          = 0.8;
let isMuted             = false;
let isPlayerTransitioning = false;
let toastTimeout        = null;
let lastFormattedSec    = -1;
const renderLoop = createRenderLoop({
    engine: playbackEngine,
    updateProgress,
    angelicView,
    angelicTextContainer,
    angelicParticleContainer,
    cinematicTextContainer
});

// ── 6. UI Helper Functions ───────────────────────────────────────────────────
function showToast(message) {
    let toast = document.getElementById('wavr-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'wavr-toast';
        toast.className = 'wavr-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 2200);
}

function updateVolumeIcon(volume) {
    if (!btnMute) return;
    if (volume === 0) {
        btnMute.innerHTML = `<svg id="volume-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
    } else if (volume < 0.5) {
        btnMute.innerHTML = `<svg id="volume-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
    } else {
        btnMute.innerHTML = `<svg id="volume-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function getPlaybackSource() {
    return PlayerController.getPlaybackSource();
}

function updateMiniPlayerUI() {
    MiniPlayerController.updateUI({ engine: playbackEngine, getPlaybackSource, PlayerController });
}

function syncPlayerControlsUI() {
    const btnRepeat = document.getElementById('btn-repeat');
    if (!btnRepeat) return;
    const iconRepeat  = btnRepeat.querySelector('.icon-repeat');
    const iconRepeat1 = btnRepeat.querySelector('.icon-repeat-1');
    const btnShuffle  = document.getElementById('btn-shuffle');
    const repeatMode  = PlayerController.getRepeatMode();
    const isShuffle   = PlayerController.getIsShuffle();

    if (repeatMode === 0) {
        btnRepeat.classList.remove('active-state');
        if (iconRepeat)  iconRepeat.classList.remove('hidden');
        if (iconRepeat1) iconRepeat1.classList.add('hidden');
    } else if (repeatMode === 1) {
        btnRepeat.classList.add('active-state');
        if (iconRepeat)  iconRepeat.classList.remove('hidden');
        if (iconRepeat1) iconRepeat1.classList.add('hidden');
    } else if (repeatMode === 2) {
        btnRepeat.classList.add('active-state');
        if (iconRepeat)  iconRepeat.classList.add('hidden');
        if (iconRepeat1) iconRepeat1.classList.remove('hidden');
    }

    if (btnShuffle) {
        if (isShuffle) btnShuffle.classList.add('active-state');
        else           btnShuffle.classList.remove('active-state');
    }

    updateMiniPlayerUI();
}

// ── 7. Playback & Track Management ───────────────────────────────────────────
function loadTrack(index) {
    const source = getPlaybackSource();
    const track  = source[index];
    if (!track) {
        console.warn('loadTrack: no track at index', index);
        return;
    }

    FFTAnalyzer.reset();
    playbackEngine.loadTrack(track);
    loadAndDecodeWaveform(track.url);

    songTitleEl.textContent  = track.title;
    songArtistEl.textContent = track.artist;
    coverArt.src             = track.cover;
    angelicVinylArt.src      = track.cover;

    const bgGlow = document.getElementById('player-bg-glow');
    if (bgGlow) bgGlow.style.backgroundImage = `url("${track.cover}")`;
    const artGlow = document.querySelector('.am-art-glow');
    if (artGlow) artGlow.style.backgroundImage = `url("${track.cover}")`;
    const angelicBg = document.getElementById('angelic-bg');
    if (angelicBg) angelicBg.style.backgroundImage = `url("${track.cover}")`;

    const applyColors = (uiColors) => {
        const safeUI = uiColors && uiColors.length >= 4 ? uiColors : [
            { r: 0,   g: 229, b: 255 }, { r: 120, g: 80,  b: 255 },
            { r: 255, g: 0,   b: 128 }, { r: 0,   g: 255, b: 180 }
        ];
        document.documentElement.style.setProperty('--blob-1-color', `rgb(${safeUI[0].r}, ${safeUI[0].g}, ${safeUI[0].b})`);
        document.documentElement.style.setProperty('--blob-2-color', `rgb(${safeUI[1].r}, ${safeUI[1].g}, ${safeUI[1].b})`);
        document.documentElement.style.setProperty('--blob-3-color', `rgb(${safeUI[2].r}, ${safeUI[2].g}, ${safeUI[2].b})`);
        document.documentElement.style.setProperty('--blob-4-color', `rgb(${safeUI[3].r}, ${safeUI[3].g}, ${safeUI[3].b})`);
        document.documentElement.style.setProperty('--blob-1-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
        document.documentElement.style.setProperty('--blob-2-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
        document.documentElement.style.setProperty('--blob-3-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
        document.documentElement.style.setProperty('--blob-4-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
    };

    if (track.cover) {
        loadImageForColorExtraction(track.cover)
            .then((image) => extractColorsFromImage(image, applyColors))
            .catch((err) => {
                console.warn('Color extraction image load failed, using fallback colors:', err);
                extractColorsFromImage(null, applyColors);
            });
    }

    const driftRatio = track.drift || 1.0;
    LyricEngine.setDriftRatio(driftRatio);
    driftSlider.value        = driftRatio;
    driftVal.textContent     = driftRatio.toFixed(3) + 'x';

    LyricEngine.resetScroll(lyricsContainer);
    LyricEngine.setLyrics(track.lyrics);
    LyricEngine.renderLyrics(lyricsList, angelicTextContainer, cinematicTextContainer);

    const currentLyrics = LyricEngine.getCurrentLyrics();
    const lines = lyricsList.querySelectorAll('.am-lyric-line');
    lines.forEach((lineEl, idx) => {
        lineEl.addEventListener('click', () => {
            AngelicRenderer.prepareLine(currentLyrics[idx], idx, angelicTextContainer);
            if (currentLyrics[idx + 1]) {
                AngelicRenderer.prepareLine(currentLyrics[idx + 1], idx + 1, angelicTextContainer);
            }
            playbackEngine.seek(currentLyrics[idx].time * LyricEngine.getDriftRatio());
            if (!PlayerController.getIsPlaying()) playAudio();
        });
    });

    if (currentLyrics.length > 0) {
        setTimeout(() => {
            AngelicRenderer.prepareLine(currentLyrics[0], 0, angelicTextContainer);
            if (currentLyrics[1]) AngelicRenderer.prepareLine(currentLyrics[1], 1, angelicTextContainer);
        }, 200);
    }

    updateMediaSessionMetadata(track);
}

function prepareLyricNearTime(time) {
    LyricEngine.prepareLyricNearTime(time, (lyricObj, idx) => {
        AngelicRenderer.prepareLine(lyricObj, idx, angelicTextContainer);
    });
}

/**
 * playAudio / pauseAudio: now lean — they call PlaybackEngine and return.
 * UI sync (icons, CSS classes, renderLoop) is handled by PlaybackCoordinator
 * via 'statechange' events emitted by PlaybackEngine.
 */
function playAudio() {
    playbackEngine.play().catch(err => {
        console.error('Play error:', err);
    });
}

function pauseAudio() {
    playbackEngine.pause();
}

function togglePlay() {
    if (!playbackEngine.isPaused && PlayerController.getIsPlaying()) pauseAudio();
    else playAudio();
}

function prevTrack() {
    const source = getPlaybackSource();
    if (source.length === 0) return;
    if (playbackEngine.currentTime > 3) {
        playbackEngine.seek(0);
        if (PlayerController.getIsPlaying()) playAudio(); else updateProgress();
        return;
    }
    if (PlayerController.getRepeatMode() === 2) { playbackEngine.seek(0); playAudio(); return; }

    let currentTrackIndex = PlayerController.getCurrentTrackIndex();
    if (PlayerController.getIsShuffle()) {
        const shuffledQueue = PlayerController.getShuffledQueue();
        let qIdx = shuffledQueue.indexOf(currentTrackIndex);
        if (qIdx <= 0) qIdx = shuffledQueue.length - 1; else qIdx--;
        PlayerController.setCurrentTrackIndex(shuffledQueue[qIdx]);
    } else {
        let index = currentTrackIndex - 1;
        if (index < 0) index = source.length - 1;
        PlayerController.setCurrentTrackIndex(index);
    }

    loadTrack(PlayerController.getCurrentTrackIndex());
    playAudio();
    updateMiniPlayerUI();
}

function nextTrack(isAutoNext = false) {
    const source = getPlaybackSource();
    if (source.length === 0) return;
    const repeatMode = PlayerController.getRepeatMode();
    if (repeatMode === 2) { playbackEngine.seek(0); playAudio(); return; }

    let currentTrackIndex = PlayerController.getCurrentTrackIndex();
    if (PlayerController.getIsShuffle()) {
        const shuffledQueue = PlayerController.getShuffledQueue();
        let qIdx = shuffledQueue.indexOf(currentTrackIndex);
        const sourceLengthMismatch = shuffledQueue.length !== source.length;
        if (qIdx === -1 || qIdx === shuffledQueue.length - 1 || sourceLengthMismatch) {
            if (isAutoNext && repeatMode === 0) { pauseAudio(); return; }
            PlayerController.generateShuffleQueue(true);
            qIdx = 0;
        } else {
            qIdx++;
        }
        PlayerController.setCurrentTrackIndex(PlayerController.getShuffledQueue()[qIdx]);
    } else {
        let index = currentTrackIndex + 1;
        if (index >= source.length) {
            if (repeatMode === 0) { pauseAudio(); return; }
            index = 0;
        }
        PlayerController.setCurrentTrackIndex(index);
    }

    loadTrack(PlayerController.getCurrentTrackIndex());
    playAudio();
    updateMiniPlayerUI();
}

function updateProgress() {
    if (isNaN(audio.duration)) return;
    const duration    = audio.duration;
    const currentTime = audio.currentTime;
    const percent     = (currentTime / duration) * 100;

    if (!isDraggingSlider) {
        progressSlider.value         = percent;
        progressBarFill.style.width  = `${percent}%`;
    }

    const miniSlider = document.getElementById('mini-progress-slider');
    if (miniSlider && !MiniPlayerController.isDragging()) {
        miniSlider.value = percent;
        drawMiniWaveform(percent);
    }

    const floorTime = Math.floor(currentTime);
    if (floorTime !== lastFormattedSec) {
        lastFormattedSec             = floorTime;
        currentTimeEl.textContent    = formatTime(currentTime);
        totalTimeEl.textContent      = formatTime(duration);
    }

    LyricEngine.updateHighlight(
        currentTime,
        lyricsList,
        lyricsContainer,
        (index) => {
            if (VisualizerController.getIsAngelicMode()) {
                const currentLyrics = LyricEngine.getCurrentLyrics();
                AngelicRenderer.showLine(index, currentLyrics[index], currentLyrics, angelicTextContainer, LyricEngine.getAngelicTiming(index, currentTime));
                if (currentLyrics[index + 1]) {
                    scheduleAngelicLyricPreparation(angelicTextContainer,
                        () => AngelicRenderer.prepareLine(currentLyrics[index + 1], index + 1, angelicTextContainer),
                        currentLyrics[index + 1].time * LyricEngine.getDriftRatio() - currentTime);
                }
            }
        },
        (text) => {
            if (VisualizerController.getIsCinematicMode()) {
                triggerCinematicLine(text, cinematicTextContainer);
            }
        },
        () => {
            if (VisualizerController.getIsCinematicMode()) {
                clearCinematicLine(cinematicTextContainer, 500);
            }
        },
        duration => {
            if (VisualizerController.getIsAngelicMode()) AngelicRenderer.clearLine(angelicTextContainer, duration);
        }
    );
}

// ── 9. View Transitions & Navigation ─────────────────────────────────────────
function openPlayer(index) {
    PlayerController.setCurrentTrackIndex(index);
    loadTrack(index);
    syncPlayerControlsUI();
    document.getElementById('mini-player').classList.remove('hidden');
    updateMiniPlayerUI();
    playAudio();
}

function closePlayer() {
    if (isPlayerTransitioning) return;
    isPlayerTransitioning = true;

    if (window._idleSetPlayerOpen) window._idleSetPlayerOpen(false);

    homeView.classList.remove('hidden');
    void homeView.offsetHeight;

    playerView.classList.remove('player-active');

    setTimeout(() => {
        playerView.classList.add('hidden');
        isPlayerTransitioning = false;

        const currentTrackIndex = PlayerController.getCurrentTrackIndex();
        if (currentTrackIndex !== -1 && PlayerController.getPlaylist()[currentTrackIndex]) {
            document.getElementById('mini-player').classList.remove('hidden');
            updateMiniPlayerUI();
        }
    }, 280);
}
window.closePlayer = closePlayer;

// ── 10. Event Setup ──────────────────────────────────────────────────────────
function setupEventListeners() {
    homeSongGrid.addEventListener('click', (e) => {
        const card      = e.target.closest('.song-card');
        const optionBtn = e.target.closest('.song-options-btn');
        if (optionBtn) {
            e.stopPropagation();
            const idx  = optionBtn.getAttribute('data-index');
            const menu = document.getElementById(`context-menu-${idx}`);
            document.querySelectorAll('.context-menu.active').forEach(m => {
                if (m !== menu) m.classList.remove('active');
            });
            if (menu) menu.classList.toggle('active');
            return;
        }
        if (card) {
            if (card.classList.contains('vinyl-box-card')) return;
            const songId   = card.getAttribute('data-id');
            const playlist = PlayerController.getPlaylist();
            PlayerController.setActiveQueue([...playlist]);
            const pIdx = playlist.findIndex(s => s.id === songId);
            if (pIdx !== -1) {
                PlayerController.setActivePlaylistContext('library');
                openPlayer(pIdx);
            }
        }
    });

    btnAddSong.addEventListener('click', () => {
        uploadForm.reset();
        const uploadLrcStatus = document.getElementById('upload-lrc-status');
        if (uploadLrcStatus) uploadLrcStatus.textContent = '';
        uploadModal.classList.remove('hidden');
    });
    btnCloseModal.addEventListener('click', () => uploadModal.classList.add('hidden'));

    setupUploadHandler({
        uploadModal,
        uploadForm,
        uploadAudio,
        uploadLrc,
        uploadCover,
        uploadTitle,
        uploadArtist,
        showToast,
        homeSongGrid,
        setupBoxExpansionListeners: (boxes) =>
            setupBoxExpansionListeners(homeSongGrid, boxes, openPlayer, syncPlayerControlsUI)
    });

    if (editAudio) {
        editAudio.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file || !window.jsmediatags) return;
            window.jsmediatags.read(file, {
                onSuccess: function(tag) {
                    const tags = tag.tags;
                    if (tags.title)  document.getElementById('edit-title').value  = tags.title;
                    if (tags.artist) document.getElementById('edit-artist').value = tags.artist;
                    if (tags.picture) {
                        try {
                            const { data, format } = tags.picture;
                            const blob    = new Blob([new Uint8Array(data)], { type: format });
                            const imgFile = new File([blob], 'cover.jpg', { type: format });
                            const dt      = new DataTransfer();
                            dt.items.add(imgFile);
                            editCover.files = dt.files;
                        } catch (err) {
                            console.warn('Could not attach cover art', err);
                        }
                    }
                },
                onError: (error) => console.warn('Error reading tags', error)
            });
        });
    }

    btnBackHome.addEventListener('click', closePlayer);

    // ── Play / Pause / Prev / Next transport buttons ──────────────────────────
    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', prevTrack);
    nextBtn.addEventListener('click', () => nextTrack(false));

    const btnRepeat = document.getElementById('btn-repeat');
    if (btnRepeat) {
        btnRepeat.addEventListener('click', () => {
            const currentTrack = getPlaybackSource()[PlayerController.getCurrentTrackIndex()];
            PlayerController.setRepeatMode((PlayerController.getRepeatMode() + 1) % 3);
            const newSource = getPlaybackSource();
            if (currentTrack) {
                const newIdx = newSource.findIndex(s => s.id === currentTrack.id);
                if (newIdx !== -1) PlayerController.setCurrentTrackIndex(newIdx);
            }
            if (PlayerController.getIsShuffle()) PlayerController.generateShuffleQueue();
            const rm = PlayerController.getRepeatMode();
            if (rm === 0)      showToast('Repeat: Off');
            else if (rm === 1) showToast('Repeat: All');
            else if (rm === 2) showToast('Repeat: One');
            syncPlayerControlsUI();
        });
    }

    const btnShuffle = document.getElementById('btn-shuffle');
    if (btnShuffle) {
        btnShuffle.addEventListener('click', () => {
            const currentTrack  = getPlaybackSource()[PlayerController.getCurrentTrackIndex()];
            const isNowShuffle  = PlayerController.toggleShuffle();
            if (isNowShuffle) {
                if (PlayerController.getRepeatMode() === 0) showToast('Shuffle: On (Playing Library)');
                else                                         showToast('Shuffle: On (Playing Playlist)');
            } else {
                const newSource = getPlaybackSource();
                if (currentTrack) {
                    const newIdx = newSource.findIndex(s => s.id === currentTrack.id);
                    if (newIdx !== -1) PlayerController.setCurrentTrackIndex(newIdx);
                }
                showToast('Shuffle: Off');
            }
            syncPlayerControlsUI();
        });
    }

    progressSlider.addEventListener('input', (e) => {
        isDraggingSlider = true;
        progressBarFill.style.width = `${e.target.value}%`;
        if (progressThumb) progressThumb.style.left = `${e.target.value}%`;
        if (!isNaN(audio.duration)) prepareLyricNearTime((e.target.value / 100) * audio.duration);
    });
    progressSlider.addEventListener('change', (e) => {
        if (!isNaN(audio.duration)) {
            const targetTime = (e.target.value / 100) * audio.duration;
            prepareLyricNearTime(targetTime);
            playbackEngine.seek(targetTime);
            if (!PlayerController.getIsPlaying()) updateProgress();
        }
        isDraggingSlider = false;
    });

    volumeSlider.addEventListener('input', (e) => {
        const val = e.target.value / 100;
        playbackEngine.setVolume(val);
        isMuted = (val === 0);
        updateVolumeIcon(val);
    });

    if (btnMute) {
        btnMute.addEventListener('click', () => {
            isMuted = !isMuted;
            if (isMuted) {
                lastVolume = playbackEngine.volume > 0 ? playbackEngine.volume : 0.8;
                playbackEngine.setVolume(0);
                volumeSlider.value = 0;
                updateVolumeIcon(0);
            } else {
                playbackEngine.setVolume(lastVolume);
                volumeSlider.value = lastVolume * 100;
                updateVolumeIcon(lastVolume);
            }
        });
    }

    btnToggleDrift.addEventListener('click', () => {
        driftContainer.classList.toggle('hidden');
    });
    driftSlider.addEventListener('input', (e) => {
        const dr = parseFloat(e.target.value);
        LyricEngine.setDriftRatio(dr);
        driftVal.textContent = dr.toFixed(3) + 'x';
        const source = getPlaybackSource();
        const cti    = PlayerController.getCurrentTrackIndex();
        if (source[cti]) {
            source[cti].drift = dr;
            const trackId   = source[cti].id;
            const plTrack   = PlayerController.getPlaylist().find(s => s.id === trackId);
            if (plTrack) plTrack.drift = dr;
        }
        if (!PlayerController.getIsPlaying()) updateProgress();
    });
    driftSlider.addEventListener('change', () => {
        saveLibraryToDB();
    });

    btnCinematic.addEventListener('click', () => {
        VisualizerController.enterCinematicMode(
            playerView,
            cinematicView,
            LyricEngine.getActiveLyricIndex(),
            LyricEngine.getCurrentLyrics(),
            (text) => triggerCinematicLine(text, cinematicTextContainer)
        );
        createVignetteOverlay(cinematicView);
        updateProgress();
    });
    btnExitCinematic.addEventListener('click', () => {
        VisualizerController.exitCinematicMode(cinematicView, playerView, cinematicTextContainer);
        removeVignetteOverlay();
        updateProgress();
    });

    btnAngelic.addEventListener('click', () => {
        const currentLyrics = LyricEngine.getCurrentLyrics();
        VisualizerController.enterAngelicMode(
            playerView,
            angelicView,
            LyricEngine.getActiveLyricIndex(),
            currentLyrics,
            (index) => AngelicRenderer.showLine(index, currentLyrics[index], currentLyrics, angelicTextContainer, LyricEngine.getAngelicTiming(index, audio.currentTime)),
            (lyricObj, index) => AngelicRenderer.prepareLine(lyricObj, index, angelicTextContainer)
        );
        updateProgress();
    });
    btnExitAngelic.addEventListener('click', () => {
        VisualizerController.exitAngelicMode(angelicView, playerView, angelicTextContainer, angelicParticleContainer);
        updateProgress();
    });

    VisualizerController.setupAutoHide();

    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err =>
                    console.warn(`Fullscreen error: ${err.message}`)
                );
            } else {
                document.exitFullscreen();
            }
        });
    }

    // ── Phase 3: Reduced option bags ─────────────────────────────────────────
    MiniPlayerController.setupListeners({
        engine: playbackEngine,
        PlayerController,
        LyricEngine,
        togglePlay,
        nextTrack,
        prevTrack,
        updateProgress,
        prepareLyricNearTime,
        homeView,
        playerView,
        lyricsContainer,
        updateMiniPlayerUI
    });

    setupRecordingController({
        engine: playbackEngine,
        playAudio,
        pauseAudio,
        showToast,
        getPlaybackSource,
        PlayerController,
        LyricEngine,
        lyricsList,
        angelicTextContainer,
        cinematicTextContainer,
        updateProgress
    });

    initGlobalKeyHandlers({
        closePlayer,
        togglePlay,
        prevTrack,
        nextTrack,
        pauseAudio,
        updateProgress,
        prepareLyricNearTime,
        volumeSlider,
        updateVolumeIcon,
        engine: playbackEngine
    });

    setupSongCardDropHandler({
        PlayerController,
        LyricEngine,
        lyricsList,
        angelicTextContainer,
        cinematicTextContainer,
        showToast,
        loadTrack,
        updateProgress,
        homeSongGrid,
        openPlayer,
        syncPlayerControlsUI,
        audio,
        coverArt
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.song-options-btn') && !e.target.closest('.context-menu')) {
        document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    }
});

document.addEventListener('wavr:updateLibraryOrder', (e) => {
    if (e.detail?.order !== undefined) setCachedLibraryOrder(e.detail.order);
});

// ── 11. Main App Initialization ──────────────────────────────────────────────
async function initHome() {
    playbackEngine.setVolume(0.8);
    initWaveform(audio);
    attachParallax();
    CloudSyncIndicator.init();

    // Wire PlaybackCoordinator — single authoritative event subscriber for UI sync.
    initPlaybackCoordinator({
        engine:            playbackEngine,
        renderLoop,
        playIcon,
        pauseIcon,
        coverArt,
        vinylRecord,
        updateMiniPlayerUI,
        nextTrack,
        isRecording: () => document.body.classList.contains('is-recording')
    });

    let loadedPlaylist = [];
    try {
        if (SupabaseService.isConfigured() && (await SupabaseService.getCurrentUser())) {
            const cloudTracks = await SupabaseService.fetchUserTracks();
            if (cloudTracks && cloudTracks.length > 0) {
                loadedPlaylist = cloudTracks.map((song) => ({
                    id:     song.id,
                    title:  song.title,
                    artist: song.artist,
                    lyrics: song.lrc_text || '',
                    drift:  1.0,
                    url:    song.audio_url,
                    cover:  song.cover_url || coverImgUrl
                }));
                PlayerController.setPlaylist(loadedPlaylist);
            }

            const prefs = await SupabaseService.getUserPreferences();
            if (prefs) {
                if (Array.isArray(prefs.vinyl_boxes))   setCachedVinylBoxes(prefs.vinyl_boxes);
                if (Array.isArray(prefs.library_order)) setCachedLibraryOrder(prefs.library_order);
            }
        }
    } catch (e) {
        console.error('Error loading library from Supabase Cloud DB', e);
    }

    Object.assign(window.appMainContext || (window.appMainContext = {}), {
        getPlaylist:  () => PlayerController.getPlaylist(),
        showToast:    (msg) => showToast(msg),
        updateBoxCache: (boxes, order) => {
            updateBoxCache(boxes, order);
            renderSongGrid({
                homeSongGrid,
                setupBoxExpansionListeners: (b) =>
                    setupBoxExpansionListeners(homeSongGrid, b, openPlayer, syncPlayerControlsUI)
            });
        },
        stopPlaybackForEdit: () => {
            pauseAudio();
            playbackEngine.seek(0);
            PlayerController.setCurrentTrackIndex(-1);
            const miniPlayer = document.getElementById('mini-player');
            if (miniPlayer) miniPlayer.classList.add('hidden');
        }
    });

    await renderSongGrid({
        homeSongGrid,
        setupBoxExpansionListeners: (boxes) =>
            setupBoxExpansionListeners(homeSongGrid, boxes, openPlayer, syncPlayerControlsUI)
    });

    setupEventListeners();
    initSettings();
    BackgroundManager.init();
    setupEQController();
    setupIdleAutoHide();

    initEditLibrary(PlayerController.getPlaylist(), async () => {
        await renderSongGrid({
            homeSongGrid,
            setupBoxExpansionListeners: (boxes) =>
                setupBoxExpansionListeners(homeSongGrid, boxes, openPlayer, syncPlayerControlsUI)
        });
    });

    LibraryModals.init({
        renderSongGrid: () => renderSongGrid({
            homeSongGrid,
            setupBoxExpansionListeners: (boxes) =>
                setupBoxExpansionListeners(homeSongGrid, boxes, openPlayer, syncPlayerControlsUI)
        }),
        getPlaylist:        () => PlayerController.getPlaylist(),
        saveLibraryToDB,
        parseLyrics: (lrcText) => {
            LyricEngine.setLyrics(lrcText);
            LyricEngine.renderLyrics(lyricsList, angelicTextContainer, cinematicTextContainer);
        },
        getCachedVinylBoxes,
        setCachedVinylBoxes,
        getCurrentTrackIndex: () => PlayerController.getCurrentTrackIndex(),
        pauseAudio,
        loadTrack,
        updateMiniPlayerUI,
        getIsPlaying: () => PlayerController.getIsPlaying(),
        playAudio
    });
    LibraryModals.bindEvents();

    setupMediaSession({
        engine: playbackEngine,
        playAudio,
        pauseAudio,
        prevTrack,
        nextTrack,
        updateProgress,
        prepareLyricNearTime
    });

    await runSplashBootstrapper(loadedPlaylist);
    observeGraphicsAvailability(showToast);
}

// ── 12. App Launch ───────────────────────────────────────────────────────────
preloadAngelicAssets();
preloadCinematicAssets();
initVaultSessionBoundary(SupabaseService, {
    clearPrivateState: clearVaultBrowserState,
    reload: () => window.location.reload()
});
initHome();
initCloudVaultUI(showToast);
