import { AudioEngine } from './audio/AudioEngine.js';

export const PLAYBACK_STATES = Object.freeze({
    IDLE: 'idle',
    LOADING: 'loading',
    PLAYING: 'playing',
    PAUSED: 'paused',
    ENDED: 'ended',
    ERROR: 'error'
});

export class PlaybackEngine extends EventTarget {
    #audio;
    #currentTrack = null;
    #state = PLAYBACK_STATES.IDLE;
    #loadVersion = 0;

    constructor(audioElement) {
        super();
        if (!audioElement) throw new Error('PlaybackEngine requires an audio element');
        this.#audio = audioElement;
        this.#bindNativeEvents();
    }

    loadTrack(track) {
        if (!track?.url) throw new Error('PlaybackEngine requires a track with a media URL');

        this.#loadVersion++;
        this.#currentTrack = track;
        this.#setState(PLAYBACK_STATES.LOADING);
        this.#audio.src = track.url;
        this.#audio.load();
        this.#emit('trackchange', { track });
    }

    async play() {
        const loadVersion = this.#loadVersion;
        try {
            AudioEngine.init(this.#audio);
            await this.#audio.play();
            if (loadVersion !== this.#loadVersion) return false;
            this.#setState(PLAYBACK_STATES.PLAYING);
            return true;
        } catch (error) {
            if (error?.name === 'AbortError' || loadVersion !== this.#loadVersion) return false;
            this.#setState(PLAYBACK_STATES.ERROR);
            this.#emit('error', {
                code: 'PLAY_FAILED',
                message: error?.message || 'Unable to play this track',
                recoverable: true,
                cause: error
            });
            throw error;
        }
    }

    pause() {
        this.#audio.pause();
        this.#setState(PLAYBACK_STATES.PAUSED);
    }

    stop() {
        this.pause();
        this.seek(0);
        this.#setState(PLAYBACK_STATES.IDLE);
    }

    seek(timeSeconds) {
        const requestedTime = Number(timeSeconds);
        if (!Number.isFinite(requestedTime)) return;

        const duration = this.#audio.duration;
        const maximum = Number.isFinite(duration) ? duration : requestedTime;
        this.#audio.currentTime = Math.min(Math.max(requestedTime, 0), maximum);
    }

    setVolume(volume) {
        const requestedVolume = Number(volume);
        if (!Number.isFinite(requestedVolume)) return;
        this.#audio.volume = Math.min(Math.max(requestedVolume, 0), 1);
    }

    setMuted(muted) {
        this.#audio.muted = Boolean(muted);
    }

    toggleMute() {
        this.setMuted(!this.#audio.muted);
        return this.#audio.muted;
    }

    get audioElement() { return this.#audio; }
    get currentTrack() { return this.#currentTrack; }
    get state() { return this.#state; }
    get currentTime() { return this.#audio.currentTime; }
    get duration() { return this.#audio.duration; }
    get volume() { return this.#audio.volume; }
    get isMuted() { return this.#audio.muted; }
    get isPaused() { return this.#audio.paused; }

    #bindNativeEvents() {
        this.#audio.addEventListener('canplay', () => {
            if (this.#state === PLAYBACK_STATES.LOADING) {
                this.#setState(PLAYBACK_STATES.PAUSED);
            }
        });
        this.#audio.addEventListener('play', () => this.#setState(PLAYBACK_STATES.PLAYING));
        this.#audio.addEventListener('pause', () => {
            if (this.#state !== PLAYBACK_STATES.LOADING && this.#state !== PLAYBACK_STATES.ENDED) {
                this.#setState(PLAYBACK_STATES.PAUSED);
            }
        });
        this.#audio.addEventListener('ended', () => this.#setState(PLAYBACK_STATES.ENDED));
        this.#audio.addEventListener('volumechange', () => {
            this.#emit('volumechange', { volume: this.volume, muted: this.isMuted });
        });
        this.#audio.addEventListener('error', () => {
            const mediaError = this.#audio.error;
            this.#setState(PLAYBACK_STATES.ERROR);
            this.#emit('error', {
                code: `MEDIA_ERROR_${mediaError?.code || 'UNKNOWN'}`,
                message: mediaError?.message || 'The media element could not load this track',
                recoverable: true
            });
        });
    }

    #setState(state) {
        if (this.#state === state) return;
        const previousState = this.#state;
        this.#state = state;
        this.#emit('statechange', { state, previousState });
    }

    #emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
}
