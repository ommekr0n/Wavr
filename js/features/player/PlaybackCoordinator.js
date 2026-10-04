/**
 * PlaybackCoordinator.js
 * ─────────────────────────────────────────────────────────────
 * Subscribes to PlaybackEngine events and keeps all playback-
 * related UI in sync: play/pause icons, cover/vinyl animation,
 * mini-player refresh, and the RenderLoop lifecycle.
 *
 * Also translates the 'ended' state into queue advancement via
 * the provided nextTrack callback.
 *
 * Responsibilities:
 *  - PlaybackEngine statechange  → icon/class/miniPlayer/renderLoop
 *  - PlaybackEngine volumechange → (future: volume-icon sync)
 *  - PlaybackEngine ended        → nextTrack(true)
 *  - document audio.pause leak   → sync if engine says playing
 *
 * Does NOT own visual algorithms, DSP, or lyric rendering.
 */

import { PLAYBACK_STATES } from '../../core/PlaybackEngine.js';

/**
 * @param {object} opts
 * @param {import('../../core/PlaybackEngine.js').PlaybackEngine} opts.engine
 * @param {object} opts.renderLoop   – { start(), stop() } from createRenderLoop
 * @param {HTMLElement} opts.playIcon
 * @param {HTMLElement} opts.pauseIcon
 * @param {HTMLElement} opts.coverArt
 * @param {HTMLElement|null} opts.vinylRecord
 * @param {() => void} opts.updateMiniPlayerUI
 * @param {(isAutoNext?: boolean) => void} opts.nextTrack
 * @param {() => boolean} opts.isRecording  – returns true while screen recording active
 */
export function initPlaybackCoordinator({
    engine,
    renderLoop,
    playIcon,
    pauseIcon,
    coverArt,
    vinylRecord,
    updateMiniPlayerUI,
    nextTrack,
    isRecording
}) {
    function applyPlayingUI() {
        if (playIcon)  playIcon.classList.add('hidden');
        if (pauseIcon) pauseIcon.classList.remove('hidden');
        if (coverArt)  coverArt.classList.add('playing');
        if (vinylRecord) vinylRecord.classList.add('playing');
        updateMiniPlayerUI();
        renderLoop.stop();
        renderLoop.start();
    }

    function applyPausedUI() {
        if (playIcon)  playIcon.classList.remove('hidden');
        if (pauseIcon) pauseIcon.classList.add('hidden');
        if (coverArt)  coverArt.classList.remove('playing');
        if (vinylRecord) vinylRecord.classList.remove('playing');
        updateMiniPlayerUI();
        renderLoop.stop();
    }

    engine.addEventListener('statechange', (event) => {
        const { state } = event.detail;

        if (state === PLAYBACK_STATES.PLAYING) {
            applyPlayingUI();
            return;
        }

        if (state === PLAYBACK_STATES.ENDED) {
            applyPausedUI();
            if (!isRecording()) nextTrack(true);
            return;
        }

        if (
            state === PLAYBACK_STATES.PAUSED ||
            state === PLAYBACK_STATES.IDLE   ||
            state === PLAYBACK_STATES.ERROR
        ) {
            applyPausedUI();
        }
    });
}
