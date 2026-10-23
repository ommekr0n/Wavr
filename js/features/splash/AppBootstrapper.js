/**
 * AppBootstrapper.js
 * Handles the initial splash and tutorial without downloading or decoding the library.
 */

import { setupTutorialDismissal } from './TutorialDismissal.js';

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

export async function runSplashBootstrapper() {
    const modalTutorials = document.getElementById('modal-tutorials');
    setupTutorialDismissal(modalTutorials);

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

    const isFirstTime = !localStorage.getItem('wavr_has_visited');

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

        updateSplashProgress(100);
        await new Promise(res => setTimeout(res, 300));

        if (splashLoader) splashLoader.classList.add('splash-fade-out');
    }
}
