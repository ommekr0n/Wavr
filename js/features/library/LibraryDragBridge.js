/** Keep the DOM ghost usable while a shared Three.js foreground model loads. */
export function prepareLibraryDragGhost(source, ghost) {
    for (const node of [ghost, ...ghost.querySelectorAll('.three-surface-ready, .library-object-ready')]) node.classList.remove('three-surface-ready', 'library-object-ready');
    ghost.classList.toggle('vinyl-box-card', source.classList.contains('vinyl-box-card'));
    const count = source.closest('#edit-song-grid')?.querySelectorAll(':scope > .selected').length || 0;
    if (source.classList.contains('selected') && count > 1) {
        const badge = document.createElement('span'); badge.className = 'library-drag-count'; badge.textContent = `${count} selected`; ghost.appendChild(badge);
    }
    document.dispatchEvent(new CustomEvent('wavr:librarydrag', { detail: { source, ghost } }));
}

export function releaseLibraryDragGhost(ghost) {
    document.dispatchEvent(new CustomEvent('wavr:librarydrag', { detail: { ghost, end: true } }));
}
