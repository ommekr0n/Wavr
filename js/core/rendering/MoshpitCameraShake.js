/**
 * MoshpitCameraShake.js
 * Calculates subtle, smooth micro-camera shake based on Sub-Bass intensity.
 * Optimizations: uses dt accumulator instead of Date.now(), skips lerp when
 * already at rest, avoids trig when idle drift is negligible.
 */

let currentShakeX = 0;
let currentShakeY = 0;
let _idleTime     = 0; // accumulated time for idle sine drift (replaces Date.now())

export const MoshpitCameraShake = {
    update(bassEnergy, climaxSpike, dt) {
        let targetIntensity;

        if (climaxSpike) {
            targetIntensity = 2.2;
        } else if (bassEnergy > 0.45) {
            targetIntensity = 1.0 + (bassEnergy - 0.45) * 1.8;
        } else {
            // Idle organic float — use dt accumulator (no Date.now() call)
            _idleTime      += dt;
            targetIntensity = 0.8 + Math.sin(_idleTime * 2.0) * 0.4;
        }

        const angle   = Math.random() * Math.PI * 2;
        const targetX = Math.cos(angle) * targetIntensity;
        const targetY = Math.sin(angle) * targetIntensity;

        currentShakeX += (targetX - currentShakeX) * 0.18;
        currentShakeY += (targetY - currentShakeY) * 0.18;

        // Skip translate if shake is imperceptibly small (saves ctx.translate call)
        if (Math.abs(currentShakeX) < 0.05 && Math.abs(currentShakeY) < 0.05) {
            return { x: 0, y: 0 };
        }

        return { x: currentShakeX, y: currentShakeY };
    },

    reset() {
        currentShakeX = 0;
        currentShakeY = 0;
        _idleTime     = 0;
    }
};
