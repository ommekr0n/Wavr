export function escapeLyricText(text) {
    return String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

/** Cinematic retains its individual word layout; tagged phrases share their authored timing. */
export function expandEnhancedDisplayWords(words) {
    return words.flatMap(unit => unit.word.split(/\s+/).filter(Boolean).map(word => ({ ...unit, word })));
}
