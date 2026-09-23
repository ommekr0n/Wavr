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

/** Allows only image URL schemes that the app can safely render. */
export function safeImageUrl(value, fallback) {
    const url = String(value || '').trim();
    return /^(https?:|blob:|data:image\/)/i.test(url) ? url : fallback;
}
