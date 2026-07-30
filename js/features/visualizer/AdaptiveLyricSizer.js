/**
 * AdaptiveLyricSizer.js
 * Returns a high-impact concert stage lyric font size (10.5vmin ratio).
 */

export function calculateFluidLyricStyle() {
    return {
        fontSize: 'clamp(3.2rem, 10.5vmin, 7.5rem)',
        scale: 1.0,
        lineHeight: 1.2
    };
}
