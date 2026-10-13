/**
 * NostalgiaBackground.js
 * Retro-inspired background typography effects for Nostalgia mode:
 * - 'tape': Bi-directional endless repeating ticker (MTV / Winamp counter-marquee)
 * - 'bounce': Ping-pong rebound between screen bounds (Windows Screensaver Marquee)
 * - 'dvd': 2D angled corner-bounce reflection (DVD Screensaver)
 */

const SEPARATOR = '   •   ';
const MODES = ['tape', 'bounce', 'dvd'];

function measureWidth(el, fallbackText = '') {
    if (!el) return 0;
    if (typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        if (rect && rect.width > 0) return rect.width;
    }
    if (typeof el.offsetWidth === 'number' && el.offsetWidth > 0) {
        return el.offsetWidth;
    }
    const len = fallbackText ? fallbackText.length : (el.textContent?.length || 10);
    return Math.max(300, len * 70);
}

function getViewportWidth() {
    return typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1920;
}

function getViewportHeight() {
    return typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 1080;
}

export function createNostalgiaBackground(view, { titleEl, artistEl, modeLabelEl, screenEl } = {}) {
    let mode = 'tape';
    try {
        const stored = typeof localStorage !== 'undefined' && localStorage.getItem('wavr-nostalgia-bg-mode');
        if (stored && MODES.includes(stored)) mode = stored;
    } catch {
        // Fall back to default mode when localStorage is restricted
    }

    let trackTitle = '';
    let trackArtist = '';
    let segmentWidthTitle = 0;
    let segmentWidthArtist = 0;
    let lastTime = 0;
    let idleAccumulator = 0;
    const abort = new AbortController();
    const { signal } = abort;

    function getDoc(container) {
        return container?.ownerDocument || view?.ownerDocument || (typeof document !== 'undefined' ? document : null) || globalThis.document;
    }

    function createSpan(container) {
        const doc = getDoc(container);
        if (doc && typeof doc.createElement === 'function') return doc.createElement('span');
        return { tag: 'span', className: '', textContent: '' };
    }

    function buildTapeDom(container, text, count = 5) {
        if (!container) return;
        container.replaceChildren();
        const base = text + SEPARATOR;
        for (let i = 0; i < count; i++) {
            const span = createSpan(container);
            span.className = 'nostalgia-ghost-seg';
            span.textContent = base;
            container.append(span);
        }
    }

    function buildSingleDom(container, text) {
        if (!container) return;
        container.replaceChildren();
        const span = createSpan(container);
        span.className = 'nostalgia-ghost-seg';
        span.textContent = text;
        container.append(span);
    }

    function measureSegments() {
        const firstTitleSeg = titleEl?.querySelector?.('.nostalgia-ghost-seg');
        segmentWidthTitle = measureWidth(firstTitleSeg, trackTitle + SEPARATOR);

        const firstArtistSeg = artistEl?.querySelector?.('.nostalgia-ghost-seg');
        segmentWidthArtist = measureWidth(firstArtistSeg, (trackArtist || trackTitle) + SEPARATOR);
    }

    function updateDomForMode() {
        const artistText = trackArtist || trackTitle || 'NOSTALGIA';
        const titleText = trackTitle || 'Untitled';

        if (mode === 'tape') {
            buildTapeDom(titleEl, titleText, 6);
            buildTapeDom(artistEl, artistText, 6);
        } else {
            buildSingleDom(titleEl, titleText);
            buildSingleDom(artistEl, artistText);
        }

        measureSegments();
        updateLabel();
    }

    function updateLabel() {
        if (!modeLabelEl) return;
        const labels = {
            tape: 'NOSTALGIA • TAPE',
            bounce: 'NOSTALGIA • BOUNCE',
            dvd: 'NOSTALGIA • DVD'
        };
        modeLabelEl.textContent = labels[mode] || 'NOSTALGIA';
        modeLabelEl.title = `Retro background style: ${mode.toUpperCase()} (Click to change)`;
    }

    function cycleMode() {
        const currentIndex = MODES.indexOf(mode);
        mode = MODES[(currentIndex + 1) % MODES.length];
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('wavr-nostalgia-bg-mode', mode);
            }
        } catch {
            // Ignore storage quota / privacy errors
        }
        updateDomForMode();
    }

    function setTrack(title, artist) {
        trackTitle = (title || '').trim();
        trackArtist = (artist || '').trim();
        updateDomForMode();
    }

    function sync(time, isPaused) {
        if (!titleEl || !artistEl) return;

        if (isPaused) {
            idleAccumulator += 1 / 60;
        } else {
            lastTime = time;
        }

        const t = (Number.isFinite(lastTime) ? lastTime : 0) + idleAccumulator * 0.35;
        const vw = getViewportWidth();
        const vh = getViewportHeight();

        if (mode === 'tape') {
            const w1 = Math.max(100, segmentWidthTitle || 600);
            const w2 = Math.max(100, segmentWidthArtist || 600);

            // Title flows right-to-left seamlessly
            const speed1 = 64; // px per second
            const offset1 = -((t * speed1) % w1);
            const waveY1 = Math.sin(t * 0.75) * 12;

            // Artist flows left-to-right (counter-flow) seamlessly
            const speed2 = 52;
            const offset2 = ((t * speed2) % w2) - w2;
            const waveY2 = Math.cos(t * 0.6) * 10;

            const t1 = `translate3d(${offset1.toFixed(1)}px, ${waveY1.toFixed(1)}px, 0) scaleY(1.16)`;
            const t2 = `translate3d(${offset2.toFixed(1)}px, ${waveY2.toFixed(1)}px, 0) scaleY(1.08)`;

            titleEl.style.transform = t1;
            titleEl.style.setProperty?.('transform', t1);
            artistEl.style.transform = t2;
            artistEl.style.setProperty?.('transform', t2);
        } else if (mode === 'bounce') {
            // Windows Screensaver rebound oscillation
            const span1 = Math.max(200, vw - measureWidth(titleEl, trackTitle));
            const span2 = Math.max(200, vw - measureWidth(artistEl, trackArtist || trackTitle));

            // Smooth ease-in-out cosine rebound (no teleport, ping-pongs between margins)
            const p1 = 0.5 - 0.5 * Math.cos(t * (Math.PI * 2 / 18));
            const p2 = 0.5 - 0.5 * Math.cos(t * (Math.PI * 2 / 24) + 1.2);

            const x1 = Math.max(-100, p1 * span1);
            const x2 = Math.max(-100, p2 * span2);
            const y1 = Math.sin(t * 0.5) * 8;
            const y2 = Math.cos(t * 0.45) * 8;

            const t1 = `translate3d(${x1.toFixed(1)}px, ${y1.toFixed(1)}px, 0) scaleY(1.16)`;
            const t2 = `translate3d(${x2.toFixed(1)}px, ${y2.toFixed(1)}px, 0) scaleY(1.08)`;

            titleEl.style.transform = t1;
            titleEl.style.setProperty?.('transform', t1);
            artistEl.style.transform = t2;
            artistEl.style.setProperty?.('transform', t2);
        } else if (mode === 'dvd') {
            // DVD Screensaver corner bounce
            const w1 = measureWidth(titleEl, trackTitle);
            const w2 = measureWidth(artistEl, trackArtist || trackTitle);
            const spanX1 = Math.max(100, vw - w1);
            const spanX2 = Math.max(100, vw - w2);
            const spanY = Math.max(100, vh * 0.45);

            function pingPong(val, max) {
                if (max <= 0) return 0;
                const mod = val % (max * 2);
                return mod < max ? mod : max * 2 - mod;
            }

            const x1 = pingPong(t * 70, spanX1);
            const y1 = pingPong(t * 45, spanY);
            const x2 = pingPong(t * 62 + 200, spanX2);
            const y2 = pingPong(t * 40 + 150, spanY);

            const t1 = `translate3d(${x1.toFixed(1)}px, ${y1.toFixed(1)}px, 0) scaleY(1.16)`;
            const t2 = `translate3d(${x2.toFixed(1)}px, ${y2.toFixed(1)}px, 0) scaleY(1.08)`;

            titleEl.style.transform = t1;
            titleEl.style.setProperty?.('transform', t1);
            artistEl.style.transform = t2;
            artistEl.style.setProperty?.('transform', t2);
        }
    }

    if (modeLabelEl) {
        modeLabelEl.addEventListener('click', cycleMode, { signal });
    }

    if (screenEl) {
        screenEl.addEventListener('dblclick', cycleMode, { signal });
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', measureSegments, { passive: true, signal });
    }

    return {
        setTrack,
        sync,
        cycleMode,
        getMode: () => mode,
        dispose() {
            abort.abort();
            titleEl?.replaceChildren?.();
            artistEl?.replaceChildren?.();
        }
    };
}
