import { LyricEngine } from '../lyrics/LyricEngine.js';

/** Inspect the lyric at a seek position without moving playback. */
export function setupProgressLyricPreview(signal) {
    const input = document.getElementById('progress-slider'), tooltip = document.getElementById('progress-lyric-preview');
    const audio = document.getElementById('audio-player');
    const clock = tooltip.querySelector('span'), text = tooltip.querySelector('p');
    const show = percent => {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const time = Math.max(0, Math.min(1, percent)) * audio.duration;
        const lyrics = LyricEngine.getCurrentLyrics(), drift = LyricEngine.getDriftRatio();
        let lo = 0, hi = lyrics.length - 1, found = -1;
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (lyrics[mid].time * drift <= time) { found = mid; lo = mid + 1; } else hi = mid - 1; }
        clock.textContent = `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
        text.textContent = lyrics[found]?.text?.replace(/<\d[^>]*>/g, '') || 'Instrumental';
        tooltip.style.left = `${Math.max(12, Math.min(88, percent * 100))}%`; tooltip.hidden = false;
    };
    input.addEventListener('pointermove', event => { const rect = input.getBoundingClientRect(); show((event.clientX - rect.left) / rect.width); }, { signal });
    input.addEventListener('input', () => show(Number(input.value) / 100), { signal });
    for (const event of ['pointerleave', 'blur', 'change']) input.addEventListener(event, () => { tooltip.hidden = true; }, { signal });
    const hide = () => { tooltip.hidden = true; };
    for (const event of ['emptied', 'loadstart']) audio.addEventListener(event, hide, { signal });
    const view = document.getElementById('player-view'), lyricRoot = document.getElementById('lyrics-list');
    const observer = new MutationObserver(changes => {
        if (view.classList.contains('hidden') || !view.classList.contains('player-active') || changes.some(change => change.target === lyricRoot)) hide();
    });
    observer.observe(lyricRoot, { childList: true });
    observer.observe(view, { attributes: true, attributeFilter: ['class'] });
    signal.addEventListener('abort', () => { observer.disconnect(); hide(); }, { once: true });
}
