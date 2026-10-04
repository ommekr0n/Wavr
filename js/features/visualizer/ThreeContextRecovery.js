import { setGraphicsAvailability } from './GraphicsAvailability.js';

/** Three.js restores its GPU resources; restart drawing only after that restoration. */
export function attachThreeContextRecovery(controller, signal) {
    const canvas = controller.renderer.domElement;
    canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        controller.setEnabled(false);
        setGraphicsAvailability('recovering');
    }, { signal });
    canvas.addEventListener('webglcontextrestored', () => {
        controller.setEnabled(true);
        setGraphicsAvailability('ready');
    }, { signal });
}
