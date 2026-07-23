/**
 * LibraryModals.js
 * Encapsulates all modal state and exposes window.appMainContext for
 * backward-compatibility with js/modules/edit-library.js.
 * Extracted 1:1 from backup_prime/js/main.js (lines 532-670, 3067-3168)
 */

// ── Modal State ──────────────────────────────────────────────────────────────
// These mirror the exact variables scattered in main.js
let trackToDeleteIndex = null;
let trackToEditIndex   = null;
let currentBoxIdForAdd     = null;
let currentVinylBoxesArray = null;

// Injected at init() time
let _renderSongGrid   = null;
let _getPlaylist      = null;
let _saveLibraryToDB  = null;
let _parseLyrics      = null;
let _getCachedVinylBoxes   = null;
let _setCachedVinylBoxes   = null;
let _getCurrentTrackIndex  = null;
let _pauseAudio            = null;
let _loadTrack             = null;
let _updateMiniPlayerUI    = null;
let _getIsPlaying          = null;
let _playAudio             = null;

export const LibraryModals = {

    /**
     * Initialises the modal system by injecting references from main.js orchestrator.
     * Also sets up window.appMainContext for backward-compat with edit-library.js.
     *
     * @param {object} deps - Dependency map from the orchestrator
     */
    init(deps) {
        _renderSongGrid         = deps.renderSongGrid;
        _getPlaylist            = deps.getPlaylist;
        _saveLibraryToDB        = deps.saveLibraryToDB;
        _parseLyrics            = deps.parseLyrics;
        _getCachedVinylBoxes    = deps.getCachedVinylBoxes;
        _setCachedVinylBoxes    = deps.setCachedVinylBoxes;
        _getCurrentTrackIndex   = deps.getCurrentTrackIndex;
        _pauseAudio             = deps.pauseAudio;
        _loadTrack              = deps.loadTrack;
        _updateMiniPlayerUI     = deps.updateMiniPlayerUI;
        _getIsPlaying           = deps.getIsPlaying;
        _playAudio              = deps.playAudio;

        // ── window.appMainContext bridge ─────────────────────────────────────
        // MUST expose these exact keys to preserve compatibility with edit-library.js
        window.appMainContext = {
            renderSongGrid:         _renderSongGrid,
            openAddSongsModal:      (box, vinylBoxesArray) => LibraryModals.openAddSongsModal(box, vinylBoxesArray),
            showEditModalBySongId:  (songId) => LibraryModals.showEditModalBySongId(songId),
            showDeleteModalBySongId:(songId) => LibraryModals.showDeleteModalBySongId(songId),
            getPlaylist:            _getPlaylist,
            // Called by edit-library after any box/order mutation to keep home grid cache in sync
            updateBoxCache: (boxes, order) => {
                if (boxes !== undefined) _setCachedVinylBoxes(boxes);
                // order is stored in cachedLibraryOrder in main.js; we emit an event for it
                if (order !== undefined) {
                    document.dispatchEvent(new CustomEvent('wavr:updateLibraryOrder', { detail: { order } }));
                }
            },
            openPlaylistNameModal: (box, boxes, cb) => {
                document.dispatchEvent(new CustomEvent('wavr:openEditBox', { detail: { boxId: box.id, cb } }));
            }
        };
    },

    /**
     * Binds all click / submit events for delete modal, edit modal, and add-songs modal.
     * Extracted 1:1 from backup_prime/js/main.js lines 538-670, 3136-3140.
     */
    bindEvents() {
        // ── Delete Modal ─────────────────────────────────────────────────────
        document.getElementById('btn-cancel-delete').addEventListener('click', () => {
            document.getElementById('delete-modal').classList.add('hidden');
            trackToDeleteIndex = null;
        });

        document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
            try {
                if (trackToDeleteIndex !== null) {
                    const idx = parseInt(trackToDeleteIndex);
                    const playlist = _getPlaylist();

                    // Clean up Blob URLs
                    if (playlist[idx].url   && playlist[idx].url.startsWith('blob:'))   URL.revokeObjectURL(playlist[idx].url);
                    if (playlist[idx].cover && playlist[idx].cover.startsWith('blob:')) URL.revokeObjectURL(playlist[idx].cover);

                    const currentTrackIndex = _getCurrentTrackIndex();

                    if (currentTrackIndex === idx) {
                        _pauseAudio();
                        playlist.splice(idx, 1);
                        if (playlist.length > 0) {
                            await _renderSongGrid();
                            // currentTrackIndex reset to 0 is handled by orchestrator after this
                            _loadTrack(0);
                            _updateMiniPlayerUI();
                        } else {
                            // No tracks left
                            document.getElementById('audio-player').src = '';
                            _updateMiniPlayerUI();
                        }
                    } else {
                        playlist.splice(idx, 1);
                    }

                    _renderSongGrid();
                    await _saveLibraryToDB();

                    document.dispatchEvent(new CustomEvent('wavr:libraryChanged'));
                    document.getElementById('delete-modal').classList.add('hidden');
                    trackToDeleteIndex = null;
                }
            } catch (error) {
                console.error('Delete error: ', error);
                alert('Lỗi khi xóa bài hát: ' + error.message);
            }
        });

        // ── Edit Modal ───────────────────────────────────────────────────────
        document.getElementById('btn-cancel-edit').addEventListener('click', () => {
            document.getElementById('edit-modal').classList.add('hidden');
            trackToEditIndex = null;
        });

        const editForm = document.getElementById('edit-form');
        if (editForm) {
            editForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (trackToEditIndex !== null) {
                    const idx       = parseInt(trackToEditIndex);
                    const playlist  = _getPlaylist();
                    const newTitle  = document.getElementById('edit-title').value.trim();
                    const newArtist = document.getElementById('edit-artist').value.trim();
                    const audioFile = document.getElementById('edit-audio').files[0];
                    const lrcFile   = document.getElementById('edit-lrc').files[0];
                    const coverFile = document.getElementById('edit-cover').files[0];

                    if (newTitle && newArtist) {
                        const song   = playlist[idx];
                        song.title   = newTitle;
                        song.artist  = newArtist;

                        if (audioFile) {
                            if (song.url && song.url.startsWith('blob:')) URL.revokeObjectURL(song.url);
                            song.audioBlob = audioFile;
                            song.url       = URL.createObjectURL(audioFile);
                            if (_getCurrentTrackIndex() === idx) {
                                const wasPlaying = _getIsPlaying();
                                _loadTrack(idx);
                                if (wasPlaying) _playAudio();
                            }
                        }

                        if (coverFile) {
                            if (song.cover && song.cover.startsWith('blob:')) URL.revokeObjectURL(song.cover);
                            song.coverBlob = coverFile;
                            song.cover     = URL.createObjectURL(coverFile);
                        }

                        const finishEdit = async () => {
                            _renderSongGrid();
                            _updateMiniPlayerUI();
                            await _saveLibraryToDB();
                            document.dispatchEvent(new CustomEvent('wavr:libraryChanged'));
                            document.getElementById('edit-modal').classList.add('hidden');
                            trackToEditIndex = null;
                        };

                        if (lrcFile) {
                            const reader = new FileReader();
                            reader.onload = function(event) {
                                song.lyrics = event.target.result;
                                if (_parseLyrics && _getCurrentTrackIndex() === idx) {
                                    _parseLyrics(song.lyrics);
                                }
                                finishEdit();
                            };
                            reader.readAsText(lrcFile);
                        } else {
                            finishEdit();
                        }
                    } else {
                        alert('Vui lòng điền đầy đủ Tiêu đề và Tên nghệ sĩ.');
                    }
                }
            });
        }

        // ── Add Songs to Box Modal ───────────────────────────────────────────
        document.getElementById('btn-cancel-add-songs').addEventListener('click', () => {
            document.getElementById('add-songs-to-box-modal').classList.add('hidden');
            currentBoxIdForAdd     = null;
            currentVinylBoxesArray = null;
        });
    },

    /**
     * Opens the delete confirmation modal for a song by its playlist index.
     * Extracted 1:1 from backup_prime/js/main.js lines 532-536.
     *
     * @param {number} index - Playlist index of the song to delete
     */
    showDeleteModal(index) {
        trackToDeleteIndex = index;
        document.getElementById('delete-modal').classList.remove('hidden');
    },

    /**
     * Opens the delete confirmation modal by a song ID (bridge for edit-library.js).
     * Extracted 1:1 from backup_prime/js/main.js lines 3148-3151.
     *
     * @param {string} songId
     */
    showDeleteModalBySongId(songId) {
        const playlist = _getPlaylist();
        const index = playlist.findIndex(s => s.id === songId);
        if (index !== -1) LibraryModals.showDeleteModal(index);
    },

    /**
     * Opens the edit metadata modal by playlist index.
     * Extracted 1:1 from backup_prime/js/main.js lines 591-602.
     *
     * @param {number} index - Playlist index
     */
    showEditModal(index) {
        trackToEditIndex = index;
        const song = _getPlaylist()[index];
        document.getElementById('edit-form').reset();
        document.getElementById('edit-title').value  = song.title  || '';
        document.getElementById('edit-artist').value = song.artist || '';
        document.getElementById('edit-modal').classList.remove('hidden');
        // Close any open context menus
        document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    },

    /**
     * Opens the edit metadata modal by a song ID (bridge for edit-library.js).
     * Extracted 1:1 from backup_prime/js/main.js lines 3143-3146.
     *
     * @param {string} songId
     */
    showEditModalBySongId(songId) {
        const playlist = _getPlaylist();
        const index = playlist.findIndex(s => s.id === songId);
        if (index !== -1) LibraryModals.showEditModal(index);
    },

    /**
     * Opens the "Add Songs to Box" modal.
     * Extracted 1:1 from backup_prime/js/main.js lines 3071-3133.
     *
     * @param {object}   box              - The target vinyl box object
     * @param {object[]} vinylBoxesArray  - The full vinyl boxes array (mutable ref)
     */
    openAddSongsModal(box, vinylBoxesArray) {
        currentBoxIdForAdd     = box.id;
        currentVinylBoxesArray = vinylBoxesArray;

        const modal = document.getElementById('add-songs-to-box-modal');
        const list  = document.getElementById('add-songs-list');
        list.innerHTML = '';

        const playlist      = _getPlaylist();
        const boxSongIds    = new Set(box.songIds || []);
        const availableSongs = playlist.filter(song => !boxSongIds.has(song.id));

        if (availableSongs.length === 0) {
            list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No other songs available to add.</div>';
        } else {
            availableSongs.forEach(song => {
                const item = document.createElement('div');
                item.className = 'add-song-item';
                item.innerHTML = `
                    <img src="${song.cover || 'assets/images/cover.png'}" alt="Cover">
                    <div class="add-song-info">
                        <div class="title">${song.title}</div>
                        <div class="artist">${song.artist}</div>
                    </div>
                    <button class="add-song-quick-btn glass-icon-btn primary" title="Add to Box">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                `;
                list.appendChild(item);

                item.addEventListener('click', () => {
                    if (!currentBoxIdForAdd || !currentVinylBoxesArray) return;
                    const b = currentVinylBoxesArray.find(b => b.id === currentBoxIdForAdd);
                    if (b) {
                        if (!b.songIds) b.songIds = [];
                        b.songIds.push(song.id);

                        // Update in-memory cache immediately
                        _setCachedVinylBoxes(currentVinylBoxesArray);

                        localforage.setItem('vinyl_boxes', currentVinylBoxesArray).then(() => {
                            _renderSongGrid();
                            if (window.appEditLibraryContext && window.appEditLibraryContext.syncBoxes) {
                                window.appEditLibraryContext.syncBoxes([...currentVinylBoxesArray]);
                            }
                        });
                    }

                    item.remove();
                    if (list.children.length === 0) {
                        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No other songs available to add.</div>';
                    }
                });
            });
        }

        modal.classList.remove('hidden');
    },
};
