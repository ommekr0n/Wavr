const blank = index => ({ kind: 'blank', index, opacity: 0 });
const smooth = value => {
    const amount = Math.max(0, Math.min(1, value));
    return amount * amount * (3 - 2 * amount);
};
function fade(time, start, end, attack, release) {
    const span = Math.max(0, end - start);
    return Math.min(smooth((time - start) / Math.min(attack, span / 2)),
        smooth((end - time) / Math.min(release, span / 2)));
}

function blendAfter(timeline, first, last, duration, slides) {
    const next = last + 1;
    const nextStart = timeline.lines[next]?.revealAt ?? Infinity;
    const start = timeline.lines[first].revealAt;
    if (!timeline.lyrics[last].text?.trim() || !timeline.lyrics[next]?.text?.trim()
        || nextStart > timeline.lines[last].releaseAt + .5 || nextStart >= duration || nextStart <= start) return 0;
    const nextBlock = slides[next] || [next];
    const after = timeline.lines[nextBlock[nextBlock.length - 1] + 1]?.revealAt ?? Infinity;
    // Short phrases shorten the blend so a third slide cannot enter before the old one leaves.
    return Math.min(.65, (nextStart - start) / 2, (after - nextStart) / 2, duration - nextStart);
}

function lyricCue(timeline, index, time, trackEnd, slides) {
    const line = timeline.lyrics[index];
    if (!line.text?.trim()) return blank(index);
    const block = slides[index] || [index];
    const first = block[0], last = block[block.length - 1];
    const start = timeline.lines[first].revealAt;
    const next = timeline.lines[last + 1]?.revealAt ?? Infinity;
    const release = timeline.lines[last].releaseAt;
    const blend = blendAfter(timeline, first, last, trackEnd, slides);
    const previous = slides[first - 1] || [first - 1];
    const attack = first > 0 ? blendAfter(timeline, previous[0], first - 1, trackEnd, slides) : 0;
    const end = Math.min(blend ? next + blend : (next - release > .5 ? release : next), trackEnd);
    if (time >= end) return blank(index);
    return { kind: 'lyric', index, line, slideIndex: first, opacity: fade(time, start, end, attack || .35, blend || .4) };
}

/** Resolve slides and their fades from the audio clock, including paused/backwards seeks. */
export function resolveNostalgiaCue(timeline, time, duration = Infinity, slides = []) {
    const trackEnd = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
    if (time >= trackEnd) return blank(-1);
    const index = timeline.indexAt(time);
    if (!timeline.lyrics.length || index < 0) {
        // The introduction ends on its own, leaving space before the first vocal.
        const end = Math.min(6, (timeline.lines[0]?.revealAt ?? Infinity) - .75, trackEnd);
        if (end <= 0 || time >= end) return blank(-1);
        return { kind: 'title', index: -1, opacity: fade(time, 0, end, .6, .75) };
    }
    return lyricCue(timeline, index, time, trackEnd, slides);
}

/** Reconstruct both sides of a dissolve directly from timestamps, without playback history. */
export function resolveNostalgiaFrame(timeline, time, duration = Infinity, slides = []) {
    const current = resolveNostalgiaCue(timeline, time, duration, slides);
    let outgoing = blank(-1);
    if (current.kind === 'lyric' && current.slideIndex > 0) {
        const trackEnd = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
        const previous = current.slideIndex - 1;
        const block = slides[previous] || [previous];
        if (blendAfter(timeline, block[0], previous, trackEnd, slides) > 0) {
            outgoing = lyricCue(timeline, previous, time, trackEnd, slides);
            if (!outgoing.opacity) outgoing = blank(-1);
        }
    }
    return { current, outgoing };
}

/** Two-line slides like the reference; gaps and authored enhanced phrases stay separate. */
export function buildNostalgiaSlides(lyrics) {
    const slides = [];
    for (let index = 0; index < lyrics.length;) {
        const first = lyrics[index], next = lyrics[index + 1];
        const pair = first.text?.trim() && next?.text?.trim() && !first.isEnhanced && !next.isEnhanced
            && next.time > first.time && next.time - first.time <= 6;
        const indices = pair ? [index, index + 1] : [index];
        for (const lineIndex of indices) slides[lineIndex] = indices;
        index += indices.length;
    }
    return slides;
}
