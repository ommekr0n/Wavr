import { parseEnhancedLrc } from '../features/lyrics/EnhancedLrcTiming.js';

/**
 * Parses timestamp string into total seconds.
 * Supports: [01:23.45], <01:23.45>, (01:23:456), etc.
 */
export function parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const clean = timeStr.replace(/[\[\]\<\>\(\)]/g, '').trim();
    const parts = clean.split(':');
    if (parts.length === 2) {
        const min = parseFloat(parts[0]);
        const sec = parseFloat(parts[1]);
        return min * 60 + sec;
    } else if (parts.length === 3) {
        const min = parseFloat(parts[0]);
        const sec = parseFloat(parts[1]);
        const ms = parseFloat(parts[2]);
        return min * 60 + sec + (ms > 99 ? ms / 1000 : ms / 100);
    }
    return 0;
}

/**
 * Enhanced LRC / Spicy Lyrics Parser
 * Parses both standard LRC line timestamps [mm:ss.xx] and word-level timestamps <mm:ss.xx>
 * Returns an array of line objects with per-word metadata.
 */
export function parseLyrics(lrcString) {
    const parsedLyrics = [];
    if (!lrcString) return parsedLyrics;

    const lines = lrcString.split('\n');
    const lineTimeRegex = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\]/g;

    lines.forEach(line => {
        let match;
        // Search for all line-level timestamps in the line
        while ((match = lineTimeRegex.exec(line)) !== null) {
            const minutes = parseInt(match[1]);
            const seconds = parseFloat(match[2]);
            const lineTime = (minutes * 60) + seconds;

            // Extract content after line timestamps
            const rawContent = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
            if (!rawContent) continue;

            const enhanced = parseEnhancedLrc(rawContent, lineTime, parseTimeToSeconds);
            const words = enhanced?.words || [];
            const isEnhanced = words.length > 0;
            const cleanText = enhanced ? enhanced.text : rawContent.replace(/\s+/g, ' ').trim();
            if (!cleanText) continue;

            parsedLyrics.push({
                time: lineTime,
                endTime: lineTime + 3.5, // Refined after sorting
                text: cleanText,
                isEnhanced: isEnhanced,
                words: words
            });
        }
    });

    // Sort lines chronologically
    parsedLyrics.sort((a, b) => a.time - b.time);

    // Refine line endTimes
    for (let i = 0; i < parsedLyrics.length; i++) {
        const item = parsedLyrics[i];
        const nextItem = parsedLyrics[i + 1];
        if (nextItem) {
            item.endTime = nextItem.time;
        } else {
            item.endTime = item.time + 4.0;
        }

        if (item.isEnhanced && item.words.length > 0) {
            // Only infer a missing final end tag. Explicit vocal timing remains authoritative.
            const lastWord = item.words[item.words.length - 1];
            if (lastWord && !lastWord.explicitEnd) {
                lastWord.endTime = Math.max(lastWord.time, Math.min(lastWord.time + 0.45, item.endTime));
            }
        }
    }

    return parsedLyrics;
}
