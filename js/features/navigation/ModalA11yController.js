/**
 * ModalA11yController.js
 * Centralizes focus management and Tab focus trapping for all [role="dialog"]
 * modal wrappers (.modal, #eq-modal) via MutationObserver.
 */

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(', ');

function isElementVisible(el) {
    if (!el || el.hidden) return false;
    if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') {
        return false;
    }
    if (el.classList?.contains('hidden')) return false;
    if (typeof el.closest === 'function') {
        const hiddenAncestor = el.closest('.hidden, [hidden]');
        if (hiddenAncestor) return false;
    }
    if (typeof globalThis.getComputedStyle === 'function') {
        try {
            const style = globalThis.getComputedStyle(el);
            if (style && (style.display === 'none' || style.visibility === 'hidden')) {
                return false;
            }
        } catch {
            // Ignore in minimal DOM test environments
        }
    }
    return true;
}

/**
 * Returns visible, keyboard-focusable elements inside a container.
 * @param {Element|null} container
 * @returns {Element[]}
 */
export function getFocusableElements(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return [];
    const candidates = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
    return candidates.filter((el) => {
        if (!isElementVisible(el)) return false;
        const tabIndexAttr = typeof el.getAttribute === 'function' ? el.getAttribute('tabindex') : null;
        if (tabIndexAttr !== null && Number.parseInt(tabIndexAttr, 10) < 0) return false;
        return true;
    });
}

function getModalFocusTarget(modal) {
    const focusables = getFocusableElements(modal);
    if (focusables.length > 0) return focusables[0];
    const panel = modal.querySelector?.('.modal-content, .eq-panel, [role="dialog"]') || modal;
    if (typeof panel.getAttribute === 'function' && panel.getAttribute('tabindex') === null) {
        panel.setAttribute('tabindex', '-1');
    }
    return panel;
}

function resolveModalWrapper(el) {
    if (!el) return null;
    if (el.classList?.contains('modal') || el.classList?.contains('modal-backdrop') || el.id === 'eq-modal') {
        return el;
    }
    if (typeof el.closest === 'function') {
        const ancestor = el.closest('.modal, .modal-backdrop, #eq-modal');
        if (ancestor) return ancestor;
    }
    return el;
}

/**
 * Attaches MutationObservers to all modal dialog wrappers to manage focus
 * entry, Tab/Shift+Tab trapping, and focus restoration on close.
 *
 * @param {Document|Element} [root=document]
 * @returns {{ dispose: () => void }}
 */
export function initModalA11y(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') {
        return { dispose() {} };
    }

    const doc = root.ownerDocument || root;
    const MutationObserverCtor = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (typeof MutationObserverCtor !== 'function') {
        return { dispose() {} };
    }

    const modalWrappers = new Set();
    root.querySelectorAll('[role="dialog"], .modal, #eq-modal').forEach((el) => {
        const wrapper = resolveModalWrapper(el);
        if (wrapper) modalWrappers.add(wrapper);
    });

    const openStack = [];
    const stateByModal = new Map();

    const handleKeyDown = (e) => {
        if (e.key !== 'Tab' || openStack.length === 0) return;
        const activeModal = openStack[openStack.length - 1];
        if (!activeModal || activeModal.classList?.contains('hidden')) return;

        const focusables = getFocusableElements(activeModal);
        if (focusables.length === 0) {
            e.preventDefault();
            const fallback = getModalFocusTarget(activeModal);
            fallback?.focus?.();
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const current = doc.activeElement;
        const insideModal = Boolean(current && typeof activeModal.contains === 'function' && activeModal.contains(current));

        if (e.shiftKey) {
            if (!insideModal || current === first) {
                e.preventDefault();
                last.focus?.();
            }
        } else if (!insideModal || current === last) {
            e.preventDefault();
            first.focus?.();
        }
    };

    let trapInstalled = false;
    const ensureTrapInstalled = () => {
        if (!trapInstalled && typeof doc.addEventListener === 'function') {
            doc.addEventListener('keydown', handleKeyDown);
            trapInstalled = true;
        }
    };
    const removeTrapIfEmpty = () => {
        if (trapInstalled && openStack.length === 0 && typeof doc.removeEventListener === 'function') {
            doc.removeEventListener('keydown', handleKeyDown);
            trapInstalled = false;
        }
    };

    const onModalOpened = (modal) => {
        const existingIdx = openStack.indexOf(modal);
        if (existingIdx !== -1) openStack.splice(existingIdx, 1);

        const prevEl = doc.activeElement || null;
        stateByModal.set(modal, { isOpen: true, previousActiveElement: prevEl });
        openStack.push(modal);
        ensureTrapInstalled();

        const target = getModalFocusTarget(modal);
        target?.focus?.();
    };

    const onModalClosed = (modal) => {
        const prevState = stateByModal.get(modal);
        stateByModal.set(modal, { isOpen: false, previousActiveElement: null });

        const idx = openStack.indexOf(modal);
        if (idx !== -1) openStack.splice(idx, 1);
        removeTrapIfEmpty();

        const prevEl = prevState?.previousActiveElement;
        if (prevEl && prevEl.isConnected !== false && typeof prevEl.focus === 'function') {
            prevEl.focus();
        }
    };

    const observer = new MutationObserverCtor((mutations) => {
        const seen = new Set();
        for (const mutation of mutations) {
            const modal = mutation.target;
            if (!modal || seen.has(modal)) continue;
            seen.add(modal);

            const prevOpen = Boolean(stateByModal.get(modal)?.isOpen);
            const nowOpen = !modal.classList?.contains('hidden');
            if (!prevOpen && nowOpen) {
                onModalOpened(modal);
            } else if (prevOpen && !nowOpen) {
                onModalClosed(modal);
            }
        }
    });

    modalWrappers.forEach((modal) => {
        const initiallyOpen = !modal.classList?.contains('hidden');
        stateByModal.set(modal, { isOpen: initiallyOpen, previousActiveElement: null });
        if (initiallyOpen) {
            openStack.push(modal);
            ensureTrapInstalled();
        }
        observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    });

    return {
        dispose() {
            observer.disconnect();
            openStack.length = 0;
            removeTrapIfEmpty();
            stateByModal.clear();
        }
    };
}
