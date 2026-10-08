import { getQueueSnapshot, getUpcomingEntries } from '../../core/PlaybackQueueEdits.js';
import { createQueueDialog, renderQueue, renderQueueLibrary, updateQueuePlaybackBadge } from './QueuePanelView.js';

/** A modal drawer over either player view; no playback or rendering loop of its own. */
export function setupQueuePanel({ manager, engine, playTrack, showToast }) {
    const dialog = createQueueDialog(), abort = new AbortController(), signal = abort.signal;
    const triggers = ['btn-queue', 'btn-mini-queue'].map(id => document.getElementById(id)).filter(Boolean);
    const library = dialog.querySelector('.queue-library'), search = dialog.querySelector('#queue-search');

    function renderLibrary() {
        if (library.open) renderQueueLibrary(dialog, manager.playlist, search.value);
    }
    function refresh() {
        if (!dialog.open) return;
        const state = getQueueSnapshot(manager);
        renderQueue(dialog, state, getUpcomingEntries(state), engine.state);
        dialog.querySelector('#queue-mode').textContent = [
            manager.isShuffle ? 'Shuffle on' : 'In order',
            ['Repeat off', 'Repeat all', 'Repeat one · current track loops'][manager.repeatMode]
        ].join(' · ');
    }
    function close() { dialog.close(); }
    function notify(message) {
        dialog.querySelector('#queue-announcement').textContent = message;
        showToast?.(message);
    }
    for (const trigger of triggers) trigger.addEventListener('click', event => {
        event.stopPropagation();
        if (dialog.open) { close(); return; }
        dialog.showModal();
        dialog.querySelector('#queue-announcement').textContent = '';
        triggers.forEach(button => button.setAttribute('aria-expanded', 'true'));
        refresh();
        renderLibrary();
    }, { signal });
    dialog.addEventListener('close', () => triggers.forEach(button => button.setAttribute('aria-expanded', 'false')), { signal });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, { signal });
    // Let native dialog focus/keyboard behavior run without triggering global media shortcuts.
    dialog.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); close(); }
    }, { signal });
    dialog.addEventListener('click', event => {
        if (event.target === dialog) {
            const rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
            return;
        }
        const button = event.target.closest('button[data-action]');
        if (!button || button.disabled) return;
        const action = button.dataset.action, index = Number(button.dataset.index);
        if (action === 'close') { close(); return; }
        if (action === 'play') { playTrack(index); dialog.querySelector('[data-action="close"]').focus(); return; }
        const title = manager.getPlaybackSource()[index]?.title || 'Track';
        const position = getUpcomingEntries(getQueueSnapshot(manager)).findIndex(entry => entry.index === index);
        let edited = false;
        if (action.startsWith('add-')) {
            const track = manager.playlist[index];
            edited = manager.editQueue({ type: 'add', track, next: action === 'add-next' });
            if (edited) notify(`${track.title || 'Track'} ${action === 'add-next' ? 'will play next' : 'added to queue'}`);
        } else {
            edited = manager.editQueue(action === 'up' || action === 'down' ?
                { type: 'move', index, delta: action === 'up' ? -1 : 1 } : { type: action, index });
            if (edited) notify(action === 'clear' ? 'Queue cleared' : action === 'remove' ? `${title} removed from queue` : `${title} moved ${action}`);
            // Rendering replaces row buttons. Restore keyboard focus near the edited row.
            const rows = dialog.querySelectorAll('#queue-upcoming .queue-track');
            const nextPosition = action === 'up' ? position - 1 : action === 'down' ? position + 1 : position;
            const row = rows[Math.min(Math.max(nextPosition, 0), rows.length - 1)];
            (row?.querySelector(`[data-action="${action}"]:not(:disabled)`) || row?.querySelector('button') || dialog.querySelector('[data-action="close"]')).focus();
        }
    }, { signal });
    manager.addEventListener('queuechange', event => { refresh(); if (event.detail.reason === 'playlist') renderLibrary(); }, { signal });
    engine.addEventListener('statechange', () => { if (dialog.open) updateQueuePlaybackBadge(dialog, engine.state); }, { signal });
    document.addEventListener('wavr:libraryChanged', () => { refresh(); renderLibrary(); }, { signal });
    search.addEventListener('input', renderLibrary, { signal });
    library.addEventListener('toggle', renderLibrary, { signal });
    const dispose = () => { close(); abort.abort(); dialog.remove(); };
    window.addEventListener('pagehide', event => { if (event.persisted) close(); else dispose(); }, { signal });
    return dispose;
}
