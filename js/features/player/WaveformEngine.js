/** Real-audio waveforms loaded on demand, with one decode slot and reusable derived peaks. */
import { WaveformLoader, WAVEFORM_BARS } from './WaveformLoader.js';
import { WaveformStore } from './WaveformStore.js';
import { resolveMediaUrl } from '../vault/MediaUrlAccess.js';

let waveformCtx = null, currentWaveformData = null, selection = 0;
let _audio = null, visibilityObserver = null;
const loader = new WaveformLoader({
    store: new WaveformStore(),
    fetchAudio: async (url, signal) => {
        const freshUrl = await resolveMediaUrl(url);
        const response = await fetch(freshUrl, { signal });
        if (!response.ok) throw new Error(`Waveform request failed (${response.status})`);
        return response.arrayBuffer();
    },
    decode: buffer => {
        waveformCtx ||= new (window.AudioContext || window.webkitAudioContext)();
        return waveformCtx.decodeAudioData(buffer);
    },
    onError: error => console.warn('Waveform unavailable, using placeholder:', error)
});
const placeholder = Array.from({ length: WAVEFORM_BARS }, (_, i) => .15 + Math.abs(Math.sin(i * .08)) * .15);

export function initWaveform(audioEl) {
    _audio = audioEl;
    visibilityObserver?.disconnect();
    visibilityObserver = new MutationObserver(() => drawMiniWaveform(waveformPercent()));
    const miniPlayer = document.getElementById('mini-player');
    if (miniPlayer) visibilityObserver.observe(miniPlayer, { attributes: true, attributeFilter: ['class'] });
}

function waveformPercent() {
    return _audio && Number.isFinite(_audio.duration) && _audio.duration > 0 ? _audio.currentTime / _audio.duration * 100 : 0;
}

export function clearWaveformCache() {
    selection++; currentWaveformData = null;
    return loader.clear();
}

export async function loadAndDecodeWaveform(url) {
    const ticket = ++selection;
    currentWaveformData = url ? placeholder : null;
    drawMiniWaveform(0);
    const points = await loader.load(url);
    if (ticket !== selection || !points) return;
    currentWaveformData = points;
    drawMiniWaveform(waveformPercent());
}

let cachedCanvasWidth = 0;
let cachedCanvasHeight = 0;
let cachedAccentColor = '#00e5ff';
let lastAccentCheckTime = 0;

export function drawMiniWaveform(percent) {
    const canvas = document.getElementById('mini-waveform-canvas');
    if (!canvas || document.hidden || document.getElementById('mini-player')?.classList.contains('hidden')) return;
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
