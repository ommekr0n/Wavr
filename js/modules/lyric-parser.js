export function parseLyrics(lrcString) {
    const parsedLyrics = [];
    if (!lrcString) return parsedLyrics;
    
    const lines = lrcString.split('\n');
    const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\]/g;
    
    lines.forEach(line => {
        let match;
        while ((match = timeRegex.exec(line)) !== null) {
            const minutes = parseInt(match[1]);
            const seconds = parseFloat(match[2]);
            const totalSeconds = (minutes * 60) + seconds;
            
            const text = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
            if (text) {
                parsedLyrics.push({ time: totalSeconds, text: text });
            }
        }
    });
    
    parsedLyrics.sort((a, b) => a.time - b.time);
    return parsedLyrics;
}
