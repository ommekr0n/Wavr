/**
 * AngelicRenderer.js
 * Orchestrator for the Angelic Mode visual layer.
 * Delegates work to specialized modules to follow Strict No-Monolith Rule.
 */

import { AngelicStaffGenerator } from '../../features/angelic/AngelicStaffGenerator.js';
import { AngelicFloralPlacer } from '../../features/angelic/AngelicFloralPlacer.js';
import { AngelicLyricBuilder } from '../../features/angelic/AngelicLyricBuilder.js';
import { AngelicParticleSystem } from '../../features/angelic/AngelicParticleSystem.js';
import { AngelicClimaxFX } from '../../features/angelic/AngelicClimaxFX.js';
import { AngelicStaffAnimator } from '../../features/angelic/AngelicStaffAnimator.js';
import { applyInkWashExit } from '../../features/visualizer/VisualFX.js';

let lastLineShowTimestamp = 0;

export const AngelicRenderer = {
    /** No-op placeholder — assets are embedded inline in the prime. */
    preloadAssets() {},

    /**
     * Ensures the persistent Global Staff (5 lines) and Khóa Sol exist.
     * Draws L-to-R once with animation and stays persistent waving to the music.
     */
    ensureGlobalStaff(angelicTextContainer) {
        if (angelicTextContainer.querySelector('.global-angelic-staff-wrapper')) return;

        const w = window.innerWidth;
        const staffLineGap = 50;
        const h = 550;
        const yCenter = h / 2;
        const amp = 50;
        const phase = 1;

        const { staffPaths } = AngelicStaffGenerator.generatePaths(w, h, staffLineGap, yCenter, amp, phase);

        const clefX = 50;
        const clefT = clefX / w;
        const clefFontSize = Math.max(200, staffLineGap * 8);

        const globalWrapper = document.createElement('div');
        globalWrapper.className = 'global-angelic-staff-wrapper staff-enter-draw';
        globalWrapper.setAttribute('data-w', w);
        globalWrapper.setAttribute('data-staff-gap', staffLineGap);
        globalWrapper.setAttribute('data-y-center', yCenter);
        globalWrapper.setAttribute('data-amp', amp);

        const globalStaffHTML = `
        <svg class="global-angelic-staff-svg angelic-staff-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="geometricPrecision" overflow="visible">
            ${staffPaths}
            <text class="staff-symbol staff-motif-anim angelic-clef-symbol" data-t="${clefT}" data-l="0" data-font="${clefFontSize}" x="${clefX}" y="${yCenter}" font-family="serif" font-size="${clefFontSize}" fill="rgba(255,255,255,0.45)" text-anchor="middle" text-rendering="geometricPrecision">𝄞</text>
        </svg>`;

        globalWrapper.innerHTML = globalStaffHTML;
        angelicTextContainer.appendChild(globalWrapper);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                globalWrapper.classList.add('drawn');
            });
        });
    },

    /**
     * Pre-builds the DOM for a lyric line off-screen so it's GPU-compiled before display.
     * @param {string|Object} textOrLyric            - Raw lyric line text or rich lyric object
     * @param {number} index                         - Lyric index (used as data-lyric-index)
     * @param {HTMLElement} angelicTextContainer     - #angelic-text-container
     */
    prepareLine(textOrLyric, index, angelicTextContainer) {
        if (!textOrLyric) return;
        if (angelicTextContainer.querySelector(`[data-lyric-index="${index}"]`)) return;

        const newWrapper = document.createElement('div');
        newWrapper.className = 'angelic-line-wrapper angelic-prebuilt';
        newWrapper.setAttribute('data-lyric-index', index);

        // ── Dimensions & Params ──
        const w = window.innerWidth;
        const staffLineGap = 50; 
        const h = 550; 
        const yCenter = h / 2;
        const phase = 1; 
        const amp = 50;

        // ── Generate Florals & Motifs ONLY (Staff Lines & Clef are persistent) ──
        const { motifPaths } = AngelicStaffGenerator.generatePaths(w, h, staffLineGap, yCenter, amp, phase);
        const floralPaths = AngelicFloralPlacer.generateBranches(w, staffLineGap, yCenter, amp, phase);

        const globalTime = (Date.now() % 24000) / 1000;
        const syncStyle = `style="animation-delay: -${globalTime}s"`;

        const floralSvgHTML = `
        <svg class="angelic-floral-svg" ${syncStyle} width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="geometricPrecision" overflow="visible">
            ${floralPaths}
            ${motifPaths}
        </svg>`;

        // ── Word HTML builder ──
        const newLine = document.createElement('div');
        newLine.className = 'angelic-line';
        
        newLine.innerHTML = AngelicLyricBuilder.buildWordsHTML(textOrLyric);
        
        newWrapper.innerHTML = floralSvgHTML;
        newWrapper.appendChild(newLine);
        
        // Store parameters for Animator
        newWrapper.setAttribute('data-w', w);
        newWrapper.setAttribute('data-staff-gap', staffLineGap);
        newWrapper.setAttribute('data-y-center', yCenter);
        newWrapper.setAttribute('data-amp', amp);
        
        angelicTextContainer.appendChild(newWrapper);
    },

    /**
     * Activates a pre-built lyric line and exits older lines gracefully.
     */
    showLine(index, textOrLyric, lyrics, angelicTextContainer) {
        // Đảm bảo Khung 5 dây & Khóa Sol đã được vẽ L-to-R và duy trì đung đưa cố định
        this.ensureGlobalStaff(angelicTextContainer);

        let wrapper = angelicTextContainer.querySelector(`[data-lyric-index="${index}"]`);
        const lyricObj = (lyrics && lyrics[index]) ? lyrics[index] : textOrLyric;

        if (!wrapper && lyricObj) {
            AngelicRenderer.prepareLine(lyricObj, index, angelicTextContainer);
            wrapper = angelicTextContainer.querySelector(`[data-lyric-index="${index}"]`);
        }
        if (!wrapper) return;

        const allWrappers = angelicTextContainer.querySelectorAll('.angelic-line-wrapper');
        allWrappers.forEach(line => {
            if (line !== wrapper &&
                !line.classList.contains('angelic-prebuilt') &&
                !line.classList.contains('angelic-exit') &&
                !line.classList.contains('ink-wash-exit')) {
                applyInkWashExit(line);
            }
        });

        lastLineShowTimestamp = Date.now();
        wrapper.classList.remove('angelic-prebuilt');

        // Single rAF — kích hoạt animation ngay lập tức ở frame kế tiếp mà không bị trễ 2-frame
        requestAnimationFrame(() => {
            wrapper.classList.add('angelic-enter-wrapper');

            const clef = angelicTextContainer.querySelector('.angelic-clef-symbol');
            if (clef && !clef.classList.contains('enter')) clef.classList.add('enter');
        });

        // Start Canvas-like sine wave animation for the active line!
        const w = parseFloat(wrapper.getAttribute('data-w'));
        const staffLineGap = parseFloat(wrapper.getAttribute('data-staff-gap'));
        const yCenter = parseFloat(wrapper.getAttribute('data-y-center'));
        const amp = parseFloat(wrapper.getAttribute('data-amp'));
        AngelicStaffAnimator.start(wrapper, w, staffLineGap, yCenter, amp);
    },

    getLastLineShowTimestamp() { return lastLineShowTimestamp; },

    /** Delegates to AngelicParticleSystem */
    spawnParticle(container, isAngelicMode) {
        AngelicParticleSystem.spawnParticle(container, isAngelicMode);
    },

    /** Delegates to AngelicClimaxFX */
    spawnClimaxCombo(isAngelicMode, particleContainer, angelicView, songArtistText, customCooldownMs = 6000) {
        AngelicClimaxFX.spawnClimaxCombo(isAngelicMode, particleContainer, angelicView, songArtistText, customCooldownMs);
    }
};
