/** Wait for private media renewal without letting an older selection or play request win. */
export function createMediaPlaybackGate({ resolve, play, pause, getTime = () => 0, restoreTime = () => {} }) {
    let revision = 0, intent = 0, ready = Promise.resolve();
    let selected = null, apply = null, loadedUrl = null;
    return {
        load(track, commit) {
            const ticket = ++revision;
            ++intent;
            selected = track; apply = commit;
            pause();
            ready = Promise.all([resolve(track.url), resolve(track.cover)]).then(([url, cover]) => {
                if (ticket !== revision) return false;
                track.url = url; track.cover = cover;
                commit();
                loadedUrl = url;
                return true;
            });
            // Loads may be requested without immediately playing.
            ready.catch(() => {});
            return ready;
        },
        async play() {
            const ticket = ++intent;
            const loaded = await ready;
            if (loaded === false || ticket !== intent) return;
            if (selected) {
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
        pause() { ++intent; pause(); }
    };
}
