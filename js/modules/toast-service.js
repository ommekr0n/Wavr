let toastTimeout = null;

/**
 * Displays a transient toast notification at the bottom of the screen.
 * @param {string} message - Text content to display inside the toast.
 */
export function showToast(message) {
    let toast = document.getElementById('wavr-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'wavr-toast';
        toast.className = 'wavr-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 2200);
}
