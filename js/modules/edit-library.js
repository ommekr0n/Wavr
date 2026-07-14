/**
 * Edit Library Module
 * Handles grid settings, drag-and-drop reordering, drag selection, and Vinyl Box (playlist) creation/animation.
 */

let localPlaylist = [];
let localVinylBoxes = [];
let localLibraryOrder = [];
let selectedSongIds = new Set();
let onDoneCallback = null;
let _dragDropInitialized = false;
let _selectionAbortController = null;  // Tracks lasso selection window listeners

// Initialize Settings
export function initSettings() {
    const colRange = document.getElementById('settings-columns-range');
    const colVal = document.getElementById('settings-columns-val');
    const btnSettings = document.getElementById('btn-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const settingsModal = document.getElementById('settings-modal');

    // Load saved columns
    const savedCols = localStorage.getItem('wavr_grid_columns') || '6';
    document.documentElement.style.setProperty('--grid-columns', savedCols);
    if (colRange) colRange.value = savedCols;
    if (colVal) colVal.textContent = savedCols;

    if (btnSettings && settingsModal) {
        btnSettings.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
        });
    }

    if (btnCloseSettings && settingsModal) {
        btnCloseSettings.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
    }

    if (colRange) {
        colRange.addEventListener('input', (e) => {
            const cols = e.target.value;
            colVal.textContent = cols;
            document.documentElement.style.setProperty('--grid-columns', cols);
            localStorage.setItem('wavr_grid_columns', cols);
        });
    }
}

// Initialize Edit Library View
export async function initEditLibrary(mainPlaylist, onDone) {
    localPlaylist = [...mainPlaylist];
    onDoneCallback = onDone;

    // Ensure all songs have unique IDs
    localPlaylist.forEach((song, idx) => {
        if (!song.id) {
            song.id = 'song-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000);
        }
    });

    // Load Vinyl Boxes and Order from storage
    try {
        localVinylBoxes = await window.localforage.getItem('vinyl_boxes') || [];
        localLibraryOrder = await window.localforage.getItem('library_order') || [];
    } catch (e) {
        console.error("Error loading vinyl boxes or order", e);
        localVinylBoxes = [];
        localLibraryOrder = [];
    }

    const btnEditLibrary = document.getElementById('btn-edit-library');
    const btnEditDone = document.getElementById('btn-edit-done');
    const homeView = document.getElementById('home-view');
    const editLibraryView = document.getElementById('edit-library-view');

    if (btnEditLibrary) {
        btnEditLibrary.addEventListener('click', async () => {
            // Always sync with the latest playlist before rendering
            if (window.appMainContext && window.appMainContext.getPlaylist) {
                localPlaylist = [...window.appMainContext.getPlaylist()];
            }
            // Also reload boxes/order in case they changed
            try {
                localVinylBoxes = await window.localforage.getItem('vinyl_boxes') || [];
                localLibraryOrder = await window.localforage.getItem('library_order') || [];
            } catch(e) { /* ignore */ }

            homeView.classList.add('hidden');
            editLibraryView.classList.remove('hidden');
            selectedSongIds.clear();
            renderEditGrid();
            setupSelectionBox();   // safe: uses AbortController, cleans up on Done
            if (!_dragDropInitialized) {
                setupDragAndDrop(); // only ever runs once
                _dragDropInitialized = true;
            }
        });
    }

    if (btnEditDone) {
        btnEditDone.addEventListener('click', async () => {
            try {
                await window.localforage.setItem('vinyl_boxes', localVinylBoxes);
                await window.localforage.setItem('library_order', localLibraryOrder);
            } catch (e) {
                console.error("Error saving library updates", e);
            }

            // Sync home grid cache before switching views (no extra DB read needed)
            if (window.appMainContext && window.appMainContext.updateBoxCache) {
                window.appMainContext.updateBoxCache([...localVinylBoxes], [...localLibraryOrder]);
            }

            editLibraryView.classList.add('hidden');
            homeView.classList.remove('hidden');
            
            if (onDoneCallback) {
                onDoneCallback();
            }
        });
    }


    setupPlaylistNamingModal();
    setupContextMenu();

    // BUG 17 FIX: Listen for openEditBox events dispatched from window.appMainContext
    document.addEventListener('wavr:openEditBox', (e) => {
        const { boxId } = e.detail;
        openEditBoxModal(boxId);
    });

    // Sync edit grid immediately when library changes (e.g., delete from main view)
    document.addEventListener('wavr:libraryChanged', async () => {
        // Reload vinyl boxes (song might have been removed from a box too)
        try {
            localVinylBoxes = await window.localforage.getItem('vinyl_boxes') || [];
            localLibraryOrder = await window.localforage.getItem('library_order') || [];
        } catch(e) { /* ignore */ }
        
        // Update localPlaylist from the live main playlist
        if (window.appMainContext && window.appMainContext.getPlaylist) {
            localPlaylist = [...window.appMainContext.getPlaylist()];
        }
        
        const editView = document.getElementById('edit-library-view');
        if (editView && !editView.classList.contains('hidden')) {
            renderEditGrid();
        }
    });

    // Expose to main.js so it can trigger a re-render after adding songs to a box
    window.appEditLibraryContext = {
        renderEditGrid: renderEditGrid,
        syncBoxes: (updatedBoxes) => {
            localVinylBoxes = updatedBoxes;
            const editView = document.getElementById('edit-library-view');
            if (editView && !editView.classList.contains('hidden')) {
                // Remember which box is expanded so we can re-open it after re-render
                const expandedBoxId = activeEditExpandedCard
                    ? activeEditExpandedCard.getAttribute('data-id')
                    : null;

                // Nullify before renderEditGrid to avoid stale DOM reference
                activeEditExpandedCard = null;

                renderEditGrid();

                // Re-expand the same box so the user sees the updated song list
                if (expandedBoxId) {
                    const grid = document.getElementById('edit-song-grid');
                    if (grid) {
                        const newCard = grid.querySelector('.vinyl-box-card[data-id="' + expandedBoxId + '"]');
                        if (newCard) toggleEditBoxExpansion(newCard, expandedBoxId);
                    }
                }
            }
        }
    };
}

// Render the edit grid with draggable mixed cards
function renderEditGrid() {
    const grid = document.getElementById('edit-song-grid');
    if (!grid) return;

    grid.innerHTML = '';

    const boxedSongIds = new Set();
    localVinylBoxes.forEach(box => {
        if (box.songIds) {
            box.songIds.forEach(id => boxedSongIds.add(id));
        }
    });

    const unorderedItems = [];

    // Add Vinyl Boxes
    localVinylBoxes.forEach(box => {
        unorderedItems.push({
            type: 'box',
            id: box.id,
            raw: box
        });
    });

    // Add Unboxed Songs
    localPlaylist.forEach((song, index) => {
        if (!boxedSongIds.has(song.id)) {
            unorderedItems.push({
                type: 'song',
                id: song.id,
                raw: song
            });
        }
    });

    // Sort items
    const gridItems = [];
    const itemMap = new Map();
    unorderedItems.forEach(item => itemMap.set(item.id, item));

    localLibraryOrder.forEach(orderId => {
        if (itemMap.has(orderId)) {
            gridItems.push(itemMap.get(orderId));
            itemMap.delete(orderId);
        }
    });

    itemMap.forEach(item => gridItems.push(item));

    gridItems.forEach(item => {
        const card = document.createElement('div');
        
        if (item.type === 'song') {
            const song = item.raw;
            card.className = 'song-card';
            card.setAttribute('draggable', 'true');
            card.setAttribute('data-id', song.id);

            if (selectedSongIds.has(song.id)) {
                card.classList.add('selected');
            }

            card.innerHTML = `
                <div class="song-cover-wrapper" style="position: relative; aspect-ratio: 1/1; border-radius: 8px; overflow: hidden; margin-bottom: 10px;">
                    <img src="${song.cover || 'assets/images/cover.png'}" alt="${song.title}" style="width: 100%; height: 100%; object-fit: cover;">
                    <button class="song-options-btn" data-id="${song.id}" title="Options">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <circle cx="12" cy="5" r="2"></circle>
                            <circle cx="12" cy="12" r="2"></circle>
                            <circle cx="12" cy="19" r="2"></circle>
                        </svg>
                    </button>
                </div>
                <div class="song-info" style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
                    <div class="song-card-title" style="color: #fff; margin-bottom: 0;">${song.title}</div>
                    <div class="song-card-artist">${song.artist}</div>
                </div>
            `;
            
            // Context menu for song
            const optionsBtn = card.querySelector('.song-options-btn');
            if (optionsBtn) {
                optionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rect = optionsBtn.getBoundingClientRect();
                    showSongContextMenu(rect.left, rect.bottom + 5, song.id);
                });
            }
            
            // Toggle selection
            card.addEventListener('click', (e) => {
                if (card.classList.contains('dragging')) return;
                if (selectedSongIds.has(song.id)) {
                    selectedSongIds.delete(song.id);
                    card.classList.remove('selected');
                } else {
                    selectedSongIds.add(song.id);
                    card.classList.add('selected');
                }
                updateSelectionBar();
            });
        } else {
            const box = item.raw;
            const count = box.songIds ? box.songIds.length : 0;
            card.className = 'song-card vinyl-box-card';
            card.setAttribute('draggable', 'true');
            card.setAttribute('data-id', box.id);
            card.style.setProperty('--box-color', box.color || '#ffb300');

            const boxSongs = localPlaylist.filter(s => box.songIds && box.songIds.includes(s.id));
            const recentSongs = [...boxSongs].reverse().slice(0, 4);
            
            let sleevesHTML = '';
            for (let i = 0; i < recentSongs.length; i++) {
                const song = recentSongs[i];
                const coverUrl = song.cover || 'assets/images/cover.png';
                const sleeveClass = `sleeve-${i}`;
                sleevesHTML += `<div class="peeking-sleeve ${sleeveClass}" style="background-image: url('${coverUrl}')"></div>`;
            }

            card.innerHTML = `
                <button class="btn-delete-box" title="Delete Box" aria-label="Delete box">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
                <div class="song-card-inner box-card-inner" style="aspect-ratio: 1/1; margin-bottom: 15px;">
                    <div class="vinyl-box-visual" style="--box-color: ${box.color || '#ffb300'};">
                        <div class="vinyl-sleeves-container">
                            ${sleevesHTML}
                            <div class="glass-front"></div>
                        </div>
                    </div>
                </div>
                <div class="song-card-title">${box.name}</div>
                <div class="song-card-artist">${boxSongs.length} Tracks</div>
            `;
            
            // Delete Box Logic — uses custom modal instead of browser confirm()
            const deleteBtn = card.querySelector('.btn-delete-box');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent opening the box
                    showDeleteBoxModal(box.id, box.name);
                });
            }

            card.addEventListener('click', (e) => {
                if (card.classList.contains('expanded-active')) return;
                toggleEditBoxExpansion(card, box.id);
            });
            
            // Allow drag over to add items to box
            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                card.querySelector('.vinyl-box-visual').classList.add('drag-over');
            });

            card.addEventListener('dragleave', () => {
                card.querySelector('.vinyl-box-visual').classList.remove('drag-over');
            });

            card.addEventListener('drop', async (e) => {
                e.preventDefault();
                card.querySelector('.vinyl-box-visual').classList.remove('drag-over');

                const draggedId = e.dataTransfer.getData('text/plain');
                let songIdsToAdd = [];
                
                if (selectedSongIds.size > 0) {
                    songIdsToAdd = Array.from(selectedSongIds);
                } else if (draggedId && draggedId.startsWith('song-')) {
                    songIdsToAdd = [draggedId];
                }

                if (songIdsToAdd.length === 0) return;

                // Simple push for now without animation since they are in grid
                const existingSet = new Set(box.songIds || []);
                songIdsToAdd.forEach(id => existingSet.add(id));
                box.songIds = Array.from(existingSet);
                
                selectedSongIds.clear();
                updateSelectionBar();
                await window.localforage.setItem('vinyl_boxes', localVinylBoxes);
                renderEditGrid();
                
                if (window.appMainContext && window.appMainContext.renderSongGrid) {
                    window.appMainContext.updateBoxCache && window.appMainContext.updateBoxCache([...localVinylBoxes], localLibraryOrder);
                    window.appMainContext.renderSongGrid();
                }
            });
        }

        grid.appendChild(card);
    });
}

// Set up selection box overlay when dragging on empty grid space
function setupSelectionBox() {
    const container = document.querySelector('.edit-grid-container');
    const grid = document.getElementById('edit-song-grid');
    if (!container || !grid) return;

    // Abort previous window listeners (prevents accumulation on every Edit open)
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
        selectionBox.style.left = Math.min(startX, cx) + 'px';
        selectionBox.style.top = Math.min(startY, cy) + 'px';
        selectionBox.style.width = Math.abs(startX - cx) + 'px';
        selectionBox.style.height = Math.abs(startY - cy) + 'px';
        const cards = grid.querySelectorAll('.song-card:not(.vinyl-box-card)');
        const br = selectionBox.getBoundingClientRect();
        cards.forEach(card => {
            const cr = card.getBoundingClientRect();
            const sid = card.getAttribute('data-id');
            const hit = !(cr.right < br.left || cr.left > br.right || cr.bottom < br.top || cr.top > br.bottom);
            if (hit) { selectedSongIds.add(sid); card.classList.add('selected'); }
            else { selectedSongIds.delete(sid); card.classList.remove('selected'); }
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

// Reorder elements with butter-smooth FLIP animation
function reorderFLIP(editGrid, draggingElement, nextSibling) {
    const cards = [...editGrid.querySelectorAll('.song-card')];
    const firstPositions = cards.map(card => {
        const rect = card.getBoundingClientRect();
        return { el: card, left: rect.left, top: rect.top };
    });

    // Move the element in the DOM
    if (nextSibling) {
        editGrid.insertBefore(draggingElement, nextSibling);
    } else {
        editGrid.appendChild(draggingElement);
    }

    // Capture post-DOM change rects
    const lastPositions = cards.map(card => {
        const rect = card.getBoundingClientRect();
        return { el: card, left: rect.left, top: rect.top };
    });

    // Animate transition using CSS transforms
    cards.forEach(card => {
        const first = firstPositions.find(p => p.el === card);
        const last = lastPositions.find(p => p.el === card);
        if (!first || !last) return;

        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;

        if (deltaX !== 0 || deltaY !== 0) {
            card.style.transition = 'none';
            card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            
            // Force reflow
            card.offsetWidth;

            card.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
            card.style.transform = 'translate(0, 0)';
        }
    });
}

// Set up HTML5 Drag and Drop for Reordering
function setupDragAndDrop() {
    const editGrid = document.getElementById('edit-song-grid');
    if (!editGrid) return;

    editGrid.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.song-card');
        if (!card) return;

        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
        e.dataTransfer.effectAllowed = 'move';
    });

    editGrid.addEventListener('dragend', async (e) => {
        const card = e.target.closest('.song-card');
        if (card) {
            card.classList.remove('dragging');
            // Clean inline transition styles to prevent hover side effects
            setTimeout(() => {
                const cards = editGrid.querySelectorAll('.song-card');
                cards.forEach(c => {
                    c.style.transition = '';
                    c.style.transform = '';
                });
            }, 300);
        }
        
        // Save new mixed order
        const currentCards = [...editGrid.querySelectorAll('.song-card')];
        const newOrder = [];
        currentCards.forEach(cardEl => {
            newOrder.push(cardEl.getAttribute('data-id'));
        });
        localLibraryOrder = newOrder;
        await window.localforage.setItem('library_order', localLibraryOrder);
    });

    editGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingElement = editGrid.querySelector('.dragging');
        if (!draggingElement) return;

        const siblings = [...editGrid.querySelectorAll('.song-card:not(.dragging)')];
        
        const nextSibling = siblings.find(sibling => {
            const box = sibling.getBoundingClientRect();
            // BUG 23 FIX: Use OR instead of AND so horizontal reorder works in multi-column grid
            // The card whose left-center is to the right of the cursor is the insert point
            return e.clientX < box.left + box.width / 2;
        });
        
        if (nextSibling !== draggingElement.nextSibling && nextSibling !== draggingElement) {
            reorderFLIP(editGrid, draggingElement, nextSibling);
        }
    });

    editGrid.addEventListener('drop', async (e) => {
        const jsonData = e.dataTransfer.getData('application/json');
        if (jsonData) {
            try {
                const data = JSON.parse(jsonData);
                if (data.type === 'unbox-song') {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const box = localVinylBoxes.find(b => b.id === data.boxId);
                    if (box && box.songIds) {
                        box.songIds = box.songIds.filter(id => id !== data.songId);
                        await window.localforage.setItem('vinyl_boxes', localVinylBoxes);
                        
                        // Close expansion, save order, and re-render
                        closeEditBoxExpansion();
                        renderEditGrid();
                        
                        if (window.appMainContext && window.appMainContext.renderSongGrid) {
                            window.appMainContext.updateBoxCache && window.appMainContext.updateBoxCache([...localVinylBoxes], localLibraryOrder);
                            window.appMainContext.renderSongGrid();
                        }
                    }
                }
            } catch (err) {
                // Ignore parse errors
            }
        }
    });
}



// Visual "suck-in" flight animation from card coordinates to vinyl box coordinates
function triggerSuckingAnimation(songIds, targetSlot) {
    const targetVisual = targetSlot.querySelector('.vinyl-box-visual');
    if (!targetVisual) return;

    const targetRect = targetVisual.getBoundingClientRect();
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;

    songIds.forEach(id => {
        const card = document.querySelector(`.edit-grid .song-card[data-id="${id}"]`);
        if (!card) return;

        const cover = card.querySelector('img');
        if (!cover) return;

        const coverRect = cover.getBoundingClientRect();

        // Create flying card clone
        const clone = document.createElement('div');
        clone.className = 'flying-card-clone';
        clone.style.width = `${coverRect.width}px`;
        clone.style.height = `${coverRect.height}px`;
        clone.style.left = `${coverRect.left}px`;
        clone.style.top = `${coverRect.top}px`;
        clone.style.backgroundImage = `url("${cover.src}")`;
        clone.style.backgroundSize = 'cover';
        clone.style.backgroundPosition = 'center';
        document.body.appendChild(clone);

        // Force a layout reflow
        clone.offsetWidth;

        // Apply transition styling
        clone.style.transform = `translate(${targetX - coverRect.left - coverRect.width/2}px, ${targetY - coverRect.top - coverRect.height/2}px) scale(0.05) rotate(720deg)`;
        clone.style.opacity = '0';

        // Clean up
        clone.addEventListener('transitionend', () => {
            clone.remove();
        });
    });
}

// Playlist Naming Modal logic
let pendingSongIds = [];
let editingBoxId = null;

function setupPlaylistNamingModal() {
    const modal = document.getElementById('playlist-name-modal');
    const form = document.getElementById('playlist-name-form');
    const cancelBtn = document.getElementById('btn-cancel-playlist-name');
    const input = document.getElementById('playlist-name-input');
    const colorInput = document.getElementById('playlist-color-input');

    if (!modal || !form || !cancelBtn) return;

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        pendingSongIds = [];
        editingBoxId = null;
        input.value = '';
        // BUG 22 FIX: Clear selectedSongIds and visual selection state on cancel
        selectedSongIds.clear();
        document.querySelectorAll('.song-card.selected').forEach(c => c.classList.remove('selected'));
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) return;

        const selectedColor = colorInput ? colorInput.value : '#5a4232';

        if (editingBoxId) {
            const box = localVinylBoxes.find(b => b.id === editingBoxId);
            if (box) {
                box.name = name;
                box.color = selectedColor;
            }
            editingBoxId = null;
        } else {
            const newBox = {
                id: 'vinyl-' + Date.now(),
                name: name,
                songIds: [...pendingSongIds],
                color: selectedColor
            };
            localVinylBoxes.push(newBox);
            localLibraryOrder.push(newBox.id);
            await window.localforage.setItem('library_order', localLibraryOrder);
        }
        
        // Save back to localforage immediately
        await window.localforage.setItem('vinyl_boxes', localVinylBoxes);
        
        renderEditGrid();
        // Force refresh main grid if active (we are in edit library, but to be safe)
        if (window.appMainContext && window.appMainContext.renderSongGrid) {
             window.appMainContext.renderSongGrid();
        }

        modal.classList.add('hidden');
        pendingSongIds = [];
        input.value = '';
    });
}

function openPlaylistNamingModal(songIds) {
    const modal = document.getElementById('playlist-name-modal');
    if (modal) {
        editingBoxId = null;
        pendingSongIds = songIds;
        
        const title = document.getElementById('playlist-modal-title');
        const submitBtn = document.getElementById('btn-submit-playlist-name');
        if (title) title.textContent = "New Vinyl Box";
        if (submitBtn) submitBtn.textContent = "Create Box";
        
        // Generate random color for new box
        const colorInput = document.getElementById('playlist-color-input');
        if (colorInput) {
            const colors = ['#8B4513', '#a04838', '#385ea0', '#428f52', '#a03886', '#87a038', '#38a096', '#6938a0', '#a07738', '#e35959', '#59a6e3', '#b86614', '#2d7a71'];
            colorInput.value = colors[Math.floor(Math.random() * colors.length)];
        }
        
        const input = document.getElementById('playlist-name-input');
        input.value = '';
        modal.classList.remove('hidden');
        input.focus();
    }
}

function openEditBoxModal(boxId) {
    const modal = document.getElementById('playlist-name-modal');
    const box = localVinylBoxes.find(b => b.id === boxId);
    
    if (modal && box) {
        editingBoxId = boxId;
        pendingSongIds = [];
        
        const title = document.getElementById('playlist-modal-title');
        const submitBtn = document.getElementById('btn-submit-playlist-name');
        if (title) title.textContent = "Edit Vinyl Box";
        if (submitBtn) submitBtn.textContent = "Save Changes";
        
        const input = document.getElementById('playlist-name-input');
        input.value = box.name;
        
        const colorInput = document.getElementById('playlist-color-input');
        if (colorInput) {
            colorInput.value = box.color || '#5a4232';
        }
        
        modal.classList.remove('hidden');
        input.focus();
    }
}

// Rename / Delete Box Context Menu logic
let contextMenu = null;
let songContextMenu = null;
let activeBoxId = null;
let activeSongId = null;

function setupContextMenu() {
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

        const box = localVinylBoxes.find(b => b.id === activeBoxId);
        if (box && window.appMainContext && window.appMainContext.openAddSongsModal) {
            window.appMainContext.openAddSongsModal(box, localVinylBoxes);
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

        localVinylBoxes = localVinylBoxes.filter(b => b.id !== activeBoxId);
        renderEditGrid();
        
        // Push update to DB directly since we deleted a box
        localforage.setItem('vinyl_boxes', localVinylBoxes).then(() => {
            if (window.appMainContext) {
                window.appMainContext.renderSongGrid();
            }
        });
    });

    // Song Context Menu Setup
    songContextMenu = document.createElement('div');
    songContextMenu.className = 'playlist-context-menu hidden';
    songContextMenu.innerHTML = `
        <button class="edit-song-option">Edit Info</button>
        <button class="delete-song-option danger">Delete</button>
    `;
    document.body.appendChild(songContextMenu);

    songContextMenu.querySelector('.edit-song-option').addEventListener('click', () => {
        songContextMenu.classList.add('hidden');
        if (!activeSongId) return;
        if (window.appMainContext && window.appMainContext.showEditModalBySongId) {
            window.appMainContext.showEditModalBySongId(activeSongId);
        }
    });

    songContextMenu.querySelector('.delete-song-option').addEventListener('click', () => {
        songContextMenu.classList.add('hidden');
        if (!activeSongId) return;
        if (window.appMainContext && window.appMainContext.showDeleteModalBySongId) {
            window.appMainContext.showDeleteModalBySongId(activeSongId);
        }
    });

    // Close menu when clicking outside
    window.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target) && !e.target.closest('.playlist-options-btn')) {
            contextMenu.classList.add('hidden');
        }
        if (!songContextMenu.contains(e.target) && !e.target.closest('.song-options-btn')) {
            songContextMenu.classList.add('hidden');
        }
    });
}

function showContextMenu(x, y, boxId) {
    activeBoxId = boxId;
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.remove('hidden');
    songContextMenu.classList.add('hidden');
}

function showSongContextMenu(x, y, songId) {
    activeSongId = songId;
    songContextMenu.style.left = `${x}px`;
    songContextMenu.style.top = `${y}px`;
    songContextMenu.classList.remove('hidden');
    contextMenu.classList.add('hidden');
}

let activeEditExpandedCard = null;

function closeEditBoxExpansion() {
    if (activeEditExpandedCard) {
        activeEditExpandedCard.classList.remove('expanded-active');
        const origHTML = activeEditExpandedCard.getAttribute('data-original-html');
        if (origHTML) {
            activeEditExpandedCard.innerHTML = origHTML;
            // Re-attach the click listener
            const boxId = activeEditExpandedCard.getAttribute('data-id');
            activeEditExpandedCard.addEventListener('click', (e) => {
                if (activeEditExpandedCard.classList.contains('expanded-active')) return;
                toggleEditBoxExpansion(activeEditExpandedCard, boxId);
            }, { once: true });
        }
        activeEditExpandedCard = null;
    }
}

function toggleEditBoxExpansion(card, boxId) {
    if (activeEditExpandedCard === card) {
        closeEditBoxExpansion();
        return;
    }
    closeEditBoxExpansion();

    const box = localVinylBoxes.find(b => b.id === boxId);
    if (!box) return;

    card.setAttribute('data-original-html', card.innerHTML);
    card.classList.add('expanded-active');
    activeEditExpandedCard = card;

    const boxSongs = localPlaylist.filter(song => box.songIds && box.songIds.includes(song.id));
    let songsHTML = '';
    if (boxSongs.length === 0) {
        songsHTML = `<div style="padding: 20px; color: var(--text-secondary); font-size: 0.9rem; text-align: center; width: 100%;">This box is empty. Click "Add Songs" to add tracks!</div>`;
    } else {
        boxSongs.forEach((song, idx) => {
            songsHTML += `
                <div class="song-card box-slider-song-card inner-editable-song" data-song-id="${song.id}" data-box-id="${box.id}" draggable="true" style="cursor: grab; position: relative;">
                    <div class="song-cover-wrapper" style="width: 100%; position: relative; aspect-ratio: 1/1; border-radius: 8px; overflow: hidden; margin-bottom: 10px;">
                        <img src="${song.cover || 'assets/images/cover.png'}" alt="${song.title}" style="width: 100%; height: 100%; object-fit: cover;">
                        <button class="remove-song-btn" data-song-id="${song.id}" title="Remove from box">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="song-card-title">${song.title}</div>
                    <div class="song-card-artist">${song.artist}</div>
                </div>
            `;
        });
    }

    card.innerHTML = `
        <div class="box-expansion-content" style="width: 100%; animation: fadeIn 0.3s ease;">
            <div class="box-expansion-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <h2 style="margin: 0; font-size: 1.5rem; font-weight: 600;">${box.name}</h2>
                    <span style="color: var(--text-secondary); font-size: 0.9rem;">${boxSongs.length} Tracks</span>
                </div>
                <div class="box-expansion-controls" style="display: flex; gap: 10px; align-items: center;">
                    <button class="btn-edit-add-songs" style="background: var(--surface-light); color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 0.9rem; transition: all 0.2s;">Add Songs</button>
                    <button class="btn-edit-info" style="background: var(--surface-light); color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 0.9rem; transition: all 0.2s;">Edit Info</button>
                    <button class="btn-delete-box" style="background: rgba(220,50,50,0.15); color: #ef5350; border: 1px solid rgba(220,50,50,0.25); padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 0.9rem; transition: all 0.2s;">Delete Box</button>
                    <button class="btn-close-box" title="Close" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 5px;">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="box-expansion-slider-wrapper" style="width: 100%; overflow-x: auto; padding-bottom: 10px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent;">
                <div class="box-expansion-slider" style="display: flex; gap: 20px; min-width: min-content;">
                    ${songsHTML}
                </div>
            </div>
        </div>
    `;

    // Hook up buttons
    card.querySelector('.btn-close-box').addEventListener('click', (e) => {
        e.stopPropagation();
        closeEditBoxExpansion();
    });

    card.querySelector('.btn-edit-add-songs').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.appMainContext && window.appMainContext.openAddSongsModal) {
            window.appMainContext.openAddSongsModal(box, localVinylBoxes);
        }
    });

    card.querySelector('.btn-edit-info').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.appMainContext && window.appMainContext.openPlaylistNameModal) {
            window.appMainContext.openPlaylistNameModal(box, localVinylBoxes, () => renderEditGrid());
        }
    });

    // Delete Box button
    card.querySelector('.btn-delete-box').addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = confirm(`Delete box "${box.name}"? Songs inside will be unboxed, not deleted.`);
        if (!confirmed) return;

        // Remove box from localVinylBoxes
        const idx = localVinylBoxes.findIndex(b => b.id === boxId);
        if (idx !== -1) localVinylBoxes.splice(idx, 1);

        // Remove box from order
        localLibraryOrder = localLibraryOrder.filter(id => id !== boxId);

        // Save and re-render
        await window.localforage.setItem('vinyl_boxes', localVinylBoxes);
        await window.localforage.setItem('library_order', localLibraryOrder);

        activeEditExpandedCard = null;
        renderEditGrid();

        // Sync home grid
        if (window.appMainContext) {
            if (window.appMainContext.updateBoxCache)
                window.appMainContext.updateBoxCache([...localVinylBoxes], [...localLibraryOrder]);
            if (window.appMainContext.renderSongGrid)
                window.appMainContext.renderSongGrid();
        }
    });

    
    const removeBtns = card.querySelectorAll('.remove-song-btn');
    removeBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sid = btn.getAttribute('data-song-id');
            box.songIds = box.songIds.filter(id => id !== sid);
            await window.localforage.setItem('vinyl_boxes', localVinylBoxes);
            
            // Re-render the whole grid so the outer sleeves update immediately
            closeEditBoxExpansion();
            renderEditGrid();
            
            // Re-open the box visually
            const newCard = document.querySelector(`.vinyl-box-card[data-id="${boxId}"]`);
            if (newCard) {
                toggleEditBoxExpansion(newCard, boxId);
            }

            // Also update the main UI later
            if (window.appMainContext && window.appMainContext.renderSongGrid) {
                window.appMainContext.renderSongGrid();
            }
        });
    });

    // Drag out logic for inner songs
    const innerSongs = card.querySelectorAll('.inner-editable-song');
    innerSongs.forEach(songCard => {
        songCard.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            songCard.classList.add('dragging');
            const sid = songCard.getAttribute('data-song-id');
            const bid = songCard.getAttribute('data-box-id');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/json', JSON.stringify({ type: 'unbox-song', songId: sid, boxId: bid }));
        });
        songCard.addEventListener('dragend', (e) => {
            songCard.classList.remove('dragging');
        });
    });
}

// ============================================================
// Floating action bar: appears when songs are selected
// ============================================================
let _floatingBar = null;

function updateSelectionBar() {
    const count = selectedSongIds.size;
    const grid = document.getElementById('edit-song-grid');
    if (!grid) return;

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
            const songIds = Array.from(selectedSongIds);
            openPlaylistNamingModal(songIds);
            selectedSongIds.clear();
            document.querySelectorAll('.song-card.selected').forEach(el => el.classList.remove('selected'));
            updateSelectionBar();
        });

        _floatingBar.querySelector('.btn-clear-selection').addEventListener('click', () => {
            selectedSongIds.clear();
            document.querySelectorAll('.song-card.selected').forEach(el => el.classList.remove('selected'));
            updateSelectionBar();
        });

        // Animate in
        requestAnimationFrame(() => _floatingBar.classList.add('visible'));
    } else {
        _floatingBar.querySelector('.selection-count').textContent = `${count} selected`;
    }
}

// File ends here

/* ─── Custom Delete Box Modal ─────────────────────────── */
let _pendingDeleteBoxId = null;

function showDeleteBoxModal(boxId, boxName) {
    _pendingDeleteBoxId = boxId;

    // Update subtitle with box name
    const msgEl = document.getElementById('delete-box-modal-msg');
    if (msgEl) {
        msgEl.textContent = `"${boxName}" will be removed. The songs inside stay in your library.`;
    }

    const modal = document.getElementById('delete-box-modal');
    if (modal) modal.classList.remove('hidden');
}

// Wire up the modal buttons once (runs after DOM is ready)
document.addEventListener('DOMContentLoaded', () => {
    setupDeleteBoxModal();
});
// Also wire immediately in case DOM is already loaded
if (document.readyState !== 'loading') {
    setupDeleteBoxModal();
}

function setupDeleteBoxModal() {
    const modal   = document.getElementById('delete-box-modal');
    const cancelBtn  = document.getElementById('btn-cancel-delete-box');
    const confirmBtn = document.getElementById('btn-confirm-delete-box');
    if (!modal || !cancelBtn || !confirmBtn) return;

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        _pendingDeleteBoxId = null;
    });

    // Close on backdrop click
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

        // 1. Remove from arrays
        localVinylBoxes   = localVinylBoxes.filter(b => b.id !== boxId);
        localLibraryOrder = localLibraryOrder.filter(id => id !== boxId);

        // 2. Persist to IndexedDB
        await window.localforage.setItem('vinyl_boxes',    localVinylBoxes);
        await window.localforage.setItem('library_order',  localLibraryOrder);

        // 3. Sync home grid cache
        if (window.appMainContext && window.appMainContext.updateBoxCache) {
            window.appMainContext.updateBoxCache([...localVinylBoxes], [...localLibraryOrder]);
            if (window.appMainContext.renderSongGrid) {
                window.appMainContext.renderSongGrid();
            }
        }

        // 4. Refresh edit grid
        closeEditBoxExpansion();
        renderEditGrid();
    });
}
