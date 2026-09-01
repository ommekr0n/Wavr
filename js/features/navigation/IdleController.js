/**
 * IdleController.js
 * Automatically fades out header controls and cursor during full-screen playback after 3s of inactivity.
 */

export function setupIdleAutoHide() {
    const header = document.querySelector('.app-header');
    if (!header) return;

    const IDLE_DELAY = 3000;
    let idleTimer = null;
    let _playerOpen = false;

    const fullscreenViews = [
        document.getElementById('player-view'),
        document.getElementById('cinematic-view'),
        document.getElementById('angelic-view'),
    ].filter(Boolean);

    function showControls() {
        fullscreenViews.forEach(v => v.classList.remove('cursor-idle'));
        header.classList.remove('header-hidden');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(hideControls, IDLE_DELAY);
    }

    function hideControls() {
        fullscreenViews.forEach(v => v.classList.add('cursor-idle'));
        header.classList.add('header-hidden');
    }

    document.addEventListener('mousemove', () => {
        if (_playerOpen) showControls();
    }, { passive: true });

    header.addEventListener('mouseenter', () => {
        if (!_playerOpen) return;
        clearTimeout(idleTimer);
        header.classList.remove('header-hidden');
    });

    header.addEventListener('mouseleave', () => {
        if (!_playerOpen) return;
        idleTimer = setTimeout(hideControls, IDLE_DELAY);
    });

    window._idleSetPlayerOpen = function(open) {
        _playerOpen = open;
        if (open) {
            showControls();
        } else {
            clearTimeout(idleTimer);
            header.classList.remove('header-hidden');
            fullscreenViews.forEach(v => v.classList.remove('cursor-idle'));
        }
    };
}
