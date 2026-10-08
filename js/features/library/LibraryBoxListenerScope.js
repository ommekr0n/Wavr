const scopes = new WeakMap();

/** Replacing a box's HTML must also retire its previous inner-drag listener. */
export function bindLibraryBoxPointer(card, listener) {
    clearLibraryBoxPointer(card);
    const scope = new AbortController(); scopes.set(card, scope);
    card.addEventListener('pointerdown', listener, { signal: scope.signal });
}

export function clearLibraryBoxPointer(card) { scopes.get(card)?.abort(); scopes.delete(card); }

export function restoreLibraryBoxDelete(card, boxId, onDelete) {
    card.querySelector('.btn-delete-box')?.addEventListener('click', event => {
        event.stopPropagation(); onDelete(boxId, card.querySelector('.song-card-title')?.textContent || 'Vinyl box');
    });
}
