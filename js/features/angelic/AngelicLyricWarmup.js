/** Keep at most two prepared lyric surfaces rasterized before their pop starts. */
export function warmAngelicLyric(wrapper) {
    const root = wrapper.parentElement;
    if (!root) return;
    wrapper.setAttribute('aria-hidden', 'true');
    const prepared = Array.from(root.querySelectorAll('.angelic-prebuilt.angelic-prewarm'));
    while (prepared.length >= 2) prepared.shift().classList.remove('angelic-prewarm');
    wrapper.classList.add('angelic-prewarm');
}
