/**
 * CinematicRenderer.js
 * Renders the full Cinematic Mode frame: LED pillars, concert spotlights,
 * smoke particles, fire burst management, and live-word glitching.
 *
 * Extracted 1:1 from backup_prime/js/main.js (lines 185-246, 1702-2083)
 * All math, timing constants, and variable names preserved exactly.
 */

// ── Pillar State ────────────────────────────────────────────────────────────
const NUM_PILLARS = 4;
const smoothedBars    = new Float32Array(NUM_PILLARS);
const peaks           = new Float32Array(NUM_PILLARS);
const peakVelocities  = new Float32Array(NUM_PILLARS);

// ── Concert Spotlight Colors (cycling palette) — same order as prime ────────
let CONCERT_COLORS = [
    [255, 30,  60 ],  // Red
    [30,  100, 255],  // Blue
    [180, 30,  255],  // Purple
    [0,   230, 255],  // Cyan
    [30,  255, 120],  // Green
    [255, 180, 0  ],  // Amber
    [255, 80,  0  ],  // Orange
    [255, 255, 255],  // White
];

// ── Spotlight state (2 spotlights from top corners) ────────────────────────
const spotlights = [
    { baseAngle: Math.PI * 0.38, sweepRange: 0.18, sweepSpeed: 0.45, phase: 0,
      colorIdx: 0, nextColorIdx: 2, colorT: 0, colorChangeDur: 2.5,
      blink: 1.0, blinkTimer: 2.0, blinkDur: 0, isOff: false },
    { baseAngle: Math.PI * 0.62, sweepRange: 0.20, sweepSpeed: 0.33, phase: Math.PI * 0.6,
      colorIdx: 3, nextColorIdx: 5, colorT: 0, colorChangeDur: 3.0,
      blink: 1.0, blinkTimer: 3.5, blinkDur: 0, isOff: false },
];

// ── Smoke particle system ───────────────────────────────────────────────────
const smokeParticles = [];
let smokeSpawnTimer  = 0;
let lastCineTime     = 0;

// ── Fire burst state ────────────────────────────────────────────────────────
let fireBurstTime    = 0;
let isFireBursting   = false;
let fireGifBlob      = null;
let fireGifBlobUrl   = 'assets/images/fire.gif'; // Default fallback

// ── Offscreen smoke sprite canvases (pre-rendered, re-used every frame) ─────
const smokeSprite0 = document.createElement('canvas');
const smokeSprite1 = document.createElement('canvas');
smokeSprite0.width = smokeSprite0.height = 128;
smokeSprite1.width = smokeSprite1.height = 128;

function renderSmokeSprite(canvas, r, g, b) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.00, `rgba(${r},${g},${b},1.0)`);
    grad.addColorStop(0.30, `rgba(${r},${g},${b},0.72)`);
    grad.addColorStop(0.65, `rgba(${r},${g},${b},0.22)`);
    grad.addColorStop(1.00, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();
}

export const CinematicRenderer = {
    /**
     * Pre-fetches fire.gif into RAM and seeds the initial smoke sprites.
     * Call once at startup (before the first playback).
     */
    init() {
        fetch('assets/images/fire.gif')
            .then(r => r.blob())
            .then(blob => { fireGifBlob = blob; })
            .catch(() => console.log('No fire.gif found for preloading'));
    },

    /**
     * Updates the concert spotlight color palette to reflect the current cover art.
     * Called from loadTrack after extractColorsFromImage resolves.
     * @param {Array<[number,number,number]>} colors  Array of [r,g,b] tuples.
     */
    updateConcertColors(colors) {
        CONCERT_COLORS = colors;
        spotlights.forEach(sp => {
            sp.colorIdx    = sp.colorIdx    % CONCERT_COLORS.length;
            sp.nextColorIdx = sp.nextColorIdx % CONCERT_COLORS.length;
        });
    },

    /**
     * Renders one full Cinematic frame onto `canvas`.
     * Must be called inside requestAnimationFrame (syncLoop).
     *
     * @param {HTMLCanvasElement} canvas          - #cinematic-canvas
     * @param {Uint8Array|null}   dataArray       - Raw FFT frequency data (128 bins)
     * @param {number}            intensity        - Bass intensity 0–1 (from FFTAnalyzer)
     * @param {number}            winWidth         - Cached window.innerWidth
     * @param {number}            winHeight        - Cached window.innerHeight
     * @param {boolean}           isPlaying        - Current playback state
     * @param {HTMLImageElement}  cineFireLeft     - #cine-fire-left element
     * @param {HTMLImageElement}  cineFireRight    - #cine-fire-right element
     * @param {HTMLElement}       reactiveDim      - #reactive-dim element
     */
    renderFrame(canvas, dataArray, intensity, winWidth, winHeight, isPlaying, cineFireLeft, cineFireRight, reactiveDim) {
        const ctx = canvas.getContext('2d');

        // Sync canvas dimensions to prevent layout thrashing
        if (canvas.width !== winWidth || canvas.height !== winHeight) {
            canvas.width  = winWidth;
            canvas.height = winHeight;
        }

        const width  = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        // ── DELTA TIME ───────────────────────────────────────────────────────
        const nowSec = performance.now() / 1000;
        const dt = lastCineTime > 0 ? Math.min(nowSec - lastCineTime, 0.05) : 0.016;
        lastCineTime = nowSec;

        // ── 1. REACTIVE DIMMING ──────────────────────────────────────────────
        if (reactiveDim) {
            const targetOpacity = isPlaying ? Math.max(0.1, 0.8 - (Math.pow(intensity, 2) * 1.5)) : 0.0;
            reactiveDim.style.opacity = targetOpacity.toFixed(2);
        }

        // ── 2. FIRE PILLARS (FESTIVAL BURST) ────────────────────────────────
        if (cineFireLeft && cineFireRight) {
            // Trigger a new burst if intensity is very high and cooldown passed (4 seconds)
            if (intensity > 0.8 && nowSec - fireBurstTime > 4.0) {
                isFireBursting = true;
                fireBurstTime  = nowSec;

                // Restart GIF from frame 0 using fresh RAM Blob instance
                if (fireGifBlob) {
                    if (fireGifBlobUrl !== 'assets/images/fire.gif') URL.revokeObjectURL(fireGifBlobUrl);
                    fireGifBlobUrl = URL.createObjectURL(new Blob([fireGifBlob], { type: 'image/gif' }));
                    cineFireLeft.src  = fireGifBlobUrl;
                    cineFireRight.src = fireGifBlobUrl;
                }
            }

            // Live HTMLCollection O(1) cache for word-glitch (reset when DOM changes)
            if (!window._cachedCineWords) {
                window._cachedCineWords = document.getElementsByClassName('cine-word');
            }

            // ~2% per-frame chance of glitching one active word
            if (Math.random() < 0.02 && window._cachedCineWords.length > 0) {
                const randomWord = window._cachedCineWords[Math.floor(Math.random() * window._cachedCineWords.length)];
                if (!randomWord.classList.contains('glitch-word-anim') &&
                    !randomWord.classList.contains('glitched') &&
                    !randomWord.classList.contains('glitch-immune')) {
                    randomWord.classList.add('glitch-word-anim');
                    randomWord.classList.add('glitched');
                    setTimeout(() => randomWord.classList.remove('glitch-word-anim'), 400);
                }
            }

            if (isFireBursting) {
                const burstElapsed  = nowSec - fireBurstTime;
                const burstDuration = 1.2;

                if (burstElapsed < burstDuration) {
                    let translateY = 100;
                    let op = 1;

                    if (burstElapsed < 0.15) {
                        // 0. Hold off-screen for 150ms (skip bad GIF start frames)
                        translateY = 100;
                    } else if (burstElapsed < 0.25) {
                        // 1. Shoot up extremely fast
                        translateY = 100 - ((burstElapsed - 0.15) / 0.10) * 100;
                    } else if (burstElapsed < 0.8) {
                        // 2. Hold at peak, roaring/flickering aggressively
                        translateY = Math.random() * 3;
                        op = 0.85 + Math.random() * 0.15;
                    } else {
                        // 3. Dissipate upwards and fade out
                        const fadeProgress = (burstElapsed - 0.8) / 0.4;
                        translateY = -(fadeProgress * 30);
                        op = 1.0 - fadeProgress;
                    }

                    cineFireLeft.style.transform  = `translateY(${translateY}%)`;
                    cineFireLeft.style.opacity    = op.toFixed(2);
                    cineFireRight.style.transform = `translateY(${translateY}%)`;
                    cineFireRight.style.opacity   = op.toFixed(2);
                } else {
                    isFireBursting = false;
                    cineFireLeft.style.transform  = 'translateY(100%)';
                    cineFireLeft.style.opacity    = '0';
                    cineFireRight.style.transform = 'translateY(100%)';
                    cineFireRight.style.opacity   = '0';
                }
            }
        }

        // =============================================
        // LAYER 1: LED PILLARS (bottom / back)
        // =============================================
        const pillarWidth = width * 0.18;
        const gap         = width * 0.04;
        const totalWidth  = (pillarWidth * NUM_PILLARS) + (gap * (NUM_PILLARS - 1));
        let x = (width - totalWidth) / 2;

        const blockHeight      = height * 0.028;
        const blockGap         = height * 0.007;
        const blockTotalHeight = blockHeight + blockGap;
        const totalBlocksPerPillar = Math.ceil(height * 0.95 / blockTotalHeight);
        const visibleBlocks    = totalBlocksPerPillar;

        const _data      = dataArray || new Uint8Array(256);
        const bucketSize = Math.floor((_data.length * 0.75) / NUM_PILLARS);
        const useRoundRect = typeof ctx.roundRect === 'function';

        const cs = getComputedStyle(document.documentElement);
        const coverColors = [
            cs.getPropertyValue('--blob-1-color').trim() || '#ff2d55',
            cs.getPropertyValue('--blob-2-color').trim() || '#5856d6',
            cs.getPropertyValue('--blob-3-color').trim() || '#ff9500',
            cs.getPropertyValue('--blob-4-color').trim() || '#af52de',
        ];

        for (let i = 0; i < NUM_PILLARS; i++) {
            let bucketSum = 0;
            for (let j = 0; j < bucketSize; j++) bucketSum += _data[i * bucketSize + j];
            const raw = (bucketSum / bucketSize) / 255;

            const lerpSpeed = raw > smoothedBars[i] ? 0.4 : 0.12;
            smoothedBars[i] += (raw - smoothedBars[i]) * lerpSpeed;

            if (smoothedBars[i] >= peaks[i]) {
                peaks[i]         = smoothedBars[i];
                peakVelocities[i] = 0;
            } else {
                peakVelocities[i] += 0.0004;
                peaks[i] -= peakVelocities[i];
                if (peaks[i] < 0) peaks[i] = 0;
            }

            const litBlocks = Math.min(
                Math.floor(smoothedBars[i] * totalBlocksPerPillar),
                visibleBlocks - 1
            );
            const baseColor = coverColors[i];

            // Unlit (ghost) blocks
            ctx.shadowBlur = 0;
            ctx.beginPath();
            for (let b = litBlocks; b < visibleBlocks; b++) {
                const blockY = height - (b * blockTotalHeight) - blockHeight;
                if (useRoundRect) ctx.roundRect(x, blockY, pillarWidth, blockHeight, 5);
                else              ctx.rect(x, blockY, pillarWidth, blockHeight);
            }
            ctx.fillStyle   = 'rgba(255,255,255,0.04)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth   = 1;
            ctx.stroke();

            // Lit blocks with gradient and glow
            if (litBlocks > 0) {
                const capped = Math.min(litBlocks, visibleBlocks);
                const topY   = height - (capped * blockTotalHeight);
                const grad   = ctx.createLinearGradient(0, topY, 0, height);
                grad.addColorStop(0,   baseColor);
                grad.addColorStop(0.5, baseColor);
                grad.addColorStop(1,   'rgba(0,0,0,0.3)');

                ctx.beginPath();
                for (let b = 0; b < capped; b++) {
                    const blockY = height - (b * blockTotalHeight) - blockHeight;
                    if (useRoundRect) ctx.roundRect(x, blockY, pillarWidth, blockHeight, 5);
                    else              ctx.rect(x, blockY, pillarWidth, blockHeight);
                }
                ctx.fillStyle   = grad;
                ctx.shadowBlur  = intensity * 80 + 15;
                ctx.shadowColor = baseColor;
                ctx.fill();

                // Specular highlight
                ctx.shadowBlur = 0;
                const cpX = pillarWidth * 0.12;
                const cpY = blockHeight * 0.18;
                ctx.beginPath();
                for (let b = 0; b < capped; b++) {
                    const blockY = height - (b * blockTotalHeight) - blockHeight;
                    if (useRoundRect) ctx.roundRect(x + cpX, blockY + cpY, pillarWidth - cpX * 2, blockHeight - cpY * 2, 3);
                    else              ctx.rect(x + cpX, blockY + cpY, pillarWidth - cpX * 2, blockHeight - cpY * 2);
                }
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.fill();

                // Peak marker
                const peakBlock = Math.floor(peaks[i] * totalBlocksPerPillar);
                if (peakBlock > 0 && peakBlock < visibleBlocks) {
                    const peakY = height - (peakBlock * blockTotalHeight) - blockHeight;
                    ctx.shadowBlur  = 20;
                    ctx.shadowColor = '#ffffff';
                    ctx.fillStyle   = '#ffffff';
                    ctx.beginPath();
                    if (useRoundRect) ctx.roundRect(x, peakY, pillarWidth, blockHeight * 0.5, 3);
                    else              ctx.rect(x, peakY, pillarWidth, blockHeight * 0.5);
                }
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            x += pillarWidth + gap;
        }

        // =============================================
        // LAYER 2: SPOTLIGHTS (concert beams from corners)
        // =============================================
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        for (let si = 0; si < 2; si++) {
            const sp = spotlights[si];

            sp.colorT += dt / sp.colorChangeDur;
            if (sp.colorT >= 1) {
                sp.colorIdx     = sp.nextColorIdx;
                sp.nextColorIdx = Math.floor(Math.random() * CONCERT_COLORS.length);
                sp.colorT       = 0;
                sp.colorChangeDur = 2.0 + Math.random() * 3;
                // Tint existing smoke particles to match new spotlight color
                smokeParticles.forEach(p => {
                    const sc = CONCERT_COLORS[sp.colorIdx];
                    p.r = p.r * 0.5 + sc[0] * 0.5;
                    p.g = p.g * 0.5 + sc[1] * 0.5;
                    p.b = p.b * 0.5 + sc[2] * 0.5;
                });
            }

            const c0 = CONCERT_COLORS[sp.colorIdx    % CONCERT_COLORS.length] || [255,255,255];
            const c1 = CONCERT_COLORS[sp.nextColorIdx % CONCERT_COLORS.length] || [255,255,255];
            const t  = sp.colorT;
            const cr = Math.round(c0[0] + (c1[0] - c0[0]) * t);
            const cg = Math.round(c0[1] + (c1[1] - c0[1]) * t);
            const cb = Math.round(c0[2] + (c1[2] - c0[2]) * t);

            // Update offscreen smoke sprite with current interpolated color
            renderSmokeSprite(si === 0 ? smokeSprite0 : smokeSprite1, cr, cg, cb);

            // Blink logic
            sp.blinkTimer -= dt;
            if (sp.blinkTimer <= 0 && !sp.isOff) {
                sp.isOff    = true;
                sp.blinkDur = 0.04 + Math.random() * 0.12;
                sp.blinkTimer = 0;
            }
            if (sp.isOff) {
                sp.blinkDur -= dt;
                sp.blink = 0;
                if (sp.blinkDur <= 0) {
                    sp.isOff      = false;
                    sp.blink      = 1.0;
                    sp.blinkTimer = Math.max(0.4, 1.5 + Math.random() * 3.0 - intensity * 1.2);
                }
            } else {
                sp.blink = 0.75 + intensity * 0.25;
            }

            if (sp.blink < 0.01) continue;

            const sweepAngle = sp.baseAngle + Math.sin(nowSec * sp.sweepSpeed + sp.phase) * sp.sweepRange;
            const spread     = 0.12 + intensity * 0.06;
            const beamLen    = Math.sqrt(width * width + height * height);
            const ox = si === 0 ? width * 0.03 : width * 0.97;
            const oy = -30;

            const lx = ox + Math.cos(sweepAngle - spread) * beamLen;
            const ly = oy + Math.sin(sweepAngle - spread) * beamLen;
            const rx = ox + Math.cos(sweepAngle + spread) * beamLen;
            const ry = oy + Math.sin(sweepAngle + spread) * beamLen;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(lx, ly);
            ctx.lineTo(rx, ry);
            ctx.closePath();
            ctx.clip();

            const beamAlpha = sp.blink * (0.45 + intensity * 0.25);
            const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, beamLen * 0.85);
            grad.addColorStop(0.0,  `rgba(${cr},${cg},${cb},${beamAlpha})`);
            grad.addColorStop(0.25, `rgba(${cr},${cg},${cb},${beamAlpha * 0.6})`);
            grad.addColorStop(0.7,  `rgba(${cr},${cg},${cb},${beamAlpha * 0.15})`);
            grad.addColorStop(1.0,  `rgba(${cr},${cg},${cb},0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();

            // Lens flare at origin
            const flare = ctx.createRadialGradient(ox, oy, 0, ox, oy, 80);
            flare.addColorStop(0,   `rgba(255,255,255,${sp.blink * 0.9})`);
            flare.addColorStop(0.3, `rgba(${cr},${cg},${cb},${sp.blink * 0.5})`);
            flare.addColorStop(1,   `rgba(${cr},${cg},${cb},0)`);
            ctx.fillStyle = flare;
            ctx.beginPath();
            ctx.arc(ox, oy, 80, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();

        // =============================================
        // LAYER 3: SMOKE — Realistic Fog Machine
        // =============================================
        const isBursting    = intensity > 0.65;
        const spawnInterval = isBursting ? 0.012 : 0.10;
        const spawnCount    = isBursting ? 4 : 1;

        smokeSpawnTimer -= dt;
        if (smokeSpawnTimer <= 0 && smokeParticles.length < 50) {
            for (let s = 0; s < spawnCount && smokeParticles.length < 50; s++) {
                const s0 = CONCERT_COLORS[spotlights[0].colorIdx] || [255,255,255];
                const s1 = CONCERT_COLORS[spotlights[1].colorIdx] || [255,255,255];
                const sc = Math.random() > 0.5 ? s0 : s1;
                const br = isBursting;

                smokeParticles.push({
                    x:         width * 0.05 + Math.random() * width * 0.9,
                    y:         height + 50,
                    radius:    br ? 20 + Math.random() * 30 : 90 + Math.random() * 130,
                    vx:        (Math.random() - 0.5) * (br ? 30 : 22),
                    vy:        br ? -(400 + Math.random() * 350) : -(4 + Math.random() * 8),
                    spriteIdx: (sc === s0) ? 0 : 1,
                    tx:        Math.random() * Math.PI * 2,
                    ty:        Math.random() * Math.PI * 2,
                    life:      1.0,
                    maxLife:   br ? 3.5 + Math.random() * 2.0 : 1.5 + Math.random() * 1.5,
                    isBurst:   br,
                });
            }
            smokeSpawnTimer = spawnInterval;
        }

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = smokeParticles.length - 1; i >= 0; i--) {
            const p = smokeParticles[i];

            // Turbulence: random swirl force each frame
            p.tx += dt * (p.isBurst ? 2.5 : 1.4);
            p.ty += dt * (p.isBurst ? 2.0 : 1.1);
            const tForce = p.isBurst ? 20 : 9;
            p.vx += Math.sin(p.tx) * tForce * dt;
            p.vy += Math.cos(p.ty) * tForce * 0.3 * dt;

            // Drag
            p.vx *= p.isBurst ? 0.975 : 0.990;
            p.vy *= p.isBurst ? 0.970 : 0.996;

            p.x      += p.vx * dt;
            p.y      += p.vy * dt;
            p.radius += (p.isBurst ? 70 : 32) * dt;
            p.life   -= dt / p.maxLife;

            if (p.life <= 0 || p.y < -p.radius * 1.5) {
                smokeParticles.splice(i, 1);
                continue;
            }

            const maxAlpha = p.isBurst ? 0.65 : 0.42;
            const alpha    = p.life * maxAlpha;

            ctx.globalAlpha = alpha;
            const sprite = p.spriteIdx === 0 ? smokeSprite0 : smokeSprite1;
            ctx.drawImage(sprite, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
        }
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    },
};
