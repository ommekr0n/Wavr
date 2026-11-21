/**
 * LibraryModals.js
 * Encapsulates all modal state and exposes window.appMainContext for
 * backward-compatibility with js/modules/edit-library.js.
 * Extracted 1:1 from backup_prime/js/main.js (lines 532-670, 3067-3168)
 */

import { searchLRCLIB, autoSelectBestMatch, openLrcPickerModal } from '../../modules/lrc-fetcher.js';
import { SupabaseService } from '../../services/SupabaseService.js';
import { escapeHtml, safeImageUrl } from '../../modules/safe-html.js';
import { removeLibraryTrackFromQueue } from './LibraryQueueMaintenance.js';
import { getCachedLibraryOrder, setCachedLibraryOrder } from './HomeGridRenderer.js';

const MAX_EDIT_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_EDIT_COVER_BYTES = 15 * 1024 * 1024;
const MAX_EDIT_LRC_BYTES = 2 * 1024 * 1024;
const ALLOWED_AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac'];
const ALLOWED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'];
const ALLOWED_LRC_EXTS = ['.lrc', '.txt'];

function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result || '');
        reader.onerror = () => reject(reader.error || new Error('Failed to read lyrics file'));
        reader.readAsText(file);
    });
}

// ── Modal State ──────────────────────────────────────────────────────────────
// These mirror the exact variables scattered in main.js
let trackToDeleteIndex = null;
let trackToEditIndex   = null;
let currentBoxIdForAdd     = null;
let currentVinylBoxesArray = null;
let pendingEditLrcText     = null;

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
let _showToast             = null;
let _clearPlayback         = null;
let _resetMediaGate        = null;

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
        _showToast              = deps.showToast;
        _clearPlayback          = deps.clearPlayback;
        _resetMediaGate         = deps.resetMediaGate;

        // ── window.appMainContext bridge ─────────────────────────────────────
        // MUST expose these exact keys to preserve compatibility with edit-library.js
        Object.assign(window.appMainContext || (window.appMainContext = {}), {
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
        });
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
                    const song = playlist ? playlist[idx] : null;
                    if (SupabaseService.isConfigured() && song && song.id) {
                        try {
                            await SupabaseService.deleteTrack(song.id);
                        } catch (sErr) {
                            console.warn('Supabase cloud track delete error:', sErr);
                        }
                    }

                    // Clean up Blob URLs
                    if (playlist[idx].url   && playlist[idx].url.startsWith('blob:'))   URL.revokeObjectURL(playlist[idx].url);
                    if (playlist[idx].cover && playlist[idx].cover.startsWith('blob:')) URL.revokeObjectURL(playlist[idx].cover);

                    playlist.splice(idx, 1);

                    // Scrub deleted song ID from vinylBoxes and libraryOrder
                    if (song && song.id) {
                        const boxes = _getCachedVinylBoxes ? _getCachedVinylBoxes() : null;
                        if (Array.isArray(boxes)) {
                            let boxesChanged = false;
                            const cleanedBoxes = boxes.map((box) => {
                                if (Array.isArray(box.songIds) && box.songIds.includes(song.id)) {
                                    boxesChanged = true;
                                    return { ...box, songIds: box.songIds.filter((id) => id !== song.id) };
                                }
                                return box;
                            });
                            if (boxesChanged) {
                                if (_setCachedVinylBoxes) _setCachedVinylBoxes(cleanedBoxes);
                                if (window.appEditLibraryContext?.syncBoxes) {
                                    window.appEditLibraryContext.syncBoxes([...cleanedBoxes]);
                                }
                            }
                        }

                        const currentOrder = getCachedLibraryOrder();
                        if (Array.isArray(currentOrder) && currentOrder.includes(song.id)) {
                            setCachedLibraryOrder(currentOrder.filter((id) => id !== song.id));
                        }
                    }

                    removeLibraryTrackFromQueue(song, {
                        pauseAudio: _pauseAudio,
                        loadTrack: _loadTrack,
                        updateMiniPlayerUI: _updateMiniPlayerUI,
                        clearPlayback: _clearPlayback,
                        resetMediaGate: _resetMediaGate
                    });

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
        // ── Edit Modal LRCLIB Fetch Button ────────────────────────────────────
        const btnAutoEditLrc = document.getElementById('btn-auto-edit-lrc');
        const btnPickEditLrc = document.getElementById('btn-pick-edit-lrc');
        const editLrcStatus = document.getElementById('edit-lrc-status');

        if (btnAutoEditLrc) {
            btnAutoEditLrc.addEventListener('click', async () => {
                const title = document.getElementById('edit-title').value.trim();
                const artist = document.getElementById('edit-artist').value.trim();

                if (!title) {
                    if (_showToast) _showToast('Please enter Track Title first.');
                    return;
                }

                btnAutoEditLrc.disabled = true;
                btnAutoEditLrc.innerHTML = '⚡ Searching...';
                if (editLrcStatus) {
                    editLrcStatus.textContent = '🔍 Connecting to LRCLIB database...';
                    editLrcStatus.style.color = 'var(--accent-color)';
                }

                const results = await searchLRCLIB(title, artist);
                btnAutoEditLrc.disabled = false;
                btnAutoEditLrc.innerHTML = '⚡ Auto Match';

                const best = autoSelectBestMatch(results);
                if (best && best.syncedLyrics) {
                    pendingEditLrcText = best.syncedLyrics;
                    if (editLrcStatus) {
                        editLrcStatus.textContent = `✓ Auto-attached: ${best.trackName} (${best.albumName || 'Single'})`;
                        editLrcStatus.style.color = '#4caf50';
                    }
                    if (_showToast) _showToast('Lyrics auto-matched and attached from LRCLIB!');
                } else {
                    pendingEditLrcText = null;
                    if (editLrcStatus) {
                        editLrcStatus.textContent = '❌ No online lyrics found. Please upload .lrc manually.';
                        editLrcStatus.style.color = '#ef5350';
                    }
                    if (_showToast) _showToast('No online lyrics found for this song. Please upload a .lrc file manually.');
                }
            });
        }

        if (btnPickEditLrc) {
            btnPickEditLrc.addEventListener('click', async () => {
                const title = document.getElementById('edit-title').value.trim();
                const artist = document.getElementById('edit-artist').value.trim();

                if (!title) {
                    if (_showToast) _showToast('Please enter Track Title first.');
                    return;
                }

                btnPickEditLrc.disabled = true;
                btnPickEditLrc.innerHTML = '📋 Searching...';
                if (editLrcStatus) {
                    editLrcStatus.textContent = '🔍 Fetching available versions from LRCLIB...';
                    editLrcStatus.style.color = 'var(--accent-color)';
                }

                const results = await searchLRCLIB(title, artist);
                btnPickEditLrc.disabled = false;
                btnPickEditLrc.innerHTML = '📋 Pick Version';

                if (!results || results.length === 0) {
                    if (editLrcStatus) {
                        editLrcStatus.textContent = '❌ No online lyrics found. Please upload .lrc manually.';
                        editLrcStatus.style.color = '#ef5350';
                    }
                    if (_showToast) _showToast('No online lyrics found on LRCLIB.');
                    return;
                }

                openLrcPickerModal(results, (selectedItem) => {
                    pendingEditLrcText = selectedItem.syncedLyrics;
                    if (editLrcStatus) {
                        editLrcStatus.textContent = `✓ Selected version: ${selectedItem.trackName} (${selectedItem.albumName || 'Single'})`;
                        editLrcStatus.style.color = '#4caf50';
                    }
                    if (_showToast) _showToast('Selected lyrics version attached successfully!');
                });
            });
        }

        // ── Cancel Edit Handler ──────────────────────────────────────────────
        document.getElementById('btn-cancel-edit').addEventListener('click', () => {
            document.getElementById('edit-modal').classList.add('hidden');
            trackToEditIndex = null;
            pendingEditLrcText = null;
            if (editLrcStatus) editLrcStatus.textContent = '';
        });

        const editForm = document.getElementById('edit-form');
        let isEditing = false;
        if (editForm) {
            editForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (isEditing) return;
                if (trackToEditIndex === null) return;

                const idx       = parseInt(trackToEditIndex);
                const playlist  = _getPlaylist();
                const newTitle  = document.getElementById('edit-title').value.trim();
                const newArtist = document.getElementById('edit-artist').value.trim();
                const audioFile = document.getElementById('edit-audio').files[0];
                const lrcFile   = document.getElementById('edit-lrc').files[0];
                const coverFile = document.getElementById('edit-cover').files[0];

                if (!newTitle || !newArtist) {
                    alert('Please fill in Title and Artist fields.');
                    return;
                }

                const notifyError = (msg) => {
                    if (_showToast) _showToast(msg, 'error');
                    else alert(msg);
                };

                if (audioFile) {
                    const audioExt = '.' + (audioFile.name || '').split('.').pop().toLowerCase();
                    const validAudioMime = audioFile.type ? audioFile.type.startsWith('audio/') : false;
                    const validAudioExt = ALLOWED_AUDIO_EXTS.includes(audioExt);
                    if ((audioFile.type && !validAudioMime) || (!validAudioMime && !validAudioExt)) {
                        notifyError(`Invalid audio format (${audioExt}). Only MP3, FLAC, WAV, OGG, M4A, AAC allowed.`);
                        return;
                    }
                    if (audioFile.size > MAX_EDIT_AUDIO_BYTES) {
                        notifyError(`Audio file too large (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). Max 100MB allowed.`);
                        return;
                    }
                }

                if (coverFile) {
                    const coverExt = '.' + (coverFile.name || '').split('.').pop().toLowerCase();
                    const validCoverMime = coverFile.type ? (coverFile.type.startsWith('image/') && coverFile.type !== 'image/svg+xml') : false;
                    const validCoverExt = ALLOWED_IMAGE_EXTS.includes(coverExt);
                    if ((coverFile.type && !validCoverMime) || (!validCoverMime && !validCoverExt)) {
                        notifyError('Invalid cover image format. Only PNG, JPG, WEBP, GIF allowed.');
                        return;
                    }
                    if (coverFile.size > MAX_EDIT_COVER_BYTES) {
                        notifyError(`Cover image too large (${(coverFile.size / 1024 / 1024).toFixed(1)}MB). Max 15MB allowed.`);
                        return;
                    }
                }

                if (lrcFile) {
                    const lrcExt = '.' + (lrcFile.name || '').split('.').pop().toLowerCase();
                    if (!ALLOWED_LRC_EXTS.includes(lrcExt)) {
                        notifyError(`Invalid lyrics format (${lrcExt}). Only .lrc or .txt allowed.`);
                        return;
                    }
                    if (lrcFile.size > MAX_EDIT_LRC_BYTES) {
                        notifyError(`Lyrics file too large (${(lrcFile.size / 1024 / 1024).toFixed(1)}MB). Max 2MB allowed.`);
                        return;
                    }
                }

                const submitBtn = editForm.querySelector?.('button[type="submit"], input[type="submit"]');
                isEditing = true;
                if (submitBtn) submitBtn.disabled = true;

                let tempAudioBlobUrl = null;
                let tempCoverBlobUrl = null;
                const song = playlist[idx];

                try {
                    song.title  = newTitle;
                    song.artist = newArtist;

                    if (audioFile) {
                        if (song.url && song.url.startsWith('blob:')) URL.revokeObjectURL(song.url);
                        song.audioBlob = audioFile;
                        tempAudioBlobUrl = URL.createObjectURL(audioFile);
                        song.url = tempAudioBlobUrl;
                        if (_getCurrentTrackIndex() === idx) {
                            const wasPlaying = _getIsPlaying();
                            _loadTrack(idx);
                            if (wasPlaying) _playAudio();
                        }
                    }

                    if (coverFile) {
                        if (song.cover && song.cover.startsWith('blob:')) URL.revokeObjectURL(song.cover);
                        song.coverBlob = coverFile;
                        tempCoverBlobUrl = URL.createObjectURL(coverFile);
                        song.cover = tempCoverBlobUrl;
                    }

                    if (lrcFile) {
                        song.lyrics = await readTextFile(lrcFile);
                        if (_parseLyrics && _getCurrentTrackIndex() === idx) {
                            _parseLyrics(song.lyrics);
                        }
                    } else if (pendingEditLrcText) {
                        song.lyrics = pendingEditLrcText;
                        if (_parseLyrics && _getCurrentTrackIndex() === idx) {
                            _parseLyrics(song.lyrics);
                        }
                    }

                    // If song is stored in Supabase Cloud Vault, update the cloud database record
                    if (SupabaseService.isConfigured() && song && song.id) {
                        try {
                            const currentUser = await SupabaseService.getCurrentUser();
                            if (currentUser) {
                                let updatedAudioUrl = song.url;
                                let updatedCoverUrl = song.cover;

                                // Upload new audio file if replaced
                                if (audioFile) {
                                    const fileNameSanitized = audioFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                                    updatedAudioUrl = await SupabaseService.uploadMediaFile(audioFile, `tracks/${Date.now()}_${fileNameSanitized}`);
                                    const resolvedAudioUrl = await SupabaseService.resolveMediaUrl(updatedAudioUrl);
                                    song.url = resolvedAudioUrl;
                                    if (_getCurrentTrackIndex() === idx) {
                                        const wasPlaying = _getIsPlaying();
                                        _loadTrack(idx);
                                        if (wasPlaying) _playAudio();
                                    }
                                    if (tempAudioBlobUrl && resolvedAudioUrl !== tempAudioBlobUrl) {
                                        URL.revokeObjectURL(tempAudioBlobUrl);
                                        tempAudioBlobUrl = null;
                                    }
                                }

                                // Upload new cover file if replaced
                                if (coverFile) {
                                    updatedCoverUrl = await SupabaseService.uploadMediaFile(coverFile, `covers/${Date.now()}.webp`);
                                    const resolvedCoverUrl = await SupabaseService.resolveMediaUrl(updatedCoverUrl);
                                    if (tempCoverBlobUrl && resolvedCoverUrl !== tempCoverBlobUrl) {
                                        URL.revokeObjectURL(tempCoverBlobUrl);
                                        tempCoverBlobUrl = null;
                                    }
                                    song.cover = resolvedCoverUrl;
                                }

                                await SupabaseService.updateTrack(song.id, {
                                    title: song.title,
                                    artist: song.artist,
                                    audioUrl: updatedAudioUrl,
                                    coverUrl: updatedCoverUrl,
                                    lrcText: song.lyrics || '',
                                    fileSize: audioFile ? audioFile.size : song.fileSize
                                });

                                if (_showToast) _showToast('Track updated in Personal Cloud Vault!');
                            }
                        } catch (cloudErr) {
                            console.error('Supabase cloud track update error:', cloudErr);
                            if (_showToast) _showToast('Cloud update error: ' + cloudErr.message, 'error');
                        }
                    }

                    _renderSongGrid();
                    _updateMiniPlayerUI();
                    await _saveLibraryToDB();
                    document.dispatchEvent(new CustomEvent('wavr:libraryChanged'));
                    document.getElementById('edit-modal').classList.add('hidden');
                    trackToEditIndex = null;
                    pendingEditLrcText = null;
                    if (editLrcStatus) editLrcStatus.textContent = '';
                } catch (err) {
                    if (tempAudioBlobUrl && song.url !== tempAudioBlobUrl) URL.revokeObjectURL(tempAudioBlobUrl);
                    if (tempCoverBlobUrl && song.cover !== tempCoverBlobUrl) URL.revokeObjectURL(tempCoverBlobUrl);
                    console.error('Edit track error:', err);
                    notifyError('Edit failed: ' + (err.message || err));
                } finally {
                    isEditing = false;
                    if (submitBtn) submitBtn.disabled = false;
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
        const modal = document.getElementById('delete-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
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
        pendingEditLrcText = null;
        const song = _getPlaylist()[index];
        if (!song) return;
        document.getElementById('edit-form').reset();
        const editLrcStatus = document.getElementById('edit-lrc-status');
        if (editLrcStatus) editLrcStatus.textContent = '';
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
                    <img src="${escapeHtml(safeImageUrl(song.cover, 'assets/images/cover.png'))}" alt="Cover">
                    <div class="add-song-info">
                        <div class="title">${escapeHtml(song.title)}</div>
                        <div class="artist">${escapeHtml(song.artist)}</div>
                    </div>
                    <button type="button" class="add-song-quick-btn glass-icon-btn primary" title="Add to Box" aria-label="Add ${escapeHtml(song.title)} to box">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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

                        // Update in-memory cache immediately and persist/sync to DB
                        _setCachedVinylBoxes(currentVinylBoxesArray);
                        if (_saveLibraryToDB) _saveLibraryToDB();

                        _renderSongGrid();
                        if (window.appEditLibraryContext && window.appEditLibraryContext.syncBoxes) {
                            window.appEditLibraryContext.syncBoxes([...currentVinylBoxesArray]);
                        }
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
