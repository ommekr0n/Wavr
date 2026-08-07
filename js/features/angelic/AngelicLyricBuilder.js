/**
 * AngelicLyricBuilder.js
 * Parses lyrics, prevents orphan words, and generates the DOM structure for lyrics.
 * v2: Syllable-level pop animation — mỗi âm tiết xuất hiện với delay nhỏ hơn word-by-word.
 */

import { splitSyllables } from '../visualizer/VisualFX.js';

export const AngelicLyricBuilder = {
    /**
     * Prevents orphan words in lyrics by grouping the last few words.
     * @param {string} text - Raw lyric text
     * @returns {string} Processed lyric text
     */
    preventOrphanWords(text) {
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
            const lastWords = words.splice(-2).join('\u00A0');
            return words.join(' ') + ' ' + lastWords;
        });

        return processedLines.join('\n');
    },

    /**
     * Builds the HTML for the lyric words with syllable-level animation.
     * Supports both Enhanced LRC (exact vocal timestamps) and Standard LRC (synthetic syllable steps).
     * @param {string|Object} inputData - Processed lyric text or rich lyric object
     * @returns {string} HTML string of lyric words
     */
    buildWordsHTML(inputData) {
        const isObj = typeof inputData === 'object' && inputData !== null;
        const rawText = isObj ? inputData.text : inputData;
        const isEnhanced = isObj && inputData.isEnhanced && Array.isArray(inputData.words);
        const wordList = isEnhanced ? inputData.words : [];
        const lineTime = isObj ? (inputData.time || 0) : 0;

        if (!rawText) return '';

        const safeText = this.preventOrphanWords(rawText);
        const textLines = safeText.split('\n');
        let wordsHTML = '';
        let globalWordIdx = 0;
        let globalSyllableIdx = 0;

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

            const words = lineText.split(/[ \t\r\n]+/).filter(w => w.length > 0);
            const butterflyChance = safeText.length > 60 ? 0.15 : 0.3;

            words.forEach((word) => {
                const STAFF_DRAW_DURATION = 0.15;
                const isRecording = document.body.classList.contains('is-recording');
                const syllableStep = isRecording ? 0.025 : 0.018;

                const syllables = splitSyllables(word);
                const wObj = isEnhanced && wordList[globalWordIdx] ? wordList[globalWordIdx] : null;

                let wordPopDelay = 0;
                let dataAttrs = '';

                if (wObj) {
                    const offsetSec = Math.max(0, wObj.time - lineTime);
                    wordPopDelay = STAFF_DRAW_DURATION + offsetSec;
                    dataAttrs = `data-start="${wObj.time}" data-end="${wObj.endTime}"`;
                } else {
                    wordPopDelay = STAFF_DRAW_DURATION + globalSyllableIdx * syllableStep;
                }
                globalWordIdx++;

                // Butterfly attached to word wrapper
                let bFly = '';
                if (Math.random() < butterflyChance) {
                    const dirX = (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 25);
                    const dirY = (Math.random() > 0.2 ? -1 : 1) * (15 + Math.random() * 30);
                    const rot  = (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 30);
                    const dur  = Math.random() < 0.1 ? '0.5s' : '1.0s';
                    const color = Math.random() < 0.1 ? 'var(--blob-3-color)' : 'var(--blob-1-color)';
                    const styleStr = `animation-delay: ${wordPopDelay}s, 0s; animation-duration: ${dur}, 0.3s; background-color: ${color}; --dx: ${dirX}px; --dy: ${dirY}px; --drot: ${rot}deg;`;
                    bFly = `<div class="sprite-butterfly" style="${styleStr}"></div>`;
                }

                if (syllables.length <= 1) {
                    wordsHTML += `<span class="angelic-word-sway" style="animation-delay: ${wordPopDelay}s">
                        <span class="angelic-word-pop ${wObj ? 'has-enhanced-word' : ''}" ${dataAttrs} style="animation-delay: ${wordPopDelay}s">${word}</span>
                        ${bFly}
                    </span> `;
                    globalSyllableIdx++;
                } else {
                    wordsHTML += `<span class="angelic-word-sway" style="animation-delay: ${wordPopDelay}s">`;
                    syllables.forEach((syl) => {
                        const sylDelay = wObj ? wordPopDelay : (STAFF_DRAW_DURATION + globalSyllableIdx * syllableStep);
                        wordsHTML += `<span class="angelic-word-pop ${wObj ? 'has-enhanced-word' : ''}" ${dataAttrs} style="animation-delay: ${sylDelay}s">${syl}</span>`;
                        globalSyllableIdx++;
                    });
                    wordsHTML += `${bFly}</span> `;
                }
            });

            wordsHTML += `</div>`;
        });

        return wordsHTML.trim();
    }
};
