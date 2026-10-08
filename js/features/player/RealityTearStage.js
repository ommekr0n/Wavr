import { RealityTearLogoPresence } from './RealityTearLogoPresence.js';

/** Only the approved mark and its optical echo sit above the scene; Three.js renders the cut. */
export class RealityTearStage {
    constructor(root) {
        this.stage = document.createElement('div'); this.stage.className = 'reality-tear';
        this.stage.setAttribute('aria-hidden', 'true');
        this.mark = document.createElement('div'); this.mark.className = 'reality-tear-mark';
        this.logo = document.createElement('img'); this.logo.alt = ''; this.logo.decoding = 'async';
        this.mark.append(this.logo); this.stage.append(this.mark); root.append(this.stage);
        this.presence = new RealityTearLogoPresence(this.mark);
    }
    setField(field) {
        this.mark.style.setProperty('left', `${field.cx}px`);
        this.mark.style.setProperty('top', `${field.cy}px`);
        this.mark.style.setProperty('width', `${Math.min(field.horizontal ? 150 : 180, field.gap * 1.8)}px`);
    }
    setLogo(url) {
        if (this.logo.getAttribute('src') !== url) { this.logo.src = url; this.logo.decode?.().catch(() => {}); }
        this.presence.setLogo(url);
    }
}
