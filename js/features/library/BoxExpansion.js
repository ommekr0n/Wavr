/**
 * BoxExpansion.js
 * Handles expanding/collapsing a Vinyl Box card in Edit Library,
 * including inner song drag & drop (reorder / unbox).
 */
import coverImgUrl from '../../../assets/images/cover.png';
import { state, persistBoxes } from '../../shared/EditLibraryState.js';
import { renderEditGrid } from './EditGridRenderer.js';
import { showSongContextMenu } from './SongContextMenu.js';
import { showDeleteBoxModal } from './BoxModals.js';

let activeEditExpandedCard = null;

// ── Close expansion ───────────────────────────────────────────────────────────
export function closeEditBoxExpansion() {
    if (!activeEditExpandedCard) return;
    activeEditExpandedCard.classList.remove('expanded-active');
    const origHTML = activeEditExpandedCard.getAttribute('data-original-html');
    if (origHTML) {
        activeEditExpandedCard.innerHTML = origHTML;
        const boxId = activeEditExpandedCard.getAttribute('data-id');
        activeEditExpandedCard.addEventListener('click', (e) => {
            if (activeEditExpandedCard.classList.contains('expanded-active')) return;
            toggleEditBoxExpansion(activeEditExpandedCard, boxId);
        }, { once: true });
    }
    activeEditExpandedCard = null;
}

// ── Toggle expansion ──────────────────────────────────────────────────────────
export function toggleEditBoxExpansion(card, boxId) {
    if (activeEditExpandedCard === card) { closeEditBoxExpansion(); return; }
    closeEditBoxExpansion();

    const box = state.vinylBoxes.find(b => b.id === boxId);
    if (!box) return;

    card.setAttribute('data-original-html', card.innerHTML);
    card.classList.add('expanded-active');
    activeEditExpandedCard = card;

    const boxSongs = (box.songIds || [])
        .map(id => state.playlist.find(s => s.id === id))
        .filter(Boolean);

    let songsHTML = '';
    if (boxSongs.length === 0) {
        songsHTML = `<div style="padding:30px 20px;color:var(--text-secondary);font-size:0.9rem;text-align:center;width:100%;">This vinyl box is currently empty. Click <strong>Add Songs</strong> to add tracks!</div>`;
    } else {
        boxSongs.forEach(song => {
            songsHTML += `
                <div class="song-card box-slider-song-card inner-editable-song" data-song-id="${song.id}" data-box-id="${box.id}" draggable="true">
                    <div class="card-drag-handle" draggable="true" title="Drag to reorder or unbox">⋮⋮</div>
                    <div class="song-cover-wrapper" style="position:relative;aspect-ratio:1/1;border-radius:8px;overflow:hidden;margin-bottom:10px;">
                        <img src="${song.cover || coverImgUrl}" alt="${song.title}" draggable="false" style="width:100%;height:100%;object-fit:cover;pointer-events:none;user-select:none;">
                        <button class="song-options-btn" data-id="${song.id}" title="Options">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <circle cx="12" cy="5" r="2"></circle>
                                <circle cx="12" cy="12" r="2"></circle>
                                <circle cx="12" cy="19" r="2"></circle>
                            </svg>
                        </button>
                    </div>
                    <div class="song-card-title">${song.title}</div>
                    <div class="song-card-artist">${song.artist}</div>
                </div>
            `;
        });
    }

    const boxColor = box.color || '#ffb300';
    card.innerHTML = `
        <div class="box-expansion-content">
            <div class="box-expansion-header">
                <div style="display:flex;align-items:center;gap:12px;">
                    <h2 class="box-expansion-title">${box.name}</h2>
                    <span class="box-track-badge" style="background:color-mix(in srgb,${boxColor} 20%,rgba(255,255,255,0.08));border:1px solid color-mix(in srgb,${boxColor} 40%,rgba(255,255,255,0.15));color:#fff;">${boxSongs.length} Tracks</span>
                </div>
                <div class="box-expansion-controls">
                    <button class="btn-edit-add-songs glass-btn primary" style="padding:8px 16px;">Add Songs</button>
                    <button class="btn-edit-info glass-btn neutral" style="padding:8px 16px;">Edit Info</button>
                    <button class="btn-delete-box glass-btn danger" style="padding:8px 14px;" title="Delete Box">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Delete Box
                    </button>
                    <button class="btn-close-box glass-btn neutral" style="padding:8px 12px;" title="Close Crate">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div class="box-expansion-slider-wrapper">
                <div class="box-expansion-slider">${songsHTML}</div>
            </div>
        </div>
    `;

    // ── Button handlers ───────────────────────────────────────────────────────
    card.querySelector('.btn-close-box').addEventListener('click', (e) => {
        e.stopPropagation();
        closeEditBoxExpansion();
    });

    card.querySelector('.btn-edit-add-songs').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.appMainContext?.openAddSongsModal) {
            window.appMainContext.openAddSongsModal(box, state.vinylBoxes);
        }
    });

    card.querySelector('.btn-edit-info').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.appMainContext?.openPlaylistNameModal) {
            window.appMainContext.openPlaylistNameModal(box, state.vinylBoxes, () => renderEditGrid());
        }
    });

    card.querySelector('.btn-delete-box').addEventListener('click', (e) => {
        e.stopPropagation();
        showDeleteBoxModal(box.id, box.name);
    });

    // Options buttons for inner songs
    card.querySelectorAll('.song-options-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect      = btn.getBoundingClientRect();
            const sid       = btn.getAttribute('data-id');
            const innerCard = btn.closest('.inner-editable-song');
            const bid       = innerCard ? innerCard.getAttribute('data-box-id') : null;
            showSongContextMenu(rect.left, rect.bottom + 5, sid, bid);
        });
    });

    // ── Inner drag & drop engine (RAF + GPU translate3d) ──────────────────────
    card.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.song-options-btn') ||
            e.target.closest('.btn-delete-box')   ||
            e.target.closest('.btn-close-box')    ||
            e.target.closest('.btn-edit-add-songs') ||
            e.target.closest('.btn-edit-info')) return;

        const handle = e.target.closest('.card-drag-handle');
        if (!handle) return;

        const innerCard = handle.closest('.inner-editable-song');
        if (!innerCard) return;

        e.preventDefault();
        e.stopPropagation();

        const rect     = innerCard.getBoundingClientRect();
        const offsetX  = e.clientX - rect.left;
        const offsetY  = e.clientY - rect.top;
        const originX  = e.clientX - offsetX;
        const originY  = e.clientY - offsetY;

        let ghost            = null;
        let isDraggingStarted = false;
        let isSwapping        = false;
        let rafId             = null;

        const startDrag = () => {
            isDraggingStarted = true;
            document.body.classList.add('is-dragging-active');
            innerCard.classList.add('inner-dragging');

            ghost = innerCard.cloneNode(true);
            ghost.className  = 'song-card drag-floating-ghost';
            ghost.style.cssText = [
                `position:fixed`,
                `left:${originX}px`, `top:${originY}px`,
                `width:${rect.width}px`, `height:${rect.height}px`,
                `z-index:99999`, `pointer-events:none`,
                `will-change:transform`, `transform:scale(1.05)`,
                `box-shadow:0 16px 40px rgba(0,229,255,0.4)`, `opacity:0.9`
            ].join(';');
            document.body.appendChild(ghost);
        };

        const onMove = (mv) => {
            const dist = Math.hypot(mv.clientX - e.clientX, mv.clientY - e.clientY);
            if (!isDraggingStarted) { if (dist > 5) startDrag(); else return; }

            if (ghost) {
                ghost.style.transform = `translate3d(${mv.clientX - e.clientX}px,${mv.clientY - e.clientY}px,0) scale(1.05)`;
            }

            if (rafId) return;
            const cx = mv.clientX, cy = mv.clientY;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                if (ghost) ghost.style.display = 'none';
                innerCard.style.visibility = 'hidden';
                const el = document.elementFromPoint(cx, cy);
                innerCard.style.visibility = '';
                if (ghost) ghost.style.display = '';

                if (!el) return;
                const targetInner = el.closest('.inner-editable-song');
                const slider      = card.querySelector('.box-expansion-slider');

                if (targetInner && targetInner !== innerCard && slider &&
                    targetInner.closest('.vinyl-box-card') === card) {
                    if (!isSwapping) {
                        isSwapping = true;
                        const following = (innerCard.compareDocumentPosition(targetInner) & Node.DOCUMENT_POSITION_FOLLOWING);
                        const sibling   = following ? targetInner.nextSibling : targetInner;
                        if (sibling) slider.insertBefore(innerCard, sibling);
                        else         slider.appendChild(innerCard);
                        setTimeout(() => { isSwapping = false; }, 80);
                    }
                }
            });
        };

        const onUp = async (up) => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup',   onUp);
            window.removeEventListener('pointercancel', onUp);
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

            if (!isDraggingStarted) return;
            if (ghost) { ghost.remove(); ghost = null; }
            innerCard.classList.remove('inner-dragging');
            document.body.classList.remove('is-dragging-active');

            innerCard.style.visibility = 'hidden';
            const el = document.elementFromPoint(up.clientX, up.clientY);
            innerCard.style.visibility = '';

            const isInsideBox = el?.closest('.box-expansion-content') || el?.closest('.vinyl-box-card') === card;
            const songId      = innerCard.getAttribute('data-song-id');

            if (!isInsideBox && songId) {
                box.songIds = (box.songIds || []).filter(id => id !== songId);
                await persistBoxes();
                closeEditBoxExpansion();
                renderEditGrid();
                if (window.appMainContext?.updateBoxCache) {
                    window.appMainContext.updateBoxCache([...state.vinylBoxes], state.libraryOrder);
                }
                if (window.appMainContext?.renderSongGrid) window.appMainContext.renderSongGrid();
            } else {
                const newOrder = [...card.querySelectorAll('.inner-editable-song')]
                    .map(c => c.getAttribute('data-song-id')).filter(Boolean);
                box.songIds = newOrder;
                await persistBoxes();
                if (window.appMainContext?.updateBoxCache) {
                    window.appMainContext.updateBoxCache([...state.vinylBoxes], state.libraryOrder);
                }
            }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup',   onUp);
        window.addEventListener('pointercancel', onUp);
    });

    // Prevent drop events from bubbling to grid (would unbox song)
    const expansionContent = card.querySelector('.box-expansion-content');
    if (expansionContent) {
        expansionContent.addEventListener('drop',     (e) => { e.stopPropagation(); });
        expansionContent.addEventListener('dragover', (e) => { e.preventDefault(); });
    }
}
