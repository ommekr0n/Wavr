/** Hover is a finite pose: moving across empty space or the same jacket needs no redraw. */
export function libraryPointerKey(entries, pointer) {
    for (const [key, entry] of entries) {
        const { rect: r, clip } = entry.record;
        if (!entry.model.group.visible || !r || !clip) continue;
        if (pointer.x >= Math.max(r.left, clip.left) && pointer.x <= Math.min(r.right, clip.right) && pointer.y >= Math.max(r.top, clip.top) && pointer.y <= Math.min(r.bottom, clip.bottom)) return key;
    }
    return null;
}
