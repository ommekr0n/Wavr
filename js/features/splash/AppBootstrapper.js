/**
 * AppBootstrapper.js
 * Handles initial splash screen loading bar, preloading waveform data, and tutorial modals.
 */
import { loadAndDecodeWaveform } from '../player/WaveformEngine.js';

export async function runSplashBootstrapper(loadedPlaylist) {
    const splashLoader = document.getElementById('app-splash-loader');
    const splashProgressBar = document.getElementById('splash-progress-bar');
    const splashProgressText = document.getElementById('splash-progress-text');
    const modalTutorials = document.getElementById('modal-tutorials');
    const btnCloseTutorials = document.getElementById('btn-close-tutorials');
    const btnTutorials = document.getElementById('btn-tutorials');

    if (btnTutorials && modalTutorials) {
        btnTutorials.addEventListener('click', () => {
            modalTutorials.classList.remove('hidden');
        });
    }

    if (btnCloseTutorials && modalTutorials) {
        btnCloseTutorials.addEventListener('click', () => {
            modalTutorials.classList.add('hidden');
        });
    }

    const updateSplashProgress = (pct) => {
        const rounded = Math.min(100, Math.round(pct));
        if (splashProgressBar) splashProgressBar.style.width = `${rounded}%`;
        if (splashProgressText) splashProgressText.textContent = `${rounded}%`;
    };

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
