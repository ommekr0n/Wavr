/** Saved fallback markup must never remember a renderer's temporary hidden flags. */
export function captureLibraryBoxMarkup(card) {
    const clone = card.cloneNode(true);
    clone.querySelectorAll('.library-object-ready, .three-surface-ready').forEach(node => node.classList.remove('library-object-ready', 'three-surface-ready'));
    return clone.innerHTML;
}
