/**
 * LyricEngine.js
 * Encapsulates lyrics state, rendering, O(1) sync highlight, and seek-prewarming.
 * Extracted 1:1 from backup_prime/js/main.js (lines 978-1116, 1023-1083, 1458-1468)
 */

import { parseLyrics } from '../../modules/lyric-parser.js';

// ── Lyrics State ─────────────────────────────────────────────────────────────
let currentLyrics  = [];
let activeLyricIndex = -1;
let driftRatio     = 1.0;

// ── Shared helper: prevent orphan words ─────────────────────────────────────
// Mirrors the exact function in main.js and AngelicRenderer.js — must stay in sync.
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

export const LyricEngine = {

    // ── Getters ─────────────────────────────────────────────────────────────
    getCurrentLyrics()    { return currentLyrics; },
    getActiveLyricIndex() { return activeLyricIndex; },
    getDriftRatio()       { return driftRatio; },

    // ── Setters ─────────────────────────────────────────────────────────────
    setDriftRatio(val)       { driftRatio = val; },
    setActiveLyricIndex(val) { activeLyricIndex = val; },

    /**
     * Parses an LRC text string into a lyrics array and resets the active index.
     * @param {string} lrcText - Raw LRC lyrics string
     * @returns {object[]} Parsed lyrics array [{ time, text }]
     */
    setLyrics(lrcText) {
        currentLyrics    = parseLyrics(lrcText);
        activeLyricIndex = -1;
        return currentLyrics;
    },

    /**
     * Renders lyrics into the scrollable player list and clears angelic/cinematic containers.
     * Extracted 1:1 from backup_prime/js/main.js lines 978-1021.
     *
     * @param {HTMLElement} lyricsListEl          - #lyrics-list
     * @param {HTMLElement|null} angelicContainer  - #angelic-text-container
     * @param {HTMLElement|null} cinematicContainer - #cinematic-text-container
     */
    renderLyrics(lyricsListEl, angelicContainer, cinematicContainer) {
        lyricsListEl.innerHTML = '';
        if (angelicContainer)   angelicContainer.innerHTML   = '';
        if (cinematicContainer) cinematicContainer.innerHTML = '';
        activeLyricIndex = -1;

        if (currentLyrics.length === 0) {
            lyricsListEl.innerHTML = '<div class="am-lyric-line placeholder-line">No lyrics available</div>';
            return;
        }

        currentLyrics.forEach((lyric, index) => {
            const lineEl = document.createElement('div');
            lineEl.className = 'am-lyric-line';

            let htmlText = preventOrphanWords(lyric.text);
            // Format parenthetical repeats with block layout — matches prime exactly
            htmlText = htmlText.replace(/\n\([^)]*\)(\n)?/g, (match) => {
                const cleanMatch = match.replace(/\n/g, '');
                let scaleVal = 0.75;
                if (cleanMatch.length > 35) scaleVal = 0.55;
                else if (cleanMatch.length > 25) scaleVal = 0.65;
                return `<span class="lyric-parenthesis" style="font-size: ${scaleVal}em; opacity: 0.65; font-weight: 500; white-space: nowrap; display: block; margin-top: 4px; line-height: 1.1; transform-origin: left center;">${cleanMatch}</span>`;
            });

            lineEl.innerHTML = htmlText;
            lineEl.setAttribute('data-index', index);

            lyricsListEl.appendChild(lineEl);
        });
    },

    /**
     * O(1) optimized lyric sync — only checks adjacent lyrics, never scans all.
     * Extracted 1:1 from backup_prime/js/main.js lines 1023-1082.
     *
     * @param {number}      currentTime           - Current audio.currentTime
     * @param {HTMLElement} lyricsListEl          - #lyrics-list (for scroll and highlight)
     * @param {HTMLElement} lyricsContainer       - #lyrics-container (for scrollTo)
     * @param {function}    onAngelicShow         - Callback(index) when angelic mode triggers
     * @param {function}    onCinematicTrigger    - Callback(text) when cinematic mode triggers
     */
    updateHighlight(currentTime, lyricsListEl, lyricsContainer, onAngelicShow, onCinematicTrigger) {
        if (currentLyrics.length === 0) return;

        // O(1) adjacent-check optimized lyric sync
        let newActiveIndex = activeLyricIndex !== -1 ? activeLyricIndex : 0;

        // Fast-forward if time passed the next lyric
        while (newActiveIndex < currentLyrics.length - 1 && currentTime >= currentLyrics[newActiveIndex + 1].time * driftRatio) {
            newActiveIndex++;
        }
        // Rewind if time went backwards (e.g. user seeked)
        while (newActiveIndex > 0 && currentTime < currentLyrics[newActiveIndex].time * driftRatio) {
            newActiveIndex--;
        }
        // Edge case: time is before the very first lyric
        if (newActiveIndex === 0 && currentTime < currentLyrics[0].time * driftRatio) {
            newActiveIndex = -1;
        }

        if (newActiveIndex !== activeLyricIndex && newActiveIndex !== -1) {
            activeLyricIndex = newActiveIndex;

            const lines = lyricsListEl.querySelectorAll('.am-lyric-line');
            lines.forEach((line, idx) => {
                if (idx === activeLyricIndex) line.classList.add('active');
                else                          line.classList.remove('active');
            });

            const activeLine = lines[activeLyricIndex];
            if (activeLine && lyricsContainer) {
                const containerHeight = lyricsContainer.clientHeight;
                const lineOffsetTop   = activeLine.offsetTop;
                const lineHeight      = activeLine.clientHeight;
                const targetScroll    = lineOffsetTop - (containerHeight * 0.4) + (lineHeight / 2);
                lyricsContainer.scrollTo({ top: targetScroll, behavior: 'smooth' });
            }

            // Trigger mode-specific callbacks
            if (onCinematicTrigger && currentLyrics[activeLyricIndex]) {
                onCinematicTrigger(currentLyrics[activeLyricIndex].text);
            }
            if (onAngelicShow && currentLyrics[activeLyricIndex]) {
                onAngelicShow(activeLyricIndex);
            }
        }
    },

    /**
     * Fast-forwards/rewinds the active index to match a seek target time.
     * Pre-warms AoT line preparation before the seek completes.
     * Extracted 1:1 from backup_prime/js/main.js lines 1458-1468.
     *
     * @param {number}   time           - Target seek time in seconds
     * @param {function} prepareLineFn  - Callback(text, index) to pre-build the angelic line
     */
    prepareLyricNearTime(time, prepareLineFn) {
        if (currentLyrics.length === 0) return;
        let index = 0;
        while (index < currentLyrics.length - 1 && time >= currentLyrics[index + 1].time * driftRatio) {
            index++;
        }
        if (prepareLineFn) {
            prepareLineFn(currentLyrics[index].text, index);
            if (currentLyrics[index + 1]) {
                prepareLineFn(currentLyrics[index + 1].text, index + 1);
            }
        }
    },
};
