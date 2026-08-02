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
     * Âm tiết xuất hiện với delay nhỏ hơn (0.018s/syllable) so với word-by-word (0.03s/word)
     * → cảm giác "hát theo" mượt hơn nhiều, đặc biệt với từ dài nhiều âm tiết.
     * @param {string} text - Processed lyric text
     * @returns {string} HTML string of lyric words
     */
    buildWordsHTML(text) {
        const textLines = text.split('\n');
        let wordsHTML = '';
        let globalSyllableIdx = 0; // Đổi từ word sang syllable index

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
            const butterflyChance = text.length > 60 ? 0.15 : 0.3;

            words.forEach((word) => {
                /* =====================================================================
                   ANGELIC MODE: SYLLABLE-LEVEL CADENCE
                   - Delay 0.018s/syllable (thay vì 0.03s/word trước đây)
                   - Từ 1 âm tiết: delay = globalSyllableIdx * 0.018
                   - Từ 3 âm tiết (vd: "beau-ti-ful"): mỗi âm tiết shift thêm 0.018s
                   - STAFF_DRAW_DURATION: chờ staff vẽ xong 15% trước
                   ===================================================================== */
                const STAFF_DRAW_DURATION = 0.15;
                const isRecording = document.body.classList.contains('is-recording');
                // Recording: delay chặt hơn để capture sắc nét
                const syllableStep = isRecording ? 0.025 : 0.018;

                const syllables = splitSyllables(word);

                // Butterfly gắn vào word container bên ngoài (không phân ra syllable)
                const wordPopDelay = STAFF_DRAW_DURATION + globalSyllableIdx * syllableStep;
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
                    // Từ 1 âm tiết: giữ nguyên như cũ nhưng dùng globalSyllableIdx
                    wordsHTML += `<span class="angelic-word-sway" style="animation-delay: ${wordPopDelay}s">
                        <span class="angelic-word-pop" style="animation-delay: ${wordPopDelay}s">${word}</span>
                        ${bFly}
                    </span> `;
                    globalSyllableIdx++;
                } else {
                    // Từ nhiều âm tiết: mỗi âm tiết là 1 <span> riêng với delay tăng dần
                    // Bọc trong angelic-word-sway để giữ sway animation trên cả từ
                    wordsHTML += `<span class="angelic-word-sway" style="animation-delay: ${wordPopDelay}s">`;
                    syllables.forEach((syl) => {
                        const sylDelay = STAFF_DRAW_DURATION + globalSyllableIdx * syllableStep;
                        wordsHTML += `<span class="angelic-word-pop" style="animation-delay: ${sylDelay}s">${syl}</span>`;
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
