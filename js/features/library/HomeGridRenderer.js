/**
 * HomeGridRenderer.js
 * Renders home view song cards and vinyl boxes grid.
 */
import coverImgUrl from '../../../assets/images/cover.png';
import { PlayerController } from '../player/PlayerController.js';

let cachedVinylBoxes = [];
let cachedLibraryOrder = [];

export function getCachedVinylBoxes() { return cachedVinylBoxes; }
export function setCachedVinylBoxes(val) { cachedVinylBoxes = val; }
export function getCachedLibraryOrder() { return cachedLibraryOrder; }
export function setCachedLibraryOrder(val) { cachedLibraryOrder = val; }

export function updateBoxCache(boxes, order) {
    cachedVinylBoxes = boxes;
    cachedLibraryOrder = order;
}

export async function renderSongGrid({ homeSongGrid, setupBoxExpansionListeners }) {
    if (!homeSongGrid) return;
    homeSongGrid.innerHTML = '';
    const playlist = PlayerController.getPlaylist();

    if (cachedVinylBoxes.length === 0 && cachedLibraryOrder.length === 0) {
        try {
            cachedVinylBoxes = await window.localforage.getItem('vinyl_boxes') || [];
            cachedLibraryOrder = await window.localforage.getItem('library_order') || [];
        } catch (e) {
            console.error("Error loading vinyl boxes or order", e);
        }
    }
    const vinylBoxes = cachedVinylBoxes;
    const libraryOrder = cachedLibraryOrder;

    const boxedSongIds = new Set();
    vinylBoxes.forEach(box => {
        if (box.songIds) box.songIds.forEach(id => boxedSongIds.add(id));
    });

    const unorderedItems = [];
    vinylBoxes.forEach(box => {
        unorderedItems.push({ type: 'box', id: box.id, name: box.name, songIds: box.songIds || [], raw: box });
    });
    playlist.forEach((song, index) => {
        if (!boxedSongIds.has(song.id)) {
            unorderedItems.push({ type: 'song', id: song.id, index: index, raw: song });
        }
    });

    const gridItems = [];
    const itemMap = new Map();
    unorderedItems.forEach(item => itemMap.set(item.id, item));
    libraryOrder.forEach(orderId => {
        if (itemMap.has(orderId)) { gridItems.push(itemMap.get(orderId)); itemMap.delete(orderId); }
    });
    itemMap.forEach(item => gridItems.push(item));

    gridItems.forEach(item => {
        const card = document.createElement('div');
        if (item.type === 'song') {
            const song = item.raw;
            card.className = 'song-card';
            card.setAttribute('data-index', item.index);
            card.setAttribute('data-id', song.id);
            card.innerHTML = `
                <div class="song-card-inner">
                    <img src="${song.cover || coverImgUrl}" alt="Cover">
                </div>
                <div class="song-card-title">${song.title}</div>
                <div class="song-card-artist">${song.artist}</div>
            `;
        } else {
            const box = item.raw;
            card.className = 'song-card vinyl-box-card';
            card.setAttribute('data-box-id', box.id);
            card.style.setProperty('--box-color', box.color || '#5a4232');

            const boxSongs = (box.songIds || []).map(id => playlist.find(s => s.id === id)).filter(Boolean);
            const recentSongs = [...boxSongs].slice(0, 4);

            let sleevesHTML = '';
            for (let i = 0; i < recentSongs.length; i++) {
                const song = recentSongs[i];
                const coverUrl = song.cover || coverImgUrl;
                const sleeveClass = `sleeve-${i}`;
                sleevesHTML += `<div class="peeking-sleeve ${sleeveClass}" style="background-image: url('${coverUrl}')"></div>`;
            }

            card.innerHTML = `
                <div class="song-card-inner box-card-inner" style="aspect-ratio: 1/1; margin-bottom: 15px;">
                    <div class="vinyl-box-visual" style="--box-color: ${box.color || '#5a4232'};">
                        <div class="vinyl-sleeves-container">
                            ${sleevesHTML}
                            <div class="glass-front"></div>
                        </div>
                    </div>
                </div>
                <div class="song-card-title">${box.name}</div>
                <div class="song-card-artist">${box.songIds ? box.songIds.length : 0} Tracks</div>
            `;
        }
        homeSongGrid.appendChild(card);
    });

    if (setupBoxExpansionListeners) setupBoxExpansionListeners(vinylBoxes);
    PlayerController.setActiveQueue(playlist.filter(s => !boxedSongIds.has(s.id)));
}

export async function saveLibraryToDB() {
    // 100% Pure Cloud Storage Architecture - No localforage / IndexedDB
}
