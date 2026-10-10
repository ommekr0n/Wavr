import { LibraryVisibleItems } from './LibraryVisibleItems.js';
import { readLibraryBackgroundUrl } from './LibraryArtworkSource.js';

export function describeLibraryCard(card) {
    const crate = card.classList.contains('vinyl-box-card');
    const anchor = card.querySelector(crate ? '.vinyl-box-visual' : '.song-cover-wrapper, .song-card-inner');
    if (!anchor || card.classList.contains('expanded-active')) return null;
    const urls = crate ? [...anchor.querySelectorAll('.peeking-sleeve')].slice(0, 4).map(node => readLibraryBackgroundUrl(node.style.backgroundImage)).filter(Boolean)
        : [anchor.querySelector('img')?.currentSrc || anchor.querySelector('img')?.src].filter(Boolean);
    const id = card.dataset.songId || card.dataset.id || card.dataset.boxId;
    const tray = anchor.closest('.box-expansion-slider-wrapper');
    const box = tray?.closest('.vinyl-box-card');
    const key = `${crate ? 'crate' : 'song'}:${box?.dataset.id || box?.dataset.boxId || 'grid'}:${id}`;
    return { card, anchor, urls, crate, id, key, color: card.style.getPropertyValue('--box-color').trim() || '#8b7058', tray };
}

function changedByApp(mutation) {
    if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') return true;
    const clean = value => (value || '').split(/\s+/).filter(name => !['library-object-ready', 'three-surface-ready'].includes(name)).sort().join(' ');
    return clean(mutation.oldValue) !== clean(mutation.target.className);
}

/** DOM owns layout and hit testing; these bindings only describe artwork and state. */
export class LibrarySceneBindings {
    constructor(root, mode, invalidate) {
        this.root = root; this.mode = mode; this.invalidate = invalidate;
        this.structureDirty = true; this.layoutDirty = true;
        this.records = new Map(); this.byKey = new Map(); this.byAnchor = new Map();
        this.scrollRoot = mode === 'edit' ? root.closest('.edit-grid-container') : root;
        this.visibility = new LibraryVisibleItems(this.scrollRoot, () => this.markDirty());
        this.observer = new MutationObserver(mutations => {
            const changes = mutations.filter(changedByApp);
            if (!changes.length) return;
            if (changes.some(m => m.type === 'childList' || m.attributeName === 'src' || m.target.classList?.contains('peeking-sleeve'))) this.structureDirty = true;
            this.markDirty();
        });
        this.observer.observe(root, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['src', 'class', 'style'] });
        this.resizeObserver = new ResizeObserver(() => this.markDirty()); this.resizeObserver.observe(root);
        this.abort = new AbortController();
        for (const event of ['focusin', 'focusout']) root.addEventListener(event, () => this.markDirty(), { signal: this.abort.signal });
    }

    markDirty() { this.layoutDirty = true; if (!this.suspended) this.invalidate(); }

    suspend() {
        this.suspended = true; this.visibility.suspend(); this.resizeObserver.disconnect();
    }

    resume() {
        this.suspended = false; this.visibility.resume(); this.resizeObserver.observe(this.root); this.markDirty();
    }

    sync() {
        if (this.structureDirty) {
            this.structureDirty = false;
            const cards = new Set(this.root.querySelectorAll('.song-card:not(.expanded-active)'));
            for (const [card] of this.records) if (!cards.has(card)) this.records.delete(card);
            for (const card of cards) {
                const description = describeLibraryCard(card);
                if (description) this.records.set(card, description); else this.records.delete(card);
            }
            this.byKey = new Map([...this.records.values()].map(record => [record.key, record]));
            this.byAnchor = new Map([...this.records.values()].map(record => [record.anchor, record]));
            this.visibility.sync(new Set([...this.records.values()].map(record => record.anchor)));
        }
        if (!this.layoutDirty) return;
        this.layoutDirty = false;
        const bounds = this.scrollRoot.getBoundingClientRect();
        const view = this.root.closest('.view-container');
        const header = view?.querySelector('.home-header')?.getBoundingClientRect();
        this.clip = { left: Math.max(0, bounds.left), right: Math.min(innerWidth, bounds.right), top: Math.max(bounds.top, header?.bottom || 0), bottom: Math.min(innerHeight, bounds.bottom) };
        const trays = new Map();
        for (const record of this.records.values()) {
            if (!this.visibility.visible.has(record.anchor)) continue;
            record.rect = record.anchor.getBoundingClientRect();
            if (record.tray) {
                if (!trays.has(record.tray)) trays.set(record.tray, record.tray.getBoundingClientRect());
                const t = trays.get(record.tray);
                record.clip = { left: Math.max(this.clip.left, t.left), right: Math.min(this.clip.right, t.right), top: Math.max(this.clip.top, t.top), bottom: Math.min(this.clip.bottom, t.bottom) };
            } else record.clip = this.clip;
        }
    }

    dispose() { this.observer.disconnect(); this.resizeObserver.disconnect(); this.visibility.dispose(); this.abort.abort(); this.records.clear(); this.byKey.clear(); this.byAnchor.clear(); }
}
