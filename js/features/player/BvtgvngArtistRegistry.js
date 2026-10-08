/** Public artist profiles and credits, checked 2026-10-07; provenance: docs/bvtgvng-intro.md. */
export const BVTGVNG_ARTISTS = Object.freeze([
    { name: 'XOLITXO', aliases: ['xolitxo', 'xolit xo'] },
    { name: 'Bloodring', aliases: ['bloodring', 'bloodring.1111', 'dj dai vuong', 'dai vuong'] },
    { name: 'wAvy', aliases: ['wavy', 'wavy182', 'youngwavy182'] },
    { name: 'Rev', aliases: ['rev', '_rev.wav'] },
    { name: 'MINHPHAM', aliases: ['minhpham', 'minh pham', 'minhphamprod'] },
    { name: 'Wwt Sauce', aliases: ['wwt sauce', 'saucebboix'] }
]);

export const BVTGVNG_INTRO = Object.freeze({
    id: 'bvtgvng', name: 'BVTGVNG',
    logo: new URL('../../../assets/images/bvtgvng-original-traced.svg', import.meta.url).href
});

const normalize = value => String(value).normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/^@/, '').replace(/\s+/g, ' ').trim();
const aliases = new Set(BVTGVNG_ARTISTS.flatMap(artist => artist.aliases).concat(['bvtgvng', 'batgvng', 'batgang']));

function splitCredits(value) {
    if (Array.isArray(value)) return value.flatMap(splitCredits);
    if (value && typeof value === 'object') return splitCredits(value.name || '');
    return String(value || '').replace(/\b(?:feat(?:uring)?|ft|with|and)\.?\s*/gi, '|')
        .replace(/\s+(?:x|và)\s+/gi, '|').split(/[,;&/+|()[\]]/)
        .map(credit => normalize(credit).replace(/^[\s"'“”]+|[\s"'“”]+$/g, '')).filter(Boolean);
}

/** Match complete artist credits, never arbitrary song-title substrings or album guests. */
export function getArtistIntroProfile(track) {
    if (!track) return null;
    const credits = splitCredits(track.artist);
    for (const feature of String(track.title || '').matchAll(/\b(?:feat(?:uring)?|ft)\.?\s+([^\])]+)/gi)) credits.push(...splitCredits(feature[1]));
    return credits.some(credit => aliases.has(credit)) ? BVTGVNG_INTRO : null;
}
