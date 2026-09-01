/**
 * GlobalKeyHandlers.js
 * Handles global keybindings: ESC modal handling, clipboard security, and playback shortcuts.
 */
import { VisualizerController } from '../visualizer/VisualizerController.js';
import { AngelicRenderer } from '../../core/rendering/AngelicRenderer.js';

export function initGlobalKeyHandlers({
    closePlayer,
    togglePlay,
    prevTrack,
    nextTrack,
    pauseAudio,
    updateProgress,
    prepareLyricNearTime,
    volumeSlider,
    updateVolumeIcon,
    audio,
    PlayerController
}) {
    // ── 1. Global Security Rules ─────────────────────────────────────────────
    document.addEventListener('copy', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
    });
    document.addEventListener('cut', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
    });

    // ── 2. Global ESC Handler ────────────────────────────────────────────────
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
                if (closePlayer) closePlayer();
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

    // ── 3. Media & Playback Shortcuts ────────────────────────────────────────
    window.addEventListener('keydown', (e) => {
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (!audio.src || audio.src.endsWith(window.location.pathname) || audio.src === '') return;

        switch (e.code) {
            case 'Space':
            case 'MediaPlayPause':
                e.preventDefault();
                togglePlay();
                break;
            case 'MediaTrackNext':
                e.preventDefault();
                nextTrack();
                break;
            case 'MediaTrackPrevious':
                e.preventDefault();
                prevTrack();
                break;
            case 'MediaStop':
                e.preventDefault();
                pauseAudio();
                audio.currentTime = 0;
                if (!PlayerController.getIsPlaying()) updateProgress();
                break;
            case 'KeyB': {
                if (VisualizerController.getIsAngelicMode()) {
                    e.preventDefault();
                    const artistEl = document.getElementById('song-artist');
                    const artistName = artistEl ? artistEl.textContent.trim() : '';
                    const angelicParticleContainer = document.getElementById('angelic-particle-container');
                    const angelicView = document.getElementById('angelic-view');
                    AngelicRenderer.spawnClimaxCombo(true, angelicParticleContainer, angelicView, artistName, 1000);
                }
                break;
            }
            case 'ArrowLeft': {
                e.preventDefault();
                const t = Math.max(0, audio.currentTime - 5);
                prepareLyricNearTime(t);
                audio.currentTime = t;
                if (!PlayerController.getIsPlaying()) updateProgress();
                break;
            }
            case 'ArrowRight': {
                e.preventDefault();
                const t = Math.min(audio.duration || 0, audio.currentTime + 5);
                prepareLyricNearTime(t);
                audio.currentTime = t;
                if (!PlayerController.getIsPlaying()) updateProgress();
                break;
            }
            case 'ArrowUp': {
                e.preventDefault();
                const v = Math.min(1, audio.volume + 0.05);
                audio.volume = v;
                if (volumeSlider) volumeSlider.value = v * 100;
                updateVolumeIcon(v);
                break;
            }
            case 'ArrowDown': {
                e.preventDefault();
                const v = Math.max(0, audio.volume - 0.05);
                audio.volume = v;
                if (volumeSlider) volumeSlider.value = v * 100;
                updateVolumeIcon(v);
                break;
            }
        }
    });
}
