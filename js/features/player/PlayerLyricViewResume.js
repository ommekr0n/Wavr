/** Restore normal-player lyric positioning when entering from the library or mini player. */
export function resumePlayerLyrics({ engine, LyricEngine, lyricsContainer }) {
    const lyrics = LyricEngine.getCurrentLyrics();
    LyricEngine.setActiveLyricIndex(-1);
    if (!lyrics?.[0] || (engine.currentTime || 0) < lyrics[0].time * LyricEngine.getDriftRatio()) {
        if (lyricsContainer) lyricsContainer.scrollTop = 0;
    }
}
