/** Dismiss the recording chooser before Escape reaches the underlying player. */
export function dismissRecordingPopover(root = document) {
    const popover = root.getElementById('record-popover');
    if (!popover || popover.classList.contains('hidden')) return false;
    popover.classList.remove('active');
    popover.classList.add('hidden');
    return true;
}
