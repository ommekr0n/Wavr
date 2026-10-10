/** Preserve the drawing buffer across view changes; resize each scene only when needed. */
export class RendererViewport {
    constructor() { this.scenes = new WeakMap(); }

    sync(renderer, width, height, ratio, modules) {
        if (this.width !== width || this.height !== height || this.ratio !== ratio) {
            // Unlike setPixelRatio + setSize, this allocates the drawing buffer only once.
            renderer.setDrawingBufferSize(width, height, ratio);
            this.width = width; this.height = height; this.ratio = ratio;
        }
        for (const module of modules) {
            const previous = this.scenes.get(module);
            if (previous?.width === width && previous?.height === height && previous?.ratio === ratio) continue;
            module.resize(width, height);
            this.scenes.set(module, { width, height, ratio });
        }
    }
}
