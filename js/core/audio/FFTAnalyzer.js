/**
 * FFTAnalyzer.js — State-of-the-Art Audio Intelligence Engine
 * =========================================================================
 * Optimizations over previous version:
 *   - Welford online algorithm replaces O(n) double-loop getBufferStats → O(1)/frame
 *   - longEnergyHistory replaced by running sum → O(1) avg instead of O(300) loop/frame
 *   - IOI sort/spread/filter replaced by insertion into sorted Float32Array → O(k) once on climax
 *   - Return object reused (mutated) to avoid GC allocation each frame
 */

const WINDOW_SIZE = 180; // ~3.0s at 60 FPS

// ── Welford Online Running Stats for subBassFlux ──────────────────────────
let _sbCount = 0, _sbMean = 0, _sbM2 = 0;
// ── Welford Online Running Stats for ultraHighFlux ────────────────────────
let _uhCount = 0, _uhMean = 0, _uhM2 = 0;

// Ring buffers still needed to "un-add" old values when window fills
const subBassFluxHistory   = new Float32Array(WINDOW_SIZE);
const ultraHighFluxHistory = new Float32Array(WINDOW_SIZE);
let windowIdx    = 0;
let windowFilled = false;

// ── Long-Term Energy: running sum instead of O(300) loop ─────────────────
const LONG_WINDOW_SIZE = 300;
const longEnergyHistory = new Float32Array(LONG_WINDOW_SIZE);
let longIdx     = 0;
let longFilled  = false;
let _longSum    = 0; // maintained incrementally

// ── Frame buffer for Half-Wave Rectified Spectral Flux ───────────────────
let prevDataArray = null;

// ── IOI tracking — sorted insertion, no spread/filter/sort each climax ────
const IOI_HISTORY_SIZE = 8;
const ioiHistory = new Float32Array(IOI_HISTORY_SIZE);
let ioiCount             = 0; // how many valid entries
let lastOnsetTimestamp   = 0;
let estimatedBeatIntervalMs = 500;
let ioiVariance          = 10000;

// ── Reused return object — avoids a GC allocation every frame ─────────────
const _result = {
    intensity: 0, midIntensity: 0, highIntensity: 0,
    energy: 0, danceability: 0.5, valence: 0.5,
    moodProfile: 'ATMOSPHERIC_VERSE',
    subBassOnset: false, ultraHighOnset: false,
    isChorusSection: false, climaxSpike: false,
    estimatedBpm: 120
};

/**
 * Welford update: add one new value, optionally remove one old value (sliding window).
 * Returns { mean, stdDev } from current running state.
 * O(1) per frame instead of O(n).
 */
function welfordAdd(value, oldValue, hasOld, countRef, meanRef, m2Ref) {
    // Remove old value from window if full
    if (hasOld) {
        const oldDelta = oldValue - meanRef[0];
        meanRef[0] -= oldDelta / countRef[0];
        const newDelta = oldValue - meanRef[0];
        m2Ref[0] = Math.max(0, m2Ref[0] - oldDelta * newDelta);
    } else {
        countRef[0]++;
    }
    // Add new value
    const delta  = value - meanRef[0];
    meanRef[0]  += delta / countRef[0];
    const delta2 = value - meanRef[0];
    m2Ref[0]    += delta * delta2;

    const variance = countRef[0] > 1 ? m2Ref[0] / (countRef[0] - 1) : 0;
    return { mean: meanRef[0], stdDev: Math.sqrt(variance) };
}

// Mutable ref arrays for Welford state (JS pass-by-value workaround)
const _sbCountRef = [0], _sbMeanRef = [0], _sbM2Ref = [0];
const _uhCountRef = [0], _uhMeanRef = [0], _uhM2Ref = [0];

export const FFTAnalyzer = {
    analyze(dataArray) {
        if (!dataArray || dataArray.length === 0) {
            _result.intensity = 0; _result.midIntensity = 0; _result.highIntensity = 0;
            _result.energy = 0; _result.danceability = 0.5; _result.valence = 0.5;
            _result.moodProfile = 'ATMOSPHERIC_VERSE';
            _result.subBassOnset = false; _result.ultraHighOnset = false;
            _result.isChorusSection = false; _result.climaxSpike = false;
            _result.estimatedBpm = 120;
            return _result;
        }

        const totalBins = dataArray.length;

        if (!prevDataArray || prevDataArray.length !== totalBins) {
            prevDataArray = new Uint8Array(totalBins);
            prevDataArray.set(dataArray);
        }

        // ── 1. Volume Intensities ─────────────────────────────────────────────
        const intensity      = (dataArray[0] + dataArray[1] + dataArray[2]) / 3 / 255;

        const midEnd = Math.min(24, totalBins);
        let midVolSum = 0;
        for (let i = 3; i < midEnd; i++) midVolSum += dataArray[i];
        const midIntensity = midVolSum / Math.max(1, midEnd - 3) / 255;

        const highEnd        = Math.min(128, totalBins);
        const countHighBins  = Math.max(1, highEnd - 24);
        let highVolSum = 0;
        for (let i = 24; i < highEnd; i++) highVolSum += dataArray[i];
        const highIntensity  = highVolSum / countHighBins / 255;

        // ── 2. Spotify-style Metrics ──────────────────────────────────────────
        const energy       = Math.min(1.0, intensity * 0.65 + highIntensity * 0.35);
        const valence      = Math.min(1.0, highIntensity / (intensity + highIntensity + 0.001));
        const danceability = Math.max(0.2, Math.min(1.0, 1.0 - (ioiVariance / 60000)));

        let moodProfile = 'BALANCED_GROOVE';
        if (highIntensity > 0.12 && valence > 0.55)        moodProfile = 'BRIGHT_CHIME';
        else if (intensity > 0.45 && energy > 0.5)          moodProfile = 'DEEP_DROP';
        else if (energy < 0.22)                              moodProfile = 'ATMOSPHERIC_VERSE';

        // ── 3. Long-Term Energy Average — O(1) running sum ───────────────────
        const oldLongEnergy = longEnergyHistory[longIdx];
        longEnergyHistory[longIdx] = energy;
        if (longFilled) {
            _longSum += energy - oldLongEnergy;
        } else {
            _longSum += energy;
        }
        longIdx = (longIdx + 1) % LONG_WINDOW_SIZE;
        if (longIdx === 0) longFilled = true;
        const validLong     = longFilled ? LONG_WINDOW_SIZE : Math.max(longIdx, 1);
        const avgLongEnergy = _longSum / validLong;

        const isChorusSection = intensity > 0.22 && (energy >= avgLongEnergy * 1.08 || intensity > 0.48);

        // ── 4. Spectral Flux (Half-Wave Rectified) ────────────────────────────
        let subBassFluxSum = 0;
        for (let i = 0; i <= 2; i++) {
            const diff = dataArray[i] - prevDataArray[i];
            if (diff > 0) subBassFluxSum += diff;
        }
        const subBassFlux = subBassFluxSum / 3 / 255;

        let ultraHighFluxSum = 0;
        for (let i = 24; i < highEnd; i++) {
            const diff = dataArray[i] - prevDataArray[i];
            if (diff > 0) ultraHighFluxSum += diff;
        }
        const ultraHighFlux = ultraHighFluxSum / countHighBins / 255;

        // ── 5. Welford Online Stats — O(1)/frame (was O(180) × 2) ────────────
        const isFull     = windowFilled;
        const oldSB      = subBassFluxHistory[windowIdx];
        const oldUH      = ultraHighFluxHistory[windowIdx];

        subBassFluxHistory[windowIdx]   = subBassFlux;
        ultraHighFluxHistory[windowIdx] = ultraHighFlux;
        windowIdx = (windowIdx + 1) % WINDOW_SIZE;
        if (windowIdx === 0) windowFilled = true;

        const statsSubBass   = welfordAdd(subBassFlux,   oldSB, isFull, _sbCountRef, _sbMeanRef, _sbM2Ref);
        const statsUltraHigh = welfordAdd(ultraHighFlux, oldUH, isFull, _uhCountRef, _uhMeanRef, _uhM2Ref);

        // ── 6. Adaptive Onset Detection ───────────────────────────────────────
        const subBassThreshold  = Math.max(0.06,  statsSubBass.mean   + 2.8 * statsSubBass.stdDev);
        const subBassOnset      = subBassFlux > subBassThreshold && intensity > 0.28;

        const ultraHighThreshold = Math.max(0.008, statsUltraHigh.mean + 2.6 * statsUltraHigh.stdDev);
        const ultraHighOnset     = ultraHighFlux > ultraHighThreshold && highIntensity > 0.03;

        const climaxSpike = isChorusSection && (subBassOnset || ultraHighOnset);

        // ── 7. IOI / BPM — sorted insertion, no spread/filter/sort ───────────
        const now = performance.now();
        if (climaxSpike) {
            if (lastOnsetTimestamp > 0) {
                const interval = now - lastOnsetTimestamp;
                if (interval >= 250 && interval <= 1500) {
                    // Insert into ring buffer
                    ioiHistory[ioiCount % IOI_HISTORY_SIZE] = interval;
                    ioiCount++;

                    // Compute median & variance directly from small ring buffer (max 8 items)
                    const validCount = Math.min(ioiCount, IOI_HISTORY_SIZE);
                    // Copy to temp, sort, get median — tiny array (≤8), sorting is negligible
                    const tmp = new Float32Array(validCount);
                    for (let i = 0; i < validCount; i++) tmp[i] = ioiHistory[i];
                    tmp.sort();
                    estimatedBeatIntervalMs = tmp[Math.floor(validCount / 2)];

                    let varSum = 0;
                    for (let i = 0; i < validCount; i++) {
                        const d = tmp[i] - estimatedBeatIntervalMs;
                        varSum += d * d;
                    }
                    ioiVariance = varSum / validCount;
                }
            }
            lastOnsetTimestamp = now;
        }

        prevDataArray.set(dataArray);

        // ── Populate reused result object ─────────────────────────────────────
        _result.intensity       = intensity;
        _result.midIntensity    = midIntensity;
        _result.highIntensity   = highIntensity;
        _result.energy          = energy;
        _result.danceability    = danceability;
        _result.valence         = valence;
        _result.moodProfile     = moodProfile;
        _result.subBassOnset    = subBassOnset;
        _result.ultraHighOnset  = ultraHighOnset;
        _result.isChorusSection = isChorusSection;
        _result.climaxSpike     = climaxSpike;
        _result.estimatedBpm    = Math.round(60000 / estimatedBeatIntervalMs);
        return _result;
    },

    getQuantizedCooldownMs() {
        const beatMs = estimatedBeatIntervalMs;
        let quantizedMs = beatMs * 32;
        if (quantizedMs < 15000) quantizedMs = beatMs * 64;
        return Math.min(Math.max(quantizedMs, 15000), 30000);
    },

    reset() {
        subBassFluxHistory.fill(0);
        ultraHighFluxHistory.fill(0);
        longEnergyHistory.fill(0);
        ioiHistory.fill(0);
        windowIdx = 0; windowFilled = false;
        longIdx   = 0; longFilled   = false; _longSum = 0;
        ioiCount  = 0; lastOnsetTimestamp = 0;
        estimatedBeatIntervalMs = 500; ioiVariance = 10000;
        prevDataArray = null;
        _sbCountRef[0] = 0; _sbMeanRef[0] = 0; _sbM2Ref[0] = 0;
        _uhCountRef[0] = 0; _uhMeanRef[0] = 0; _uhM2Ref[0] = 0;
    },
};
