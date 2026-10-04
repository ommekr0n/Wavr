import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderFrameStats } from '../js/core/rendering/three/RenderFrameStats.js';

function fixture() {
    const canvas = { dataset: {}, width: 1100, height: 760 };
    const stats = new RenderFrameStats(canvas, { enabled: true, createLyricStats: () => ({ record() {}, resetSampling() {} }) });
    return { canvas, stats, frame: now => stats.record(now, 2, { render: { calls: 3, triangles: 100 } }, 'cinematic') };
}

test('resumed sampling excludes a long pause and clears stale FPS', () => {
    const { canvas, stats, frame } = fixture();
    stats.resetSampling(0);
    for (let now = 20; now <= 1000; now += 20) frame(now);
    assert.equal(JSON.parse(canvas.dataset.frameStats).fps, 50);
    stats.resetSampling(11000);
    assert.equal(canvas.dataset.frameStats, undefined);
    for (let now = 11020; now <= 12000; now += 20) frame(now);
    const sample = JSON.parse(canvas.dataset.frameStats);
    assert.equal(sample.fps, 50);
    assert.equal(sample.p95GapMs, 20);
});

test('long gaps during continuous playback remain visible in the sample', () => {
    const { canvas, stats, frame } = fixture();
    stats.resetSampling(0);
    for (const now of [20, 40, 60, 360, 380, 400, 700, 720, 740, 1000]) frame(now);
    const sample = JSON.parse(canvas.dataset.frameStats);
    assert.equal(sample.fps, 10);
    assert.equal(sample.p95GapMs, 300);
});
