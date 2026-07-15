# Wavr - Local Music Visualizer

Wavr is an immersive, web-based visualizer and interactive gallery for your personal local music library. Designed with a sleek, modern aesthetic, it transforms your audio files into a highly visual, cinematic experience right in your browser.

## ✨ Features

- **Interactive Music Gallery**: Organize your tracks into beautifully rendered "Vinyl Boxes" that feel tactile and dynamic.
- **Cinematic Visualizer Mode**: Dive into your music with a distraction-free, full-screen visualizer featuring fluid transitions, dynamic background effects, and synchronized lyrics.
- **Local Audio Support**: Upload your own `.mp3`, `.wav`, or `.flac` files directly from your computer. Everything runs locally in your browser for maximum privacy, speed, and offline capability.
- **Smart Metadata Extraction**: Automatically extracts cover art, titles, and artist information from your audio files using `jsmediatags`.
- **Custom Lyrics**: Load `.lrc` files to display perfectly synchronized, karaoke-style scrolling lyrics inside the visualizer.
- **Advanced Audio Equalizer**: Fine-tune your listening experience with a built-in multi-band EQ and custom presets.
- **Premium Interface**: A stunning dark mode interface with glassmorphism elements, custom SVG iconography, and fluid micro-animations that make your library feel alive.

## 🚀 Tech Stack

- **HTML5 & Vanilla JavaScript**: Pure web technologies, ensuring a lightweight and blazing-fast experience.
- **CSS3**: Fully responsive and highly animated interface using centralized CSS variables and advanced flexbox/grid layouts.
- **jsmediatags**: Integrated for reading ID3 tags from local audio files.
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

- **Curate Your Gallery**: Click the **"+"** button to add new songs to your library. Let Wavr automatically extract metadata, or manually upload custom cover images and `.lrc` lyric files.
- **Create Vinyl Boxes**: Group your tracks into custom boxes to keep your gallery organized.
- **Immersive Visuals**: Click on the miniplayer at the bottom of the screen to expand the Cinematic Visualizer, revealing synchronized lyrics and dynamic background elements.
- **Edit Info**: Click the 3-dots icon on any song to refine its metadata, adjust the cover art, or organize it into a box.
