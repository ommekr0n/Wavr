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

test('Mutual-exclusion mode switching, DOM node cleanup on mode exit, and offscreen target/compositor release', async (t) => {
    const savedDoc = globalThis.document;
    globalThis.document = {
        body: { classList: { add() {}, remove() {}, contains: () => false } },
        getElementById: () => null,
        addEventListener() {},
        removeEventListener() {}
    };
    t.after(() => { globalThis.document = savedDoc; });
    const playerEventBindingsJs = read('js/features/player/PlayerEventBindings.js');
    const visualizerControllerJs = read('js/features/visualizer/VisualizerController.js');
    const threeRendererControllerJs = read('js/features/visualizer/ThreeRendererController.js');
    const playerViewCss = read('css/player-view.css');
    const angelicCss = read('css/angelic.css');
    const cinematicCss = read('css/cinematic.css');
    const variablesCss = read('css/variables.css');
    const indexHtml = read('index.html');

    // 1. Mutual-exclusion mode switching in PlayerEventBindings.js
    assert.match(
        playerEventBindingsJs,
        /btnCinematic\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*if\s*\(VisualizerController\.getIsAngelicMode\(\)\)\s*\{\s*VisualizerController\.exitAngelicMode\(angelicView,\s*playerView,\s*angelicTextContainer,\s*angelicParticleContainer\);\s*\}/
    );
    assert.match(
        playerEventBindingsJs,
        /btnAngelic\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*if\s*\(VisualizerController\.getIsCinematicMode\(\)\)\s*\{\s*VisualizerController\.exitCinematicMode\(cinematicView,\s*playerView,\s*cinematicTextContainer\);\s*removeVignetteOverlay\(\);\s*\}/
    );

    // 2. Immediate DOM node cleanup in VisualizerController.js
    assert.match(visualizerControllerJs, /cinematicTextContainer\.replaceChildren\(\)/);
    assert.match(visualizerControllerJs, /angelicTextContainer\.replaceChildren\(\)/);
    assert.match(visualizerControllerJs, /angelicParticleContainer\.replaceChildren\(\)/);

    const { VisualizerController } = await import('../js/features/visualizer/VisualizerController.js');
    const makeContainer = (count) => {
        const nodes = Array.from({ length: count }, () => ({ remove() {} }));
        return {
            children: nodes,
            classList: { add() {}, remove() {}, contains: () => false },
            querySelectorAll: () => [],
            replaceChildren(...next) { this.children = next; }
        };
    };
    const playerView = makeContainer(0);
    const cinematicView = makeContainer(0);
    const angelicView = makeContainer(0);
    const cineText = makeContainer(12);
    const angelText = makeContainer(18);
    const angelParticles = makeContainer(25);

    VisualizerController.enterAngelicMode(playerView, angelicView, -1, [], () => {}, () => {});
    assert.equal(VisualizerController.getIsAngelicMode(), true);
    VisualizerController.exitAngelicMode(angelicView, playerView, angelText, angelParticles);
    assert.equal(VisualizerController.getIsAngelicMode(), false);
    assert.equal(angelText.children.length, 0);
    assert.equal(angelParticles.children.length, 0);

    VisualizerController.enterCinematicMode(playerView, cinematicView, -1, [], () => {});
    assert.equal(VisualizerController.getIsCinematicMode(), true);
    VisualizerController.exitCinematicMode(cinematicView, playerView, cineText);
    assert.equal(VisualizerController.getIsCinematicMode(), false);
    assert.equal(cineText.children.length, 0);

    // 3. Offscreen target release in ThreeRendererController.syncMode & mobile warmup guard
    assert.match(threeRendererControllerJs, /this\.atelier\.target\.setSize\(1,\s*1\)/);
    assert.match(threeRendererControllerJs, /this\.viewport\.scenes\.delete\(this\.atelier\)/);
    assert.match(threeRendererControllerJs, /this\.tear\.target\.setSize\(1,\s*1\)/);
    assert.match(threeRendererControllerJs, /this\.viewport\.scenes\.delete\(this\.tear\)/);
    assert.match(threeRendererControllerJs, /matchMedia\('\(pointer: coarse\) and \(max-width: 900px\)'\)\.matches/);

    const { RendererViewport } = await import('../js/core/rendering/three/RendererViewport.js');
    const viewport = new RendererViewport();
    const renderer = { setDrawingBufferSize() {} };
    const makeTargetModule = () => ({
        resizes: 0,
        target: {
            width: 1,
            height: 1,
            setSize(w, h) { this.width = w; this.height = h; }
        },
        resize(w, h) {
            this.resizes++;
            this.target.setSize(w, h);
        }
    });
    const atelier = makeTargetModule();
    const tear = makeTargetModule();
    const stage = makeTargetModule();

    // Entering player mode sizes atelier and tear to full resolution
    viewport.sync(renderer, 1280, 720, 1, [atelier, tear]);
    assert.deepEqual([atelier.target.width, atelier.target.height], [1280, 720]);
    assert.deepEqual([tear.target.width, tear.target.height], [1280, 720]);
    assert.equal(atelier.resizes, 1);
    assert.equal(tear.resizes, 1);

    // Leaving player mode shrinks offscreen targets to 1x1 and evicts from viewport.scenes
    atelier.target.setSize(1, 1);
    viewport.scenes.delete(atelier);
    tear.target.setSize(1, 1);
    viewport.scenes.delete(tear);
    viewport.sync(renderer, 1280, 720, 1, [stage]);
    assert.deepEqual([atelier.target.width, atelier.target.height], [1, 1]);
    assert.deepEqual([tear.target.width, tear.target.height], [1, 1]);

    // Re-entering player mode restores full target resolution automatically
    viewport.sync(renderer, 1280, 720, 1, [atelier, tear]);
    assert.deepEqual([atelier.target.width, atelier.target.height], [1280, 720]);
    assert.deepEqual([tear.target.width, tear.target.height], [1280, 720]);
    assert.equal(atelier.resizes, 2);
    assert.equal(tear.resizes, 2);

    // 4. Hidden view compositor layers & heading hierarchy
    assert.match(playerViewCss, /\.view-container\.hidden\s+#player-bg-glow\s*\{\s*display:\s*none\s*!important;\s*animation:\s*none\s*!important;\s*\}/);
    assert.match(angelicCss, /\.view-container\.hidden\s+#angelic-bg\s*\{\s*display:\s*none\s*!important;\s*animation:\s*none\s*!important;\s*\}/);
    assert.match(cinematicCss, /\.view-container\.hidden\s+\.crt-lines,[\s\S]*?\.view-container\.hidden\s+\.crt-noise\s*\{\s*display:\s*none\s*!important;\s*animation:\s*none\s*!important;\s*\}/);
    assert.match(variablesCss, /h1\s*\{\s*font-size:\s*2rem;\s*\}\s*h2\s*\{\s*font-size:\s*1\.5rem;\s*\}\s*h3\s*\{\s*font-size:\s*1\.2rem;\s*\}/);
    assert.match(indexHtml, /id="btn-cloud-vault-home"[^>]*background:\s*#07222b/);
});

test('initDoodleTutorial renders 4 English steps, single-color #f2efe9 chalk SVG loop/arrow via getBoundingClientRect(), mobile clamping, and step navigation with zero console.log', async () => {
    const html = read('index.html');
    const tutorialsCss = read('css/features/tutorials-modal.css');
    const doodleJs = read('js/features/splash/DoodleTutorialController.js');
    const bootstrapperJs = read('js/features/splash/AppBootstrapper.js');
    const dismissalJs = read('js/features/splash/TutorialDismissal.js');

    // Zero console.log in splash/tutorial modules
    for (const [name, src] of [
        ['DoodleTutorialController.js', doodleJs],
        ['AppBootstrapper.js', bootstrapperJs],
        ['TutorialDismissal.js', dismissalJs]
    ]) {
        assert.doesNotMatch(src, /\bconsole\.log\s*\(/, `${name} must not contain console.log`);
    }

    // Verify HTML markup in #modal-tutorials
    assert.match(html, /id="modal-tutorials"\s+class="modal hidden"/);
    assert.match(html, /class="modal-content tutorial-modal-content"\s+role="dialog"\s+aria-modal="true"\s+aria-labelledby="tutorial-title"/);
    assert.match(html, /<svg[^>]*id="doodle-tutorial-svg"[^>]*class="doodle-tutorial-svg"[^>]*aria-hidden="true"/);
    assert.match(html, /<div[^>]*id="doodle-tutorial-note"[^>]*class="doodle-tutorial-note"/);
    assert.match(html, /<h2[^>]*id="tutorial-title"[^>]*class="doodle-note-title"/);
    assert.match(html, /<p[^>]*id="doodle-note-body"[^>]*class="doodle-note-body modal-subtitle"/);
    for (const btnId of ['doodle-prev-btn', 'doodle-next-btn', 'btn-finish-tutorials', 'btn-close-tutorials']) {
        const match = html.match(new RegExp(`<button[^>]*\\bid="${btnId}"[^>]*>`));
        assert.ok(match, `Expected button #${btnId} in #modal-tutorials`);
        assert.match(match[0], /\btype="button"/);
        assert.match(match[0], /\baria-label="[^"]+"/);
    }

    // Verify CSS overlay, monochrome #f2efe9 palette, self-hosted Shantell Sans / Yomogi font, and reduced-motion guard
    assert.match(tutorialsCss, /width:\s*100vw/);
    assert.match(tutorialsCss, /height:\s*100dvh/);
    assert.match(tutorialsCss, /background:\s*transparent/);
    assert.match(tutorialsCss, /'Shantell Sans',\s*'Yomogi',\s*cursive/);
    assert.match(tutorialsCss, /#f2efe9/i);
    assert.match(tutorialsCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

    const {
        initDoodleTutorial,
        DOODLE_TUTORIAL_STEPS,
        DOODLE_CHALK_COLOR
    } = await import('../js/features/splash/DoodleTutorialController.js');

    assert.equal(DOODLE_CHALK_COLOR, '#f2efe9');
    assert.equal(DOODLE_TUTORIAL_STEPS.length, 4);
    assert.deepEqual(
        DOODLE_TUTORIAL_STEPS.map((s) => ({ targetSelector: s.targetSelector, title: s.title })),
        [
            { targetSelector: '#btn-add-song', title: '1. Drop Your Tracks & Lyrics' },
            { targetSelector: '#btn-edit-library', title: '2. Pack Your 3D Vinyl Crates' },
            { targetSelector: '#btn-cloud-vault-home', title: '3. Personal Cloud Vault' },
            { targetSelector: '#btn-settings', title: '4. Customize Grid & Visual Stages' }
        ]
    );

    const makeButton = (id) => {
        const listeners = new Map();
        const attrs = new Map();
        return {
            id,
            textContent: '',
            disabled: false,
            setAttribute(k, v) { attrs.set(k, String(v)); },
            getAttribute(k) { return attrs.get(k) ?? null; },
            addEventListener(type, fn) {
                if (!listeners.has(type)) listeners.set(type, []);
                listeners.get(type).push(fn);
            },
            click() {
                for (const fn of listeners.get('click') || []) fn({ stopPropagation() {} });
            }
        };
    };

    const targetRects = {
        '#btn-add-song': { left: 320, top: 20, width: 40, height: 40, bottom: 60, right: 360 },
        '#btn-edit-library': { left: 268, top: 20, width: 40, height: 40, bottom: 60, right: 308 },
        '#btn-cloud-vault-home': { left: 80, top: 20, width: 130, height: 40, bottom: 60, right: 210 },
        '#btn-settings': { left: 216, top: 20, width: 40, height: 40, bottom: 60, right: 256 }
    };

    const svgAttrs = new Map();
    const svgEl = {
        id: 'doodle-tutorial-svg',
        innerHTML: '',
        setAttribute(k, v) { svgAttrs.set(k, String(v)); },
        getAttribute(k) { return svgAttrs.get(k) ?? null; }
    };
    const noteEl = {
        id: 'doodle-tutorial-note',
        style: {},
        getBoundingClientRect: () => ({ width: 300, height: 90 })
    };
    const titleEl = { id: 'tutorial-title', textContent: '' };
    const bodyEl = { id: 'doodle-note-body', textContent: '' };
    const counterEl = { id: 'doodle-step-counter', textContent: '' };
    const prevBtn = makeButton('doodle-prev-btn');
    const nextBtn = makeButton('doodle-next-btn');
    const openBtn = makeButton('btn-open-tutorials');

    const docListeners = new Map();
    const winListeners = new Map();
    const mockWin = {
        innerWidth: 360,
        innerHeight: 640,
        addEventListener(type, fn) {
            if (!winListeners.has(type)) winListeners.set(type, []);
            winListeners.get(type).push(fn);
        },
        removeEventListener(type, fn) {
            const arr = winListeners.get(type) || [];
            winListeners.set(type, arr.filter((f) => f !== fn));
        }
    };

    const elById = new Map([
        ['doodle-tutorial-svg', svgEl],
        ['doodle-tutorial-note', noteEl],
        ['tutorial-title', titleEl],
        ['doodle-note-body', bodyEl],
        ['doodle-step-counter', counterEl],
        ['doodle-prev-btn', prevBtn],
        ['doodle-next-btn', nextBtn],
        ['btn-open-tutorials', openBtn]
    ]);

    const mockDoc = {
        defaultView: mockWin,
        getElementById(id) {
            return elById.get(id) || null;
        },
        querySelector(sel) {
            if (targetRects[sel]) {
                return { getBoundingClientRect: () => targetRects[sel] };
            }
            return elById.get(sel.replace(/^#/, '')) || null;
        },
        addEventListener(type, fn) {
            if (!docListeners.has(type)) docListeners.set(type, []);
            docListeners.get(type).push(fn);
        },
        removeEventListener(type, fn) {
            const arr = docListeners.get(type) || [];
            docListeners.set(type, arr.filter((f) => f !== fn));
        },
        dispatchKey(key) {
            for (const fn of docListeners.get('keydown') || []) {
                fn({ key, preventDefault() {}, stopPropagation() {} });
            }
        }
    };

    const classSet = new Set(['modal']);
    const modalEl = {
        id: 'modal-tutorials',
        ownerDocument: mockDoc,
        classList: {
            contains: (c) => classSet.has(c),
            add: (c) => classSet.add(c),
            remove: (c) => classSet.delete(c)
        },
        querySelector(sel) {
            return elById.get(sel.replace(/^#/, '')) || null;
        }
    };

    const controller = initDoodleTutorial(modalEl);

    // Step 1 alignment and mobile horizontal clamping (viewport 360px, noteWidth 300px => clamped to [16, 44])
    assert.equal(controller.getCurrentStep(), 0);
    assert.equal(titleEl.textContent, '1. Drop Your Tracks & Lyrics');
    assert.equal(counterEl.textContent, '1 / 4');
    assert.equal(prevBtn.disabled, true);
    assert.equal(svgEl.getAttribute('viewBox'), '0 0 360 640');
    assert.equal(noteEl.style.left, '44px');
    assert.equal(noteEl.style.top, '104px');

    // Verify SVG paths use only #f2efe9 strokes and point to (cx=340, tr.bottom+8=68)
    const strokes = [...svgEl.innerHTML.matchAll(/stroke="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(strokes.length >= 3);
    for (const color of strokes) {
        assert.equal(color.toLowerCase(), '#f2efe9');
    }
    assert.match(svgEl.innerHTML, /340 68/);

    // Advance through steps 2, 3, 4 via next button and ArrowRight/ArrowLeft
    nextBtn.click();
    assert.equal(controller.getCurrentStep(), 1);
    assert.equal(titleEl.textContent, '2. Pack Your 3D Vinyl Crates');
    assert.equal(counterEl.textContent, '2 / 4');
    assert.equal(prevBtn.disabled, false);

    mockDoc.dispatchKey('ArrowRight');
    assert.equal(controller.getCurrentStep(), 2);
    assert.equal(titleEl.textContent, '3. Personal Cloud Vault');
    assert.equal(counterEl.textContent, '3 / 4');

    mockDoc.dispatchKey('ArrowLeft');
    assert.equal(controller.getCurrentStep(), 1);

    mockDoc.dispatchKey('ArrowRight');
    mockDoc.dispatchKey('ArrowRight');
    assert.equal(controller.getCurrentStep(), 3);
    assert.equal(titleEl.textContent, '4. Customize Grid & Visual Stages');
    assert.equal(counterEl.textContent, '4 / 4');
    assert.match(nextBtn.textContent, /Done/);

    // Clicking next on last step closes #modal-tutorials
    nextBtn.click();
    assert.equal(modalEl.classList.contains('hidden'), true);

    // Clicking #btn-open-tutorials resets to Step 1 and opens #modal-tutorials
    openBtn.click();
    assert.equal(modalEl.classList.contains('hidden'), false);
    assert.equal(controller.getCurrentStep(), 0);
    assert.equal(titleEl.textContent, '1. Drop Your Tracks & Lyrics');

    controller.dispose();
});
