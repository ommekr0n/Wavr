/**
 * SongContextMenu.js
 * Context menus for Vinyl Boxes and Songs in Edit Library.
 */
import { state, persistBoxes } from '../../shared/EditLibraryState.js';
import { openEditBoxModal, showDeleteBoxModal } from './BoxModals.js';
import { renderEditGrid } from './EditGridRenderer.js';
import { closeEditBoxExpansion, toggleEditBoxExpansion } from './BoxExpansion.js';

let contextMenu     = null;  // Box context menu
let songContextMenu = null;  // Song context menu
let activeBoxId         = null;
let activeSongId        = null;
let activeBoxIdForSong  = null;

// ── Setup ─────────────────────────────────────────────────────────────────────
export function setupContextMenu() {
    // Box context menu
    contextMenu = document.createElement('div');
    contextMenu.className = 'playlist-context-menu hidden';
    contextMenu.innerHTML = `
        <button class="add-songs-option">Add Songs</button>
        <button class="rename-option">Edit Info</button>
        <button class="delete-option">Delete Box</button>
    `;
    document.body.appendChild(contextMenu);

    contextMenu.querySelector('.add-songs-option').addEventListener('click', () => {
        contextMenu.classList.add('hidden');
        if (!activeBoxId) return;
        const box = state.vinylBoxes.find(b => b.id === activeBoxId);
        if (box && window.appMainContext?.openAddSongsModal) {
            window.appMainContext.openAddSongsModal(box, state.vinylBoxes);
        }
    });

    contextMenu.querySelector('.rename-option').addEventListener('click', () => {
        contextMenu.classList.add('hidden');
        if (!activeBoxId) return;
        openEditBoxModal(activeBoxId);
    });

    contextMenu.querySelector('.delete-option').addEventListener('click', () => {
        contextMenu.classList.add('hidden');
        if (!activeBoxId) return;
        const box = state.vinylBoxes.find(b => b.id === activeBoxId);
        if (box) showDeleteBoxModal(box.id, box.name);
    });

    // Song context menu
    songContextMenu = document.createElement('div');
    songContextMenu.className = 'playlist-context-menu hidden';
    songContextMenu.innerHTML = `
        <button class="edit-song-option" style="display:flex;align-items:center;gap:8px;">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Edit Info
        </button>
        <button class="remove-from-box-option danger hidden" style="display:flex;align-items:center;gap:8px;border-top:1px solid rgba(255,255,255,0.05);">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            Remove from Box
        </button>
        <button class="delete-song-option danger" style="display:flex;align-items:center;gap:8px;border-top:1px solid rgba(255,255,255,0.05);">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            Delete
        </button>
    `;
    document.body.appendChild(songContextMenu);

    songContextMenu.querySelector('.edit-song-option').addEventListener('click', () => {
        songContextMenu.classList.add('hidden');
        if (!activeSongId) return;
        if (window.appMainContext?.showEditModalBySongId) {
            window.appMainContext.showEditModalBySongId(activeSongId);
        }
    });

    songContextMenu.querySelector('.remove-from-box-option').addEventListener('click', async () => {
        songContextMenu.classList.add('hidden');
        if (!activeSongId || !activeBoxIdForSong) return;

        const box = state.vinylBoxes.find(b => b.id === activeBoxIdForSong);
        if (box) {
            box.songIds = box.songIds.filter(id => id !== activeSongId);
            await persistBoxes();

            closeEditBoxExpansion();
            renderEditGrid();

            const newCard = document.querySelector(`.vinyl-box-card[data-id="${activeBoxIdForSong}"]`);
            if (newCard) toggleEditBoxExpansion(newCard, activeBoxIdForSong);

            if (window.appMainContext?.updateBoxCache) {
                window.appMainContext.updateBoxCache([...state.vinylBoxes], state.libraryOrder);
            }
            if (window.appMainContext?.renderSongGrid) {
                window.appMainContext.renderSongGrid();
            }
        }
    });

    songContextMenu.querySelector('.delete-song-option').addEventListener('click', () => {
        songContextMenu.classList.add('hidden');
        if (!activeSongId) return;
        if (window.appMainContext?.showDeleteModalBySongId) {
            window.appMainContext.showDeleteModalBySongId(activeSongId);
        }
    });

    // Close menus on outside click
    window.addEventListener('click', (e) => {
        if (contextMenu && !contextMenu.contains(e.target) && !e.target.closest('.playlist-options-btn')) {
            contextMenu.classList.add('hidden');
        }
        if (songContextMenu && !songContextMenu.contains(e.target) && !e.target.closest('.song-options-btn')) {
            songContextMenu.classList.add('hidden');
        }
    });
}

// ── Show helpers ──────────────────────────────────────────────────────────────
export function showContextMenu(x, y, boxId) {
    activeBoxId = boxId;
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top  = `${y}px`;
    contextMenu.classList.remove('hidden');
    songContextMenu.classList.add('hidden');
}

export function showSongContextMenu(x, y, songId, boxId = null) {
    activeSongId       = songId;
    activeBoxIdForSong = boxId;

    const removeOpt = songContextMenu.querySelector('.remove-from-box-option');
    if (removeOpt) {
        if (boxId) removeOpt.classList.remove('hidden');
        else       removeOpt.classList.add('hidden');
    }

    songContextMenu.style.left = `${x}px`;
    songContextMenu.style.top  = `${y}px`;
    songContextMenu.classList.remove('hidden');
    contextMenu.classList.add('hidden');
}
