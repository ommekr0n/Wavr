/** Session-local player presentation, shared by track selection and the mini player. */
export function createPlayerViewNavigation({
    homeView, playerView, miniPlayer, hasTrack, prepareLyrics = () => {},
    refreshProgress = () => {}, setPlayerOpen = () => {}, schedule = setTimeout, cancel = clearTimeout
}) {
    let mode = 'unopened', transition = null;
    const clearTransition = () => { if (transition !== null) cancel(transition); transition = null; };

    function expand() {
        if (!hasTrack()) return;
        clearTransition();
        mode = 'full';
        miniPlayer.classList.add('hidden');
        playerView.classList.remove('hidden');
        void playerView.offsetHeight;
        prepareLyrics();
        refreshProgress();
        playerView.classList.add('player-active');
        setPlayerOpen(true);
        transition = schedule(() => {
            transition = null;
            homeView.classList.add('hidden');
        }, 280);
    }

    function selectTrack() {
        if (mode === 'unopened') expand();
        else if (mode === 'mini') {
            miniPlayer.classList.remove('hidden');
            refreshProgress();
        }
    }

    function minimize() {
        clearTransition();
        mode = 'mini';
        setPlayerOpen(false);
        homeView.classList.remove('hidden');
        playerView.classList.remove('player-active');
        transition = schedule(() => {
            transition = null;
            playerView.classList.add('hidden');
            miniPlayer.classList.toggle('hidden', !hasTrack());
            if (hasTrack()) refreshProgress();
        }, 280);
    }

    return { selectTrack, expand, minimize, dispose: clearTransition };
}
