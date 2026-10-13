import { ArtistIntroAnimation } from './ArtistIntroAnimation.js';
import { BVTGVNG_INTRO, getArtistIntroProfile } from './BvtgvngArtistRegistry.js';
import { prepareArtistIntro } from '../../core/rendering/VisualRenderBridge.js';

/** Start once per track load when the normal player is visible; mode changes consume/cancel it. */
export function setupArtistIntro({ engine, prepareGraphics = prepareArtistIntro }) {
    const abort = new AbortController(), signal = abort.signal;
    const view = document.getElementById('player-view'), cinematic = document.getElementById('cinematic-view'), angelic = document.getElementById('angelic-view');
    const nostalgia = document.getElementById('nostalgia-view');
    const intro = new ArtistIntroAnimation(view), motion = matchMedia('(prefers-reduced-motion: reduce)');
    intro.preload(BVTGVNG_INTRO);
    let pending = null, preparing = null, version = 0;
    const shown = element => !element.classList.contains('hidden');
    const cancel = (consume = true, restoreFocus = false) => {
        version++; preparing = null;
        if (consume) pending = null;
        intro.cancel(restoreFocus);
    };
    const sync = () => {
        if (shown(cinematic) || shown(angelic) || (nostalgia && shown(nostalgia))) { cancel(); return; }
        if (!shown(view) || !view.classList.contains('player-active') || document.hidden) {
            cancel(preparing !== null || !intro.root.hidden); return;
        }
        if (!pending || preparing !== null) return;
        const profile = pending; pending = null;
        if (motion.matches) { intro.play(profile, true); return; }
        const ticket = ++version;
        let graphics;
        try { graphics = prepareGraphics(); } catch { return; }
        const readiness = [intro.preload(profile), graphics].filter(result => result?.then);
        if (!readiness.length) { intro.play(profile, false); return; }
        preparing = ticket;
        Promise.allSettled(readiness).then(results => {
            if (version !== ticket) return;
            preparing = null;
            if (results.some(result => result.status === 'rejected' || result.value === false)) return;
            if (!document.hidden && shown(view) && view.classList.contains('player-active') && !shown(cinematic) && !shown(angelic) && (!nostalgia || !shown(nostalgia))) {
                intro.play(profile, motion.matches);
            }
        });
    };
    engine.addEventListener('trackchange', event => { cancel(); pending = getArtistIntroProfile(event.detail.track); sync(); }, { signal });
    engine.addEventListener('statechange', event => { if (event.detail.state === 'error' || event.detail.state === 'idle') cancel(true, true); }, { signal });
    document.addEventListener('visibilitychange', sync, { signal });
    document.addEventListener('keydown', event => {
        if (document.getElementById('queue-dialog')?.open) return;
        if (intro.root.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancel(true, true); }
    }, { capture: true, signal });
    motion.addEventListener('change', () => cancel(true, true), { signal });
    window.addEventListener('resize', () => cancel(), { signal });
    const observer = new MutationObserver(sync);
    for (const element of [view, cinematic, angelic, nostalgia].filter(Boolean)) observer.observe(element, { attributes: true, attributeFilter: ['class'] });
    const dispose = () => { cancel(); abort.abort(); observer.disconnect(); intro.dispose(); };
    window.addEventListener('pagehide', event => { if (event.persisted) cancel(); else dispose(); }, { signal });
    return dispose;
}
