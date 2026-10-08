/** Short jacket insertion; WAAPI cancellation and page lifecycle own cleanup. */
export function animateLibraryInsertion(songIds, targetSlot) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = targetSlot.querySelector('.vinyl-box-visual')?.getBoundingClientRect();
    if (!target) return;
    const cards = [...document.querySelectorAll('.edit-grid > .song-card')];
    for (const id of songIds.slice(0, 4)) {
        const cover = cards.find(card => card.dataset.id === id)?.querySelector('img');
        if (!cover) continue;
        const rect = cover.getBoundingClientRect();
        const clone = document.createElement('img'); clone.src = cover.src; clone.alt = ''; clone.className = 'library-insertion-jacket';
        Object.assign(clone.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        document.body.appendChild(clone);
        const dx = target.left + target.width * .5 - rect.left - rect.width * .5;
        const dy = target.top + target.height * .35 - rect.top - rect.height * .5;
        const animation = clone.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${dx}px,${dy - 12}px) scale(.6) rotate(-4deg)`, opacity: .95, offset: .7 },
            { transform: `translate(${dx}px,${dy + 18}px) scale(.58) rotate(-4deg)`, opacity: 0 },
        ], { duration: 280, easing: 'cubic-bezier(.2,.7,.2,1)' });
        const clean = () => { clone.remove(); window.removeEventListener('pagehide', clean); };
        animation.finished.then(clean, clean); window.addEventListener('pagehide', clean, { once: true });
    }
}
