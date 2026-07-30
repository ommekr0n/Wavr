/**
 * CinematicRenderer.js
 * Renders the full Cinematic Mode frame: LED pillars, concert spotlights,
 * 3D Moshpit laser beams, smooth camera micro-shake, smoke particles, and fire burst.
 */

import fireGifUrl from '../../../assets/images/fire.gif';
import { analyzeFrequencyBands } from '../audio/AudioFrequencyBands.js';
import { MoshpitCameraShake } from './MoshpitCameraShake.js';

// ── Pillar State ────────────────────────────────────────────────────────────
const NUM_PILLARS = 4;
const smoothedBars    = new Float32Array(NUM_PILLARS);
const peaks           = new Float32Array(NUM_PILLARS);
const peakVelocities  = new Float32Array(NUM_PILLARS);

// ── Concert Spotlight Colors (cycling palette) ──────────────────────────────
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

// ── Smoke Particle Pool (Fixed Max 60 - Garbage Collection Free) ────────────
const MAX_SMOKE_PARTICLES = 60;
const smokePool = Array.from({ length: MAX_SMOKE_PARTICLES }, () => ({
    active: false,
    x: 0, y: 0, radius: 0, vx: 0, vy: 0,
    spriteIdx: 0, tx: 0, ty: 0, life: 0, maxLife: 1, isBurst: false
}));
let smokeSpawnTimer = 0;
let lastCineTime    = 0;

// ── Fire burst state ────────────────────────────────────────────────────────
let fireBurstTime    = 0;
let isFireBursting   = false;
let fireGifBlob      = null;
let fireGifBlobUrl   = fireGifUrl;

// ── Offscreen smoke sprite canvases ─────────────────────────────────────────
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
    init() {
        fetch(fireGifUrl)
            .then(r => r.blob())
            .then(blob => {
                fireGifBlob = blob;
                if (fireGifBlobUrl === fireGifUrl) {
                    fireGifBlobUrl = URL.createObjectURL(blob);
                }
            })
            .catch(() => console.log('No fire.gif found for preloading'));
    },

    updateConcertColors(colors) {
        if (!colors || colors.length === 0) return;
        CONCERT_COLORS = colors.map(c => [c.r || c[0], c.g || c[1], c.b || c[2]]);
        spotlights.forEach(sp => {
            sp.colorIdx     = sp.colorIdx    % CONCERT_COLORS.length;
            sp.nextColorIdx = sp.nextColorIdx % CONCERT_COLORS.length;
        });
    },

    renderFrame(canvas, dataArray, intensity, winWidth, winHeight, isPlaying, cineFireLeft, cineFireRight, reactiveDim, analysis) {
        const ctx = canvas.getContext('2d');

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

        // ── 3-BAND FREQUENCY ANALYSIS ───────────────────────────────────────
        const bands = analyzeFrequencyBands(dataArray);
        const bassEnergy = bands.bass;
        const trebleEnergy = bands.treble;
        const climaxSpike = Boolean(analysis && analysis.climaxSpike);



        // ── SMOOTH MICRO-CAMERA SHAKE (Euler Damped) ────────────────────────
        const shakeOffset = MoshpitCameraShake.update(bassEnergy, climaxSpike, dt);

        ctx.save();
        if (shakeOffset.x !== 0 || shakeOffset.y !== 0) {
            ctx.translate(shakeOffset.x, shakeOffset.y);
        }

        // ── 1. REACTIVE DIMMING ──────────────────────────────────────────────
        if (reactiveDim) {
            const targetOpacity = isPlaying ? Math.max(0.1, 0.8 - (Math.pow(bassEnergy, 2) * 1.5)) : 0.0;
            reactiveDim.style.opacity = targetOpacity.toFixed(2);
        }

        // ── 2. FIRE PILLARS (FESTIVAL BURST) ────────────────────────────────
        if (cineFireLeft && cineFireRight) {
            if (bassEnergy > 0.8 && nowSec - fireBurstTime > 4.0) {
                isFireBursting = true;
                fireBurstTime  = nowSec;

                if (fireGifBlob) {
                    if (fireGifBlobUrl !== fireGifUrl) URL.revokeObjectURL(fireGifBlobUrl);
                    fireGifBlobUrl = URL.createObjectURL(new Blob([fireGifBlob], { type: 'image/gif' }));
                    cineFireLeft.src  = fireGifBlobUrl;
                    cineFireRight.src = fireGifBlobUrl;
                }
            }

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
                        translateY = 100;
                    } else if (burstElapsed < 0.25) {
                        translateY = 100 - ((burstElapsed - 0.15) / 0.10) * 100;
                    } else if (burstElapsed < 0.8) {
                        translateY = Math.random() * 3;
                        op = 0.85 + Math.random() * 0.15;
                    } else {
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

            // Unlit ghost blocks
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

            // Lit blocks
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
                ctx.shadowBlur  = bassEnergy * 80 + 15;
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
        // LAYER 3: SPOTLIGHTS (concert beams from corners)
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
            }

            const c0 = CONCERT_COLORS[sp.colorIdx    % CONCERT_COLORS.length] || [255,255,255];
            const c1 = CONCERT_COLORS[sp.nextColorIdx % CONCERT_COLORS.length] || [255,255,255];
            const t  = sp.colorT;
            const cr = Math.round(c0[0] + (c1[0] - c0[0]) * t);
            const cg = Math.round(c0[1] + (c1[1] - c0[1]) * t);
            const cb = Math.round(c0[2] + (c1[2] - c0[2]) * t);

            renderSmokeSprite(si === 0 ? smokeSprite0 : smokeSprite1, cr, cg, cb);

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
                    sp.blinkTimer = Math.max(0.4, 1.5 + Math.random() * 3.0 - bassEnergy * 1.2);
                }
            } else {
                sp.blink = 0.75 + bassEnergy * 0.25;
            }

            if (sp.blink < 0.01) continue;

            const danceability = (typeof analysis !== 'undefined' && analysis) ? (analysis.danceability || 0.5) : 0.5;
            const speedMult = 0.7 + danceability * 0.6;
            const sweepAngle = sp.baseAngle + Math.sin(nowSec * sp.sweepSpeed * speedMult + sp.phase) * sp.sweepRange;
            const spread     = 0.12 + bassEnergy * 0.06;
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

            const beamAlpha = sp.blink * (0.45 + bassEnergy * 0.25);
            const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, beamLen * 0.85);
            grad.addColorStop(0.0,  `rgba(${cr},${cg},${cb},${beamAlpha})`);
            grad.addColorStop(0.25, `rgba(${cr},${cg},${cb},${beamAlpha * 0.6})`);
            grad.addColorStop(0.7,  `rgba(${cr},${cg},${cb},${beamAlpha * 0.15})`);
            grad.addColorStop(1.0,  `rgba(${cr},${cg},${cb},0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();

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
        // LAYER 4: SMOKE — Realistic Particle Pool
        // =============================================
        const trackEnergy   = (typeof analysis !== 'undefined' && analysis) ? (analysis.energy || 0.5) : 0.5;
        const isBursting    = bassEnergy > 0.65;
        const spawnInterval = isBursting ? 0.010 : Math.max(0.04, 0.12 - trackEnergy * 0.08);

        smokeSpawnTimer -= dt;
        if (smokeSpawnTimer <= 0) {
            // Find inactive particle from Pool
            const freeParticle = smokePool.find(p => !p.active);
            if (freeParticle) {
                const s0 = CONCERT_COLORS[spotlights[0].colorIdx] || [255,255,255];
                const s1 = CONCERT_COLORS[spotlights[1].colorIdx] || [255,255,255];
                const sc = Math.random() > 0.5 ? s0 : s1;

                freeParticle.active    = true;
                freeParticle.x         = width * 0.05 + Math.random() * width * 0.9;
                freeParticle.y         = height + 50;
                freeParticle.radius    = isBursting ? 20 + Math.random() * 30 : 90 + Math.random() * 130;
                freeParticle.vx        = (Math.random() - 0.5) * (isBursting ? 30 : 22);
                freeParticle.vy        = isBursting ? -(400 + Math.random() * 350) : -(4 + Math.random() * 8);
                freeParticle.spriteIdx = (sc === s0) ? 0 : 1;
                freeParticle.tx        = Math.random() * Math.PI * 2;
                freeParticle.ty        = Math.random() * Math.PI * 2;
                freeParticle.life      = 1.0;
                freeParticle.maxLife   = isBursting ? 3.5 + Math.random() * 2.0 : 1.5 + Math.random() * 1.5;
                freeParticle.isBurst   = isBursting;
            }
            smokeSpawnTimer = spawnInterval;
        }

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) {
            const p = smokePool[i];
            if (!p.active) continue;

            p.tx += dt * (p.isBurst ? 2.5 : 1.4);
            p.ty += dt * (p.isBurst ? 2.0 : 1.1);
            const tForce = p.isBurst ? 20 : 9;
            p.vx += Math.sin(p.tx) * tForce * dt;
            p.vy += Math.cos(p.ty) * tForce * 0.3 * dt;

            p.vx *= p.isBurst ? 0.975 : 0.990;
            p.vy *= p.isBurst ? 0.970 : 0.996;

            p.x      += p.vx * dt;
            p.y      += p.vy * dt;
            p.radius += (p.isBurst ? 70 : 32) * dt;
            p.life   -= dt / p.maxLife;

            if (p.life <= 0 || p.y < -p.radius * 1.5) {
                p.active = false;
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

        ctx.restore();
    },
};
