import { state } from '../../shared/EditLibraryState.js';

/** A selected jacket carries the visible selection; an unselected one carries itself. */
export function getLibraryDraggedSongIds(card) {
    if (card.classList.contains('vinyl-box-card')) return [];
    const id = card.dataset.id;
    if (!state.selectedSongIds.has(id)) return id ? [id] : [];
    return [...card.parentElement.children].map(node => node.dataset.id).filter(songId => state.selectedSongIds.has(songId));
}

export function settleLibraryDraggedGroup(grid, card, ids, originalOrder) {
    if (ids.length < 2) return;
    const selected = new Set(ids);
    let anchor = card.nextSibling;
    while (anchor && selected.has(anchor.dataset?.id)) anchor = anchor.nextSibling;
    for (const node of originalOrder) if (selected.has(node.dataset?.id)) grid.insertBefore(node, anchor);
}
