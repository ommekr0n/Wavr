const samples = new WeakMap();

/** Opt-in browser evidence for active leases, submission cost and settled rendering. */
export function recordLibraryRender(renderer, collection) {
    if (!(import.meta.env?.DEV || new URLSearchParams(globalThis.location?.search).has('perf'))) return;
    const costs = samples.get(collection) || [];
    costs.push(performance.now() - (collection.frameStart || performance.now()));
    if (costs.length > 90) costs.shift();
    samples.set(collection, costs);
    const sorted = costs.slice().sort((a, b) => a - b);
    renderer.domElement.dataset.libraryStats = JSON.stringify({
        mode: collection.mode,
        models: collection.entries.size,
        activeTextures: [...collection.budget.entries.values()].filter(entry => entry.refs > 0).length,
        cachedTextures: collection.budget.entries.size,
        textureMiB: +(collection.budget.bytes / 1024 / 1024).toFixed(1),
        gpuTextures: renderer.info.memory.textures,
        geometries: renderer.info.memory.geometries,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        cpuMs: +(costs.reduce((sum, cost) => sum + cost, 0) / costs.length).toFixed(2),
        p95CpuMs: +sorted[Math.floor(sorted.length * .95)].toFixed(2),
    });
}
