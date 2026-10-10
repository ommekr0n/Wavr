import { getQueueSnapshot, planQueueEdit } from './PlaybackQueueEdits.js';

export class QueueManager extends EventTarget {
    #playlist = [];
    #activeQueue = [];
    #activePlaylistContext = 'library';
    #currentTrackIndex = -1;
    #isShuffle = false;
    #repeatMode = 0;
    #shuffledQueue = [];

    get playlist() { return this.#playlist; }
    get activeQueue() { return this.#activeQueue; }
    get activePlaylistContext() { return this.#activePlaylistContext; }
    get currentTrackIndex() { return this.#currentTrackIndex; }
    get isShuffle() { return this.#isShuffle; }
    get repeatMode() { return this.#repeatMode; }
    get shuffledQueue() { return this.#shuffledQueue; }

    setPlaylist(value) {
        this.#playlist = value;
        this.#emitChange('playlist');
    }

    setActiveQueue(value) {
        this.#activeQueue = value;
        this.#emitChange('activeQueue');
    }

    setActivePlaylistContext(value) {
        this.#activePlaylistContext = value;
        this.#emitChange('activePlaylistContext');
    }

    setCurrentTrackIndex(value) {
        this.#currentTrackIndex = value;
        this.#emitChange('currentTrackIndex');
    }

    setShuffle(value) {
        this.#isShuffle = value;
        this.#emitChange('shuffle');
    }

    setRepeatMode(value) {
        this.#repeatMode = value;
        this.#emitChange('repeatMode');
    }

    setShuffledQueue(value) {
        this.#shuffledQueue = value;
        this.#emitChange('shuffledQueue');
    }

    getPlaybackSource() {
        return this.#activeQueue;
    }

    startQueue(tracks, index, context = 'library') {
        if (!tracks[index]) return false;
        this.#activeQueue = [...tracks];
        this.#currentTrackIndex = index;
        this.#activePlaylistContext = context;
        if (this.#isShuffle) this.generateShuffleQueue();
        this.#emitChange('selection');
        return true;
    }

    /** Leave a box on the next transport action with repeat off, retaining the current song by identity. */
    continueInLibrary() {
        if (this.#activePlaylistContext === 'library' || this.#repeatMode !== 0) return false;
        const currentTrack = this.#activeQueue[this.#currentTrackIndex];
        if (!currentTrack) return false;
        const index = this.#playlist.findIndex(track => track === currentTrack ||
            (currentTrack.id != null && track.id === currentTrack.id));
        if (index === -1) return false;
        return this.startQueue(this.#playlist, index, 'library');
    }

    editQueue(action) {
        const result = planQueueEdit(getQueueSnapshot(this), action);
        if (!result) return false;
        this.#activeQueue = result.source;
        this.#currentTrackIndex = result.index;
        this.#shuffledQueue = result.order;
        this.#emitChange(action.type);
        return true;
    }

    toggleShuffle() {
        this.#isShuffle = !this.#isShuffle;
        if (this.#isShuffle) this.generateShuffleQueue(false);
        this.#emitChange('shuffle');
        return this.#isShuffle;
    }

    generateShuffleQueue(excludeCurrent = false) {
        const source = this.getPlaybackSource();
        this.#shuffledQueue = Array.from({ length: source.length }, (_, index) => index);

        for (let index = this.#shuffledQueue.length - 1; index > 0; index--) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [this.#shuffledQueue[index], this.#shuffledQueue[randomIndex]] =
                [this.#shuffledQueue[randomIndex], this.#shuffledQueue[index]];
        }

        if (this.#currentTrackIndex !== -1 && source.length > 1) {
            const currentQueueIndex = this.#shuffledQueue.indexOf(this.#currentTrackIndex);
            if (currentQueueIndex !== -1) {
                this.#shuffledQueue.splice(currentQueueIndex, 1);
                if (excludeCurrent) this.#shuffledQueue.push(this.#currentTrackIndex);
                else this.#shuffledQueue.unshift(this.#currentTrackIndex);
            }
        }

        this.#emitChange('shuffledQueue');
    }

    #emitChange(reason) {
        this.dispatchEvent(new CustomEvent('queuechange', {
            detail: {
                reason,
                source: this.getPlaybackSource(),
                index: this.#currentTrackIndex,
                context: this.#activePlaylistContext,
                shuffle: this.#isShuffle,
                repeatMode: this.#repeatMode
            }
        }));
    }
}

export const queueManager = new QueueManager();
