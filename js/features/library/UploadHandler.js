/**
 * UploadHandler.js
 * Logic for uploading songs and fetching LRCLIB lyrics.
 */
import coverImgUrl from '../../../assets/images/cover.png';
import { PlayerController } from '../player/PlayerController.js';
import { saveLibraryToDB, renderSongGrid } from './HomeGridRenderer.js';
import { searchLRCLIB, autoSelectBestMatch, createLrcBlob, openLrcPickerModal } from '../../modules/lrc-fetcher.js';
import { SupabaseService } from '../../services/SupabaseService.js';

let pendingUploadLrcBlob = null;

export function setupUploadHandler({ uploadModal, uploadForm, uploadAudio, uploadLrc, uploadCover, uploadTitle, uploadArtist, showToast, homeSongGrid, setupBoxExpansionListeners }) {
    const getSearchTargetInfo = () => {
        const audioFile = uploadAudio.files[0];
        let title = uploadTitle.value.trim();
        let artist = uploadArtist.value.trim();
        if (!title && audioFile) {
            title = audioFile.name.replace(/\.[^/.]+$/, '');
        }
        return { title, artist, audioFile };
    };

    const MAX_SINGLE_FILE_BYTES = 35 * 1024 * 1024; // 35 MB max single file
    const MAX_TOTAL_QUOTA_BYTES = 500 * 1024 * 1024; // 500 MB max user vault
    const ALLOWED_EXTENSIONS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac'];

    const handleUploadForm = async (e) => {
        e.preventDefault();
        const playlist = PlayerController.getPlaylist();
        const audioFile = uploadAudio.files[0];
        const lrcFile = uploadLrc.files[0] || pendingUploadLrcBlob;
        let coverFile = uploadCover.files[0];
        const title = uploadTitle.value.trim() || `Song #${playlist.length + 1}`;
        const artist = uploadArtist.value.trim() || "Unknown Artist";

        if (!audioFile) { showToast('Please select an Audio file.', 'error'); return; }

        // ── Security Shield Layer 2: File extension & MIME check ──
        const ext = '.' + audioFile.name.split('.').pop().toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            showToast(`Security Shield: Invalid audio format (${ext}). Only MP3, FLAC, WAV, OGG, M4A allowed!`, 'error');
            return;
        }

        // ── Security Shield Layer 1: Single file size check (35MB limit) ──
        if (audioFile.size > MAX_SINGLE_FILE_BYTES) {
            showToast(`Security Shield: File too large (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). Max 35MB allowed!`, 'error');
            return;
        }

        // ── Security Shield Layer 3: Auth & Vault Quota check ──
        if (SupabaseService.isConfigured()) {
            const currentUser = await SupabaseService.getCurrentUser();
            if (!currentUser) {
                showToast('Security Shield: You must sign into your Cloud Vault to upload tracks!', 'error');
                const modalCloudVault = document.getElementById('modal-cloud-vault');
                if (modalCloudVault) modalCloudVault.classList.remove('hidden');
                return;
            }

            const usedBytes = await SupabaseService.getUserStorageBytes();
            if (usedBytes + audioFile.size > MAX_TOTAL_QUOTA_BYTES) {
                showToast(`Security Shield: Storage quota exceeded (${(usedBytes / 1024 / 1024).toFixed(1)}MB / 500MB). Delete old tracks to upload more!`, 'error');
                return;
            }
        }

        showToast('Uploading to Supabase Cloud Vault...', 'info');

        const processUpload = async (coverBlob, defaultCoverUrl) => {
            const createSongObject = async (lrcText) => {
                try {
                    let audioUrl = URL.createObjectURL(audioFile);
                    let coverUrl = defaultCoverUrl;

                    if (SupabaseService.isConfigured() && (await SupabaseService.getCurrentUser())) {
                        const fileNameSanitized = audioFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                        audioUrl = await SupabaseService.uploadMediaFile(audioFile, `tracks/${Date.now()}_${fileNameSanitized}`);
                        if (coverBlob instanceof Blob || coverBlob instanceof File) {
                            coverUrl = await SupabaseService.uploadMediaFile(coverBlob, `covers/${Date.now()}.webp`);
                        }
                    }

                    const newSong = {
                        id: 'song-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
                        title, artist, url: audioUrl, cover: coverUrl, lyrics: lrcText || '',
                        drift: 1.0, isEnhanced: Boolean(lrcText && lrcText.includes('<'))
                    };

                    if (SupabaseService.isConfigured() && (await SupabaseService.getCurrentUser())) {
                        const savedRecord = await SupabaseService.saveTrack({
                            title, artist, audioUrl, coverUrl, lrcText: lrcText || '',
                            isEnhanced: newSong.isEnhanced
                        });
                        if (savedRecord && savedRecord.id) newSong.id = savedRecord.id;
                    }

                    playlist.push(newSong);
                    await renderSongGrid({ homeSongGrid, setupBoxExpansionListeners });
                    showToast('Track successfully uploaded to Cloud Vault!', 'info');
                    
                    uploadForm.reset();
                    pendingUploadLrcBlob = null;
                    const uploadLrcStatus = document.getElementById('upload-lrc-status');
                    if (uploadLrcStatus) uploadLrcStatus.textContent = '';
                    uploadModal.classList.add('hidden');
                } catch (err) {
                    console.error('Upload Error:', err);
                    showToast('Upload failed: ' + (err.message || err), 'error');
                }
            };

            if (lrcFile) {
                const reader = new FileReader();
                reader.onload = async function(event) {
                    await createSongObject(event.target.result);
                };
                reader.readAsText(lrcFile);
            } else {
                await createSongObject('');
            }
        };

        if (coverFile) processUpload(coverFile, URL.createObjectURL(coverFile));
        else {
            fetch(coverImgUrl).then(r => r.blob()).then(blob => {
                processUpload(blob, coverImgUrl);
            }).catch(() => processUpload(null, coverImgUrl));
        }
    };

    uploadForm.addEventListener('submit', handleUploadForm);

    const btnAutoUploadLrc = document.getElementById('btn-auto-upload-lrc');
    const btnPickUploadLrc = document.getElementById('btn-pick-upload-lrc');
    const uploadLrcStatus = document.getElementById('upload-lrc-status');

    if (btnAutoUploadLrc) {
        btnAutoUploadLrc.addEventListener('click', async () => {
            const { title, artist } = getSearchTargetInfo();
            if (!title) {
                showToast('Please enter Track Title or select Audio file first.');
                return;
            }

            btnAutoUploadLrc.disabled = true;
            btnAutoUploadLrc.innerHTML = '⚡ Searching...';
            if (uploadLrcStatus) {
                uploadLrcStatus.textContent = '🔍 Connecting to LRCLIB database...';
                uploadLrcStatus.style.color = 'var(--accent-color)';
            }

            const results = await searchLRCLIB(title, artist);
            btnAutoUploadLrc.disabled = false;
            btnAutoUploadLrc.innerHTML = '⚡ Auto Match';

            const best = autoSelectBestMatch(results);
            if (best && best.syncedLyrics) {
                pendingUploadLrcBlob = createLrcBlob(best.syncedLyrics);
                if (uploadLrcStatus) {
                    uploadLrcStatus.textContent = `✓ Auto-attached: ${best.trackName} (${best.albumName || 'Single'})`;
                    uploadLrcStatus.style.color = '#4caf50';
                }
                showToast('Lyrics auto-matched and attached from LRCLIB!');
            } else {
                pendingUploadLrcBlob = null;
                if (uploadLrcStatus) {
                    uploadLrcStatus.textContent = '❌ No online lyrics found. Please upload .lrc manually.';
                    uploadLrcStatus.style.color = '#ef5350';
                }
                showToast('No online lyrics found for this song. Please upload a .lrc file manually.');
            }
        });
    }

    if (btnPickUploadLrc) {
        btnPickUploadLrc.addEventListener('click', async () => {
            const { title, artist } = getSearchTargetInfo();
            if (!title) {
                showToast('Please enter Track Title or select Audio file first.');
                return;
            }

            btnPickUploadLrc.disabled = true;
            btnPickUploadLrc.innerHTML = '📋 Searching...';
            if (uploadLrcStatus) {
                uploadLrcStatus.textContent = '🔍 Fetching available versions from LRCLIB...';
                uploadLrcStatus.style.color = 'var(--accent-color)';
            }

            const results = await searchLRCLIB(title, artist);
            btnPickUploadLrc.disabled = false;
            btnPickUploadLrc.innerHTML = '📋 Pick Version';

            if (!results || results.length === 0) {
                if (uploadLrcStatus) {
                    uploadLrcStatus.textContent = '❌ No online lyrics found. Please upload .lrc manually.';
                    uploadLrcStatus.style.color = '#ef5350';
                }
                showToast('No online lyrics found on LRCLIB.');
                return;
            }

            openLrcPickerModal(results, (selectedItem) => {
                pendingUploadLrcBlob = createLrcBlob(selectedItem.syncedLyrics);
                if (uploadLrcStatus) {
                    uploadLrcStatus.textContent = `✓ Selected version: ${selectedItem.trackName} (${selectedItem.albumName || 'Single'})`;
                    uploadLrcStatus.style.color = '#4caf50';
                }
                showToast('Selected lyrics version attached successfully!');
            });
        });
    }

    uploadAudio.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !window.jsmediatags) return;
        window.jsmediatags.read(file, {
            onSuccess: function(tag) {
                const tags = tag.tags;
                if (tags.title) uploadTitle.value = tags.title;
                if (tags.artist) uploadArtist.value = tags.artist;
                if (tags.picture) {
                    try {
                        const { data, format } = tags.picture;
                        const blob = new Blob([new Uint8Array(data)], { type: format });
                        const imgFile = new File([blob], "cover.jpg", { type: format });
                        const dt = new DataTransfer();
                        dt.items.add(imgFile);
                        uploadCover.files = dt.files;
                    } catch (err) { console.log("Could not attach cover art", err); }
                }
            },
            onError: (error) => console.log('Error reading tags', error)
        });
    });
}
