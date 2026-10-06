/** Dismiss the guide from either visible control, its backdrop, or Escape. */
export function setupTutorialDismissal(modal) {
    if (!modal) return;
    const close = () => modal.classList.add('hidden');
    modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('#btn-close-tutorials, #btn-dismiss-tutorials')) {
            close();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.classList.contains('hidden')) close();
    });
}
