/**
 * main.js — App Orchestrator & Bootstrapper
 * ==========================================
 * Wires all modular engines (core/) and feature controllers (features/)
 * into the same execution sequence as backup_prime/js/main.js.
 *
 * This file IS the single entry point loaded by index.html via:
 *   <script type="module" src="js/main.js"></script>
 */

// ── Module Imports ───────────────────────────────────────────────────────────
import { parseLyrics } from './modules/lyric-parser.js';
import { extractColorsFromImage } from './modules/color-extractor.js';
import { DOM } from './modules/dom.js';
import { initSettings, initEditLibrary } from './modules/edit-library.js';
import { startScreenRecording } from './modules/recorder.js';
import { BackgroundManager } from './modules/background-manager.js';
import { searchLRCLIB, autoSelectBestMatch, createLrcBlob, openLrcPickerModal } from './modules/lrc-fetcher.js';
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

// ── Prevent copy/cut globally unless inside an input/textarea ────────────────
document.addEventListener('copy', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
});
document.addEventListener('cut', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
});

// ── Global ESC handler for gradual exit ──────────────────────────────────────
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // 1. Context Menu
        const activeMenu = document.querySelector('.context-menu.active');
        if (activeMenu) { activeMenu.classList.remove('active'); return; }
        // 2. Modals
        const activeModal = document.querySelector('.modal:not(.hidden), .modal-backdrop:not(.hidden)');
        if (activeModal) {
            const closeBtn = activeModal.querySelector('.close-btn, .btn-close, .btn-cancel, #btn-close-modal, .btn-create-box-cancel, [title="Close"], button[id*="cancel"]');
            if (closeBtn) closeBtn.click();
            else activeModal.classList.add('hidden');
            return;
        }
        // 2.5. Cinematic/Angelic Mode
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
        // 3. Player View
        const playerViewEl = document.getElementById('player-view');
        if (playerViewEl && !playerViewEl.classList.contains('hidden')) {
            closePlayer();
            return;
        }
        // 4. Expanded Vinyl Box
        const expandedBox = document.querySelector('.vinyl-box-card.expanded-active');
        if (expandedBox) {
            const boxCloseBtn = expandedBox.querySelector('.btn-close-box');
            if (boxCloseBtn) { boxCloseBtn.click(); return; }
        }
        // 5. Edit Library View
        const editLibraryViewEl = document.getElementById('edit-library-view');
        if (editLibraryViewEl && !editLibraryViewEl.classList.contains('hidden')) {
            const doneBtn = document.getElementById('btn-edit-done');
            if (doneBtn) { doneBtn.click(); return; }
        }
    }
});

// ── DOM Elements (exact match with prime lines 82-183) ───────────────────────
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

const editForm = document.getElementById('edit-form');
const editAudio = document.getElementById('edit-audio');
const editLrc = document.getElementById('edit-lrc');
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

// ── Orchestrator-Level State ─────────────────────────────────────────────────
// (State that stays here because it spans multiple modules or is purely UI)
let cachedVinylBoxes = [];
let cachedLibraryOrder = [];
let isDraggingSlider = false;
let isDraggingMiniSlider = false;
let animationFrameId = null;
let lastVolume = 0.8;
let isMuted = false;
let angelicParticleTimer = 0;
let isPlayerTransitioning = false;
let toastTimeout = null;

// Window Dimension Caching
let winWidth = window.innerWidth;
let winHeight = window.innerHeight;
window.addEventListener('resize', () => {
    winWidth = window.innerWidth;
    winHeight = window.innerHeight;
});

// ── IndexedDB Storage Config ─────────────────────────────────────────────────
localforage.config({
    name: 'AppleMusicClone',
    storeName: 'songs_library'
});

// ── Preload Cinematic Assets (fire.gif into RAM) ─────────────────────────────
CinematicRenderer.init();

// ══════════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS — ported 1:1 from prime, delegating to modules where possible
// ══════════════════════════════════════════════════════════════════════════════

function updateVolumeIcon(volume) {
    if (!btnMute) return;
    if (volume === 0) {
        btnMute.innerHTML = `
            <svg id="volume-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
        `;
    } else if (volume < 0.5) {
        btnMute.innerHTML = `
            <svg id="volume-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
        `;
    } else {
        btnMute.innerHTML = `
            <svg id="volume-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
        `;
    }
}

// ── Real-audio Waveform Engine for Mini-Player ───────────────────────────────
const waveformCtx = new (window.AudioContext || window.webkitAudioContext)();
const waveformCache = new Map();
let currentWaveformData = null;
let currentWaveformUrl = null;

async function loadAndDecodeWaveform(url) {
    if (!url) return;
    currentWaveformUrl = url;
    
    if (waveformCache.has(url)) {
        currentWaveformData = waveformCache.get(url);
        const pct = isNaN(audio.duration) ? 0 : (audio.currentTime / audio.duration) * 100;
        drawMiniWaveform(pct);
        return;
    }
    
    // Set subtle loading placeholder
    currentWaveformData = Array.from({ length: 140 }, (_, i) => 0.15 + Math.abs(Math.sin(i * 0.08)) * 0.15);
    drawMiniWaveform(0);
    
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await waveformCtx.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);
        const totalSamples = channelData.length;
        const numBars = 140;
        const blockSize = Math.floor(totalSamples / numBars);
        
        // Fast Sub-sampling step (step 6 samples for maximum accuracy and speed)
        const step = Math.max(1, Math.floor(blockSize / 24)); 
        const points = [];
        let maxVal = 0;
        
        for (let i = 0; i < numBars; i++) {
            let peak = 0;
            let sumSq = 0;
            let count = 0;
            const start = i * blockSize;
            const end = start + blockSize;
            
            for (let j = start; j < end; j += step) {
                const val = Math.abs(channelData[j] || 0);
                if (val > peak) peak = val; // Capture true transient kick/bass peaks!
                sumSq += val * val;
                count++;
            }
            
            const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
            // 75% Peak (for sharp drum & synth transients) + 25% RMS (for sustained body)
            const combined = peak * 0.75 + rms * 0.25;
            points.push(combined);
            if (combined > maxVal) maxVal = combined;
        }
        
        // Normalize points with a power-curve compression (0.75) for vivid dynamic contrast
        const normalizedPoints = points.map(p => {
            if (maxVal === 0) return 0.12;
            const norm = p / maxVal;
            return 0.1 + Math.pow(norm, 0.75) * 0.9;
        });
        
        waveformCache.set(url, normalizedPoints);
        if (currentWaveformUrl === url) {
            currentWaveformData = normalizedPoints;
            const pct = isNaN(audio.duration) ? 0 : (audio.currentTime / audio.duration) * 100;
            drawMiniWaveform(pct);
        }
    } catch (err) {
        console.warn("Waveform decoding failed, using dynamic fallback:", err);
        // Clean fallback
        const fallbackPoints = Array.from({ length: 140 }, (_, i) => {
            return 0.15 + Math.abs(Math.sin(i * 0.15) * Math.cos(i * 0.05)) * 0.7;
        });
        waveformCache.set(url, fallbackPoints);
        if (currentWaveformUrl === url) {
            currentWaveformData = fallbackPoints;
            const pct = isNaN(audio.duration) ? 0 : (audio.currentTime / audio.duration) * 100;
            drawMiniWaveform(pct);
        }
    }
}

function drawMiniWaveform(percent) {
    const canvas = document.getElementById('mini-waveform-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Safely measure bounding rect with sensible minimum fallback values
    const rect = canvas.getBoundingClientRect();
    const targetW = Math.max(300, Math.floor(rect.width || canvas.offsetWidth || 500));
    const targetH = Math.max(36, Math.floor(rect.height || canvas.offsetHeight || 48));
    
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }
    
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    if (!currentWaveformData || w === 0 || h === 0) return;
    
    const numBars = currentWaveformData.length;
    const gap = 1.2;
    const barWidth = (w - (numBars - 1) * gap) / numBars;
    const centerY = h * 0.5; // Perfect vertical center
    
    ctx.save();
    
    // ── BƯỚC 1: Vẽ toàn bộ Waveform dạng Mask bằng MÀU TRẮNG ĐỤC 100% ──
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < numBars; i++) {
        const factor = currentWaveformData[i];
        const x = i * (barWidth + gap);
        
        // 1. Primary Waveform (Upward)
        const mainHeight = Math.max(3, factor * h * 0.44);
        const yMain = centerY - mainHeight;
        ctx.beginPath();
        ctx.roundRect(x, yMain, barWidth, mainHeight, 1.0);
        ctx.fill();

        // 2. Reflected Waveform (Downward reflection)
        const reflectHeight = Math.max(1, factor * h * 0.22);
        const yReflect = centerY + 1.5;
        ctx.beginPath();
        ctx.roundRect(x, yReflect, barWidth, reflectHeight, 0.8);
        ctx.fill();
    }
    
    // ── BƯỚC 2: Chuyển sang chế độ source-atop ──
    // Chế độ này sẽ giữ 100% độ sáng rực rỡ của màu mới đè lên lớp trắng đục
    ctx.globalCompositeOperation = 'source-atop';
    
    // ── BƯỚC 3: Vẽ hình chữ nhật xám mờ phủ toàn bộ phần chưa phát ──
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(0, 0, w, h);
    
    // ── BƯỚC 4: Vẽ HÌNH CHỮ NHẬT COLOR GRADIENT TRƯỢT ĐÈ THEO TIẾN TRÌNH ──
    const progressWidth = (percent / 100) * w;
    if (progressWidth > 0) {
        const rootStyles = getComputedStyle(document.documentElement);
        const accentColor = rootStyles.getPropertyValue('--accent-color').trim() || '#00e5ff';
        
        const neonGradient = ctx.createLinearGradient(0, 0, w, 0);
        neonGradient.addColorStop(0, accentColor);
        neonGradient.addColorStop(1, '#a855f7');
        
        ctx.fillStyle = neonGradient;
        ctx.fillRect(0, 0, progressWidth, h);
    }
    
    // Khôi phục composite mode mặc định
    ctx.restore();
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

// ── Convenience Aliases ──────────────────────────────────────────────────────
// These delegate to PlayerController but are used extensively in the orchestrator.
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

// ── Save Library to IndexedDB ────────────────────────────────────────────────
async function saveLibraryToDB() {
    try {
        const playlist = PlayerController.getPlaylist();
        const playlistToSave = playlist.map(song => ({
            id: song.id || 'song-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
            title: song.title,
            artist: song.artist,
            lyrics: song.lyrics,
            drift: song.drift || 1.0,
            audioBlob: song.audioBlob,
            coverBlob: song.coverBlob
        }));
        await localforage.setItem('playlist', playlistToSave);
    } catch (e) {
        console.error("Error saving library to IndexedDB", e);
    }
}

// ── Render Song Grid ─────────────────────────────────────────────────────────
async function renderSongGrid() {
    homeSongGrid.innerHTML = '';
    const playlist = PlayerController.getPlaylist();

    // Use cache; only refresh from DB if cache is empty (first load)
    if (cachedVinylBoxes.length === 0 && cachedLibraryOrder.length === 0) {
        try {
            cachedVinylBoxes = await localforage.getItem('vinyl_boxes') || [];
            cachedLibraryOrder = await localforage.getItem('library_order') || [];
        } catch (e) {
            console.error("Error loading vinyl boxes or order", e);
        }
    }
    const vinylBoxes = cachedVinylBoxes;
    const libraryOrder = cachedLibraryOrder;

    // Get set of all boxed song IDs
    const boxedSongIds = new Set();
    vinylBoxes.forEach(box => {
        if (box.songIds) box.songIds.forEach(id => boxedSongIds.add(id));
    });

    const unorderedItems = [];
    vinylBoxes.forEach(box => {
        unorderedItems.push({ type: 'box', id: box.id, name: box.name, songIds: box.songIds || [], raw: box });
    });
    playlist.forEach((song, index) => {
        if (!boxedSongIds.has(song.id)) {
            unorderedItems.push({ type: 'song', id: song.id, index: index, raw: song });
        }
    });

    // Sort items according to libraryOrder
    const gridItems = [];
    const itemMap = new Map();
    unorderedItems.forEach(item => itemMap.set(item.id, item));
    libraryOrder.forEach(orderId => {
        if (itemMap.has(orderId)) { gridItems.push(itemMap.get(orderId)); itemMap.delete(orderId); }
    });
    itemMap.forEach(item => gridItems.push(item));

    gridItems.forEach(item => {
        const card = document.createElement('div');
        if (item.type === 'song') {
            const song = item.raw;
            card.className = 'song-card';
            card.setAttribute('data-index', item.index);
            card.setAttribute('data-id', song.id);
            card.innerHTML = `
                <div class="song-card-inner">
                    <img src="${song.cover || coverImgUrl}" alt="Cover">
                </div>
                <div class="song-card-title">${song.title}</div>
                <div class="song-card-artist">${song.artist}</div>
            `;
        } else {
            const box = item.raw;
            card.className = 'song-card vinyl-box-card';
            card.setAttribute('data-box-id', box.id);
            card.style.setProperty('--box-color', box.color || '#5a4232');

            const boxSongs = (box.songIds || []).map(id => playlist.find(s => s.id === id)).filter(Boolean);
            const recentSongs = [...boxSongs].slice(0, 4);

            let sleevesHTML = '';
            for (let i = 0; i < recentSongs.length; i++) {
                const song = recentSongs[i];
                const coverUrl = song.cover || coverImgUrl;
                const sleeveClass = `sleeve-${i}`;
                sleevesHTML += `<div class="peeking-sleeve ${sleeveClass}" style="background-image: url('${coverUrl}')"></div>`;
            }

            card.innerHTML = `
                <div class="song-card-inner box-card-inner" style="aspect-ratio: 1/1; margin-bottom: 15px;">
                    <div class="vinyl-box-visual" style="--box-color: ${box.color || '#5a4232'};">
                        <div class="vinyl-sleeves-container">
                            ${sleevesHTML}
                            <div class="glass-front"></div>
                        </div>
                    </div>
                </div>
                <div class="song-card-title">${box.name}</div>
                <div class="song-card-artist">${box.songIds ? box.songIds.length : 0} Tracks</div>
            `;
        }
        homeSongGrid.appendChild(card);
    });

    setupBoxExpansionListeners(vinylBoxes);
    PlayerController.setActiveQueue(playlist.filter(s => !boxedSongIds.has(s.id)));
}

// ── Cinematic Text Trigger (delegates to triggerCinematicLine in prime) ───────
function triggerCinematicLine(text) {
    if (!text) return;
    // This function builds cinematic DOM — extracted 1:1 from prime lines 1118-1236
    // Keep inline here because it references preventOrphanWords and DOM directly

    const oldLines = cinematicTextContainer.querySelectorAll('.cinematic-line-wrapper');
    oldLines.forEach(line => {
        line.classList.remove('cine-enter');
        line.classList.add('cine-exit');
        const exitingWords = line.querySelectorAll('.cine-word');
        exitingWords.forEach(w => { w.classList.add('glitched'); w.classList.remove('glitch-word-anim'); });
        const rot = (Math.random() - 0.5) * 80;
        const tx = (Math.random() - 0.5) * 60;
        line.style.setProperty('--exit-rot', `${rot}deg`);
        line.style.setProperty('--exit-tx', `${tx}vw`);
        setTimeout(() => { if (line.parentNode) line.remove(); }, 1200);
    });

    const newWrapper = document.createElement('div');
    newWrapper.className = 'cinematic-line-wrapper cine-enter';

    // Spark particles
    const sparkContainer = document.createElement('div');
    sparkContainer.className = 'sparkle-container';
    const wordCount = text.split(' ').length;
    const numSparks = Math.min(Math.max(wordCount * 3, 5), 15);
    for (let i = 0; i < numSparks; i++) {
        const spark = document.createElement('div');
        spark.className = 'sparkle';
        const colorVar = `--blob-${Math.floor(Math.random() * 4) + 1}-color`;
        spark.style.setProperty('--spark-color', `var(${colorVar})`);
        const spreadWidth = Math.min(text.length * 6, 95);
        const startX = (Math.random() - 0.5) * spreadWidth;
        const startY = (Math.random() - 0.5) * 12;
        spark.style.left = `calc(50% + ${startX}vmin)`;
        spark.style.top = `calc(50% + ${startY}vmin)`;
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 100;
        spark.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
        spark.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
        spark.style.animationDelay = `${Math.random() * 0.15}s`;
        spark.style.animationDuration = `${0.6 + Math.random() * 0.6}s`;
        sparkContainer.appendChild(spark);
    }
    newWrapper.appendChild(sparkContainer);
    setTimeout(() => { if (sparkContainer.parentNode) sparkContainer.remove(); }, 1500);

    const newLine = document.createElement('div');
    newLine.className = 'cinematic-line';

    const processedText = preventOrphanWords(text);
    const textLines = processedText.split('\n');

    textLines.forEach((lineText) => {
        const isParenthesis = lineText.trim().startsWith('(');
        const lineContainer = document.createElement('div');
        if (isParenthesis) {
            let scaleVal = 0.65;
            if (lineText.length > 35) scaleVal = 0.45;
            else if (lineText.length > 25) scaleVal = 0.55;
            lineContainer.className = 'cine-parenthesis';
            lineContainer.style.fontSize = `${scaleVal}em`;
            lineContainer.style.opacity = '0.65';
            lineContainer.style.display = 'block';
            lineContainer.style.marginTop = '6px';
            lineContainer.style.lineHeight = '1.0';
            lineContainer.style.whiteSpace = 'nowrap';
        } else {
            lineContainer.style.lineHeight = '1.1';
        }

        const words = lineText.trim().split(' ').filter(w => w.length > 0);
        const allowGlitch = words.length > 3;

        words.forEach((word, index) => {
            const span = document.createElement('span');
            if (allowGlitch && !isParenthesis) {
                span.className = 'cine-word glitch-immune';
                setTimeout(() => { if (span.parentNode) span.classList.remove('glitch-immune'); }, 1500);
            } else {
                span.className = 'cine-word';
            }
            span.textContent = word;
            span.dataset.text = word;
            lineContainer.appendChild(span);
            if (index < words.length - 1) lineContainer.appendChild(document.createTextNode(' '));
        });

        newLine.appendChild(lineContainer);
    });

    newWrapper.appendChild(newLine);
    cinematicTextContainer.appendChild(newWrapper);
}

// ── preventOrphanWords (shared utility — must stay in sync) ──────────────────
function preventOrphanWords(text) {
    if (!text) return '';
    let processedText = text.replace(/([^\n(]*?)\s*\(([^)]*)\)\s*([.,;:!?]?)\s*/g, (match, before, inside, punc) => {
        const parenthesisText = `(${inside})`;
        if (parenthesisText.length > 3) {
            const cleanBefore = before.trim() + (punc ? punc : '');
            return cleanBefore + '\n' + parenthesisText + '\n';
        }
        return before + ' ' + parenthesisText + (punc ? punc : '') + ' ';
    });
    processedText = processedText.replace(/\n+/g, '\n').trim();
    const lines = processedText.split('\n');
    const processedLines = lines.map(line => {
        const words = line.trim().split(/ +/);
        if (words.length <= 3) return line;
        const lastWords = words.splice(-3).join('\u00A0');
        return words.join(' ') + ' ' + lastWords;
    });
    return processedLines.join('\n');
}

// ── Load Track ───────────────────────────────────────────────────────────────
function loadTrack(index) {
    const source = getPlaybackSource();
    const track = source[index];
    if (!track) { console.warn('loadTrack: no track at index', index); return; }

    FFTAnalyzer.reset();
    audio.src = track.url;
    audio.load();
    
    // Start decoding real audio buffer for mini-player waveform
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

    // Extract Color for Aurora and Cinematic spotlights
    const applyColors = (uiColors, spotlightColors) => {
        document.documentElement.style.setProperty('--blob-1-color', `rgb(${uiColors[0].r}, ${uiColors[0].g}, ${uiColors[0].b})`);
        document.documentElement.style.setProperty('--blob-2-color', `rgb(${uiColors[1].r}, ${uiColors[1].g}, ${uiColors[1].b})`);
        document.documentElement.style.setProperty('--blob-3-color', `rgb(${uiColors[2].r}, ${uiColors[2].g}, ${uiColors[2].b})`);
        document.documentElement.style.setProperty('--blob-4-color', `rgb(${uiColors[3].r}, ${uiColors[3].g}, ${uiColors[3].b})`);
        document.documentElement.style.setProperty('--blob-1-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
        document.documentElement.style.setProperty('--blob-2-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
        document.documentElement.style.setProperty('--blob-3-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
        document.documentElement.style.setProperty('--blob-4-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
        CinematicRenderer.updateConcertColors(spotlightColors.map(c => [c.r, c.g, c.b]));
    };
    if (coverArt.complete) extractColorsFromImage(coverArt, applyColors);
    else coverArt.onload = () => extractColorsFromImage(coverArt, applyColors);

    // Drift
    const driftRatio = track.drift || 1.0;
    LyricEngine.setDriftRatio(driftRatio);
    driftSlider.value = driftRatio;
    driftVal.textContent = driftRatio.toFixed(3) + 'x';

    // Lyrics
    // Cancel any in-flight RAF scroll first, then reset to top.
    // Must happen BEFORE renderLyrics so no stale animation can override it.
    LyricEngine.resetScroll(lyricsContainer);
    LyricEngine.setLyrics(track.lyrics);
    LyricEngine.renderLyrics(lyricsList, angelicTextContainer, cinematicTextContainer);

    // Bind click-to-seek on each lyric line
    const currentLyrics = LyricEngine.getCurrentLyrics();
    const lines = lyricsList.querySelectorAll('.am-lyric-line');
    lines.forEach((lineEl, index) => {
        lineEl.addEventListener('click', () => {
            AngelicRenderer.prepareLine(currentLyrics[index].text, index, angelicTextContainer);
            if (currentLyrics[index + 1]) {
                AngelicRenderer.prepareLine(currentLyrics[index + 1].text, index + 1, angelicTextContainer);
            }
            audio.currentTime = currentLyrics[index].time * LyricEngine.getDriftRatio();
            if (!PlayerController.getIsPlaying()) playAudio();
        });
    });

    // Pre-build the first two angelic lines to prevent first-play lag
    if (currentLyrics.length > 0) {
        setTimeout(() => {
            AngelicRenderer.prepareLine(currentLyrics[0].text, 0, angelicTextContainer);
            if (currentLyrics[1]) AngelicRenderer.prepareLine(currentLyrics[1].text, 1, angelicTextContainer);
        }, 200);
    }

    updateMediaSession(track);
}

// ── Media Session ────────────────────────────────────────────────────────────
function updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        album: track.album || 'Wavr',
        artwork: track.cover ? [{ src: track.cover, sizes: '512x512' }] : []
    });
    navigator.mediaSession.setActionHandler('play', () => playAudio());
    navigator.mediaSession.setActionHandler('pause', () => pauseAudio());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    navigator.mediaSession.setActionHandler('stop', () => { pauseAudio(); audio.currentTime = 0; if (!PlayerController.getIsPlaying()) updateProgress(); });
    navigator.mediaSession.setActionHandler('seekbackward', (d) => {
        const newTime = Math.max(0, audio.currentTime - (d?.seekOffset ?? 10));
        prepareLyricNearTime(newTime);
        audio.currentTime = newTime;
        if (!PlayerController.getIsPlaying()) updateProgress();
    });
    navigator.mediaSession.setActionHandler('seekforward', (d) => {
        const newTime = Math.min(audio.duration || Infinity, audio.currentTime + (d?.seekOffset ?? 10));
        prepareLyricNearTime(newTime);
        audio.currentTime = newTime;
        if (!PlayerController.getIsPlaying()) updateProgress();
    });
    navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (d.seekTime != null) { prepareLyricNearTime(d.seekTime); audio.currentTime = d.seekTime; }
        if (!PlayerController.getIsPlaying()) updateProgress();
    });
    audio.addEventListener('play', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
    audio.addEventListener('pause', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
}

// ── prepareLyricNearTime (bridge to LyricEngine + AngelicRenderer) ───────────
function prepareLyricNearTime(time) {
    LyricEngine.prepareLyricNearTime(time, (text, index) => {
        AngelicRenderer.prepareLine(text, index, angelicTextContainer);
    });
}

// ── Playback Controls ────────────────────────────────────────────────────────
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

// ── Progress & Time ──────────────────────────────────────────────────────────
function updateProgress() {
    if (isNaN(audio.duration)) return;
    const duration = audio.duration;
    const currentTime = audio.currentTime;
    const percent = (currentTime / duration) * 100;

    if (!isDraggingSlider) {
        progressSlider.value = percent;
        progressBarFill.style.width = `${percent}%`;
    }

    // Sync mini-player progress elements (waveform bars)
    const miniSlider = document.getElementById('mini-progress-slider');
    if (miniSlider && !isDraggingMiniSlider) {
        miniSlider.value = percent;
        // Draw the real audio buffer waveform only when not seeking via drag
        drawMiniWaveform(percent);
    }

    currentTimeEl.textContent = formatTime(currentTime);
    totalTimeEl.textContent = formatTime(duration);

    // Delegate highlight to LyricEngine with mode-specific callbacks
    LyricEngine.updateHighlight(
        currentTime,
        lyricsList,
        lyricsContainer,
        // onAngelicShow
        (index) => {
            if (VisualizerController.getIsAngelicMode()) {
                const currentLyrics = LyricEngine.getCurrentLyrics();
                AngelicRenderer.showLine(index, currentLyrics[index]?.text, currentLyrics, angelicTextContainer);
                // AoT: pre-build the NEXT line
                if (currentLyrics[index + 1]) {
                    setTimeout(() => {
                        AngelicRenderer.prepareLine(currentLyrics[index + 1].text, index + 1, angelicTextContainer);
                    }, 50);
                }
            }
        },
        // onCinematicTrigger
        (text) => {
            if (VisualizerController.getIsCinematicMode()) {
                triggerCinematicLine(text);
            }
        }
    );
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// ── 60-FPS Sync Engine ───────────────────────────────────────────────────────
function syncLoop() {
    let intensity = 0;
    let currentAnalysis = null;
    if (PlayerController.getIsPlaying()) {
        updateProgress();

        const dataArray = AudioEngine.getByteFrequencyData();
        if (AudioEngine.getAnalyser() && dataArray) {
            currentAnalysis = FFTAnalyzer.analyze(dataArray);
            intensity = currentAnalysis.intensity;
            document.documentElement.style.setProperty('--beat-intensity', intensity.toFixed(3));

            // Angelic Mode Particle Spawner
            if (VisualizerController.getIsAngelicMode()) {
                if (intensity > 0.3) {
                    angelicParticleTimer--;
                    if (angelicParticleTimer <= 0) {
                        AngelicRenderer.spawnParticle(angelicParticleContainer, true);
                        angelicParticleTimer = 10;
                    }
                }
                if (currentAnalysis.climaxSpike) {
                    const artistEl = document.getElementById('song-artist');
                    const artistName = artistEl ? artistEl.textContent.trim() : '';
                    const quantizedCooldown = FFTAnalyzer.getQuantizedCooldownMs();
                    AngelicRenderer.spawnClimaxCombo(true, angelicParticleContainer, angelicView, artistName, quantizedCooldown);
                }
            }
        }
    }

    // Cinematic Canvas Rendering
    if (VisualizerController.getIsCinematicMode() && cinematicCanvas) {
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

// ── Open / Close Player ──────────────────────────────────────────────────────
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

    // 1. Instantly unhide homeView so it is fully rendered underneath playerView
    homeView.classList.remove('hidden');
    void homeView.offsetHeight; // force repaint

    // 2. Start sliding player-view sheet down
    playerView.classList.remove('player-active');

    // 3. Wait for the 280ms CSS slide transition to complete
    setTimeout(() => {
        playerView.classList.add('hidden');
        isPlayerTransitioning = false;

        const currentTrackIndex = PlayerController.getCurrentTrackIndex();
        if (currentTrackIndex !== -1 && PlayerController.getPlaylist()[currentTrackIndex]) {
            document.getElementById('mini-player').classList.remove('hidden');
            updateMiniPlayerUI();
        }
    }, 280); // matches the 0.28s CSS transition
}
window.closePlayer = closePlayer; // Expose for ESC handler

// ── Cursor + Header Auto-Hide on Mouse Idle ──────────────────────────────────
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

    // Use document-level mousemove — safe, no feedback loop
    document.addEventListener('mousemove', () => {
        if (_playerOpen) showControls();
    }, { passive: true });

    // Keep header visible while mouse is directly over it
    header.addEventListener('mouseenter', () => {
        if (!_playerOpen) return;
        clearTimeout(idleTimer);
        header.classList.remove('header-hidden');
    });
    header.addEventListener('mouseleave', () => {
        if (!_playerOpen) return;
        idleTimer = setTimeout(hideControls, IDLE_DELAY);
    });

    // Public API — called by open/close handlers below
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

// ── Mini Player UI ───────────────────────────────────────────────────────────
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

    // Trigger waveform redraw on miniplayer UI update
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

// ── Upload Form Handler ──────────────────────────────────────────────────────
let pendingUploadLrcBlob = null;

function handleUploadForm(e) {
    e.preventDefault();
    const playlist = PlayerController.getPlaylist();
    const audioFile = uploadAudio.files[0];
    const lrcFile = uploadLrc.files[0] || pendingUploadLrcBlob;
    let coverFile = uploadCover.files[0];
    const title = uploadTitle.value.trim() || `Song #${playlist.length + 1}`;
    const artist = uploadArtist.value.trim() || "Unknown Artist";
    if (!audioFile) { alert("Please select an Audio file."); return; }

    const audioUrl = URL.createObjectURL(audioFile);
    const processUpload = async (coverBlob, coverUrl) => {
        const createSongObject = async (lrcText) => {
            let persistBlob = coverBlob;
            if (coverBlob instanceof File) {
                const ab = await coverBlob.arrayBuffer();
                persistBlob = new Blob([ab], { type: coverBlob.type });
            }
            const newSong = {
                id: 'song-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
                title, artist, url: audioUrl, cover: coverUrl, lyrics: lrcText || '',
                drift: 1.0, audioBlob: audioFile, coverBlob: persistBlob
            };
            playlist.push(newSong);
            await saveLibraryToDB();
            await renderSongGrid();
            uploadForm.reset();
            pendingUploadLrcBlob = null;
            const uploadLrcStatus = document.getElementById('upload-lrc-status');
            if (uploadLrcStatus) uploadLrcStatus.textContent = '';
            uploadModal.classList.add('hidden');
        };

        if (lrcFile) {
            const reader = new FileReader();
            reader.onload = async function(event) {
                await createSongObject(event.target.result);
            };
            reader.readAsText(lrcFile);
        } else {
            await createSongObject('');
        }
    };

    if (coverFile) processUpload(coverFile, URL.createObjectURL(coverFile));
    else {
        fetch(coverImgUrl).then(r => r.blob()).then(blob => {
            processUpload(blob, URL.createObjectURL(blob));
        }).catch(() => processUpload(null, coverImgUrl));
    }
}

// ── Box Expansion ────────────────────────────────────────────────────────────
let activeExpandedCard = null;

function setupBoxExpansionListeners(vinylBoxes) {
    const boxCards = homeSongGrid.querySelectorAll('.vinyl-box-card');
    boxCards.forEach(card => {
        card.addEventListener('click', (e) => {
            if (card.classList.contains('expanded-active')) return;
            const boxId = card.getAttribute('data-box-id');
            toggleBoxExpansion(card, boxId, vinylBoxes);
        });
    });
}

function toggleBoxExpansion(card, boxId, vinylBoxes) {
    if (activeExpandedCard === card) { closeBoxExpansion(); return; }
    closeBoxExpansion();
    const playlist = PlayerController.getPlaylist();
    const box = vinylBoxes.find(b => b.id === boxId);
    if (!box) return;

    card.setAttribute('data-original-html', card.innerHTML);
    card.classList.add('expanded-active');
    activeExpandedCard = card;

    const boxSongs = (box.songIds || []).map(id => playlist.find(s => s.id === id)).filter(Boolean);
    let songsHTML = '';
    if (boxSongs.length === 0) {
        songsHTML = `<div style="padding: 30px 20px; color: var(--text-secondary); font-size: 0.9rem; text-align: center; width: 100%;">This vinyl box is currently empty. Go to <strong>Edit Library</strong> to add tracks.</div>`;
    } else {
        boxSongs.forEach((song, idx) => {
            songsHTML += `
                <div class="song-card box-slider-song-card" data-idx="${idx}">
                    <div class="song-cover-wrapper">
                        <img src="${song.cover || coverImgUrl}" alt="${song.title}">
                        <div class="box-song-play-overlay">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="#ffffff"><path d="M8 5v14l11-7z"></path></svg>
                        </div>
                    </div>
                    <div class="song-card-title">${song.title}</div>
                    <div class="song-card-artist">${song.artist}</div>
                </div>
            `;
        });
    }

    const boxColor = box.color || '#ffb300';
    card.innerHTML = `
        <div class="box-expansion-content">
            <div class="box-expansion-header">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <h2 class="box-expansion-title">${box.name}</h2>
                    <span class="box-track-badge" style="background: color-mix(in srgb, ${boxColor} 20%, rgba(255,255,255,0.08)); border: 1px solid color-mix(in srgb, ${boxColor} 40%, rgba(255,255,255,0.15)); color: #fff;">${boxSongs.length} Tracks</span>
                </div>
                <div class="box-expansion-controls">
                    <button class="btn-play-box glass-btn primary" style="background: ${boxColor}; color: #000; border: none; font-weight: 700; gap: 6px; padding: 8px 18px;" title="Play All Tracks in Box">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg> Play All
                    </button>
                    <button class="btn-close-box glass-btn danger" style="padding: 8px 12px;" title="Close Crate">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div class="box-expansion-slider-wrapper">
                <div class="box-expansion-slider">
                    ${songsHTML}
                </div>
            </div>
        </div>
    `;

    const closeBtn = card.querySelector('.btn-close-box');
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeBoxExpansion(); });

    const playBtnBox = card.querySelector('.btn-play-box');
    if (playBtnBox) playBtnBox.addEventListener('click', (e) => {
        e.stopPropagation();
        if (boxSongs.length > 0) {
            PlayerController.setActiveQueue([...boxSongs]);
            PlayerController.setActivePlaylistContext(box.id);
            PlayerController.setIsShuffle(true);
            PlayerController.setRepeatMode(1);
            PlayerController.generateShuffleQueue(false);
            syncPlayerControlsUI();
            openPlayer(0);
        }
    });

    const sliderSongs = card.querySelectorAll('.box-slider-song-card');
    sliderSongs.forEach(songCard => {
        songCard.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(songCard.getAttribute('data-idx'));
            PlayerController.setActiveQueue([...boxSongs]);
            PlayerController.setActivePlaylistContext(box.id);
            openPlayer(idx);
        });
    });
}

function closeBoxExpansion() {
    if (activeExpandedCard) {
        activeExpandedCard.classList.remove('expanded-active');
        const originalHTML = activeExpandedCard.getAttribute('data-original-html');
        if (originalHTML) activeExpandedCard.innerHTML = originalHTML;
        activeExpandedCard = null;
    }
}

// ── Event Listeners Setup ────────────────────────────────────────────────────
function setupEventListeners() {
    // Song grid event delegation
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
        pendingUploadLrcBlob = null;
        const uploadLrcStatus = document.getElementById('upload-lrc-status');
        if (uploadLrcStatus) uploadLrcStatus.textContent = '';
        uploadModal.classList.remove('hidden');
    });
    btnCloseModal.addEventListener('click', () => uploadModal.classList.add('hidden'));
    uploadForm.addEventListener('submit', handleUploadForm);

    const btnAutoUploadLrc = document.getElementById('btn-auto-upload-lrc');
    const btnPickUploadLrc = document.getElementById('btn-pick-upload-lrc');
    const uploadLrcStatus = document.getElementById('upload-lrc-status');

    const getSearchTargetInfo = () => {
        const audioFile = uploadAudio.files[0];
        let title = uploadTitle.value.trim();
        let artist = uploadArtist.value.trim();
        if (!title && audioFile) {
            title = audioFile.name.replace(/\.[^/.]+$/, '');
        }
        return { title, artist, audioFile };
    };

    if (btnAutoUploadLrc) {
        btnAutoUploadLrc.addEventListener('click', async () => {
            const { title, artist } = getSearchTargetInfo();
            if (!title) {
                showToast('Please enter Track Title or select Audio file first.');
                return;
            }

            btnAutoUploadLrc.disabled = true;
            btnAutoUploadLrc.innerHTML = '⚡ Searching...';
            if (uploadLrcStatus) {
                uploadLrcStatus.textContent = '🔍 Connecting to LRCLIB database...';
                uploadLrcStatus.style.color = 'var(--accent-color)';
            }

            const results = await searchLRCLIB(title, artist);
            btnAutoUploadLrc.disabled = false;
            btnAutoUploadLrc.innerHTML = '⚡ Auto Match';

            const best = autoSelectBestMatch(results);
            if (best && best.syncedLyrics) {
                pendingUploadLrcBlob = createLrcBlob(best.syncedLyrics);
                if (uploadLrcStatus) {
                    uploadLrcStatus.textContent = `✓ Auto-attached: ${best.trackName} (${best.albumName || 'Single'})`;
                    uploadLrcStatus.style.color = '#4caf50';
                }
                showToast('Lyrics auto-matched and attached from LRCLIB!');
            } else {
                pendingUploadLrcBlob = null;
                if (uploadLrcStatus) {
                    uploadLrcStatus.textContent = '❌ No online lyrics found. Please upload .lrc manually.';
                    uploadLrcStatus.style.color = '#ef5350';
                }
                showToast('No online lyrics found for this song. Please upload a .lrc file manually.');
            }
        });
    }

    if (btnPickUploadLrc) {
        btnPickUploadLrc.addEventListener('click', async () => {
            const { title, artist } = getSearchTargetInfo();
            if (!title) {
                showToast('Please enter Track Title or select Audio file first.');
                return;
            }

            btnPickUploadLrc.disabled = true;
            btnPickUploadLrc.innerHTML = '📋 Searching...';
            if (uploadLrcStatus) {
                uploadLrcStatus.textContent = '🔍 Fetching available versions from LRCLIB...';
                uploadLrcStatus.style.color = 'var(--accent-color)';
            }

            const results = await searchLRCLIB(title, artist);
            btnPickUploadLrc.disabled = false;
            btnPickUploadLrc.innerHTML = '📋 Pick Version';

            if (!results || results.length === 0) {
                if (uploadLrcStatus) {
                    uploadLrcStatus.textContent = '❌ No online lyrics found. Please upload .lrc manually.';
                    uploadLrcStatus.style.color = '#ef5350';
                }
                showToast('No online lyrics found on LRCLIB.');
                return;
            }

            openLrcPickerModal(results, (selectedItem) => {
                pendingUploadLrcBlob = createLrcBlob(selectedItem.syncedLyrics);
                if (uploadLrcStatus) {
                    uploadLrcStatus.textContent = `✓ Selected version: ${selectedItem.trackName} (${selectedItem.albumName || 'Single'})`;
                    uploadLrcStatus.style.color = '#4caf50';
                }
                showToast('Selected lyrics version attached successfully!');
            });
        });
    }

    // Auto-fill from ID3 tags
    uploadAudio.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !window.jsmediatags) return;
        window.jsmediatags.read(file, {
            onSuccess: function(tag) {
                const tags = tag.tags;
                if (tags.title) uploadTitle.value = tags.title;
                if (tags.artist) uploadArtist.value = tags.artist;
                if (tags.picture) {
                    try {
                        const { data, format } = tags.picture;
                        const blob = new Blob([new Uint8Array(data)], { type: format });
                        const imgFile = new File([blob], "cover.jpg", { type: format });
                        const dt = new DataTransfer();
                        dt.items.add(imgFile);
                        uploadCover.files = dt.files;
                    } catch (err) { console.log("Could not attach cover art", err); }
                }
            },
            onError: (error) => console.log('Error reading tags', error)
        });
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

    // Repeat Button
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

    // Shuffle Button
    const btnShuffle = document.getElementById('btn-shuffle');
    btnShuffle.addEventListener('click', () => {
        const currentTrack = getPlaybackSource()[PlayerController.getCurrentTrackIndex()];
        const isNowShuffle = PlayerController.toggleShuffle();
        if (isNowShuffle) {
            if (PlayerController.getRepeatMode() === 0) showToast("Shuffle: On (Playing Library)");
            else showToast("Shuffle: On (Playing Playlist)");
        } else {
            // Re-map currentTrackIndex after turning shuffle off
            const newSource = getPlaybackSource();
            if (currentTrack) {
                const newIdx = newSource.findIndex(s => s.id === currentTrack.id);
                if (newIdx !== -1) PlayerController.setCurrentTrackIndex(newIdx);
            }
            showToast("Shuffle: Off");
        }
        syncPlayerControlsUI();
    });

    // Progress Slider
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

    // Mini-Player Progress Slider
    const miniSlider = document.getElementById('mini-progress-slider');
    const miniCenter = document.querySelector('.mini-center');
    if (miniSlider) {
        if (miniCenter) {
            // Block all mouse interactions from bubbling to parent (which opens player)
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

    // Volume
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

    // Drift
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

    // Cinematic Mode
    btnCinematic.addEventListener('click', () => {
        VisualizerController.enterCinematicMode(
            playerView, cinematicView, cinematicCanvas, winWidth, winHeight,
            LyricEngine.getActiveLyricIndex(), LyricEngine.getCurrentLyrics(),
            triggerCinematicLine
        );
    });
    btnExitCinematic.addEventListener('click', () => {
        VisualizerController.exitCinematicMode(cinematicView, playerView, cinematicTextContainer);
    });

    // Angelic Mode
    btnAngelic.addEventListener('click', () => {
        const currentLyrics = LyricEngine.getCurrentLyrics();
        VisualizerController.enterAngelicMode(
            playerView, angelicView,
            LyricEngine.getActiveLyricIndex(), currentLyrics,
            (index) => AngelicRenderer.showLine(index, currentLyrics[index]?.text, currentLyrics, angelicTextContainer),
            (text, index) => AngelicRenderer.prepareLine(text, index, angelicTextContainer)
        );
    });
    btnExitAngelic.addEventListener('click', () => {
        VisualizerController.exitAngelicMode(angelicView, playerView, angelicTextContainer, angelicParticleContainer);
    });

    // Auto-hide mouse
    VisualizerController.setupAutoHide();

    // Fullscreen
    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => console.log(`Fullscreen error: ${err.message}`));
        else document.exitFullscreen();
    });

    // Keyboard Shortcuts
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

// ── Close menus when clicking outside ────────────────────────────────────────
document.addEventListener('click', (e) => {
    if (!e.target.closest('.song-options-btn') && !e.target.closest('.context-menu')) {
        document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    }
});

// ── Mini Player Setup ────────────────────────────────────────────────────────
document.getElementById('mini-player').addEventListener('click', (e) => {
    if (e.target.closest('.mini-btn')) return;
    const cti = PlayerController.getCurrentTrackIndex();
    if (cti !== -1 && !isPlayerTransitioning) {
        document.getElementById('mini-player').classList.add('hidden');
        isPlayerTransitioning = true;

        // 1. Instantly unhide player-view container
        playerView.classList.remove('hidden');
        
        // 2. Force layout repaint to ensure browser computes container geometry
        void playerView.offsetHeight;

        // 3. Check current lyrics status & sync scroll
        const currentLyrics = LyricEngine.getCurrentLyrics();
        const drift = LyricEngine.getDriftRatio();
        const currentTime = audio.currentTime || 0;
        
        LyricEngine.setActiveLyricIndex(-1);

        if (!currentLyrics || currentLyrics.length === 0 || !currentLyrics[0] || currentTime < currentLyrics[0].time * drift) {
            // Audio is in Intro / Instrumental section -> Force scroll straight to top (0px)
            if (lyricsContainer) lyricsContainer.scrollTop = 0;
        } else {
            // Audio is already in a lyric section -> Sync to current lyric line
            updateProgress();
        }

        // 4. Slide up the player sheet
        playerView.classList.add('player-active');
        if (window._idleSetPlayerOpen) window._idleSetPlayerOpen(true);

        // 5. Wait for the 280ms transition to complete, then safely hide home-view
        setTimeout(() => {
            homeView.classList.add('hidden');
            if (!currentLyrics || currentLyrics.length === 0 || !currentLyrics[0] || audio.currentTime < currentLyrics[0].time * LyricEngine.getDriftRatio()) {
                if (lyricsContainer) lyricsContainer.scrollTop = 0;
            }
            isPlayerTransitioning = false;
        }, 280); // matches the 0.28s CSS transition
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

// ── EQ Modal Logic ───────────────────────────────────────────────────────────
const btnEq = document.getElementById('btn-eq');
const eqModal = document.getElementById('eq-modal');
const btnCloseEq = document.getElementById('btn-close-eq');
const eqSliders = document.querySelectorAll('.eq-slider');
const eqPresets = document.getElementById('eq-presets');
const eqVals = document.querySelectorAll('.eq-val');

if (btnEq && eqModal && btnCloseEq) {
    btnEq.addEventListener('click', () => eqModal.classList.remove('hidden'));
    btnCloseEq.addEventListener('click', () => eqModal.classList.add('hidden'));
    eqModal.addEventListener('click', (e) => { if (e.target === eqModal) eqModal.classList.add('hidden'); });
}

const PRESETS = {
    default: [0, 0, 0, 0, 0], hiphop: [5, 3, 0, 2, 4], pop: [-2, 1, 4, 3, -1],
    classical: [0, 0, 0, 0, 0], bassboost: [8, 5, 0, 0, 0], electronic: [4, -1, -2, 3, 5], acoustic: [-2, -1, 3, 4, 2]
};

if (eqPresets) {
    eqPresets.addEventListener('change', (e) => {
        const preset = PRESETS[e.target.value] || PRESETS.default;
        eqSliders.forEach((slider, i) => {
            slider.value = preset[i];
            AudioEngine.setEQGain(i, preset[i]);
            eqVals[i].textContent = (preset[i] > 0 ? '+' : '') + preset[i] + 'dB';
        });
    });
}

eqSliders.forEach((slider, i) => {
    slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        AudioEngine.setEQGain(i, val);
        eqVals[i].textContent = (val > 0 ? '+' : '') + val + 'dB';
        if (eqPresets) eqPresets.value = 'default';
    });
});

// ── Screen Recording UI Logic ────────────────────────────────────────────────
const btnRecord = document.getElementById('btn-record');
const recordPopover = document.getElementById('record-popover');
const recordingSetupModal = document.getElementById('recording-setup-modal');
const btnCancelRecording = document.getElementById('btn-cancel-recording');
const btnConfirmRecording = document.getElementById('btn-confirm-recording');

const recordingModes = [
    { id: 'normal', label: 'Normal Player', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>' },
    { id: 'cinematic', label: 'Cinematic Mode', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>' },
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
        recordPopover.classList.toggle('hidden');
        requestAnimationFrame(() => recordPopover.classList.toggle('active'));
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

// ── Listen for library order updates from LibraryModals ──────────────────────
document.addEventListener('wavr:updateLibraryOrder', (e) => {
    if (e.detail?.order !== undefined) cachedLibraryOrder = e.detail.order;
});

// ── Preload Angelic & Cinematic Assets ────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
// INITIALISE LibraryModals with dependency injection
// ══════════════════════════════════════════════════════════════════════════════
LibraryModals.init({
    renderSongGrid,
    getPlaylist: () => PlayerController.getPlaylist(),
    saveLibraryToDB,
    parseLyrics: (lrcText) => {
        LyricEngine.setLyrics(lrcText);
        LyricEngine.renderLyrics(lyricsList, angelicTextContainer, cinematicTextContainer);
    },
    getCachedVinylBoxes: () => cachedVinylBoxes,
    setCachedVinylBoxes: (val) => { cachedVinylBoxes = val; },
    getCurrentTrackIndex: () => PlayerController.getCurrentTrackIndex(),
    pauseAudio,
    loadTrack,
    updateMiniPlayerUI,
    getIsPlaying: () => PlayerController.getIsPlaying(),
    playAudio,
});
LibraryModals.bindEvents();

// ══════════════════════════════════════════════════════════════════════════════
// IGNITE APPLICATION
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// IGNITE APPLICATION WITH SPLASH PRELOADER & TUTORIALS
// ══════════════════════════════════════════════════════════════════════════════
async function initHome() {
    audio.volume = 0.8;
    
    // Bind tutorial modal close button
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
        const savedPlaylist = await localforage.getItem('playlist');
        if (savedPlaylist && savedPlaylist.length > 0) {
            let needsSave = false;
            loadedPlaylist = savedPlaylist.map((song, idx) => {
                let url = song.url || '';
                let cover = song.cover || coverImgUrl;
                try {
                    if (song.audioBlob instanceof Blob) url = URL.createObjectURL(song.audioBlob);
                    if (song.coverBlob instanceof Blob) cover = URL.createObjectURL(song.coverBlob);
                } catch (blobErr) { console.warn('Blob URL error', blobErr); }
                if (!song.id) needsSave = true;
                return {
                    id: song.id || 'song-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000),
                    title: song.title, artist: song.artist, lyrics: song.lyrics,
                    drift: song.drift || 1.0, url, cover, audioBlob: song.audioBlob, coverBlob: song.coverBlob
                };
            });
            PlayerController.setPlaylist(loadedPlaylist);
            if (needsSave) await saveLibraryToDB();
        }
    } catch (e) { 
        console.error("Error loading library from IndexedDB", e); 
    }

    window.appMainContext = {
        getPlaylist: () => PlayerController.getPlaylist(),
        showToast: (msg) => showToast(msg),
        updateBoxCache: (boxes, order) => {
            cachedVinylBoxes = boxes;
            cachedLibraryOrder = order;
            renderSongGrid();
        },
        stopPlaybackForEdit: () => {
            pauseAudio();
            try { audio.currentTime = 0; } catch(e) {}
            PlayerController.setCurrentTrackIndex(-1);
            const miniPlayer = document.getElementById('mini-player');
            if (miniPlayer) miniPlayer.classList.add('hidden');
        }
    };

    await renderSongGrid();
    setupEventListeners();
    initSettings();
    BackgroundManager.init();

    initEditLibrary(PlayerController.getPlaylist(), async () => {
        try {
            const savedPlaylist = await localforage.getItem('playlist');
            if (savedPlaylist) {
                let needsSave = false;
                const playlist = savedPlaylist.map((song, idx) => {
                    let url = song.url || '';
                    let cover = song.cover || coverImgUrl;
                    try {
                        if (song.audioBlob instanceof Blob) url = URL.createObjectURL(song.audioBlob);
                        if (song.coverBlob instanceof Blob) cover = URL.createObjectURL(song.coverBlob);
                    } catch (blobErr) { console.warn('Blob URL error', blobErr); }
                    if (!song.id) needsSave = true;
                    return {
                        id: song.id || 'song-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000),
                        title: song.title, artist: song.artist, lyrics: song.lyrics,
                        drift: song.drift || 1.0, url, cover, audioBlob: song.audioBlob, coverBlob: song.coverBlob
                    };
                });
                PlayerController.setPlaylist(playlist);
                if (needsSave) await saveLibraryToDB();
            }
        } catch (e) { console.error("Error reloading library", e); }

        // Clear stale waveform cache and re-decode updated playlist Blobs
        waveformCache.clear();
        const updatedPlaylist = PlayerController.getPlaylist();
        
        // Ensure playback is completely stopped and mini-player is hidden when returning from Edit Library
        pauseAudio();
        audio.currentTime = 0;
        PlayerController.setCurrentTrackIndex(-1);
        const miniPlayerEl = document.getElementById('mini-player');
        if (miniPlayerEl) miniPlayerEl.classList.add('hidden');

        // Decode tracks in background for instant playback when user picks a song
        updatedPlaylist.forEach(song => {
            if (song.url && !waveformCache.has(song.url)) {
                loadAndDecodeWaveform(song.url);
            }
        });

        await renderSongGrid();
    });

    // ── KỊCH BẢN PRELOADER & TUTORIALS ──────────────────────────────────────
    const isFirstTime = !localStorage.getItem('wavr_has_visited') || loadedPlaylist.length === 0;

    if (isFirstTime) {
        // CASE 1: Lần đầu truy cập / Thư viện chưa có bài nhạc
        updateSplashProgress(50);
        await new Promise(res => setTimeout(res, 400));
        updateSplashProgress(100);
        await new Promise(res => setTimeout(res, 200));

        // Fade out splash loader
        if (splashLoader) splashLoader.classList.add('splash-fade-out');
        
        // Hiện Modal Tutorial hướng dẫn
        if (modalTutorials) modalTutorials.classList.remove('hidden');
        localStorage.setItem('wavr_has_visited', 'true');

    } else {
        // CASE 2: Người dùng cũ - Preload toàn bộ Waveforms từ Blobs lên RAM cache
        updateSplashProgress(25);
        
        const totalTracks = loadedPlaylist.length;
        let completed = 0;
        
        // Execute batch decoding for all tracks in library
        const preloadPromises = loadedPlaylist.map(async (song) => {
            if (song.url) {
                try {
                    await loadAndDecodeWaveform(song.url);
                } catch (err) {
                    console.warn(`Failed to preload waveform for ${song.title}`, err);
                }
            }
            completed++;
            const pct = 25 + (completed / totalTracks) * 70; // Map 25% -> 95%
            updateSplashProgress(pct);
        });

        await Promise.all(preloadPromises);

        updateSplashProgress(100);
        await new Promise(res => setTimeout(res, 300));
        
        // Fade out splash screen seamlessly
        if (splashLoader) splashLoader.classList.add('splash-fade-out');
    }
}

preloadAngelicAssets();
preloadCinematicAssets();
initHome();

// Start the engine immediately for idle rendering
requestAnimationFrame(syncLoop);
