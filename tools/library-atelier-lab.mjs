import * as THREE from 'three';
import { ThreeLibraryScene } from '../js/core/rendering/three/ThreeLibraryScene.js';
import { RenderScheduler } from '../js/core/rendering/three/RenderScheduler.js';
import { PlayerController } from '../js/features/player/PlayerController.js';
import { renderSongGrid, setCachedVinylBoxes, setCachedLibraryOrder } from '../js/features/library/HomeGridRenderer.js';
import { setupBoxExpansionListeners } from '../js/features/library/HomeBoxExpansion.js';
import { renderEditGrid } from '../js/features/library/EditGridRenderer.js';
import { setupDragAndDrop } from '../js/features/library/DragDropEngine.js';
import { setupSelectionBox, updateSelectionBar } from '../js/features/library/SelectionManager.js';
import { setupContextMenu } from '../js/features/library/SongContextMenu.js';
import { closeEditBoxExpansion } from '../js/features/library/BoxExpansion.js';
import { state } from '../js/shared/EditLibraryState.js';

// This lab must stay on an isolated guest origin; it never seeds the user's app library.
if (location.hostname !== '127.0.0.1') throw new Error('Open this sample lab on http://127.0.0.1:3000');
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.domElement.className = 'wavr-three-canvas'; renderer.info.autoReset = false;
let last = performance.now(), mode = 'library';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scheduler = new RenderScheduler(now => {
    renderer.info.reset(); const dt = Math.min((now - last) / 1000, .05); last = now;
    collection.update(dt, reducedMotion); collection.render(renderer); scheduler.setContinuous(collection.animating);
}, { onStateChange: state => { renderer.domElement.dataset.renderState = state; } });
const collection = new ThreeLibraryScene(null, () => scheduler.requestFrame());
function resize() { renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5, Math.sqrt(2000000 / (innerWidth * innerHeight)))); renderer.setSize(innerWidth, innerHeight); collection.resize(innerWidth, innerHeight); }
function show(next) {
    mode = next;
    document.getElementById('home-view').classList.toggle('hidden', mode !== 'library');
    document.getElementById('edit-library-view').classList.toggle('hidden', mode !== 'edit');
    document.getElementById(mode === 'edit' ? 'edit-library-view' : 'home-view').appendChild(renderer.domElement);
    collection.setMode(mode); resize(); scheduler.resume(false);
}
function home() {
    setCachedVinylBoxes(state.vinylBoxes); setCachedLibraryOrder(state.libraryOrder);
    return renderSongGrid({ homeSongGrid: document.getElementById('home-song-grid'), setupBoxExpansionListeners: boxes => setupBoxExpansionListeners(document.getElementById('home-song-grid'), boxes) });
}
function seed(count) {
    closeEditBoxExpansion();
    state.playlist = Array.from({ length: count }, (_, i) => {
        const hue = (i * 53) % 360;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="hsl(${hue},26%,32%)"/><circle cx="350" cy="150" r="130" fill="hsl(${hue},40%,65%)"/><path d="M0 400L220 140L512 512H0" fill="#18191b"/><text x="30" y="80" font-family="sans-serif" font-weight="700" font-size="40" fill="#eee9df">RECORD ${String(i + 1).padStart(3, '0')}</text><path d="M30 100H190" stroke="#eee9df" stroke-width="4"/></svg>`;
        return { id: `sample-${i + 1}`, title: `Record ${String(i + 1).padStart(3, '0')} — A long album title`, artist: `Studio ${i % 7 + 1}`, cover: `data:image/svg+xml,${encodeURIComponent(svg)}`, url: '' };
    });
    state.vinylBoxes = [
        { id: 'sample-empty', name: 'Empty crate', color: '#b69d79', songIds: [] },
        { id: 'sample-single', name: 'One record', color: '#8ba697', songIds: ['sample-1'] },
        { id: 'sample-full', name: 'Night collection', color: '#b48780', songIds: ['sample-2', 'sample-3', 'sample-4', 'sample-5'] },
    ];
    state.libraryOrder = []; state.selectedSongIds.clear(); updateSelectionBar(); PlayerController.setPlaylist(state.playlist); home(); show('library');
}
window.appMainContext = { updateBoxCache: () => {}, renderSongGrid: home };
for (const button of document.querySelectorAll('[data-count]')) button.addEventListener('click', () => seed(Number(button.dataset.count)));
document.getElementById('lab-edit').addEventListener('click', () => { renderEditGrid(); setupSelectionBox(); show('edit'); });
document.getElementById('lab-done').addEventListener('click', () => { closeEditBoxExpansion(); state.selectedSongIds.clear(); updateSelectionBar(); home(); show('library'); });
document.getElementById('lab-inspect').addEventListener('click', () => {
    document.getElementById('lab-state').textContent = JSON.stringify({ order: state.libraryOrder.slice(0, 12), boxes: state.vinylBoxes.map(box => ({ id: box.id, songs: box.songIds })), selected: [...state.selectedSongIds] });
});
document.addEventListener('scroll', () => collection.markDirty(), { capture: true, passive: true });
document.addEventListener('pointermove', event => { collection.pointer.x = event.clientX; collection.pointer.y = event.clientY; if (collection.pointerChanged()) scheduler.requestFrame(); }, { passive: true });
document.addEventListener('transitionrun', event => collection.followLayout(event.target));
window.addEventListener('resize', resize);
window.addEventListener('pagehide', () => { scheduler.stop(); collection.dispose(); renderer.dispose(); });
setupDragAndDrop(); setupContextMenu(); seed(24);
