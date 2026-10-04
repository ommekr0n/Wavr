/** Preserve tagged phrases and explicit end tags instead of truncating to a guessed word duration. */
export function parseEnhancedLrc(content, lineTime, parseTime) {
    const tags = Array.from(content.matchAll(/(?:<|\()(\d{1,3}:\d{2}(?:[.:]\d{1,3})?)(?:>|\))/g));
    if (!tags.length) return null;
    const units = [];
    let depth = 0;
    const append = (text, start, end) => {
        text = text.replace(/\s+/g, ' ').trim();
        if (!text) return;
        const opens = (text.match(/\(/g) || []).length, closes = (text.match(/\)/g) || []).length;
        const explicit = Number.isFinite(end) && end > start;
        units.push({ word: text, time: start, endTime: explicit ? end : start + .45,
            explicitEnd: explicit, isBackingVocal: depth > 0 || opens > 0 || closes > 0 });
        depth = Math.max(0, depth + opens - closes);
    };
    append(content.slice(0, tags[0].index), lineTime, parseTime(tags[0][1]));
    tags.forEach((tag, index) => {
        const next = tags[index + 1];
        append(content.slice(tag.index + tag[0].length, next?.index ?? content.length),
            parseTime(tag[1]), next ? parseTime(next[1]) : NaN);
    });
    return { words: units, text: units.map(unit => unit.word).join(' ') };
}
