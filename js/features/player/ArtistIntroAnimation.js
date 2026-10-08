import { RealityTearStage } from './RealityTearStage.js';
import { createRealityTearMotion } from './RealityTearMotion.js';
import { measureRealityTear } from './RealityTearLayout.js';
import { RealityTearDomMotion } from './RealityTearDomMotion.js';
import { REALITY_TEAR_DURATION } from './RealityTearTiming.js';

/** One shared timeline cuts the live render and displaces the original player nodes. */
export class ArtistIntroAnimation {
    constructor(view, { duration = REALITY_TEAR_DURATION } = {}) {
        this.view = view; this.duration = duration; this.version = 0; this.animations = [];
        this.root = document.createElement('div'); this.root.className = 'artist-intro'; this.root.hidden = true;
        this.skip = document.createElement('button'); this.skip.className = 'artist-intro-skip';
        this.skip.type = 'button'; this.skip.textContent = 'Skip intro';
        this.root.append(this.skip); document.body.append(this.root);
        this.stage = new RealityTearStage(this.root);
        this.skip.addEventListener('click', () => this.cancel());
        this.abort = new AbortController();
        window.addEventListener('resize', () => this.cancel(false), { signal: this.abort.signal });
    }
    preload(profile) {
        this.stage.setLogo(profile.logo);
    }
    play(profile, reducedMotion) {
        this.cancel(false); const version = ++this.version;
        if (reducedMotion) return;
        this.previousFocus = document.activeElement;
        this.stage.setLogo(profile.logo);
        this.root.hidden = false;
        const field = measureRealityTear(this.view);
        this.stage.setField(field);
        this.domMotion = new RealityTearDomMotion(this.view, field, this.duration);
        this.animations = [...createRealityTearMotion(this.stage, this.duration), ...this.domMotion.animations];
        const start = performance.now();
        for (const animation of this.animations) animation.startTime = start;
        document.dispatchEvent(new CustomEvent('wavr:artistintro', { detail: {
            active: true, profile, start, duration: this.duration, field
        } }));
        const finish = () => { if (version === this.version) this.cancel(); };
        Promise.all(this.animations.map(animation => animation.finished)).then(finish).catch(() => {});
        this.timeout = setTimeout(finish, this.duration + 32);
    }
    cancel(restoreFocus = true) {
        ++this.version; clearTimeout(this.timeout); this.timeout = null;
        for (const animation of this.animations) animation.cancel();
        this.animations = [];
        this.domMotion?.restore(); this.domMotion = null;
        if (this.root.hidden) return;
        if (restoreFocus && document.activeElement === this.skip && this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
        this.root.hidden = true;
        document.dispatchEvent(new CustomEvent('wavr:artistintro', { detail: { active: false } }));
    }
    dispose() { this.cancel(false); this.abort.abort(); this.root.remove(); }
}
