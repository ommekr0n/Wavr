/**
 * main.js — App Orchestrator & Bootstrapper
 * ==========================================
 * Wires all modular engines (core/) and feature controllers (features/)
 * into the main entry point.
 */

// ── Imports ──────────────────────────────────────────────────────────────────
import { extractColorsFromImage } from './modules/color-extractor.js';
import { initSettings, initEditLibrary } from './modules/edit-library.js';
import { startScreenRecording } from './modules/recorder.js';
import { BackgroundManager } from './modules/background-manager.js';
import coverImgUrl from '../assets/images/cover.png';

import './floral-templates.js';
import { AudioEngine } from './core/audio/AudioEngine.js';
import { FFTAnalyzer } from './core/audio/FFTAnalyzer.js';
import { CinematicRenderer } from './core/rendering/CinematicRenderer.js';
import { AngelicRenderer } from './core/rendering/AngelicRenderer.js';

import { PlayerController } from './features/player/PlayerController.js';
import { LyricEngine } from './features/lyrics/LyricEngine.js';
import { VisualizerController } from './features/visualizer/VisualizerController.js';
import { LibraryModals } from './features/library/LibraryModals.js';
import { SupabaseService } from './services/SupabaseService.js';

// Modular Refactored Sub-systems
import { initWaveform, loadAndDecodeWaveform, drawMiniWaveform, clearWaveformCache } from './features/player/WaveformEngine.js';
import { setupMediaSession, updateMediaSessionMetadata } from './features/player/MediaSessionManager.js';
import { setupEQController } from './features/eq/EQController.js';
import { renderSongGrid, saveLibraryToDB, updateBoxCache, getCachedVinylBoxes, getCachedLibraryOrder, setCachedVinylBoxes, setCachedLibraryOrder } from './features/library/HomeGridRenderer.js';
import { setupBoxExpansionListeners, closeBoxExpansion } from './features/library/HomeBoxExpansion.js';
import { setupUploadHandler } from './features/library/UploadHandler.js';
import { triggerCinematicLine } from './features/visualizer/CinematicTextRenderer.js';
import {
    updateLyricBreath,
    updateParallax,
    updateVignette,
    attachParallax,
    createVignetteOverlay,
    removeVignetteOverlay,
    triggerBeatZoom,
    updateCinematicLyricBeat,
    tickZoomCooldown,
    getReactiveParticleTimer
} from './features/visualizer/VisualFX.js';

// ── Global Security Rules ────────────────────────────────────────────────────
document.addEventListener('copy', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
});
document.addEventListener('cut', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
});

// ── Global ESC Handler ───────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const activeMenu = document.querySelector('.context-menu.active');
        if (activeMenu) { activeMenu.classList.remove('active'); return; }

        const activeModal = document.querySelector('.modal:not(.hidden), .modal-backdrop:not(.hidden)');
        if (activeModal) {
            const closeBtn = activeModal.querySelector('.close-btn, .btn-close, .btn-cancel, #btn-close-modal, .btn-create-box-cancel, [title="Close"], button[id*="cancel"]');
            if (closeBtn) closeBtn.click();
            else activeModal.classList.add('hidden');
            return;
        }

        if (VisualizerController.getIsCinematicMode()) {
            const btnExitCine = document.getElementById('btn-exit-cinematic');
            if (btnExitCine) btnExitCine.click();
            return;
        }
        if (VisualizerController.getIsAngelicMode()) {
            const btnExitAngel = document.getElementById('btn-exit-angelic');
            if (btnExitAngel) btnExitAngel.click();
            return;
        }

        const playerViewEl = document.getElementById('player-view');
        if (playerViewEl && !playerViewEl.classList.contains('hidden')) {
            closePlayer();
            return;
        }

        const expandedBox = document.querySelector('.vinyl-box-card.expanded-active');
        if (expandedBox) {
            const boxCloseBtn = expandedBox.querySelector('.btn-close-box');
            if (boxCloseBtn) { boxCloseBtn.click(); return; }
        }

        const editLibraryViewEl = document.getElementById('edit-library-view');
        if (editLibraryViewEl && !editLibraryViewEl.classList.contains('hidden')) {
            const doneBtn = document.getElementById('btn-edit-done');
            if (doneBtn) { doneBtn.click(); return; }
        }
    }
});

// ── DOM Elements ─────────────────────────────────────────────────────────────
const homeView = document.getElementById('home-view');
const playerView = document.getElementById('player-view');
const uploadModal = document.getElementById('upload-modal');

const homeSongGrid = document.getElementById('home-song-grid');
const btnAddSong = document.getElementById('btn-add-song');
const btnCloseModal = document.getElementById('btn-close-modal');

const uploadForm = document.getElementById('upload-form');
const uploadAudio = document.getElementById('upload-audio');
const uploadLrc = document.getElementById('upload-lrc');
const uploadCover = document.getElementById('upload-cover');
const uploadTitle = document.getElementById('upload-title');
const uploadArtist = document.getElementById('upload-artist');

const editAudio = document.getElementById('edit-audio');
const editCover = document.getElementById('edit-cover');

const btnBackHome = document.getElementById('btn-back-home');
const audio = document.getElementById('audio-player');
const coverArt = document.getElementById('cover-art');

const songTitleEl = document.getElementById('song-title');
const songArtistEl = document.getElementById('song-artist');
const lyricsContainer = document.getElementById('lyrics-container');
const lyricsList = document.getElementById('lyrics-list');

const playBtn = document.getElementById('btn-play');
const playIcon = playBtn.querySelector('.play-icon');
const pauseIcon = playBtn.querySelector('.pause-icon');
const prevBtn = document.getElementById('btn-prev');
const nextBtn = document.getElementById('btn-next');
const volumeSlider = document.getElementById('volume-slider');
const btnMute = document.getElementById('btn-mute');

const btnToggleDrift = document.getElementById('btn-toggle-drift');
const driftContainer = document.getElementById('drift-container');
const driftSlider = document.getElementById('drift-slider');
const driftVal = document.getElementById('drift-val');

const progressSlider = document.getElementById('progress-slider');
const progressBarFill = document.querySelector('.progress-bar-fill');
const progressThumb = document.querySelector('.progress-thumb');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');

const btnAngelic = document.getElementById('btn-angelic');
const angelicView = document.getElementById('angelic-view');
const btnExitAngelic = document.getElementById('btn-exit-angelic');
const angelicVinylArt = document.getElementById('angelic-vinyl-art');
const angelicTextContainer = document.getElementById('angelic-text-container');
const angelicParticleContainer = document.getElementById('angelic-particle-container');
const vinylRecord = document.querySelector('.vinyl-record');

const cinematicView = document.getElementById('cinematic-view');
const cinematicTextContainer = document.getElementById('cinematic-text-container');
const btnCinematic = document.getElementById('btn-cinematic');
const btnExitCinematic = document.getElementById('btn-exit-cinematic');
const cinematicCanvas = document.getElementById('cinematic-canvas');
const cineFireLeft = document.getElementById('cine-fire-left');
const cineFireRight = document.getElementById('cine-fire-right');
const reactiveDim = document.getElementById('reactive-dim');

// State
let isDraggingSlider = false;
let isDraggingMiniSlider = false;
let animationFrameId = null;
let lastVolume = 0.8;
let isMuted = false;
let angelicParticleTimer = 0;
let angelicIdleParticleTimer = 0;
let isPlayerTransitioning = false;
let toastTimeout = null;

let winWidth = window.innerWidth;
let winHeight = window.innerHeight;
window.addEventListener('resize', () => {
    winWidth = window.innerWidth;
    winHeight = window.innerHeight;
});

// Cloud Storage & Waveform Init
CinematicRenderer.init();
initWaveform(audio);

// ── VisualFX boot-up (one-time) ──────────────────────────────────────────────
attachParallax(); // Passive mousemove listener — zero cost when mode inactive

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

function getPlaybackSource() { return PlayerController.getPlaybackSource(); }

function syncPlayerControlsUI() {
    const btnRepeat = document.getElementById('btn-repeat');
    if (!btnRepeat) return;
    const iconRepeat = btnRepeat.querySelector('.icon-repeat');
    const iconRepeat1 = btnRepeat.querySelector('.icon-repeat-1');
    const btnShuffle = document.getElementById('btn-shuffle');
    const repeatMode = PlayerController.getRepeatMode();
    const isShuffle = PlayerController.getIsShuffle();

    if (repeatMode === 0) {
        btnRepeat.classList.remove('active-state');
        iconRepeat.classList.remove('hidden');
        iconRepeat1.classList.add('hidden');
    } else if (repeatMode === 1) {
        btnRepeat.classList.add('active-state');
        iconRepeat.classList.remove('hidden');
        iconRepeat1.classList.add('hidden');
    } else if (repeatMode === 2) {
        btnRepeat.classList.add('active-state');
        iconRepeat.classList.add('hidden');
        iconRepeat1.classList.remove('hidden');
    }
    if (isShuffle) btnShuffle.classList.add('active-state');
    else btnShuffle.classList.remove('active-state');

    updateMiniPlayerUI();
}

function loadTrack(index) {
    const source = getPlaybackSource();
    const track = source[index];
    if (!track) { console.warn('loadTrack: no track at index', index); return; }

    FFTAnalyzer.reset();
    audio.src = track.url;
    audio.load();
    loadAndDecodeWaveform(track.url);

    songTitleEl.textContent = track.title;
    songArtistEl.textContent = track.artist;
    coverArt.src = track.cover;
    angelicVinylArt.src = track.cover;
    const bgGlow = document.getElementById('player-bg-glow');
    if (bgGlow) bgGlow.style.backgroundImage = `url("${track.cover}")`;
    const artGlow = document.querySelector('.am-art-glow');
    if (artGlow) artGlow.style.backgroundImage = `url("${track.cover}")`;
    document.getElementById('angelic-bg').style.backgroundImage = `url("${track.cover}")`;

    const applyColors = (uiColors, spotlightColors) => {
        const safeUI = uiColors && uiColors.length >= 4 ? uiColors : [
            { r: 0, g: 229, b: 255 }, { r: 120, g: 80, b: 255 },
            { r: 255, g: 0, b: 128 }, { r: 0, g: 255, b: 180 }
        ];
        const safeSpotlight = spotlightColors && spotlightColors.length >= 4 ? spotlightColors : [
            { r: 0, g: 180, b: 255 }, { r: 150, g: 50, b: 255 },
            { r: 255, g: 50, b: 150 }, { r: 50, g: 255, b: 200 }
        ];

        document.documentElement.style.setProperty('--blob-1-color', `rgb(${safeUI[0].r}, ${safeUI[0].g}, ${safeUI[0].b})`);
        document.documentElement.style.setProperty('--blob-2-color', `rgb(${safeUI[1].r}, ${safeUI[1].g}, ${safeUI[1].b})`);
        document.documentElement.style.setProperty('--blob-3-color', `rgb(${safeUI[2].r}, ${safeUI[2].g}, ${safeUI[2].b})`);
        document.documentElement.style.setProperty('--blob-4-color', `rgb(${safeUI[3].r}, ${safeUI[3].g}, ${safeUI[3].b})`);
        document.documentElement.style.setProperty('--blob-1-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
        document.documentElement.style.setProperty('--blob-2-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
        document.documentElement.style.setProperty('--blob-3-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
        document.documentElement.style.setProperty('--blob-4-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
        CinematicRenderer.updateConcertColors(safeSpotlight.map(c => [c.r, c.g, c.b]));
    };
    
    // Safely extract colors via offscreen image without tainting or blocking DOM coverArt element
    if (track.cover) {
        const offscreenImg = new Image();
        offscreenImg.crossOrigin = 'anonymous';
        offscreenImg.onload = () => extractColorsFromImage(offscreenImg, applyColors);
        offscreenImg.onerror = () => extractColorsFromImage(null, applyColors);
        offscreenImg.src = track.cover;
    }

    const driftRatio = track.drift || 1.0;
    LyricEngine.setDriftRatio(driftRatio);
    driftSlider.value = driftRatio;
    driftVal.textContent = driftRatio.toFixed(3) + 'x';

    LyricEngine.resetScroll(lyricsContainer);
    LyricEngine.setLyrics(track.lyrics);
    LyricEngine.renderLyrics(lyricsList, angelicTextContainer, cinematicTextContainer);

    const currentLyrics = LyricEngine.getCurrentLyrics();
    const lines = lyricsList.querySelectorAll('.am-lyric-line');
    lines.forEach((lineEl, index) => {
        lineEl.addEventListener('click', () => {
            AngelicRenderer.prepareLine(currentLyrics[index], index, angelicTextContainer);
            if (currentLyrics[index + 1]) {
                AngelicRenderer.prepareLine(currentLyrics[index + 1], index + 1, angelicTextContainer);
            }
            audio.currentTime = currentLyrics[index].time * LyricEngine.getDriftRatio();
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
    LyricEngine.prepareLyricNearTime(time, (lyricObj, index) => {
        AngelicRenderer.prepareLine(lyricObj, index, angelicTextContainer);
    });
}

function playAudio() {
    AudioEngine.init(audio);
    audio.play().then(() => {
        PlayerController.setIsPlaying(true);
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
        coverArt.classList.add('playing');
        if (vinylRecord) vinylRecord.classList.add('playing');
        updateMiniPlayerUI();
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        syncLoop();
    }).catch(err => {
        console.error("Play error:", err);
        PlayerController.setIsPlaying(false);
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        coverArt.classList.remove('playing');
        if (vinylRecord) vinylRecord.classList.remove('playing');
        updateMiniPlayerUI();
    });
}

function pauseAudio() {
    audio.pause();
    PlayerController.setIsPlaying(false);
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    coverArt.classList.remove('playing');
    if (vinylRecord) vinylRecord.classList.remove('playing');
    updateMiniPlayerUI();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
}

function togglePlay() {
    if (!audio.paused && PlayerController.getIsPlaying()) pauseAudio();
    else playAudio();
    updateMiniPlayerUI();
}

function prevTrack() {
    const source = getPlaybackSource();
    if (source.length === 0) return;
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        if (PlayerController.getIsPlaying()) playAudio(); else updateProgress();
        return;
    }
    if (PlayerController.getRepeatMode() === 2) { audio.currentTime = 0; playAudio(); return; }

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
    if (repeatMode === 2) { audio.currentTime = 0; playAudio(); return; }

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
    const duration = audio.duration;
    const currentTime = audio.currentTime;
    const percent = (currentTime / duration) * 100;

    if (!isDraggingSlider) {
        progressSlider.value = percent;
        progressBarFill.style.width = `${percent}%`;
    }

    const miniSlider = document.getElementById('mini-progress-slider');
    if (miniSlider && !isDraggingMiniSlider) {
        miniSlider.value = percent;
        drawMiniWaveform(percent);
    }

    const floorTime = Math.floor(currentTime);
    if (floorTime !== lastFormattedSec) {
        lastFormattedSec = floorTime;
        currentTimeEl.textContent = formatTime(currentTime);
        totalTimeEl.textContent = formatTime(duration);
    }

    LyricEngine.updateHighlight(
        currentTime,
        lyricsList,
        lyricsContainer,
        (index) => {
            if (VisualizerController.getIsAngelicMode()) {
                const currentLyrics = LyricEngine.getCurrentLyrics();
                AngelicRenderer.showLine(index, currentLyrics[index], currentLyrics, angelicTextContainer);
                if (currentLyrics[index + 1]) {
                    setTimeout(() => {
                        AngelicRenderer.prepareLine(currentLyrics[index + 1], index + 1, angelicTextContainer);
                    }, 50);
                }
            }
        },
        (text) => {
            if (VisualizerController.getIsCinematicMode()) {
                triggerCinematicLine(text, cinematicTextContainer);
            }
        }
    );
}

let lastFormattedSec = -1;
let lastBeatIntensity = -1;

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function syncLoop() {
    let intensity = 0;
    let energy = 0;
    let currentAnalysis = null;
    const isAngelic  = VisualizerController.getIsAngelicMode();
    const isCinematic = VisualizerController.getIsCinematicMode();

    if (PlayerController.getIsPlaying()) {
        updateProgress();

        const dataArray = AudioEngine.getByteFrequencyData();
        if (AudioEngine.getAnalyser() && dataArray) {
            currentAnalysis = FFTAnalyzer.analyze(dataArray);
            intensity = currentAnalysis.intensity;
            energy    = currentAnalysis.energy;
            if (Math.abs(intensity - lastBeatIntensity) > 0.015) {
                lastBeatIntensity = intensity;
                document.documentElement.style.setProperty('--beat-intensity', intensity.toFixed(3));
            }

            if (isAngelic) {
                // ── 1. Lyric Breathing (scale nhẹ theo bass) ──────────────────
                updateLyricBreath(intensity, angelicTextContainer);

                // ── 8. Reactive Particle Spawn ─────────────────────────────────
                if (intensity > 0.12) {
                    angelicParticleTimer--;
                    if (angelicParticleTimer <= 0) {
                        AngelicRenderer.spawnParticle(angelicParticleContainer, true);
                        angelicParticleTimer = getReactiveParticleTimer(energy, intensity);
                    }
                }

                if (currentAnalysis.climaxSpike) {
                    const artistEl = document.getElementById('song-artist');
                    const artistName = artistEl ? artistEl.textContent.trim() : '';
                    const quantizedCooldown = FFTAnalyzer.getQuantizedCooldownMs();
                    AngelicRenderer.spawnClimaxCombo(true, angelicParticleContainer, angelicView, artistName, quantizedCooldown);
                }
            }

            if (isCinematic) {
                // ── 5. Continuous Dual-Band Lyrics Beat Pulsation ───────────────────────
                updateCinematicLyricBeat(intensity, energy, cinematicTextContainer);

                // ── 7. Vignette Pulse ──────────────────────────────────────────
                updateVignette(energy);
            }
        }
    }

    // ── 3. Parallax Depth (Angelic Mode) ──────────────────────────────────────
    if (isAngelic) {
        updateParallax(angelicTextContainer);

        // Idle particles khi đang dạo nhạc (không phát)
        if (!PlayerController.getIsPlaying()) {
            angelicIdleParticleTimer--;
            if (angelicIdleParticleTimer <= 0) {
                AngelicRenderer.spawnParticle(angelicParticleContainer, true);
                angelicIdleParticleTimer = 25;
            }
        }
    }

    if (isCinematic && cinematicCanvas) {
        CinematicRenderer.renderFrame(
            cinematicCanvas,
            AudioEngine.getByteFrequencyData(),
            intensity,
            winWidth,
            winHeight,
            PlayerController.getIsPlaying(),
            cineFireLeft,
            cineFireRight,
            reactiveDim,
            currentAnalysis
        );
    }

    animationFrameId = requestAnimationFrame(syncLoop);
}

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

(function setupIdleAutoHide() {
    const header = document.querySelector('.app-header');
    if (!header) return;

    const IDLE_DELAY = 3000;
    let idleTimer = null;
    let _playerOpen = false;

    const fullscreenViews = [
        document.getElementById('player-view'),
        document.getElementById('cinematic-view'),
        document.getElementById('angelic-view'),
    ].filter(Boolean);

    function showControls() {
        fullscreenViews.forEach(v => v.classList.remove('cursor-idle'));
        header.classList.remove('header-hidden');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(hideControls, IDLE_DELAY);
    }

    function hideControls() {
        fullscreenViews.forEach(v => v.classList.add('cursor-idle'));
        header.classList.add('header-hidden');
    }

    document.addEventListener('mousemove', () => {
        if (_playerOpen) showControls();
    }, { passive: true });

    header.addEventListener('mouseenter', () => {
        if (!_playerOpen) return;
        clearTimeout(idleTimer);
        header.classList.remove('header-hidden');
    });
    header.addEventListener('mouseleave', () => {
        if (!_playerOpen) return;
        idleTimer = setTimeout(hideControls, IDLE_DELAY);
    });

    window._idleSetPlayerOpen = function(open) {
        _playerOpen = open;
        if (open) {
            showControls();
        } else {
            clearTimeout(idleTimer);
            header.classList.remove('header-hidden');
            fullscreenViews.forEach(v => v.classList.remove('cursor-idle'));
        }
    };
})();

function updateMiniPlayerUI() {
    const source = getPlaybackSource();
    const currentTrackIndex = PlayerController.getCurrentTrackIndex();
    const isPlaying = PlayerController.getIsPlaying();
    if (currentTrackIndex === -1 || !source[currentTrackIndex]) {
        document.getElementById('mini-player').classList.add('hidden');
        return;
    }
    const song = source[currentTrackIndex];
    document.getElementById('mini-cover').src = song.cover || coverImgUrl;
    document.getElementById('mini-title').textContent = song.title || 'Unknown Title';
    document.getElementById('mini-artist').textContent = song.artist || 'Unknown Artist';
    const btnMiniPlay = document.getElementById('btn-mini-play');
    const btnMiniPause = document.getElementById('btn-mini-pause');
    if (isPlaying) { btnMiniPlay.classList.add('hidden'); btnMiniPause.classList.remove('hidden'); }
    else { btnMiniPlay.classList.remove('hidden'); btnMiniPause.classList.add('hidden'); }

    const pct = isNaN(audio.duration) ? 0 : (audio.currentTime / audio.duration) * 100;
    drawMiniWaveform(pct);

    const btnMiniRepeat = document.getElementById('btn-mini-repeat');
    const btnMiniShuffle = document.getElementById('btn-mini-shuffle');
    const miniIconRepeat = btnMiniRepeat.querySelector('.icon-repeat');
    const miniIconRepeat1 = btnMiniRepeat.querySelector('.icon-repeat-1');
    const repeatMode = PlayerController.getRepeatMode();
    const isShuffle = PlayerController.getIsShuffle();

    if (isShuffle) btnMiniShuffle.classList.add('active-state');
    else btnMiniShuffle.classList.remove('active-state');
    if (repeatMode === 0) {
        btnMiniRepeat.classList.remove('active-state');
        miniIconRepeat.classList.remove('hidden'); miniIconRepeat1.classList.add('hidden');
    } else if (repeatMode === 1) {
        btnMiniRepeat.classList.add('active-state');
        miniIconRepeat.classList.remove('hidden'); miniIconRepeat1.classList.add('hidden');
    } else if (repeatMode === 2) {
        btnMiniRepeat.classList.add('active-state');
        miniIconRepeat.classList.add('hidden'); miniIconRepeat1.classList.remove('hidden');
    }
}

function setupEventListeners() {
    homeSongGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.song-card');
        const optionBtn = e.target.closest('.song-options-btn');
        if (optionBtn) {
            e.stopPropagation();
            const idx = optionBtn.getAttribute('data-index');
            const menu = document.getElementById(`context-menu-${idx}`);
            document.querySelectorAll('.context-menu.active').forEach(m => { if (m !== menu) m.classList.remove('active'); });
            if (menu) menu.classList.toggle('active');
            return;
        }
        if (card) {
            if (card.classList.contains('vinyl-box-card')) return;
            const songId = card.getAttribute('data-id');
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
        uploadModal, uploadForm, uploadAudio, uploadLrc, uploadCover, uploadTitle, uploadArtist, showToast, homeSongGrid,
        setupBoxExpansionListeners: (boxes) => setupBoxExpansionListeners(homeSongGrid, boxes, openPlayer, syncPlayerControlsUI)
    });

    if (editAudio) {
        editAudio.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file || !window.jsmediatags) return;
            window.jsmediatags.read(file, {
                onSuccess: function(tag) {
                    const tags = tag.tags;
                    if (tags.title) document.getElementById('edit-title').value = tags.title;
                    if (tags.artist) document.getElementById('edit-artist').value = tags.artist;
                    if (tags.picture) {
                        try {
                            const { data, format } = tags.picture;
                            const blob = new Blob([new Uint8Array(data)], { type: format });
                            const imgFile = new File([blob], "cover.jpg", { type: format });
                            const dt = new DataTransfer();
                            dt.items.add(imgFile);
                            editCover.files = dt.files;
                        } catch (err) { console.log("Could not attach cover art", err); }
                    }
                },
                onError: (error) => console.log('Error reading tags', error)
            });
        });
    }

    btnBackHome.addEventListener('click', closePlayer);
    audio.addEventListener('ended', () => {
        if (document.body.classList.contains('is-recording')) return;
        nextTrack(true);
    });
    audio.addEventListener('pause', () => {
        if (PlayerController.getIsPlaying()) {
            PlayerController.setIsPlaying(false);
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
            coverArt.classList.remove('playing');
            if (vinylRecord) vinylRecord.classList.remove('playing');
            updateMiniPlayerUI();
        }
    });

    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', prevTrack);
    nextBtn.addEventListener('click', () => nextTrack(false));

    const btnRepeat = document.getElementById('btn-repeat');
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
        if (rm === 0) showToast("Repeat: Off");
        else if (rm === 1) showToast("Repeat: All");
        else if (rm === 2) showToast("Repeat: One");
        syncPlayerControlsUI();
    });

    const btnShuffle = document.getElementById('btn-shuffle');
    btnShuffle.addEventListener('click', () => {
        const currentTrack = getPlaybackSource()[PlayerController.getCurrentTrackIndex()];
        const isNowShuffle = PlayerController.toggleShuffle();
        if (isNowShuffle) {
            if (PlayerController.getRepeatMode() === 0) showToast("Shuffle: On (Playing Library)");
            else showToast("Shuffle: On (Playing Playlist)");
        } else {
            const newSource = getPlaybackSource();
            if (currentTrack) {
                const newIdx = newSource.findIndex(s => s.id === currentTrack.id);
                if (newIdx !== -1) PlayerController.setCurrentTrackIndex(newIdx);
            }
            showToast("Shuffle: Off");
        }
        syncPlayerControlsUI();
    });

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
            audio.currentTime = targetTime;
            if (!PlayerController.getIsPlaying()) updateProgress();
        }
        isDraggingSlider = false;
    });

    const miniSlider = document.getElementById('mini-progress-slider');
    const miniCenter = document.querySelector('.mini-center');
    if (miniSlider) {
        if (miniCenter) {
            miniCenter.addEventListener('click', (e) => e.stopPropagation());
            miniCenter.addEventListener('mousedown', (e) => e.stopPropagation());
            miniCenter.addEventListener('mouseup', (e) => e.stopPropagation());
        }
        
        miniSlider.addEventListener('input', (e) => {
            isDraggingMiniSlider = true;
            const percent = e.target.value;
            drawMiniWaveform(percent);
            if (!isNaN(audio.duration)) prepareLyricNearTime((percent / 100) * audio.duration);
        });

        miniSlider.addEventListener('change', (e) => {
            if (!isNaN(audio.duration)) {
                const targetTime = (e.target.value / 100) * audio.duration;
                prepareLyricNearTime(targetTime);
                audio.currentTime = targetTime;
                if (!PlayerController.getIsPlaying()) updateProgress();
            }
            isDraggingMiniSlider = false;
        });
    }

    volumeSlider.addEventListener('input', (e) => {
        const val = e.target.value / 100;
        audio.volume = val;
        isMuted = (val === 0);
        updateVolumeIcon(val);
    });

    if (btnMute) {
        btnMute.addEventListener('click', () => {
            isMuted = !isMuted;
            if (isMuted) {
                lastVolume = audio.volume > 0 ? audio.volume : 0.8;
                audio.volume = 0; volumeSlider.value = 0; updateVolumeIcon(0);
            } else {
                audio.volume = lastVolume; volumeSlider.value = lastVolume * 100; updateVolumeIcon(lastVolume);
            }
        });
    }

    btnToggleDrift.addEventListener('click', () => { driftContainer.classList.toggle('hidden'); });
    driftSlider.addEventListener('input', (e) => {
        const dr = parseFloat(e.target.value);
        LyricEngine.setDriftRatio(dr);
        driftVal.textContent = dr.toFixed(3) + 'x';
        const source = getPlaybackSource();
        const cti = PlayerController.getCurrentTrackIndex();
        if (source[cti]) {
            source[cti].drift = dr;
            const trackId = source[cti].id;
            const plTrack = PlayerController.getPlaylist().find(s => s.id === trackId);
            if (plTrack) plTrack.drift = dr;
        }
        if (!PlayerController.getIsPlaying()) updateProgress();
    });
    driftSlider.addEventListener('change', () => { saveLibraryToDB(); });

    btnCinematic.addEventListener('click', () => {
        VisualizerController.enterCinematicMode(
            playerView, cinematicView, cinematicCanvas, winWidth, winHeight,
            LyricEngine.getActiveLyricIndex(), LyricEngine.getCurrentLyrics(),
            (text) => triggerCinematicLine(text, cinematicTextContainer)
        );
        // ── 7. Vignette overlay (cinematic) ────────────────────────────────
        createVignetteOverlay(cinematicView);
    });
    btnExitCinematic.addEventListener('click', () => {
        VisualizerController.exitCinematicMode(cinematicView, playerView, cinematicTextContainer);
        removeVignetteOverlay();
    });

    btnAngelic.addEventListener('click', () => {
        const currentLyrics = LyricEngine.getCurrentLyrics();
        VisualizerController.enterAngelicMode(
            playerView, angelicView,
            LyricEngine.getActiveLyricIndex(), currentLyrics,
            (index) => AngelicRenderer.showLine(index, currentLyrics[index], currentLyrics, angelicTextContainer),
            (lyricObj, index) => AngelicRenderer.prepareLine(lyricObj, index, angelicTextContainer)
        );
    });
    btnExitAngelic.addEventListener('click', () => {
        VisualizerController.exitAngelicMode(angelicView, playerView, angelicTextContainer, angelicParticleContainer);
    });

    VisualizerController.setupAutoHide();

    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => console.log(`Fullscreen error: ${err.message}`));
        else document.exitFullscreen();
    });

    window.addEventListener('keydown', (e) => {
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (!audio.src || audio.src.endsWith(window.location.pathname) || audio.src === '') return;
        switch (e.code) {
            case 'Space': e.preventDefault(); togglePlay(); break;
            case 'MediaPlayPause': e.preventDefault(); togglePlay(); break;
            case 'MediaTrackNext': e.preventDefault(); nextTrack(); break;
            case 'MediaTrackPrevious': e.preventDefault(); prevTrack(); break;
            case 'MediaStop': e.preventDefault(); pauseAudio(); audio.currentTime = 0; if (!PlayerController.getIsPlaying()) updateProgress(); break;
            case 'KeyB': {
                if (VisualizerController.getIsAngelicMode()) {
                    e.preventDefault();
                    const artistEl = document.getElementById('song-artist');
                    const artistName = artistEl ? artistEl.textContent.trim() : '';
                    AngelicRenderer.spawnClimaxCombo(true, angelicParticleContainer, angelicView, artistName, 1000);
                }
                break;
            }
            case 'ArrowLeft': { e.preventDefault(); const t = Math.max(0, audio.currentTime - 5); prepareLyricNearTime(t); audio.currentTime = t; if (!PlayerController.getIsPlaying()) updateProgress(); break; }
            case 'ArrowRight': { e.preventDefault(); const t = Math.min(audio.duration || 0, audio.currentTime + 5); prepareLyricNearTime(t); audio.currentTime = t; if (!PlayerController.getIsPlaying()) updateProgress(); break; }
            case 'ArrowUp': { e.preventDefault(); const v = Math.min(1, audio.volume + 0.05); audio.volume = v; volumeSlider.value = v * 100; isMuted = (v === 0); updateVolumeIcon(v); break; }
            case 'ArrowDown': { e.preventDefault(); const v = Math.max(0, audio.volume - 0.05); audio.volume = v; volumeSlider.value = v * 100; isMuted = (v === 0); updateVolumeIcon(v); break; }
        }
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.song-options-btn') && !e.target.closest('.context-menu')) {
        document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    }
});

document.getElementById('mini-player').addEventListener('click', (e) => {
    if (e.target.closest('.mini-btn')) return;
    const cti = PlayerController.getCurrentTrackIndex();
    if (cti !== -1 && !isPlayerTransitioning) {
        document.getElementById('mini-player').classList.add('hidden');
        isPlayerTransitioning = true;

        playerView.classList.remove('hidden');
        void playerView.offsetHeight;

        const currentLyrics = LyricEngine.getCurrentLyrics();
        const drift = LyricEngine.getDriftRatio();
        const currentTime = audio.currentTime || 0;
        
        LyricEngine.setActiveLyricIndex(-1);

        if (!currentLyrics || currentLyrics.length === 0 || !currentLyrics[0] || currentTime < currentLyrics[0].time * drift) {
            if (lyricsContainer) lyricsContainer.scrollTop = 0;
        } else {
            updateProgress();
        }

        playerView.classList.add('player-active');
        if (window._idleSetPlayerOpen) window._idleSetPlayerOpen(true);

        setTimeout(() => {
            homeView.classList.add('hidden');
            if (!currentLyrics || currentLyrics.length === 0 || !currentLyrics[0] || audio.currentTime < currentLyrics[0].time * LyricEngine.getDriftRatio()) {
                if (lyricsContainer) lyricsContainer.scrollTop = 0;
            }
            isPlayerTransitioning = false;
        }, 280);
    }
});
document.getElementById('btn-mini-play').addEventListener('click', () => togglePlay());
document.getElementById('btn-mini-pause').addEventListener('click', () => togglePlay());
document.getElementById('btn-mini-next').addEventListener('click', () => nextTrack(false));
document.getElementById('btn-mini-prev').addEventListener('click', prevTrack);
document.getElementById('btn-mini-repeat').addEventListener('click', () => {
    const btnRepeat = document.getElementById('btn-repeat');
    if (btnRepeat) btnRepeat.click();
    updateMiniPlayerUI();
});
document.getElementById('btn-mini-shuffle').addEventListener('click', () => {
    const btnShuffle = document.getElementById('btn-shuffle');
    if (btnShuffle) btnShuffle.click();
    updateMiniPlayerUI();
});

setupEQController();

const btnRecord = document.getElementById('btn-record');
const recordPopover = document.getElementById('record-popover');
const recordingSetupModal = document.getElementById('recording-setup-modal');
const btnCancelRecording = document.getElementById('btn-cancel-recording');
const btnConfirmRecording = document.getElementById('btn-confirm-recording');

const recordingModes = [
    { id: 'normal', label: 'Normal Player', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>' },
    { id: 'cinematic', label: 'Cinematic Mode', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>' },
    { id: 'angelic', label: 'Angelic Mode', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' }
];
let selectedRecordingMode = null;

if (btnRecord && recordPopover) {
    recordPopover.innerHTML = recordingModes.map(mode => `
        <button class="record-option-item" data-mode="${mode.id}">
            ${mode.icon}
            <span>${mode.label}</span>
        </button>
    `).join('');

    btnRecord.addEventListener('click', (e) => {
        e.stopPropagation();
        if (recordPopover.classList.contains('hidden')) {
            recordPopover.classList.remove('hidden');
            void recordPopover.offsetWidth;
            recordPopover.classList.add('active');
        } else {
            recordPopover.classList.remove('active');
            setTimeout(() => {
                recordPopover.classList.add('hidden');
            }, 200);
        }
    });

    document.addEventListener('click', (e) => {
        if (!recordPopover.classList.contains('hidden') && !e.target.closest('.record-container')) {
            recordPopover.classList.remove('active');
            setTimeout(() => recordPopover.classList.add('hidden'), 200);
        }
    });

    recordPopover.addEventListener('click', (e) => {
        const btn = e.target.closest('.record-option-item');
        if (btn) {
            selectedRecordingMode = btn.getAttribute('data-mode');
            recordPopover.classList.remove('active');
            recordPopover.classList.add('hidden');
            if (recordingSetupModal) recordingSetupModal.classList.remove('hidden');
        }
    });
}

if (btnCancelRecording && recordingSetupModal) {
    btnCancelRecording.addEventListener('click', () => recordingSetupModal.classList.add('hidden'));
}
if (btnConfirmRecording && recordingSetupModal) {
    btnConfirmRecording.addEventListener('click', () => {
        recordingSetupModal.classList.add('hidden');
        if (selectedRecordingMode) {
            document.dispatchEvent(new CustomEvent('startRecording', { detail: { mode: selectedRecordingMode } }));
        }
    });
}

document.addEventListener('startRecording', (e) => {
    const mode = e.detail?.mode || 'normal';
    startScreenRecording(mode, {
        playAudio, pauseAudio, showToast,
        getCurrentTrack: () => {
            const source = getPlaybackSource();
            return source[PlayerController.getCurrentTrackIndex()] || null;
        },
        resetPlaybackState: () => {
            pauseAudio();
            audio.currentTime = 0;
            LyricEngine.setActiveLyricIndex(-1);
            LyricEngine.renderLyrics(lyricsList, angelicTextContainer, cinematicTextContainer);
            updateProgress();
            const lc = document.getElementById('lyrics-container');
            if (lc) lc.scrollTop = 0;
            if (cinematicTextContainer) cinematicTextContainer.innerHTML = '';
            if (angelicTextContainer) angelicTextContainer.innerHTML = '';
        }
    });
});

document.addEventListener('wavr:updateLibraryOrder', (e) => {
    if (e.detail?.order !== undefined) setCachedLibraryOrder(e.detail.order);
});

function preloadAngelicAssets() {
    const dummyContainer = document.createElement('div');
    dummyContainer.style.position = 'absolute'; dummyContainer.style.top = '-9999px';
    dummyContainer.style.opacity = '0.01'; dummyContainer.style.pointerEvents = 'none';
    const branchStr = window.WavrFloral.createBranch({ angle: 0, scale: 0.1, cy: 1, flower: true }, 0, 10, 0);
    const warmUpFireText = `<div style="font-family: 'DotGothic16'; filter: url(#fireFilter); font-size: 1rem; width: 10px; height: 10px;">Prewarm</div>
                            <div style="font-family: 'Dancing Script'; font-size: 1rem; width: 10px; height: 10px;">Prewarm</div>`;
    dummyContainer.innerHTML = `<svg width="10" height="10">${branchStr}</svg>${warmUpFireText}`;
    document.body.appendChild(dummyContainer);
    setTimeout(() => { if (dummyContainer.parentNode) dummyContainer.remove(); }, 2000);
}

function preloadCinematicAssets() {
    const dummyContainer = document.createElement('div');
    dummyContainer.style.position = 'absolute'; dummyContainer.style.top = '-9999px';
    dummyContainer.style.opacity = '0.01'; dummyContainer.style.pointerEvents = 'none';
    dummyContainer.innerHTML = `
        <div class="cinematic-line-wrapper cine-enter">
            <div class="sparkle" style="animation-name: sparkle-shoot;"></div>
            <div class="cinematic-line">
                <span class="cine-word glitch-word-anim" data-text="Prewarm">Prewarm</span>
            </div>
        </div>
    `;
    document.body.appendChild(dummyContainer);
    setTimeout(() => { if (dummyContainer.parentNode) dummyContainer.remove(); }, 2000);
}

LibraryModals.init({
    renderSongGrid: () => renderSongGrid({ homeSongGrid, setupBoxExpansionListeners: (boxes) => setupBoxExpansionListeners(homeSongGrid, boxes, openPlayer, syncPlayerControlsUI) }),
    getPlaylist: () => PlayerController.getPlaylist(),
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
    playAudio,
});
LibraryModals.bindEvents();
setupMediaSession({ audio, playAudio, pauseAudio, prevTrack, nextTrack, updateProgress, prepareLyricNearTime });

async function initHome() {
    audio.volume = 0.8;
    
    const btnCloseTutorials = document.getElementById('btn-close-tutorials');
    const modalTutorials = document.getElementById('modal-tutorials');
    if (btnCloseTutorials && modalTutorials) {
        btnCloseTutorials.addEventListener('click', () => {
            modalTutorials.classList.add('hidden');
        });
    }

    const splashLoader = document.getElementById('app-splash-loader');
    const splashBar = document.getElementById('splash-progress-bar');
    const splashText = document.getElementById('splash-status-text');
    const splashPct = document.getElementById('splash-status-pct');

    const sillyLoadingJokes = [
        "Spinning vinyl records real quick...",
        "Polishing the audio waveforms...",
        "Warming up the vacuum tubes...",
        "Reticulating audio splines...",
        "Is your Wi-Fi feeling okay today?",
        "Brewing fresh sonic vibes...",
        "Cranking up the chill levels...",
        "Waking up the bass drop...",
        "Dusting off the mini player...",
        "Dusting the equalizer knobs...",
        "Checking for high frequencies..."
    ];

    const currentSplashJoke = sillyLoadingJokes[Math.floor(Math.random() * sillyLoadingJokes.length)];

    function updateSplashProgress(percent) {
        const rounded = Math.min(100, Math.max(0, Math.floor(percent)));
        if (splashBar) splashBar.style.width = `${rounded}%`;
        if (splashPct) splashPct.textContent = `${rounded}%`;
        if (splashText) splashText.textContent = currentSplashJoke;
    }

    let loadedPlaylist = [];
    try {
        updateSplashProgress(15);
        if (SupabaseService.isConfigured() && (await SupabaseService.getCurrentUser())) {
            const cloudTracks = await SupabaseService.fetchUserTracks();
            if (cloudTracks && cloudTracks.length > 0) {
                loadedPlaylist = cloudTracks.map((song) => ({
                    id: song.id,
                    title: song.title,
                    artist: song.artist,
                    lyrics: song.lrc_text || '',
                    drift: 1.0,
                    url: song.audio_url,
                    cover: song.cover_url || coverImgUrl
                }));
                PlayerController.setPlaylist(loadedPlaylist);
            }
        }
    } catch (e) { 
        console.error("Error loading library from Supabase Cloud DB", e); 
    }

    Object.assign(window.appMainContext || (window.appMainContext = {}), {
        getPlaylist: () => PlayerController.getPlaylist(),
        showToast: (msg) => showToast(msg),
        updateBoxCache: (boxes, order) => {
            updateBoxCache(boxes, order);
            renderSongGrid({ homeSongGrid, setupBoxExpansionListeners: (b) => setupBoxExpansionListeners(homeSongGrid, b, openPlayer, syncPlayerControlsUI) });
        },
        stopPlaybackForEdit: () => {
            pauseAudio();
            try { audio.currentTime = 0; } catch(e) {}
            PlayerController.setCurrentTrackIndex(-1);
            const miniPlayer = document.getElementById('mini-player');
            if (miniPlayer) miniPlayer.classList.add('hidden');
        }
    });

    await renderSongGrid({ homeSongGrid, setupBoxExpansionListeners: (boxes) => setupBoxExpansionListeners(homeSongGrid, boxes, openPlayer, syncPlayerControlsUI) });
    setupEventListeners();
    initSettings();
    BackgroundManager.init();

    initEditLibrary(PlayerController.getPlaylist(), async () => {
        clearWaveformCache();
        const updatedPlaylist = PlayerController.getPlaylist();
        
        pauseAudio();
        audio.currentTime = 0;
        PlayerController.setCurrentTrackIndex(-1);
        const miniPlayerEl = document.getElementById('mini-player');
        if (miniPlayerEl) miniPlayerEl.classList.add('hidden');

        updatedPlaylist.forEach(song => {
            if (song.url) {
                loadAndDecodeWaveform(song.url);
            }
        });

        await renderSongGrid({ homeSongGrid, setupBoxExpansionListeners: (boxes) => setupBoxExpansionListeners(homeSongGrid, boxes, openPlayer, syncPlayerControlsUI) });
    });

    const isFirstTime = !localStorage.getItem('wavr_has_visited') || loadedPlaylist.length === 0;

    if (isFirstTime) {
        updateSplashProgress(50);
        await new Promise(res => setTimeout(res, 400));
        updateSplashProgress(100);
        await new Promise(res => setTimeout(res, 200));

        if (splashLoader) splashLoader.classList.add('splash-fade-out');
        if (modalTutorials) modalTutorials.classList.remove('hidden');
        localStorage.setItem('wavr_has_visited', 'true');
    } else {
        updateSplashProgress(25);
        
        const totalTracks = loadedPlaylist.length;
        let completed = 0;
        
        const preloadPromises = loadedPlaylist.map(async (song) => {
            if (song.url) {
                try {
                    await loadAndDecodeWaveform(song.url);
                } catch (err) {
                    console.warn(`Failed to preload waveform for ${song.title}`, err);
                }
            }
            completed++;
            const pct = 25 + (completed / totalTracks) * 70;
            updateSplashProgress(pct);
        });

        await Promise.all(preloadPromises);

        updateSplashProgress(100);
        await new Promise(res => setTimeout(res, 300));
        
        if (splashLoader) splashLoader.classList.add('splash-fade-out');
    }
}

import { initCloudVaultUI } from './features/vault/CloudVaultUI.js';

preloadAngelicAssets();
preloadCinematicAssets();
initHome();
initCloudVaultUI(showToast);
requestAnimationFrame(syncLoop);
