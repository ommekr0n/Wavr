import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFocusableElements, initModalA11y } from '../js/features/navigation/ModalA11yController.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

test('index.html gives all 12 modals role="dialog", aria-modal="true", and valid aria-labelledby', () => {
    const html = read('index.html');
    const modalIds = [
        'delete-modal',
        'delete-box-modal',
        'edit-modal',
        'upload-modal',
        'lrc-picker-modal',
        'eq-modal',
        'settings-modal',
        'image-crop-modal',
        'playlist-name-modal',
        'add-songs-to-box-modal',
        'recording-setup-modal',
        'modal-cloud-vault'
    ];

    for (const id of modalIds) {
        const tagMatch = html.match(new RegExp(`<div[^>]*\\bid="${id}"[^>]*>`));
        assert.ok(tagMatch, `Expected modal #${id} in index.html`);
        const openTag = tagMatch[0];
        assert.match(openTag, /\brole="dialog"/, `#${id} missing role="dialog"`);
        assert.match(openTag, /\baria-modal="true"/, `#${id} missing aria-modal="true"`);
        const labelMatch = openTag.match(/\baria-labelledby="([^"]+)"/);
        assert.ok(labelMatch, `#${id} missing aria-labelledby`);
        const headingId = labelMatch[1];
        assert.match(html, new RegExp(`<h[1-6][^>]*\\bid="${headingId}"[^>]*>`), `Missing heading with id="${headingId}" for #${id}`);
    }
});

test('ModalA11yController manages focus entry, Tab/Shift+Tab trapping, fallback panel focus, and restoration', () => {
    const observers = [];
    class MockMutationObserver {
        constructor(cb) {
            this.cb = cb;
            this.targets = [];
            observers.push(this);
        }
        observe(target) {
            this.targets.push(target);
        }
        disconnect() {
            this.targets = [];
        }
        trigger(target) {
            this.cb([{ target, type: 'attributes', attributeName: 'class' }]);
        }
    }

    const listeners = new Map();
    const mockDoc = {
        activeElement: null,
        defaultView: { MutationObserver: MockMutationObserver },
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        },
        removeEventListener(type, fn) {
            listeners.get(type)?.delete(fn);
        },
        dispatchKey(key, shiftKey = false) {
            let prevented = false;
            const event = { key, shiftKey, preventDefault() { prevented = true; } };
            for (const fn of listeners.get('keydown') || []) fn(event);
            return prevented;
        },
        querySelectorAll() {
            return [modalWithControls, emptyModal];
        }
    };

    const makeEl = (tag, { id = '', classes = [], attrs = {}, parent = null } = {}) => {
        const classSet = new Set(classes);
        const attrMap = new Map(Object.entries(attrs));
        const el = {
            tagName: tag.toUpperCase(),
            id,
            hidden: false,
            isConnected: true,
            parentElement: parent,
            children: [],
            ownerDocument: mockDoc,
            classList: {
                contains: (c) => classSet.has(c),
                add: (c) => classSet.add(c),
                remove: (c) => classSet.delete(c)
            },
            getAttribute: (k) => (attrMap.has(k) ? attrMap.get(k) : null),
            setAttribute: (k, v) => attrMap.set(k, String(v)),
            focus() {
                mockDoc.activeElement = el;
            },
            closest(sel) {
                let cur = el;
                while (cur) {
                    if (sel.includes('.hidden') && cur.classList.contains('hidden')) return cur;
                    if (sel.includes('[hidden]') && cur.hidden) return cur;
                    cur = cur.parentElement;
                }
                return null;
            },
            contains(other) {
                let cur = other;
                while (cur) {
                    if (cur === el) return true;
                    cur = cur.parentElement;
                }
                return false;
            },
            querySelectorAll() {
                return el.children;
            },
            querySelector() {
                return el.panel || null;
            }
        };
        return el;
    };

    const triggerBtn = makeEl('button', { id: 'open-btn' });
    triggerBtn.focus();

    const modalWithControls = makeEl('div', { id: 'test-modal', classes: ['modal', 'hidden'], attrs: { role: 'dialog' } });
    const firstBtn = makeEl('button', { id: 'first-btn', parent: modalWithControls });
    const hiddenBtn = makeEl('button', { id: 'hidden-btn', classes: ['hidden'], parent: modalWithControls });
    const lastBtn = makeEl('button', { id: 'last-btn', parent: modalWithControls });
    modalWithControls.children = [firstBtn, hiddenBtn, lastBtn];

    const emptyModal = makeEl('div', { id: 'empty-modal', classes: ['modal', 'hidden'], attrs: { role: 'dialog' } });
    emptyModal.panel = makeEl('div', { id: 'empty-panel', classes: ['modal-content'], parent: emptyModal });

    const a11y = initModalA11y(mockDoc);
    assert.equal(observers.length, 1);

    // Verify getFocusableElements excludes hidden children
    modalWithControls.classList.remove('hidden');
    assert.deepEqual(getFocusableElements(modalWithControls), [firstBtn, lastBtn]);

    // Opening modal moves focus to first focusable element
    observers[0].trigger(modalWithControls);
    assert.equal(mockDoc.activeElement, firstBtn);

    // Shift+Tab from first wraps to last
    assert.equal(mockDoc.dispatchKey('Tab', true), true);
    assert.equal(mockDoc.activeElement, lastBtn);

    // Tab from last wraps to first
    assert.equal(mockDoc.dispatchKey('Tab', false), true);
    assert.equal(mockDoc.activeElement, firstBtn);

    // Closing modal removes trap and restores focus to triggerBtn
    modalWithControls.classList.add('hidden');
    observers[0].trigger(modalWithControls);
    assert.equal(mockDoc.activeElement, triggerBtn);
    assert.equal(listeners.get('keydown')?.size || 0, 0);

    // Modal without focusable elements falls back to modal panel with tabindex="-1"
    emptyModal.classList.remove('hidden');
    observers[0].trigger(emptyModal);
    assert.equal(emptyModal.panel.getAttribute('tabindex'), '-1');
    assert.equal(mockDoc.activeElement, emptyModal.panel);

    a11y.dispose();
});

test('index.html cleans up duplicate favicon, unused loading-overlay, infinite SVG animate, and adds a11y labels', () => {
    const html = read('index.html');
    assert.doesNotMatch(html, /<link\s+rel="icon"\s+href="data:,">/i);
    assert.doesNotMatch(html, /id="loading-overlay"/);
    assert.doesNotMatch(html, /repeatCount="indefinite"/);

    // Icon-only buttons & controls
    const iconButtons = [
        'btn-settings', 'btn-edit-library', 'btn-add-song', 'btn-edit-done',
        'btn-mini-shuffle', 'btn-mini-prev', 'btn-mini-play', 'btn-mini-pause', 'btn-mini-next', 'btn-mini-repeat',
        'btn-close-modal', 'btn-close-lrc-picker', 'btn-back-home', 'btn-eq', 'btn-cinematic', 'btn-angelic',
        'btn-record', 'btn-toggle-drift', 'btn-auth-vault', 'fullscreen-btn',
        'btn-shuffle', 'btn-prev', 'btn-play', 'btn-next', 'btn-repeat', 'btn-mute',
        'btn-exit-cinematic', 'btn-exit-angelic', 'btn-close-eq', 'btn-close-cloud-vault'
    ];
    for (const id of iconButtons) {
        const match = html.match(new RegExp(`<button[^>]*\\bid="${id}"[^>]*>`));
        assert.ok(match, `Expected button #${id}`);
        assert.match(match[0], /\baria-label="[^"]+"/, `Button #${id} missing aria-label`);
        assert.match(match[0], /\btype="button"/, `Button #${id} missing type="button"`);
    }

    // Form inputs & sliders
    const labeledInputs = [
        'mini-progress-slider', 'drift-slider', 'eq-60', 'eq-230', 'eq-910', 'eq-3k', 'eq-14k', 'playlist-name-input'
    ];
    for (const id of labeledInputs) {
        const match = html.match(new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`));
        assert.ok(match, `Expected input #${id}`);
        assert.match(match[0], /\baria-label="[^"]+"/, `Input #${id} missing aria-label`);
    }

    // Keyboard-accessible mini-left
    assert.match(html, /<div[^>]*class="mini-left"[^>]*role="button"[^>]*tabindex="0"[^>]*aria-label="Open full player"/);
});

test('JS interactive keyboard accessibility & aria-label updates are wired with zero console.log', () => {
    const miniPlayerJs = read('js/features/player/MiniPlayerController.js');
    const lyricEngineJs = read('js/features/lyrics/LyricEngine.js');
    const mainJs = read('js/main.js');
    const playerEventBindingsJs = read('js/features/player/PlayerEventBindings.js');
    const trackTransitionJs = read('js/features/player/TrackTransitionController.js');
    const toastServiceJs = read('js/modules/toast-service.js');
    const libraryModalsJs = read('js/features/library/LibraryModals.js');
    const modalA11yJs = read('js/features/navigation/ModalA11yController.js');

    assert.match(miniPlayerJs, /miniLeft\.addEventListener\('keydown'/);
    assert.match(lyricEngineJs, /lineEl\.setAttribute\('role',\s*'button'\)/);
    assert.match(lyricEngineJs, /lineEl\.setAttribute\('tabindex',\s*'0'\)/);
    assert.match(playerEventBindingsJs, /lyricsList\.addEventListener\('keydown'/);
    assert.match(mainJs, /initModalA11y\(\)/);
    assert.match(libraryModalsJs, /aria-label="Add \$\{escapeHtml\(song\.title\)\} to box"/);

    for (const [name, src] of [
        ['ModalA11yController.js', modalA11yJs],
        ['MiniPlayerController.js', miniPlayerJs],
        ['LyricEngine.js', lyricEngineJs],
        ['LibraryModals.js', libraryModalsJs],
        ['main.js', mainJs],
        ['PlayerEventBindings.js', playerEventBindingsJs],
        ['TrackTransitionController.js', trackTransitionJs],
        ['toast-service.js', toastServiceJs]
    ]) {
        assert.doesNotMatch(src, /\bconsole\.log\s*\(/, `${name} must not contain console.log`);
    }
});

test('CSS reduced-motion, touch targets, 32px seek bar, WCAG contrast, tokens, GPU hygiene, and modular split', () => {
    const variablesCss = read('css/variables.css');
    const cinematicCss = read('css/cinematic.css');
    const angelicCss = read('css/angelic.css');
    const playerViewCss = read('css/player-view.css');
    const livingSleeveCss = read('css/features/living-sleeve.css');
    const miniplayerCss = read('css/miniplayer.css');
    const eqModalCss = read('css/eq-modal.css');
    const modalsCss = read('css/modals.css');
    const nostalgiaCss = read('css/nostalgia.css');
    const mobileLayoutCss = read('css/features/mobile-layout.css');
    const editLibraryCss = read('css/edit-library.css');
    const libraryAtelierCss = read('css/features/library-atelier.css');
    const vinylCratesCss = read('css/vinyl-crates.css');
    const mainCss = read('css/main.css');
    const toastCss = read('css/toast-notifications.css');
    const splashCss = read('css/features/splash-loader.css');
    const tutorialsCss = read('css/features/tutorials-modal.css');
    const cloudVaultCss = read('css/features/cloud-vault-modal.css');

    // Reduced motion guards
    assert.match(cinematicCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(angelicCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(splashCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

    // Unified z-index tokens & focus-visible
    for (const token of ['--z-player', '--z-miniplayer', '--z-visualizer', '--z-menu', '--z-modal', '--z-toast', '--z-splash']) {
        assert.match(variablesCss, new RegExp(`${token}:\\s*\\d+`));
    }
    assert.match(variablesCss, /:focus-visible/);
    assert.match(miniplayerCss, /\.mini-center:focus-within/);
    assert.match(cloudVaultCss, /:focus-visible/);

    // 32px seek bar hitbox + touch-action
    assert.match(playerViewCss, /#progress-slider\s*\{[^}]*height:\s*32px[^}]*touch-action:\s*none/s);
    assert.match(playerViewCss, /#volume-slider\s*\{[^}]*touch-action:\s*none/s);
    assert.match(miniplayerCss, /#mini-progress-slider\s*\{[^}]*touch-action:\s*none/s);
    assert.match(eqModalCss, /\.eq-slider\s*\{[^}]*touch-action:\s*none/s);

    // Touch targets & nostalgia 24px squeeze removal
    assert.doesNotMatch(nostalgiaCss, /#player-top-utilities\.header-utilities-bar \.icon-btn/);
    assert.match(mobileLayoutCss, /\.mini-btn\s*\{\s*width:\s*38px;\s*height:\s*40px;\s*\}/);
    assert.match(mobileLayoutCss, /@media\s*\(pointer:\s*coarse\)[\s\S]*\.card-drag-handle[\s\S]*width:\s*36px/);
    assert.match(livingSleeveCss, /\.am-skip-btn,\s*\.living-player\s*\.am-aux-btn\s*\{\s*width:\s*38px;\s*height:\s*38px;/);

    // WCAG AA contrast & 11px floor
    assert.match(livingSleeveCss, /\.sleeve-caption\s*\{[^}]*rgba\(255,\s*255,\s*255,\s*0\.70\)[^}]*font-size:\s*11px/s);
    assert.match(eqModalCss, /\.eq-label\s*\{[^}]*rgba\(255,\s*255,\s*255,\s*0\.72\)/s);

    // Broken CSS token fixes
    assert.doesNotMatch(editLibraryCss, /var\(--primary-color\)/);
    assert.doesNotMatch(toastCss, /var\(--glass-blur/);
    assert.match(toastCss, /var\(--bg-glass-blur,\s*20px\)/);
    assert.match(libraryAtelierCss, /var\(--box-color,\s*#d8c3a7\)/);

    // GPU hygiene & dead rules
    assert.doesNotMatch(angelicCss, /#angelic-view\s*\{\s*position:\s*relative;/);
    assert.doesNotMatch(angelicCss, /will-change:\s*stroke-dashoffset/);
    assert.doesNotMatch(angelicCss, /will-change:\s*opacity,\s*filter/);
    assert.doesNotMatch(playerViewCss, /will-change:\s*color,\s*text-shadow/);
    assert.doesNotMatch(cinematicCss, /\.am-album-art-container|\.am-player-section|\.am-player-inner|\.player-controls-wrap/);
    assert.doesNotMatch(miniplayerCss, /blur\((?:[2-9]\d|\d{3,})px\)/);
    assert.doesNotMatch(modalsCss, /blur\((?:[2-9]\d|\d{3,})px\)/);
    assert.doesNotMatch(vinylCratesCss, /blur\((?:[2-9]\d|\d{3,})px\)/);

    // Modular split of toast-notifications.css
    assert.ok(splashCss.includes('#app-splash-loader'));
    assert.ok(tutorialsCss.includes('.tutorial-modal-content'));
    assert.ok(cloudVaultCss.includes('.cloud-vault-modal-content'));
    assert.doesNotMatch(toastCss, /#app-splash-loader|\.tutorial-modal-content|\.cloud-vault-modal-content/);
    assert.match(
        mainCss,
        /@import '\.\/toast-notifications\.css';\r?\n@import '\.\/features\/splash-loader\.css';\r?\n@import '\.\/features\/tutorials-modal\.css';\r?\n@import '\.\/features\/cloud-vault-modal\.css';/
    );
});
