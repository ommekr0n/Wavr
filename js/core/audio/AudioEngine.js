import workletUrl from './AudioAnalysisWorklet.js?url';

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
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            try {
                const nextAnalyser = ctx.createAnalyser();
                const source = ctx.createMediaElementSource(audioElement);

                // Create 5-band EQ (frequencies: 60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz)
                const freqs = [60, 230, 910, 3600, 14000];
                const sliders = typeof document !== 'undefined' ? document.querySelectorAll('.eq-slider') : [];
                const nextEqNodes = freqs.map((freq, idx) => {
                    const node = ctx.createBiquadFilter();
                    node.type = 'peaking';
                    node.frequency.value = freq;
                    node.Q.value = 1;
                    const initialGain = sliders[idx] ? parseFloat(sliders[idx].value) : 0;
                    node.gain.value = initialGain;
                    return node;
                });

                // Connect: source -> eq0 -> eq1 -> eq2 -> eq3 -> eq4 -> analyser -> destination
                source.connect(nextEqNodes[0]);
                for (let i = 0; i < nextEqNodes.length - 1; i++) {
                    nextEqNodes[i].connect(nextEqNodes[i + 1]);
                }
                const lastEq = nextEqNodes[nextEqNodes.length - 1];
                lastEq.connect(nextAnalyser);
                nextAnalyser.connect(ctx.destination);

                nextAnalyser.fftSize = 256;
                const bufferLength = nextAnalyser.frequencyBinCount;
                const nextDataArray = new Uint8Array(bufferLength);

                // Commit module state only after core graph wiring succeeds
                audioCtx = ctx;
                analyser = nextAnalyser;
                eqNodes = nextEqNodes;
                dataArray = nextDataArray;

                // Wire AudioWorklet Processor on the dedicated audio thread
                if (ctx.audioWorklet) {
                    ctx.audioWorklet.addModule(workletUrl)
                        .then(() => {
                            const nextWorklet = new AudioWorkletNode(ctx, 'audio-analysis-processor');
                            nextWorklet.port.onmessage = (event) => {
                                if (event.data && event.data.type === 'AUDIO_THREAD_METRICS') {
                                    audioThreadMetrics = event.data;
                                }
                            };
                            lastEq.disconnect(nextAnalyser);
                            try {
                                lastEq.connect(nextWorklet);
                                nextWorklet.connect(nextAnalyser);
                                workletNode = nextWorklet;
                            } catch (wireErr) {
                                try { lastEq.connect(nextAnalyser); } catch (_) {}
                                throw wireErr;
                            }
                        })
                        .catch((err) => {
                            // Silent fallback to AnalyserNode if Worklets are restricted
                            console.warn('AudioWorklet notice (using fallback analyser):', err?.message || err);
                        });
                }
            } catch (initErr) {
                Promise.resolve(ctx.close?.()).catch(() => {});
                throw initErr;
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            Promise.resolve(audioCtx.resume()).catch((err) => {
                console.warn('AudioContext resume failed:', err?.message || err);
            });
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
