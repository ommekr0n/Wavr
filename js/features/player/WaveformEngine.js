/**
 * WaveformEngine.js
 * Real-audio waveform decoding and mini-player canvas rendering.
 */

const waveformCtx   = new (window.AudioContext || window.webkitAudioContext)();
const waveformCache = new Map();
let currentWaveformData = null;
let currentWaveformUrl  = null;

// Keep a reference to the audio element (set by init)
let _audio = null;

export function initWaveform(audioEl) {
    _audio = audioEl;
}

export function clearWaveformCache() {
    waveformCache.clear();
}

export async function loadAndDecodeWaveform(url) {
    if (!url) return;
    currentWaveformUrl = url;

    if (waveformCache.has(url)) {
        currentWaveformData = waveformCache.get(url);
        const pct = (!_audio || isNaN(_audio.duration)) ? 0 : (_audio.currentTime / _audio.duration) * 100;
        drawMiniWaveform(pct);
        return;
    }

    // Placeholder while decoding
    currentWaveformData = Array.from({ length: 140 }, (_, i) => 0.15 + Math.abs(Math.sin(i * 0.08)) * 0.15);
    drawMiniWaveform(0);

    try {
        const response    = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await waveformCtx.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);
        const totalSamples = channelData.length;
        const numBars  = 140;
        const blockSize = Math.floor(totalSamples / numBars);
        const step      = Math.max(1, Math.floor(blockSize / 24));

        const points = [];
        let maxVal   = 0;

        for (let i = 0; i < numBars; i++) {
            let peak = 0, sumSq = 0, count = 0;
            const start = i * blockSize;
            const end   = start + blockSize;
            for (let j = start; j < end; j += step) {
                const val = Math.abs(channelData[j] || 0);
                if (val > peak) peak = val;
                sumSq += val * val;
                count++;
            }
            const rms      = count > 0 ? Math.sqrt(sumSq / count) : 0;
            const combined = peak * 0.75 + rms * 0.25;
            points.push(combined);
            if (combined > maxVal) maxVal = combined;
        }

        const normalizedPoints = points.map(p => {
            if (maxVal === 0) return 0.12;
            return 0.1 + Math.pow(p / maxVal, 0.75) * 0.9;
        });

        waveformCache.set(url, normalizedPoints);
        if (currentWaveformUrl === url) {
            currentWaveformData = normalizedPoints;
            const pct = (!_audio || isNaN(_audio.duration)) ? 0 : (_audio.currentTime / _audio.duration) * 100;
            drawMiniWaveform(pct);
        }
    } catch (err) {
        console.warn('Waveform decoding failed, using dynamic fallback:', err);
        const fallback = Array.from({ length: 140 }, (_, i) =>
            0.15 + Math.abs(Math.sin(i * 0.15) * Math.cos(i * 0.05)) * 0.7
        );
        waveformCache.set(url, fallback);
        if (currentWaveformUrl === url) {
            currentWaveformData = fallback;
            const pct = (!_audio || isNaN(_audio.duration)) ? 0 : (_audio.currentTime / _audio.duration) * 100;
            drawMiniWaveform(pct);
        }
    }
}

let cachedCanvasWidth = 0;
let cachedCanvasHeight = 0;
let cachedAccentColor = '#00e5ff';
let lastAccentCheckTime = 0;

export function drawMiniWaveform(percent) {
    const canvas = document.getElementById('mini-waveform-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (!cachedCanvasWidth || canvas.width !== cachedCanvasWidth) {
        const targetW = Math.max(300, Math.floor(canvas.offsetWidth || 500));
        const targetH = Math.max(36,  Math.floor(canvas.offsetHeight || 48));
        canvas.width  = targetW;
        canvas.height = targetH;
        cachedCanvasWidth = targetW;
        cachedCanvasHeight = targetH;
    }

    const w = cachedCanvasWidth, h = cachedCanvasHeight;
    ctx.clearRect(0, 0, w, h);
    if (!currentWaveformData || w === 0 || h === 0) return;

    const numBars  = currentWaveformData.length;
    const gap      = 1.2;
    const barWidth = (w - (numBars - 1) * gap) / numBars;
    const centerY  = h * 0.5;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < numBars; i++) {
        const factor = currentWaveformData[i];
        const x      = i * (barWidth + gap);
        const mainH  = Math.max(3, factor * h * 0.44);
        ctx.beginPath(); ctx.roundRect(x, centerY - mainH, barWidth, mainH, 1.0); ctx.fill();
        const reflH  = Math.max(1, factor * h * 0.22);
        ctx.beginPath(); ctx.roundRect(x, centerY + 1.5, barWidth, reflH, 0.8); ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 0, w, h);

    const progressWidth = (percent / 100) * w;
    if (progressWidth > 0) {
        const now = performance.now();
        if (now - lastAccentCheckTime > 2000) {
            lastAccentCheckTime = now;
            cachedAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#00e5ff';
        }
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, cachedAccentColor);
        grad.addColorStop(1, '#a855f7');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, progressWidth, h);
    }

    ctx.restore();
}
