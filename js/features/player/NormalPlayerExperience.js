import { setupProgressLyricPreview } from './ProgressLyricPreview.js';

/** Accessible player state and lyric focus; playback stays in its existing controller. */
export function setupNormalPlayerExperience() {
    const abort = new AbortController(), signal = abort.signal;
    const view = document.getElementById('player-view'), audio = document.getElementById('audio-player');
    const status = document.getElementById('sleeve-playback-state'), focus = document.getElementById('btn-lyrics-focus');
    const syncState = () => {
        view.classList.toggle('sleeve-playing', !audio.paused);
        status.textContent = audio.paused ? 'ON THE SLEEVE' : 'NOW PLAYING';
    };
    for (const event of ['play', 'pause', 'ended', 'emptied']) audio.addEventListener(event, syncState, { signal });
    focus.addEventListener('click', () => {
        const active = view.classList.toggle('lyrics-focused');
        focus.setAttribute('aria-pressed', String(active));
        focus.title = active ? 'Show all lyrics' : 'Focus lyrics';
        focus.setAttribute('aria-label', focus.title);
    }, { signal });
    setupProgressLyricPreview(signal); syncState();
    return () => abort.abort();
}
