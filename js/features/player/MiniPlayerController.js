/**
 * MiniPlayerController.js
 * Controls Mini Player UI updates, interactive waveform seeking, and view transitions.
 *
 * Phase 3: setupListeners() no longer receives a raw `audio` element or
 * `PlayerController`. It now receives `engine` (PlaybackEngine) from which
 * all audio state is read, and `PlayerController` is accessed only via
 * queue accessors (getCurrentTrackIndex, getPlaybackSource, etc.) which
 * remain stable.  updateUI() still receives the full context it needs
 * through its own narrowed parameter object.
 */

import coverImgUrl from '../../../assets/images/cover.png';
import { drawMiniWaveform } from './WaveformEngine.js';
import { PLAYBACK_STATES } from '../../core/PlaybackEngine.js';

export const MiniPlayerController = {
    _isDraggingSlider: false,
    _isTransitioning:  false,

    isDragging() {
        return this._isDraggingSlider;
    },

    /**
     * @param {object} opts
     * @param {import('../../core/PlaybackEngine.js').PlaybackEngine} opts.engine
     * @param {() => any[]} opts.getPlaybackSource
     * @param {object} opts.PlayerController  – queue-only façade (index, shuffle, repeat)
     */
    updateUI({ engine, getPlaybackSource, PlayerController }) {
        const miniPlayerEl = document.getElementById('mini-player');
        if (!miniPlayerEl) return;

        const source = getPlaybackSource();
        const currentTrackIndex = PlayerController.getCurrentTrackIndex();
        const isPlaying = engine.state === PLAYBACK_STATES.PLAYING;

        if (currentTrackIndex === -1 || !source[currentTrackIndex]) {
            miniPlayerEl.classList.add('hidden');
            return;
        }

        const song = source[currentTrackIndex];
        const miniCover  = document.getElementById('mini-cover');
        const miniTitle  = document.getElementById('mini-title');
        const miniArtist = document.getElementById('mini-artist');

        if (miniCover)  miniCover.src        = song.cover  || coverImgUrl;
        if (miniTitle)  miniTitle.textContent  = song.title  || 'Unknown Title';
        if (miniArtist) miniArtist.textContent = song.artist || 'Unknown Artist';

        const btnMiniPlay  = document.getElementById('btn-mini-play');
        const btnMiniPause = document.getElementById('btn-mini-pause');
        if (btnMiniPlay && btnMiniPause) {
            if (isPlaying) {
                btnMiniPlay.classList.add('hidden');
                btnMiniPause.classList.remove('hidden');
            } else {
                btnMiniPlay.classList.remove('hidden');
                btnMiniPause.classList.add('hidden');
            }
        }

        const pct = isNaN(engine.duration) ? 0 : (engine.currentTime / engine.duration) * 100;
        drawMiniWaveform(pct);

        const btnMiniRepeat  = document.getElementById('btn-mini-repeat');
        const btnMiniShuffle = document.getElementById('btn-mini-shuffle');
        if (btnMiniRepeat) {
            const miniIconRepeat  = btnMiniRepeat.querySelector('.icon-repeat');
            const miniIconRepeat1 = btnMiniRepeat.querySelector('.icon-repeat-1');
            const repeatMode = PlayerController.getRepeatMode();

            if (repeatMode === 0) {
                btnMiniRepeat.classList.remove('active-state');
                if (miniIconRepeat)  miniIconRepeat.classList.remove('hidden');
                if (miniIconRepeat1) miniIconRepeat1.classList.add('hidden');
            } else if (repeatMode === 1) {
                btnMiniRepeat.classList.add('active-state');
                if (miniIconRepeat)  miniIconRepeat.classList.remove('hidden');
                if (miniIconRepeat1) miniIconRepeat1.classList.add('hidden');
            } else if (repeatMode === 2) {
                btnMiniRepeat.classList.add('active-state');
                if (miniIconRepeat)  miniIconRepeat.classList.add('hidden');
                if (miniIconRepeat1) miniIconRepeat1.classList.remove('hidden');
            }
        }

        if (btnMiniShuffle) {
            if (PlayerController.getIsShuffle()) {
                btnMiniShuffle.classList.add('active-state');
            } else {
                btnMiniShuffle.classList.remove('active-state');
            }
        }
    },

    /**
     * @param {object} opts
     * @param {import('../../core/PlaybackEngine.js').PlaybackEngine} opts.engine
     * @param {object} opts.PlayerController
     * @param {object} opts.LyricEngine
     * @param {() => void} opts.togglePlay
     * @param {(isAutoNext?: boolean) => void} opts.nextTrack
     * @param {() => void} opts.prevTrack
     * @param {() => void} opts.updateProgress
     * @param {(time: number) => void} opts.prepareLyricNearTime
     * @param {HTMLElement} opts.homeView
     * @param {HTMLElement} opts.playerView
     * @param {HTMLElement} opts.lyricsContainer
     * @param {() => void} opts.updateMiniPlayerUI
     */
    setupListeners({
        engine,
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
    }) {
        const miniPlayer     = document.getElementById('mini-player');
        const miniSlider     = document.getElementById('mini-progress-slider');
        const miniCenter     = document.querySelector('.mini-center');
        const btnMiniPlay    = document.getElementById('btn-mini-play');
        const btnMiniPause   = document.getElementById('btn-mini-pause');
        const btnMiniNext    = document.getElementById('btn-mini-next');
        const btnMiniPrev    = document.getElementById('btn-mini-prev');
        const btnMiniRepeat  = document.getElementById('btn-mini-repeat');
        const btnMiniShuffle = document.getElementById('btn-mini-shuffle');
        const btnRepeat      = document.getElementById('btn-repeat');
        const btnShuffle     = document.getElementById('btn-shuffle');

        if (miniPlayer) {
            miniPlayer.addEventListener('click', (e) => {
                if (e.target.closest('.mini-btn')) return;
                const cti = PlayerController.getCurrentTrackIndex();
                if (cti !== -1 && !this._isTransitioning) {
                    miniPlayer.classList.add('hidden');
                    this._isTransitioning = true;

                    playerView.classList.remove('hidden');
                    void playerView.offsetHeight;

                    const currentLyrics = LyricEngine.getCurrentLyrics();
                    const drift = LyricEngine.getDriftRatio();
                    const currentTime = engine.currentTime || 0;

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
                        if (!currentLyrics || currentLyrics.length === 0 || !currentLyrics[0] || engine.currentTime < currentLyrics[0].time * LyricEngine.getDriftRatio()) {
                            if (lyricsContainer) lyricsContainer.scrollTop = 0;
                        }
                        this._isTransitioning = false;
                    }, 280);
                }
            });
        }

        if (miniCenter) {
            miniCenter.addEventListener('click',     (e) => e.stopPropagation());
            miniCenter.addEventListener('mousedown', (e) => e.stopPropagation());
            miniCenter.addEventListener('mouseup',   (e) => e.stopPropagation());
        }

        if (miniSlider) {
            miniSlider.addEventListener('input', (e) => {
                this._isDraggingSlider = true;
                const percent = parseFloat(e.target.value);
                drawMiniWaveform(percent);
                if (!isNaN(engine.duration)) {
                    prepareLyricNearTime((percent / 100) * engine.duration);
                }
            });

            miniSlider.addEventListener('change', (e) => {
                if (!isNaN(engine.duration)) {
                    const targetTime = (parseFloat(e.target.value) / 100) * engine.duration;
                    prepareLyricNearTime(targetTime);
                    engine.seek(targetTime);
                    if (engine.isPaused) updateProgress();
                }
                this._isDraggingSlider = false;
            });
        }

        if (btnMiniPlay)  btnMiniPlay.addEventListener('click',  () => togglePlay());
        if (btnMiniPause) btnMiniPause.addEventListener('click', () => togglePlay());
        if (btnMiniNext)  btnMiniNext.addEventListener('click',  () => nextTrack(false));
        if (btnMiniPrev)  btnMiniPrev.addEventListener('click',  prevTrack);

        if (btnMiniRepeat) {
            btnMiniRepeat.addEventListener('click', () => {
                if (btnRepeat) btnRepeat.click();
                updateMiniPlayerUI();
            });
        }

        if (btnMiniShuffle) {
            btnMiniShuffle.addEventListener('click', () => {
                if (btnShuffle) btnShuffle.click();
                updateMiniPlayerUI();
            });
        }
    }
};
