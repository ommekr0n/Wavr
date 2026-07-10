# Wavr - Premium Web Music Player

Wavr is a premium, immersive web-based music player designed with a Cyberpunk/Neon aesthetic. It features a seamless user experience, glowing UI elements, a cinematic visualizer mode, and fully local playback.

## ✨ Features

- **Neon Cyberpunk UI**: A stunning dark mode interface with Electric Cyan glowing accents and smooth micro-animations.
- **Cinematic Visualizer Mode**: Dive into your music with a distraction-free, full-screen player mode featuring fluid transitions and synchronized lyrics.
- **Local Audio Support**: Upload your own `.mp3`, `.wav`, or `.flac` files directly from your computer. No server uploads—everything plays locally for maximum privacy and performance.
- **Smart Metadata Extraction**: Automatically reads cover art, title, and artist information from your audio files using `jsmediatags`.
- **Lyric Support**: Load `.lrc` files to display perfectly synchronized, karaoke-style scrolling lyrics.
- **Advanced Queue Management**: 
  - Drag-and-drop to reorder tracks.
  - Shuffle and Repeat (All / Track 1) modes with dynamic SVG icons.
  - Interactive progress bar for precise seeking.
- **Mini Player**: Keeps your music controls accessible while browsing your library.

## 🚀 Tech Stack

- **HTML5 & Vanilla JavaScript**: Pure web technologies, ensuring a lightweight and blazing-fast experience.
- **CSS3 (Variables & Grid/Flexbox)**: Fully responsive and easy to theme using centralized CSS variables.
- **jsmediatags**: Integrated for reading ID3 tags from local audio files directly in the browser.
- **SortableJS**: Powers the smooth drag-and-drop track reordering.

## 🛠 Setup & Installation

Since Wavr is a purely client-side application, setup is incredibly simple:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ommekr0n/Wavr.git
   ```
2. **Open the project:**
   Simply open `index.html` in any modern web browser.
3. **Optional (Live Server):**
   If you want to modify the code, using an extension like VSCode Live Server is recommended to prevent CORS issues with local file loading.

## 📝 Usage

- **Add Songs**: Click the **"Add new song"** button to upload an audio file. You can let the app extract metadata automatically, or manually upload a corresponding cover image and `.lrc` lyric file.
- **Edit Info**: Click the 3-dots icon on any song to edit its title, artist, or replace its cover art/lyric file seamlessly.
- **Cinematic Mode**: Click anywhere on the track information in the Mini Player to enter the full-screen visualizer.
- **Lockdown UI**: The app is designed to feel like a native desktop application, with text selection and copy/paste globally disabled to provide a seamless, immersive experience.
