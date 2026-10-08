# Wavr

Wavr is a personal music player with a visual library, lyric display, equalizer, and full-screen visualizers. It runs in a modern web browser.

## What you can do

- Add audio files from your computer and arrange them in Vinyl Boxes.
- Add or edit album art, song information, and timed `.lrc` lyrics.
- Play music with an equalizer, waveform seek bar, and Media Session controls.
- View and edit the playback queue: Play next, add songs, reorder, remove, or clear it.
- Switch between Cinematic and Angelic visualizer modes.
- Optionally sign in to Cloud Vault to keep your library and settings between devices.

## Getting started

1. Open Wavr in your browser.
2. Select **Add Song** (the `+` button), then choose an audio file. You can also drag audio files onto the page.
3. Press a song cover to start playing in the full player. Back to Library minimizes it; selecting another song keeps the mini player. Click its artwork to expand it again.
4. Use **Edit Library** to group songs into Vinyl Boxes.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play or pause |
| Left / Right | Move backward / forward 5 seconds |
| Up / Down | Change volume |
| B | Trigger Angelic-mode climax effects |

## Your privacy

Without Cloud Vault, your library settings and media stay in this browser on this device. Clearing browser data can remove this local information.

Cloud Vault is optional. If you choose to sign in and upload tracks, Wavr saves song information and account settings with Supabase, while the larger audio files, cover art, and wallpaper are kept private in Cloudflare R2. Wavr requests short-lived media links only after you sign in. This is private storage, not end-to-end encryption: the cloud services process and store the data needed to provide sync.

When you choose **Auto Match** or **Pick Version** for lyrics, Wavr sends the song title and artist you entered or that it detected to LRCLIB to search for lyrics. You can always attach an `.lrc` file yourself instead.

## Run Wavr locally

Wavr requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the address shown in the terminal (normally `http://localhost:3000`). To make a production build:

```bash
npm run build
```

## Three.js rendering

Open `http://localhost:3000/`. Three.js is the default graphics renderer in the main application. The separate preview, renderer comparison toolbar, demo library and legacy Cinematic Canvas/GIF renderer have been removed.

The English UI, existing layout, playback engine, library, equalizer and controls are retained. WebGL gives the existing cover cards and Vinyl Boxes depth, renders the Cinematic LED stage, concert lights, lasers and smoke, and renders Angelic vinyl and giant butterflies. Cinematic fire uses procedural 3D volumes and a fixed GPU ember pool, bursting on strong bass/climax events. Lyrics, staff, florals and CRT overlays remain in DOM/SVG/CSS to preserve their appearance and readability.

Library rendering is demand-driven. Main-page and editor cards share paper jackets with bevelled edges, a grooved record and contact shadows. Vinyl Boxes have a complete matte body, smoked front and up to four physical jackets. Visible rows plus overscan own the active models; 256/512-pixel artwork and its face materials share a bounded inactive cache. The same renderer draws editor drag previews and clips the expanded tray. Labels, selection, menus and organizing controls remain in DOM. See [Library Atelier](docs/library-atelier.md) for implementation and verification.

The normal player combines a physical Living Sleeve with a Chromatic Atelier color field: an album jacket, paper edge and partially exposed grooved record, backed by slow folds of light from the cover palette. The background paints at 30 Hz into a buffer capped near 360,000 pixels and shares the existing GPU context; playback uses the existing audio analysis. Pausing freezes the flow and record after their transitions settle. The glass controls retain all playback actions, lyric focus dims surrounding lines, and hovering the seek bar previews the corresponding lyric without seeking.

Vinyl grooves and smoke use instancing; visualizers cap canvas resolution while DOM text remains at full resolution. A lost WebGL context pauses graphics until Three.js restores it. If WebGL cannot start, music, DOM artwork and lyrics remain usable, with a graphics availability notification. The normal player includes a paper/disc CSS fallback and adapts to a stacked layout on narrow screens. Reduced motion freezes the procedural flow and removes sleeve choreography.

BVTGVNG artist tracks have a 2.4-second reality-tear entrance, with a fast opening, roughly 1.6 seconds to read the approved logo and a quick close. The logo floats with depth and two breathing pulses, a soft halo and delayed optical afterimages made from the same approved SVG. The live Three.js background and sleeve split into two curved, folded surfaces while the original lyrics, controls and toolbar move with them. A local band of softened low-resolution cells, directional color diffusion and a faint pixel veil surrounds the cut; the original SVG logo stays sharp. Portrait screens tear horizontally between artwork and lyrics. It shares the existing graphics context and render loop; playback controls stay interactive. Escape or **Skip intro** dismisses it, and reduced motion omits it. Artist aliases, logo fidelity, horrorcore references and lifecycle behavior are documented in [BVTGVNG intro](docs/bvtgvng-intro.md).

Angelic caches SVG geometry and samples its slow staff wave and floral reveal at 30 Hz using the established motion curves. Breathing changes only the container transform, and WebGL butterflies follow the existing flight paths without per-frame layout reads. Upcoming lyric surfaces are warmed before activation. Mist exits last 240–880 ms according to incoming line density; outgoing geometry and word sway freeze during the dissolve.

Enhanced LRC preserves authored word/end timestamps, sustained vocals, tagged phrases and backing groups. Highlights change at timestamp boundaries and skip hidden modes; normal and Angelic glow share Cinematic's cover palette. Paused entry and seeking synchronize immediately. Run `npm test` for rendering cadence, flame bursts, motion fidelity, lyric timing, library resource ownership, cleanup and context recovery checks, then `npm run build`. Development samples are available on `canvas.wavr-three-canvas` through `data-frame-stats`, `data-lyric-transition-stats` and `data-library-stats` (or enable them with `?perf` in a production build). Frame rates depend on viewport, hardware and effects; the changes do not guarantee sustained 60 FPS.

## Cloud Vault setup (maintainers)

Cloud Vault uses Supabase for authentication and library data, plus a Cloudflare Worker connected to a private R2 bucket for media. Create a Supabase project, put its browser-safe URL and publishable key in `.env.local`, then run [`supabase_schema.sql`](supabase_schema.sql) in the Supabase SQL Editor. Configure the Worker from [`workers/wrangler.jsonc`](workers/wrangler.jsonc), set `MEDIA_SIGNING_KEY` as a Worker secret, and update `ALLOWED_ORIGINS` with the exact deployed site address.

Never put storage-provider secret keys in `VITE_*` variables or any browser file. If an older deployment used an R2 key exposed in frontend code, revoke and replace that key immediately; then migrate any public media before relying on Cloud Vault for private storage.
