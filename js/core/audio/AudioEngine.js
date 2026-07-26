/**
 * AudioEngine.js
 * Manages the Web Audio API graph: AudioContext, EQ nodes, AnalyserNode, AudioWorkletNode, and MediaElementSource.
 */

let audioCtx = null;
let analyser = null;
let dataArray = null;
let eqNodes = [];
let workletNode = null;
let audioThreadMetrics = { rmsPower: 0, audioTime: 0 };

export const AudioEngine = {
    /**
     * Initializes (or resumes) the AudioContext, wires EQ nodes, AudioWorklet, and AnalyserNode.
     * Must be called on first user interaction to satisfy browser autoplay policy.
     * @param {HTMLAudioElement} audioElement - The <audio> element to source from.
     */
    init(audioElement) {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaElementSource(audioElement);

            // Create 5-band EQ (frequencies: 60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz)
            const freqs = [60, 230, 910, 3600, 14000];
            const sliders = document.querySelectorAll('.eq-slider');
            eqNodes = freqs.map((freq, idx) => {
                const node = audioCtx.createBiquadFilter();
                node.type = 'peaking';
                node.frequency.value = freq;
                node.Q.value = 1;
                const initialGain = sliders[idx] ? parseFloat(sliders[idx].value) : 0;
                node.gain.value = initialGain;
                return node;
            });

            // Connect: source -> eq0 -> eq1 -> eq2 -> eq3 -> eq4 -> analyser -> destination
            source.connect(eqNodes[0]);
            for (let i = 0; i < eqNodes.length - 1; i++) {
                eqNodes[i].connect(eqNodes[i + 1]);
            }
            eqNodes[eqNodes.length - 1].connect(analyser);
            analyser.connect(audioCtx.destination);

            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);

            // Wire AudioWorklet Processor on the dedicated audio thread
            if (audioCtx.audioWorklet) {
                audioCtx.audioWorklet.addModule('js/core/audio/AudioAnalysisWorklet.js')
                    .then(() => {
                        workletNode = new AudioWorkletNode(audioCtx, 'audio-analysis-processor');
                        workletNode.port.onmessage = (event) => {
                            if (event.data && event.data.type === 'AUDIO_THREAD_METRICS') {
                                audioThreadMetrics = event.data;
                            }
                        };
                        eqNodes[eqNodes.length - 1].disconnect(analyser);
                        eqNodes[eqNodes.length - 1].connect(workletNode);
                        workletNode.connect(analyser);
                    })
                    .catch((err) => {
                        // Silent fallback to AnalyserNode if Worklets are restricted
                        console.warn('AudioWorklet notice (using fallback analyser):', err.message);
                    });
            }
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    },

    /**
     * Fills and returns the current frequency data array.
     * @returns {Uint8Array|null} 128-element frequency data, or null if not initialised.
     */
    getByteFrequencyData() {
        if (!analyser || !dataArray) return null;
        analyser.getByteFrequencyData(dataArray);
        return dataArray;
    },

    /** @returns {AnalyserNode|null} */
    getAnalyser() {
        return analyser;
    },

    /** @returns {AudioContext|null} */
    getAudioContext() {
        return audioCtx;
    },

    /** @returns {{ rmsPower: number, audioTime: number }} Real-time metrics from audio thread */
    getAudioThreadMetrics() {
        return audioThreadMetrics;
    },

    /**
     * Sets the gain value of a specific EQ band.
     * @param {number} bandIndex - Index 0–4
     * @param {number} gainValue - dB value
     */
    setEQGain(bandIndex, gainValue) {
        if (eqNodes[bandIndex]) {
            eqNodes[bandIndex].gain.value = gainValue;
        }
    },

    /** @returns {BiquadFilterNode[]} All 5 EQ band nodes. */
    getEQNodes() {
        return eqNodes;
    },
};
