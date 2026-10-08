/** Keep source artwork anchored before the postprocess moves the live render. */
export function pinSleeveForTear(sleeve, rect) {
    if (!sleeve) return;
    sleeve.introRect = rect ? { ...rect, left: rect.x, top: rect.y } : null;
    sleeve.dirty = true;
}
export function readSleeveLayout(node, view, anchor) {
    if (anchor) return anchor;
    const rect = node.getBoundingClientRect(), parent = view.getBoundingClientRect();
    return { x: rect.x - parent.x, y: rect.y - parent.y, width: rect.width, height: rect.height,
        left: rect.x - parent.x, top: rect.y - parent.y };
}
