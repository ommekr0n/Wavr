/**
 * CinematicRenderer.js
 * Renders the full Cinematic Mode frame: LED pillars, concert spotlights,
 * 3D Moshpit laser beams, smooth camera micro-shake, smoke particles, and fire burst.
 *
 * Optimization notes:
 *  - smokeSprite redrawn only when spotlight color changes (not every frame)
 *  - smokePool uses a circular free-pointer instead of Array.find() each frame
 *  - cachedCineWords rebuilt lazily, filter() avoided per-frame
 *  - pillar gradient & specular batch-drawn via a single Path2D-equivalent beginPath per pass
 *  - analyzeFrequencyBands result reused from caller (no second FFT pass)
 */

import fireGifUrl from '../../../assets/images/fire.gif';
import { analyzeFrequencyBands } from '../audio/AudioFrequencyBands.js';
import { MoshpitCameraShake } from './MoshpitCameraShake.js';

// ── Pillar State ────────────────────────────────────────────────────────────
const NUM_PILLARS     = 4;
const smoothedBars    = new Float32Array(NUM_PILLARS);
const peaks           = new Float32Array(NUM_PILLARS);
const peakVelocities  = new Float32Array(NUM_PILLARS);

// ── Concert Spotlight Colors (cycling palette) ──────────────────────────────
let CONCERT_COLORS = [
    [255, 30,  60 ],
    [30,  100, 255],
    [180, 30,  255],
    [0,   230, 255],
    [30,  255, 120],
    [255, 180, 0  ],
    [255, 80,  0  ],
    [255, 255, 255],
];

// ── Spotlight state ────────────────────────────────────────────────────────
const spotlights = [
    { baseAngle: Math.PI * 0.38, sweepRange: 0.18, sweepSpeed: 0.45, phase: 0,
      colorIdx: 0, nextColorIdx: 2, colorT: 0, colorChangeDur: 2.5,
      blink: 1.0, blinkTimer: 2.0, blinkDur: 0, isOff: false,
      // cached RGB from last frame to detect sprite-redraw need
      _cr: -1, _cg: -1, _cb: -1 },
    { baseAngle: Math.PI * 0.62, sweepRange: 0.20, sweepSpeed: 0.33, phase: Math.PI * 0.6,
      colorIdx: 3, nextColorIdx: 5, colorT: 0, colorChangeDur: 3.0,
      blink: 1.0, blinkTimer: 3.5, blinkDur: 0, isOff: false,
      _cr: -1, _cg: -1, _cb: -1 },
];

// ── Smoke Particle Pool — circular free-pointer, no Array.find() ─────────
const MAX_SMOKE_PARTICLES = 60;
const smokePool = Array.from({ length: MAX_SMOKE_PARTICLES }, () => ({
    active: false,
    x: 0, y: 0, radius: 0, vx: 0, vy: 0,
    spriteIdx: 0, tx: 0, ty: 0, life: 0, maxLife: 1, isBurst: false
}));
let _smokePoolPtr   = 0;
let smokeSpawnTimer = 0;
let lastCineTime    = 0;
let lastColorCheckTime = 0;
let _activeParticleCount = 0; // track active count to skip full-loop when empty
let _cachedBeamLen  = 0;      // cached diagonal (invalidated on resize)
let _cachedBLW      = 0;      // cached width when beamLen was computed
let _cachedBLH      = 0;      // cached height when beamLen was computed
const cachedCoverColors = ['#ff2d55', '#5856d6', '#ff9500', '#af52de'];

// ── Fire burst state ────────────────────────────────────────────────────────
let fireBurstTime    = 0;
let isFireBursting   = false;
let fireGifBlob      = null;
let fireGifBlobUrl   = fireGifUrl;

// ── Offscreen smoke sprite canvases (redrawn only on color change) ────────
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

// ── Glitch word pool — rebuilt once, not every frame ────────────────────
let _normalWordCache  = null;
let _normalWordTimer  = 0;

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
            // Force sprite redraw on next frame
            sp._cr = sp._cg = sp._cb = -1;
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

        // ── REUSE BAND ANALYSIS — passed from syncLoop, no second FFT pass ──
        // analyzeFrequencyBands only if analysis.bass unavailable
        let bassEnergy, trebleEnergy;
        if (analysis && typeof analysis.intensity === 'number') {
            bassEnergy   = analysis.intensity;
            trebleEnergy = analysis.highIntensity || 0;
        } else {
            const bands  = analyzeFrequencyBands(dataArray);
            bassEnergy   = bands.bass;
            trebleEnergy = bands.treble;
        }
        const climaxSpike = Boolean(analysis && analysis.climaxSpike);

        // ── SMOOTH MICRO-CAMERA SHAKE ────────────────────────────────────────
        const shakeOffset = MoshpitCameraShake.update(bassEnergy, climaxSpike, dt);

        ctx.save();
        if (shakeOffset.x !== 0 || shakeOffset.y !== 0) {
            ctx.translate(shakeOffset.x, shakeOffset.y);
        }

        // ── 1. REACTIVE DIMMING ──────────────────────────────────────────────
        if (reactiveDim) {
            const targetOpacity = isPlaying ? Math.max(0.1, 0.8 - (bassEnergy * bassEnergy * 1.5)) : 0.0;
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

            // Glitch: rebuild normal-word cache every 3s, never on every frame
            _normalWordTimer -= dt;
            if (_normalWordTimer <= 0) {
                _normalWordTimer  = 3.0;
                _normalWordCache  = null; // invalidate → rebuilt lazily below
            }
            if (Math.random() < 0.02) {
                if (!_normalWordCache) {
                    const all = document.getElementsByClassName('cine-word');
                    _normalWordCache = [];
                    for (let i = 0; i < all.length; i++) {
                        const w = all[i];
                        if (!w.classList.contains('has-enhanced-word') &&
                            !w.hasAttribute('data-start') &&
                            !w.classList.contains('glitch-word-anim') &&
                            !w.classList.contains('glitched') &&
                            !w.classList.contains('glitch-immune')) {
                            _normalWordCache.push(w);
                        }
                    }
                }
                if (_normalWordCache.length > 0) {
                    const randomWord = _normalWordCache[Math.floor(Math.random() * _normalWordCache.length)];
                    randomWord.classList.add('glitch-word-anim', 'glitched');
                    _normalWordCache = null; // state changed → invalidate
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

                    const tfm = `translateY(${translateY}%)`;
                    const ops = op.toFixed(2);
                    cineFireLeft.style.transform  = tfm;
                    cineFireLeft.style.opacity    = ops;
                    cineFireRight.style.transform = tfm;
                    cineFireRight.style.opacity   = ops;
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
        // LAYER 1: LED PILLARS
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

        if (nowSec - lastColorCheckTime > 2.0) {
            lastColorCheckTime = nowSec;
            const cs = getComputedStyle(document.documentElement);
            cachedCoverColors[0] = cs.getPropertyValue('--blob-1-color').trim() || '#ff2d55';
            cachedCoverColors[1] = cs.getPropertyValue('--blob-2-color').trim() || '#5856d6';
            cachedCoverColors[2] = cs.getPropertyValue('--blob-3-color').trim() || '#ff9500';
            cachedCoverColors[3] = cs.getPropertyValue('--blob-4-color').trim() || '#af52de';
        }
        const coverColors = cachedCoverColors;

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

            // Unlit ghost blocks (single path per pillar)
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
        // LAYER 3: SPOTLIGHTS
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

            // Only redraw smoke sprite when RGB changed by ≥4 (saves ~60 canvas draws/sec)
            if (Math.abs(cr - sp._cr) > 4 || Math.abs(cg - sp._cg) > 4 || Math.abs(cb - sp._cb) > 4) {
                renderSmokeSprite(si === 0 ? smokeSprite0 : smokeSprite1, cr, cg, cb);
                sp._cr = cr; sp._cg = cg; sp._cb = cb;
            }

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

            const danceability = (analysis && analysis.danceability) ? analysis.danceability : 0.5;
            const speedMult = 0.7 + danceability * 0.6;
            const sweepAngle = sp.baseAngle + Math.sin(nowSec * sp.sweepSpeed * speedMult + sp.phase) * sp.sweepRange;
            const spread     = 0.12 + bassEnergy * 0.06;
            // Cache beamLen: sqrt is expensive, recompute only on resize
            if (_cachedBLW !== width || _cachedBLH !== height) {
                _cachedBLW = width; _cachedBLH = height;
                _cachedBeamLen = Math.sqrt(width * width + height * height);
            }
            const beamLen    = _cachedBeamLen;
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
            grad.addColorStop(0.25, `rgba(${cr},${cg},${cb},${(beamAlpha * 0.6).toFixed(3)})`);
            grad.addColorStop(0.7,  `rgba(${cr},${cg},${cb},${(beamAlpha * 0.15).toFixed(3)})`);
            grad.addColorStop(1.0,  `rgba(${cr},${cg},${cb},0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();

            const flare = ctx.createRadialGradient(ox, oy, 0, ox, oy, 80);
            flare.addColorStop(0,   `rgba(255,255,255,${sp.blink * 0.9})`);
            flare.addColorStop(0.3, `rgba(${cr},${cg},${cb},${(sp.blink * 0.5).toFixed(3)})`);
            flare.addColorStop(1,   `rgba(${cr},${cg},${cb},0)`);
            ctx.fillStyle = flare;
            ctx.beginPath();
            ctx.arc(ox, oy, 80, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();

        // =============================================
        // LAYER 4: SMOKE — Pool with circular pointer
        // =============================================
        const trackEnergy   = (analysis && analysis.energy) ? analysis.energy : 0.5;
        const isBursting    = bassEnergy > 0.65;
        const spawnInterval = isBursting ? 0.010 : Math.max(0.04, 0.12 - trackEnergy * 0.08);

        smokeSpawnTimer -= dt;
        if (smokeSpawnTimer <= 0) {
            // O(1) slot allocation via circular pointer — skip active slots fast
            let found = false;
            for (let attempt = 0; attempt < MAX_SMOKE_PARTICLES; attempt++) {
                const p = smokePool[_smokePoolPtr];
                _smokePoolPtr = (_smokePoolPtr + 1) % MAX_SMOKE_PARTICLES;
                if (!p.active) {
                    const s0 = CONCERT_COLORS[spotlights[0].colorIdx] || [255,255,255];
                    const s1 = CONCERT_COLORS[spotlights[1].colorIdx] || [255,255,255];
                    const sc = Math.random() > 0.5 ? s0 : s1;

                                p.active    = true;
                    p.x         = width * 0.05 + Math.random() * width * 0.9;
                    p.y         = height + 50;
                    p.radius    = isBursting ? 20 + Math.random() * 30 : 90 + Math.random() * 130;
                    p.vx        = (Math.random() - 0.5) * (isBursting ? 30 : 22);
                    p.vy        = isBursting ? -(400 + Math.random() * 350) : -(4 + Math.random() * 8);
                    p.spriteIdx = (sc === s0) ? 0 : 1;
                    p.tx        = Math.random() * Math.PI * 2;
                    p.ty        = Math.random() * Math.PI * 2;
                    p.life      = 1.0;
                    p.maxLife   = isBursting ? 3.5 + Math.random() * 2.0 : 1.5 + Math.random() * 1.5;
                    p.isBurst   = isBursting;
                    _activeParticleCount++;
                    found = true;
                    break;
                }
            }
            smokeSpawnTimer = spawnInterval;
        }

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        if (_activeParticleCount > 0) {
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
                _activeParticleCount--;
                continue;
            }

            ctx.globalAlpha = p.life * (p.isBurst ? 0.65 : 0.42);
            ctx.drawImage(p.spriteIdx === 0 ? smokeSprite0 : smokeSprite1,
                          p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
        }
        } // end if _activeParticleCount > 0
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();

        ctx.restore();
    },
};
