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

// ── Custom smooth scroll state ────────────────────────────────────────────────
// We track one in-flight RAF scroll per container so new scroll requests
// cancel the old one cleanly instead of stuttering over each other.
let _scrollRaf = null;
// After a resetScroll(), we skip the very next smoothScrollTo call so
// timeupdate can't immediately override the scrollTop=0 reset.
let _skipNextScroll = false;

/**
 * Custom RAF smooth scroll — ease-out-quart curve.
 * Much smoother than browser `behavior:'smooth'` which stutters on interruption.
 *
 * @param {HTMLElement} el        - Scrollable container
 * @param {number}      target    - Target scrollTop in px
 * @param {number}      duration  - Animation duration in ms (default 520ms)
 */
function smoothScrollTo(el, target, duration = 520) {
    // Skip exactly one call after resetScroll() to let the reset settle
    if (_skipNextScroll) {
        _skipNextScroll = false;
        return;
    }

    // Cancel any in-flight scroll immediately
    if (_scrollRaf) {
        cancelAnimationFrame(_scrollRaf);
        _scrollRaf = null;
    }

    const start    = el.scrollTop;
    const distance = target - start;

    // Nothing to scroll
    if (Math.abs(distance) < 1) return;

    const startTime = performance.now();

    // Ease-out-quart: fast start, very soft landing — feels natural
    function easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    function step(now) {
        const elapsed  = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased    = easeOutQuart(progress);

        el.scrollTop = start + distance * eased;

        if (progress < 1) {
            _scrollRaf = requestAnimationFrame(step);
        } else {
            _scrollRaf = null;
        }
    }

    _scrollRaf = requestAnimationFrame(step);
}

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
     * Cancels any in-flight RAF scroll and instantly resets the container to top.
     * Must be called on track change BEFORE renderLyrics.
     * @param {HTMLElement} container - The lyrics scrollable container
     */
    resetScroll(container) {
        if (_scrollRaf) {
            cancelAnimationFrame(_scrollRaf);
            _scrollRaf = null;
        }
        _skipNextScroll = false;
        activeLyricIndex = -1;
        if (container) {
            container.scrollTop = 0;
            // Double-check scroll reset after DOM paint
            requestAnimationFrame(() => {
                if (container) container.scrollTop = 0;
            });
        }
    },

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
        if (!currentLyrics || currentLyrics.length === 0 || !currentLyrics[0] || typeof currentLyrics[0].time !== 'number') return;

        // O(1) adjacent-check optimized lyric sync — ensure valid non-negative index for array lookup
        let newActiveIndex = activeLyricIndex >= 0 ? activeLyricIndex : 0;

        // Fast-forward if time passed the next lyric
        while (
            newActiveIndex < currentLyrics.length - 1 &&
            currentLyrics[newActiveIndex + 1] &&
            typeof currentLyrics[newActiveIndex + 1].time === 'number' &&
            currentTime >= currentLyrics[newActiveIndex + 1].time * driftRatio
        ) {
            newActiveIndex++;
        }
        // Rewind if time went backwards (e.g. user seeked)
        while (
            newActiveIndex > 0 &&
            currentLyrics[newActiveIndex] &&
            typeof currentLyrics[newActiveIndex].time === 'number' &&
            currentTime < currentLyrics[newActiveIndex].time * driftRatio
        ) {
            newActiveIndex--;
        }
        // Edge case: time is before the very first lyric (Intro / Music Solo)
        if (currentLyrics[0] && currentTime < currentLyrics[0].time * driftRatio) {
            newActiveIndex = -1;
        }

        if (newActiveIndex !== activeLyricIndex) {
            activeLyricIndex = newActiveIndex;

            const lines = lyricsListEl.querySelectorAll('.am-lyric-line');
            lines.forEach((line, idx) => {
                line.classList.remove('active', 'next-line');
                if (idx === activeLyricIndex)     line.classList.add('active');
                else if (idx === activeLyricIndex + 1) line.classList.add('next-line');
            });

            if (activeLyricIndex === -1) {
                // If audio is currently in the intro section before first lyric, scroll container straight to top (0px)
                if (lyricsContainer) {
                    smoothScrollTo(lyricsContainer, 0, 350);
                }
            } else {
                const activeLine = lines[activeLyricIndex];
                if (activeLine && lyricsContainer) {
                    const containerHeight = lyricsContainer.clientHeight;
                    const lineOffsetTop   = activeLine.offsetTop;
                    const lineHeight      = activeLine.clientHeight;
                    const targetScroll    = lineOffsetTop - (containerHeight * 0.4) + (lineHeight / 2);
                    // Custom RAF scroll — no stutter on rapid line changes
                    smoothScrollTo(lyricsContainer, targetScroll, 520);
                }

                // Trigger mode-specific callbacks
                if (onCinematicTrigger && currentLyrics[activeLyricIndex]) {
                    onCinematicTrigger(currentLyrics[activeLyricIndex].text);
                }
                if (onAngelicShow && currentLyrics[activeLyricIndex]) {
                    onAngelicShow(activeLyricIndex);
                }
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
