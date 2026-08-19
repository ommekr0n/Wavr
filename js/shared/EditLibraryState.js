/**
 * EditLibraryState.js
 * Central state store for the Edit Library feature.
 * All modules import state from here instead of keeping local copies.
 * Syncs seamlessly with localStorage and Supabase Cloud Vault.
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

// ── Setters ───────────────────────────────────────────────────────────────────
export function setPlaylist(list) {
    state.playlist = list || [];
}

export function setVinylBoxes(boxes) {
    state.vinylBoxes = boxes || [];
}

export function setLibraryOrder(order) {
    state.libraryOrder = order || [];
}

export function clearSelection() {
    state.selectedSongIds.clear();
}

// ── Persistence helpers (localStorage + Supabase Cloud Vault) ────────────────
export async function persistBoxes() {
    updateBoxCache([...state.vinylBoxes], [...state.libraryOrder]);
    await saveLibraryToDB();
}

export async function persistOrder() {
    updateBoxCache([...state.vinylBoxes], [...state.libraryOrder]);
    await saveLibraryToDB();
}

export async function persistAll() {
    updateBoxCache([...state.vinylBoxes], [...state.libraryOrder]);
    await saveLibraryToDB();
}

// ── Load from storage ─────────────────────────────────────────────────────────
export async function loadFromStorage() {
    try {
        // 1. Try memory cache / localStorage first
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

        // 2. If user is logged into Supabase Cloud Vault, check cloud preferences
        if (SupabaseService.isConfigured()) {
            const prefs = await SupabaseService.getUserPreferences();
            if (prefs && Array.isArray(prefs.vinyl_boxes)) {
                boxes = prefs.vinyl_boxes;
                if (Array.isArray(prefs.library_order)) {
                    order = prefs.library_order;
                }
            }
        }

        state.vinylBoxes = boxes || [];
        state.libraryOrder = order || [];
        updateBoxCache(state.vinylBoxes, state.libraryOrder);
    } catch (e) {
        console.warn('Error loading vinyl boxes from storage:', e);
        state.vinylBoxes = [];
        state.libraryOrder = [];
    }
}
