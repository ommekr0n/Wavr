/** Boundary-driven karaoke: no CSS progress writes or per-frame span scans between timestamps. */
export class EnhancedWordHighlighter {
    constructor() { this.roots = new Map(); this.views = new WeakMap(); }

    invalidate(root) {
        const record = this.roots.get(root);
        record?.words.forEach(word => { if (word.timer) { clearTimeout(word.timer); word.element.classList.remove('glitch-word-anim'); } });
        this.roots.delete(root);
    }

    reset() { for (const root of this.roots.keys()) this.invalidate(root); }

    visible(root) {
        if (!root) return false;
        if (!this.views.has(root)) this.views.set(root, root.closest('.view-container'));
        return !this.views.get(root)?.classList.contains('hidden');
    }

    sync(root, index, time, drift, mode) {
        if (!this.visible(root) || index < 0) { this.invalidate(root); return; }
        let record = this.roots.get(root);
        if (!record || record.index !== index || !record.wrapper.isConnected || record.wrapper.classList.contains('ink-wash-exit') || record.wrapper.classList.contains('cine-exit')) {
            this.invalidate(root);
            const selector = mode === 'angelic' ? `.angelic-line-wrapper[data-lyric-index="${index}"]:not(.angelic-prebuilt):not(.ink-wash-exit)`
                : mode === 'cinematic' ? '.cinematic-line-wrapper.cine-enter' : `[data-index="${index}"]`;
            const wrapper = root.querySelector(selector);
            if (!wrapper) return;
            const wordSelector = mode === 'angelic' ? '.has-enhanced-word' : mode === 'cinematic' ? '.cine-word[data-start]' : '.lyric-word';
            record = { index, wrapper, words: Array.from(wrapper.querySelectorAll(wordSelector), element => ({
                element, start: Number(element.getAttribute('data-start')), end: Number(element.getAttribute('data-end')), state: -1, timer: null
            })), drift: null, low: Infinity, high: -Infinity };
            this.roots.set(root, record);
        }
        if (record.drift !== drift) {
            record.words.forEach(word => {
                const duration = Math.max(.04, (word.end - word.start) * drift);
                word.element.style.setProperty('--word-attack', `${Math.min(.16, Math.max(.05, duration * .35)).toFixed(3)}s`);
            });
            record.drift = drift; record.low = Infinity; record.high = -Infinity;
        }
        if (time >= record.low && time < record.high) return;
        record.low = -Infinity; record.high = Infinity;
        for (const word of record.words) {
            const start = word.start * drift - .04, end = word.end * drift;
            for (const boundary of [start, end]) {
                if (boundary <= time) record.low = Math.max(record.low, boundary);
                else record.high = Math.min(record.high, boundary);
            }
            const state = time >= end ? 2 : time >= start ? 1 : 0;
            if (state === word.state) continue;
            word.state = state;
            word.element.classList.toggle('word-active', state === 1);
            word.element.classList.toggle('word-past', state === 2);
            word.element.classList.remove('glitch-word-anim');
            if (word.timer) { clearTimeout(word.timer); word.timer = null; }
            if (mode === 'cinematic' && state === 1 && Math.random() < .2) {
                word.element.classList.add('glitch-word-anim');
                word.timer = setTimeout(() => { word.element.classList.remove('glitch-word-anim'); word.timer = null; }, 380);
            }
        }
    }
}
