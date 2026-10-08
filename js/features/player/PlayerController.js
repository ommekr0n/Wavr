/**
 * PlayerController.js — Queue compatibility facade
 * ─────────────────────────────────────────────────────────────
 * Thin adapter that re-exports QueueManager methods under the
 * original PlayerController surface.  All callers can continue
 * using PlayerController without changes during the migration.
 *
 * Phase 3: isPlaying is now authoritative in PlaybackEngine.
 *   getIsPlaying() delegates to playbackEngine.state.
 *   setIsPlaying() is a no-op kept for backward compatibility
 *   (nothing should call it after PlaybackCoordinator wires up).
 *
 *   setPlaybackEngine(engine) must be called once during app
 *   initialisation (from main.js) before any playback begins.
 */

import { queueManager } from '../../core/QueueManager.js';
import { PLAYBACK_STATES } from '../../core/PlaybackEngine.js';

let _engine = null;

/** Called once from main.js after PlaybackEngine is created. */
export function setPlaybackEngine(engine) {
    _engine = engine;
}

export const PlayerController = {
    getPlaylist:              () => queueManager.playlist,
    getActiveQueue:           () => queueManager.activeQueue,
    getActivePlaylistContext: () => queueManager.activePlaylistContext,
    getCurrentTrackIndex:     () => queueManager.currentTrackIndex,
    getIsShuffle:             () => queueManager.isShuffle,
    getRepeatMode:            () => queueManager.repeatMode,
    getShuffledQueue:         () => queueManager.shuffledQueue,

    /**
     * Authoritative source: PlaybackEngine state.
     * Falls back to false when engine not yet initialised.
     */
    getIsPlaying() {
        if (!_engine) return false;
        return _engine.state === PLAYBACK_STATES.PLAYING;
    },

    /** No-op – kept so legacy call sites compile without error. */
    // eslint-disable-next-line no-unused-vars
    setIsPlaying(_value) {},

    setPlaylist:              (value) => queueManager.setPlaylist(value),
    setActiveQueue:           (value) => queueManager.setActiveQueue(value),
    setActivePlaylistContext: (value) => queueManager.setActivePlaylistContext(value),
    setCurrentTrackIndex:     (value) => queueManager.setCurrentTrackIndex(value),
    setIsShuffle:             (value) => queueManager.setShuffle(value),
    setRepeatMode:            (value) => queueManager.setRepeatMode(value),
    setShuffledQueue:         (value) => queueManager.setShuffledQueue(value),

    getPlaybackSource:    () => queueManager.getPlaybackSource(),
    startQueue:           (tracks, index, context) => queueManager.startQueue(tracks, index, context),
    toggleShuffle:        () => queueManager.toggleShuffle(),
    generateShuffleQueue: (excludeCurrent = false) =>
        queueManager.generateShuffleQueue(excludeCurrent),
};
