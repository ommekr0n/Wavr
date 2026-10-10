/** Cache progress controls once; synchronize only visible controls that are not being dragged. */
export function createPlayerProgressView({
    playerView, progressSlider, progressBarFill, miniPlayer, miniSlider,
    isFullDragging, isMiniDragging, drawMiniWaveform
}) {
    return percent => {
        if (!playerView.classList.contains('hidden') && !isFullDragging()) {
            progressSlider.value = percent;
            progressBarFill.style.width = `${percent}%`;
        }
        if (miniSlider && !miniPlayer.classList.contains('hidden') && !isMiniDragging()) {
            miniSlider.value = percent;
            drawMiniWaveform(percent);
        }
    };
}
