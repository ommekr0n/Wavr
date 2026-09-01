/**
 * RecordingModalController.js
 * Manages the screen recording mode selection popover and setup modal.
 */

import { startScreenRecording } from '../../modules/recorder.js';

export function setupRecordingController({
    playAudio,
    pauseAudio,
    showToast,
    getPlaybackSource,
    PlayerController,
    LyricEngine,
    lyricsList,
    angelicTextContainer,
    cinematicTextContainer,
    updateProgress,
    audio
}) {
    const btnRecord = document.getElementById('btn-record');
    const recordPopover = document.getElementById('record-popover');
    const recordingSetupModal = document.getElementById('recording-setup-modal');
    const btnCancelRecording = document.getElementById('btn-cancel-recording');
    const btnConfirmRecording = document.getElementById('btn-confirm-recording');

    const recordingModes = [
        {
            id: 'normal',
            label: 'Normal Player',
            icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>'
        },
        {
            id: 'cinematic',
            label: 'Cinematic Mode',
            icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>'
        },
        {
            id: 'angelic',
            label: 'Angelic Mode',
            icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
        }
    ];

    let selectedRecordingMode = null;

    if (btnRecord && recordPopover) {
        recordPopover.innerHTML = recordingModes.map(mode => `
            <button class="record-option-item" data-mode="${mode.id}">
                ${mode.icon}
                <span>${mode.label}</span>
            </button>
        `).join('');

        btnRecord.addEventListener('click', (e) => {
            e.stopPropagation();
            if (recordPopover.classList.contains('hidden')) {
                recordPopover.classList.remove('hidden');
                void recordPopover.offsetWidth;
                recordPopover.classList.add('active');
            } else {
                recordPopover.classList.remove('active');
                setTimeout(() => {
                    recordPopover.classList.add('hidden');
                }, 200);
            }
        });

        document.addEventListener('click', (e) => {
            if (!recordPopover.classList.contains('hidden') && !e.target.closest('.record-container')) {
                recordPopover.classList.remove('active');
                setTimeout(() => recordPopover.classList.add('hidden'), 200);
            }
        });

        recordPopover.addEventListener('click', (e) => {
            const btn = e.target.closest('.record-option-item');
            if (btn) {
                selectedRecordingMode = btn.getAttribute('data-mode');
                recordPopover.classList.remove('active');
                recordPopover.classList.add('hidden');
                if (recordingSetupModal) recordingSetupModal.classList.remove('hidden');
            }
        });
    }

    if (btnCancelRecording && recordingSetupModal) {
        btnCancelRecording.addEventListener('click', () => recordingSetupModal.classList.add('hidden'));
    }

    if (btnConfirmRecording && recordingSetupModal) {
        btnConfirmRecording.addEventListener('click', () => {
            recordingSetupModal.classList.add('hidden');
            if (selectedRecordingMode) {
                document.dispatchEvent(new CustomEvent('startRecording', { detail: { mode: selectedRecordingMode } }));
            }
        });
    }

    document.addEventListener('startRecording', (e) => {
        const mode = e.detail?.mode || 'normal';
        startScreenRecording(mode, {
            playAudio,
            pauseAudio,
            showToast,
            getCurrentTrack: () => {
                const source = getPlaybackSource();
                return source[PlayerController.getCurrentTrackIndex()] || null;
            },
            resetPlaybackState: () => {
                pauseAudio();
                audio.currentTime = 0;
                LyricEngine.setActiveLyricIndex(-1);
                LyricEngine.renderLyrics(lyricsList, angelicTextContainer, cinematicTextContainer);
                updateProgress();
                const lc = document.getElementById('lyrics-container');
                if (lc) lc.scrollTop = 0;
                if (cinematicTextContainer) cinematicTextContainer.innerHTML = '';
                if (angelicTextContainer) angelicTextContainer.innerHTML = '';
            }
        });
    });
}
