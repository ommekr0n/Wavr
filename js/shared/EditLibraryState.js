/**
 * EditLibraryState.js
 * Central state store for the Edit Library feature.
 * All modules import state from here instead of keeping local copies.
 */

// ── Core State ────────────────────────────────────────────────────────────────
export const state = {
    playlist: [],        // Full song list (from main playlist)
    vinylBoxes: [],      // Array of vinyl box objects
    libraryOrder: [],    // Ordered array of item IDs for the edit grid
    selectedSongIds: new Set(),  // Set of currently selected song IDs
};

// ── Setters ───────────────────────────────────────────────────────────────────
export function setPlaylist(list) {
    state.playlist = list;
}

export function setVinylBoxes(boxes) {
    state.vinylBoxes = boxes;
}

export function setLibraryOrder(order) {
    state.libraryOrder = order;
}

export function clearSelection() {
    state.selectedSongIds.clear();
}

// ── Persistence helpers ───────────────────────────────────────────────────────
export async function persistBoxes() {
    await window.localforage.setItem('vinyl_boxes', state.vinylBoxes);
}

export async function persistOrder() {
    await window.localforage.setItem('library_order', state.libraryOrder);
}

export async function persistAll() {
    await persistBoxes();
    await persistOrder();
}

// ── Load from storage ─────────────────────────────────────────────────────────
export async function loadFromStorage() {
    try {
        state.vinylBoxes    = await window.localforage.getItem('vinyl_boxes')   || [];
        state.libraryOrder  = await window.localforage.getItem('library_order') || [];
    } catch (e) {
        console.error('[EditLibraryState] Failed to load from storage', e);
        state.vinylBoxes   = [];
        state.libraryOrder = [];
    }
}
