import * as THREE from 'three';
import { describeLibraryCard } from '../../../features/library/LibrarySceneBindings.js';
import { LibrarySleeveModel } from './LibrarySleeveModel.js';
import { LibraryCrateModel } from './LibraryCrateModel.js';

/** Foreground artwork shares the library's context and texture leases. */
export class LibraryDragVisual {
    constructor(resources, budget, invalidate) { this.resources = resources; this.budget = budget; this.invalidate = invalidate; }

    start(source, ghost) {
        this.clear();
        const description = describeLibraryCard(source);
        if (!description) return;
        this.ghost = ghost; this.anchor = ghost.querySelector(description.crate ? '.vinyl-box-visual' : '.song-cover-wrapper, .song-card-inner');
        if (!this.anchor) return;
        this.leases = description.urls.map(url => this.budget.acquire(url, description.crate ? 256 : 512));
        this.model = description.crate ? new LibraryCrateModel(this.resources, this.leases, description.color) : new LibrarySleeveModel(this.resources, this.leases[0]);
        if (!description.crate && ghost.querySelector('.library-drag-count')) {
            for (let i = 1; i <= 2; i++) {
                const paper = new THREE.Mesh(this.resources.jacket, this.resources.inner);
                paper.position.set(-i * .024, i * .02, -i * .04); paper.rotation.z = i * .025;
                this.model.group.add(paper);
            }
        }
        this.scene = new THREE.Scene(); this.scene.add(this.model.group, new THREE.AmbientLight(0xffffff, 1.5));
        const light = new THREE.DirectionalLight(0xffefdb, 2); light.position.set(-300, 400, 800); this.scene.add(light);
        this.invalidate();
    }

    update(width, height, reducedMotion = false) {
        if (!this.model || !this.ghost?.isConnected) { this.clear(); return; }
        const rect = this.anchor.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height) * (this.model instanceof LibraryCrateModel ? 1 : .92);
        this.model.group.position.set(rect.left + rect.width / 2 - width / 2, height / 2 - rect.top - rect.height / 2, 100);
        this.model.group.scale.setScalar(size); this.model.update(reducedMotion ? 0 : .7);
        this.model.group.visible = this.model.ready;
        this.ghost.classList.toggle('library-ghost-ready', this.model.ready);
    }

    render(renderer, camera) { if (this.model?.group.visible) { renderer.clearDepth(); renderer.render(this.scene, camera); } }

    clear() {
        this.ghost?.classList.remove('library-ghost-ready'); this.model?.dispose();
        this.leases?.forEach(lease => this.budget.release(lease));
        this.model = null; this.leases = []; this.ghost = null; this.scene = null;
    }
}
