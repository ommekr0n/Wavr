import { ThreeRendererController } from './ThreeRendererController.js';
import { setGraphicsAvailability } from './GraphicsAvailability.js';
import { setupNormalPlayerExperience } from '../player/NormalPlayerExperience.js';

const disposePlayerExperience = setupNormalPlayerExperience();
let controller = null;
try { controller = new ThreeRendererController(); }
catch (error) {
    setGraphicsAvailability('unavailable');
    console.warn('Wavr 3D graphics could not start:', error);
}

// The existing application owns the English UI, music, library and lyrics.
import('../../main.js').catch(error => console.error('Wavr bootstrap failed:', error));

window.addEventListener('pagehide', event => {
    if (event.persisted) { controller?.scheduler.stop(); return; }
    controller?.dispose();
    disposePlayerExperience();
});
window.addEventListener('pageshow', event => { if (event.persisted) controller?.syncLoop(); });
