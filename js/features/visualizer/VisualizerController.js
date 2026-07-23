/**
 * VisualizerController.js
 * Manages Cinematic / Angelic view mode transitions and mouse-hide auto-timeout.
 * Extracted 1:1 from backup_prime/js/main.js (lines 156-157, 2567-2625)
 */

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

        // Resize canvas using cached values
        cinematicCanvas.width  = winWidth;
        cinematicCanvas.height = winHeight;

        // Immediately render the current lyric line
        if (activeLyricIndex !== -1 && currentLyrics[activeLyricIndex]) {
            triggerCinematicLineFn(currentLyrics[activeLyricIndex].text);
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

        // Immediately show current line, but DEFER pre-building the next line
        // to an idle frame so the mode transition frame remains buttery 60 FPS!
        if (activeLyricIndex !== -1 && currentLyrics[activeLyricIndex]) {
            showAngelicLineFn(activeLyricIndex);
            if (currentLyrics[activeLyricIndex + 1]) {
                const nextText = currentLyrics[activeLyricIndex + 1].text;
                const nextIdx  = activeLyricIndex + 1;
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(() => prepareAngelicLineFn(nextText, nextIdx));
                } else {
                    setTimeout(() => prepareAngelicLineFn(nextText, nextIdx), 50);
                }
            }
        }
    },

    /**
     * Exits Angelic Mode.
     * Extracted 1:1 from backup_prime/js/main.js lines 2607-2613.
     *
     * @param {HTMLElement} angelicView               - #angelic-view
     * @param {HTMLElement} playerView                - #player-view
     * @param {HTMLElement} angelicTextContainer      - #angelic-text-container
     * @param {HTMLElement} angelicParticleContainer  - #angelic-particle-container
     */
    exitAngelicMode(angelicView, playerView, angelicTextContainer, angelicParticleContainer) {
        isAngelicMode = false;
        angelicView.classList.add('hidden');
        playerView.classList.remove('hidden');
        angelicTextContainer.innerHTML      = '';
        angelicParticleContainer.innerHTML  = '';
    },

    /**
     * Sets up the mouse-idle auto-hide listener for Cinematic and Angelic modes.
     * Hides cursor controls after 2000ms of inactivity.
     * Extracted 1:1 from backup_prime/js/main.js lines 2616-2625.
     */
    setupAutoHide() {
        document.addEventListener('mousemove', () => {
            if (isCinematicMode || isAngelicMode) {
                document.body.classList.add('mouse-active');
                clearTimeout(mouseTimeout);
                mouseTimeout = setTimeout(() => {
                    document.body.classList.remove('mouse-active');
                }, 2000);
            }
        });
    },
};
