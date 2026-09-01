/**
 * AppBootstrapper.js
 * Handles initial splash screen loading bar, silly jokes, waveform decoding, and first-time tutorial modal.
 */

import { loadAndDecodeWaveform } from '../player/WaveformEngine.js';

const sillyLoadingJokes = [
    "Spinning vinyl records real quick...",
    "Polishing the audio waveforms...",
    "Warming up the vacuum tubes...",
    "Reticulating audio splines...",
    "Is your Wi-Fi feeling okay today?",
    "Brewing fresh sonic vibes...",
    "Cranking up the chill levels...",
    "Waking up the bass drop...",
    "Dusting off the mini player...",
    "Dusting the equalizer knobs...",
    "Checking for high frequencies..."
];

export async function runSplashBootstrapper(loadedPlaylist = []) {
    const btnCloseTutorials = document.getElementById('btn-close-tutorials');
    const modalTutorials = document.getElementById('modal-tutorials');
    if (btnCloseTutorials && modalTutorials) {
        btnCloseTutorials.addEventListener('click', () => {
            modalTutorials.classList.add('hidden');
        });
    }

    const splashLoader = document.getElementById('app-splash-loader');
    const splashBar = document.getElementById('splash-progress-bar');
    const splashText = document.getElementById('splash-status-text');
    const splashPct = document.getElementById('splash-status-pct');

    const currentSplashJoke = sillyLoadingJokes[Math.floor(Math.random() * sillyLoadingJokes.length)];

    function updateSplashProgress(percent) {
        const rounded = Math.min(100, Math.max(0, Math.floor(percent)));
        if (splashBar) splashBar.style.width = `${rounded}%`;
        if (splashPct) splashPct.textContent = `${rounded}%`;
        if (splashText) splashText.textContent = currentSplashJoke;
    }

    const isFirstTime = !localStorage.getItem('wavr_has_visited') || loadedPlaylist.length === 0;

    if (isFirstTime) {
        updateSplashProgress(50);
        await new Promise(res => setTimeout(res, 400));
        updateSplashProgress(100);
        await new Promise(res => setTimeout(res, 200));

        if (splashLoader) splashLoader.classList.add('splash-fade-out');
        if (modalTutorials) modalTutorials.classList.remove('hidden');
        localStorage.setItem('wavr_has_visited', 'true');
    } else {
        updateSplashProgress(25);

        const totalTracks = loadedPlaylist.length;
        let completed = 0;

        const preloadPromises = loadedPlaylist.map(async (song) => {
            if (song.url) {
                try {
                    await loadAndDecodeWaveform(song.url);
                } catch (err) {
                    console.warn(`Failed to preload waveform for ${song.title}`, err);
                }
            }
            completed++;
            const pct = 25 + (completed / totalTracks) * 70;
            updateSplashProgress(pct);
        });

        await Promise.all(preloadPromises);

        updateSplashProgress(100);
        await new Promise(res => setTimeout(res, 300));

        if (splashLoader) splashLoader.classList.add('splash-fade-out');
    }
}
