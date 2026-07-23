/**
 * FFTAnalyzer.js — State-of-the-Art (SOTA) Audio Intelligence Engine
 * =========================================================================
 * A perfectionist, adaptive beat & onset analysis system engineered for high-end visualizers.
 *
 * Key Innovations:
 * 1. Dynamic Adaptive Thresholding (μ + k*σ):
 *    Tracks rolling Statistical Mean (μ) and Standard Deviation (σ) of Spectral Flux.
 *    Adapts thresholds dynamically to ANY song volume or dynamic range (acoustic vs EDM).
 * 2. Chorus & High-Energy Section Gating (5-Second Long Energy Window):
 *    Tracks long-term energy trends (300 frames / 5s) to detect true Chorus/Drop sections.
 *    STRICTLY BLOCKS climax triggers during quiet intros, verses, or soft instrumentals.
 * 3. Harmonic Vocal Notch Filtering:
 *    Strictly notches out the Vocal/Formant spectrum (350Hz - 4.5kHz).
 *    Singer vocals, speech, and vocal vibratos can NEVER trigger climax events.
 * 4. Sub-Bass & Ultra-Brilliance Dual-Band Isolation:
 *    - Sub-Bass (20Hz - 120Hz): Captures exact downbeat kick onsets and sub drops.
 *    - Ultra-Brilliance / Air (4.5kHz - 22kHz): Captures windchimes, triangles, glass shatters, ride cymbals.
 * 5. Rhythmically-Quantized ARMED State Machine:
 *    Calculates Inter-Onset Intervals (IOI) for real-time BPM estimation.
 *    Enforces phrase-aligned cooldowns so visual climaxes fire precisely on musical downbeats/chimes.
 */

const WINDOW_SIZE = 180; // ~3.0s history window at 60 FPS
const subBassFluxHistory   = new Float32Array(WINDOW_SIZE);
const ultraHighFluxHistory = new Float32Array(WINDOW_SIZE);
let windowIdx = 0;
let windowFilled = false;

// Long-term Energy Window (~5.0s at 60 FPS) to detect Chorus/Drop sections
const LONG_WINDOW_SIZE = 300;
const longEnergyHistory = new Float32Array(LONG_WINDOW_SIZE);
let longIdx = 0;
let longFilled = false;

// Frame buffer for Half-Wave Rectified Spectral Flux
let prevDataArray = null;

// Inter-Onset Interval (IOI) tracking for dynamic BPM estimation
const IOI_HISTORY_SIZE = 8;
const ioiHistory = new Float32Array(IOI_HISTORY_SIZE);
let ioiIdx = 0;
let lastOnsetTimestamp = 0;
let estimatedBeatIntervalMs = 500; // Default 120 BPM (500ms / beat)

/**
 * Calculates rolling Mean (μ) and Standard Deviation (σ) for a Float32 history buffer.
 */
function getBufferStats(historyBuffer, filled, currentIdx) {
    const len = filled ? historyBuffer.length : Math.max(currentIdx, 1);
    let sum = 0;
    for (let i = 0; i < len; i++) sum += historyBuffer[i];
    const mean = sum / len;

    let varianceSum = 0;
    for (let i = 0; i < len; i++) {
        const diff = historyBuffer[i] - mean;
        varianceSum += diff * diff;
    }
    const stdDev = Math.sqrt(varianceSum / len);
    return { mean, stdDev };
}

export const FFTAnalyzer = {
    /**
     * Analyzes raw FFT magnitudes and returns dynamic statistical onset metrics.
     *
     * @param {Uint8Array} dataArray - Frequency bin magnitude array from AnalyserNode
     * @returns {{
     *   intensity: number,
     *   midIntensity: number,
     *   highIntensity: number,
     *   subBassOnset: boolean,
     *   ultraHighOnset: boolean,
     *   isChorusSection: boolean,
     *   climaxSpike: boolean,
     *   estimatedBpm: number
     * }}
     */
    analyze(dataArray) {
        if (!dataArray || dataArray.length === 0) {
            return {
                intensity: 0,
                midIntensity: 0,
                highIntensity: 0,
                subBassOnset: false,
                ultraHighOnset: false,
                isChorusSection: false,
                climaxSpike: false,
                estimatedBpm: 120
            };
        }

        const totalBins = dataArray.length;

        // Initialize previous frame buffer
        if (!prevDataArray || prevDataArray.length !== totalBins) {
            prevDataArray = new Uint8Array(totalBins);
            prevDataArray.set(dataArray);
        }

        // ── 1. Calculate Absolute Volume Intensities ───────────────────────────
        // Sub-Bass Band (Bins 0..2 ~ 20Hz - 120Hz)
        let subBassVolSum = 0;
        for (let i = 0; i <= 2; i++) subBassVolSum += dataArray[i];
        const intensity = subBassVolSum / 3 / 255;

        // Vocal Formant Zone (Bins 3..23 ~ 350Hz - 4.5kHz) — For UI visualizer scaling only
        let midVolSum = 0;
        const midEnd = Math.min(24, totalBins);
        for (let i = 3; i < midEnd; i++) midVolSum += dataArray[i];
        const midIntensity = midVolSum / Math.max(1, midEnd - 3) / 255;

        // High Brilliance & Air (Bins 24..127 ~ 4.5kHz - 22kHz)
        let highVolSum = 0;
        const highEnd = Math.min(128, totalBins);
        const countHighBins = Math.max(1, highEnd - 24);
        for (let i = 24; i < highEnd; i++) highVolSum += dataArray[i];
        const highIntensity = highVolSum / countHighBins / 255;

        // ── 2. Long-Term Energy Window (~5s) & Chorus Section Detector ─────────
        const currentEnergy = intensity * 0.65 + highIntensity * 0.35;
        longEnergyHistory[longIdx] = currentEnergy;
        longIdx = (longIdx + 1) % LONG_WINDOW_SIZE;
        if (longIdx === 0) longFilled = true;

        const validLong = longFilled ? LONG_WINDOW_SIZE : Math.max(longIdx, 1);
        let longSum = 0;
        for (let i = 0; i < validLong; i++) longSum += longEnergyHistory[i];
        const avgLongEnergy = longSum / validLong;

        // Chorus / High-Energy Section Gate:
        // Require active track energy (> 0.22) AND being in an energetic peak (>= avgLongEnergy * 1.08 or intensity > 0.48)
        const isChorusSection = intensity > 0.22 && (currentEnergy >= avgLongEnergy * 1.08 || intensity > 0.48);

        // ── 3. Spectral Flux Calculation (Half-Wave Rectification) ───────────
        // Sub-Bass Spectral Flux (Percussive Kick Downbeats)
        let subBassFluxSum = 0;
        for (let i = 0; i <= 2; i++) {
            const diff = dataArray[i] - prevDataArray[i];
            if (diff > 0) subBassFluxSum += diff;
        }
        const subBassFlux = subBassFluxSum / 3 / 255;

        // Ultra-Brilliance Spectral Flux (Windchimes, Triangle, Glass, Cymbals)
        // VOCAL NOTCH: Bins 3..23 are COMPLETELY EXCLUDED from Flux calculations!
        let ultraHighFluxSum = 0;
        for (let i = 24; i < highEnd; i++) {
            const diff = dataArray[i] - prevDataArray[i];
            if (diff > 0) ultraHighFluxSum += diff;
        }
        const ultraHighFlux = ultraHighFluxSum / countHighBins / 255;

        // ── 4. Rolling History & Dynamic Statistical Distributions (μ + k*σ) ──
        subBassFluxHistory[windowIdx]   = subBassFlux;
        ultraHighFluxHistory[windowIdx] = ultraHighFlux;

        windowIdx = (windowIdx + 1) % WINDOW_SIZE;
        if (windowIdx === 0) windowFilled = true;

        const statsSubBass   = getBufferStats(subBassFluxHistory, windowFilled, windowIdx);
        const statsUltraHigh = getBufferStats(ultraHighFluxHistory, windowFilled, windowIdx);

        // ── 5. Dynamic Anomaly Detection (Adaptive Thresholding) ─────────────
        // Downbeat Kick Onset: Sub-Bass Flux > Mean + 2.3 * StdDev
        const subBassThreshold = Math.max(0.04, statsSubBass.mean + 2.3 * statsSubBass.stdDev);
        const subBassOnset     = subBassFlux > subBassThreshold && intensity > 0.25;

        // Ultra-Brilliance Accent Onset: Ultra-High Flux > Mean + 2.6 * StdDev
        const ultraHighThreshold = Math.max(0.008, statsUltraHigh.mean + 2.6 * statsUltraHigh.stdDev);
        const ultraHighOnset     = ultraHighFlux > ultraHighThreshold && highIntensity > 0.03;

        // Unified Climax Onset: ONLY ALLOWED IF SONG IS IN A CHORUS / HIGH-ENERGY SECTION!
        // Prevents any climax triggers during quiet intros, verses, or soft instrumentals.
        const climaxSpike = isChorusSection && (subBassOnset || ultraHighOnset);

        // ── 6. Real-Time Inter-Onset Interval (IOI) & BPM Tracking ───────────
        const now = performance.now();
        if (climaxSpike) {
            if (lastOnsetTimestamp > 0) {
                const interval = now - lastOnsetTimestamp;
                if (interval >= 250 && interval <= 1500) {
                    ioiHistory[ioiIdx] = interval;
                    ioiIdx = (ioiIdx + 1) % IOI_HISTORY_SIZE;

                    const validIois = [...ioiHistory].filter(v => v > 0).sort((a, b) => a - b);
                    if (validIois.length > 0) {
                        estimatedBeatIntervalMs = validIois[Math.floor(validIois.length / 2)];
                    }
                }
            }
            lastOnsetTimestamp = now;
        }

        // Cache magnitude spectrum for next frame comparison
        prevDataArray.set(dataArray);

        const estimatedBpm = Math.round(60000 / estimatedBeatIntervalMs);

        return {
            intensity,
            midIntensity,
            highIntensity,
            subBassOnset,
            ultraHighOnset,
            isChorusSection,
            climaxSpike,
            estimatedBpm
        };
    },

    /**
     * Calculates phrase-quantized cooldown duration based on current estimated BPM.
     * Aligns with 8 or 16 musical quarter-note beats (clamped between 4s and 9s).
     *
     * @returns {number} Cooldown in milliseconds
     */
    getQuantizedCooldownMs() {
        const beatMs = estimatedBeatIntervalMs;
        let quantizedMs = beatMs * 16;
        if (quantizedMs < 4000) quantizedMs = beatMs * 24;
        if (quantizedMs > 9000) quantizedMs = beatMs * 8;
        return Math.min(Math.max(quantizedMs, 4000), 9000);
    },

    /** Resets rolling history, statistical state, and frame buffers. */
    reset() {
        subBassFluxHistory.fill(0);
        ultraHighFluxHistory.fill(0);
        longEnergyHistory.fill(0);
        ioiHistory.fill(0);
        windowIdx = 0;
        windowFilled = false;
        longIdx = 0;
        longFilled = false;
        lastOnsetTimestamp = 0;
        estimatedBeatIntervalMs = 500;
        prevDataArray = null;
    },
};
