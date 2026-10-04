let scale = 1;
const lastTransforms = new WeakMap();

/** Update only the container transform, avoiding inherited CSS-variable invalidation. */
export function updateAngelicBreath(intensity, container) {
    if (!container) return;
    const target = 1 + Math.min(intensity * 0.04, 0.025);
    scale += (target - scale) * (target > scale ? 0.15 : 0.06);
    const transform = `scale(${scale.toFixed(4)}) translateZ(0)`;
    if (lastTransforms.get(container) === transform) return;
    lastTransforms.set(container, transform);
    container.style.transform = transform;
}
