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

// ── Persistence helpers (100% Pure Cloud Storage) ───────────────────────────
export async function persistBoxes() {}

export async function persistOrder() {}

export async function persistAll() {}

// ── Load from storage ─────────────────────────────────────────────────────────
export async function loadFromStorage() {
    state.vinylBoxes   = [];
    state.libraryOrder = [];
}
