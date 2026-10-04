import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FlameBurstEnvelope } from '../js/core/rendering/three/FlameBurstEnvelope.js';

const quiet = { playing: true, intensity: 0.1, energy: 0.1 };
const loud = { playing: true, intensity: 1, energy: 0.7 };

test('quiet audio stays off; a loud beat rises, releases and finishes its ember tail', () => {
    const flame = new FlameBurstEnvelope();
    assert.equal(flame.update(0, quiet).level, 0);
    flame.update(1, loud);
    assert.ok(flame.update(1.08, quiet).level > 0.8, 'the jet must hit full force within its first 80 ms');
    assert.ok(flame.update(2.7, quiet).level < 0.4);
    assert.equal(flame.update(3.1, quiet).level, 0);
    assert.equal(flame.update(4.3, quiet).sparks, false);
});

test('sustained loud audio respects cooldown and reuses the same output object', () => {
    const flame = new FlameBurstEnvelope(), result = flame.update(0, loud);
    assert.equal(flame.update(1, loud), result);
    assert.equal(result.age, 1);
    flame.update(3.5, loud); assert.equal(result.age, 3.5);
    flame.update(3.7, loud); assert.equal(result.age, 0);
});

test('bass onsets can ignite below the fallback threshold, but weak onsets do not', () => {
    const flame = new FlameBurstEnvelope();
    const analysis = { subBassOnset: true };
    flame.update(0, { ...quiet, intensity: 0.5, analysis });
    assert.equal(flame.update(0.2, quiet).sparks, false);
    flame.update(1, { ...quiet, intensity: 0.7, analysis });
    assert.ok(flame.update(1.2, quiet).level > 0);
});

test('pausing extinguishes flame and embers immediately; resuming can ignite again', () => {
    const flame = new FlameBurstEnvelope(); flame.update(0, loud); flame.update(0.2, quiet);
    const stopped = flame.update(0.3, { ...loud, playing: false });
    assert.equal(stopped.level, 0); assert.equal(stopped.sparks, false);
    flame.update(0.4, loud); assert.ok(flame.update(0.6, quiet).level > 0);
    flame.reset(); assert.equal(flame.output.level, 0); assert.equal(flame.output.sparks, false);
});
