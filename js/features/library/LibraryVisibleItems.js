/** Only visible artwork and one nearby row become GPU entities. */
export class LibraryVisibleItems {
    constructor(root, invalidate) {
        this.visible = new Set(); this.nodes = new Set();
        this.observer = new IntersectionObserver(entries => {
            if (this.suspended) return;
            for (const entry of entries) {
                if (entry.isIntersecting) this.visible.add(entry.target);
                else this.visible.delete(entry.target);
            }
            invalidate();
        }, { root, rootMargin: '220px 0px', threshold: 0 });
    }

    suspend() { this.suspended = true; this.observer.disconnect(); }
    resume() {
        if (!this.suspended) return;
        this.suspended = false;
        for (const node of this.nodes) this.observer.observe(node);
    }

    sync(nodes) {
        const root = this.observer.root?.getBoundingClientRect?.();
        for (const node of this.nodes) if (!nodes.has(node)) { this.observer.unobserve(node); this.nodes.delete(node); this.visible.delete(node); }
        for (const node of nodes) if (!this.nodes.has(node)) {
            this.nodes.add(node);
            const rect = node.getBoundingClientRect?.();
            if (rect && rect.width && rect.bottom > Math.max(0, root?.top || 0) - 220 && rect.top < Math.min(globalThis.innerHeight, root?.bottom || globalThis.innerHeight) + 220 && rect.right > 0 && rect.left < globalThis.innerWidth) this.visible.add(node);
            this.observer.observe(node);
        }
    }

    dispose() { this.observer.disconnect(); this.nodes.clear(); this.visible.clear(); }
}
