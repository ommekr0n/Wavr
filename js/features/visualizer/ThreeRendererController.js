import * as THREE from 'three';
import { registerVisualRenderer } from '../../core/rendering/VisualRenderBridge.js';
import { ThreeTextureCache } from '../../core/rendering/three/ThreeTextureCache.js';
import { ThreeLibraryScene } from '../../core/rendering/three/ThreeLibraryScene.js';
import { ThreeConcertStage } from '../../core/rendering/three/ThreeConcertStage.js';
import { ThreeAngelicVinyl } from '../../core/rendering/three/ThreeAngelicVinyl.js';
import { ThreeAngelicButterflies } from '../../core/rendering/three/ThreeAngelicButterflies.js';
import { RenderFrameStats } from '../../core/rendering/three/RenderFrameStats.js';
import { RenderScheduler } from '../../core/rendering/three/RenderScheduler.js';
import { attachThreeContextRecovery } from './ThreeContextRecovery.js';
import { ThreeChromaticAtelier } from '../../core/rendering/three/ThreeChromaticAtelier.js';
import { ThreeLivingSleeve } from '../../core/rendering/three/ThreeLivingSleeve.js';
import { RealityTearRenderEffect } from '../../core/rendering/three/RealityTearRenderEffect.js';

/** Owns one GPU context and the lifecycle of Wavr's separate render modules. */
export class ThreeRendererController {
    constructor() {
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.domElement.className = 'wavr-three-canvas';
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        this.renderer.domElement.dataset.renderer = 'three';
        this.renderer.info.autoReset = false;
        this.stats = new RenderFrameStats(this.renderer.domElement);
        this.stats.inspectContext(this.renderer);
        this.scheduler = new RenderScheduler(now => this.render(now), this.renderer.domElement);
        this.invalidate = () => this.scheduler.requestFrame();
        this.textures = new ThreeTextureCache(() => { this.surfaces?.markDirty(); this.invalidate(); });
        this.surfaces = new ThreeLibraryScene(this.textures, this.invalidate);
        this.atelier = new ThreeChromaticAtelier();
        this.sleeve = new ThreeLivingSleeve(this.textures, this.invalidate, this.surfaces.pointer);
        this.stage = new ThreeConcertStage();
        this.vinyl = new ThreeAngelicVinyl(this.textures, this.invalidate);
        this.butterflies = new ThreeAngelicButterflies(this.textures, this.invalidate);
        this.audio = document.getElementById('audio-player');
        this.colors = [0xff2d55, 0x5856d6, 0xff9500, 0xaf52de].map(color => new THREE.Color(color));
        this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.audioFrame = { intensity: 0, energy: 0 };
        this.lastRender = performance.now(); this.time = 0; this.nextPaletteRead = 0;
        this.enabled = false; this.mode = null;
        this.unregister = registerVisualRenderer(this);
        this.abort = new AbortController(); const signal = this.abort.signal;
        this.tear = new RealityTearRenderEffect(this, signal);
        window.addEventListener('resize', () => this.resize(), { signal });
        document.addEventListener('scroll', () => this.surfaces.markDirty(), { capture: true, passive: true, signal });
        document.addEventListener('pointermove', event => { this.surfaces.pointer.x = event.clientX; this.surfaces.pointer.y = event.clientY; if (this.mode === 'player' || (['library', 'edit'].includes(this.mode) && this.surfaces.pointerChanged())) this.invalidate(); }, { passive: true, signal });
        document.addEventListener('transitionrun', event => this.surfaces.followLayout(event.target), { signal });
        document.addEventListener('transitionend', () => this.surfaces.markDirty(), { signal });
        for (const event of ['play', 'pause', 'ended']) this.audio.addEventListener(event, () => this.syncLoop(), { signal });
        document.addEventListener('visibilitychange', () => this.syncLoop(), { signal });
        document.addEventListener('wavr:palettechange', () => { this.nextPaletteRead = 0; this.invalidate(); }, { signal });
        this.viewObserver = new MutationObserver(() => this.syncMode());
        for (const id of ['home-view', 'edit-library-view', 'player-view', 'cinematic-view', 'angelic-view']) this.viewObserver.observe(document.getElementById(id), { attributes: true, attributeFilter: ['class'] });
        attachThreeContextRecovery(this, signal);
        this.resize(); this.setEnabled(true);
    }

    setAudioFrame(frame) {
        this.audioFrame = frame;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        document.body.classList.toggle('three-renderer-enabled', enabled);
        document.getElementById('player-view').classList.toggle('atelier-ready', enabled);
        this.renderer.domElement.hidden = !enabled;
        if (!enabled) {
            this.tear.cancel();
            this.stage.fire.reset();
            this.butterflies.active = false;
            this.surfaces.clear(); this.butterflies.clear();
            this.sleeve.clear();
            this.mode = null;
            document.getElementById('reactive-dim').style.opacity = 0;
        } else this.syncMode();
        this.syncLoop();
    }

    syncMode() {
        if (!this.enabled) return;
        const shown = id => !document.getElementById(id).classList.contains('hidden');
        const mode = shown('cinematic-view') ? 'cinematic' : shown('angelic-view') ? 'angelic' : shown('edit-library-view') ? 'edit' : shown('player-view') && document.getElementById('player-view').classList.contains('player-active') ? 'player' : 'library';
        if (mode === this.mode) return;
        if (this.mode === 'cinematic') this.stage.fire.reset();
        this.surfaces.clear(); this.surfaces.mode = null;
        if (this.mode === 'angelic') this.butterflies.clear();
        if (mode !== 'player') this.tear.cancel();
        this.mode = mode;
        this.sleeve.setActive(mode === 'player');
        this.butterflies.active = mode === 'angelic';
        const parent = mode === 'cinematic' ? document.querySelector('.crt-screen-container') : document.getElementById(mode === 'angelic' ? 'angelic-view' : mode === 'player' ? 'player-view' : mode === 'edit' ? 'edit-library-view' : 'home-view');
        parent.appendChild(this.renderer.domElement);
        this.renderer.domElement.hidden = false;
        if (mode === 'library' || mode === 'edit') this.surfaces.setMode(mode);
        this.resize(); this.syncLoop();
    }

    syncLoop() {
        this.scheduler.stop();
        this.stats.resetSampling();
        if (this.enabled && !document.hidden) {
            this.lastRender = performance.now();
            this.scheduler.resume(this.needsAnimation());
        }
    }

    needsAnimation() {
        if (this.mode === 'cinematic') return !this.audio.paused;
        if (this.mode === 'angelic') return (!this.audio.paused && !this.reducedMotion) || this.butterflies.records.length > 0;
        if (this.mode === 'player') return this.tear.active || (!this.audio.paused && !this.reducedMotion) || this.sleeve.animating || this.atelier.settling || this.atelier.dirty;
        return this.surfaces.animating;
    }

    resize() {
        this.stats.resetSampling();
        this.width = innerWidth; this.height = innerHeight;
        const cap = this.mode === 'cinematic' || this.mode === 'angelic' ? 1 : 1.5;
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, cap, Math.sqrt(2000000 / (this.width * this.height))));
        this.renderer.setSize(this.width, this.height);
        for (const module of [this.surfaces, this.stage, this.vinyl, this.butterflies, this.atelier, this.sleeve]) module.resize(this.width, this.height);
        this.tear.resize(this.width, this.height);
        this.invalidate();
    }

    render(now) {
        const dt = Math.min((now - this.lastRender) / 1000, 0.05); this.lastRender = now; this.time += dt;
        const cpuStart = performance.now(); this.renderer.info.reset();
        const playing = !this.audio.paused;
        const state = { playing, data: playing ? this.audioFrame.data : null, intensity: playing ? this.audioFrame.intensity : 0, energy: playing ? this.audioFrame.energy : 0, analysis: this.audioFrame.analysis };
        if (this.mode !== 'library' && this.mode !== 'edit' && now > this.nextPaletteRead) {
            this.nextPaletteRead = now + 1000;
            const style = getComputedStyle(document.documentElement);
            this.colors.forEach((color, index) => { const value = style.getPropertyValue(`--blob-${index + 1}-color`).trim(); if (value) color.set(value); });
        }
        this.renderer.autoClear = true;
        if (this.mode === 'cinematic') {
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.3;
            this.stage.update(dt, this.time, state, this.colors, this.reducedMotion);
            this.renderer.render(this.stage.scene, this.stage.camera);
        } else if (this.mode === 'angelic') {
            this.renderer.toneMapping = THREE.NoToneMapping;
            this.vinyl.update(dt, playing, this.reducedMotion); this.butterflies.update(now, this.colors, this.reducedMotion);
            this.renderer.render(this.vinyl.scene, this.vinyl.camera);
            this.renderer.autoClear = false; this.renderer.clearDepth(); this.renderer.render(this.butterflies.scene, this.butterflies.camera);
        } else if (this.mode === 'player') {
            this.renderer.toneMapping = THREE.NoToneMapping;
            this.tear.beginFrame(this.renderer, now);
            this.atelier.update(dt, state, this.colors, this.reducedMotion); this.atelier.render(this.renderer, now);
            this.sleeve.update(dt, state, this.colors, this.reducedMotion);
            this.renderer.autoClear = false; this.renderer.clearDepth(); this.renderer.render(this.sleeve.scene, this.sleeve.camera);
            this.tear.endFrame(this.renderer);
        } else {
            this.renderer.toneMapping = THREE.NoToneMapping;
            this.surfaces.update(dt, this.reducedMotion); this.surfaces.render(this.renderer);
        }
        const continuous = this.needsAnimation();
        if (continuous) this.stats.record(now, performance.now() - cpuStart, this.renderer.info, this.mode, this.mode === 'cinematic' ? this.stage.fire.envelope.output : null);
        else this.stats.resetSampling(now);
        this.scheduler.setContinuous(continuous);
    }

    dispose() {
        this.setEnabled(false); this.abort.abort(); this.viewObserver.disconnect(); this.unregister();
        for (const module of [this.surfaces, this.stage, this.vinyl, this.butterflies, this.atelier, this.sleeve, this.tear, this.textures]) module.dispose();
        this.renderer.dispose(); this.renderer.domElement.remove();
        this.stats.dispose();
    }
}
