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

        if (input && input.length > 0 && output && output.length > 0) {
            const numChannels = Math.min(input.length, output.length);
            let pcmPowerSum = 0;
            let totalSamples = 0;

            // Pass-through ALL channels (Left + Right stereo) to output
            for (let c = 0; c < numChannels; c++) {
                const inChannel = input[c];
                const outChannel = output[c];
                if (inChannel && outChannel) {
                    outChannel.set(inChannel);
                    const len = inChannel.length;
                    for (let i = 0; i < len; i++) {
                        const sample = inChannel[i];
                        pcmPowerSum += sample * sample;
                    }
                    totalSamples += len;
                }
            }

            const rmsPower = totalSamples > 0 ? Math.sqrt(pcmPowerSum / totalSamples) : 0;
            this.sampleCounter += (input[0] ? input[0].length : 0);

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
