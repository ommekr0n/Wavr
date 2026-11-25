/**
 * DoodleTutorialController.js
 * Full-screen monochrome chalk doodle coach-mark tutorial with live getBoundingClientRect() tracking.
 */

export const DOODLE_CHALK_COLOR = '#f2efe9';

export const DOODLE_TUTORIAL_STEPS = [
    {
        targetSelector: '#btn-add-song',
        title: '1. Drop Your Tracks & Lyrics',
        body: 'Click + to upload MP3, FLAC, or WAV files and auto-fetch word-synced .lrc lyrics.'
    },
    {
        targetSelector: '#btn-edit-library',
        title: '2. Pack Your 3D Vinyl Crates',
        body: 'Hit the pencil icon to group tracks into custom 3D vinyl crates and organize your shelf.'
    },
    {
        targetSelector: '#btn-cloud-vault-home',
        title: '3. Personal Cloud Vault',
        body: 'Sign in to sync your private tracks, cover art, and lyrics across devices.'
    },
    {
        targetSelector: '#btn-settings',
        title: '4. Customize Grid & Visual Stages',
        body: 'Tune your shelf layout, custom wallpaper, and switch between 4 live visual stages while playing.'
    }
];

function fmt(n) {
    return Math.round(n * 10) / 10;
}

export function buildChalkLoopPath(cx, cy, rx, ry) {
    const topX = fmt(cx - 2);
    const topY = fmt(cy - ry);
    const rightX = fmt(cx + rx);
    const rightY = fmt(cy + 1);
    const bottomX = fmt(cx + 2);
    const bottomY = fmt(cy + ry);
    const leftX = fmt(cx - rx);
    const leftY = fmt(cy - 1);

    const rx2 = rx + 2.5;
    const ry2 = ry + 1.5;

    return [
        `M ${topX} ${topY}`,
        `C ${fmt(cx + rx * 0.65)} ${fmt(cy - ry - 2)}, ${fmt(rightX + 2)} ${fmt(cy - ry * 0.55)}, ${rightX} ${rightY}`,
        `C ${fmt(rightX - 1)} ${fmt(cy + ry * 0.62)}, ${fmt(cx + rx * 0.58)} ${fmt(bottomY + 2)}, ${bottomX} ${bottomY}`,
        `C ${fmt(cx - rx * 0.62)} ${fmt(bottomY - 1)}, ${fmt(leftX - 2)} ${fmt(cy + ry * 0.58)}, ${leftX} ${leftY}`,
        `C ${fmt(leftX + 1)} ${fmt(cy - ry * 0.65)}, ${fmt(cx - rx * 0.55)} ${fmt(topY - 2)}, ${fmt(cx + 3)} ${fmt(topY + 1)}`,
        `C ${fmt(cx + rx2 * 0.62)} ${fmt(cy - ry2)}, ${fmt(cx + rx2)} ${fmt(cy - ry2 * 0.5)}, ${fmt(cx + rx2 - 1)} ${fmt(cy + 2)}`,
        `C ${fmt(cx + rx2 - 2)} ${fmt(cy + ry2 * 0.6)}, ${fmt(cx + rx2 * 0.52)} ${fmt(cy + ry2)}, ${fmt(cx - 2)} ${fmt(cy + ry2 - 1)}`,
        `C ${fmt(cx - rx2 * 0.6)} ${fmt(cy + ry2 - 2)}, ${fmt(cx - rx2)} ${fmt(cy + ry2 * 0.48)}, ${fmt(cx - rx2 + 1)} ${fmt(cy - 2)}`,
        `C ${fmt(cx - rx2 + 2)} ${fmt(cy - ry2 * 0.58)}, ${fmt(cx - rx2 * 0.48)} ${fmt(cy - ry2 + 1)}, ${fmt(cx + 6)} ${fmt(topY + 2)}`
    ].join(' ');
}

export function buildChalkArrowPaths(startX, startY, endX, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    const bendX = fmt(startX + dx * 0.35 + (dx >= 0 ? -14 : 14));
    const bendY = fmt(startY + dy * 0.5);

    const shaftPath = `M ${fmt(startX)} ${fmt(startY)} Q ${bendX} ${bendY} ${fmt(endX)} ${fmt(endY)}`;

    const angle = Math.atan2(endY - bendY, endX - bendX);
    const headLen = 11;
    const spread = 0.52;
    const x1 = fmt(endX - headLen * Math.cos(angle - spread));
    const y1 = fmt(endY - headLen * Math.sin(angle - spread));
    const x2 = fmt(endX - headLen * Math.cos(angle + spread));
    const y2 = fmt(endY - headLen * Math.sin(angle + spread));

    const headPath = `M ${x1} ${y1} L ${fmt(endX)} ${fmt(endY)} L ${x2} ${y2}`;
    return { shaftPath, headPath };
}

export function initDoodleTutorial(modalEl = typeof document !== 'undefined' ? document.getElementById('modal-tutorials') : null) {
    if (!modalEl) return null;

    const doc = modalEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const win = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);

    const getEl = (id) => {
        if (typeof modalEl.querySelector === 'function') {
            const inside = modalEl.querySelector(`#${id}`);
            if (inside) return inside;
        }
        return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
    };

    const svgEl = getEl('doodle-tutorial-svg');
    const noteEl = getEl('doodle-tutorial-note');
    const titleEl = getEl('tutorial-title');
    const bodyEl = getEl('doodle-note-body');
    const prevBtn = getEl('doodle-prev-btn');
    const nextBtn = getEl('doodle-next-btn');
    const counterEl = getEl('doodle-step-counter');
    const openBtn = doc && typeof doc.getElementById === 'function' ? doc.getElementById('btn-open-tutorials') : null;

    let currentStep = 0;

    function isModalOpen() {
        return !modalEl.classList.contains('hidden');
    }

    function measureAndRender() {
        const step = DOODLE_TUTORIAL_STEPS[currentStep] || DOODLE_TUTORIAL_STEPS[0];

        if (titleEl) titleEl.textContent = step.title;
        if (bodyEl) bodyEl.textContent = step.body;
        if (counterEl) counterEl.textContent = `${currentStep + 1} / ${DOODLE_TUTORIAL_STEPS.length}`;
        if (prevBtn) {
            prevBtn.disabled = currentStep === 0;
            prevBtn.setAttribute('aria-disabled', currentStep === 0 ? 'true' : 'false');
        }
        if (nextBtn) {
            const isLast = currentStep === DOODLE_TUTORIAL_STEPS.length - 1;
            nextBtn.textContent = isLast ? 'Done \u2192' : 'Next \u2192';
            nextBtn.setAttribute('aria-label', isLast ? 'Finish tutorial' : 'Next step');
        }

        const viewportW = (win && Number(win.innerWidth)) || 1280;
        const viewportH = (win && Number(win.innerHeight)) || 720;

        if (svgEl && typeof svgEl.setAttribute === 'function') {
            svgEl.setAttribute('viewBox', `0 0 ${viewportW} ${viewportH}`);
        }

        const targetId = step.targetSelector.replace(/^#/, '');
        const targetEl = doc && typeof doc.querySelector === 'function'
            ? doc.querySelector(step.targetSelector)
            : (doc && typeof doc.getElementById === 'function' ? doc.getElementById(targetId) : null);

        const tr = targetEl && typeof targetEl.getBoundingClientRect === 'function'
            ? targetEl.getBoundingClientRect()
            : null;

        let cx = viewportW - 72;
        let cy = 44;
        let rx = 28;
        let ry = 28;
        let targetBottom = 64;

        if (tr && tr.width > 0 && tr.height > 0) {
            cx = tr.left + tr.width / 2;
            cy = tr.top + tr.height / 2;
            rx = tr.width / 2 + 8;
            ry = tr.height / 2 + 8;
            targetBottom = tr.bottom;
        }

        const noteRect = noteEl && typeof noteEl.getBoundingClientRect === 'function'
            ? noteEl.getBoundingClientRect()
            : null;
        const rawNoteW = (noteRect && noteRect.width > 0) ? noteRect.width : Math.min(320, viewportW - 32);
        const noteWidth = Math.min(rawNoteW, Math.max(200, viewportW - 32));
        const maxLeft = Math.max(16, viewportW - noteWidth - 16);
        const desiredLeft = cx - noteWidth / 2;
        const noteLeft = Math.min(maxLeft, Math.max(16, desiredLeft));
        const noteTop = Math.max(16, Math.min(viewportH - 150, targetBottom + 44));

        if (noteEl && noteEl.style) {
            noteEl.style.left = `${fmt(noteLeft)}px`;
            noteEl.style.top = `${fmt(noteTop)}px`;
            noteEl.style.maxWidth = `${Math.max(200, viewportW - 32)}px`;
        }

        const arrowStartX = Math.min(viewportW - 24, Math.max(24, noteLeft + noteWidth / 2));
        const arrowStartY = Math.max(targetBottom + 16, noteTop - 8);
        const arrowEndX = cx;
        const arrowEndY = targetBottom + 8;

        const loopD = buildChalkLoopPath(cx, cy, rx, ry);
        const { shaftPath, headPath } = buildChalkArrowPaths(arrowStartX, arrowStartY, arrowEndX, arrowEndY);
        const maskCutoutD = `M 0 0 H ${fmt(viewportW)} V ${fmt(viewportH)} H 0 Z M ${fmt(cx - rx)} ${fmt(cy)} A ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)} A ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)} Z`;

        if (svgEl) {
            svgEl.innerHTML = [
                `<path class="doodle-spotlight-mask" d="${maskCutoutD}" fill="rgba(6, 7, 10, 0.68)" fill-rule="evenodd" />`,
                `<path class="doodle-chalk-stroke doodle-chalk-loop" d="${loopD}" fill="none" stroke="${DOODLE_CHALK_COLOR}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`,
                `<path class="doodle-chalk-stroke doodle-chalk-arrow" d="${shaftPath}" fill="none" stroke="${DOODLE_CHALK_COLOR}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />`,
                `<path class="doodle-chalk-stroke doodle-chalk-arrowhead" d="${headPath}" fill="none" stroke="${DOODLE_CHALK_COLOR}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`
            ].join('');
        }

        return {
            stepIndex: currentStep,
            step,
            viewportW,
            viewportH,
            cx,
            cy,
            rx,
            ry,
            arrowEndX,
            arrowEndY,
            noteLeft,
            noteTop
        };
    }

    function goToStep(index) {
        const clamped = Math.max(0, Math.min(DOODLE_TUTORIAL_STEPS.length - 1, index));
        currentStep = clamped;
        return measureAndRender();
    }

    function nextStep() {
        if (currentStep >= DOODLE_TUTORIAL_STEPS.length - 1) {
            modalEl.classList.add('hidden');
            return null;
        }
        return goToStep(currentStep + 1);
    }

    function prevStep() {
        if (currentStep <= 0) return measureAndRender();
        return goToStep(currentStep - 1);
    }

    function reset() {
        return goToStep(0);
    }

    if (prevBtn && typeof prevBtn.addEventListener === 'function') {
        prevBtn.addEventListener('click', (e) => {
            e?.stopPropagation?.();
            prevStep();
        });
    }

    if (nextBtn && typeof nextBtn.addEventListener === 'function') {
        nextBtn.addEventListener('click', (e) => {
            e?.stopPropagation?.();
            nextStep();
        });
    }

    if (openBtn && typeof openBtn.addEventListener === 'function') {
        openBtn.addEventListener('click', () => {
            currentStep = 0;
            modalEl.classList.remove('hidden');
            measureAndRender();
        });
    }

    const onKeyDown = (event) => {
        if (!isModalOpen()) return;
        if (event.key === 'ArrowRight') {
            event.preventDefault?.();
            event.stopPropagation?.();
            nextStep();
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault?.();
            event.stopPropagation?.();
            prevStep();
        }
    };

    if (doc && typeof doc.addEventListener === 'function') {
        doc.addEventListener('keydown', onKeyDown);
    }

    const onResize = () => {
        if (isModalOpen()) measureAndRender();
    };

    if (win && typeof win.addEventListener === 'function') {
        win.addEventListener('resize', onResize);
    }

    const ObserverCtor = (win && win.MutationObserver) || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    let mutationObserver = null;
    if (ObserverCtor && typeof modalEl === 'object') {
        mutationObserver = new ObserverCtor(() => {
            if (isModalOpen()) {
                measureAndRender();
            }
        });
        if (typeof mutationObserver.observe === 'function') {
            try {
                mutationObserver.observe(modalEl, { attributes: true, attributeFilter: ['class'] });
            } catch {
                // Ignore non-DOM mock elements in unit tests
            }
        }
    }

    const ResizeObserverCtor = (win && win.ResizeObserver) || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : null);
    let resizeObserver = null;
    if (ResizeObserverCtor && doc && typeof doc.getElementById === 'function') {
        const homeView = doc.getElementById('home-view');
        if (homeView) {
            resizeObserver = new ResizeObserverCtor(() => {
                if (isModalOpen()) measureAndRender();
            });
            try {
                resizeObserver.observe(homeView);
            } catch {
                // Ignore non-DOM mock elements in unit tests
            }
        }
    }

    measureAndRender();

    return {
        goToStep,
        nextStep,
        prevStep,
        reset,
        measureAndRender,
        getCurrentStep: () => currentStep,
        dispose() {
            if (doc && typeof doc.removeEventListener === 'function') {
                doc.removeEventListener('keydown', onKeyDown);
            }
            if (win && typeof win.removeEventListener === 'function') {
                win.removeEventListener('resize', onResize);
            }
            mutationObserver?.disconnect?.();
            resizeObserver?.disconnect?.();
        }
    };
}
