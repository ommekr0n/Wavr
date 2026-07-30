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
const EARLY_LEAD_IN_SEC = 0.12; // 120ms Early Lead-in for smooth UX

let _scrollRaf = null;
let _skipNextScroll = false;

function smoothScrollTo(el, target, duration = 520) {
    if (_skipNextScroll) {
        _skipNextScroll = false;
        return;
    }

    if (_scrollRaf) {
        cancelAnimationFrame(_scrollRaf);
        _scrollRaf = null;
    }

    const start    = el.scrollTop;
    const distance = target - start;

    if (Math.abs(distance) < 1) return;

    const startTime = performance.now();

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
    getCurrentLyrics()    { return currentLyrics; },
    getActiveLyricIndex() { return activeLyricIndex; },
    getDriftRatio()       { return driftRatio; },

    setDriftRatio(val)       { driftRatio = val; },
    setActiveLyricIndex(val) { activeLyricIndex = val; },

    resetScroll(container) {
        if (_scrollRaf) {
            cancelAnimationFrame(_scrollRaf);
            _scrollRaf = null;
        }
        _skipNextScroll = false;
        activeLyricIndex = -1;
        if (container) {
            container.scrollTop = 0;
            requestAnimationFrame(() => {
                if (container) container.scrollTop = 0;
            });
        }
    },

    setLyrics(lrcText) {
        currentLyrics    = parseLyrics(lrcText);
        activeLyricIndex = -1;
        return currentLyrics;
    },

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

    updateHighlight(currentTime, lyricsListEl, lyricsContainer, onAngelicShow, onCinematicTrigger) {
        if (!currentLyrics || currentLyrics.length === 0 || !currentLyrics[0] || typeof currentLyrics[0].time !== 'number') return;

        // Apply 120ms early lead-in for smooth visual anticipation
        const effectiveTime = currentTime + EARLY_LEAD_IN_SEC;

        let newActiveIndex = activeLyricIndex >= 0 ? activeLyricIndex : 0;

        while (
            newActiveIndex < currentLyrics.length - 1 &&
            currentLyrics[newActiveIndex + 1] &&
            typeof currentLyrics[newActiveIndex + 1].time === 'number' &&
            effectiveTime >= currentLyrics[newActiveIndex + 1].time * driftRatio
        ) {
            newActiveIndex++;
        }
        while (
            newActiveIndex > 0 &&
            currentLyrics[newActiveIndex] &&
            typeof currentLyrics[newActiveIndex].time === 'number' &&
            effectiveTime < currentLyrics[newActiveIndex].time * driftRatio
        ) {
            newActiveIndex--;
        }
        if (currentLyrics[0] && effectiveTime < currentLyrics[0].time * driftRatio) {
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
                    smoothScrollTo(lyricsContainer, targetScroll, 520);
                }

                if (onAngelicShow) onAngelicShow(activeLyricIndex);

                // Calculate time gap to next lyric for adaptive animation duration
                let deltaSec = 3.0;
                if (currentLyrics[activeLyricIndex + 1]) {
                    deltaSec = Math.max(0.5, (currentLyrics[activeLyricIndex + 1].time - currentLyrics[activeLyricIndex].time) * driftRatio);
                }

                if (onCinematicTrigger && currentLyrics[activeLyricIndex]) {
                    onCinematicTrigger(currentLyrics[activeLyricIndex].text, deltaSec);
                }
            }
        }
    },

    prepareLyricNearTime(time, prepareLineCallback) {
        if (!currentLyrics || currentLyrics.length === 0) return;
        let idx = currentLyrics.findIndex(s => s.time * driftRatio >= time);
        if (idx === -1) idx = currentLyrics.length - 1;
        activeLyricIndex = Math.max(0, idx - 1);
        if (prepareLineCallback && currentLyrics[activeLyricIndex]) {
            prepareLineCallback(currentLyrics[activeLyricIndex].text, activeLyricIndex);
        }
    }
};
