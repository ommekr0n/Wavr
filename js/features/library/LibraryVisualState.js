import { queueManager } from '../../core/QueueManager.js';

const viewStates = new WeakMap();

export function syncLibraryVisualState(root, mode) {
    if (!root) return null;
    let state = viewStates.get(root);
    if (!state) { state = new LibraryVisualState(root, mode); viewStates.set(root, state); }
    state.sync(); return state;
}

/** Keyboard entry points and a quiet current-track marker, independent of WebGL. */
export class LibraryVisualState {
    constructor(root, mode) {
        this.root = root; this.mode = mode; this.abort = new AbortController(); this.labels = new WeakMap();
        root.addEventListener('keydown', event => {
            if (!['Enter', ' '].includes(event.key) || !event.target.matches('.song-card') || event.target.classList.contains('expanded-active')) return;
            event.preventDefault();
            if (event.target.classList.contains('inner-editable-song')) event.target.querySelector('.song-options-btn')?.click();
            else event.target.click();
        }, { signal: this.abort.signal });
        queueManager.addEventListener('queuechange', () => this.sync(), { signal: this.abort.signal });
        window.addEventListener('pagehide', event => { if (!event.persisted) this.dispose(); }, { signal: this.abort.signal });
    }

    sync() {
        const track = queueManager.getPlaybackSource()[queueManager.currentTrackIndex];
        for (const card of this.root.querySelectorAll('.song-card')) {
            const title = card.querySelector(':scope > .song-card-title, :scope > .song-info > .song-card-title')?.textContent || card.querySelector('.box-expansion-title')?.textContent || '';
            const artist = card.querySelector(':scope > .song-card-artist, :scope > .song-info > .song-card-artist')?.textContent || '';
            const expanded = card.classList.contains('expanded-active');
            const id = card.dataset.songId || card.dataset.id;
            const current = !card.classList.contains('vinyl-box-card') && !!track && id === track.id;
            const action = expanded || card.classList.contains('vinyl-box-card') ? 'Open vinyl box' : this.mode === 'edit' ? card.classList.contains('inner-editable-song') ? 'Track options' : `Select track${card.classList.contains('selected') ? ', selected' : ''}` : 'Play track';
            const label = `${title}${artist ? `, ${artist}` : ''}. ${action}${current ? '. Now playing' : ''}`;
            if (this.labels.get(card) === label) continue;
            this.labels.set(card, label);
            card.classList.toggle('library-now-playing', current);
            card.tabIndex = expanded ? -1 : 0;
            card.setAttribute('role', 'group');
            card.setAttribute('aria-label', label);
            if (current) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
        }
    }

    dispose() { this.abort.abort(); }
}
