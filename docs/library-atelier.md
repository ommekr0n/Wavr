# Library Atelier

Implemented in the main application on 2026-10-08, following the [upgrade plan](library-three-upgrade-plan.md). Main page and Edit Library use the same Three.js jackets and complete Vinyl Box models. Product labels remain English.

## Appearance and interaction

Jackets use a thin paper body, bevelled edges, an inner sleeve, a partially exposed grooved record, a restrained laminate highlight and a cheap contact shadow. Cover faces preserve the source colors. Hover or keyboard focus briefly raises the jacket and exposes more record; settled objects stop animating. Boxes combine a matte container, smoked front, colored trim and up to four jackets at different depths. Empty editor boxes show an `Add songs` hint.

The collection has a quiet charcoal backdrop with subtle settled color washes and the optional checkerboard. An active custom wallpaper removes the opaque base surface in both library views so the saved image, frost blur and dark tint remain visible. The checkerboard toggle retains its existing saved setting. Metadata, focus rings, selection checks, menus, tray controls and drop outlines remain in DOM. The editor uses a foreground 3D drag preview in the existing graphics context, with a count badge for grouped selection. Valid insertion uses a short jacket slide instead of spinning cover clones.

## Ownership and performance

| Module | Responsibility |
| --- | --- |
| `ThreeLibraryScene` | Models keyed by stable IDs, mode changes, clipped grid/tray passes and foreground drag rendering. |
| `LibraryModelResources` | Shared jacket/crate geometry and structural materials; five used geometries in the isolated library scene. |
| `LibrarySleeveModel` / `LibraryCrateModel` | Physical object assemblies and finite visual feedback. |
| `LibraryArtworkBudget` | Separate 256/512-pixel library textures and cached face materials; refcounts and inactive LRU cleanup. |
| `LibrarySceneBindings` / `LibraryVisibleItems` | Cached DOM anchors, batched visible bounds, IntersectionObserver membership with 220 px overscan. |
| `LibraryVisualState` | Keyboard activation, selection/playing labels and markers, independent of WebGL. |
| Drag and box helpers | Group selection, ghost fallback, insertion cleanup, cancellation and one pointer listener per expanded box. |

The library uses the existing renderer and scheduler. Scroll, focus, layout, artwork loads and finite motion invalidate rendering; settled library views stop drawing. Pointer motion over the same artwork or blank space does not repeatedly redraw the grid. Shared face materials survive home/editor switches to avoid recreating the corresponding shader programs. The old `ThreeArtworkSurfaces` implementation has been removed.

The cache retains at most 16 inactive entries and trims against an estimated 64 MiB target. Active leases are not evicted; this is not a hard limit on total GPU memory. Texture estimates include RGBA mipmaps, not decoded source images or other application resources. Normal-player artwork remains separate. Entering the player or a visualizer suspends the current collection's intersection/resize observers and drag preview while retaining its visible models for a fast return. Switching between home and editor replaces that collection; context loss and disposal release it entirely. Missing images and unavailable WebGL keep the DOM interface usable. Reduced motion resolves feedback immediately and skips drag tilt/insertion choreography.

View changes preserve the canvas drawing buffer when viewport size and pixel ratio are unchanged. Scene cameras and render targets resize on their next activation only if their dimensions changed. Shader groups, including the textured normal-player sleeve, warm in separate idle tasks. Player artwork uploads are capped at 1024 pixels on the longest side, preserving aspect ratio. Audio/UI sampling is capped at 60 Hz and suspends in hidden tabs; the hidden mini-player waveform does no canvas work.

## Verification

`npm test`: **122 passed, 0 failed**. Twelve library-specific regressions cover texture/material ownership, failed/superseded loads, shared geometry, settled motion, visibility cleanup, render-state restoration, stable IDs, box listener lifetime, URL parsing, pointer invalidation and drag cancellation. Nine performance regressions cover repeated view changes without canvas reallocation, per-scene resizing, shader warmup pause/resume, interrupted compilation, disposal, bounded player uploads and suspended collection reuse. Four player progress regressions cover paused mini/full transitions, track selection and preserving seek gestures; four box playback regressions cover identity-preserving library transitions, rapid queue selections with shuffle/repeat changes, fresh box membership and missing tracks. Scheduler tests also cover optional diagnostics without a DOM target. `npm run build` completes successfully with 208 transformed modules.

Browser checks used the real application and an isolated guest-origin lab with mixed empty, one-track and populated boxes. The user library was not changed to create benchmark data.

A guest fixture with library order A–H and box order F, B, H verified repeated skips, shuffle toggles and Repeat Off. The queue continued into the full library; returning to the expanded box and selecting H, F and B played each selected track with no runtime errors. Playback was paused and the temporary fixture removed afterward.

| Check | Observed result |
| --- | --- |
| 24-track fixture | Shared home/editor models; empty and populated crate silhouettes; idle rendering after feedback settles. |
| 120 tracks, 1280 × 720 | 24 active models, 26 active textures, approximately 8.7 MiB estimated texture allocation. |
| 500 tracks, 1280 × 720 | Deep scrolling retained about 30 active models, 30 active textures and 46 total cached entries, approximately 15.3 MiB estimated allocation; five library geometries. |
| Editor organization | Grouped drop preserved both selected IDs; inner reorder, unbox and main-grid reorder produced the intended saved order. Selection cleared after grouping; no remaining ghosts. |
| Box lifecycle | Repeated open/close and mode switches retained artwork and controls. The expanded Delete Box button is visible; restored cards retain their delete handler. |
| Playback and queue | First selection opened the full player; selecting another track after minimizing kept the mini player. Audio played and the queue opened above the artwork. Entering the editor paused playback. |
| Responsive layout | 320 px and 390 px main/editor checks had no horizontal page overflow. Expanded trays remained horizontally scrollable and clipped. The final default 486 px view also had no overflow. |
| Custom wallpaper regression | The saved wallpaper is visible in both library views. Blur/tint sliders respond and the checkerboard toggles independently of the saved image; original 16 px / 35% / enabled settings were restored after checking. The opaque Atelier base is used only without an active wallpaper. |
| Desktop follow-up | Real-app browser viewports of 1366 × 768 and 1920 × 1080 retain the saved six-column layout in main/editor with zero horizontal page overflow. Box expansion, options menu, two-track keyboard selection and its action bar were checked. Full-player playback, queue display, minimizing and selecting another track while minimized worked at Full HD; test playback was paused afterward. |

The resource measurements describe these fixtures and viewports; they are not a frame-rate guarantee. `data-library-stats` records CPU submission cost, rolling average/p95, models, texture estimates and renderer counters. CPU samples include cold texture uploads/shader compilation and are not GPU time or total frame time. Cold startup and viewport changes can still produce spikes. Global renderer geometry counters also include retained player/visualizer assets after those views have been opened.

To reproduce the fixture checks, run the dev server and open `http://127.0.0.1:3000/tools/library-atelier-lab.html`. The lab requires this guest origin and offers 24/120/500-track samples, main/editor switching and an Inspect state control. Use the real app at `http://localhost:3000/` for playback and queue checks. The lab is a development tool, not a production entry point.

## Local visual QA captures

Main-page, editor and queue screenshots are saved locally in `docs/screenshots/`, including desktop captures at 1366 × 768 and 1920 × 1080. This directory is excluded from Git because captures can contain a user's library artwork and custom wallpaper. The checks above cover desktop viewports and interactions, not a separate hardware GPU benchmark.
