import { FFTAnalyzer } from '../../core/audio/FFTAnalyzer.js';
import { AngelicRenderer } from '../../core/rendering/AngelicRenderer.js';
import { scheduleAngelicLyricPreparation } from '../angelic/AngelicLyricPreparation.js';
import { PlayerController } from './PlayerController.js';
import { LyricEngine } from '../lyrics/LyricEngine.js';
import { VisualizerController } from '../visualizer/VisualizerController.js';
import { loadAndDecodeWaveform } from './WaveformEngine.js';
import { updateMediaSessionMetadata } from './MediaSessionManager.js';
import { MiniPlayerController } from './MiniPlayerController.js';
import { notifyVisualPalette } from './VisualPaletteEvent.js';
import { triggerCinematicLine, clearCinematicLine } from '../visualizer/CinematicTextRenderer.js';
import { extractColorsFromImage, loadImageForColorExtraction } from '../../modules/color-extractor.js';
import { safeImageUrl } from '../../modules/safe-html.js';

/**
 * Creates the track transition, playback transport, and progress controller.
 * @param {object} deps - Runtime dependencies and DOM references.
 * @returns {object} Controller API for playback, track loading, and UI state sync.
 */
export function createTrackTransitionController(deps) {
    const {
        audio,
        playbackEngine,
        mediaPlayback,
        coverImgUrl,
        dom,
        getSyncProgressView,
        getNostalgiaMode,
        getPlayerNavigation
    } = deps;

    const {
        btnMute,
        coverArt,
        songTitleEl,
        songArtistEl,
        angelicVinylArt,
        driftSlider,
        driftVal,
        lyricsContainer,
        lyricsList,
        angelicTextContainer,
        cinematicTextContainer,
        currentTimeEl,
        totalTimeEl
    } = dom;

    let isDraggingSlider = false;
    let lastVolume = 0.8;
    let isMuted = false;
    let lastFormattedSec = -1;
    let applyTrackVersion = 0;
    let angelicPrepareTimer = null;

    function getPlaybackSource() {
        return PlayerController.getPlaybackSource();
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
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function updateMiniPlayerUI() {
        MiniPlayerController.updateUI({ engine: playbackEngine, getPlaybackSource, PlayerController });
    }

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
            if (iconRepeat) iconRepeat.classList.remove('hidden');
            if (iconRepeat1) iconRepeat1.classList.add('hidden');
        } else if (repeatMode === 1) {
            btnRepeat.classList.add('active-state');
            if (iconRepeat) iconRepeat.classList.remove('hidden');
            if (iconRepeat1) iconRepeat1.classList.add('hidden');
        } else if (repeatMode === 2) {
            btnRepeat.classList.add('active-state');
            if (iconRepeat) iconRepeat.classList.add('hidden');
            if (iconRepeat1) iconRepeat1.classList.remove('hidden');
        }

        if (btnShuffle) {
            if (isShuffle) btnShuffle.classList.add('active-state');
            else btnShuffle.classList.remove('active-state');
        }

        updateMiniPlayerUI();
    }

    function applyTrack(track) {
        const version = ++applyTrackVersion;
        if (angelicPrepareTimer) {
            clearTimeout(angelicPrepareTimer);
            angelicPrepareTimer = null;
        }

        FFTAnalyzer.reset();
        playbackEngine.loadTrack(track);
        loadAndDecodeWaveform(track.url);

        const safeCover = safeImageUrl(track.cover, coverImgUrl);
        const cssCover = `url("${safeCover.replace(/["\\]/g, '\\$&')}")`;
        songTitleEl.textContent = track.title;
        songArtistEl.textContent = track.artist;
        coverArt.src = safeCover;
        angelicVinylArt.src = safeCover;

        const bgGlow = document.getElementById('player-bg-glow');
        if (bgGlow) bgGlow.style.backgroundImage = cssCover;
        const artGlow = document.querySelector('.am-art-glow');
        if (artGlow) artGlow.style.backgroundImage = cssCover;
        const angelicBg = document.getElementById('angelic-bg');
        if (angelicBg) angelicBg.style.backgroundImage = cssCover;

        const applyColors = (uiColors) => {
            if (version !== applyTrackVersion) return;
            const safeUI = uiColors && uiColors.length >= 4 ? uiColors : [
                { r: 0, g: 229, b: 255 }, { r: 120, g: 80, b: 255 },
                { r: 255, g: 0, b: 128 }, { r: 0, g: 255, b: 180 }
            ];
            document.documentElement.style.setProperty('--blob-1-color', `rgb(${safeUI[0].r}, ${safeUI[0].g}, ${safeUI[0].b})`);
            document.documentElement.style.setProperty('--blob-2-color', `rgb(${safeUI[1].r}, ${safeUI[1].g}, ${safeUI[1].b})`);
            document.documentElement.style.setProperty('--blob-3-color', `rgb(${safeUI[2].r}, ${safeUI[2].g}, ${safeUI[2].b})`);
            document.documentElement.style.setProperty('--blob-4-color', `rgb(${safeUI[3].r}, ${safeUI[3].g}, ${safeUI[3].b})`);
            document.documentElement.style.setProperty('--blob-1-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
            document.documentElement.style.setProperty('--blob-2-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
            document.documentElement.style.setProperty('--blob-3-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
            document.documentElement.style.setProperty('--blob-4-size', `${Math.floor(Math.random() * 20 + 30)}vw`);
            notifyVisualPalette();
        };

        if (safeCover) {
            loadImageForColorExtraction(safeCover)
                .then((image) => {
                    if (version !== applyTrackVersion) return;
                    extractColorsFromImage(image, applyColors);
                })
                .catch((err) => {
                    if (version !== applyTrackVersion) return;
                    console.warn('Color extraction image load failed, using fallback colors:', err);
                    extractColorsFromImage(null, applyColors);
                });
        }

        const driftRatio = track.drift || 1.0;
        LyricEngine.setDriftRatio(driftRatio);
        driftSlider.value = driftRatio;
        driftVal.textContent = driftRatio.toFixed(3) + 'x';

        LyricEngine.resetScroll(lyricsContainer);
        LyricEngine.setLyrics(track.lyrics);
        LyricEngine.renderLyrics(lyricsList, angelicTextContainer, cinematicTextContainer);

        const currentLyrics = LyricEngine.getCurrentLyrics();
        if (currentLyrics.length > 0) {
            angelicPrepareTimer = setTimeout(() => {
                angelicPrepareTimer = null;
                if (version !== applyTrackVersion) return;
                AngelicRenderer.prepareLine(currentLyrics[0], 0, angelicTextContainer);
                if (currentLyrics[1]) AngelicRenderer.prepareLine(currentLyrics[1], 1, angelicTextContainer);
            }, 200);
        }

        updateMediaSessionMetadata(track);
        updateMiniPlayerUI();
    }

    function loadTrack(index) {
        const source = getPlaybackSource();
        const track = source[index];
        if (!track) {
            console.warn('loadTrack: no track at index', index);
            return;
        }

        return mediaPlayback.load(track, () => applyTrack(track))
            .catch(error => console.error('Unable to load private media:', error));
    }

    function prepareLyricNearTime(time) {
        LyricEngine.prepareLyricNearTime(time, (lyricObj, idx) => {
            AngelicRenderer.prepareLine(lyricObj, idx, angelicTextContainer);
        });
    }

    function playAudio() {
        mediaPlayback.play().catch(err => {
            console.error('Play error:', err);
        });
    }

    function pauseAudio() {
        mediaPlayback.pause();
    }

    function togglePlay() {
        if (!playbackEngine.isPaused && PlayerController.getIsPlaying()) pauseAudio();
        else playAudio();
    }

    function updateProgress() {
        getNostalgiaMode()?.sync();
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const duration = audio.duration;
        const currentTime = audio.currentTime;
        const percent = (currentTime / duration) * 100;

        getSyncProgressView()?.(percent);

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
            dur => {
                if (VisualizerController.getIsAngelicMode()) AngelicRenderer.clearLine(angelicTextContainer, dur);
            }
        );
    }

    function prevTrack() {
        if (getPlaybackSource().length === 0) return;
        if (playbackEngine.currentTime > 3) {
            playbackEngine.seek(0);
            if (PlayerController.getIsPlaying()) playAudio(); else updateProgress();
            return;
        }
        if (PlayerController.getRepeatMode() === 2) { playbackEngine.seek(0); playAudio(); return; }

        PlayerController.continueInLibrary();
        const source = getPlaybackSource();

        const currentTrackIndex = PlayerController.getCurrentTrackIndex();
        if (PlayerController.getIsShuffle()) {
            let shuffledQueue = PlayerController.getShuffledQueue();
            let qIdx = shuffledQueue.indexOf(currentTrackIndex);
            if (shuffledQueue.length !== source.length || qIdx === -1) {
                PlayerController.generateShuffleQueue(false);
                shuffledQueue = PlayerController.getShuffledQueue();
                qIdx = shuffledQueue.indexOf(currentTrackIndex);
            }
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
        if (getPlaybackSource().length === 0) return;
        const repeatMode = PlayerController.getRepeatMode();
        if (repeatMode === 2) { playbackEngine.seek(0); playAudio(); return; }

        PlayerController.continueInLibrary();
        const source = getPlaybackSource();

        const currentTrackIndex = PlayerController.getCurrentTrackIndex();
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

    function openPlayer(index) {
        PlayerController.setCurrentTrackIndex(index);
        loadTrack(index);
        syncPlayerControlsUI();
        getPlayerNavigation().selectTrack();
        updateMiniPlayerUI();
        playAudio();
    }

    function closePlayer() {
        getPlayerNavigation().minimize();
        updateMiniPlayerUI();
    }

    return {
        formatTime,
        updateVolumeIcon,
        updateMiniPlayerUI,
        syncPlayerControlsUI,
        loadTrack,
        applyTrack,
        prepareLyricNearTime,
        playAudio,
        pauseAudio,
        togglePlay,
        prevTrack,
        nextTrack,
        updateProgress,
        openPlayer,
        closePlayer,
        getIsDraggingSlider: () => isDraggingSlider,
        setIsDraggingSlider: (val) => { isDraggingSlider = Boolean(val); },
        getLastVolume: () => lastVolume,
        setLastVolume: (val) => { lastVolume = val; },
        setIsMuted: (val) => { isMuted = Boolean(val); }
    };
}
