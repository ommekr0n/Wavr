/**
 * PlayerController.js
 * Encapsulates playback state variables and queue management logic.
 * Extracted 1:1 from backup_prime/js/main.js (lines 137-148, 813-818, 2218-2241)
 */

// ── Playback State ───────────────────────────────────────────────────────────
let playlist            = [];
let activeQueue         = [];
let activePlaylistContext = 'library'; // 'library' or a vinyl box ID like 'vinyl-xxx'
let currentTrackIndex   = 0;
let isPlaying           = false;
let isShuffle           = false;
let repeatMode          = 0; // 0: None, 1: All, 2: One
let shuffledQueue       = []; // Holds indices for shuffle mode

export const PlayerController = {

    // ── Getters ─────────────────────────────────────────────────────────────
    getPlaylist()              { return playlist; },
    getActiveQueue()           { return activeQueue; },
    getActivePlaylistContext()  { return activePlaylistContext; },
    getCurrentTrackIndex()     { return currentTrackIndex; },
    getIsPlaying()             { return isPlaying; },
    getIsShuffle()             { return isShuffle; },
    getRepeatMode()            { return repeatMode; },
    getShuffledQueue()         { return shuffledQueue; },

    // ── Setters ─────────────────────────────────────────────────────────────
    setPlaylist(val)            { playlist = val; },
    setActiveQueue(val)         { activeQueue = val; },
    setActivePlaylistContext(v) { activePlaylistContext = v; },
    setCurrentTrackIndex(val)   { currentTrackIndex = val; },
    setIsPlaying(val)           { isPlaying = val; },
    setIsShuffle(val)           { isShuffle = val; },
    setRepeatMode(val)          { repeatMode = val; },
    setShuffledQueue(val)       { shuffledQueue = val; },

    /**
     * Returns the correct playback source array based on current shuffle and repeat mode.
     * Matches prime line 813-818 exactly:
     *   if (isShuffle && repeatMode === 0) return playlist;
     *   return activeQueue;
     */
    getPlaybackSource() {
        if (isShuffle && repeatMode === 0) {
            return playlist;
        }
        return activeQueue;
    },

    /**
     * Toggles shuffle state.
     * Re-maps currentTrackIndex to the new source after isShuffle changes.
     * Called from the shuffle button click handler in main.js.
     */
    toggleShuffle() {
        const currentTrack = PlayerController.getPlaybackSource()[currentTrackIndex];
        isShuffle = !isShuffle;

        // Re-map currentTrackIndex to new source after state switch
        const newSource = PlayerController.getPlaybackSource();
        if (currentTrack) {
            const newIdx = newSource.findIndex(s => s.id === currentTrack.id);
            if (newIdx !== -1) currentTrackIndex = newIdx;
        }

        if (isShuffle) {
            PlayerController.generateShuffleQueue(false);
        }

        return isShuffle;
    },

    /**
     * Generates a Fisher-Yates shuffled queue of indices from the current playback source.
     * Extracted 1:1 from backup_prime/js/main.js lines 2218-2241.
     *
     * @param {boolean} excludeCurrent - If true, places current track at the end (loop/reshuffle).
     *                                   If false, places current track at start (first-toggle).
     */
    generateShuffleQueue(excludeCurrent = false) {
        shuffledQueue = [];
        const source = PlayerController.getPlaybackSource();
        for (let i = 0; i < source.length; i++) shuffledQueue.push(i);

        // Fisher-Yates
        for (let i = shuffledQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledQueue[i], shuffledQueue[j]] = [shuffledQueue[j], shuffledQueue[i]];
        }

        // Handle current track placement to avoid immediate repeat on loop/reshuffle
        if (currentTrackIndex !== -1 && source.length > 1) {
            const currentQIdx = shuffledQueue.indexOf(currentTrackIndex);
            if (currentQIdx !== -1) {
                shuffledQueue.splice(currentQIdx, 1);
                if (excludeCurrent) {
                    // Put current track at the end so it plays last in the new queue
                    shuffledQueue.push(currentTrackIndex);
                } else {
                    // Put current track at the beginning (e.g. when shuffle is first toggled on)
                    shuffledQueue.unshift(currentTrackIndex);
                }
            }
        }
    },
};
