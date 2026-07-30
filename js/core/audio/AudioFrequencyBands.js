/**
 * AudioFrequencyBands.js
 * Analyzes FFT frequency spectrum into 3 distinct bands:
 * - Sub-Bass / Kick (20Hz - 140Hz)
 * - Mid / Vocal (300Hz - 3kHz)
 * - High / Treble (4kHz - 16kHz)
 */

export function analyzeFrequencyBands(dataArray) {
    if (!dataArray || dataArray.length === 0) {
        return { bass: 0, mid: 0, treble: 0, overall: 0 };
    }

    const totalBins = dataArray.length;
    // Standard 128/256 bin mapping assumptions
    const bassEndBin   = Math.max(2, Math.floor(totalBins * 0.10));
    const midEndBin    = Math.max(bassEndBin + 1, Math.floor(totalBins * 0.45));
    const trebleEndBin = Math.min(totalBins, Math.floor(totalBins * 0.90));

    let bassSum = 0, bassCount = 0;
    for (let i = 0; i < bassEndBin; i++) {
        bassSum += dataArray[i];
        bassCount++;
    }

    let midSum = 0, midCount = 0;
    for (let i = bassEndBin; i < midEndBin; i++) {
        midSum += dataArray[i];
        midCount++;
    }

    let trebleSum = 0, trebleCount = 0;
    for (let i = midEndBin; i < trebleEndBin; i++) {
        trebleSum += dataArray[i];
        trebleCount++;
    }

    const bass = bassCount > 0 ? (bassSum / bassCount) / 255 : 0;
    const mid = midCount > 0 ? (midSum / midCount) / 255 : 0;
    const treble = trebleCount > 0 ? (trebleSum / trebleCount) / 255 : 0;
    const overall = (bass * 0.5) + (mid * 0.3) + (treble * 0.2);

    return { bass, mid, treble, overall };
}
