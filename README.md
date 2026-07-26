# Wavr 🎵 — Your Personal Music Visualizer & Gallery

> **Wavr** transforms your personal music collection into an immersive, highly visual, and emotional audio experience right inside your browser.

---

## 🚀 [Update] Latest Release Notes

- 🖼️ **Custom Wallpaper Background Engine**: Upload any custom image as your personal background across Home and Edit Library views.
  - **Smart Resolution Processing**: Images larger than 1920×1080 automatically trigger an interactive 16:9 Canvas Cropping modal. Undersized images are seamlessly upscaled with high-quality smoothing.
  - **Glass Frost & Overlay Controls**: Adjust **Glass Frost Blur** (0–40px) and **Dark Overlay Tint** (0–90%) sliders in Settings for maximum legibility and glassmorphic depth.
  - **Checkerboard Toggle**: Easily toggle the signature 240px conic-gradient checkerboard background pattern on/off.
- 📦 **Reborn 3D Vinyl Crate Shelf**: Expanded Vinyl Box view redesigned with an ultra-smooth spring slide animation, 1:1 proportioned album tiles with hover play overlays, and refined glassmorphic aesthetics.
- 🌊 **Real-Time Audio Waveform Auto-Sync**: Upgraded transient peak + RMS audio decoding for the Mini Player waveform seekbar with automatic cache refresh when returning from Edit Library.
- ⚡ **Audio State Safety & Workflow**: Automatically pauses playback and hides the Mini Player when entering Edit Library to prevent audio desync and provide a clean editing experience.

---

## 🌟 Visualizer & Player Experience

- 📦 **Interactive Vinyl Boxes**: Organize and group your favorite tracks into tactile, draggable Vinyl Boxes for an intuitive gallery experience.
- 🪽 **Angelic Mode**: A poetic visualizer featuring dynamic fluid staff lines, blooming floral branches, soaring giant butterflies, and water ripple bursts synced perfectly to musical climaxes.
- 🎬 **Cinematic Mode**: An immersive concert visualizer with 3D stage lighting, ambient smoke particle physics, and dynamic LED pillars reacting live to your music's beat.
- 📜 **Synchronized Lyrics**: Load `.lrc` files to enjoy smoothly scrolling, karaoke-style lyrics perfectly timed with your audio.
- 🎛️ **Audio Equalizer**: Custom multi-band EQ with built-in sound presets (Pop, Rock, Bass Boost, Flat...) to tailor your audio experience.
- 🔒 **100% Local & Private**: Everything runs entirely in your local browser. Your audio files and personal media are never uploaded to any remote server.

---

## 📖 User Guide

### 1. Adding & Managing Songs
1. Click the **`+`** button in the main library header to load local audio files (`.mp3`, `.wav`, `.flac`).
2. **Wavr** automatically reads track titles, artist names, and album cover art.
3. To attach `.lrc` lyric files or update cover art manually, click the **`⋮` (Options)** button on any song card and select **Edit Metadata**.

### 2. Launching Visualizers
- Click the **Mini Player** at the bottom of your screen to expand into full-screen visualizer mode.
- Use the **Angelic Mode** or **Cinematic Mode** icons on the top control bar to switch visual themes on the fly.

### 3. Keyboard Controls
| Key | Action |
| :--- | :--- |
| **`Space`** | Play / Pause playback |
| **`Left / Right Arrows`** | Skip backward / forward 5 seconds |
| **`Up / Down Arrows`** | Increase / Decrease volume |
| **`B`** | *[Angelic Mode]* Manually trigger Giant Butterfly & Water Ripple climax combo |

---

## 🛠 Quick Start

Wavr is lightweight and ready to run out of the box:

1. **Instant Launch:** Open `index.html` directly in any modern web browser (Chrome, Edge, Firefox, Safari).
2. **Dev Mode (Local Server):**
   ```bash
   npm run dev
   ```
