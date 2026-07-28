/**
 * EQController.js
 * Equalizer modal logic and audio frequency gain control.
 */
import { AudioEngine } from '../../core/audio/AudioEngine.js';

const PRESETS = {
    default: [0, 0, 0, 0, 0], 
    hiphop: [5, 3, 0, 2, 4], 
    pop: [-2, 1, 4, 3, -1],
    classical: [0, 0, 0, 0, 0], 
    bassboost: [8, 5, 0, 0, 0], 
    electronic: [4, -1, -2, 3, 5], 
    acoustic: [-2, -1, 3, 4, 2]
};

export function setupEQController() {
    const btnEq = document.getElementById('btn-eq');
    const eqModal = document.getElementById('eq-modal');
    const btnCloseEq = document.getElementById('btn-close-eq');
    const eqSliders = document.querySelectorAll('.eq-slider');
    const eqPresets = document.getElementById('eq-presets');
    const eqVals = document.querySelectorAll('.eq-val');

    if (btnEq && eqModal && btnCloseEq) {
        btnEq.addEventListener('click', () => eqModal.classList.remove('hidden'));
        btnCloseEq.addEventListener('click', () => eqModal.classList.add('hidden'));
        eqModal.addEventListener('click', (e) => { 
            if (e.target === eqModal) eqModal.classList.add('hidden'); 
        });
    }

    if (eqPresets) {
        eqPresets.addEventListener('change', (e) => {
            const preset = PRESETS[e.target.value] || PRESETS.default;
            eqSliders.forEach((slider, i) => {
                slider.value = preset[i];
                AudioEngine.setEQGain(i, preset[i]);
                if (eqVals[i]) eqVals[i].textContent = (preset[i] > 0 ? '+' : '') + preset[i] + 'dB';
            });
        });
    }

    eqSliders.forEach((slider, i) => {
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            AudioEngine.setEQGain(i, val);
            if (eqVals[i]) eqVals[i].textContent = (val > 0 ? '+' : '') + val + 'dB';
            if (eqPresets) eqPresets.value = 'default';
        });
    });
}
