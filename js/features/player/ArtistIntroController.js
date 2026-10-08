import { ArtistIntroAnimation } from './ArtistIntroAnimation.js';
import { BVTGVNG_INTRO, getArtistIntroProfile } from './BvtgvngArtistRegistry.js';

/** Start once per track load when the normal player is visible; mode changes consume/cancel it. */
export function setupArtistIntro({ engine }) {
    const abort = new AbortController(), signal = abort.signal;
    const view = document.getElementById('player-view'), cinematic = document.getElementById('cinematic-view'), angelic = document.getElementById('angelic-view');
    const intro = new ArtistIntroAnimation(view), motion = matchMedia('(prefers-reduced-motion: reduce)');
    intro.preload(BVTGVNG_INTRO);
    let pending = null;
    const shown = element => !element.classList.contains('hidden');
    const sync = () => {
        if (shown(cinematic) || shown(angelic)) { pending = null; intro.cancel(false); return; }
        if (!shown(view) || !view.classList.contains('player-active') || document.hidden) { intro.cancel(false); return; }
        if (pending) { const profile = pending; pending = null; intro.play(profile, motion.matches); }
    };
    engine.addEventListener('trackchange', event => { pending = getArtistIntroProfile(event.detail.track); intro.cancel(false); sync(); }, { signal });
    engine.addEventListener('statechange', event => { if (event.detail.state === 'error' || event.detail.state === 'idle') { pending = null; intro.cancel(); } }, { signal });
    document.addEventListener('visibilitychange', sync, { signal });
    document.addEventListener('keydown', event => {
        if (document.getElementById('queue-dialog')?.open) return;
        if (intro.root.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); intro.cancel(); }
    }, { capture: true, signal });
    motion.addEventListener('change', () => intro.cancel(), { signal });
    const observer = new MutationObserver(sync);
    for (const element of [view, cinematic, angelic]) observer.observe(element, { attributes: true, attributeFilter: ['class'] });
    const dispose = () => { pending = null; abort.abort(); observer.disconnect(); intro.dispose(); };
    window.addEventListener('pagehide', event => { if (event.persisted) intro.cancel(false); else dispose(); }, { signal });
    return dispose;
}
