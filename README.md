# Wavr

Wavr is a personal music player with a visual library, lyric display, equalizer, and full-screen visualizers. It runs in a modern web browser.

## What you can do

- Add audio files from your computer and arrange them in Vinyl Boxes.
- Add or edit album art, song information, and timed `.lrc` lyrics.
- Play music with an equalizer, waveform seek bar, and Media Session controls.
- Switch between Cinematic and Angelic visualizer modes.
- Optionally sign in to Cloud Vault to keep your library and settings between devices.

## Getting started

1. Open Wavr in your browser.
2. Select **Add Song** (the `+` button), then choose an audio file. You can also drag audio files onto the page.
3. Press a song cover to start playing. Open the mini player for the full-screen visualizer.
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

## Cloud Vault setup (maintainers)

Cloud Vault uses Supabase for authentication and library data, plus a Cloudflare Worker connected to a private R2 bucket for media. Create a Supabase project, put its browser-safe URL and publishable key in `.env.local`, then run [`supabase_schema.sql`](supabase_schema.sql) in the Supabase SQL Editor. Configure the Worker from [`workers/wrangler.jsonc`](workers/wrangler.jsonc), set `MEDIA_SIGNING_KEY` as a Worker secret, and update `ALLOWED_ORIGINS` with the exact deployed site address.

Never put storage-provider secret keys in `VITE_*` variables or any browser file. If an older deployment used an R2 key exposed in frontend code, revoke and replace that key immediately; then migrate any public media before relying on Cloud Vault for private storage.
