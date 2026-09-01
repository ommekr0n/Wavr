/**
 * AssetPreloader.js
 * Prewarms GPU shaders, SVG path rendering, and font rasterizers for zero-stutter visualizer transitions.
 */

export function preloadAngelicAssets() {
    const dummyContainer = document.createElement('div');
    dummyContainer.style.position = 'absolute';
    dummyContainer.style.top = '-9999px';
    dummyContainer.style.opacity = '0.01';
    dummyContainer.style.pointerEvents = 'none';

    const branchStr = window.WavrFloral && window.WavrFloral.createBranch
        ? window.WavrFloral.createBranch({ angle: 0, scale: 0.1, cy: 1, flower: true }, 0, 10, 0)
        : '';

    const warmUpFireText = `
        <div style="font-family: 'DotGothic16'; filter: url(#fireFilter); font-size: 1rem; width: 10px; height: 10px;">Prewarm</div>
        <div style="font-family: 'Dancing Script'; font-size: 1rem; width: 10px; height: 10px;">Prewarm</div>
    `;

    dummyContainer.innerHTML = `<svg width="10" height="10">${branchStr}</svg>${warmUpFireText}`;
    document.body.appendChild(dummyContainer);
    setTimeout(() => {
        if (dummyContainer.parentNode) dummyContainer.remove();
    }, 2000);
}

export function preloadCinematicAssets() {
    const dummyContainer = document.createElement('div');
    dummyContainer.style.position = 'absolute';
    dummyContainer.style.top = '-9999px';
    dummyContainer.style.opacity = '0.01';
    dummyContainer.style.pointerEvents = 'none';

    dummyContainer.innerHTML = `
        <div class="cinematic-line-wrapper cine-enter">
            <div class="sparkle" style="animation-name: sparkle-shoot;"></div>
            <div class="cinematic-line">
                <span class="cine-word glitch-word-anim" data-text="Prewarm">Prewarm</span>
            </div>
        </div>
    `;

    document.body.appendChild(dummyContainer);
    setTimeout(() => {
        if (dummyContainer.parentNode) dummyContainer.remove();
    }, 2000);
}
