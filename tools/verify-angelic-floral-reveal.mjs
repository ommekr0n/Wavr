import test from 'node:test';
import assert from 'node:assert/strict';
import { AngelicFloralReveal } from '../js/features/angelic/AngelicFloralReveal.js';

const cubic = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
function fixture() {
    const branch = { style: { getPropertyValue: key => ({ '--blen': '200px', '--branch-delay': '.25s', '--branch-dur': '.45s' })[key] } };
    const bloom = { style: { getPropertyValue: () => '.6s' } };
    const classes = new Set();
    const wrapper = {
        classList: { add: key => classes.add(key), contains: key => classes.has(key) },
        querySelectorAll: selector => selector === '.angelic-branch' ? [branch] : [bloom]
    };
    return { wrapper, branch, bloom, classes };
}

test('branches retain CSS delay, duration and cubic-bezier(.2,.8,.2,1)', () => {
    for (const parameter of [0, .1, .25, .5, .75, .9, 1]) {
        const { wrapper, branch, classes } = fixture(), reveal = new AngelicFloralReveal(wrapper);
        reveal.update(1000);
        assert.equal(reveal.started, null, 'do not consume growth before enter');
        classes.add('angelic-enter-wrapper'); reveal.update(1000);
        const progress = cubic(parameter, .2, .2), expected = 200 * (1 - cubic(parameter, .8, 1));
        reveal.update(1000 + 250 + 450 * progress);
        assert.ok(Math.abs(parseFloat(branch.style.strokeDashoffset) - expected) < .015);
    }
});

test('bloom retains the original spring overshoot and clamped opacity', () => {
    for (const parameter of [0, .1, .25, .5, .75, .9, 1]) {
        const { wrapper, bloom, classes } = fixture(), reveal = new AngelicFloralReveal(wrapper);
        classes.add('angelic-enter-wrapper'); reveal.update(0);
        reveal.update(600 + 700 * cubic(parameter, .34, .64));
        const expected = cubic(parameter, 1.56, 1);
        assert.ok(Math.abs(parseFloat(bloom.style.transform.slice(6)) - expected) < .0001);
        assert.ok(Math.abs(Number(bloom.style.opacity) - Math.min(1, expected)) < .001);
    }
});

test('finished reveals release all ongoing writes and selectors are only read once', () => {
    const { wrapper, branch, bloom, classes } = fixture(), reveal = new AngelicFloralReveal(wrapper);
    classes.add('angelic-enter-wrapper'); reveal.update(0); reveal.update(2000);
    assert.equal(reveal.done, true);
    assert.equal(branch.style.strokeDashoffset, '0.000px');
    assert.equal(bloom.style.transform, 'scale(1.0000)');
    const cache = JSON.stringify([branch.style, bloom.style]);
    wrapper.querySelectorAll = () => { throw new Error('per-frame query'); };
    reveal.update(5000);
    assert.equal(JSON.stringify([branch.style, bloom.style]), cache);
});
