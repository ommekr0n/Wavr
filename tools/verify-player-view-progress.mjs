import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerViewNavigation } from '../js/features/player/PlayerViewNavigation.js';
import { resumePlayerLyrics } from '../js/features/player/PlayerLyricViewResume.js';
import { createPlayerProgressView } from '../js/features/player/PlayerProgressView.js';

function fixture() {
    const node = (...initial) => {
        const classes = new Set(initial);
        return { value: 0, style: {}, offsetHeight: 100, classList: {
            contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name),
            toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }
        } };
    };
    const playerView = node('hidden'), miniPlayer = node('hidden'), progressSlider = node(), miniSlider = node();
    const audio = { duration: 100, currentTime: 50, paused: true }, timers = new Map();
    const lyricsContainer = { scrollTop: 80 }; let id = 0, draws = 0, dragging = false;
    const LyricEngine = { getCurrentLyrics: () => [], setActiveLyricIndex() {}, updateHighlight() {} };
    const syncProgressView = createPlayerProgressView({
        playerView, progressSlider, progressBarFill: node(), miniPlayer, miniSlider,
        isFullDragging: () => dragging, isMiniDragging: () => dragging, drawMiniWaveform: () => draws++
    });
    const updateProgress = () => syncProgressView(audio.currentTime / audio.duration * 100);
    const navigation = createPlayerViewNavigation({
        homeView: node(), playerView, miniPlayer, hasTrack: () => true,
        prepareLyrics: () => resumePlayerLyrics({ engine: audio, LyricEngine, lyricsContainer }),
        refreshProgress: updateProgress,
        schedule: callback => { timers.set(++id, callback); return id; }, cancel: id => timers.delete(id)
    });
    return { navigation, audio, progressSlider, miniSlider, lyricsContainer, updateProgress, draws: () => draws,
        setDragging(value) { dragging = value; },
        finish() { for (const callback of timers.values()) callback(); timers.clear(); } };
}

test('revealing a paused mini player synchronizes its previously hidden seek input', () => {
    const f = fixture(); f.navigation.expand(); f.finish();
    assert.equal(f.progressSlider.value, 50); assert.equal(f.miniSlider.value, 0);
    f.navigation.minimize(); f.finish();
    assert.equal(f.miniSlider.value, 50); assert.equal(f.draws(), 1);
});

test('expanding paused playback without lyrics refreshes the full player seek position', () => {
    const f = fixture(); f.navigation.expand(); f.finish(); f.navigation.minimize(); f.finish();
    f.audio.currentTime = 70; f.updateProgress();
    assert.equal(f.miniSlider.value, 70); assert.equal(f.progressSlider.value, 50);
    f.navigation.expand(); f.finish();
    assert.equal(f.progressSlider.value, 70); assert.equal(f.lyricsContainer.scrollTop, 0);
});

test('track selection in mini mode refreshes progress even before a playback frame', () => {
    const f = fixture(); f.navigation.expand(); f.finish(); f.navigation.minimize(); f.finish();
    f.audio.currentTime = 0; f.navigation.selectTrack();
    assert.equal(f.miniSlider.value, 0);
});

test('revealing a player preserves a seek gesture until dragging ends', () => {
    const f = fixture(); f.navigation.expand(); f.finish(); f.setDragging(true);
    f.progressSlider.value = 90; f.audio.currentTime = 70; f.updateProgress();
    assert.equal(f.progressSlider.value, 90);
    f.navigation.minimize(); f.finish(); f.miniSlider.value = 80; f.updateProgress();
    assert.equal(f.miniSlider.value, 80); assert.equal(f.draws(), 0);
    f.setDragging(false); f.updateProgress();
    assert.equal(f.miniSlider.value, 70); assert.equal(f.draws(), 1);
});
