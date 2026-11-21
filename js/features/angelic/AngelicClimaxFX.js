/**
 * AngelicClimaxFX.js
 * Handles the climax combo effects: water ripple, fire text, and giant butterfly.
 */

import { GiantButterfly } from '../../core/rendering/GiantButterfly.js';

let giantButterflyCooldown = 0;
const pendingFrames = new Set();

function scheduleFrame(callback) {
    const id = requestAnimationFrame(() => {
        pendingFrames.delete(id);
        callback();
    });
    pendingFrames.add(id);
    return id;
}

function isAngelicViewActive(angelicView) {
    return Boolean(angelicView && !angelicView.classList?.contains('hidden'));
}

export const AngelicClimaxFX = {
    cancelPendingClimaxFX() {
        for (const id of pendingFrames) {
            cancelAnimationFrame(id);
        }
        pendingFrames.clear();
    },

    /**
     * Triggers the climax combo: water ripple, falling/rising artist fire text,
     * and a Giant Butterfly flyover. Enforces a 15-second cooldown.
     *
     * @param {boolean}     isAngelicMode          - Skip if mode not active
     * @param {HTMLElement} particleContainer      - #angelic-particle-container
     * @param {HTMLElement} angelicView            - #angelic-view (butterfly target)
     * @param {string}      songArtistText         - Current artist name string
     * @param {number}      [customCooldownMs=6000]- Dynamic phrase-quantized cooldown duration in ms
     */
    spawnClimaxCombo(isAngelicMode, particleContainer, angelicView, songArtistText, customCooldownMs = 6000) {
        if (!isAngelicMode || !isAngelicViewActive(angelicView)) return;

        const now = Date.now();
        if (now - giantButterflyCooldown < customCooldownMs) return;
        giantButterflyCooldown = now;

        // Stage 1 (Frame 0 - 0ms): Water Ripple
        scheduleFrame(() => {
            if (!isAngelicViewActive(angelicView) || !particleContainer) return;
            const ripple = document.createElement('div');
            ripple.className = 'water-ripple';
            particleContainer.appendChild(ripple);
            setTimeout(() => { if (ripple.parentNode) ripple.remove(); }, 4000);
        });

        // Stage 2 (Frame 1 - +16ms): Artist Fire Text (Staggered by 1 frame to prevent DOM burst)
        scheduleFrame(() => {
            if (!isAngelicViewActive(angelicView)) return;
            scheduleFrame(() => {
                if (!isAngelicViewActive(angelicView) || !particleContainer) return;
                let artistName = songArtistText || '';
                if (artistName === 'Artist Name') artistName = '';
                if (artistName !== '') {
                    const fireText = document.createElement('div');
                    fireText.className = 'artist-fire-text';
                    fireText.innerText = artistName;

                    const isDown = Math.random() > 0.5;
                    fireText.style.left          = `${10 + Math.random() * 80}%`;
                    fireText.style.animationName = isDown ? 'artist-fire-fall' : 'artist-fire-rise';

                    fireText.style.color      = 'var(--blob-1-color)';
                    fireText.style.textShadow = `0 0 12px var(--blob-2-color)`;

                    particleContainer.appendChild(fireText);
                    setTimeout(() => { if (fireText.parentNode) fireText.remove(); }, 6000);
                }
            });
        });

        // Stage 3 (Frame 2 - +32ms): Giant Butterfly (Staggered by 2 frames for 60 FPS smoothness)
        scheduleFrame(() => {
            if (!isAngelicViewActive(angelicView)) return;
            scheduleFrame(() => {
                if (!isAngelicViewActive(angelicView)) return;
                scheduleFrame(() => {
                    if (!isAngelicViewActive(angelicView)) return;
                    GiantButterfly.spawn(angelicView);
                });
            });
        });
    }
};
