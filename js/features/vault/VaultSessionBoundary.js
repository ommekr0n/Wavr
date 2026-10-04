// Reload on identity changes to discard old media links, queues and in-flight UI work.
export function initVaultSessionBoundary(service, { clearPrivateState, reload }) {
    let initialized = false, userId = null, transitioning = false;
    return service.onAuthStateChange((event, session) => {
        if (transitioning) return;
        if (!['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION'].includes(event)) return;
        const nextId = session?.user?.id || null;
        // Restoring a cached session can emit SIGNED_IN before INITIAL_SESSION.
        // The first identity event establishes the baseline for this page load.
        if (!initialized) {
            initialized = true;
            userId = nextId;
            return;
        }
        if (userId === nextId) return;
        userId = nextId;
        transitioning = true;
        clearPrivateState();
        reload();
    });
}

export function clearVaultBrowserState(doc = document, storage = localStorage) {
    const audio = doc.getElementById('audio-player');
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    for (const id of ['home-song-grid', 'edit-song-grid']) doc.getElementById(id)?.replaceChildren();
    for (const id of ['modal-cloud-vault', 'mini-player', 'edit-library-view']) {
        doc.getElementById(id)?.classList.add('hidden');
    }
    for (const key of ['wavr_vinyl_boxes', 'wavr_library_order']) {
        try { storage.removeItem(key); } catch { /* Storage may be disabled. */ }
    }
    if (navigator.mediaSession) navigator.mediaSession.metadata = null;
}
