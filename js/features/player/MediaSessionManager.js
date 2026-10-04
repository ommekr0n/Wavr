/**
 * MediaSessionManager.js
 * Manages OS media controls & metadata integration.
 *
 * Phase 3: Receives PlaybackEngine reference instead of
 * PlayerController so getIsPlaying() is no longer needed here.
 * The engine's isPaused property replaces the old boolean check.
 */

export function setupMediaSession({
    engine,
    playAudio,
    pauseAudio,
    prevTrack,
    nextTrack,
    updateProgress,
    prepareLyricNearTime
}) {
    if (!('mediaSession' in navigator)) return;

    const audio = engine.audioElement;

    navigator.mediaSession.setActionHandler('play',  () => playAudio());
    navigator.mediaSession.setActionHandler('pause', () => pauseAudio());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack',     () => nextTrack());
    navigator.mediaSession.setActionHandler('stop', () => {
        pauseAudio();
        engine.seek(0);
        if (engine.isPaused) updateProgress();
    });
    navigator.mediaSession.setActionHandler('seekbackward', (d) => {
        const newTime = Math.max(0, audio.currentTime - (d?.seekOffset ?? 10));
        prepareLyricNearTime(newTime);
        engine.seek(newTime);
        if (engine.isPaused) updateProgress();
    });
    navigator.mediaSession.setActionHandler('seekforward', (d) => {
        const newTime = Math.min(audio.duration || Infinity, audio.currentTime + (d?.seekOffset ?? 10));
        prepareLyricNearTime(newTime);
        engine.seek(newTime);
        if (engine.isPaused) updateProgress();
    });
    navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (d.seekTime != null) {
            prepareLyricNearTime(d.seekTime);
            engine.seek(d.seekTime);
        }
        if (engine.isPaused) updateProgress();
    });

    audio.addEventListener('play', () => {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    });
    audio.addEventListener('pause', () => {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    });
}

export function updateMediaSessionMetadata(track) {
    if (!('mediaSession' in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title:   track.title  || 'Unknown Title',
        artist:  track.artist || 'Unknown Artist',
        album:   track.album  || 'Wavr',
        artwork: track.cover  ? [{ src: track.cover, sizes: '512x512' }] : []
    });
}
