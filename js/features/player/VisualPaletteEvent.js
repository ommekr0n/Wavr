/** Palette updates also wake a paused player so it can settle into the new colors. */
export function notifyVisualPalette() { document.dispatchEvent(new Event('wavr:palettechange')); }
