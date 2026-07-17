/**
 * Recorder Module for Wavr
 * Manages screen recording modes, MediaRecorder API, pre-roll timer, and file saving.
 */

// Mode Registry for Recording
export const recordingModeRegistry = {
    normal: {
        id: 'normal',
        label: 'Normal Player',
        setup: () => {
            const btnExitCine = document.getElementById('btn-exit-cinematic');
            const btnExitAngel = document.getElementById('btn-exit-angelic');
            const homeView = document.getElementById('home-view');
            const playerView = document.getElementById('player-view');

            if (btnExitCine && !document.getElementById('cinematic-view').classList.contains('hidden')) {
                btnExitCine.click();
            }
            if (btnExitAngel && !document.getElementById('angelic-view').classList.contains('hidden')) {
                btnExitAngel.click();
            }
            if (homeView && playerView) {
                homeView.classList.add('hidden');
                playerView.classList.remove('hidden');
                playerView.classList.add('player-active');
            }
        },
        teardown: () => {}
    },
    cinematic: {
        id: 'cinematic',
        label: 'Cinematic Mode',
        setup: () => {
            const btnCinematic = document.getElementById('btn-cinematic');
            const homeView = document.getElementById('home-view');
            const playerView = document.getElementById('player-view');

            if (homeView && playerView && playerView.classList.contains('hidden')) {
                homeView.classList.add('hidden');
                playerView.classList.remove('hidden');
            }
            if (btnCinematic) {
                btnCinematic.click();
            }
        },
        teardown: () => {
            const btnExitCine = document.getElementById('btn-exit-cinematic');
            if (btnExitCine) btnExitCine.click();
        }
    },
    angelic: {
        id: 'angelic',
        label: 'Angelic Mode',
        setup: () => {
            const btnAngelic = document.getElementById('btn-angelic');
            const homeView = document.getElementById('home-view');
            const playerView = document.getElementById('player-view');

            if (homeView && playerView && playerView.classList.contains('hidden')) {
                homeView.classList.add('hidden');
                playerView.classList.remove('hidden');
            }
            if (btnAngelic) {
                btnAngelic.click();
            }
        },
        teardown: () => {
            const btnExitAngel = document.getElementById('btn-exit-angelic');
            if (btnExitAngel) btnExitAngel.click();
        }
    }
};

/**
 * Register a new recording mode dynamically
 * @param {Object} modeConfig { id, label, setup, teardown }
 */
export function registerRecordingMode(modeConfig) {
    if (modeConfig && modeConfig.id) {
        recordingModeRegistry[modeConfig.id] = modeConfig;
    }
}

let mediaRecorder = null;
let recordedChunks = [];
let activeStream = null;
let preRollTimeout = null;
let currentModeId = 'normal';
let wasFullscreenBefore = false;

export async function startScreenRecording(modeId, options = {}) {
    const { playAudio, pauseAudio, showToast } = options;
    const modeConfig = recordingModeRegistry[modeId] || recordingModeRegistry.normal;
    currentModeId = modeId;
    wasFullscreenBefore = !!document.fullscreenElement;

    // Step 1: Request Display Media (Screen/Tab Capture) with highest quality constraints & self-tab preference
    let stream;
    const displayOptions = {
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'include',
        systemAudio: 'include',
        video: {
            displaySurface: 'browser',
            width: { ideal: 1920, max: 3840 },
            height: { ideal: 1080, max: 2160 },
            frameRate: { ideal: 60, max: 120 }
        },
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        }
    };

    try {
        stream = await navigator.mediaDevices.getDisplayMedia(displayOptions);
    } catch (err) {
        console.warn('Advanced displayMedia failed, trying standard fallback:', err);
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
        } catch (fallbackErr) {
            console.warn('Display media permission denied or failed:', fallbackErr);
            if (showToast) showToast('Recording cancelled or permission denied.');
            return;
        }
    }

    activeStream = stream;
    recordedChunks = [];

    // Step 2: Fullscreen & UI Preparation
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        }
    } catch (e) {
        console.warn('Fullscreen request failed:', e);
    }

    document.body.classList.add('is-recording');

    // Setup selected Mode
    if (modeConfig.setup) {
        modeConfig.setup();
    }

    // Step 3: MediaRecorder Initialization (Prefer VP9 @ 8 Mbps)
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
            mimeType = 'video/webm;codecs=vp8';
        } else {
            mimeType = 'video/webm';
        }
    }

    try {
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: mimeType,
            videoBitsPerSecond: 8000000 // 8 Mbps for ultra crisp 1080p60
        });
    } catch (e) {
        console.warn('MediaRecorder init fallback without bitrates:', e);
        mediaRecorder = new MediaRecorder(stream);
    }

    mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
            recordedChunks.push(e.data);
        }
    };

    mediaRecorder.onstop = async () => {
        await finishRecording(options);
    };

    // If user stops sharing via browser bar
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.onended = () => {
            stopRecording();
        };
    }

    // Pause audio first to ensure clean ambient start
    if (pauseAudio) pauseAudio();

    // Start recording
    mediaRecorder.start(1000);
    if (showToast) showToast('Recording started! Music starts in 4 seconds...');

    // Step 4: 4-second ambient time before playing music
    preRollTimeout = setTimeout(() => {
        if (playAudio) playAudio();

        // Listen for track end
        const audioElement = document.getElementById('audio-player');
        if (audioElement) {
            const onAudioEnded = () => {
                stopRecording();
                audioElement.removeEventListener('ended', onAudioEnded);
            };
            audioElement.addEventListener('ended', onAudioEnded);
        }
    }, 4000);
}

export function stopRecording() {
    if (preRollTimeout) {
        clearTimeout(preRollTimeout);
        preRollTimeout = null;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }
}

async function finishRecording(options = {}) {
    const { showToast, getCurrentTrack } = options;

    // Cleanup UI
    document.body.classList.remove('is-recording');

    if (!wasFullscreenBefore && document.fullscreenElement) {
        try {
            await document.exitFullscreen();
        } catch (e) {
            // ignore
        }
    }

    // Process Blob & Download
    if (recordedChunks.length === 0) {
        if (showToast) showToast('No video data captured.');
        return;
    }

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const currentTrack = getCurrentTrack ? getCurrentTrack() : null;
    const songTitle = currentTrack?.title ? currentTrack.title.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Track';
    const filename = `Wavr_${songTitle}_${Date.now()}.webm`;

    let savedSuccessfully = false;

    // Try File System Access API (showSaveFilePicker)
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: 'WebM Video File',
                    accept: { 'video/webm': ['.webm'] }
                }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            savedSuccessfully = true;
            if (showToast) showToast(`Video saved successfully!`);
        } catch (err) {
            if (err.name === 'AbortError') {
                if (showToast) showToast('Save cancelled by user.');
                return;
            }
            console.warn('showSaveFilePicker error, falling back to download link:', err);
        }
    }

    // Fallback if showSaveFilePicker failed or not supported
    if (!savedSuccessfully) {
        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            if (showToast) showToast(`Video downloaded: ${filename}`);
        } catch (e) {
            console.error('Download fallback error:', e);
            if (showToast) showToast('Failed to save recorded video.');
        }
    }
}
