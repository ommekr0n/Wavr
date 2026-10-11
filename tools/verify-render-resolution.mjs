import test from 'node:test';
import assert from 'node:assert/strict';
import { FULL_HD_PIXELS, renderPixelRatio } from '../js/core/rendering/three/RenderResolution.js';
import { RendererViewport } from '../js/core/rendering/three/RendererViewport.js';

test('Full HD output stays native in every mode; a 720p desktop window supersamples without reallocating on mode changes', () => {
    for (const density of [1, 1.25, 1.5, 2, 3]) assert.equal(renderPixelRatio(1920, 1080, density), 1);
    const viewport = new RendererViewport(), buffers = [], dimensions = [];
    const renderer = { setDrawingBufferSize: (w, h, ratio) => buffers.push([w * ratio, h * ratio]) };
    const scenes = Array.from({ length: 5 }, () => ({ resize: (...size) => dimensions.push(size) }));
    const ratio = renderPixelRatio(1280, 720, 1);
    for (let round = 0; round < 3; round++) for (const scene of scenes) viewport.sync(renderer, 1280, 720, ratio, [scene]);
    assert.deepEqual(buffers, [[1920, 1080]]);
    assert.equal(dimensions.length, 5);
    assert.deepEqual(dimensions[0], [1280, 720, 1.5]);
});

test('portrait, low-density mobile and 4K displays preserve aspect ratio and stay within the GPU pixel budget', () => {
    assert.equal(renderPixelRatio(390, 844, 1), 1);
    assert.equal(renderPixelRatio(390, 844, 3), 2);
    assert.equal(renderPixelRatio(3840, 2160, 2), .5);
    for (const [width, height] of [[390, 844], [760, 1024], [1366, 768], [2560, 1440], [3840, 2160]]) {
        for (const density of [1, 1.5, 2, 3]) {
            const ratio = renderPixelRatio(width, height, density);
            const w = Math.floor(width * ratio), h = Math.floor(height * ratio);
            assert.ok(w * h <= FULL_HD_PIXELS);
            assert.ok(ratio > 0 && ratio <= 2);
            assert.ok(Math.abs(w / h - width / height) < .01);
        }
    }
});
