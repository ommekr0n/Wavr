import { VisualizerController } from './VisualizerController.js';
import { LyricEngine } from '../lyrics/LyricEngine.js';
import { LyricTimeline } from '../lyrics/LyricTimeline.js';
import { EnhancedWordHighlighter } from '../lyrics/EnhancedWordHighlighter.js';
import { resolveNostalgiaFrame, buildNostalgiaSlides } from './NostalgiaCue.js';
import { createNostalgiaRaster } from './NostalgiaRaster.js';

/** Small subtitle raster with DOM controls; shares the existing audio clock. */
export function setupNostalgiaMode({ audio, playerView, togglePlay, prevTrack, nextTrack, seek }) {
    const view = document.getElementById('nostalgia-view');
    const trigger = document.getElementById('btn-nostalgia');
    const exit = document.getElementById('btn-exit-nostalgia');
    const root = document.getElementById('nostalgia-text-container');
    const outgoingRoot = document.getElementById('nostalgia-outgoing-text');
    const title = document.getElementById('song-title');
    const artist = document.getElementById('song-artist');
    const cover = document.getElementById('cover-art');
    const ghost = document.getElementById('nostalgia-ghost-lyric');
    const progress = document.getElementById('nostalgia-progress');
    const play = document.getElementById('nostalgia-play');
    const clock = document.getElementById('nostalgia-time');
    const timeline = new LyricTimeline();
    const highlighter = new EnhancedWordHighlighter();
    const raster = createNostalgiaRaster(view, root, document.getElementById('nostalgia-subtitle-raster'));
    const outgoingRaster = createNostalgiaRaster(view, outgoingRoot, document.getElementById('nostalgia-outgoing-raster'));
    const abort = new AbortController(), { signal } = abort;
    let lyrics = null, drift = null, cueKey = null, idleTimer = null, slides = [], lastTravel = -Infinity;
    let lastSecond = -1, lastProgress = -Infinity, trackTitle = '', trackArtist = '', paused = null, lastOpacity = null;
    let outgoingKey = null, lastOutgoingOpacity = null;
    const format = seconds => {
        const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
        return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
    };

    function wakeControls() {
        view.classList.add('controls-awake');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => view.classList.remove('controls-awake'), 2500);
    }

    function refreshMetadata() {
        trackTitle = title.textContent.trim().normalize('NFC') || 'Untitled';
        trackArtist = artist.textContent.trim().normalize('NFC');
        document.getElementById('nostalgia-filename').textContent = `${trackTitle}.mp4`;
        document.getElementById('nostalgia-ghost-title').textContent = trackTitle;
        document.getElementById('nostalgia-ghost-artist').textContent = trackArtist;
        refreshCoverAvailability();
        cueKey = null; outgoingKey = null;
        ghost.textContent = '';
        sync();
    }

    function refreshCoverAvailability() {
        view.dataset.hasArtwork = String(Boolean(cover.complete && cover.naturalWidth > 0));
    }

    function paintCue(cue, surface = root) {
        if (surface === root) { highlighter.reset(); view.dataset.cue = cue.kind; }
        surface.replaceChildren();
        surface.dataset.cue = cue.kind;
        if (cue.kind === 'blank') return;
        const line = document.createElement('div');
        line.className = 'nostalgia-line';
        line.dataset.index = cue.index;
        if (cue.kind === 'title') {
            line.textContent = `${trackTitle}.mp4`;
            surface.append(line);
            return;
        }
        if (cue.line.isEnhanced && cue.line.words?.length) {
            for (const backing of [false, true]) {
                const words = cue.line.words.filter(word => Boolean(word.isBackingVocal) === backing);
                if (!words.length) continue;
                const row = document.createElement('div');
                row.className = backing ? 'nostalgia-backing' : 'nostalgia-main';
                for (const word of words) {
                    const span = document.createElement('span');
                    span.className = 'lyric-word';
                    span.dataset.start = word.time;
                    span.dataset.end = word.endTime;
                    span.textContent = word.word;
                    row.append(span, document.createTextNode(' '));
                }
                line.append(row);
            }
        } else line.textContent = cue.line.text;
        line.classList.toggle('nostalgia-long-line', cue.line.text.length > 100);
        surface.append(line);
        const block = slides[cue.index];
        if (block?.length === 2) {
            surface.replaceChildren(...block.map(index => {
                const row = document.createElement('div');
                row.className = 'nostalgia-line'; row.dataset.index = index;
                row.textContent = lyrics[index].text;
                return row;
            }));
        }
        if (surface === root) ghost.textContent = cue.line.text;
    }

    function sync(time = audio.currentTime) {
        if (!VisualizerController.getIsNostalgiaMode()) return;
        const nextLyrics = LyricEngine.getCurrentLyrics(), nextDrift = LyricEngine.getDriftRatio();
        if (lyrics !== nextLyrics || drift !== nextDrift) {
            lyrics = nextLyrics; drift = nextDrift;
            timeline.setLyrics(lyrics, drift); slides = buildNostalgiaSlides(lyrics); cueKey = null; outgoingKey = null;
        }
        const { current: cue, outgoing } = resolveNostalgiaFrame(timeline, time, audio.duration, slides);
        const key = `${cue.kind}:${cue.slideIndex ?? cue.index}`;
        if (key !== cueKey) { cueKey = key; paintCue(cue); raster.paint(); }
        if (cue.opacity !== lastOpacity) {
            view.style.setProperty('--nostalgia-cue-opacity', String(cue.opacity));
            lastOpacity = cue.opacity;
        }
        const nextOutgoingKey = `${outgoing.kind}:${outgoing.slideIndex ?? outgoing.index}`;
        if (nextOutgoingKey !== outgoingKey) {
            outgoingKey = nextOutgoingKey; paintCue(outgoing, outgoingRoot); outgoingRaster.paint();
        }
        if (outgoing.opacity !== lastOutgoingOpacity) {
            view.style.setProperty('--nostalgia-outgoing-opacity', String(outgoing.opacity));
            lastOutgoingOpacity = outgoing.opacity;
        }
        if (cue.kind === 'lyric') highlighter.sync(root, cue.index, time, drift, 'normal');
        // Deterministic pans follow playback, so pauses and backwards seeks match the frame.
        if (Math.abs(time - lastTravel) >= 1 / 30 || audio.paused) {
            const travel = Math.max(0, time - (timeline.lines[0]?.start ?? 0));
            view.style.setProperty('--nostalgia-title-x', `${100 - (travel % 48) / 48 * 200}vw`);
            view.style.setProperty('--nostalgia-artist-x', `${100 - (Math.max(0, travel - 19) % 48) / 48 * 200}vw`);
            lastTravel = time;
        }
        if (paused !== audio.paused) {
            paused = audio.paused;
            view.classList.toggle('nostalgia-paused', paused);
            play.setAttribute('aria-label', paused ? 'Play' : 'Pause');
            play.dataset.paused = String(paused);
        }
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        progress.disabled = !duration;
        if (Math.abs(time - lastProgress) >= .1 || audio.paused) {
            progress.value = duration ? Math.min(1000, time / duration * 1000) : 0;
            lastProgress = time;
        }
        if (Math.floor(time) !== lastSecond) {
            lastSecond = Math.floor(time);
            clock.textContent = `${format(time)} / ${format(duration)}`;
            progress.setAttribute('aria-valuetext', clock.textContent);
        }
    }

    function leave() {
        if (!VisualizerController.getIsNostalgiaMode()) return;
        VisualizerController.exitNostalgiaMode(view, playerView);
        highlighter.reset(); root.replaceChildren(); outgoingRoot.replaceChildren(); ghost.textContent = '';
        cueKey = null; outgoingKey = null; lastOpacity = null; lastOutgoingOpacity = null; clearTimeout(idleTimer);
        trigger.focus({ preventScroll: true });
    }

    trigger.addEventListener('click', () => {
        for (const mode of ['cinematic', 'angelic']) {
            if (!document.getElementById(`${mode}-view`).classList.contains('hidden')) {
                document.getElementById(`btn-exit-${mode}`).click();
            }
        }
        VisualizerController.enterNostalgiaMode(playerView, view);
        view.classList.toggle('nostalgia-suspended', document.hidden);
        lastSecond = -1; lastProgress = -Infinity;
        refreshMetadata(); wakeControls(); view.focus({ preventScroll: true });
    }, { signal });
    exit.addEventListener('click', leave, { signal });
    // Recording can enter another mode without visiting the normal player first.
    for (const mode of ['cinematic', 'angelic']) {
        document.getElementById(`btn-${mode}`).addEventListener('click', leave, { signal });
    }
    play.addEventListener('click', togglePlay, { signal });
    document.getElementById('nostalgia-prev').addEventListener('click', prevTrack, { signal });
    document.getElementById('nostalgia-next').addEventListener('click', () => nextTrack(), { signal });
    progress.addEventListener('input', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) seek(Number(progress.value) / 1000 * audio.duration);
    }, { signal });
    for (const event of ['pointermove', 'pointerdown', 'keydown']) view.addEventListener(event, wakeControls, { passive: true, signal });
    for (const event of ['play', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'seeking', 'timeupdate']) {
        audio.addEventListener(event, () => { lastSecond = -1; sync(); }, { signal });
    }
    for (const event of ['load', 'error']) cover.addEventListener(event, refreshCoverAvailability, { signal });
    document.addEventListener('visibilitychange', () => view.classList.toggle('nostalgia-suspended', document.hidden), { signal });
    const metadataObserver = new MutationObserver(() => {
        if (VisualizerController.getIsNostalgiaMode()) refreshMetadata();
    });
    for (const element of [title, artist]) metadataObserver.observe(element, { childList: true, characterData: true, subtree: true });
    metadataObserver.observe(cover, { attributes: true, attributeFilter: ['src'] });

    return { sync, dispose() { leave(); raster.dispose(); outgoingRaster.dispose(); abort.abort(); metadataObserver.disconnect(); clearTimeout(idleTimer); highlighter.reset(); } };
}
