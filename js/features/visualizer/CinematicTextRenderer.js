/**
 * CinematicTextRenderer.js
 * Handles 3D animated typography for Cinematic Mode with adaptive fluid sizing & timing.
 */
import { calculateFluidLyricStyle } from './AdaptiveLyricSizer.js';
import { applyChromaAberration } from './VisualFX.js';

export function triggerCinematicLine(text, cinematicTextContainer, deltaSec = 3.0) {
    if (!text || !cinematicTextContainer) return;

    // Fast transition duration for quick rap/EDM lyrics vs smooth drift for slow ballads
    const exitDurationMs = deltaSec < 1.5 ? 450 : 900;

    const oldLines = cinematicTextContainer.querySelectorAll('.cinematic-line-wrapper');
    oldLines.forEach(line => {
        line.classList.remove('cine-enter');
        line.classList.add('cine-exit');
        line.style.animationDuration = `${exitDurationMs}ms`;

        const exitingWords = line.querySelectorAll('.cine-word');
        exitingWords.forEach(w => { w.classList.add('glitched'); w.classList.remove('glitch-word-anim'); });
        const rot = (Math.random() - 0.5) * 12;
        const tx = (Math.random() - 0.5) * 10;
        line.style.setProperty('--exit-rot', `${rot}deg`);
        line.style.setProperty('--exit-tx', `${tx}vw`);
        setTimeout(() => { if (line.parentNode) line.remove(); }, exitDurationMs + 50);
    });

    const newWrapper = document.createElement('div');
    newWrapper.className = 'cinematic-line-wrapper cine-enter';

    // Particle sparks
    const sparkContainer = document.createElement('div');
    sparkContainer.className = 'sparkle-container';
    const wordCount = text.split(' ').length;
    const numSparks = Math.min(Math.max(wordCount * 3, 5), 15);
    for (let i = 0; i < numSparks; i++) {
        const spark = document.createElement('div');
        spark.className = 'sparkle';
        const colorVar = `--blob-${Math.floor(Math.random() * 4) + 1}-color`;
        spark.style.setProperty('--spark-color', `var(${colorVar})`);
        const spreadWidth = Math.min(text.length * 6, 95);
        const startX = (Math.random() - 0.5) * spreadWidth;
        const startY = (Math.random() - 0.5) * 12;
        spark.style.left = `calc(50% + ${startX}vmin)`;
        spark.style.top = `calc(50% + ${startY}vmin)`;
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 100;
        spark.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
        spark.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
        spark.style.animationDelay = `${Math.random() * 0.15}s`;
        spark.style.animationDuration = `${0.6 + Math.random() * 0.6}s`;
        sparkContainer.appendChild(spark);
    }
    newWrapper.appendChild(sparkContainer);
    setTimeout(() => { if (sparkContainer.parentNode) sparkContainer.remove(); }, 1500);

    const newLine = document.createElement('div');
    newLine.className = 'cinematic-line';

    // Consistent, uniform lyric styling handled by CSS & AdaptiveLyricSizer
    const fluidStyle = calculateFluidLyricStyle();
    newLine.style.fontSize = fluidStyle.fontSize;
    newLine.style.lineHeight = fluidStyle.lineHeight;

    const processedText = preventOrphanWords(text);
    const textLines = processedText.split('\n');

    textLines.forEach((lineText) => {
        const isParenthesis = lineText.trim().startsWith('(');
        const lineContainer = document.createElement('div');
        if (isParenthesis) {
            let scaleVal = 0.65;
            if (lineText.length > 35) scaleVal = 0.45;
            else if (lineText.length > 25) scaleVal = 0.55;
            lineContainer.className = 'cine-parenthesis';
            lineContainer.style.fontSize = `${scaleVal}em`;
            lineContainer.style.opacity = '0.65';
            lineContainer.style.display = 'block';
            lineContainer.style.marginTop = '6px';
            lineContainer.style.lineHeight = '1.0';
            lineContainer.style.whiteSpace = 'nowrap';
        } else {
            lineContainer.style.lineHeight = '1.1';
        }

        const words = lineText.trim().split(' ').filter(w => w.length > 0);
        const allowGlitch = words.length > 3;

        words.forEach((word, index) => {
            const span = document.createElement('span');
            if (allowGlitch && !isParenthesis) {
                span.className = 'cine-word glitch-immune';
                setTimeout(() => { if (span.parentNode) span.classList.remove('glitch-immune'); }, 1500);
            } else {
                span.className = 'cine-word';
            }
            span.textContent = word;
            span.dataset.text = word;
            lineContainer.appendChild(span);
            if (index < words.length - 1) lineContainer.appendChild(document.createTextNode(' '));
        });

        newLine.appendChild(lineContainer);
    });

    newWrapper.appendChild(newLine);
    cinematicTextContainer.appendChild(newWrapper);

    // ── Chromatic aberration on enter ──
    applyChromaAberration(newWrapper);
}

export function preventOrphanWords(text) {
    if (!text) return '';

    // Match AngelicLyricBuilder: extract (...) parenthesis text to its own line
    let processedText = text.replace(/([^\n(]*?)\s*\(([^)]*)\)\s*([.,;:!?]?)\s*/g, (match, before, inside, punc) => {
        const parenthesisText = `(${inside})`;
        if (parenthesisText.length > 3) {
            const cleanBefore = before.trim() + (punc ? punc : '');
            return cleanBefore + '\n' + parenthesisText + '\n';
        }
        return before + ' ' + parenthesisText + (punc ? punc : '') + ' ';
    });
    processedText = processedText.replace(/\n+/g, '\n').trim();

    const rawLines = processedText.split('\n');
    const resultLines = [];

    rawLines.forEach(lineText => {
        const trimmed = lineText.trim();
        if (!trimmed) return;

        if (trimmed.startsWith('(')) {
            // Parenthesis backing vocals: keep intact on its own line
            resultLines.push(trimmed);
        } else {
            // Main lyric text: if long (> 7 words), split into 2 balanced lines
            const words = trimmed.split(/\s+/);
            if (words.length > 7) {
                const mid = Math.ceil(words.length / 2);
                resultLines.push(words.slice(0, mid).join(' '));
                resultLines.push(words.slice(mid).join(' '));
            } else {
                resultLines.push(trimmed);
            }
        }
    });

    return resultLines.join('\n');
}
