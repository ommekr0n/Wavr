import { exitAngelicLyric, discardAngelicLyric } from './AngelicLyricExit.js';

const pending = new Map();

function cancelFrame(wrapper) {
    const frame = pending.get(wrapper);
    if (frame) cancelAnimationFrame(frame.id);
    pending.delete(wrapper);
}

export function cancelAngelicLineTransitions(root) {
    for (const [wrapper, frame] of pending) if (frame.root === root) cancelFrame(wrapper);
    root?.querySelectorAll('.ink-wash-exit').forEach(discardAngelicLyric);
}

function retainLatestExit(root) {
    const outgoing = Array.from(root.querySelectorAll('.ink-wash-exit'));
    outgoing.slice(0, -1).forEach(discardAngelicLyric);
}

export function clearAngelicLine(root, duration = .88) {
    if (!root) return;
    for (const wrapper of root.querySelectorAll('.angelic-line-wrapper:not(.angelic-prebuilt):not(.ink-wash-exit)')) {
        cancelFrame(wrapper);
        exitAngelicLyric(wrapper, duration);
    }
    retainLatestExit(root);
}

/** Bound live surfaces and tie enhanced word flight delays to the current audio position. */
export function activateAngelicLine(root, wrapper, index, timing = {}) {
    for (const other of root.querySelectorAll('.angelic-line-wrapper')) {
        if (other === wrapper) continue;
        cancelFrame(other);
        if (other.classList.contains('angelic-prebuilt')) {
            if (Number(other.getAttribute('data-lyric-index')) !== index + 1) other.remove();
        } else exitAngelicLyric(other, timing.exitDuration ?? .88);
    }
    retainLatestExit(root);
    cancelFrame(wrapper);
    for (const word of wrapper.querySelectorAll('[data-word-start]')) {
        const delay = .15 + Number(word.getAttribute('data-word-start')) * (timing.driftRatio ?? 1) - (timing.currentTime ?? timing.start ?? 0);
        word.style.setProperty('--word-delay', `${delay.toFixed(3)}s`);
    }
    wrapper.classList.remove('angelic-prebuilt');
    wrapper.removeAttribute('aria-hidden');
    const id = requestAnimationFrame(() => {
        pending.delete(wrapper);
        if (!wrapper.isConnected || wrapper.classList.contains('ink-wash-exit')) return;
        wrapper.classList.add('angelic-enter-wrapper');
        root.querySelector('.angelic-clef-symbol')?.classList.add('enter');
    });
    pending.set(wrapper, { root, id });
}
