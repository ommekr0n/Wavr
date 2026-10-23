/** Keep lazy covers and queued tracks fresh, including after a suspended browser tab resumes. */
export function initMediaUrlLifecycle({ getTracks, resolve, needsRefresh, doc = document }) {
    let running = false;
    async function refresh() {
        if (running || doc.hidden) return;
        running = true;
        try {
            const replacements = new Map();
            await Promise.all(getTracks().flatMap(track => ['url', 'cover'].map(async field => {
                const old = track[field];
                if (!needsRefresh(old)) return;
                try {
                    const fresh = await resolve(old);
                    if (track[field] !== old) return;
                    track[field] = fresh;
                    replacements.set(old, fresh);
                } catch { /* Retry next tick; playback surfaces errors when requested. */ }
            })));
            if (!replacements.size) return;
            for (const image of doc.querySelectorAll('img[src]')) {
                const fresh = replacements.get(image.getAttribute('src'));
                if (fresh) image.src = fresh;
            }
            for (const element of doc.querySelectorAll('[style]')) {
                for (const [old, fresh] of replacements) {
                    if (element.style.backgroundImage.includes(old)) {
                        element.style.backgroundImage = element.style.backgroundImage.replaceAll(old, fresh);
                    }
                }
            }
            // Do not reload the active audio element: that would interrupt playback.
        } finally { running = false; }
    }
    const timer = setInterval(refresh, 60_000);
    doc.addEventListener('visibilitychange', refresh);
    doc.addEventListener('wavr:libraryChanged', refresh);
    refresh();
    return () => {
        clearInterval(timer);
        doc.removeEventListener('visibilitychange', refresh);
        doc.removeEventListener('wavr:libraryChanged', refresh);
    };
}
