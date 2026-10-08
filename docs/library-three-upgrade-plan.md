# Main page and library editor: Three.js upgrade plan

Status: implemented in the main application on 2026-10-08. See [implementation and verification](library-atelier.md) for the final modules, browser checks and measured resource counts. The sections below retain the design baseline and intended behavior.

## Direction

Extend the normal player's Living Sleeve / Chromatic Atelier language into a physical record collection. Album artwork remains the visual focus. Song cards should resemble printed jackets; Vinyl Boxes should have a recognizable body, interior and actual sleeves. The main page presents the collection; the editor presents the same collection with clear selection and organizing controls.

Keep the existing grid, saved column setting, user order, track IDs, box contents and colors, playback presentation flow, queue, uploads and persistence. All product labels remain English. The scope is presentation and interaction feedback, not a playback or storage rewrite.

## Before this upgrade

| Area | Current implementation | Implication for this upgrade |
| --- | --- | --- |
| Home artwork | `ThreeArtworkSurfaces.js` places shallow rounded meshes over DOM image rectangles using an orthographic camera. The cover face uses `MeshBasicMaterial`; only the edges receive lighting. | More Three.js alone will not improve the cover: the jacket silhouette, paper edge, material and contact shadow need deliberate redesign. |
| Vinyl Boxes | `vinyl-crates.css` builds the crate from CSS-transformed cover layers and one translucent `.glass-front`. WebGL replaces individual cover rectangles, not the crate body. | Covers and the container have separate depth systems. Replace the whole crate illustration with one coherent 3D assembly. |
| Library editor | `ThreeRendererController.js` hides the canvas in `edit` mode and does not run its scheduler. | The editor needs its own scene bindings to the same models, renderer and resource ownership. |
| Card presentation | Home and editor share dark, bordered `.song-card` tiles and duplicate the sleeve/box markup in their grid renderers. | Give artwork more room and share the model specification across both views. Keep actions and metadata in DOM. |
| Scrolling and layout | A dirty sync scans artwork nodes, acquires textures for all of them and reads their bounds; scrolling dirties the whole surface set. | Bound active models and textures to visible rows plus a small overscan region. Cache anchors and coalesce layout work. |
| Organizing | The editor uses DOM hit testing, FLIP reordering, selection rectangles and cloned DOM drag ghosts. Adding songs to a box currently shrinks and rotates cover clones through 720 degrees. | Preserve the organizing logic. Add explicit render-state events and a 3D drag representation; use a short physical insertion into a slot. |

These baseline findings came from the repository before implementation. The browser results for the replacement are recorded in [implementation and verification](library-atelier.md).

## Song cards

- Replace the heavy tile appearance with a square album jacket above clean title/artist metadata. Keep a transparent DOM hit area and stable grid dimensions.
- Use a thin paper edge, restrained bevel, a slight offset of the inner sleeve and a soft contact shadow. Reuse the visual language of `LivingSleeveBody.js`, with shared geometry and simpler library materials.
- Keep the authored cover colors and text legible. Use a restrained laminate highlight rather than coloring the entire cover with a hover glow.
- Rest: a nearly front-facing jacket with a visible bottom/right edge. All cards stay still once their entry settles.
- Hover or keyboard focus: raise the jacket slightly and tilt at most about 3 degrees; reveal a narrow record edge. Animate only the active card for roughly 180–240 ms.
- Now playing: a persistent, quiet marker beside the title and a restrained record detail. Avoid spinning every library card.
- Selected in the editor: a high-contrast outline and check mark. The selection state must be readable without color or motion alone.
- Touch: use tap/focus feedback instead of depending on hover. Keep artwork proportions stable on narrow grids.

## Vinyl Boxes

- Model the complete container: bottom, side walls, rear wall, front lip, interior and a small inset label. Start with a dark matte body and a smoked acrylic front; use box color on trim and label accents.
- Give the box a fixed, gentle viewing angle so its depth is visible before hovering. Define empty, one-song and full-box silhouettes separately.
- Show up to four representative jackets, seated at different depths with visible paper spines. Distinct cover art must remain visible; extra songs appear through the existing DOM track count.
- Hover/focus: the front jacket rises slightly and the rear jackets separate by a small amount. Keep the container grounded with a stable contact shadow.
- Open: spread the representative jackets briefly, then expand the existing inline grid row into a browsing tray. Keep song titles, playback buttons, menus and the tray scroll interaction in DOM.
- Close: return to the same box position without moving the whole collection or changing its saved order.
- Drop target in the editor: expose a slot and a clear outline before release. After a valid drop, slide a jacket into that slot over roughly 220–320 ms and update the count. Avoid the current spinning/shrinking gesture.
- Empty box: show the actual interior and a clear English action such as `Add songs`, rather than an unexplained blank square.

## Main page

- Replace the strong checkerboard emphasis with a quiet charcoal surface, very subtle grain and settled washes of cover color. Respect custom wallpapers and the current theme settings.
- Use a consistent light direction and contact shadows so jackets and crates appear to belong to the same collection.
- Keep the header actions, saved grid density and mini player in their familiar places. Improve spacing and metadata hierarchy around the new artwork.
- A mild local light change can follow the focused object and settle when focus moves. The library background should not run a permanent animated flow.
- Keep first selection opening the normal player and subsequent selections preserving the minimized view. Queue ordering must remain independent of artwork rendering.

## Library editor

- Use the same jacket and crate assets as the main page; emphasize selection, drag handles, target outlines and batch actions.
- Keep single selection, rectangle selection, multi-selection, grid reorder, box grouping, inner-box reorder/unboxing, menus, rename and delete behavior.
- Build a reusable drag visual using the same renderer: one raised jacket, or a short stack with a count badge for multiple selections. Keep the DOM drag engine responsible for pointer capture, drop eligibility and state changes.
- Hide or dim the original 3D entity while dragging and draw the drag visual in a foreground pass. Do not create a WebGL renderer for the ghost.
- Handle DOM fallback ghosts explicitly: clones must not inherit `.three-surface-ready` and lose their artwork. The inner-box drag path needs the same treatment.
- Freeze pointer-driven tilt during selection, reordering and drag so visible artwork and hit targets do not disagree.
- Animate FLIP movement and 3D anchors from the same transition state; do not run a competing spring that follows old bounds.
- Expose equivalent keyboard/menu organizing actions and visible touch controls. Reduced motion retains selection and target feedback without tilt or insertion choreography.

## Rendering architecture

Use the existing single `WebGLRenderer` and `RenderScheduler`. Add modules rather than extending the existing orchestrators with model and interaction logic, following `RULES.md`.

Proposed responsibilities and files:

| Proposed module | Responsibility |
| --- | --- |
| `js/core/rendering/three/ThreeLibraryScene.js` | Active scene, lights, view switches and entity ownership. |
| `js/core/rendering/three/LibrarySleeveModel.js` | Shared jacket, paper edge and lightweight record geometry/materials. |
| `js/core/rendering/three/LibraryCrateModel.js` | Complete crate assembly, slots and bounded cover previews. |
| `js/core/rendering/three/LibraryObjectMotion.js` | Finite hover, focus, open, insertion and drag motion. |
| `js/core/rendering/three/LibraryDragVisual.js` | Foreground drag representation and its cleanup. |
| `js/core/rendering/three/LibraryArtworkBudget.js` | Resolution tiers, texture leases and a bounded inactive cache. |
| `js/features/library/LibrarySceneBindings.js` | Map stable song/box IDs and DOM anchors to render entities. |
| `js/features/library/LibraryVisibleItems.js` | Visible-row membership, overscan and batched geometry reads. |
| `js/features/library/LibraryVisualState.js` | Shared focus, selection, playing, expanded and drop-target state. |
| `css/features/library-atelier.css` | Layout, metadata, accessible controls and DOM fallback styling. |

Home/editor DOM remains the source of layout, semantic controls and hit targets. The scene renders artwork in aligned slots. Clip grid and tray graphics to their scroll regions so jackets cannot paint over the header, metadata, modal controls or mini player. A drag visual deliberately uses a separate foreground pass with its own clipping rules.

Bind by stable IDs, not by array positions or transient DOM clones. Grid rendering, drag, box expansion and playback publish narrow visual-state changes. View switches release old bindings and observers while retaining only deliberately shared geometry/materials. Existing files import and wire the new modules.

## Performance targets and limits

- Render on changes: load, hover/focus, scroll, resize, selection, reorder and finite animations. Once settled, idle redraws stop. This follows the [official Three.js rendering-on-demand guidance](https://threejs.org/manual/pages/rendering-on-demand.html).
- Use a visible region plus about one row of overscan. Being outside the viewport must prevent both new high-resolution texture acquisition and active motion work.
- Start with 256/512-pixel library artwork tiers and smaller crate previews. Preserve the normal player's higher-resolution artwork separately. Evaluate an initial 64 MiB library texture budget using estimated allocation and observed renderer counts; it is a tuning target, not a measured guarantee.
- Share geometry/materials for repeated crate parts and sleeve edges. Consider instancing those parts after profiling. Different cover textures require an explicit atlas/batching strategy; ordinary instancing does not automatically batch unrelated cover materials.
- Start with lightweight lit materials, cheap contact shadows and a restrained acrylic highlight. Evaluate heavier refraction or postprocessing only if a measured visual benefit justifies its cost.
- Coalesce scroll/pointer invalidations into one pending frame. Read needed layout bounds together before writing transforms; avoid observing per-frame style changes that feed back into another layout scan.
- Use the existing resolution caps and context recovery. Disable optional motion and lower pixel density before sacrificing artwork readability on slower devices.
- Release texture leases, geometries, materials, observers, listeners and transient drag entities explicitly. Removing meshes alone does not free GPU resources: [official disposal guidance](https://threejs.org/manual/pages/how-to-dispose-of-objects.html).
- Benchmark 24, 120 and 500 tracks with mixed empty/populated boxes. Record frame-time distribution, input response, draw calls and texture counts. Initial goals are fluid desktop interaction near 60 FPS on the reference machine and a stable lower-cost mobile tier; report actual results rather than promising a universal frame rate.

## Implementation order

1. **Art direction prototype:** use the actual app grid with a jacket, an empty box, a one-song box and a four-cover box. Include resting, focused, selected and drop-target states. Validate silhouette, readable artwork and material consistency with Living Sleeve before adding elaborate motion.
2. **Main page integration:** replace home artwork and crate illustrations with shared assets, add visibility/texture budgeting, and refine background, spacing and metadata. Validate selection-to-player and mini-player flow.
3. **Editor integration:** enable the library scene in edit mode, connect selection and drop states, implement drag visuals and synchronize reorder/unboxing. Preserve state and persistence behavior.
4. **Box tray and transition polish:** align open/close, scrolling and physical insertion across both views. Keep motion short and reversible on rapid interactions.
5. **Verification and cleanup:** run functional, accessibility, responsive, resource-lifetime and performance checks; remove superseded illustration code only once its replacement and DOM fallback work.

The first reviewable milestone is the actual song card and box appearance in the existing grid. That is the priority over an animated background or additional decoration.

## Acceptance checklist

- Home and editor use the same recognizable jacket/crate design and preserve all artwork, labels, box colors and counts.
- Original metadata is not tinted away or stretched. Long titles remain usable at 320/390 px and desktop widths; controls are accessible by keyboard and touch.
- First playback opens full player; later minimized selections stay minimized. Queue contents, order and current-track identity are unaffected by visual updates.
- Single/multiple selection, drag threshold, canceled drag, reorder, grouping, inner-box reorder/unboxing and Save/Done retain the correct IDs and saved order.
- Empty and populated boxes open/close repeatedly; rapid switching does not leave duplicate listeners, invisible images, stale anchors or stray ghosts.
- Scroll/resize and FLIP transitions do not detach meshes from their DOM slots or paint over UI outside the scroll region.
- The current editor playback-stop behavior remains intact unless separately changed.
- Missing covers, failed WebGL, context loss and reduced motion retain a usable DOM interface.
- Idle rendering settles; moving through a large library does not grow active texture/model counts with the entire library size.
- Repeat home/editor/player/visualizer transitions and verify resource counts stabilize. Run the appropriate automated regressions and production build, then report measured browser results.
