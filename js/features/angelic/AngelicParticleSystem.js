/**
 * AngelicParticleSystem.js
 * Object pool and spawning logic for the musical charm particles.
 */

// DO NOT DELETE — prevents GC thrashing during long playback sessions
const angelicParticlePool = [];

function getParticleFromPool() {
    if (angelicParticlePool.length > 0) return angelicParticlePool.pop();
    const p = document.createElement('div');
    p.className = 'angelic-particle';
    const svgs = [
        `<svg viewBox="0 0 24 24"><use href="#icon-music-note"></use></svg>`,
        `<svg viewBox="0 0 24 24"><use href="#icon-star"></use></svg>`,
        `<svg viewBox="0 0 24 24"><use href="#icon-heart"></use></svg>`,
    ];
    p.innerHTML = svgs[Math.floor(Math.random() * svgs.length)];
    return p;
}

function releaseParticleToPool(p) {
    if (p && p.parentNode) {
        p.remove();
        if (angelicParticlePool.length < 20) angelicParticlePool.push(p);
    }
}

export const AngelicParticleSystem = {
    /**
     * Spawns a charm particle from the object pool into the particle container.
     * Respects dynamic throttle limits (6 when recording, 15 when live viewing).
     *
     * @param {HTMLElement} container     - #angelic-particle-container
     * @param {boolean}     isAngelicMode - Skip spawn if mode is not active
     */
    spawnParticle(container, isAngelicMode) {
        if (!isAngelicMode) return;

        const isRecording  = document.body.classList.contains('is-recording');
        const isPlaying    = document.querySelector('body')?.classList.contains('is-playing') 
                          || document.getElementById('btn-pause')?.classList.contains('hidden') === false;
        // Dạo nhạc: 40 particle (nhiều, sinh động), đang phát: 30, recording: 10
        const maxParticles = isRecording ? 10 : (isPlaying ? 30 : 40);
        const activeCount  = container.childElementCount;
        if (activeCount >= maxParticles) return;

        const p = getParticleFromPool();

        // Dynamic color from art cover CSS vars
        const colorVar = `--blob-${Math.floor(Math.random() * 4) + 1}-color`;
        p.style.setProperty('--p-color', `var(${colorVar})`);

        // Physics paths via CSS variables
        const sx = Math.random() * 100;
        const sy = 100 + Math.random() * 10;

        const size = 15 + Math.random() * 25;
        p.style.width  = `${size}px`;
        p.style.height = `${size}px`;

        const mx = sx + (Math.random() - 0.5) * 30;
        const my = 40 + Math.random() * 30;
        const ex = mx + (Math.random() - 0.5) * 30;
        const ey = -15;

        p.style.setProperty('--sx', `${sx}vw`);
        p.style.setProperty('--sy', `${sy}vh`);
        p.style.setProperty('--mx', `${mx}vw`);
        p.style.setProperty('--my', `${my}vh`);
        p.style.setProperty('--ex', `${ex}vw`);
        p.style.setProperty('--ey', `${ey}vh`);

        p.style.setProperty('--rot-mid', `${(Math.random() - 0.5) * 180}deg`);
        p.style.setProperty('--rot',     `${(Math.random() - 0.5) * 360}deg`);

        const dur = 8 + Math.random() * 6; // Very slow and gentle
        p.style.setProperty('--p-dur', `${dur}s`);
        p.style.setProperty('--p-op',  `${0.3 + Math.random() * 0.4}`);

        container.appendChild(p);
        setTimeout(() => releaseParticleToPool(p), dur * 1000);
    }
};
