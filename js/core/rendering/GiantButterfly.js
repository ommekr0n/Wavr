/**
 * GiantButterfly.js
 * Spawns the Giant Butterfly climax element with randomized bezier flight paths.
 * Extracted 1:1 from backup_prime/js/main.js (lines 1577-1666)
 */

export const GiantButterfly = {
    /**
     * Spawns a giant butterfly into the given container with a randomized flight path.
     * Uses CSS custom variables --sx/--sy/--sr/--mx/--my/--mr/--ex/--ey/--er for bezier motion.
     * Removes itself after 6 seconds.
     *
     * @param {HTMLElement} container - The element to append the butterfly into (angelic-view)
     */
    spawn(container) {
        if (!container) return;

        const b = document.createElement('div');
        b.className = 'giant-butterfly';

        // Probability games for Giant Butterfly flight path!
        const randPath = Math.random();
        let sx, sy, sr, mx, my, mr, ex, ey, er;

        if (randPath < 0.25) {
            // Top-Left -> Bottom-Right
            sx = '-20vw'; sy = '-20vh'; sr = '15deg';
            mx = '40vw';  my = '40vh';  mr = '5deg';
            ex = '120vw'; ey = '120vh'; er = '15deg';
        } else if (randPath < 0.5) {
            // Bottom-Left -> Top-Right
            sx = '-20vw'; sy = '120vh'; sr = '5deg';
            mx = '40vw';  my = '50vh';  mr = '-5deg';
            ex = '120vw'; ey = '-20vh'; er = '10deg';
        } else if (randPath < 0.75) {
            // Top-Right -> Bottom-Left
            sx = '120vw'; sy = '-20vh'; sr = '-15deg';
            mx = '60vw';  my = '40vh';  mr = '-5deg';
            ex = '-20vw'; ey = '120vh'; er = '-15deg';
        } else {
            // Bottom-Right -> Top-Left
            sx = '120vw'; sy = '120vh'; sr = '-5deg';
            mx = '60vw';  my = '50vh';  mr = '5deg';
            ex = '-20vw'; ey = '-20vh'; er = '-10deg';
        }

        // Randomly adjust the "landing" spot slightly to keep it organic
        mx = `calc(${mx} + ${(Math.random() - 0.5) * 20}vw)`;
        my = `calc(${my} + ${(Math.random() - 0.5) * 20}vh)`;

        b.style.setProperty('--sx', sx); b.style.setProperty('--sy', sy); b.style.setProperty('--sr', sr);
        b.style.setProperty('--mx', mx); b.style.setProperty('--my', my); b.style.setProperty('--mr', mr);
        b.style.setProperty('--ex', ex); b.style.setProperty('--ey', ey); b.style.setProperty('--er', er);

        // Force high z-index to fly above lyrics
        b.style.zIndex = '10';

        const sizeRand = Math.random();
        let scale   = '2.0'; // Default: twice as large as old default
        let bgStyle = '';
        if (sizeRand < 0.1) {
            scale   = '4.0'; // 10% Super Giant!
            bgStyle = 'background-color: var(--blob-3-color);';
        } else if (sizeRand < 0.4) {
            scale = '1.2'; // 30% smaller but still larger than old default
        }

        b.innerHTML = `<div class="sprite-butterfly giant" style="transform: scale(${scale}); ${bgStyle}"></div>`;

        container.appendChild(b);
        setTimeout(() => { if (b.parentNode) b.remove(); }, 6000);
    },
};
