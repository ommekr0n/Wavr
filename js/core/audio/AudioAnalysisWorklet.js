/**
 * AudioAnalysisWorklet.js — High-Performance Audio Thread Processor
 * =========================================================================
 * Runs in the browser's dedicated high-priority Audio Thread (AudioWorklet).
 * Offloads real-time PCM audio power calculations and hardware timing from the main UI thread.
 */

class AudioAnalysisWorkletProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sampleCounter = 0;
        this.lastReportTime = 0;
    }

    /**
     * Processes 128 Float32 PCM audio samples per quantum frame directly on the audio thread.
     */
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        if (input && input.length > 0) {
            const channel = input[0];
            const numSamples = channel.length;

            // Pass-through audio signal to output destination
            if (output && output.length > 0 && output[0]) {
                output[0].set(channel);
            }

            // Calculate Root Mean Square (RMS) audio power on the hardware thread
            let pcmPowerSum = 0;
            for (let i = 0; i < numSamples; i++) {
                const sample = channel[i];
                pcmPowerSum += sample * sample;
            }
            const rmsPower = Math.sqrt(pcmPowerSum / numSamples);

            this.sampleCounter += numSamples;

            // Report high-precision audio thread metrics to main thread every ~16ms (~1 frame)
            if (currentTime - this.lastReportTime >= 0.016) {
                this.lastReportTime = currentTime;
                this.port.postMessage({
                    type: 'AUDIO_THREAD_METRICS',
                    rmsPower: rmsPower,
                    audioTime: currentTime
                });
            }
        }

        return true;
    }
}

registerProcessor('audio-analysis-processor', AudioAnalysisWorkletProcessor);
