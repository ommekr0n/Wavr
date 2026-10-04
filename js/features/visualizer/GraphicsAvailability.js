let state = 'ready';
let showToast = null;

/** Keep playback usable if the graphics device is unavailable or recovering. */
export function setGraphicsAvailability(next) {
    if (state === next) return;
    state = next;
    document.documentElement.dataset.graphicsState = state;
    if (state !== 'ready') showToast?.(state === 'recovering'
        ? '3D graphics are recovering. Music and lyrics still work.'
        : '3D graphics are unavailable in this browser. Music and lyrics still work.');
}

export function observeGraphicsAvailability(notify) {
    showToast = notify;
    if (state !== 'ready') showToast(state === 'recovering'
        ? '3D graphics are recovering. Music and lyrics still work.'
        : '3D graphics are unavailable in this browser. Music and lyrics still work.');
}
