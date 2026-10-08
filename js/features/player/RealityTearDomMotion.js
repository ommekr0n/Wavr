import { tearDistance, tearClip, tearPose } from './RealityTearGeometry.js';
import { tearStops, tearEasing } from './RealityTearTiming.js';

/** Moves original nodes: enhanced-lyric spans, focus and control state stay intact. */
export class RealityTearDomMotion {
    constructor(view, field, duration) {
        this.records = []; this.animations = [];
        const elements = view.querySelectorAll('.am-player-left, .am-lyrics-section, .header-left, .header-right, .header-utilities-bar');
        const measured = [...elements].map(element => ({ element, rect: element.getBoundingClientRect(), base: getComputedStyle(element).transform }));
        for (const { element, rect, base } of measured) {
            if (!rect.width || !rect.height) continue;
            // The centered toolbar already has translateX(-50%). Its pivot must
            // be measured in the pre-transform box, while clipping uses local pixels.
            const matrix = base.startsWith('matrix(') ? base.slice(7, -1).split(',').map(Number) : null;
            const tx = matrix?.[4] || 0, ty = matrix?.[5] || 0;
            const side = tearDistance(rect.left + rect.width / 2, rect.top + rect.height / 2, field) < 0 ? -1 : 1;
            const saved = ['clip-path', 'transform-origin'].map(key => [key, element.style.getPropertyValue(key), element.style.getPropertyPriority(key)]);
            this.records.push({ element, saved });
            element.style.setProperty('clip-path', tearClip(rect, field, side));
            element.style.setProperty('transform-origin', `${field.cx - rect.left + tx}px ${field.cy - rect.top + ty}px`);
            const frames = tearStops.map(([offset, opening]) => {
                const pose = tearPose(field, side, opening);
                return { offset, easing: tearEasing, transform: `translate(${pose.x}px, ${pose.y}px) rotate(${pose.angle}deg) scale(${pose.scale}) ${base === 'none' ? '' : base}`.trim() };
            });
            this.animations.push(element.animate(frames, { duration, fill: 'both' }));
        }
    }
    restore() {
        for (const { element, saved } of this.records) for (const [key, value, priority] of saved) {
            if (value) element.style.setProperty(key, value, priority); else element.style.removeProperty(key);
        }
        this.records.length = 0;
    }
}
