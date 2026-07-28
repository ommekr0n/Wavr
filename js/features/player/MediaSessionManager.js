/**
 * MediaSessionManager.js
 * Manages OS media controls & metadata integration.
 */
import { PlayerController } from './PlayerController.js';

export function setupMediaSession({ audio, playAudio, pauseAudio, prevTrack, nextTrack, updateProgress, prepareLyricNearTime }) {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => playAudio());
    navigator.mediaSession.setActionHandler('pause', () => pauseAudio());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    navigator.mediaSession.setActionHandler('stop', () => { 
        pauseAudio(); 
        audio.currentTime = 0; 
        if (!PlayerController.getIsPlaying()) updateProgress(); 
    });
    navigator.mediaSession.setActionHandler('seekbackward', (d) => {
        const newTime = Math.max(0, audio.currentTime - (d?.seekOffset ?? 10));
        prepareLyricNearTime(newTime);
        audio.currentTime = newTime;
        if (!PlayerController.getIsPlaying()) updateProgress();
    });
    navigator.mediaSession.setActionHandler('seekforward', (d) => {
        const newTime = Math.min(audio.duration || Infinity, audio.currentTime + (d?.seekOffset ?? 10));
        prepareLyricNearTime(newTime);
        audio.currentTime = newTime;
        if (!PlayerController.getIsPlaying()) updateProgress();
    });
    navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (d.seekTime != null) { prepareLyricNearTime(d.seekTime); audio.currentTime = d.seekTime; }
        if (!PlayerController.getIsPlaying()) updateProgress();
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
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        album: track.album || 'Wavr',
        artwork: track.cover ? [{ src: track.cover, sizes: '512x512' }] : []
    });
}
