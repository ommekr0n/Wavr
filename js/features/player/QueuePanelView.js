import coverImgUrl from '../../../assets/images/cover.png';
import { escapeHtml, safeImageUrl } from '../../modules/safe-html.js';

const paths = {
    up: '<path d="m6 14 6-6 6 6"/>', down: '<path d="m6 10 6 6 6-6"/>',
    remove: '<path d="m6 6 12 12M6 18 18 6"/>',
    next: '<path d="m5 6 9 6-9 6V6Z"/><path d="M18 5v14"/>',
    add: '<path d="M12 5v14M5 12h14"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const cover = track => `<img src="${escapeHtml(safeImageUrl(track.cover, coverImgUrl))}" alt="" loading="lazy">`;
const meta = track => `<span class="queue-track-meta"><strong>${escapeHtml(track.title || 'Unknown Title')}</strong><span>${escapeHtml(track.artist || 'Unknown Artist')}</span></span>`;
const actionButton = (action, index, title, glyph, disabled = false) =>
    `<button type="button" class="queue-row-action" data-action="${action}" data-index="${index}" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}" ${disabled ? 'disabled' : ''}>${icon(glyph)}</button>`;

export function createQueueDialog() {
    const dialog = document.createElement('dialog');
    dialog.id = 'queue-dialog';
    dialog.className = 'queue-dialog';
    dialog.setAttribute('aria-labelledby', 'queue-heading');
    dialog.innerHTML = `
        <header class="queue-header"><div><p>YOUR LISTENING SESSION</p><h2 id="queue-heading">Queue</h2></div>
            <button type="button" class="queue-row-action" data-action="close" aria-label="Close queue" title="Close queue">${icon('remove')}</button>
        </header>
        <div class="queue-scroll">
            <section class="queue-current-section" aria-labelledby="queue-current-heading">
                <h3 id="queue-current-heading">Now playing</h3><div id="queue-current"></div>
            </section>
            <section aria-labelledby="queue-next-heading">
                <div class="queue-section-heading"><h3 id="queue-next-heading">Up next <span id="queue-count"></span></h3>
                    <button type="button" class="queue-text-button" data-action="clear" title="Clear queue and keep the current track">Clear queue</button></div>
                <ol id="queue-upcoming" class="queue-track-list"></ol>
                <p id="queue-empty" class="queue-empty" hidden>You're all caught up. Add something to keep listening.</p>
            </section>
            <details class="queue-library"><summary>Add songs</summary>
                <input id="queue-search" type="search" placeholder="Search your library" aria-label="Search songs to add to queue" autocomplete="off">
                <ul id="queue-library-tracks" class="queue-track-list"></ul>
            </details>
        </div>
        <footer class="queue-footer"><p id="queue-mode"></p><span id="queue-announcement" role="status" aria-live="polite"></span></footer>`;
    document.body.appendChild(dialog);
    return dialog;
}

export function renderQueue(dialog, state, upcoming, playbackState) {
    const current = state.source[state.index];
    dialog.querySelector('.queue-current-section').hidden = !current;
    dialog.querySelector('#queue-current').innerHTML = current ?
        `<div class="queue-current-track">${cover(current)}${meta(current)}<span class="queue-playing-badge">${playbackState === 'playing' ? 'Playing' : 'Paused'}</span></div>` : '';
    dialog.querySelector('#queue-count').textContent = String(upcoming.length);
    dialog.querySelector('[data-action="clear"]').disabled = state.source.length <= (current ? 1 : 0);
    dialog.querySelector('#queue-empty').hidden = upcoming.length > 0;
    dialog.querySelector('#queue-upcoming').innerHTML = upcoming.map(({ track, index }, position) => `
        <li class="queue-track" data-queue-index="${index}">
            <button type="button" class="queue-play-track" data-action="play" data-index="${index}" aria-label="${escapeHtml(`Play ${track.title || 'track'}`)}">
                <span class="queue-position">${position + 1}</span>${cover(track)}${meta(track)}
            </button><div class="queue-row-actions">
                ${actionButton('up', index, `Move up: ${track.title}`, 'up', position === 0)}
                ${actionButton('down', index, `Move down: ${track.title}`, 'down', position === upcoming.length - 1)}
                ${actionButton('remove', index, `Remove from queue: ${track.title}`, 'remove')}
            </div>
        </li>`).join('');
}

export function renderQueueLibrary(dialog, tracks, query = '') {
    const search = query.trim().toLocaleLowerCase();
    const matching = tracks.map((track, index) => ({ track, index })).filter(({ track }) =>
        `${track.title || ''} ${track.artist || ''}`.toLocaleLowerCase().includes(search));
    dialog.querySelector('#queue-library-tracks').innerHTML = matching.map(({ track, index }) => `
        <li class="queue-library-track">${cover(track)}${meta(track)}<div class="queue-row-actions">
            ${actionButton('add-next', index, `Play next: ${track.title}`, 'next')}
            ${actionButton('add-last', index, `Add to queue: ${track.title}`, 'add')}
        </div></li>`).join('') || '<li class="queue-empty">No songs found in your library.</li>';
}

export function updateQueuePlaybackBadge(dialog, state) {
    const badge = dialog.querySelector('.queue-playing-badge');
    if (badge) badge.textContent = state === 'playing' ? 'Playing' : state === 'loading' ? 'Loading' : 'Paused';
}
