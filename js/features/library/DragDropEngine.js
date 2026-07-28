/**
 * DragDropEngine.js
 * Pointer Events drag & drop engine for the Edit Library grid.
 * Handles: grid reorder (FLIP), song-into-box drop, suck-in animation.
 */
import { state, persistBoxes, persistOrder } from '../../shared/EditLibraryState.js';
import { renderEditGrid } from './EditGridRenderer.js';
import { closeEditBoxExpansion } from './BoxExpansion.js';

// ── FLIP reorder animation ────────────────────────────────────────────────────
export function reorderFLIP(editGrid, draggingElement, nextSibling) {
    const cards = [...editGrid.querySelectorAll('.song-card')];

    const firstPositions = new Map();
    cards.forEach(card => {
        firstPositions.set(card, { left: card.offsetLeft, top: card.offsetTop });
    });

    if (nextSibling) {
        if (nextSibling.parentElement !== editGrid) return;
        editGrid.insertBefore(draggingElement, nextSibling);
    } else {
        editGrid.appendChild(draggingElement);
    }

    cards.forEach(card => {
        const first = firstPositions.get(card);
        if (!first) return;
        const dx = first.left - card.offsetLeft;
        const dy = first.top  - card.offsetTop;
        if (dx !== 0 || dy !== 0) {
            card.style.transition = 'none';
            card.style.transform  = `translate3d(${dx}px,${dy}px,0)`;
            void card.offsetWidth;
            card.style.transition = 'transform 0.25s cubic-bezier(0.2,0,0,1)';
            card.style.transform  = 'translate3d(0,0,0)';
        }
    });
}

// ── Suck-in animation ─────────────────────────────────────────────────────────
export function triggerSuckingAnimation(songIds, targetSlot) {
    const targetVisual = targetSlot.querySelector('.vinyl-box-visual');
    if (!targetVisual) return;

    const targetRect = targetVisual.getBoundingClientRect();
    const targetX    = targetRect.left + targetRect.width  / 2;
    const targetY    = targetRect.top  + targetRect.height / 2;

    songIds.forEach(id => {
        const card  = document.querySelector(`.edit-grid .song-card[data-id="${id}"]`);
        if (!card) return;
        const cover = card.querySelector('img');
        if (!cover) return;

        const coverRect = cover.getBoundingClientRect();
        const clone     = document.createElement('div');
        clone.className = 'flying-card-clone';
        clone.style.width           = `${coverRect.width}px`;
        clone.style.height          = `${coverRect.height}px`;
        clone.style.left            = `${coverRect.left}px`;
        clone.style.top             = `${coverRect.top}px`;
        clone.style.backgroundImage = `url("${cover.src}")`;
        clone.style.backgroundSize  = 'cover';
        clone.style.backgroundPosition = 'center';
        document.body.appendChild(clone);

        clone.offsetWidth; // force reflow
        clone.style.transform = `translate(${targetX - coverRect.left - coverRect.width/2}px,${targetY - coverRect.top - coverRect.height/2}px) scale(0.05) rotate(720deg)`;
        clone.style.opacity   = '0';
        clone.addEventListener('transitionend', () => clone.remove());
    });
}

// ── Main drag & drop setup (runs once) ───────────────────────────────────────
export function setupDragAndDrop() {
    const editGrid = document.getElementById('edit-song-grid');
    if (!editGrid) return;

    // ── Pointer drag ──────────────────────────────────────────────────────────
    editGrid.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.song-options-btn') || e.target.closest('.btn-delete-box')) return;

        const handle = e.target.closest('.card-drag-handle');
        if (!handle) return;

        const card = handle.closest('.song-card');
        if (!card || card.parentElement !== editGrid || card.classList.contains('expanded-active')) return;

        e.preventDefault();

        const rect    = card.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        const originX = e.clientX - offsetX;
        const originY = e.clientY - offsetY;

        let ghost             = null;
        let isDraggingStarted = false;
        let isSwapping        = false;
        let droppedIntoBox    = false;
        let rafId             = null;

        const startDrag = () => {
            isDraggingStarted = true;
            document.body.classList.add('is-dragging-active');
            card.classList.add('dragging');
            card.setAttribute('data-was-dragged', 'true');

            ghost = card.cloneNode(true);
            ghost.className  = 'song-card drag-floating-ghost';
            ghost.style.cssText = [
                `position:fixed`,
                `left:${originX}px`, `top:${originY}px`,
                `width:${rect.width}px`, `height:${rect.height}px`,
                `z-index:9999`, `pointer-events:none`,
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

                // Clear all box highlights at start of frame
                editGrid.querySelectorAll('.vinyl-box-visual.drag-over').forEach(v => v.classList.remove('drag-over'));

                card.style.visibility = 'hidden';
                const el = document.elementFromPoint(cx, cy);
                card.style.visibility = '';

                if (!el) return;
                const targetCard = el.closest('.song-card');
                if (!targetCard || targetCard.parentElement !== editGrid || targetCard === card) return;

                if (targetCard.classList.contains('expanded-active')) return;

                const isDraggingSong = !card.classList.contains('vinyl-box-card');
                const isTargetBox    = targetCard.classList.contains('vinyl-box-card');

                if (isDraggingSong && isTargetBox) {
                    // Song over Box → highlight only, no swap
                    editGrid.querySelectorAll('.vinyl-box-visual.drag-over').forEach(v => {
                        if (v.closest('.song-card') !== targetCard) v.classList.remove('drag-over');
                    });
                    targetCard.querySelector('.vinyl-box-visual')?.classList.add('drag-over');
                } else {
                    // Song over Song, or Box over anything → FLIP swap
                    editGrid.querySelectorAll('.vinyl-box-visual.drag-over').forEach(v => v.classList.remove('drag-over'));
                    if (!isSwapping) {
                        const following    = (card.compareDocumentPosition(targetCard) & Node.DOCUMENT_POSITION_FOLLOWING);
                        const targetSibling = following ? targetCard.nextSibling : targetCard;
                        if (targetSibling !== card && targetSibling !== card.nextSibling) {
                            isSwapping = true;
                            reorderFLIP(editGrid, card, targetSibling);
                            setTimeout(() => { isSwapping = false; }, 60);
                        }
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

            // Detect drop into box
            if (ghost) ghost.style.display = 'none';
            card.style.visibility = 'hidden';
            const el = document.elementFromPoint(up.clientX, up.clientY);
            card.style.visibility = '';
            if (ghost) ghost.style.display = '';

            const targetBox      = el?.closest('.vinyl-box-card');
            const isDraggingSong = !card.classList.contains('vinyl-box-card');

            if (isDraggingSong && targetBox && targetBox !== card) {
                const songId = card.getAttribute('data-id');
                const boxId  = targetBox.getAttribute('data-id');
                const box    = state.vinylBoxes.find(b => b.id === boxId);
                if (box && songId) {
                    const set = new Set(box.songIds || []);
                    set.add(songId);
                    box.songIds = Array.from(set);
                    await persistBoxes();
                    droppedIntoBox = true;
                }
            }

            if (ghost) { ghost.remove(); ghost = null; }
            card.classList.remove('dragging');
            document.body.classList.remove('is-dragging-active');
            editGrid.querySelectorAll('.vinyl-box-visual.drag-over').forEach(v => v.classList.remove('drag-over'));
            setTimeout(() => { card.setAttribute('data-was-dragged', 'false'); }, 200);

            if (droppedIntoBox) {
                renderEditGrid();
                if (window.appMainContext?.updateBoxCache) {
                    window.appMainContext.updateBoxCache([...state.vinylBoxes], state.libraryOrder);
                }
                if (window.appMainContext?.renderSongGrid) window.appMainContext.renderSongGrid();
            } else {
                const currentCards = [...editGrid.querySelectorAll('.song-card')];
                state.libraryOrder = currentCards.map(c => c.getAttribute('data-id'));
                await persistOrder();
            }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup',   onUp);
        window.addEventListener('pointercancel', onUp);
    });

    // ── Native HTML5 drop (unbox from inner drag) ─────────────────────────────
    editGrid.addEventListener('dragover', (e) => { e.preventDefault(); });

    editGrid.addEventListener('drop', async (e) => {
        try {
            const rawData = e.dataTransfer.getData('application/json');
            if (!rawData) return;
            const data = JSON.parse(rawData);
            if (data?.type === 'unbox-song' && data.boxId && data.songId) {
                e.preventDefault();
                e.stopPropagation();

                const box = state.vinylBoxes.find(b => b.id === data.boxId);
                if (box) {
                    box.songIds = (box.songIds || []).filter(id => id !== data.songId);
                    await persistBoxes();

                    closeEditBoxExpansion();
                    renderEditGrid();

                    if (window.appMainContext?.updateBoxCache) {
                        window.appMainContext.updateBoxCache([...state.vinylBoxes], state.libraryOrder);
                    }
                    if (window.appMainContext?.renderSongGrid) window.appMainContext.renderSongGrid();
                }
            }
        } catch (err) {
            console.warn('[DragDropEngine] Invalid grid unbox drop data', err);
        }
    });
}
