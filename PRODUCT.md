# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Music listeners and lyric enthusiasts on desktop and mobile browsers who want a personal, locally-first or cloud-synced audio library with synchronized word-level lyrics, custom visualizers, and screen-recorded music videos.

## Product Purpose

Wavr is a web-based music player and visual lyric atelier. It lets users organize tracks into vinyl crates, play local or private cloud-hosted audio with a 5-band equalizer and live waveform scrubbing, and experience songs through multiple synchronized visual modes (Living Sleeve, Nostalgia, Cinematic CRT, and Angelic floral/staff animations).

## Positioning

Unlike generic streaming web players, Wavr combines:
- Client-side Web Audio DSP (5-band EQ, AudioWorklet/FFT frequency band analysis, climax onset detection) driving real-time Three.js WebGL scenes and synchronized syllable/word-level LRC lyrics.
- Local-first playback with an optional private Cloud Vault (Supabase Auth + PostgreSQL + Cloudflare R2 signed media gateway) where users retain ownership of their tracks, artwork, and lyrics.

## Operating Context

- Runs as a Vite-bundled ES module web application (`index.html`, `js/`, `css/`).
- Supports offline/local file playback (`Blob` / IndexedDB wallpapers and waveform peak cache) alongside optional Cloud Vault sync via Supabase (`supabase_schema.sql`) and Cloudflare Worker (`workers/wavr-media-gateway.js`).
- Used on both desktop viewports and mobile portrait/landscape viewports (`100dvh`, safe-area insets, touch scrubbing).

## Capabilities and Constraints

- **Audio & Playback**: HTML5 `<audio>` + Web Audio API 5-band EQ, `PlaybackEngine`, `QueueManager`, shuffle/repeat, Media Session integration, and on-demand waveform peak decoding.
- **Lyrics**: Standard and enhanced word-level LRC parsing (`lyric-parser.js`), LRCLIB lookup (`lrc-fetcher.js`), adjustable lyric drift ratio, click/keyboard-to-seek, and Twemoji rendering.
- **Visual Modes**: Three.js Living Sleeve & Chromatic Atelier (`three`), Reality Tear transition, Cinematic mode, Nostalgia mode, and Angelic mode.
- **Recording**: Client-side screen/audio recording via `MediaRecorder` (`recorder.js`).
- **Architecture Constraints**: Modular ES modules (`js/core/`, `js/features/`, `js/modules/`, `js/services/`, `js/shared/`), zero `console.log` in production builds, and strict XSS/CSP/signed-URL security boundaries.

## Brand Commitments

- **Name**: Wavr
- **Assets**: Custom SVG logo/favicon (`assets/images/favicon.svg`), BVTGVNG artist intro assets (`assets/images/bvtgvng-original-traced.svg`), bundled self-hosted fonts (`ShantellSans`, `Yomogi`, `dearpix-2-01.otf`).
- **Visual Identity**: Dark atmospheric audio atelier with dynamic album-art palette extraction (`--blob-*-color`).

## Evidence on Hand

- Verified codebase (`index.html`, `js/`, `css/`, `workers/wavr-media-gateway.js`, `supabase_schema.sql`).
- Automated Node verification suite (`tools/verify-*.mjs`, 216 tests).
- No external user testimonials, pricing, or marketing claims exist; none may be fabricated.

## Product Principles

1. **Immediate Playability**: Selecting a track opens and plays without blocking on secondary metadata or transient network hiccups.
2. **Modular Separation**: Core audio, WebGL rendering, feature controllers, and styling remain decoupled into focused single-purpose modules.
3. **Resilient Fallbacks**: WebGL context loss, worker failures, missing artwork, and offline states degrade gracefully without breaking playback.
4. **Inclusive Controls**: All dialogs, sliders, transport controls, and reduced-motion preferences remain usable across keyboard, screen reader, and touch devices.

## Accessibility & Inclusion

- Target WCAG 2.1 AA across keyboard navigation, modal dialog semantics (`role="dialog"`, `aria-modal="true"`, focus trapping & restoration), `:focus-visible` indicators, text contrast (`>= 4.5:1`), touch targets (`>= 36–44px` on mobile/coarse pointers, `32px` seek hitbox), and `prefers-reduced-motion` support.
