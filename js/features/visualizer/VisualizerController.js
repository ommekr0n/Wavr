/**
 * VisualizerController.js
 * Manages Cinematic / Angelic view mode transitions and mouse-hide auto-timeout.
 */

import { LyricEngine } from '../lyrics/LyricEngine.js';
import { cancelAngelicLyricPreparation, scheduleAngelicLyricPreparation } from '../angelic/AngelicLyricPreparation.js';
import { AngelicStaffAnimator } from '../angelic/AngelicStaffAnimator.js';
import { cancelAngelicLineTransitions } from '../angelic/AngelicLineLifecycle.js';
import { AngelicClimaxFX } from '../angelic/AngelicClimaxFX.js';

// ── Mode State ───────────────────────────────────────────────────────────────
let isCinematicMode = false;
let isAngelicMode   = false;
let isNostalgiaMode = false;
let idleTimeout     = null;

function clearIdleTimer() {
    if (idleTimeout !== null) {
        clearTimeout(idleTimeout);
        idleTimeout = null;
    }
}

function scheduleIdleHide(delayMs = 2500) {
    clearIdleTimer();
    idleTimeout = setTimeout(() => {
        idleTimeout = null;
        const playerView = document.getElementById('player-view');
        const isPlayerActive = playerView && playerView.classList.contains('player-active') && !playerView.classList.contains('hidden');
        if (isCinematicMode || isAngelicMode || isNostalgiaMode || isPlayerActive) {
            document.body.classList.add('user-idle');
            document.body.classList.remove('mouse-active');
        }
    }, delayMs);
}

export const VisualizerController = {

    // ── Getters ─────────────────────────────────────────────────────────────
    getIsCinematicMode() { return isCinematicMode; },
    getIsAngelicMode()   { return isAngelicMode; },
    getIsNostalgiaMode() { return isNostalgiaMode; },

    enterNostalgiaMode(playerView, nostalgiaView) {
        isNostalgiaMode = true;
        isCinematicMode = false;
        isAngelicMode = false;
        clearIdleTimer();
        playerView.classList.add('hidden');
        nostalgiaView.classList.remove('hidden');
    },

    exitNostalgiaMode(nostalgiaView, playerView) {
        isNostalgiaMode = false;
        clearIdleTimer();
        document.body?.classList?.remove('user-idle');
        nostalgiaView.classList.add('hidden');
        playerView.classList.remove('hidden');
        LyricEngine.setActiveLyricIndex(-1);
    },

    // ── Setters (used by orchestrator for ESC handler compatibility) ─────────
    setIsCinematicMode(val) { isCinematicMode = val; },
    setIsAngelicMode(val)   { isAngelicMode = val; },

    /**
     * Enters Cinematic Mode.
     *
     * @param {HTMLElement} playerView        - #player-view
     * @param {HTMLElement} cinematicView     - #cinematic-view
     * @param {number}      activeLyricIndex  - Current active lyric index
     * @param {object[]}    currentLyrics     - Parsed lyrics array
     * @param {function}    triggerCinematicLineFn - Callback to render the current line
     */
    enterCinematicMode(playerView, cinematicView, activeLyricIndex, currentLyrics, triggerCinematicLineFn) {
        isCinematicMode = true;
        isAngelicMode   = false;

        playerView.classList.add('hidden');
        cinematicView.classList.remove('hidden');
        document.body?.classList?.remove('user-idle');
        document.body?.classList?.add('mouse-active');

        scheduleIdleHide(2000);

        LyricEngine.setActiveLyricIndex(-1);

        if (activeLyricIndex !== -1 && currentLyrics[activeLyricIndex]) {
            triggerCinematicLineFn(currentLyrics[activeLyricIndex]);
            LyricEngine.setActiveLyricIndex(activeLyricIndex);
            LyricEngine.invalidateCineCache();
        }
    },

    /**
     * Exits Cinematic Mode.
     *
     * @param {HTMLElement} cinematicView          - #cinematic-view
     * @param {HTMLElement} playerView             - #player-view
     * @param {HTMLElement} cinematicTextContainer - #cinematic-text-container
     */
    exitCinematicMode(cinematicView, playerView, cinematicTextContainer) {
        isCinematicMode = false;
        clearIdleTimer();
        document.body?.classList?.remove('user-idle');
        cinematicView.classList.add('hidden');
        playerView.classList.remove('hidden');
        if (cinematicTextContainer) {
            if (typeof cinematicTextContainer.replaceChildren === 'function') cinematicTextContainer.replaceChildren();
            else cinematicTextContainer.innerHTML = '';
        }
        LyricEngine.setActiveLyricIndex(-1);
    },

    /**
     * Enters Angelic Mode.
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
        document.body?.classList?.remove('user-idle');
        document.body?.classList?.add('mouse-active');

        scheduleIdleHide(2000);
        LyricEngine.setActiveLyricIndex(-1);

        if (activeLyricIndex !== -1 && currentLyrics[activeLyricIndex]) {
            showAngelicLineFn(activeLyricIndex);
            if (currentLyrics[activeLyricIndex + 1]) {
                const nextLyricObj = currentLyrics[activeLyricIndex + 1];
                const nextIdx  = activeLyricIndex + 1;
                scheduleAngelicLyricPreparation(angelicView.querySelector('#angelic-text-container'),
                    () => prepareAngelicLineFn(nextLyricObj, nextIdx),
                    nextLyricObj.time * LyricEngine.getDriftRatio() - document.getElementById('audio-player').currentTime);
            }
        }
    },

    /**
     * Exits Angelic Mode.
     *
     * @param {HTMLElement} angelicView              - #angelic-view
     * @param {HTMLElement} playerView               - #player-view
     * @param {HTMLElement} angelicTextContainer     - #angelic-text-container
     * @param {HTMLElement} angelicParticleContainer - #angelic-particle-container
     */
    exitAngelicMode(angelicView, playerView, angelicTextContainer, angelicParticleContainer) {
        isAngelicMode = false;
        clearIdleTimer();
        document.body?.classList?.remove('user-idle');
        AngelicClimaxFX.cancelPendingClimaxFX();
        cancelAngelicLyricPreparation(angelicTextContainer);
        cancelAngelicLineTransitions(angelicTextContainer);
        AngelicStaffAnimator.stop();
        angelicView.classList.add('hidden');
        angelicView.querySelectorAll?.('.giant-butterfly').forEach(el => el.remove());
        playerView.classList.remove('hidden');
        if (angelicTextContainer) {
            if (typeof angelicTextContainer.replaceChildren === 'function') angelicTextContainer.replaceChildren();
            else angelicTextContainer.innerHTML = '';
        }
        if (angelicParticleContainer) {
            if (typeof angelicParticleContainer.replaceChildren === 'function') angelicParticleContainer.replaceChildren();
            else angelicParticleContainer.innerHTML = '';
        }
        LyricEngine.setActiveLyricIndex(-1);
    },

    /**
     * Sets up the single unified mouse-idle auto-hide listener for Player View, Cinematic, and Angelic modes.
     */
    setupAutoHide() {
        document.addEventListener('mousemove', () => {
            document.body?.classList?.remove('user-idle');
            document.body.classList.add('mouse-active');
            scheduleIdleHide(2500);
        }, { passive: true });
    }
};
