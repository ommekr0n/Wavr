/**
 * EditGridRenderer.js
 * Renders the mixed song/box grid in Edit Library view.
 */
import coverImgUrl from '../../../assets/images/cover.png';
import { state } from '../../shared/EditLibraryState.js';
import { showSongContextMenu } from './SongContextMenu.js';
import { toggleEditBoxExpansion } from './BoxExpansion.js';
import { showDeleteBoxModal } from './BoxModals.js';
import { updateSelectionBar } from './SelectionManager.js';

export function renderEditGrid() {
    const editGrid = document.getElementById('edit-song-grid');
    if (!editGrid) return;

    editGrid.innerHTML = '';

    // Collect all song IDs that are inside a box
    const boxedSongIds = new Set();
    state.vinylBoxes.forEach(box => {
        (box.songIds || []).forEach(id => boxedSongIds.add(id));
    });

    const unorderedItems = [];

    // Boxes
    state.vinylBoxes.forEach(box => {
        unorderedItems.push({ type: 'box', id: box.id, raw: box });
    });

    // Unboxed songs only
    state.playlist.forEach(song => {
        if (!boxedSongIds.has(song.id)) {
            unorderedItems.push({ type: 'song', id: song.id, raw: song });
        }
    });

    // Apply saved order
    const itemMap   = new Map(unorderedItems.map(item => [item.id, item]));
    const gridItems = [];
    state.libraryOrder.forEach(orderId => {
        if (itemMap.has(orderId)) {
            gridItems.push(itemMap.get(orderId));
            itemMap.delete(orderId);
        }
    });
    itemMap.forEach(item => gridItems.push(item));

    // Render each item
    gridItems.forEach(item => {
        const card = document.createElement('div');

        if (item.type === 'song') {
            const song = item.raw;
            card.className = 'song-card';
            card.setAttribute('data-id', song.id);

            if (state.selectedSongIds.has(song.id)) card.classList.add('selected');

            card.innerHTML = `
                <div class="card-drag-handle" title="Drag to reorder grid">⋮⋮</div>
                <div class="song-cover-wrapper" style="position:relative;aspect-ratio:1/1;border-radius:8px;overflow:hidden;margin-bottom:10px;">
                    <img src="${song.cover || coverImgUrl}" alt="${song.title}" draggable="false" style="width:100%;height:100%;object-fit:cover;pointer-events:none;user-select:none;">
                    <button class="song-options-btn" data-id="${song.id}" title="Options">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <circle cx="12" cy="5" r="2"></circle>
                            <circle cx="12" cy="12" r="2"></circle>
                            <circle cx="12" cy="19" r="2"></circle>
                        </svg>
                    </button>
                </div>
                <div class="song-info" style="display:flex;flex-direction:column;gap:4px;min-width:0;">
                    <div class="song-card-title" style="color:#fff;margin-bottom:0;">${song.title}</div>
                    <div class="song-card-artist">${song.artist}</div>
                </div>
            `;

            card.querySelector('.song-options-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                showSongContextMenu(rect.left, rect.bottom + 5, song.id);
            });

            card.addEventListener('click', (e) => {
                if (e.target.closest('.card-drag-handle')) return;
                if (card.classList.contains('dragging')) return;
                if (state.selectedSongIds.has(song.id)) {
                    state.selectedSongIds.delete(song.id);
                    card.classList.remove('selected');
                } else {
                    state.selectedSongIds.add(song.id);
                    card.classList.add('selected');
                }
                updateSelectionBar();
            });

        } else {
            const box       = item.raw;
            const boxSongs  = (box.songIds || []).map(id => state.playlist.find(s => s.id === id)).filter(Boolean);
            const recent    = boxSongs.slice(0, 4);

            let sleevesHTML = '';
            recent.forEach((song, i) => {
                sleevesHTML += `<div class="peeking-sleeve sleeve-${i}" style="background-image:url('${song.cover || coverImgUrl}')"></div>`;
            });

            card.className = 'song-card vinyl-box-card';
            card.setAttribute('data-id', box.id);
            card.style.setProperty('--box-color', box.color || '#ffb300');

            card.innerHTML = `
                <div class="card-drag-handle" title="Drag to reorder grid">⋮⋮</div>
                <button class="btn-delete-box" title="Delete Box" aria-label="Delete box">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
                <div class="song-card-inner box-card-inner" style="aspect-ratio:1/1;margin-bottom:15px;">
                    <div class="vinyl-box-visual" style="--box-color:${box.color || '#ffb300'};">
                        <div class="vinyl-sleeves-container">
                            ${sleevesHTML}
                            <div class="glass-front"></div>
                        </div>
                    </div>
                </div>
                <div class="song-card-title">${box.name}</div>
                <div class="song-card-artist">${boxSongs.length} Tracks</div>
            `;

            card.querySelector('.btn-delete-box').addEventListener('click', (e) => {
                e.stopPropagation();
                showDeleteBoxModal(box.id, box.name);
            });

            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-box'))   return;
                if (e.target.closest('.card-drag-handle')) return;
                if (card.classList.contains('expanded-active')) return;
                if (card.getAttribute('data-was-dragged') === 'true') return;
                toggleEditBoxExpansion(card, box.id);
            });
        }

        editGrid.appendChild(card);
    });
}
