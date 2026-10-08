/** CSS serializes a quoted URL: parentheses inside the URL are part of the source. */
export function readLibraryBackgroundUrl(value) {
    const css = (value || '').trim();
    if (!css.startsWith('url(') || !css.endsWith(')')) return null;
    const source = css.slice(4, -1).trim();
    if ((source[0] === '"' || source[0] === "'") && source.at(-1) === source[0]) return source.slice(1, -1);
    return source;
}
