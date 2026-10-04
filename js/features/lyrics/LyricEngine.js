/**
 * LyricEngine.js
 * Encapsulates lyrics state, rendering, O(1) sync highlight, and seek-prewarming.
 * Extracted 1:1 from backup_prime/js/main.js (lines 978-1116, 1023-1083, 1458-1468)
 */

import { parseLyrics } from '../../modules/lyric-parser.js';
import { renderEmojis } from './EmojiRenderer.js';
import { EnhancedWordHighlighter } from './EnhancedWordHighlighter.js';
import { LyricTimeline } from './LyricTimeline.js';
import { LyricListFocus } from './LyricListFocus.js';
import { LyricReleaseController } from './LyricReleaseController.js';
import { escapeLyricText } from './EnhancedLrcText.js';

// ── Lyrics State ─────────────────────────────────────────────────────────────
let currentLyrics  = [];
let activeLyricIndex = -1;
let driftRatio     = 1.0;
const timeline = new LyricTimeline();
const wordHighlighter = new EnhancedWordHighlighter();
const listFocus = new LyricListFocus();
const releaseController = new LyricReleaseController();

let _scrollRaf = null;
let _skipNextScroll = false;

// ── Cached DOM refs (set once, reused every frame) ────────────────────────
let _cineTextContainer   = null;
let _angelicTextContainer = null;

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

// Regex matching emoji unicode ranges (covers most emoji)
const EMOJI_REGEX = /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]|\uFE0F|\u20E3|\uFE0E|[\u{1F100}-\u{1F1FF}]|[\u{1F200}-\u{1F2FF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/gu;

/**
 * Wraps emoji characters in a styled span for CSS control per mode.
 * Strips variation selectors (\uFE0F) to avoid rendering quirks.
 */
export function wrapEmojis(text, mode = 'normal') {
    if (!text) return text;
    // For cinematic mode — strip emojis entirely (keep dramatic clean typography)
    if (mode === 'cinematic') {
        return text.replace(EMOJI_REGEX, '').replace(/\uFE0F/g, '').replace(/  +/g, ' ').trim();
    }
    // For angelic & normal: return raw text (Twemoji will parse emoji directly in DOM)
    return text;
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

    setDriftRatio(val) { driftRatio = val; timeline.setLyrics(currentLyrics, driftRatio); },
    setActiveLyricIndex(val) { activeLyricIndex = val; },
    getAngelicTiming(index, time) { return timeline.angelicTiming(index, time); },
    invalidateSeek() { activeLyricIndex = -1; wordHighlighter.reset(); releaseController.reset(); },
    invalidateCineCache() { wordHighlighter.invalidate(_cineTextContainer); },

    resetScroll(container) {
        if (_scrollRaf) {
            cancelAnimationFrame(_scrollRaf);
            _scrollRaf = null;
        }
        _skipNextScroll = false;
        activeLyricIndex = -1;
        wordHighlighter.reset(); listFocus.reset(); releaseController.reset();
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
        timeline.setLyrics(currentLyrics, driftRatio);
        wordHighlighter.reset(); listFocus.reset(); releaseController.reset();
        _cineTextContainer = null; _angelicTextContainer = null;
        return currentLyrics;
    },

    renderLyrics(lyricsListEl, angelicContainer, cinematicContainer) {
        wordHighlighter.reset(); listFocus.reset(); releaseController.reset();
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
            lineEl.setAttribute('data-index', index);

            if (lyric.isEnhanced && lyric.words && lyric.words.length > 0) {
                lineEl.className = 'am-lyric-line has-enhanced';
                const mainWords = [];
                const parenWords = [];

                lyric.words.forEach(wObj => {
                    if (wObj.isBackingVocal) {
                        parenWords.push(wObj);
                    } else {
                        mainWords.push(wObj);
                    }
                });

                let mainHTML = '';
                mainWords.forEach((wObj, wIdx) => {
                    mainHTML += `<span class="lyric-word" data-word-idx="${wIdx}" data-start="${wObj.time}" data-end="${wObj.endTime}">${escapeLyricText(wObj.word)}</span> `;
                });

                let htmlContent = `<div class="lyric-main-row">${mainHTML.trim()}</div>`;

                if (parenWords.length > 0) {
                    let parenHTML = '';
                    parenWords.forEach((wObj, wIdx) => {
                        parenHTML += `<span class="lyric-word lyric-parenthesis-word" data-word-idx="p_${wIdx}" data-start="${wObj.time}" data-end="${wObj.endTime}">${escapeLyricText(wObj.word)}</span> `;
                    });
                    htmlContent += `<div class="lyric-parenthesis-row">${parenHTML.trim()}</div>`;
                }

                lineEl.innerHTML = htmlContent;
            } else {
                let htmlText = preventOrphanWords(lyric.text);
                htmlText = wrapEmojis(htmlText, 'normal');
                htmlText = htmlText.replace(/\n\([^)]*\)(\n)?/g, (match) => {
                    const cleanMatch = match.replace(/\n/g, '');
                    let scaleVal = 0.75;
                    if (cleanMatch.length > 35) scaleVal = 0.55;
                    else if (cleanMatch.length > 25) scaleVal = 0.65;
                    return `<span class="lyric-parenthesis" style="font-size: ${scaleVal}em; opacity: 0.65; font-weight: 500; white-space: nowrap; display: block; margin-top: 4px; line-height: 1.1; transform-origin: left center;">${cleanMatch}</span>`;
                });
                lineEl.innerHTML = htmlText;
            }

            lyricsListEl.appendChild(lineEl);
        });

        // Replace OS emoji with Twemoji SVGs after all lines are in DOM
        renderEmojis(lyricsListEl, 'normal');
    },

    updateHighlight(currentTime, lyricsListEl, lyricsContainer, onAngelicShow, onCinematicTrigger, onCinematicClear, onAngelicClear) {
        if (!currentLyrics.length) return;
        const newActiveIndex = timeline.indexAt(currentTime);
        if (newActiveIndex !== activeLyricIndex) {
            activeLyricIndex = newActiveIndex;
            releaseController.reset();
            if (activeLyricIndex >= 0) {
                onAngelicShow?.(activeLyricIndex, currentLyrics[activeLyricIndex]);
                const next = currentLyrics[activeLyricIndex + 1];
                const deltaSec = next ? Math.max(.5, (next.time - currentLyrics[activeLyricIndex].time) * driftRatio) : 3;
                onCinematicTrigger?.({ ...currentLyrics[activeLyricIndex], index: activeLyricIndex }, deltaSec);
            }
        }
        listFocus.update(lyricsListEl, lyricsContainer, activeLyricIndex, smoothScrollTo);
        if (!_cineTextContainer) _cineTextContainer = document.getElementById('cinematic-text-container');
        if (!_angelicTextContainer) _angelicTextContainer = document.getElementById('angelic-text-container');
        wordHighlighter.sync(lyricsListEl, activeLyricIndex, currentTime, driftRatio, 'normal');
        wordHighlighter.sync(_cineTextContainer, activeLyricIndex, currentTime, driftRatio, 'cinematic');
        wordHighlighter.sync(_angelicTextContainer, activeLyricIndex, currentTime, driftRatio, 'angelic');
        releaseController.update(timeline, activeLyricIndex, currentTime, wordHighlighter,
            _cineTextContainer, _angelicTextContainer, onCinematicClear, onAngelicClear);
    },

    prepareLyricNearTime(time, prepareLineCallback) {
        if (!currentLyrics || currentLyrics.length === 0) return;
        const index = Math.max(0, timeline.indexAt(time));
        this.invalidateSeek();
        if (prepareLineCallback) prepareLineCallback(currentLyrics[index], index);
    }
};
