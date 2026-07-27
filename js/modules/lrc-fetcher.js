/**
 * lrc-fetcher.js — LRCLIB Online Lyrics Integration for Wavr
 */

export async function fetchLyricsFromLRCLIB(title, artist) {
    if (!title) return null;

    const cleanTitle = title.trim();
    const cleanArtist = artist ? artist.trim() : '';

    try {
        // 1. Try exact match via LRCLIB get API
        const params = new URLSearchParams({ track_name: cleanTitle });
        if (cleanArtist && cleanArtist.toLowerCase() !== 'unknown artist') {
            params.append('artist_name', cleanArtist);
        }

        const getRes = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
        if (getRes.ok) {
            const data = await getRes.json();
            if (data && data.syncedLyrics && data.syncedLyrics.trim()) {
                return data.syncedLyrics;
            }
        }

        // 2. Fallback: Search query via LRCLIB search API
        const query = `${cleanTitle} ${cleanArtist !== 'Unknown Artist' ? cleanArtist : ''}`.trim();
        const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (Array.isArray(searchData) && searchData.length > 0) {
                // Find first entry with non-empty syncedLyrics
                const match = searchData.find(item => item && item.syncedLyrics && item.syncedLyrics.trim());
                if (match) return match.syncedLyrics;
            }
        }
    } catch (err) {
        console.warn('LRCLIB API request failed:', err);
    }

    return null;
}

export function createLrcBlob(syncedLyricsText) {
    return new Blob([syncedLyricsText], { type: 'text/plain;charset=utf-8' });
}
