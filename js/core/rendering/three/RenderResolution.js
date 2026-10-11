export const FULL_HD_PIXELS = 1920 * 1080;

/** Desktop windows supersample up to Full HD; small screens follow their display density. */
export function renderPixelRatio(width, height, displayRatio = 1) {
    const budgetRatio = Math.sqrt(FULL_HD_PIXELS / (width * height));
    const desktop = width >= 1024 && width > height;
    return Math.min(2, budgetRatio, Math.max(displayRatio, desktop ? budgetRatio : 1));
}
