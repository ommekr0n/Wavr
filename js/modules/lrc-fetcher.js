/**
 * lrc-fetcher.js — LRCLIB Online Lyrics Integration for Wavr
 */

/**
 * Searches LRCLIB for all matching synced lyrics entries.
 * @param {string} title - Track title
 * @param {string} artist - Artist name
 * @returns {Promise<Array>} Array of matching LRCLIB objects containing syncedLyrics
 */
export async function searchLRCLIB(title, artist) {
    if (!title) return [];

    const cleanTitle = title.trim();
    const cleanArtist = (artist && artist.toLowerCase() !== 'unknown artist') ? artist.trim() : '';

    try {
        const results = [];

        // 1. Try exact match via LRCLIB get API
        const params = new URLSearchParams({ track_name: cleanTitle });
        if (cleanArtist) params.append('artist_name', cleanArtist);

        const getRes = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
        if (getRes.ok) {
            const data = await getRes.json();
            if (data && data.syncedLyrics && data.syncedLyrics.trim()) {
                results.push(data);
            }
        }

        // 2. Search query via LRCLIB search API for multi-version list
        const query = `${cleanTitle} ${cleanArtist}`.trim();
        const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (Array.isArray(searchData)) {
                searchData.forEach(item => {
                    if (item && item.syncedLyrics && item.syncedLyrics.trim()) {
                        if (!results.some(r => r.id === item.id)) {
                            results.push(item);
                        }
                    }
                });
            }
        }

        return results;
    } catch (err) {
        console.warn('LRCLIB API request failed:', err);
    }

    return [];
}

/**
 * Selects the best match from a list of LRCLIB results based on target audio duration.
 * @param {Array} results - List of LRCLIB search results
 * @param {number} [targetDuration] - Duration of audio in seconds
 * @returns {Object|null} Best match LRCLIB result
 */
export function autoSelectBestMatch(results, targetDuration) {
    if (!results || results.length === 0) return null;
    if (results.length === 1 || !targetDuration) return results[0];

    let bestMatch = results[0];
    let minDiff = Infinity;

    results.forEach(item => {
        if (typeof item.duration === 'number') {
            const diff = Math.abs(item.duration - targetDuration);
            if (diff < minDiff) {
                minDiff = diff;
                bestMatch = item;
            }
        }
    });

    return bestMatch;
}

export function createLrcBlob(syncedLyricsText) {
    return new Blob([syncedLyricsText], { type: 'text/plain;charset=utf-8' });
}

/**
 * Extracts a 2-line clean text preview from raw LRC content.
 * @param {string} lrcText 
 * @returns {string} First 2 lines of text
 */
export function getLrcPreviewSnippet(lrcText) {
    if (!lrcText) return '';
    const lines = lrcText.split('\n');
    const textLines = [];
    for (const line of lines) {
        const clean = line.replace(/\[\d+:\d+(\.\d+)?\]/g, '').trim();
        if (clean) {
            textLines.push(clean);
            if (textLines.length >= 2) break;
        }
    }
    return textLines.join(' / ');
}

/**
 * Renders and opens the Multi-Version Lyrics Picker Modal.
 * @param {Array} results - Array of LRCLIB match objects
 * @param {Function} onSelectCallback - Function called with selected LRCLIB object
 */
export function openLrcPickerModal(results, onSelectCallback) {
    const modal = document.getElementById('lrc-picker-modal');
    const list = document.getElementById('lrc-picker-list');
    const closeBtn = document.getElementById('btn-close-lrc-picker');

    if (!modal || !list) return;

    list.innerHTML = '';

    if (!results || results.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 25px; color: rgba(255,255,255,0.6);">No synced lyrics found on LRCLIB.</div>';
    } else {
        results.forEach((item) => {
            const durationMin = item.duration ? `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}` : 'Unknown';
            const preview = getLrcPreviewSnippet(item.syncedLyrics);

            const card = document.createElement('div');
            card.className = 'glass-panel';
            card.style.cssText = 'padding: 14px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 6px;';

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 600; color: #fff; font-size: 0.95rem;">${item.trackName || 'Track'} — <span style="color: var(--accent-color);">${item.artistName || 'Artist'}</span></div>
                    <span style="font-size: 0.8rem; background: rgba(0,229,255,0.15); color: var(--accent-color); padding: 3px 8px; border-radius: 12px;">⏱ ${durationMin}</span>
                </div>
                <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Album: ${item.albumName || 'Single / N/A'}</div>
                <div style="font-size: 0.82rem; font-style: italic; color: rgba(255,255,255,0.85); background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 6px; margin-top: 4px;">
                    "${preview || 'Synced lyrics available'}"
                </div>
                <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
                    <button type="button" class="glass-btn primary btn-select-lrc-version" style="padding: 6px 12px; font-size: 0.8rem;">
                        Use This Version
                    </button>
                </div>
            `;

            const selectBtn = card.querySelector('.btn-select-lrc-version');
            selectBtn.addEventListener('click', () => {
                onSelectCallback(item);
                modal.classList.add('hidden');
            });

            list.appendChild(card);
        });
    }

    modal.classList.remove('hidden');

    if (closeBtn) {
        closeBtn.onclick = () => modal.classList.add('hidden');
    }
}
