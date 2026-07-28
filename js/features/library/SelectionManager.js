/**
 * SelectionManager.js
 * Manages lasso (rubber-band) selection and floating action bar for Edit Library.
 */
import { state, clearSelection } from '../../shared/EditLibraryState.js';
import { openPlaylistNamingModal } from './BoxModals.js';

let _selectionAbortController = null;
let _floatingBar = null;

// ── Lasso Selection ───────────────────────────────────────────────────────────
export function setupSelectionBox() {
    const container = document.querySelector('.edit-grid-container');
    const grid = document.getElementById('edit-song-grid');
    if (!container || !grid) return;

    // Abort previous listeners (prevents accumulation on every Edit open)
    if (_selectionAbortController) _selectionAbortController.abort();
    _selectionAbortController = new AbortController();
    const { signal } = _selectionAbortController;

    let startX = 0, startY = 0, isSelecting = false, selectionBox = null;

    container.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || (e.target !== container && e.target !== grid)) return;
        const rect = grid.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        isSelecting = true;
        selectionBox = document.createElement('div');
        selectionBox.className = 'selection-box';
        selectionBox.style.left = startX + 'px';
        selectionBox.style.top = startY + 'px';
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        grid.appendChild(selectionBox);
    }, { signal });

    window.addEventListener('mousemove', (e) => {
        if (!isSelecting || !selectionBox) return;
        const rect = grid.getBoundingClientRect();
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        selectionBox.style.left   = Math.min(startX, cx) + 'px';
        selectionBox.style.top    = Math.min(startY, cy) + 'px';
        selectionBox.style.width  = Math.abs(startX - cx) + 'px';
        selectionBox.style.height = Math.abs(startY - cy) + 'px';
        const cards = grid.querySelectorAll('.song-card:not(.vinyl-box-card)');
        const br = selectionBox.getBoundingClientRect();
        cards.forEach(card => {
            const cr  = card.getBoundingClientRect();
            const sid = card.getAttribute('data-id');
            const hit = !(cr.right < br.left || cr.left > br.right || cr.bottom < br.top || cr.top > br.bottom);
            if (hit) { state.selectedSongIds.add(sid);    card.classList.add('selected'); }
            else     { state.selectedSongIds.delete(sid); card.classList.remove('selected'); }
        });
    }, { signal });

    window.addEventListener('mouseup', () => {
        if (isSelecting) {
            isSelecting = false;
            if (selectionBox) { selectionBox.remove(); selectionBox = null; }
            updateSelectionBar();
        }
    }, { signal });
}

// ── Floating Selection Bar ────────────────────────────────────────────────────
export function updateSelectionBar() {
    const count = state.selectedSongIds.size;

    if (count === 0) {
        if (_floatingBar) { _floatingBar.remove(); _floatingBar = null; }
        return;
    }

    if (!_floatingBar) {
        _floatingBar = document.createElement('div');
        _floatingBar.className = 'edit-selection-bar';
        _floatingBar.innerHTML = `
            <span class="selection-count">${count} selected</span>
            <button class="btn-create-box-from-sel">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Create Box
            </button>
            <button class="btn-clear-selection">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg>
                Clear
            </button>
        `;
        document.body.appendChild(_floatingBar);

        _floatingBar.querySelector('.btn-create-box-from-sel').addEventListener('click', () => {
            const songIds = Array.from(state.selectedSongIds);
            openPlaylistNamingModal(songIds);
            clearSelection();
            document.querySelectorAll('.song-card.selected').forEach(el => el.classList.remove('selected'));
            updateSelectionBar();
        });

        _floatingBar.querySelector('.btn-clear-selection').addEventListener('click', () => {
            clearSelection();
            document.querySelectorAll('.song-card.selected').forEach(el => el.classList.remove('selected'));
            updateSelectionBar();
        });

        requestAnimationFrame(() => _floatingBar.classList.add('visible'));
    } else {
        _floatingBar.querySelector('.selection-count').textContent = `${count} selected`;
    }
}
