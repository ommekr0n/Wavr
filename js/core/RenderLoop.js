/**
 * RenderLoop.js
 * ─────────────────────────────────────────────────────────────
 * Owns the requestAnimationFrame lifecycle.
 * Reads audio analysis from AudioEngine/FFTAnalyzer and drives
 * all visual renderers (Angelic, Cinematic, VisualFX).
 *
 * Phase 3: isPlaying is derived from PlaybackEngine.state,
 * not from PlayerController.getIsPlaying().
 */

import { AudioEngine } from './audio/AudioEngine.js';
import { FFTAnalyzer } from './audio/FFTAnalyzer.js';
import { AngelicRenderer } from './rendering/AngelicRenderer.js';
import { PLAYBACK_STATES } from './PlaybackEngine.js';
import { publishVisualFrame } from './rendering/VisualRenderBridge.js';
import { VisualizerController } from '../features/visualizer/VisualizerController.js';
import { RenderScheduler } from './rendering/three/RenderScheduler.js';
import {
    getReactiveParticleTimer,
    updateCinematicLyricBeat,
    updateLyricBreath,
    updateParallax,
    updateVignette
} from '../features/visualizer/VisualFX.js';

export function createRenderLoop({
    engine,
    updateProgress,
    angelicView,
    angelicTextContainer,
    angelicParticleContainer,
    cinematicTextContainer
}) {
    let angelicParticleTimer = 0;
    let angelicIdleParticleTimer = 0;
    const scheduler = new RenderScheduler(renderFrame);

    function renderFrame() {
        let intensity = 0;
        let energy = 0;
        let currentAnalysis = null;
        let dataArray = null;
        const isPlaying = engine.state === PLAYBACK_STATES.PLAYING;
        const isAngelic = VisualizerController.getIsAngelicMode();
        const isCinematic = VisualizerController.getIsCinematicMode();

        if (isPlaying) {
            updateProgress();

            dataArray = AudioEngine.getByteFrequencyData();
            if (AudioEngine.getAnalyser() && dataArray) {
                currentAnalysis = FFTAnalyzer.analyze(dataArray);
                intensity = currentAnalysis.intensity;
                energy = currentAnalysis.energy;

                if (isAngelic) {
                    updateLyricBreath(intensity, angelicTextContainer);

                    if (intensity > 0.12) {
                        angelicParticleTimer--;
                        if (angelicParticleTimer <= 0) {
                            AngelicRenderer.spawnParticle(angelicParticleContainer, true);
                            angelicParticleTimer = getReactiveParticleTimer(energy, intensity);
                        }
                    }

                    if (currentAnalysis.climaxSpike) {
                        const artistEl = document.getElementById('song-artist');
                        const artistName = artistEl ? artistEl.textContent.trim() : '';
                        const quantizedCooldown = FFTAnalyzer.getQuantizedCooldownMs();
                        AngelicRenderer.spawnClimaxCombo(
                            true,
                            angelicParticleContainer,
                            angelicView,
                            artistName,
                            quantizedCooldown
                        );
                    }
                }

                if (isCinematic) {
                    updateCinematicLyricBeat(intensity, energy, cinematicTextContainer);
                    updateVignette(energy);
                }
            }
        }

        if (isAngelic) {
            updateParallax(angelicTextContainer);

            if (!isPlaying) {
                angelicIdleParticleTimer--;
                if (angelicIdleParticleTimer <= 0) {
                    AngelicRenderer.spawnParticle(angelicParticleContainer, true);
                    angelicIdleParticleTimer = 25;
                }
            }
        }

        publishVisualFrame({ intensity, energy, analysis: currentAnalysis, data: dataArray });

    }

    let started = false;
    const syncVisibility = () => {
        scheduler.stop();
        if (started && !document.hidden) scheduler.resume(true);
    };
    document.addEventListener('visibilitychange', syncVisibility);

    return {
        start() {
            if (started) return;
            started = true; syncVisibility();
        },
        stop() {
            started = false; scheduler.stop();
        },
        dispose() {
            this.stop(); document.removeEventListener('visibilitychange', syncVisibility);
        }
    };
}
