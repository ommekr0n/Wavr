/**
 * EditLibraryState.js
 * Central state store for the Edit Library feature.
 * Instant zero-lag synchronous state management with background cloud sync.
 */
import { SupabaseService } from '../services/SupabaseService.js';
import { getCachedVinylBoxes, getCachedLibraryOrder, updateBoxCache, saveLibraryToDB } from '../features/library/HomeGridRenderer.js';

// ── Core State ────────────────────────────────────────────────────────────────
export const state = {
    playlist: [],        // Full song list (from main playlist)
    vinylBoxes: [],      // Array of vinyl box objects
    libraryOrder: [],    // Ordered array of item IDs for the edit grid
    selectedSongIds: new Set(),  // Set of currently selected song IDs
};

let localMutationVersion = 0;

// ── Setters ───────────────────────────────────────────────────────────────────
export function setPlaylist(list) {
    state.playlist = list || [];
}

export function setVinylBoxes(boxes) {
    localMutationVersion++;
    state.vinylBoxes = boxes || [];
}

export function setLibraryOrder(order) {
    localMutationVersion++;
    state.libraryOrder = order || [];
}

export function clearSelection() {
    state.selectedSongIds.clear();
}

// ── Persistence helpers (Instant localStorage + Background Cloud Vault) ──────
export function persistBoxes() {
    localMutationVersion++;
    updateBoxCache([...state.vinylBoxes], [...state.libraryOrder]);
}

export function persistOrder() {
    localMutationVersion++;
    updateBoxCache([...state.vinylBoxes], [...state.libraryOrder]);
}

export function persistAll() {
    localMutationVersion++;
    updateBoxCache([...state.vinylBoxes], [...state.libraryOrder]);
}

// ── Load from storage (Instant sync) ──────────────────────────────────────────
export function loadFromStorage() {
    try {
        // 1. Instant load from memory cache / localStorage
        let boxes = getCachedVinylBoxes();
        let order = getCachedLibraryOrder();

        if (!boxes || boxes.length === 0) {
            const savedBoxes = localStorage.getItem('wavr_vinyl_boxes');
            if (savedBoxes) boxes = JSON.parse(savedBoxes);
        }
        if (!order || order.length === 0) {
            const savedOrder = localStorage.getItem('wavr_library_order');
            if (savedOrder) order = JSON.parse(savedOrder);
        }

        state.vinylBoxes = boxes || [];
        state.libraryOrder = order || [];
        updateBoxCache(state.vinylBoxes, state.libraryOrder);

        // 2. Background check if cloud preferences have newer data
        if (SupabaseService.isConfigured()) {
            const versionAtStart = localMutationVersion;
            SupabaseService.getUserPreferences().then((prefs) => {
                if (localMutationVersion !== versionAtStart) return;
                if (prefs && Array.isArray(prefs.vinyl_boxes) && prefs.vinyl_boxes.length > 0) {
                    state.vinylBoxes = prefs.vinyl_boxes;
                    if (Array.isArray(prefs.library_order)) {
                        state.libraryOrder = prefs.library_order;
                    }
                    updateBoxCache(state.vinylBoxes, state.libraryOrder);
                }
            }).catch(() => {});
        }
    } catch (e) {
        console.warn('Error loading vinyl boxes from storage:', e);
        state.vinylBoxes = [];
        state.libraryOrder = [];
    }
}
