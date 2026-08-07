/**
 * BoxModals.js
 * Handles Playlist Naming Modal (Create/Edit box), Delete Box Modal.
 */
import { state, persistBoxes, persistOrder } from '../../shared/EditLibraryState.js';
import { renderEditGrid } from './EditGridRenderer.js';
import { closeEditBoxExpansion } from './BoxExpansion.js';

// ── Module-level state ────────────────────────────────────────────────────────
let pendingSongIds = [];
let editingBoxId   = null;
let _pendingDeleteBoxId = null;

// ── Playlist Naming Modal (Create / Edit box) ─────────────────────────────────
export function setupPlaylistNamingModal() {
    const modal     = document.getElementById('playlist-name-modal');
    const form      = document.getElementById('playlist-name-form');
    const cancelBtn = document.getElementById('btn-cancel-playlist-name');
    const input     = document.getElementById('playlist-name-input');
    const colorInput = document.getElementById('playlist-color-input');

    if (!modal || !form || !cancelBtn) return;

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        pendingSongIds = [];
        editingBoxId   = null;
        input.value = '';
        state.selectedSongIds.clear();
        document.querySelectorAll('.song-card.selected').forEach(c => c.classList.remove('selected'));
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) return;

        const selectedColor = colorInput ? colorInput.value : '#5a4232';

        if (editingBoxId) {
            const box = state.vinylBoxes.find(b => b.id === editingBoxId);
            if (box) { box.name = name; box.color = selectedColor; }
            editingBoxId = null;
        } else {
            const newBox = {
                id:      'vinyl-' + Date.now(),
                name,
                songIds: [...pendingSongIds],
                color:   selectedColor
            };
            state.vinylBoxes.push(newBox);
            state.libraryOrder.push(newBox.id);
            await persistOrder();
        }

        await persistBoxes();
        renderEditGrid();
        if (window.appMainContext?.renderSongGrid) window.appMainContext.renderSongGrid();

        modal.classList.add('hidden');
        pendingSongIds = [];
        input.value    = '';
    });
}

export function openPlaylistNamingModal(songIds) {
    const modal = document.getElementById('playlist-name-modal');
    if (!modal) return;

    editingBoxId   = null;
    pendingSongIds = songIds;

    const title     = document.getElementById('playlist-modal-title');
    const submitBtn = document.getElementById('btn-submit-playlist-name');
    if (title)     title.textContent     = 'New Vinyl Box';
    if (submitBtn) submitBtn.textContent = 'Create Box';

    const colorInput = document.getElementById('playlist-color-input');
    if (colorInput) {
        const colors = ['#8B4513','#a04838','#385ea0','#428f52','#a03886','#87a038','#38a096','#6938a0','#a07738','#e35959','#59a6e3','#b86614','#2d7a71'];
        colorInput.value = colors[Math.floor(Math.random() * colors.length)];
    }

    const input = document.getElementById('playlist-name-input');
    input.value = '';
    modal.classList.remove('hidden');
    input.focus();
}

export function openEditBoxModal(boxId) {
    const modal = document.getElementById('playlist-name-modal');
    const box   = state.vinylBoxes.find(b => b.id === boxId);
    if (!modal || !box) return;

    editingBoxId   = boxId;
    pendingSongIds = [];

    const title     = document.getElementById('playlist-modal-title');
    const submitBtn = document.getElementById('btn-submit-playlist-name');
    if (title)     title.textContent     = 'Edit Vinyl Box';
    if (submitBtn) submitBtn.textContent = 'Save Changes';

    const input = document.getElementById('playlist-name-input');
    input.value = box.name;

    const colorInput = document.getElementById('playlist-color-input');
    if (colorInput) colorInput.value = box.color || '#5a4232';

    modal.classList.remove('hidden');
    input.focus();
}

// ── Delete Box Modal ──────────────────────────────────────────────────────────
export function showDeleteBoxModal(boxId, boxName) {
    _pendingDeleteBoxId = boxId;
    const msgEl = document.getElementById('delete-box-modal-msg');
    if (msgEl) msgEl.textContent = `"${boxName}" will be removed. The songs inside stay in your library.`;
    const modal = document.getElementById('delete-box-modal');
    if (modal) modal.classList.remove('hidden');
}

export function setupDeleteBoxModal() {
    const modal      = document.getElementById('delete-box-modal');
    const cancelBtn  = document.getElementById('btn-cancel-delete-box');
    const confirmBtn = document.getElementById('btn-confirm-delete-box');
    if (!modal || !cancelBtn || !confirmBtn) return;

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        _pendingDeleteBoxId = null;
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
            _pendingDeleteBoxId = null;
        }
    });

    confirmBtn.addEventListener('click', async () => {
        if (!_pendingDeleteBoxId) return;
        const boxId = _pendingDeleteBoxId;
        _pendingDeleteBoxId = null;
        modal.classList.add('hidden');

        state.vinylBoxes   = state.vinylBoxes.filter(b  => b.id  !== boxId);
        state.libraryOrder = state.libraryOrder.filter(id => id   !== boxId);

        // Pure Cloud Architecture - vinyl boxes persisted via Supabase Cloud DB

        if (window.appMainContext?.updateBoxCache) {
            window.appMainContext.updateBoxCache([...state.vinylBoxes], [...state.libraryOrder]);
            if (window.appMainContext.renderSongGrid) window.appMainContext.renderSongGrid();
        }

        closeEditBoxExpansion();
        renderEditGrid();
    });
}
