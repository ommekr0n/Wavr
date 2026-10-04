const jobs = new WeakMap();

export function cancelAngelicLyricPreparation(container) {
    const job = jobs.get(container);
    if (!job) return;
    clearTimeout(job.timer);
    if (job.idle !== null) window.cancelIdleCallback(job.idle);
    jobs.delete(container);
}

/** Build the next line after the current pop/dissolve peak, before its deadline. */
export function scheduleAngelicLyricPreparation(container, prepare, secondsToLine) {
    cancelAngelicLyricPreparation(container);
    const anchor = container.querySelector('.angelic-line-wrapper:not(.angelic-prebuilt):not(.ink-wash-exit)');
    const job = { timer: null, idle: null };
    const run = () => {
        if (jobs.get(container) !== job) return;
        jobs.delete(container);
        if (anchor?.isConnected && !document.getElementById('angelic-view').classList.contains('hidden')) prepare();
    };
    const delay = Math.min(1050, Math.max(0, secondsToLine * 1000 - 500));
    job.timer = setTimeout(() => {
        if ('requestIdleCallback' in window) job.idle = window.requestIdleCallback(run, { timeout: 150 });
        else run();
    }, delay);
    jobs.set(container, job);
}
