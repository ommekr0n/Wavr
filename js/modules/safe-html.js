/** Escapes untrusted text before it is inserted into an HTML template. */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    })[character]);
}

const SAFE_RASTER_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/i;
const UNSAFE_URL_CHARS_RE = /["'<>()\s;\\\x00-\x1f\x7f]/;
const SAFE_RELATIVE_URL_RE = /^(?:\.?\/)?[A-Za-z0-9._~/@%?&=#+-]+$/;
const SAFE_HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Allows only image URL schemes and safe relative paths that the app can safely render. */
export function safeImageUrl(value, fallback) {
    const url = String(value || '').trim();
    if (!url) return fallback;
    if (/^data:/i.test(url)) {
        return SAFE_RASTER_DATA_URL_RE.test(url) ? url : fallback;
    }
    if (UNSAFE_URL_CHARS_RE.test(url)) return fallback;
    if (/^(https?:\/\/|blob:)/i.test(url)) return url;
    if (!url.startsWith('//') && !url.includes(':') && !url.split('/').includes('..') && SAFE_RELATIVE_URL_RE.test(url)) {
        return url;
    }
    return fallback;
}

/** Allows only valid CSS hex colors (#rgb, #rgba, #rrggbb, #rrggbbaa). */
export function safeHexColor(color, fallback = '#d8c3a7') {
    const value = String(color || '').trim();
    return SAFE_HEX_COLOR_RE.test(value) ? value : fallback;
}
