/**
 * SongCardDropHandler.js
 * Enables quick drag-and-drop of .lrc lyrics and image cover art directly onto Song Cards or Player View.
 */

import { saveLibraryToDB, renderSongGrid } from './HomeGridRenderer.js';
import { setupBoxExpansionListeners } from './HomeBoxExpansion.js';

export function setupSongCardDropHandler({
    PlayerController,
    LyricEngine,
    lyricsList,
    angelicTextContainer,
    cinematicTextContainer,
    showToast,
    loadTrack,
    updateProgress,
    homeSongGrid,
    openPlayer,
    syncPlayerControlsUI,
    audio,
    coverArt
}) {
    // ── Helper to process files for a specific track ─────────────────────────
    async function handleDroppedFilesForTrack(files, trackId) {
        if (!files || files.length === 0) return;
        const playlist = PlayerController.getPlaylist();
        const track = playlist.find(s => s.id === trackId);
        if (!track) return;

        const currentTrackIndex = PlayerController.getCurrentTrackIndex();
        const isCurrentPlaying = currentTrackIndex !== -1 && playlist[currentTrackIndex]?.id === trackId;

        for (const file of files) {
            const fileName = file.name.toLowerCase();

            // 1. Lyrics file (.lrc)
            if (fileName.endsWith('.lrc') || file.type === 'text/plain') {
                const text = await file.text();
                track.lyrics = text;
                saveLibraryToDB();

                if (isCurrentPlaying) {
                    LyricEngine.setLyrics(text);
                    LyricEngine.renderLyrics(lyricsList, angelicTextContainer, cinematicTextContainer);
                    if (updateProgress) updateProgress();
                }

                showToast(`⚡ Lyrics updated for "${track.title}"`);
            }
            // 2. Cover Art Image (.png, .jpg, .jpeg, .webp, .gif)
            else if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const dataUrl = e.target.result;
                    track.cover = dataUrl;
                    saveLibraryToDB();

                    // Update DOM image in home grid
                    const cardImg = document.querySelector(`.song-card[data-id="${trackId}"] img`);
                    if (cardImg) cardImg.src = dataUrl;

                    // Update player view if currently playing
                    if (isCurrentPlaying) {
                        if (coverArt) coverArt.src = dataUrl;
                        const bgGlow = document.getElementById('player-bg-glow');
                        if (bgGlow) bgGlow.style.backgroundImage = `url("${dataUrl}")`;
                        const artGlow = document.querySelector('.am-art-glow');
                        if (artGlow) artGlow.style.backgroundImage = `url("${dataUrl}")`;
                        const angelicVinylArt = document.getElementById('angelic-vinyl-art');
                        if (angelicVinylArt) angelicVinylArt.src = dataUrl;
                        const angelicBg = document.getElementById('angelic-bg');
                        if (angelicBg) angelicBg.style.backgroundImage = `url("${dataUrl}")`;
                    }

                    showToast(`🖼️ Cover art updated for "${track.title}"`);
                };
                reader.readAsDataURL(file);
            }
            // 3. Audio File (.mp3, .wav, .m4a, .flac)
            else if (file.type.startsWith('audio/') || fileName.endsWith('.mp3') || fileName.endsWith('.wav') || fileName.endsWith('.m4a') || fileName.endsWith('.flac')) {
                const audioUrl = URL.createObjectURL(file);
                track.url = audioUrl;
                saveLibraryToDB();

                if (isCurrentPlaying) {
                    const wasPlaying = PlayerController.getIsPlaying();
                    if (audio) {
                        audio.src = audioUrl;
                        audio.load();
                        if (wasPlaying) audio.play().catch(() => {});
                    }
                }

                showToast(`🎵 Audio source updated for "${track.title}"`);
            }
        }
    }

    // ── 1. Listen for drops on Home Song Grid ─────────────────────────────────
    if (homeSongGrid) {
        homeSongGrid.addEventListener('dragover', (e) => {
            const card = e.target.closest('.song-card:not(.vinyl-box-card)');
            if (card) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                card.classList.add('song-card-drop-active');
            }
        });

        homeSongGrid.addEventListener('dragleave', (e) => {
            const card = e.target.closest('.song-card:not(.vinyl-box-card)');
            if (card) {
                card.classList.remove('song-card-drop-active');
            }
        });

        homeSongGrid.addEventListener('drop', (e) => {
            const card = e.target.closest('.song-card:not(.vinyl-box-card)');
            if (card) {
                e.preventDefault();
                e.stopPropagation();
                card.classList.remove('song-card-drop-active');

                const trackId = card.getAttribute('data-id');
                if (trackId && e.dataTransfer && e.dataTransfer.files) {
                    handleDroppedFilesForTrack(e.dataTransfer.files, trackId);
                }
            }
        });
    }

    // ── 2. Listen for drops on Player View Cover Art ─────────────────────────
    const playerArtContainer = document.querySelector('.am-art-container');
    if (playerArtContainer) {
        playerArtContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            playerArtContainer.classList.add('player-art-drop-active');
        });

        playerArtContainer.addEventListener('dragleave', () => {
            playerArtContainer.classList.remove('player-art-drop-active');
        });

        playerArtContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            playerArtContainer.classList.remove('player-art-drop-active');

            const currentTrackIndex = PlayerController.getCurrentTrackIndex();
            const playlist = PlayerController.getPlaylist();
            const currentTrack = playlist[currentTrackIndex];

            if (currentTrack && e.dataTransfer && e.dataTransfer.files) {
                handleDroppedFilesForTrack(e.dataTransfer.files, currentTrack.id);
            }
        });
    }
}
