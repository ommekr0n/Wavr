import test from 'node:test';
import assert from 'node:assert/strict';
import { setupProgressLyricPreview } from '../js/features/player/ProgressLyricPreview.js';
import { LyricEngine } from '../js/features/lyrics/LyricEngine.js';

test('idle header changes preserve seek preview; mode exit, track changes and disposal hide it', () => {
    const input = new EventTarget(), audio = new EventTarget(), abort = new AbortController();
    input.getBoundingClientRect = () => ({ left: 100, width: 200 });
    audio.duration = 40; audio.currentTime = 7; audio.paused = true;
    const clock = {}, text = {}, tooltip = { hidden: true, style: {}, querySelector: key => key === 'span' ? clock : text };
    const names = new Set(['player-active']), view = { classList: { contains: key => names.has(key) } }, root = {};
    const nodes = { 'progress-slider': input, 'progress-lyric-preview': tooltip, 'audio-player': audio, 'player-view': view, 'lyrics-list': root };
    globalThis.document = { getElementById: id => nodes[id] };
    let notify, disconnected = false;
    globalThis.MutationObserver = class { constructor(callback) { notify = callback; } observe() {} disconnect() { disconnected = true; } };
    LyricEngine.setLyrics('[00:00.00]First line\n[00:16.00]The middle of the song');
    setupProgressLyricPreview(abort.signal);
    const hover = () => { const event = new Event('pointermove'); Object.defineProperty(event, 'clientX', { value: 200 }); input.dispatchEvent(event); };
    hover(); assert.equal(tooltip.hidden, false); assert.equal(text.textContent, 'The middle of the song'); assert.equal(clock.textContent, '0:20');
    assert.equal(audio.currentTime, 7); assert.equal(audio.paused, true);
    names.add('cursor-idle'); notify([{ target: view }]); assert.equal(tooltip.hidden, false);
    names.delete('cursor-idle'); notify([{ target: view }]); assert.equal(tooltip.hidden, false);
    names.add('hidden'); notify([{ target: view }]); assert.equal(tooltip.hidden, true);
    names.delete('hidden'); hover(); notify([{ target: root }]); assert.equal(tooltip.hidden, true);
    hover(); abort.abort(); assert.equal(disconnected, true); assert.equal(tooltip.hidden, true);
    hover(); assert.equal(tooltip.hidden, true);
});
