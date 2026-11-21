/** Wait for private media renewal without letting an older selection or play request win. */
export function createMediaPlaybackGate({ resolve, play, pause, getTime = () => 0, restoreTime = () => {} }) {
    let revision = 0, intent = 0, ready = Promise.resolve(true);
    let selected = null, apply = null, loadedUrl = '', failed = false;

    function resolveCover(cover) {
        return Promise.resolve().then(() => resolve(cover)).catch(() => cover ?? '');
    }

    function startLoad(track, commit, ticket) {
        failed = false;
        const loadPromise = Promise.all([resolve(track.url), resolveCover(track.cover)]).then(([url, cover]) => {
            if (ticket !== revision) return false;
            track.url = url; track.cover = cover;
            commit();
            loadedUrl = url;
            return true;
        }, error => {
            if (ticket === revision) failed = true;
            throw error;
        });
        // Keep `ready` non-rejecting so a failed load does not wedge future play() calls.
        ready = loadPromise.catch(() => false);
        return loadPromise;
    }

    return {
        load(track, commit) {
            const ticket = ++revision;
            ++intent;
            selected = track; apply = commit;
            loadedUrl = '';
            pause();
            return startLoad(track, commit, ticket);
        },
        async play() {
            const ticket = ++intent;
            const loaded = await ready;
            if (ticket !== intent) return;
            if (loaded === false) {
                if (!failed || !selected || !apply) return;
                const retried = await startLoad(selected, apply, revision);
                if (retried === false || ticket !== intent) return;
            } else if (selected) {
                // The tab may have slept, or background renewal may have updated the queue
                // while the audio element still holds its original expiring URL.
                const url = await resolve(selected.url);
                if (ticket !== intent) return;
                if (url !== loadedUrl) {
                    const time = getTime(), version = revision;
                    selected.url = url; apply(); loadedUrl = url;
                    restoreTime(time, () => version === revision);
                }
            }
            if (ticket === intent) return play();
        },
        pause() { ++intent; pause(); },
        reset() {
            ++revision;
            ++intent;
            selected = null;
            apply = null;
            loadedUrl = '';
            failed = false;
            ready = Promise.resolve(false);
        }
    };
}
