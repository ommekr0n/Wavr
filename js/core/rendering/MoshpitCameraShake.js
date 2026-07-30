/**
 * MoshpitCameraShake.js
 * Calculates subtle, smooth micro-camera shake (1.5px - 3.5px) based on Sub-Bass intensity.
 * Employs Euler Quadratic Damping & Lerp for ultra-smooth decay.
 */

let currentShakeX = 0;
let currentShakeY = 0;

export const MoshpitCameraShake = {
    /**
     * Updates and returns current camera shake offsets.
     * @param {number} bassEnergy - Sub-bass intensity (0 to 1)
     * @param {boolean} climaxSpike - Peak climax beat spike
     * @param {number} dt - Delta time in seconds
     * @returns {{x: number, y: number}}
     */
    update(bassEnergy, climaxSpike, dt) {
        // Micro-displacement target threshold: only kick in when bass energy > 0.6
        let targetIntensity = 0;
        if (climaxSpike) {
            targetIntensity = 3.5; // Max 3.5px on peak drop
        } else if (bassEnergy > 0.6) {
            targetIntensity = 1.5 + (bassEnergy - 0.6) * 4.5; // 1.5px to 3.3px
        }

        if (targetIntensity > 0) {
            const angle = Math.random() * Math.PI * 2;
            const targetX = Math.cos(angle) * targetIntensity;
            const targetY = Math.sin(angle) * targetIntensity;

            // Fast lerp to target
            currentShakeX += (targetX - currentShakeX) * 0.35;
            currentShakeY += (targetY - currentShakeY) * 0.35;
        } else {
            // Smooth Damped Decay (Euler lerp)
            currentShakeX *= Math.pow(0.05, dt);
            currentShakeY *= Math.pow(0.05, dt);

            if (Math.abs(currentShakeX) < 0.05) currentShakeX = 0;
            if (Math.abs(currentShakeY) < 0.05) currentShakeY = 0;
        }

        return { x: currentShakeX, y: currentShakeY };
    },

    reset() {
        currentShakeX = 0;
        currentShakeY = 0;
    }
};
