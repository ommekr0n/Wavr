/**
 * AdaptiveLyricSizer.js
 * Returns a high-impact concert stage lyric font size (10.5vmin ratio).
 */

export function calculateFluidLyricStyle() {
    return {
        fontSize: 'clamp(3.0rem, 9.8vmin, 7.2rem)',
        scale: 1.0,
        lineHeight: 1.2
    };
}
