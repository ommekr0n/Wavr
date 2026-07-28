/**
 * CinematicTextRenderer.js
 * Handles 3D animated typography for Cinematic Mode.
 */
export function triggerCinematicLine(text, cinematicTextContainer) {
    if (!text || !cinematicTextContainer) return;

    const oldLines = cinematicTextContainer.querySelectorAll('.cinematic-line-wrapper');
    oldLines.forEach(line => {
        line.classList.remove('cine-enter');
        line.classList.add('cine-exit');
        const exitingWords = line.querySelectorAll('.cine-word');
        exitingWords.forEach(w => { w.classList.add('glitched'); w.classList.remove('glitch-word-anim'); });
        const rot = (Math.random() - 0.5) * 80;
        const tx = (Math.random() - 0.5) * 60;
        line.style.setProperty('--exit-rot', `${rot}deg`);
        line.style.setProperty('--exit-tx', `${tx}vw`);
        setTimeout(() => { if (line.parentNode) line.remove(); }, 1200);
    });

    const newWrapper = document.createElement('div');
    newWrapper.className = 'cinematic-line-wrapper cine-enter';

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
}

export function preventOrphanWords(text) {
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
