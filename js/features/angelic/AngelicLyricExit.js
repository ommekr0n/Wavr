import { snapshotAngelicEnhancedExit } from './AngelicEnhancedExitSnapshot.js';

const exits = new WeakMap();

export function discardAngelicLyric(wrapper) {
    const release = exits.get(wrapper);
    if (release) release(); else wrapper.remove();
}

/** Fade a cached lyric surface; release its animation listener and fallback together. */
export function exitAngelicLyric(wrapper, duration = .88) {
    if (!wrapper || exits.has(wrapper)) return;
    duration = Math.min(.88, Math.max(.24, duration));
    snapshotAngelicEnhancedExit(wrapper);
    let timer;
    const release = () => {
        clearTimeout(timer);
        wrapper.removeEventListener('animationend', onEnd);
        exits.delete(wrapper);
        wrapper.remove();
    };
    const onEnd = event => {
        if (event.target === wrapper && event.animationName === 'ink-wash-float-composite') release();
    };
    exits.set(wrapper, release);
    wrapper.addEventListener('animationend', onEnd);
    wrapper.style.setProperty('--exit-rot', `${(Math.random() - 0.5) * 2}deg`);
    wrapper.style.setProperty('--angelic-exit-duration', `${duration.toFixed(3)}s`);
    wrapper.classList.add('ink-wash-exit');
    timer = setTimeout(release, duration * 1000 + 20);
}
