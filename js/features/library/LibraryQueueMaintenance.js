import { queueManager } from '../../core/QueueManager.js';

/** Library deletion uses track identity because an edited queue has its own indices. */
export function removeLibraryTrackFromQueue(track, { pauseAudio, loadTrack, updateMiniPlayerUI }) {
    const current = queueManager.getPlaybackSource()[queueManager.currentTrackIndex];
    if (!queueManager.editQueue({ type: 'remove-track', id: track.id })) return;
    if (current?.id === track.id) {
        pauseAudio();
        if (queueManager.currentTrackIndex !== -1) loadTrack(queueManager.currentTrackIndex);
        else {
            const audio = document.getElementById('audio-player');
            audio.removeAttribute('src');
            audio.load();
        }
    }
    updateMiniPlayerUI();
}
