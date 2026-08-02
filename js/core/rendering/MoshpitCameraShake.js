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
        let targetIntensity = 0;
        if (climaxSpike) {
            targetIntensity = 2.2; // Max 2.2px smooth climax drop (no harsh shock)
        } else if (bassEnergy > 0.45) {
            targetIntensity = 1.0 + (bassEnergy - 0.45) * 1.8; // 1.0px to 2.0px smooth scale
        } else {
            // Ambient organic camera float at idle (clearly visible 0.8px - 1.2px)
            const time = Date.now() * 0.002;
            targetIntensity = 0.8 + Math.sin(time) * 0.4;
        }

        const angle = Math.random() * Math.PI * 2;
        const targetX = Math.cos(angle) * targetIntensity;
        const targetY = Math.sin(angle) * targetIntensity;

        // Smooth 0.18 lerp for fluid cinematic motion (no harsh snap)
        currentShakeX += (targetX - currentShakeX) * 0.18;
        currentShakeY += (targetY - currentShakeY) * 0.18;

        return { x: currentShakeX, y: currentShakeY };
    },

    reset() {
        currentShakeX = 0;
        currentShakeY = 0;
    }
};
