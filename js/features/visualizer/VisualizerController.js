/**
 * VisualizerController.js
 * Manages Cinematic / Angelic view mode transitions and mouse-hide auto-timeout.
 * Extracted 1:1 from backup_prime/js/main.js (lines 156-157, 2567-2625)
 */

import { LyricEngine } from '../lyrics/LyricEngine.js';

// ── Mode State ───────────────────────────────────────────────────────────────
let isCinematicMode = false;
let isAngelicMode   = false;
let mouseTimeout    = null;

export const VisualizerController = {

    // ── Getters ─────────────────────────────────────────────────────────────
    getIsCinematicMode() { return isCinematicMode; },
    getIsAngelicMode()   { return isAngelicMode; },

    // ── Setters (used by orchestrator for ESC handler compatibility) ─────────
    setIsCinematicMode(val) { isCinematicMode = val; },
    setIsAngelicMode(val)   { isAngelicMode = val; },

    /**
     * Enters Cinematic Mode.
     * Extracted 1:1 from backup_prime/js/main.js lines 2567-2582.
     *
     * @param {HTMLElement} playerView        - #player-view
     * @param {HTMLElement} cinematicView     - #cinematic-view
     * @param {HTMLCanvasElement} cinematicCanvas - #cinematic-canvas
     * @param {number}      winWidth          - Cached window.innerWidth
     * @param {number}      winHeight         - Cached window.innerHeight
     * @param {number}      activeLyricIndex  - Current active lyric index
     * @param {object[]}    currentLyrics     - Parsed lyrics array
     * @param {function}    triggerCinematicLineFn - Callback to render the current line
     */
    enterCinematicMode(playerView, cinematicView, cinematicCanvas, winWidth, winHeight, activeLyricIndex, currentLyrics, triggerCinematicLineFn) {
        isCinematicMode = true;
        isAngelicMode   = false;

        playerView.classList.add('hidden');
        cinematicView.classList.remove('hidden');
        document.body.classList.add('mouse-active');

        // Start auto-hide timeout immediately on mode entrance so button fades out when idle
        clearTimeout(mouseTimeout);
        mouseTimeout = setTimeout(() => {
            document.body.classList.remove('mouse-active');
        }, 2000);

        // Resize canvas using cached values
        cinematicCanvas.width  = winWidth;
        cinematicCanvas.height = winHeight;

        // Force reset so updateHighlight re-evaluates, but set AFTER trigger
        // to prevent double-fire (which replaced wrapper 1 with wrapper 2 immediately,
        // causing enhanced LRC to miss the initial line)
        LyricEngine.setActiveLyricIndex(-1);

        // Immediately render the current lyric line — pass full object for enhanced LRC
        if (activeLyricIndex !== -1 && currentLyrics[activeLyricIndex]) {
            triggerCinematicLineFn(currentLyrics[activeLyricIndex]);
            // Re-set to real index so updateHighlight does NOT retrigger for this same line
            LyricEngine.setActiveLyricIndex(activeLyricIndex);
            // Force syncWordSpans to re-query the new wrapper's word spans
            LyricEngine.invalidateCineCache();
        }
    },

    /**
     * Exits Cinematic Mode.
     * Extracted 1:1 from backup_prime/js/main.js lines 2584-2589.
     *
     * @param {HTMLElement} cinematicView          - #cinematic-view
     * @param {HTMLElement} playerView             - #player-view
     * @param {HTMLElement} cinematicTextContainer - #cinematic-text-container
     */
    exitCinematicMode(cinematicView, playerView, cinematicTextContainer) {
        isCinematicMode = false;
        cinematicView.classList.add('hidden');
        playerView.classList.remove('hidden');
        cinematicTextContainer.innerHTML = '';
        LyricEngine.setActiveLyricIndex(-1);
    },

    /**
     * Enters Angelic Mode.
     * Extracted 1:1 from backup_prime/js/main.js lines 2591-2605.
     *
     * @param {HTMLElement} playerView           - #player-view
     * @param {HTMLElement} angelicView          - #angelic-view
     * @param {number}      activeLyricIndex     - Current active lyric index
     * @param {object[]}    currentLyrics        - Parsed lyrics array
     * @param {function}    showAngelicLineFn    - Callback(index) to activate the prebuilt line
     * @param {function}    prepareAngelicLineFn - Callback(text, index) to pre-build next line
     */
    enterAngelicMode(playerView, angelicView, activeLyricIndex, currentLyrics, showAngelicLineFn, prepareAngelicLineFn) {
        isAngelicMode   = true;
        isCinematicMode = false;

        playerView.classList.add('hidden');
        angelicView.classList.remove('hidden');
        document.body.classList.add('mouse-active');

        // Start auto-hide timeout immediately on mode entrance so button fades out when idle
        clearTimeout(mouseTimeout);
        mouseTimeout = setTimeout(() => {
            document.body.classList.remove('mouse-active');
        }, 2000);
        LyricEngine.setActiveLyricIndex(-1);

        // Immediately show current line, but DEFER pre-building the next line
        // to an idle frame so the mode transition frame remains buttery 60 FPS!
        if (activeLyricIndex !== -1 && currentLyrics[activeLyricIndex]) {
            showAngelicLineFn(activeLyricIndex);
            if (currentLyrics[activeLyricIndex + 1]) {
                const nextLyricObj = currentLyrics[activeLyricIndex + 1];
                const nextIdx  = activeLyricIndex + 1;
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(() => prepareAngelicLineFn(nextLyricObj, nextIdx));
                } else {
                    setTimeout(() => prepareAngelicLineFn(nextLyricObj, nextIdx), 50);
                }
            }
        }
    },

    /**
     * Exits Angelic Mode.
     * Extracted 1:1 from backup_prime/js/main.js lines 2607-2613.
     *
     * @param {HTMLElement} angelicView              - #angelic-view
     * @param {HTMLElement} playerView               - #player-view
     * @param {HTMLElement} angelicTextContainer     - #angelic-text-container
     * @param {HTMLElement} angelicParticleContainer - #angelic-particle-container
     */
    exitAngelicMode(angelicView, playerView, angelicTextContainer, angelicParticleContainer) {
        isAngelicMode = false;
        angelicView.classList.add('hidden');
        playerView.classList.remove('hidden');
        angelicTextContainer.innerHTML = '';
        if (angelicParticleContainer) angelicParticleContainer.innerHTML = '';
        LyricEngine.setActiveLyricIndex(-1);
    },

    /**
     * Sets up the single unified mouse-idle auto-hide listener for Player View, Cinematic, and Angelic modes.
     * Hides cursor and all top header controls simultaneously after 2000ms of inactivity.
     */
    setupAutoHide() {
        let globalIdleTimeout = null;

        document.addEventListener('mousemove', () => {
            document.body.classList.remove('user-idle');
            document.body.classList.add('mouse-active');

            clearTimeout(globalIdleTimeout);
            globalIdleTimeout = setTimeout(() => {
                const playerView = document.getElementById('player-view');
                const isPlayerActive = playerView && playerView.classList.contains('player-active') && !playerView.classList.contains('hidden');

                if (isPlayerActive || isCinematicMode || isAngelicMode) {
                    document.body.classList.add('user-idle');
                    document.body.classList.remove('mouse-active');
                }
            }, 2000);
        });
    },
};
