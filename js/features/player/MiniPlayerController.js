/**
 * MiniPlayerController.js
 * Controls Mini Player UI updates, interactive waveform seeking, and view transitions.
 */

import coverImgUrl from '../../../assets/images/cover.png';
import { drawMiniWaveform } from './WaveformEngine.js';

export const MiniPlayerController = {
    _isDraggingSlider: false,
    _isTransitioning: false,

    isDragging() {
        return this._isDraggingSlider;
    },

    updateUI({ audio, getPlaybackSource, PlayerController }) {
        const miniPlayerEl = document.getElementById('mini-player');
        if (!miniPlayerEl) return;

        const source = getPlaybackSource();
        const currentTrackIndex = PlayerController.getCurrentTrackIndex();
        const isPlaying = PlayerController.getIsPlaying();

        if (currentTrackIndex === -1 || !source[currentTrackIndex]) {
            miniPlayerEl.classList.add('hidden');
            return;
        }

        const song = source[currentTrackIndex];
        const miniCover = document.getElementById('mini-cover');
        const miniTitle = document.getElementById('mini-title');
        const miniArtist = document.getElementById('mini-artist');

        if (miniCover) miniCover.src = song.cover || coverImgUrl;
        if (miniTitle) miniTitle.textContent = song.title || 'Unknown Title';
        if (miniArtist) miniArtist.textContent = song.artist || 'Unknown Artist';

        const btnMiniPlay = document.getElementById('btn-mini-play');
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

        const pct = isNaN(audio.duration) ? 0 : (audio.currentTime / audio.duration) * 100;
        drawMiniWaveform(pct);

        const btnMiniRepeat = document.getElementById('btn-mini-repeat');
        const btnMiniShuffle = document.getElementById('btn-mini-shuffle');
        if (btnMiniRepeat) {
            const miniIconRepeat = btnMiniRepeat.querySelector('.icon-repeat');
            const miniIconRepeat1 = btnMiniRepeat.querySelector('.icon-repeat-1');
            const repeatMode = PlayerController.getRepeatMode();

            if (repeatMode === 0) {
                btnMiniRepeat.classList.remove('active-state');
                if (miniIconRepeat) miniIconRepeat.classList.remove('hidden');
                if (miniIconRepeat1) miniIconRepeat1.classList.add('hidden');
            } else if (repeatMode === 1) {
                btnMiniRepeat.classList.add('active-state');
                if (miniIconRepeat) miniIconRepeat.classList.remove('hidden');
                if (miniIconRepeat1) miniIconRepeat1.classList.add('hidden');
            } else if (repeatMode === 2) {
                btnMiniRepeat.classList.add('active-state');
                if (miniIconRepeat) miniIconRepeat.classList.add('hidden');
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

    setupListeners({
        audio,
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
        const miniPlayer = document.getElementById('mini-player');
        const miniSlider = document.getElementById('mini-progress-slider');
        const miniCenter = document.querySelector('.mini-center');
        const btnMiniPlay = document.getElementById('btn-mini-play');
        const btnMiniPause = document.getElementById('btn-mini-pause');
        const btnMiniNext = document.getElementById('btn-mini-next');
        const btnMiniPrev = document.getElementById('btn-mini-prev');
        const btnMiniRepeat = document.getElementById('btn-mini-repeat');
        const btnMiniShuffle = document.getElementById('btn-mini-shuffle');
        const btnRepeat = document.getElementById('btn-repeat');
        const btnShuffle = document.getElementById('btn-shuffle');

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
                        this._isTransitioning = false;
                    }, 280);
                }
            });
        }

        if (miniCenter) {
            miniCenter.addEventListener('click', (e) => e.stopPropagation());
            miniCenter.addEventListener('mousedown', (e) => e.stopPropagation());
            miniCenter.addEventListener('mouseup', (e) => e.stopPropagation());
        }

        if (miniSlider) {
            miniSlider.addEventListener('input', (e) => {
                this._isDraggingSlider = true;
                const percent = parseFloat(e.target.value);
                drawMiniWaveform(percent);
                if (!isNaN(audio.duration)) {
                    prepareLyricNearTime((percent / 100) * audio.duration);
                }
            });

            miniSlider.addEventListener('change', (e) => {
                if (!isNaN(audio.duration)) {
                    const targetTime = (parseFloat(e.target.value) / 100) * audio.duration;
                    prepareLyricNearTime(targetTime);
                    audio.currentTime = targetTime;
                    if (!PlayerController.getIsPlaying()) updateProgress();
                }
                this._isDraggingSlider = false;
            });
        }

        if (btnMiniPlay) btnMiniPlay.addEventListener('click', () => togglePlay());
        if (btnMiniPause) btnMiniPause.addEventListener('click', () => togglePlay());
        if (btnMiniNext) btnMiniNext.addEventListener('click', () => nextTrack(false));
        if (btnMiniPrev) btnMiniPrev.addEventListener('click', prevTrack);

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
