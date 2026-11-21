import { AngelicRenderer } from '../../core/rendering/AngelicRenderer.js';
import { PlayerController } from './PlayerController.js';
import { LyricEngine } from '../lyrics/LyricEngine.js';
import { VisualizerController } from '../visualizer/VisualizerController.js';
import { MiniPlayerController } from './MiniPlayerController.js';
import { setupRecordingController } from './RecordingModalController.js';
import { initGlobalKeyHandlers } from '../navigation/GlobalKeyHandlers.js';
import { setupSongCardDropHandler } from '../library/SongCardDropHandler.js';
import { setupUploadHandler } from '../library/UploadHandler.js';
import { setupBoxExpansionListeners } from '../library/HomeBoxExpansion.js';
import { playLibraryTrack } from '../library/LibraryTrackSelection.js';
import { saveLibraryToDB, setCachedLibraryOrder } from '../library/HomeGridRenderer.js';
import { triggerCinematicLine } from '../visualizer/CinematicTextRenderer.js';
import { createVignetteOverlay, removeVignetteOverlay } from '../visualizer/VisualFX.js';
import { showToast } from '../../modules/toast-service.js';

/**
 * Binds all player, library, visualizer, mini-player, recording, and keyboard event listeners.
 * @param {object} deps - Runtime instances, controller actions, and DOM elements.
 */
export function bindPlayerEvents(deps) {
    const {
        audio,
        playbackEngine,
        playerNavigation,
        trackTransition,
        dom
    } = deps;

    const {
        homeSongGrid,
        btnAddSong,
        btnCloseModal,
        uploadModal,
        uploadForm,
        uploadAudio,
        uploadLrc,
        uploadCover,
        uploadTitle,
        uploadArtist,
        editAudio,
        editCover,
        btnBackHome,
        playBtn,
        prevBtn,
        nextBtn,
        progressSlider,
        progressBarFill,
        progressThumb,
        lyricsList,
        volumeSlider,
        btnMute,
        btnToggleDrift,
        driftContainer,
        driftSlider,
        driftVal,
        btnCinematic,
        btnExitCinematic,
        playerView,
        cinematicView,
        cinematicTextContainer,
        btnAngelic,
        btnExitAngelic,
        angelicView,
        angelicTextContainer,
        angelicParticleContainer,
        coverArt
    } = dom;

    const {
        openPlayer,
        closePlayer,
        togglePlay,
        prevTrack,
        nextTrack,
        playAudio,
        pauseAudio,
        loadTrack,
        updateProgress,
        prepareLyricNearTime,
        updateMiniPlayerUI,
        syncPlayerControlsUI,
        updateVolumeIcon,
        setIsDraggingSlider,
        getLastVolume,
        setLastVolume,
        setIsMuted
    } = trackTransition;

    const getPlaybackSource = () => PlayerController.getPlaybackSource();

    homeSongGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.song-card');
        const optionBtn = e.target.closest('.song-options-btn');
        if (optionBtn) {
            e.stopPropagation();
            const idx = optionBtn.getAttribute('data-index');
            const menu = document.getElementById(`context-menu-${idx}`);
            document.querySelectorAll('.context-menu.active').forEach(m => {
                if (m !== menu) m.classList.remove('active');
            });
            if (menu) menu.classList.toggle('active');
            return;
        }
        if (card) {
            if (card.classList.contains('vinyl-box-card')) return;
            if (card.classList.contains('box-slider-song-card')) return;
            playLibraryTrack({ controller: PlayerController, trackId: card.getAttribute('data-id'), openPlayer });
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
                    if (tags.title) document.getElementById('edit-title').value = tags.title;
                    if (tags.artist) document.getElementById('edit-artist').value = tags.artist;
                    if (tags.picture) {
                        try {
                            const { data, format } = tags.picture;
                            const blob = new Blob([new Uint8Array(data)], { type: format });
                            const imgFile = new File([blob], 'cover.jpg', { type: format });
                            const dt = new DataTransfer();
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

    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', prevTrack);
    nextBtn.addEventListener('click', () => nextTrack(false));

    const btnRepeat = document.getElementById('btn-repeat');
    if (btnRepeat) {
        btnRepeat.addEventListener('click', () => {
            PlayerController.setRepeatMode((PlayerController.getRepeatMode() + 1) % 3);
            const rm = PlayerController.getRepeatMode();
            if (rm === 0) showToast('Repeat: Off');
            else if (rm === 1) showToast('Repeat: All');
            else if (rm === 2) showToast('Repeat: One');
            syncPlayerControlsUI();
        });
    }

    const btnShuffle = document.getElementById('btn-shuffle');
    if (btnShuffle) {
        btnShuffle.addEventListener('click', () => {
            const isNowShuffle = PlayerController.toggleShuffle();
            if (isNowShuffle) {
                showToast('Shuffle: On');
            } else {
                showToast('Shuffle: Off');
            }
            syncPlayerControlsUI();
        });
    }

    progressSlider.addEventListener('input', (e) => {
        setIsDraggingSlider(true);
        progressBarFill.style.width = `${e.target.value}%`;
        if (progressThumb) progressThumb.style.left = `${e.target.value}%`;
        if (Number.isFinite(audio.duration) && audio.duration > 0) prepareLyricNearTime((e.target.value / 100) * audio.duration);
    });
    progressSlider.addEventListener('change', (e) => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
            const targetTime = (e.target.value / 100) * audio.duration;
            prepareLyricNearTime(targetTime);
            playbackEngine.seek(targetTime);
            if (!PlayerController.getIsPlaying()) updateProgress();
        }
        setIsDraggingSlider(false);
    });

    if (lyricsList) {
        const activateLyricLine = (target) => {
            const lineEl = target?.closest?.('.am-lyric-line:not(.placeholder-line)');
            if (!lineEl || !lyricsList.contains(lineEl)) return false;
            const currentLyrics = LyricEngine.getCurrentLyrics();
            let idx = Number.parseInt(lineEl.dataset?.index, 10);
            if (!Number.isInteger(idx)) {
                const nonPlaceholders = Array.from(lyricsList.querySelectorAll('.am-lyric-line:not(.placeholder-line)'));
                idx = nonPlaceholders.indexOf(lineEl);
            }
            const lyric = currentLyrics[idx];
            if (!lyric) return false;
            AngelicRenderer.prepareLine(lyric, idx, angelicTextContainer);
            if (currentLyrics[idx + 1]) {
                AngelicRenderer.prepareLine(currentLyrics[idx + 1], idx + 1, angelicTextContainer);
            }
            playbackEngine.seek(lyric.time * LyricEngine.getDriftRatio());
            if (!PlayerController.getIsPlaying()) playAudio();
            return true;
        };
        lyricsList.addEventListener('click', (e) => activateLyricLine(e.target));
        lyricsList.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (activateLyricLine(e.target)) e.preventDefault();
        });
    }

    volumeSlider.addEventListener('input', (e) => {
        const val = e.target.value / 100;
        playbackEngine.setVolume(val);
        setIsMuted(val === 0);
        if (val > 0) setLastVolume(val);
        updateVolumeIcon(val);
    });

    playbackEngine.addEventListener('volumechange', (e) => {
        const vol = e.detail?.volume ?? playbackEngine.volume;
        setIsMuted(vol === 0);
        if (vol > 0) setLastVolume(vol);
        if (volumeSlider) volumeSlider.value = vol * 100;
        updateVolumeIcon(vol);
    });

    if (btnMute) {
        btnMute.addEventListener('click', () => {
            if (playbackEngine.volume > 0) {
                setLastVolume(playbackEngine.volume);
                setIsMuted(true);
                playbackEngine.setVolume(0);
                volumeSlider.value = 0;
                updateVolumeIcon(0);
            } else {
                const prevVol = getLastVolume();
                const restoreVol = prevVol > 0 ? prevVol : 0.8;
                setIsMuted(false);
                playbackEngine.setVolume(restoreVol);
                volumeSlider.value = restoreVol * 100;
                updateVolumeIcon(restoreVol);
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
        const cti = PlayerController.getCurrentTrackIndex();
        if (source[cti]) {
            source[cti].drift = dr;
            const trackId = source[cti].id;
            const plTrack = PlayerController.getPlaylist().find(s => s.id === trackId);
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

    MiniPlayerController.setupListeners({
        expandPlayer: () => playerNavigation.expand(),
        engine: playbackEngine,
        PlayerController,
        togglePlay,
        nextTrack,
        prevTrack,
        updateProgress,
        prepareLyricNearTime,
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

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.song-options-btn') && !e.target.closest('.context-menu')) {
            document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
        }
    });

    document.addEventListener('wavr:updateLibraryOrder', (e) => {
        if (e.detail?.order !== undefined) setCachedLibraryOrder(e.detail.order);
    });
}
