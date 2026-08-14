/**
 * EmojiRenderer.js
 * Replaces native OS emoji with Twemoji SVGs, styled per-mode.
 *
 * Modes:
 *   'normal'   – full color Twemoji, small & refined
 *   'angelic'  – desaturated pastel via CSS filter
 *   'cinematic'– monochrome white-glow to match cinematic typography
 */
import twemoji from '@twemoji/api';

const BASE_CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/';

/**
 * Parse all emoji inside a DOM element and replace with Twemoji SVGs.
 * Adds a data-emoji-mode attribute so CSS can style per mode.
 *
 * @param {HTMLElement} el   – container element to parse
 * @param {'normal'|'angelic'|'cinematic'} mode
 */
export function renderEmojis(el, mode = 'normal') {
    if (!el) return;

    twemoji.parse(el, {
        folder:    'svg',
        ext:       '.svg',
        base:      BASE_CDN,
        className: `lyric-emoji lyric-emoji--${mode}`,
        // Inline SVG attrs for crisp rendering
        attributes: () => ({
            'aria-hidden': 'true',
            'draggable':   'false',
            'data-emoji-mode': mode,
        }),
    });
}
