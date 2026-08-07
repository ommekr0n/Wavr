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

            // Check if line contains word-level timestamps <mm:ss.xx> or (mm:ss.xx)
            const wordTagRegex = /(?:<|\()(\d{2}:\d{2}(?:[\.:]\d{2,3})?)(?:>|\))\s*([^\s<>]+)/g;
            const words = [];
            let wordMatch;
            let cleanTextParts = [];

            while ((wordMatch = wordTagRegex.exec(rawContent)) !== null) {
                const wTime = parseTimeToSeconds(wordMatch[1]);
                const wText = wordMatch[2].trim();
                if (wText) {
                    const isParen = wText.startsWith('(') || wText.endsWith(')');
                    words.push({
                        word: wText,
                        time: wTime,
                        endTime: wTime + 0.4,
                        isBackingVocal: isParen
                    });
                    cleanTextParts.push(wText);
                }
            }

            const isEnhanced = words.length > 0;
            // Get clean text with all <timestamps> stripped
            let cleanText = isEnhanced 
                ? cleanTextParts.join(' ') 
                : rawContent.replace(/(?:<|\()\d{2}:\d{2}(?:[\.:]\d{2,3})?(?:>|\))/g, '').replace(/\s+/g, ' ').trim();

            if (isEnhanced) {
                // Refine word endTimes: each word ends when the next word starts (clamped to max 1.2s duration)
                for (let i = 0; i < words.length; i++) {
                    if (i < words.length - 1) {
                        words[i].endTime = Math.min(words[i].time + 1.2, words[i + 1].time);
                    } else {
                        // Last word in line
                        words[i].endTime = words[i].time + 1.0;
                    }
                }
            }

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
            // Refine last word duration: max 0.45 seconds so last word completes prompt fill
            const lastWord = item.words[item.words.length - 1];
            if (lastWord) {
                lastWord.endTime = Math.min(lastWord.time + 0.45, item.endTime);
            }
        }
    }

    return parsedLyrics;
}
