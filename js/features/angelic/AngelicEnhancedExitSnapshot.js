/** Read all word poses before writing; future words must stay dim during the dissolve. */
export function snapshotAngelicEnhancedExit(wrapper) {
    const poses = Array.from(wrapper.querySelectorAll?.('.has-enhanced-word') || [], word => {
        const style = getComputedStyle(word);
        return { word, opacity: style.opacity, transform: style.transform };
    });
    for (const { word, opacity, transform } of poses) {
        word.style.setProperty('--exit-word-opacity', opacity);
        word.style.setProperty('--exit-word-transform', transform);
    }
}
