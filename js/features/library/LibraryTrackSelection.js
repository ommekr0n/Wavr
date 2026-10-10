/** Resolve a clicked track against its own list before replacing the playback queue. */
export function playLibraryTrack({ controller, trackId, box = null, openPlayer }) {
    const playlist = controller.getPlaylist();
    const byId = new Map(playlist.map(track => [track.id, track]));
    const source = box ? (box.songIds || []).map(id => byId.get(id)).filter(Boolean) : playlist;
    const index = trackId === undefined && box ? 0 : source.findIndex(track => track.id === trackId);
    if (!source[index] || !controller.startQueue(source, index, box ? box.id : 'library')) return false;
    openPlayer?.(index);
    return true;
}
