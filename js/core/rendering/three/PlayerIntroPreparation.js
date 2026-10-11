/** Prepare the actual player buffers and both screen/offscreen shader variants before the intro clock starts. */
export class PlayerIntroPreparation {
    constructor(owner, { yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
        this.owner = owner; this.yieldTask = yieldTask;
        this.ready = false; this.pending = null; this.version = 0;
    }

    prepare(width, height) {
        const owner = this.owner, renderer = owner.renderer;
        if (!owner.enabled || document.hidden) return Promise.resolve(false);
        owner.viewport.resizeModules(width, height, renderer.getPixelRatio(), [owner.atelier, owner.sleeve, owner.tear]);
        // Resizing disposes GPU storage, so initialize the current sizes even when shaders are already ready.
        renderer.initRenderTarget(owner.atelier.target);
        renderer.initRenderTarget(owner.tear.target);
        if (this.ready) return Promise.resolve(true);
        if (this.pending) return this.pending;
        const version = this.version;
        const phases = [
            [owner.atelier.target, () => owner.warmScene(owner.atelier)],
            [null, () => owner.warmScene(owner.atelier, owner.atelier.displayScene)],
            [null, () => owner.warmSleeve()],
            [owner.tear.target, () => owner.warmScene(owner.atelier, owner.atelier.displayScene)],
            [owner.tear.target, () => owner.warmSleeve()],
            [null, () => owner.warmScene(owner.tear)]
        ];
        const run = async () => {
            for (const [target, compile] of phases) {
                await this.yieldTask();
                if (version !== this.version || !owner.enabled || document.hidden) return false;
                const previous = renderer.getRenderTarget();
                let compiling;
                try {
                    renderer.setRenderTarget(target);
                    compiling = compile();
                } finally { renderer.setRenderTarget(previous); }
                await compiling;
            }
            if (version !== this.version || !owner.enabled || document.hidden) return false;
            this.ready = true;
            return true;
        };
        const pending = run().finally(() => { if (this.pending === pending) this.pending = null; });
        this.pending = pending;
        return pending;
    }

    reset() { this.version++; this.ready = false; this.pending = null; }
}
