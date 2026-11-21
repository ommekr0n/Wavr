/**
 * main.js — App Orchestrator & Bootstrapper
 * ==========================================
 * Wires core engines (core/), feature controllers (features/), and utilities
 * into the main application entry point.
 */

import { createRenderLoop } from './core/RenderLoop.js';
import { PlaybackEngine } from './core/PlaybackEngine.js';
import { queueManager } from './core/QueueManager.js';
import { SupabaseService } from './services/SupabaseService.js';
import { createMediaPlaybackGate } from './features/vault/MediaPlaybackGate.js';
import { initMediaUrlLifecycle } from './features/vault/MediaUrlLifecycle.js';
import './floral-templates.js';

import { PlayerController, setPlaybackEngine } from './features/player/PlayerController.js';
import { LyricEngine } from './features/lyrics/LyricEngine.js';
import { setupNostalgiaMode } from './features/visualizer/NostalgiaController.js';
import { observeGraphicsAvailability } from './features/visualizer/GraphicsAvailability.js';
import { setupArtistIntro } from './features/player/ArtistIntroController.js';
import { LibraryModals } from './features/library/LibraryModals.js';
import { setupEQController } from './features/eq/EQController.js';
import { initCloudVaultUI } from './features/vault/CloudVaultUI.js';
import { initVaultSessionBoundary, clearVaultBrowserState } from './features/vault/VaultSessionBoundary.js';
import { initWaveform, drawMiniWaveform, clearWaveformCache } from './features/player/WaveformEngine.js';
import { setupMediaSession } from './features/player/MediaSessionManager.js';
import { MiniPlayerController } from './features/player/MiniPlayerController.js';
import { createPlayerViewNavigation } from './features/player/PlayerViewNavigation.js';
import { resumePlayerLyrics } from './features/player/PlayerLyricViewResume.js';
import { createPlayerProgressView } from './features/player/PlayerProgressView.js';
import { setupQueuePanel } from './features/player/QueuePanelController.js';
import { initPlaybackCoordinator } from './features/player/PlaybackCoordinator.js';
import { createTrackTransitionController } from './features/player/TrackTransitionController.js';
import { bindPlayerEvents } from './features/player/PlayerEventBindings.js';
import { initModalA11y } from './features/navigation/ModalA11yController.js';
import { setupIdleAutoHide } from './features/navigation/IdleController.js';
import { preloadAngelicAssets, preloadCinematicAssets } from './features/visualizer/AssetPreloader.js';
import { runSplashBootstrapper } from './features/splash/AppBootstrapper.js';
import { CloudSyncIndicator } from './features/vault/CloudSyncIndicator.js';
import {
    renderSongGrid, saveLibraryToDB, updateBoxCache,
    getCachedVinylBoxes, setCachedVinylBoxes, setCachedLibraryOrder
} from './features/library/HomeGridRenderer.js';
import { setupBoxExpansionListeners } from './features/library/HomeBoxExpansion.js';
import { attachParallax } from './features/visualizer/VisualFX.js';
import { initSettings, initEditLibrary } from './modules/edit-library.js';
import { BackgroundManager, clearStoredBackground } from './modules/background-manager.js';
import { showToast } from './modules/toast-service.js';
import coverImgUrl from '../assets/images/cover.png';

const $ = (id) => document.getElementById(id);
const playBtn = $('btn-play');
const audio = $('audio-player');
const dom = {
    homeView: $('home-view'), playerView: $('player-view'), uploadModal: $('upload-modal'),
    homeSongGrid: $('home-song-grid'), btnAddSong: $('btn-add-song'), btnCloseModal: $('btn-close-modal'),
    uploadForm: $('upload-form'), uploadAudio: $('upload-audio'), uploadLrc: $('upload-lrc'),
    uploadCover: $('upload-cover'), uploadTitle: $('upload-title'), uploadArtist: $('upload-artist'),
    editAudio: $('edit-audio'), editCover: $('edit-cover'), btnBackHome: $('btn-back-home'),
    coverArt: $('cover-art'), songTitleEl: $('song-title'), songArtistEl: $('song-artist'),
    lyricsContainer: $('lyrics-container'), lyricsList: $('lyrics-list'),
    playBtn, playIcon: playBtn.querySelector('.play-icon'), pauseIcon: playBtn.querySelector('.pause-icon'),
    prevBtn: $('btn-prev'), nextBtn: $('btn-next'), volumeSlider: $('volume-slider'), btnMute: $('btn-mute'),
    btnToggleDrift: $('btn-toggle-drift'), driftContainer: $('drift-container'),
    driftSlider: $('drift-slider'), driftVal: $('drift-val'),
    progressSlider: $('progress-slider'), progressBarFill: document.querySelector('.progress-bar-fill'),
    progressThumb: document.querySelector('.progress-thumb'), currentTimeEl: $('current-time'), totalTimeEl: $('total-time'),
    btnAngelic: $('btn-angelic'), angelicView: $('angelic-view'), btnExitAngelic: $('btn-exit-angelic'),
    angelicVinylArt: $('angelic-vinyl-art'), angelicTextContainer: $('angelic-text-container'),
    angelicParticleContainer: $('angelic-particle-container'), vinylRecord: document.querySelector('.vinyl-record'),
    cinematicView: $('cinematic-view'), cinematicTextContainer: $('cinematic-text-container'),
    btnCinematic: $('btn-cinematic'), btnExitCinematic: $('btn-exit-cinematic')
};

const playbackEngine = new PlaybackEngine(audio);
const mediaPlayback = createMediaPlaybackGate({
    resolve: uri => SupabaseService.resolveMediaUrl(uri),
    play: () => playbackEngine.play(),
    pause: () => playbackEngine.pause(),
    getTime: () => playbackEngine.currentTime,
    restoreTime: (time, isCurrent) => audio.addEventListener('loadedmetadata', () => {
        if (isCurrent()) playbackEngine.seek(time);
    }, { once: true })
});
setupArtistIntro({ engine: playbackEngine });
setPlaybackEngine(playbackEngine);

const getPlaybackSource = () => PlayerController.getPlaybackSource();
let syncProgressView, nostalgiaMode, playerNavigation;
const trackTransition = createTrackTransitionController({
    audio, playbackEngine, mediaPlayback, coverImgUrl, dom,
    getSyncProgressView: () => syncProgressView,
    getNostalgiaMode: () => nostalgiaMode,
    getPlayerNavigation: () => playerNavigation
});
audio.addEventListener('seeking', () => { LyricEngine.invalidateSeek(); trackTransition.updateProgress(); });

syncProgressView = createPlayerProgressView({
    playerView: dom.playerView, progressSlider: dom.progressSlider, progressBarFill: dom.progressBarFill,
    miniPlayer: $('mini-player'), miniSlider: $('mini-progress-slider'),
    isFullDragging: () => trackTransition.getIsDraggingSlider(),
    isMiniDragging: () => MiniPlayerController.isDragging(), drawMiniWaveform
});
nostalgiaMode = setupNostalgiaMode({
    audio, playerView: dom.playerView,
    togglePlay: trackTransition.togglePlay, prevTrack: trackTransition.prevTrack, nextTrack: trackTransition.nextTrack,
    seek: time => { trackTransition.prepareLyricNearTime(time); playbackEngine.seek(time); trackTransition.updateProgress(); }
});
const renderLoop = createRenderLoop({
    engine: playbackEngine, updateProgress: trackTransition.updateProgress,
    angelicView: dom.angelicView, angelicTextContainer: dom.angelicTextContainer,
    angelicParticleContainer: dom.angelicParticleContainer, cinematicTextContainer: dom.cinematicTextContainer
});
playerNavigation = createPlayerViewNavigation({
    homeView: dom.homeView, playerView: dom.playerView, miniPlayer: $('mini-player'),
    hasTrack: () => Boolean(getPlaybackSource()[PlayerController.getCurrentTrackIndex()]),
    prepareLyrics: () => resumePlayerLyrics({ engine: playbackEngine, LyricEngine, lyricsContainer: dom.lyricsContainer }),
    refreshProgress: trackTransition.updateProgress,
    setPlayerOpen: open => window._idleSetPlayerOpen?.(open)
});
window.addEventListener('pagehide', event => {
    if (!event.persisted) { playerNavigation.dispose(); renderLoop.dispose(); nostalgiaMode.dispose(); }
});
window.closePlayer = trackTransition.closePlayer;

async function initHome() {
    const renderGrid = () => renderSongGrid({
        homeSongGrid: dom.homeSongGrid,
        setupBoxExpansionListeners: (boxes) =>
            setupBoxExpansionListeners(dom.homeSongGrid, boxes, trackTransition.openPlayer, trackTransition.syncPlayerControlsUI)
    });

    playbackEngine.setVolume(0.8);
    initWaveform(audio);
    attachParallax();
    CloudSyncIndicator.init();
    initPlaybackCoordinator({
        engine: playbackEngine, renderLoop, playIcon: dom.playIcon, pauseIcon: dom.pauseIcon,
        coverArt: dom.coverArt, vinylRecord: dom.vinylRecord,
        updateMiniPlayerUI: trackTransition.updateMiniPlayerUI, nextTrack: trackTransition.nextTrack,
        isRecording: () => document.body.classList.contains('is-recording')
    });

    try {
        if (SupabaseService.isConfigured() && (await SupabaseService.getCurrentUser())) {
            const cloudTracks = await SupabaseService.fetchUserTracks();
            if (cloudTracks?.length > 0) {
                PlayerController.setPlaylist(cloudTracks.map((song) => ({
                    id: song.id, title: song.title, artist: song.artist, lyrics: song.lrc_text || '',
                    drift: 1.0, url: song.audio_url, cover: song.cover_url || coverImgUrl
                })));
            }
            const prefs = await SupabaseService.getUserPreferences();
            if (prefs) {
                if (Array.isArray(prefs.vinyl_boxes)) setCachedVinylBoxes(prefs.vinyl_boxes);
                if (Array.isArray(prefs.library_order)) setCachedLibraryOrder(prefs.library_order);
            }
        }
    } catch (e) {
        console.error('Error loading library from Supabase Cloud DB', e);
    }

    Object.assign(window.appMainContext || (window.appMainContext = {}), {
        getPlaylist: () => PlayerController.getPlaylist(),
        showToast,
        updateBoxCache: (boxes, order) => { updateBoxCache(boxes, order); renderGrid(); },
        stopPlaybackForEdit: () => {
            trackTransition.pauseAudio();
            mediaPlayback.reset();
            playbackEngine.clear();
            PlayerController.setCurrentTrackIndex(-1);
            const miniPlayer = $('mini-player');
            if (miniPlayer) miniPlayer.classList.add('hidden');
        }
    });

    initMediaUrlLifecycle({
        getTracks: () => [...new Set([...PlayerController.getPlaylist(), ...getPlaybackSource()])],
        resolve: uri => SupabaseService.resolveMediaUrl(uri),
        needsRefresh: uri => SupabaseService.mediaUrlNeedsRefresh(uri)
    });
    await renderGrid();

    bindPlayerEvents({ audio, playbackEngine, playerNavigation, trackTransition, dom });
    initModalA11y();
    setupQueuePanel({ manager: queueManager, engine: playbackEngine, playTrack: trackTransition.openPlayer, showToast });
    initSettings();
    BackgroundManager.init();
    setupEQController();
    setupIdleAutoHide();
    initEditLibrary(PlayerController.getPlaylist(), renderGrid);

    LibraryModals.init({
        renderSongGrid: renderGrid, getPlaylist: () => PlayerController.getPlaylist(), saveLibraryToDB,
        parseLyrics: (lrcText) => {
            LyricEngine.setLyrics(lrcText);
            LyricEngine.renderLyrics(dom.lyricsList, dom.angelicTextContainer, dom.cinematicTextContainer);
        },
        getCachedVinylBoxes, setCachedVinylBoxes,
        getCurrentTrackIndex: () => PlayerController.getCurrentTrackIndex(),
        pauseAudio: trackTransition.pauseAudio, loadTrack: trackTransition.loadTrack,
        updateMiniPlayerUI: trackTransition.updateMiniPlayerUI, getIsPlaying: () => PlayerController.getIsPlaying(),
        playAudio: trackTransition.playAudio, clearPlayback: () => playbackEngine.clear(),
        resetMediaGate: () => mediaPlayback.reset()
    });
    LibraryModals.bindEvents();

    setupMediaSession({
        engine: playbackEngine, playAudio: trackTransition.playAudio, pauseAudio: trackTransition.pauseAudio,
        prevTrack: trackTransition.prevTrack, nextTrack: trackTransition.nextTrack,
        updateProgress: trackTransition.updateProgress, prepareLyricNearTime: trackTransition.prepareLyricNearTime
    });
    await runSplashBootstrapper();
    observeGraphicsAvailability(showToast);
}

preloadAngelicAssets();
preloadCinematicAssets();
initVaultSessionBoundary(SupabaseService, {
    clearPrivateState: () => {
        clearVaultBrowserState();
        return Promise.allSettled([clearWaveformCache(), clearStoredBackground()]);
    },
    reload: () => window.location.reload()
});
initHome();
initCloudVaultUI(showToast);
