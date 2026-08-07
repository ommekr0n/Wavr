/**
 * edit-library.js  —  Orchestrator
 * Initialises the Edit Library feature by wiring up all sub-modules.
 * Business logic lives in js/features/library/*.js
 * Shared state lives in js/shared/EditLibraryState.js
 */

// ── Shared state ──────────────────────────────────────────────────────────────
import {
    state,
    setPlaylist,
    loadFromStorage,
    persistAll,
} from '../shared/EditLibraryState.js';

// ── Feature modules ───────────────────────────────────────────────────────────
import { renderEditGrid }                   from '../features/library/EditGridRenderer.js';
import { setupSelectionBox }                from '../features/library/SelectionManager.js';
import { setupDragAndDrop }                 from '../features/library/DragDropEngine.js';
import {
    setupPlaylistNamingModal,
    setupDeleteBoxModal,
    openEditBoxModal,
}                                           from '../features/library/BoxModals.js';
import { setupContextMenu }                 from '../features/library/SongContextMenu.js';
import {
    closeEditBoxExpansion,
    toggleEditBoxExpansion,
} from '../features/library/BoxExpansion.js';

// ── Module-level flags ────────────────────────────────────────────────────────
let _dragDropInitialized = false;
let onDoneCallback       = null;

// ── Settings Panel ────────────────────────────────────────────────────────────
export function initSettings() {
    const colRange       = document.getElementById('settings-columns-range');
    const colVal         = document.getElementById('settings-columns-val');
    const btnSettings    = document.getElementById('btn-settings');
    const btnClose       = document.getElementById('btn-close-settings');
    const settingsModal  = document.getElementById('settings-modal');

    const savedCols = localStorage.getItem('wavr_grid_columns') || '6';
    document.documentElement.style.setProperty('--grid-columns', savedCols);
    if (colRange) colRange.value     = savedCols;
    if (colVal)   colVal.textContent = savedCols;

    btnSettings?.addEventListener('click', () => settingsModal?.classList.remove('hidden'));
    btnClose   ?.addEventListener('click', () => settingsModal?.classList.add('hidden'));

    const btnOpenTutorials = document.getElementById('btn-open-tutorials');
    const modalTutorials   = document.getElementById('modal-tutorials');
    if (btnOpenTutorials && settingsModal && modalTutorials) {
        btnOpenTutorials.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
            modalTutorials.classList.remove('hidden');
        });
    }

    const btnRepairLibrary = document.getElementById('btn-repair-library');
    if (btnRepairLibrary) {
        btnRepairLibrary.addEventListener('click', async () => {
            try {
                window.appMainContext?.showToast?.('Library successfully synced!');
                setTimeout(() => window.location.reload(), 800);
            } catch (err) {
                console.error('Sync failed:', err);
                window.location.reload();
            }
        });
    }

    if (colRange) {
        colRange.addEventListener('input', (e) => {
            const cols = e.target.value;
            if (colVal) colVal.textContent = cols;
            document.documentElement.style.setProperty('--grid-columns', cols);
            localStorage.setItem('wavr_grid_columns', cols);
        });
    }
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function initEditLibrary(mainPlaylist, onDone) {
    onDoneCallback = onDone;

    // Ensure all songs have unique IDs
    mainPlaylist.forEach((song, idx) => {
        if (!song.id) song.id = 'song-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000);
    });
    setPlaylist([...mainPlaylist]);

    await loadFromStorage();

    const btnEditLibrary  = document.getElementById('btn-edit-library');
    const btnEditDone     = document.getElementById('btn-edit-done');
    const homeView        = document.getElementById('home-view');
    const editLibraryView = document.getElementById('edit-library-view');

    // ── Enter Edit Library ────────────────────────────────────────────────────
    btnEditLibrary?.addEventListener('click', async () => {
        window.appMainContext?.stopPlaybackForEdit?.() ?? document.getElementById('mini-player')?.classList.add('hidden');

        if (window.appMainContext?.getPlaylist) {
            setPlaylist([...window.appMainContext.getPlaylist()]);
        }
        await loadFromStorage();

        homeView?.classList.add('hidden');
        editLibraryView?.classList.remove('hidden');
        state.selectedSongIds.clear();

        renderEditGrid();
        setupSelectionBox();

        if (!_dragDropInitialized) {
            setupDragAndDrop();
            _dragDropInitialized = true;
        }
    });

    // ── Done / Save ───────────────────────────────────────────────────────────
    btnEditDone?.addEventListener('click', async () => {
        try {
            await persistAll();
        } catch (e) {
            console.error('Error saving library updates', e);
        }

        window.appMainContext?.updateBoxCache?.(
            [...state.vinylBoxes],
            [...state.libraryOrder]
        );

        editLibraryView?.classList.add('hidden');
        homeView?.classList.remove('hidden');

        onDoneCallback?.();
    });

    // ── One-time modal & menu setups ──────────────────────────────────────────
    setupPlaylistNamingModal();
    setupContextMenu();
    setupDeleteBoxModal();

    // ── Event bus listeners ───────────────────────────────────────────────────
    document.addEventListener('wavr:openEditBox', (e) => {
        const { boxId } = e.detail;
        openEditBoxModal(boxId);
    });

    document.addEventListener('wavr:libraryChanged', async () => {
        await loadFromStorage();
        if (window.appMainContext?.getPlaylist) {
            setPlaylist([...window.appMainContext.getPlaylist()]);
        }
        const editView = document.getElementById('edit-library-view');
        if (editView && !editView.classList.contains('hidden')) renderEditGrid();
    });

    // ── Context bridge for external modules ───────────────────────────────────
    window.appEditLibraryContext = {
        renderEditGrid,
        syncBoxes: (updatedBoxes) => {
            state.vinylBoxes = updatedBoxes;
            const editView = document.getElementById('edit-library-view');
            if (!editView || editView.classList.contains('hidden')) return;

            const expandedBoxId = document.querySelector('.vinyl-box-card.expanded-active')?.getAttribute('data-id') ?? null;
            closeEditBoxExpansion();
            renderEditGrid();

            if (expandedBoxId) {
                const newCard = document.querySelector(`.vinyl-box-card[data-id="${expandedBoxId}"]`);
                if (newCard) toggleEditBoxExpansion(newCard, expandedBoxId);
            }
        }
    };
}
