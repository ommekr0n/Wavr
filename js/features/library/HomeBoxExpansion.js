/**
 * HomeBoxExpansion.js
 * Handles expanding and playing vinyl box playlists from home view.
 */
import coverImgUrl from '../../../assets/images/cover.png';
import { PlayerController } from '../player/PlayerController.js';

let activeExpandedCard = null;

export function setupBoxExpansionListeners(homeSongGrid, vinylBoxes, openPlayer, syncPlayerControlsUI) {
    const boxCards = homeSongGrid.querySelectorAll('.vinyl-box-card');
    boxCards.forEach(card => {
        card.addEventListener('click', (e) => {
            if (card.classList.contains('expanded-active')) return;
            const boxId = card.getAttribute('data-box-id');
            toggleBoxExpansion(card, boxId, vinylBoxes, openPlayer, syncPlayerControlsUI);
        });
    });
}

export function toggleBoxExpansion(card, boxId, vinylBoxes, openPlayer, syncPlayerControlsUI) {
    if (activeExpandedCard === card) { closeBoxExpansion(); return; }
    closeBoxExpansion();
    const playlist = PlayerController.getPlaylist();
    const box = vinylBoxes.find(b => b.id === boxId);
    if (!box) return;

    card.setAttribute('data-original-html', card.innerHTML);
    card.classList.add('expanded-active');
    activeExpandedCard = card;

    const boxSongs = (box.songIds || []).map(id => playlist.find(s => s.id === id)).filter(Boolean);
    let songsHTML = '';
    if (boxSongs.length === 0) {
        songsHTML = `<div style="padding: 30px 20px; color: var(--text-secondary); font-size: 0.9rem; text-align: center; width: 100%;">This vinyl box is currently empty. Go to <strong>Edit Library</strong> to add tracks.</div>`;
    } else {
        boxSongs.forEach((song, idx) => {
            songsHTML += `
                <div class="song-card box-slider-song-card" data-idx="${idx}">
                    <div class="song-cover-wrapper">
                        <img src="${song.cover || coverImgUrl}" alt="${song.title}">
                        <div class="box-song-play-overlay">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="#ffffff"><path d="M8 5v14l11-7z"></path></svg>
                        </div>
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
                <div style="display: flex; align-items: center; gap: 12px;">
                    <h2 class="box-expansion-title">${box.name}</h2>
                    <span class="box-track-badge" style="background: color-mix(in srgb, ${boxColor} 20%, rgba(255,255,255,0.08)); border: 1px solid color-mix(in srgb, ${boxColor} 40%, rgba(255,255,255,0.15)); color: #fff;">${boxSongs.length} Tracks</span>
                </div>
                <div class="box-expansion-controls">
                    <button class="btn-play-box glass-btn primary" style="background: ${boxColor}; color: #000; border: none; font-weight: 700; gap: 6px; padding: 8px 18px;" title="Play All Tracks in Box">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg> Play All
                    </button>
                    <button class="btn-close-box glass-btn danger" style="padding: 8px 12px;" title="Close Crate">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div class="box-expansion-slider-wrapper">
                <div class="box-expansion-slider">
                    ${songsHTML}
                </div>
            </div>
        </div>
    `;

    const closeBtn = card.querySelector('.btn-close-box');
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeBoxExpansion(); });

    const playBtnBox = card.querySelector('.btn-play-box');
    if (playBtnBox) playBtnBox.addEventListener('click', (e) => {
        e.stopPropagation();
        if (boxSongs.length > 0) {
            PlayerController.setActiveQueue([...boxSongs]);
            PlayerController.setActivePlaylistContext(box.id);
            PlayerController.setIsShuffle(true);
            PlayerController.setRepeatMode(1);
            PlayerController.generateShuffleQueue(false);
            if (syncPlayerControlsUI) syncPlayerControlsUI();
            if (openPlayer) openPlayer(0);
        }
    });

    const sliderSongs = card.querySelectorAll('.box-slider-song-card');
    sliderSongs.forEach(songCard => {
        songCard.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(songCard.getAttribute('data-idx'));
            PlayerController.setActiveQueue([...boxSongs]);
            PlayerController.setActivePlaylistContext(box.id);
            if (openPlayer) openPlayer(idx);
        });
    });
}

export function closeBoxExpansion() {
    if (activeExpandedCard) {
        activeExpandedCard.classList.remove('expanded-active');
        const originalHTML = activeExpandedCard.getAttribute('data-original-html');
        if (originalHTML) activeExpandedCard.innerHTML = originalHTML;
        activeExpandedCard = null;
    }
}
