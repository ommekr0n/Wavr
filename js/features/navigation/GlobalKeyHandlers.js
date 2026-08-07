/**
 * GlobalKeyHandlers.js
 * Handles global keybindings (ESC key modal closing) and copy/cut clipboard rules.
 */
import { VisualizerController } from '../visualizer/VisualizerController.js';

export function initGlobalKeyHandlers(closePlayer) {
    // ── Global Security Rules ────────────────────────────────────────────────
    document.addEventListener('copy', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
    });
    document.addEventListener('cut', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
    });

    // ── Global ESC Handler ───────────────────────────────────────────────────
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
}
