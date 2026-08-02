/**
 * FFTAnalyzer.js — State-of-the-Art (SOTA) Audio Intelligence Engine
 * =========================================================================
 * A perfectionist, adaptive beat & onset analysis system engineered for high-end visualizers.
 * Conforms to Spotify-inspired Audio Analysis Schema (energy, danceability, valence, moodProfile).
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

// Inter-Onset Interval (IOI) tracking for dynamic BPM & Danceability estimation
const IOI_HISTORY_SIZE = 8;
const ioiHistory = new Float32Array(IOI_HISTORY_SIZE);
let ioiIdx = 0;
let lastOnsetTimestamp = 0;
let estimatedBeatIntervalMs = 500; // Default 120 BPM (500ms / beat)
let ioiVariance = 10000;

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
     * Analyzes raw FFT magnitudes and returns dynamic statistical onset metrics
     * conforming to Spotify-inspired Audio Analysis Schema.
     *
     * @param {Uint8Array} dataArray - Frequency bin magnitude array from AnalyserNode
     * @returns {{
     *   intensity: number,
     *   midIntensity: number,
     *   highIntensity: number,
     *   energy: number,
     *   danceability: number,
     *   valence: number,
     *   moodProfile: string,
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
                energy: 0,
                danceability: 0.5,
                valence: 0.5,
                moodProfile: 'ATMOSPHERIC_VERSE',
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

        // Vocal Formant Zone (Bins 3..23 ~ 350Hz - 4.5kHz)
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

        // ── 2. Spotify Audio Analysis Schema Metrics ──────────────────────────
        // Energy: Overall perceived track energy (0.0 - 1.0)
        const energy = Math.min(1.0, intensity * 0.65 + highIntensity * 0.35);

        // Valence: Tonal brightness vs darkness ratio (0.0 - 1.0)
        const valence = Math.min(1.0, highIntensity / (intensity + highIntensity + 0.001));

        // Danceability: Pulse regularity derived from IOI variance (0.0 - 1.0)
        const danceability = Math.max(0.2, Math.min(1.0, 1.0 - (ioiVariance / 60000)));

        // Mood Profile Classification
        let moodProfile = 'BALANCED_GROOVE';
        if (highIntensity > 0.12 && valence > 0.55) {
            moodProfile = 'BRIGHT_CHIME';
        } else if (intensity > 0.45 && energy > 0.5) {
            moodProfile = 'DEEP_DROP';
        } else if (energy < 0.22) {
            moodProfile = 'ATMOSPHERIC_VERSE';
        }

        // ── 3. Long-Term Energy Window (~5s) & Chorus Section Detector ─────────
        const currentEnergy = energy;
        longEnergyHistory[longIdx] = currentEnergy;
        longIdx = (longIdx + 1) % LONG_WINDOW_SIZE;
        if (longIdx === 0) longFilled = true;

        const validLong = longFilled ? LONG_WINDOW_SIZE : Math.max(longIdx, 1);
        let longSum = 0;
        for (let i = 0; i < validLong; i++) longSum += longEnergyHistory[i];
        const avgLongEnergy = longSum / validLong;

        // Chorus / High-Energy Section Gate
        const isChorusSection = intensity > 0.22 && (currentEnergy >= avgLongEnergy * 1.08 || intensity > 0.48);

        // ── 4. Spectral Flux Calculation (Half-Wave Rectification) ───────────
        let subBassFluxSum = 0;
        for (let i = 0; i <= 2; i++) {
            const diff = dataArray[i] - prevDataArray[i];
            if (diff > 0) subBassFluxSum += diff;
        }
        const subBassFlux = subBassFluxSum / 3 / 255;

        // Ultra-Brilliance Spectral Flux (Vocals 100% Notched Out)
        let ultraHighFluxSum = 0;
        for (let i = 24; i < highEnd; i++) {
            const diff = dataArray[i] - prevDataArray[i];
            if (diff > 0) ultraHighFluxSum += diff;
        }
        const ultraHighFlux = ultraHighFluxSum / countHighBins / 255;

        // ── 5. Rolling History & Dynamic Statistical Distributions (μ + k*σ) ──
        subBassFluxHistory[windowIdx]   = subBassFlux;
        ultraHighFluxHistory[windowIdx] = ultraHighFlux;

        windowIdx = (windowIdx + 1) % WINDOW_SIZE;
        if (windowIdx === 0) windowFilled = true;

        const statsSubBass   = getBufferStats(subBassFluxHistory, windowFilled, windowIdx);
        const statsUltraHigh = getBufferStats(ultraHighFluxHistory, windowFilled, windowIdx);

        // ── 6. Dynamic Anomaly Detection (Adaptive Thresholding) ─────────────
        const subBassThreshold = Math.max(0.06, statsSubBass.mean + 2.8 * statsSubBass.stdDev);
        const subBassOnset     = subBassFlux > subBassThreshold && intensity > 0.28;

        const ultraHighThreshold = Math.max(0.008, statsUltraHigh.mean + 2.6 * statsUltraHigh.stdDev);
        const ultraHighOnset     = ultraHighFlux > ultraHighThreshold && highIntensity > 0.03;

        const climaxSpike = isChorusSection && (subBassOnset || ultraHighOnset);

        // ── 7. Inter-Onset Interval (IOI) & BPM / Danceability Tracking ──────
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
                        // Calculate variance for danceability estimation
                        let varSum = 0;
                        for (let v of validIois) varSum += (v - estimatedBeatIntervalMs) ** 2;
                        ioiVariance = varSum / validIois.length;
                    }
                }
            }
            lastOnsetTimestamp = now;
        }

        prevDataArray.set(dataArray);

        const estimatedBpm = Math.round(60000 / estimatedBeatIntervalMs);

        return {
            intensity,
            midIntensity,
            highIntensity,
            energy,
            danceability,
            valence,
            moodProfile,
            subBassOnset,
            ultraHighOnset,
            isChorusSection,
            climaxSpike,
            estimatedBpm
        };
    },

    /**
     * Calculates phrase-quantized cooldown duration based on current estimated BPM.
     * @returns {number} Cooldown in milliseconds
     */
    getQuantizedCooldownMs() {
        const beatMs = estimatedBeatIntervalMs;
        let quantizedMs = beatMs * 32; // Tối thiểu 32 nhịp (khoảng 16s với bài 120bpm)
        if (quantizedMs < 15000) quantizedMs = beatMs * 64; 
        
        // Cố định giới hạn từ 15 đến 30 giây để tránh tình trạng climax liên tục gây nhàm chán
        return Math.min(Math.max(quantizedMs, 15000), 30000);
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
        ioiVariance = 10000;
        prevDataArray = null;
    },
};
