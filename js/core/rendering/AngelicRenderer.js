/**
 * AngelicRenderer.js
 * Manages the Angelic Mode visual layer: staff SVG lines, floral branches,
 * lyric word pop-in animations, and climax combo spawning.
 *
 * Extracted 1:1 from backup_prime/js/main.js (lines 1238-1666)
 * All timing constants (40ms recording / 65ms live), normalized bezier math,
 * and object pooling logic preserved exactly.
 */

import { GiantButterfly } from './GiantButterfly.js';

// ── Object pool for musical charm particles ─────────────────────────────────
// DO NOT DELETE — prevents GC thrashing during long playback sessions
const angelicParticlePool = [];

function getParticleFromPool() {
    if (angelicParticlePool.length > 0) return angelicParticlePool.pop();
    const p = document.createElement('div');
    p.className = 'angelic-particle';
    const svgs = [
        `<svg viewBox="0 0 24 24"><use href="#icon-music-note"></use></svg>`,
        `<svg viewBox="0 0 24 24"><use href="#icon-star"></use></svg>`,
        `<svg viewBox="0 0 24 24"><use href="#icon-heart"></use></svg>`,
    ];
    p.innerHTML = svgs[Math.floor(Math.random() * svgs.length)];
    return p;
}

function releaseParticleToPool(p) {
    if (p && p.parentNode) {
        p.remove();
        if (angelicParticlePool.length < 20) angelicParticlePool.push(p);
    }
}

// ── Giant butterfly cooldown timer & line show timestamp ────────────────────
let giantButterflyCooldown = 0;
let lastLineShowTimestamp   = 0;

// ── Shared helper: prevent orphan words ─────────────────────────────────────
// (mirrors the same function in main.js exactly — must stay in sync)
function preventOrphanWords(text) {
    if (!text) return '';

    let processedText = text.replace(/([^\n(]*?)\s*\(([^)]*)\)\s*([.,;:!?]?)\s*/g, (match, before, inside, punc) => {
        const parenthesisText = `(${inside})`;
        if (parenthesisText.length > 3) {
            const cleanBefore = before.trim() + (punc ? punc : '');
            return cleanBefore + '\n' + parenthesisText + '\n';
        }
        return before + ' ' + parenthesisText + (punc ? punc : '') + ' ';
    });
    processedText = processedText.replace(/\n+/g, '\n').trim();

    const lines = processedText.split('\n');
    const processedLines = lines.map(line => {
        const words = line.trim().split(/ +/);
        if (words.length <= 3) return line;
        const lastWords = words.splice(-3).join('\u00A0');
        return words.join(' ') + ' ' + lastWords;
    });

    return processedLines.join('\n');
}

export const AngelicRenderer = {
    /** No-op placeholder — assets are embedded inline in the prime. */
    preloadAssets() {},

    /**
     * Pre-builds the DOM for a lyric line off-screen so it's GPU-compiled before display.
     * (Ahead-of-Time rendering to prevent first-play lag)
     *
     * @param {string} text                          - Raw lyric line text
     * @param {number} index                         - Lyric index (used as data-lyric-index)
     * @param {HTMLElement} angelicTextContainer     - #angelic-text-container
     */
    prepareLine(text, index, angelicTextContainer) {
        if (!text) return;

        // Skip if already prepared (AoT logic)
        if (angelicTextContainer.querySelector(`[data-lyric-index="${index}"]`)) return;

        const newWrapper = document.createElement('div');
        newWrapper.className = 'angelic-line-wrapper angelic-prebuilt';
        newWrapper.setAttribute('data-lyric-index', index);

        // ── Generate Curvy Musical Staff SVG ────────────────────────────────
        const w = window.innerWidth;
        const maxCharsPerLine   = Math.floor((w * 0.8) / 40);
        const estimatedLines    = Math.max(1, Math.ceil(text.length / maxCharsPerLine));
        const staffLineGap      = 20 + (estimatedLines - 1) * 35;

        const h       = 400 + estimatedLines * 50;
        const yCenter = h / 2;
        const amp     = 80 + Math.random() * 60;
        const phase   = Math.random() > 0.5 ? 1 : -1;

        const pathLen = Math.ceil(w * 1.15);
        let paths = '';
        for (let i = 0; i < 5; i++) {
            const y = yCenter + (i - 2) * staffLineGap;
            paths += `<path class="staff-line" d="M 0,${y} C ${w * 0.3},${y - amp * phase} ${w * 0.7},${y + amp * phase} ${w},${y}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray: ${pathLen}; stroke-dashoffset: ${pathLen};"/>`;
        }

        // Treble Clef symbol
        const clefX        = 40 + Math.random() * 20;
        const clefT        = clefX / w;
        const clefCurveY   = yCenter + 3 * (1 - clefT) * clefT * amp * phase * (2 * clefT - 1);
        const clefFontSize = staffLineGap * 4.5;
        paths += `<text class="staff-symbol" x="${clefX}" y="${clefCurveY + clefFontSize * 0.25}" font-family="serif" font-size="${clefFontSize}" fill="rgba(255,255,255,0.35)" text-anchor="middle">𝄞</text>`;

        // Music note motifs
        const musicMotifs = [
            [{ s: '♩', l: 1.5 }, { s: '♩', l: 1.5 }, { s: '♩', l: -0.5 }, { s: '♩', l: -0.5 }, { s: '♩', l: -1 }, { s: '♩', l: -1 }, { s: '♩', l: -0.5 }],
            [{ s: '♩', l: 0 },   { s: '♩', l: 0 },   { s: '♩', l: -0.5 }, { s: '♩', l: -1 }, { s: '♩', l: -1 }, { s: '♩', l: -0.5 }, { s: '♩', l: 0 }],
            [{ s: '♪', l: 2 },   { s: '♪', l: 1.5 }, { s: '♪', l: 1 },   { s: '♪', l: 0.5 }, { s: '♩', l: 0 }],
            [{ s: '♪', l: 1 },   { s: '♪', l: 1 },   { s: '♪', l: 1 },   { s: '♩', l: 2 }],
            [{ s: '♫', l: 0.5 }, { s: '♪', l: -1 },  { s: '♩', l: -0.5 }],
        ];

        const renderMotif = (motif, isLeft) => {
            const gapX       = staffLineGap * 2.5;
            const motifWidth = (motif.length - 1) * gapX;
            let startX = isLeft
                ? 180 + Math.random() * Math.max(0, (w * 0.35 - 180) - motifWidth)
                : w * 0.65 + Math.random() * Math.max(0, (w - 60 - w * 0.65) - motifWidth);

            motif.forEach((note, idx) => {
                const sx        = startX + idx * gapX;
                const t         = sx / w;
                const curveY    = yCenter + 3 * (1 - t) * t * amp * phase * (2 * t - 1);
                const sy        = curveY + (note.l * staffLineGap);
                const sFontSize = staffLineGap * 2.2;
                paths += `<text class="staff-symbol" x="${sx}" y="${sy + sFontSize * 0.3}" font-family="serif" font-size="${sFontSize}" fill="rgba(255,255,255,0.25)" text-anchor="middle">${note.s}</text>`;
            });
        };

        renderMotif(musicMotifs[Math.floor(Math.random() * musicMotifs.length)], true);
        renderMotif(musicMotifs[Math.floor(Math.random() * musicMotifs.length)], false);

        // ── Floral Branch Placement (stratified, normalized coords) ──────────
        const placedRoots = [];
        const lightTemplateIndices = [1, 2, 3, 7];
        const targetCount = Math.max(2, Math.floor(w / 320));

        const usableLeft  = w * 0.06;
        const usableWidth = w * 0.88;
        const slotWidth   = usableWidth / targetCount;

        // Alternating line pattern: outer-top -> outer-bottom -> inner-top -> inner-bottom
        const linePattern = [0, 4, 1, 3];

        for (let i = 0; i < targetCount; i++) {
            const slotCenter = usableLeft + (i + 0.5) * slotWidth;
            const xJitter    = (Math.random() - 0.5) * slotWidth * 0.6;
            const fx = Math.max(usableLeft, Math.min(usableLeft + usableWidth, slotCenter + xJitter));

            let chosenLineIndex = linePattern[i % linePattern.length];
            if (Math.random() < 0.1) {
                const swapMap = { 0: 4, 4: 0, 1: 3, 3: 1 };
                chosenLineIndex = swapMap[chosenLineIndex];
            }

            const offset     = (chosenLineIndex - 2) * staffLineGap;
            const baseCenter = yCenter + offset;

            // Cubic bezier position — normalized t = fx / w
            const t  = fx / w;
            const u  = 1 - t;
            const fy = u*u*u*baseCenter + 3*u*u*t*(baseCenter - amp*phase) + 3*u*t*t*(baseCenter + amp*phase) + t*t*t*baseCenter;

            // Bezier tangent for lean angle
            const u_t = 1 - t;
            const dBx = 3 * (
                (w * 0.3)     * u_t * u_t +
                2 * (w * 0.4) * t   * u_t +
                (w * 0.3)     * t   * t
            );
            const dy0 = -amp * phase;
            const dy1 =  amp * phase;
            const dy2 = -amp * phase;
            const dBy = 3 * (
                dy0 * u_t * u_t +
                2 * dy1 * t * u_t +
                dy2 * t * t
            );
            const tangentAngleDeg = Math.atan2(dBy, dBx) * (180 / Math.PI);
            const jitter   = (Math.random() - 0.5) * 10;
            const rawLean  = Math.max(-35, Math.min(35, tangentAngleDeg + jitter));

            placedRoots.push({ x: fx, y: fy, chosenLineIndex, leanAngle: rawLean });
        }

        for (const root of placedRoots) {
            const { x: fx, y: fy, chosenLineIndex, leanAngle = 0 } = root;

            const isGrowingUp   = chosenLineIndex < 2;
            const baseAngle     = isGrowingUp ? (-90 - leanAngle) : (90 + leanAngle);
            // Fixed scale range: 48=min readable, 78=max before overlapping lyrics
            const treeBaseScale = 48 + Math.random() * 30;

            const templates     = window.WavrFloral.templates;
            const useLightTemplate = targetCount > 3;
            const templatePool  = useLightTemplate
                ? lightTemplateIndices.map(i => templates[i])
                : templates;
            const selectedTemplate = templatePool[Math.floor(Math.random() * templatePool.length)];

            const t = fx / w; // normalized position passed into createBranch
            let templateHTML = '';
            selectedTemplate.branches.forEach((branch, idx) => {
                templateHTML += window.WavrFloral.createBranch(branch, idx, treeBaseScale, t);
            });

            const rootPaths = `<g transform="rotate(${baseAngle})">${templateHTML}</g>`;
            paths += `<g transform="translate(${fx}, ${fy})">${rootPaths}</g>`;
        }

        const svgHTML = `
        <svg class="angelic-staff-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="geometricPrecision" overflow="visible">
            ${paths}
        </svg>`;

        // ── Word HTML builder ────────────────────────────────────────────────
        const newLine = document.createElement('div');
        newLine.className = 'angelic-line';

        const safeText  = preventOrphanWords(text);
        const textLines = safeText.split('\n');

        let wordsHTML      = '';
        let globalWordIdx  = 0;

        textLines.forEach((lineText) => {
            const isParenthesis = lineText.trim().startsWith('(');
            if (isParenthesis) {
                let scaleVal = 0.75;
                if (lineText.length > 35) scaleVal = 0.55;
                else if (lineText.length > 25) scaleVal = 0.65;
                wordsHTML += `<div class="angelic-parenthesis" style="font-size: ${scaleVal}em; opacity: 0.65; white-space: nowrap; display: block; margin-top: 6px; line-height: 1.0; transform-origin: center center;">`;
            } else {
                wordsHTML += `<div style="display: block; line-height: 1.1;">`;
            }

            const words = lineText.split(' ').filter(w => w.length > 0);
            // Reduce butterfly chance on long lyrics to maintain 60 FPS
            const butterflyChance = safeText.length > 60 ? 0.15 : 0.3;

            words.forEach((word) => {
                /* =====================================================================
                   ANGELIC MODE: DYNAMIC WORD CADENCE (Recording vs Live Viewing)
                   - Recording (.is-recording): popDelay = 40ms/word + --pop-duration: 0.65s
                     → fast, crisp, tight for screen capture
                   - Live: popDelay = 65ms/word + --pop-duration: 0.94s
                     → slow, poetic breathing rhythm
                   ===================================================================== */
                const isRecording = document.body.classList.contains('is-recording');
                const popDelay = isRecording ? (globalWordIdx * 0.04) : (globalWordIdx * 0.055);

                let bFly = '';
                if (Math.random() < butterflyChance) {
                    const dirX = (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 25);
                    const dirY = (Math.random() > 0.2 ? -1 : 1) * (15 + Math.random() * 30);
                    const rot  = (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 30);
                    const dur  = Math.random() < 0.1 ? '0.5s' : '1.0s';
                    const color = Math.random() < 0.1 ? 'var(--blob-3-color)' : 'var(--blob-1-color)';
                    const styleStr = `animation-delay: ${popDelay}s, 0s; animation-duration: ${dur}, 0.3s; background-color: ${color}; --dx: ${dirX}px; --dy: ${dirY}px; --drot: ${rot}deg;`;
                    bFly = `<div class="sprite-butterfly" style="${styleStr}"></div>`;
                }

                wordsHTML += `<span class="angelic-word-sway" style="animation-delay: ${popDelay}s">
                    <span class="angelic-word-pop" style="animation-delay: ${popDelay}s">${word}</span>
                    ${bFly}
                </span> `;
                globalWordIdx++;
            });

            wordsHTML += `</div>`;
        });

        newLine.innerHTML = wordsHTML.trim();
        newWrapper.innerHTML = svgHTML;
        newWrapper.appendChild(newLine);

        angelicTextContainer.appendChild(newWrapper);
    },

    /**
     * Activates a pre-built lyric line and exits older lines gracefully.
     *
     * @param {number}      index                   - Lyric index to show
     * @param {string}      text                    - Fallback text if line not pre-built
     * @param {object[]}    lyrics                  - Full lyrics array
     * @param {HTMLElement} angelicTextContainer    - #angelic-text-container
     */
    showLine(index, text, lyrics, angelicTextContainer) {
        let wrapper = angelicTextContainer.querySelector(`[data-lyric-index="${index}"]`);

        // Fallback: build on-the-fly if pre-build was missed
        if (!wrapper && lyrics[index]) {
            AngelicRenderer.prepareLine(lyrics[index].text, index, angelicTextContainer);
            wrapper = angelicTextContainer.querySelector(`[data-lyric-index="${index}"]`);
        }

        if (!wrapper) return;

        // Exit all currently-displayed (non-prebuilt, non-exiting) lines
        const allWrappers = angelicTextContainer.querySelectorAll('.angelic-line-wrapper');
        allWrappers.forEach(line => {
            if (line !== wrapper &&
                !line.classList.contains('angelic-prebuilt') &&
                !line.classList.contains('angelic-exit')) {
                line.classList.add('angelic-exit');
                const rot = (Math.random() - 0.5) * 20;
                line.style.setProperty('--exit-rot', `${rot}deg`);
                setTimeout(() => { if (line.parentNode) line.remove(); }, 2000);
            }
        });

        lastLineShowTimestamp = Date.now();

        // Synchronously activate the enter wrapper so lyrics pop-in animation triggers instantly
        wrapper.classList.remove('angelic-prebuilt');
        wrapper.classList.add('angelic-enter-wrapper');
    },

    getLastLineShowTimestamp() { return lastLineShowTimestamp; },

    /**
     * Spawns a charm particle from the object pool into the particle container.
     * Respects dynamic throttle limits (6 when recording, 15 when live viewing).
     *
     * @param {HTMLElement} container     - #angelic-particle-container
     * @param {boolean}     isAngelicMode - Skip spawn if mode is not active
     */
    spawnParticle(container, isAngelicMode) {
        if (!isAngelicMode) return;

        const isRecording  = document.body.classList.contains('is-recording');
        const maxParticles = isRecording ? 6 : 15;
        const activeCount  = container.querySelectorAll('.angelic-particle').length;
        if (activeCount >= maxParticles) return;

        const p = getParticleFromPool();

        // Dynamic color from art cover CSS vars
        const colorVar = `--blob-${Math.floor(Math.random() * 4) + 1}-color`;
        p.style.setProperty('--p-color', `var(${colorVar})`);

        // Physics paths via CSS variables
        const sx = Math.random() * 100;
        const sy = 100 + Math.random() * 10;

        const size = 15 + Math.random() * 25;
        p.style.width  = `${size}px`;
        p.style.height = `${size}px`;

        const mx = sx + (Math.random() - 0.5) * 30;
        const my = 40 + Math.random() * 30;
        const ex = mx + (Math.random() - 0.5) * 30;
        const ey = -15;

        p.style.setProperty('--sx', `${sx}vw`);
        p.style.setProperty('--sy', `${sy}vh`);
        p.style.setProperty('--mx', `${mx}vw`);
        p.style.setProperty('--my', `${my}vh`);
        p.style.setProperty('--ex', `${ex}vw`);
        p.style.setProperty('--ey', `${ey}vh`);

        p.style.setProperty('--rot-mid', `${(Math.random() - 0.5) * 180}deg`);
        p.style.setProperty('--rot',     `${(Math.random() - 0.5) * 360}deg`);

        const dur = 8 + Math.random() * 6; // Very slow and gentle
        p.style.setProperty('--p-dur', `${dur}s`);
        p.style.setProperty('--p-op',  `${0.3 + Math.random() * 0.4}`);

        container.appendChild(p);
        setTimeout(() => releaseParticleToPool(p), dur * 1000);
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
        if (!isAngelicMode) return;

        const now = Date.now();
        if (now - giantButterflyCooldown < customCooldownMs) return;
        giantButterflyCooldown = now;

        // Stage 1 (Frame 0 - 0ms): Water Ripple
        requestAnimationFrame(() => {
            const ripple = document.createElement('div');
            ripple.className = 'water-ripple';
            particleContainer.appendChild(ripple);
            setTimeout(() => { if (ripple.parentNode) ripple.remove(); }, 4000);
        });

        // Stage 2 (Frame 1 - +16ms): Artist Fire Text (Staggered by 1 frame to prevent DOM burst)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
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
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    GiantButterfly.spawn(angelicView);
                });
            });
        });
    },
};
