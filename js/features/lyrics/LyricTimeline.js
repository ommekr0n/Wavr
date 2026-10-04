/** Audio-clock timing shared by line selection and visualizer release decisions. */
export class LyricTimeline {
    constructor(lyrics = [], drift = 1) { this.setLyrics(lyrics, drift); }

    setLyrics(lyrics, drift = this.drift) {
        this.lyrics = lyrics; this.drift = drift;
        let previousReveal = -Infinity;
        this.lines = lyrics.map((line, index) => {
            const start = line.time * drift;
            const revealAt = Math.max(previousReveal, start - (line.isEnhanced ? .04 : .12));
            previousReveal = revealAt;
            const interval = lyrics[index + 1] ? (lyrics[index + 1].time - line.time) * drift : Infinity;
            const lastWordEnd = line.isEnhanced && line.words?.length
                ? Math.max(...line.words.map(word => word.endTime * drift)) : start + 3 * drift;
            return { start, revealAt, lastWordEnd, releaseAt: lastWordEnd + 1.2,
                exitDuration: Math.min(.88, Math.max(.24, interval * .4)) };
        });
    }

    indexAt(time) {
        let low = 0, high = this.lines.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.lines[middle].revealAt <= time + 1e-7) low = middle + 1; else high = middle;
        }
        return low - 1;
    }

    canRelease(index, time, angelic = false) {
        const line = this.lines[index];
        if (!line || time < line.releaseAt) return false;
        const nextReveal = this.lines[index + 1]?.revealAt ?? Infinity;
        const margin = angelic ? line.exitDuration + .16 : .5;
        return time < nextReveal - margin;
    }

    angelicTiming(index, time) {
        return { ...this.lines[index], currentTime: time, driftRatio: this.drift };
    }
}
