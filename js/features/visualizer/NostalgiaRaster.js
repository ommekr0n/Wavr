const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const closingPunctuation = /^[、。，！？）」』】ーぁぃぅぇぉっゃゅょァィゥェォッャュョヮ]/u;

/** Keep accents and kana marks intact while fitting a small video subtitle frame. */
export function wrapNostalgiaText(text, measure, maxWidth) {
    const rows = [];
    for (const paragraph of text.normalize('NFC').split('\n')) {
        const tokens = paragraph.match(/\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) || [''];
        let row = '';
        for (const token of tokens) {
            const parts = measure(token.trim()) > maxWidth
                ? [...graphemes.segment(token)].map(part => part.segment) : [token];
            for (const part of parts) {
                if (row.trim() && measure(row + part) > maxWidth && !closingPunctuation.test(part)) {
                    rows.push(row.trim()); row = part.trimStart();
                } else row += part;
            }
        }
        rows.push(row.trim());
    }
    return rows;
}

/** Rasterize on cue/resize/font changes, then let the browser scale the small frame. */
export function createNostalgiaRaster(view, root, canvas) {
    const context = canvas?.getContext?.('2d');
    if (!context) return { paint() {}, dispose() {} };
    const fonts = document.fonts;
    let disposed = false, signature = '', lastFrame = null;
    const loadedScripts = new Set();

    function paint(force = false) {
        if (disposed || view.classList.contains('hidden')) return;
        const rect = view.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const width = rect.width < 600 ? 240 : 480;
        const height = Math.round(width * rect.height / rect.width);
        const title = root.dataset.cue === 'title';
        const text = [...root.children].filter(node => node.classList.contains('nostalgia-line'))
            .map(node => (node.children.length
                ? [...node.children].map(row => row.textContent.trim()).join('\n')
                : node.textContent).trim().normalize('NFC'));
        const key = JSON.stringify([text, title, width, height]);
        if (!force && signature === key) return;
        signature = key;
        lastFrame = { width, height };
        canvas.width = width; canvas.height = height;
        context.clearRect(0, 0, width, height);
        view.classList.add('nostalgia-raster-ready');
        if (!text.length) return;

        const family = getComputedStyle(view).getPropertyValue('--nostalgia-hand').trim();
        let size = title ? (width === 240 ? 22 : 28) : (width === 240 ? 16 : 20);
        const maxWidth = width * .86;
        let rows;
        do {
            context.font = `italic 700 ${size}px ${family}`;
            rows = text.flatMap(line => wrapNostalgiaText(line, value => context.measureText(value).width, maxWidth));
            if (rows.length <= (title ? 2 : 4)) break;
        } while (--size > 12);

        context.textAlign = 'center'; context.textBaseline = 'middle';
        const leading = size * (title ? 1.5 : 1.9);
        const center = height / 2;
        rows.forEach((row, index) => {
            const y = center + (index - (rows.length - 1) / 2) * leading;
            // A low-resolution drop shadow and slight colour bleed, as in the source video.
            context.filter = 'blur(.25px)';
            context.shadowColor = '#071c35c9'; context.shadowBlur = 1.4;
            context.shadowOffsetX = 2.1; context.shadowOffsetY = 2.6;
            context.fillStyle = '#f9fcff'; context.fillText(row, width / 2, y);
            context.shadowColor = 'transparent'; context.shadowBlur = 0;
            context.shadowOffsetX = 0; context.shadowOffsetY = 0;
            context.fillStyle = '#75d9f04a'; context.fillText(row, width / 2 - .7, y - .2);
        });

        const sample = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text.join('')) ? 'aあ' : 'a';
        if (fonts && !loadedScripts.has(sample)) {
            loadedScripts.add(sample);
            fonts.load(context.font, sample).then(() => {
                signature = '';
                if (!disposed) paint(true);
            }).catch(() => {});
        }
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => paint()) : null;
    observer?.observe(view);
    const onFonts = () => { signature = ''; paint(true); };
    fonts?.addEventListener('loadingdone', onFonts);
    return {
        paint,
        dispose() {
            if (disposed) return;
            disposed = true; observer?.disconnect();
            fonts?.removeEventListener('loadingdone', onFonts);
            if (lastFrame) context.clearRect(0, 0, lastFrame.width, lastFrame.height);
            view.classList.remove('nostalgia-raster-ready');
        }
    };
}
