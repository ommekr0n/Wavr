/** Every active drag can be canceled on Escape, focus loss or leaving the editor. */
export function armLibraryDragCancellation(onCancel, point) {
    const abort = new AbortController();
    const cancel = () => onCancel({ type: 'pointercancel', clientX: point.x, clientY: point.y });
    window.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } }, { signal: abort.signal });
    window.addEventListener('blur', cancel, { signal: abort.signal });
    const view = document.getElementById('edit-library-view');
    const observer = new MutationObserver(() => { if (view.classList.contains('hidden')) cancel(); });
    if (view) observer.observe(view, { attributes: true, attributeFilter: ['class'] });
    return () => { abort.abort(); observer.disconnect(); };
}
