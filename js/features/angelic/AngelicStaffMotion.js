import { AngelicFloralReveal } from './AngelicFloralReveal.js';

const number = (element, name) => Number(element.getAttribute(`data-${name}`));
const round = value => Math.round(value * 1000) / 1000;

/** Cache each SVG's geometry once; the slow wave only needs 30 geometry updates/sec. */
export class AngelicStaffMotion {
    constructor() {
        this.records = new Map();
        this.frame = null; this.nextUpdate = 0; this.running = false;
        this.tick = now => {
            this.frame = null;
            if (!this.running || document.hidden) return;
            if (now + 0.5 >= this.nextUpdate) {
                const interval = 1000 / 30;
                this.nextUpdate = this.nextUpdate && now - this.nextUpdate < interval * 2
                    ? this.nextUpdate + interval : now + interval;
                this.update(Date.now() / 1000 * Math.PI * 0.15, now);
            }
            if (this.records.size) this.frame = requestAnimationFrame(this.tick);
            else this.stop();
        };
        this.onVisibility = () => {
            if (this.frame !== null) cancelAnimationFrame(this.frame);
            this.frame = null; this.nextUpdate = 0;
            if (this.running && !document.hidden) this.frame = requestAnimationFrame(this.tick);
        };
    }

    start() {
        const root = document.getElementById('angelic-text-container');
        if (!root) return;
        for (const wrapper of root.children) {
            if (!wrapper.matches('.angelic-line-wrapper:not(.angelic-prebuilt):not(.ink-wash-exit), .global-angelic-staff-wrapper') || this.records.has(wrapper)) continue;
            this.records.set(wrapper, this.capture(wrapper));
        }
        if (this.running) return;
        this.running = true; this.nextUpdate = 0;
        document.addEventListener('visibilitychange', this.onVisibility);
        if (!document.hidden) this.frame = requestAnimationFrame(this.tick);
    }

    capture(wrapper) {
        const w = number(wrapper, 'w'), gap = number(wrapper, 'staff-gap');
        const centre = number(wrapper, 'y-center'), amp = number(wrapper, 'amp');
        return {
            w, gap, centre, amp,
            reveal: wrapper.classList.contains('angelic-line-wrapper') ? new AngelicFloralReveal(wrapper) : null,
            paths: Array.from(wrapper.querySelectorAll('.staff-line'), element => {
                const y = number(element, 'y');
                return { element, y, line: Math.round((y - centre) / gap) + 2 };
            }),
            motifs: Array.from(wrapper.querySelectorAll('.staff-motif-anim'), element => {
                const t = number(element, 't'), lane = number(element, 'l'), font = number(element, 'font');
                return { element, line: lane + 2, base: centre + lane * gap + font * (lane === 0 && element.textContent === '𝄞' ? 0.25 : 0.3), wave: 3 * (1 - t) * t * amp * (2 * t - 1) };
            }),
            florals: Array.from(wrapper.querySelectorAll('.floral-root-anim'), element => {
                const x = number(element, 'x'), offset = number(element, 'offset'), t = x / w;
                return { element, x, line: Math.round(offset / gap) + 2, base: centre + offset,
                    wave: 3 * (1 - t) * t * amp * (2 * t - 1), tangent: 3 * amp * (-1 + 6 * t - 6 * t * t),
                    jitter: number(element, 'jitter'), up: element.getAttribute('data-up') === 'true' };
            })
        };
    }

    update(time, now = performance.now()) {
        for (const [wrapper, record] of this.records) {
            // An outgoing line is a cached dissolve: don't invalidate its SVG
            // every 33ms while the next line is drawing and popping in.
            if (!wrapper.isConnected || wrapper.classList.contains('ink-wash-exit')) { this.records.delete(wrapper); continue; }
            const { w, amp } = record;
            record.reveal?.update(now);
            for (const path of record.paths) {
                const angle = time + path.line * 0.3, wave = amp * Math.sin(angle);
                path.element.setAttribute('d', `M 0,${path.y} C ${w / 3},${round(path.y - wave)} ${w * 2 / 3},${round(path.y + wave)} ${w},${path.y}`);
                path.element.style.opacity = (0.4 + Math.cos(angle) * 0.2).toFixed(3);
            }
            for (const motif of record.motifs) {
                motif.element.setAttribute('y', round(motif.base + motif.wave * Math.sin(time + motif.line * 0.3)));
            }
            for (const floral of record.florals) {
                const angle = time + floral.line * 0.3, wave = Math.sin(angle), depth = Math.cos(angle);
                const lean = Math.max(-35, Math.min(35, Math.atan2(floral.tangent * wave, w) * 180 / Math.PI + floral.jitter));
                const rotation = floral.up ? -90 - lean : 90 + lean;
                floral.element.setAttribute('transform', `translate(${floral.x},${round(floral.base + floral.wave * wave)}) rotate(${round(rotation)}) scale(${(1 + depth * 0.15).toFixed(3)})`);
                floral.element.style.opacity = (0.7 + depth * 0.3).toFixed(3);
            }
        }
    }

    stop() {
        this.running = false;
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null; this.nextUpdate = 0; this.records.clear();
        document.removeEventListener('visibilitychange', this.onVisibility);
    }
}
