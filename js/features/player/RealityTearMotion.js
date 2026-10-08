import { createRealityTearLogoIdle } from './RealityTearLogoIdle.js';

const pose = (scale, angle) => `translate(-50%, -50%) perspective(900px) rotateY(${angle}deg) scale(${scale})`;

/** The mark emerges from the gap, then retreats before the two surfaces close. */
export function createRealityTearMotion(stage, duration) {
    return [stage.mark.animate([
        { opacity: 0, transform: pose(.72, -17), offset: 0 },
        { opacity: 0, transform: pose(.72, -17), offset: .055, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { opacity: 1, transform: pose(1, 0), offset: .14 },
        { opacity: 1, transform: pose(1, 0), offset: .8, easing: 'cubic-bezier(.5,0,.8,.2)' },
        { opacity: 0, transform: pose(.65, 9), offset: .91 },
        { opacity: 0, transform: pose(.65, 9), offset: 1 }
    ], { duration, easing: 'linear', fill: 'both' }), createRealityTearLogoIdle(stage.logo, duration), ...stage.presence.animate(duration)];
}
