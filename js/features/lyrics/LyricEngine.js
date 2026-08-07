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

const WORD_EARLY_LEAD_IN_SEC = 0.04; // 40ms Micro Lead-in to match acoustic vocal attack without leading reader eyes

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
            lineEl.setAttribute('data-index', index);

            if (lyric.isEnhanced && lyric.words && lyric.words.length > 0) {
                lineEl.className = 'am-lyric-line has-enhanced';
                const mainWords = [];
                const parenWords = [];

                lyric.words.forEach(wObj => {
                    if (wObj.word.includes('(') || wObj.word.includes(')')) {
                        parenWords.push(wObj);
                    } else {
                        mainWords.push(wObj);
                    }
                });

                let mainHTML = '';
                mainWords.forEach((wObj, wIdx) => {
                    mainHTML += `<span class="lyric-word" data-word-idx="${wIdx}" data-start="${wObj.time}" data-end="${wObj.endTime}">${wObj.word}</span> `;
                });

                let htmlContent = `<div class="lyric-main-row">${mainHTML.trim()}</div>`;

                if (parenWords.length > 0) {
                    let parenHTML = '';
                    parenWords.forEach((wObj, wIdx) => {
                        parenHTML += `<span class="lyric-word lyric-parenthesis-word" data-word-idx="p_${wIdx}" data-start="${wObj.time}" data-end="${wObj.endTime}">${wObj.word}</span> `;
                    });
                    htmlContent += `<div class="lyric-parenthesis-row">${parenHTML.trim()}</div>`;
                }

                lineEl.innerHTML = htmlContent;
            } else {
                let htmlText = preventOrphanWords(lyric.text);
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

                if (onAngelicShow && currentLyrics[activeLyricIndex]) {
                    onAngelicShow(activeLyricIndex, currentLyrics[activeLyricIndex]);
                }

                // Calculate time gap to next lyric for adaptive animation duration
                let deltaSec = 3.0;
                if (currentLyrics[activeLyricIndex + 1]) {
                    deltaSec = Math.max(0.5, (currentLyrics[activeLyricIndex + 1].time - currentLyrics[activeLyricIndex].time) * driftRatio);
                }

                if (onCinematicTrigger && currentLyrics[activeLyricIndex]) {
                    onCinematicTrigger({ ...currentLyrics[activeLyricIndex], index: activeLyricIndex }, deltaSec);
                }
            }
        }

        // ── Real-Time High-Performance Karaoke Highlight Sync ──
        const syncWordSpansForContainer = (parentEl, wordSelector, isCinematic = false) => {
            if (!parentEl) return;
            let activeContainer = null;
            if (isCinematic) {
                activeContainer = parentEl.querySelector('.cinematic-line-wrapper.cine-enter');
            } else {
                activeContainer = parentEl.querySelector(`[data-index="${activeLyricIndex}"], [data-lyric-index="${activeLyricIndex}"]`);
            }
            if (!activeContainer) return;

            const wordSpans = activeContainer.querySelectorAll(wordSelector);
            if (wordSpans.length === 0) return;

            wordSpans.forEach(span => {
                if (span._wStart === undefined) {
                    span._wStart = parseFloat(span.getAttribute('data-start'));
                    span._wEnd = parseFloat(span.getAttribute('data-end'));
                }
                const wStart = span._wStart;
                const wEnd = span._wEnd;
                if (!isNaN(wStart) && !isNaN(wEnd)) {
                    const rawStart = wStart * driftRatio;
                    const startEff = rawStart - WORD_EARLY_LEAD_IN_SEC;
                    const endEff = wEnd * driftRatio;
                    if (currentTime >= endEff) {
                        if (!span.classList.contains('word-past')) {
                            span.classList.remove('word-active', 'glitch-word-anim');
                            if (span._glitchTimer) {
                                clearTimeout(span._glitchTimer);
                                span._glitchTimer = null;
                            }
                            span.classList.add('word-past');
                            span.style.setProperty('--word-progress', '1.0');
                        }
                    } else if (currentTime >= startEff) {
                        if (!span.classList.contains('word-active')) {
                            span.classList.remove('word-past');
                            span.classList.add('word-active');

                            // Enhanced LRC in Cinematic Mode: Probability burst of glitch on word glow (20% chance)
                            if (isCinematic && (span.classList.contains('has-enhanced-word') || span.hasAttribute('data-start'))) {
                                if (Math.random() < 0.20) {
                                    span.classList.add('glitch-word-anim');
                                    if (span._glitchTimer) clearTimeout(span._glitchTimer);
                                    span._glitchTimer = setTimeout(() => {
                                        span.classList.remove('glitch-word-anim');
                                        span._glitchTimer = null;
                                    }, 380);
                                }
                            }
                        }
                        const dur = Math.max(0.08, endEff - rawStart);
                        const ratio = Math.min(1, Math.max(0, (currentTime - rawStart) / dur));
                        span.style.setProperty('--word-progress', ratio.toFixed(3));
                    } else {
                        if (span.classList.contains('word-active') || span.classList.contains('word-past')) {
                            span.classList.remove('word-active', 'word-past', 'glitch-word-anim');
                            if (span._glitchTimer) {
                                clearTimeout(span._glitchTimer);
                                span._glitchTimer = null;
                            }
                            span.style.setProperty('--word-progress', '0.0');
                        }
                    }
                }
            });
        };

        if (lyricsListEl) syncWordSpansForContainer(lyricsListEl, '.lyric-word', false);
        const cineContainer = document.getElementById('cinematic-text-container');
        if (cineContainer) syncWordSpansForContainer(cineContainer, '.cine-word', true);
        const angelContainer = document.getElementById('angelic-text-container');
        if (angelContainer) syncWordSpansForContainer(angelContainer, '.angelic-word-pop', false);
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
