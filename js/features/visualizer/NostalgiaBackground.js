const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x); };

/** Editorial windows include breathing room; they are not equal thirds or beat detection. */
export function resolveNostalgiaBackground(time, duration) {
    const end = Number.isFinite(duration) && duration > 0 ? duration : 180;
    const t = Math.max(0, Number.isFinite(time) ? time : 0);
    const artistStart = end * .08, artistEnd = end * .30;
    const titleStart = end * .38, titleEnd = end * .65;
    const splitStart = end * .66, splitEnd = end * .97;
    const blend = Math.min(3, end * .025);
    const envelope = (start, finish) => smooth((t - start) / blend) * smooth((finish - t) / blend);
    const localTime = (start, finish) => Math.max(0, Math.min(t, finish) - start);
    const splitOpacity = envelope(splitStart, splitEnd);
    return {
        phase: t >= end ? 'ended' : t >= splitStart ? 'split' : t >= titleStart ? 'title'
            : t >= artistEnd || t < artistStart ? 'quiet' : 'artist',
        artistOpacity: envelope(artistStart, artistEnd) + splitOpacity,
        titleOpacity: envelope(titleStart, titleEnd) + splitOpacity,
        artistTime: t >= splitStart ? localTime(splitStart, splitEnd) : localTime(artistStart, artistEnd),
        titleTime: t >= splitStart ? localTime(splitStart, splitEnd) : localTime(titleStart, titleEnd),
    };
}

/** A slow single drift. Long credits never move faster and never wrap back into view. */
export function nostalgiaTextPosition(viewportWidth, textWidth, elapsed, direction = -1, still = false) {
    const center = (viewportWidth - textWidth) / 2;
    if (still) return center;
    return center + direction * viewportWidth * (Math.max(0, elapsed) * .018 - .36);
}

/** Uses playback time only: pause freezes the scene and seeks reconstruct it directly. */
export function createNostalgiaBackground(view, { titleEl, artistEl } = {}) {
    const abort = new AbortController(), { signal } = abort;
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const doc = view?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    let width = 0, titleWidth = 0, rows = [];
    let lastTime = 0, lastDuration = NaN, disposed = false;

    function measure() {
        width = view?.clientWidth || (typeof window !== 'undefined' && window.innerWidth) || 1920;
        titleWidth = titleEl?.scrollWidth || width;
        rows = Array.from(artistEl?.children || [], element => ({ element, width: element.scrollWidth || width }));
    }

    function setTrack(title, artist) {
        if (titleEl) titleEl.textContent = (title || 'Untitled').trim();
        if (artistEl) {
            const credits = (artist || '').trim().split(/\s*(?:,|&|×|\bfeat\.?\s|\bwith\s)\s*/iu).filter(Boolean);
            artistEl.replaceChildren();
            credits.forEach((credit, index) => {
                const row = doc.createElement('div');
                row.className = 'nostalgia-artist-row';
                row.textContent = credit;
                row.style.top = `${(index + .5) / credits.length * 100}%`;
                artistEl.append(row);
            });
        }
        measure();
    }

    function sync(time, duration) {
        if (disposed) return;
        lastTime = time; lastDuration = duration;
        const scene = resolveNostalgiaBackground(time, duration);
        if (view) view.dataset.backgroundPhase = scene.phase;
        const still = Boolean(reducedMotion?.matches);
        const split = scene.phase === 'split';
        const letteringOpacity = split ? .12 : .16;
        if (artistEl) {
            artistEl.style.height = split ? '50%' : '100%';
            artistEl.style.opacity = String(scene.artistOpacity * letteringOpacity);
            rows.forEach(({ element, width: rowWidth }, index) => {
                const x = nostalgiaTextPosition(width, rowWidth, scene.artistTime, index % 2 ? 1 : -1, still);
                element.style.transform = `translate3d(${x.toFixed(1)}px, -50%, 0)`;
            });
        }
        if (titleEl) {
            titleEl.style.top = split ? '75%' : '50%';
            titleEl.style.opacity = String(scene.titleOpacity * letteringOpacity);
            const x = nostalgiaTextPosition(width, titleWidth, scene.titleTime, split ? 1 : -1, still);
            titleEl.style.transform = `translate3d(${x.toFixed(1)}px, -50%, 0) scaleY(${split ? 1 : 1.65})`;
        }
        return scene;
    }

    function resize() { measure(); sync(lastTime, lastDuration); }
    if (typeof window !== 'undefined') {
        window.addEventListener('resize', resize, { passive: true, signal });
        reducedMotion?.addEventListener('change', resize, { signal });
    }
    doc?.fonts?.ready.then(() => { if (!disposed) resize(); });
    doc?.fonts?.addEventListener('loadingdone', resize, { signal });
    return { setTrack, sync, dispose() {
        disposed = true; abort.abort(); rows = [];
        artistEl?.replaceChildren(); titleEl?.replaceChildren();
    } };
}
