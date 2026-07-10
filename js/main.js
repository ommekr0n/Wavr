import { parseLyrics } from './modules/lyric-parser.js';
import { extractColorsFromImage } from './modules/color-extractor.js';
import { DOM } from './modules/dom.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // Prevent copy/cut globally unless inside an input/textarea
    document.addEventListener('copy', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
        }
    });
    document.addEventListener('cut', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
        }
    });

    // --- DOM Elements ---
    const homeView = document.getElementById('home-view');
    const playerView = document.getElementById('player-view');
    const uploadModal = document.getElementById('upload-modal');
    
    const homeSongGrid = document.getElementById('home-song-grid');
    const btnAddSong = document.getElementById('btn-add-song');
    const btnCloseModal = document.getElementById('btn-close-modal');
    
    const uploadForm = document.getElementById('upload-form');
    const uploadAudio = document.getElementById('upload-audio');
    const uploadLrc = document.getElementById('upload-lrc');
    const uploadCover = document.getElementById('upload-cover');
    const uploadTitle = document.getElementById('upload-title');
    const uploadArtist = document.getElementById('upload-artist');
    
    const editForm = document.getElementById('edit-form');
    const editAudio = document.getElementById('edit-audio');
    const editLrc = document.getElementById('edit-lrc');
    const editCover = document.getElementById('edit-cover');
    
    const btnBackHome = document.getElementById('btn-back-home');
    const audio = document.getElementById('audio-player');
    const coverArt = document.getElementById('cover-art');
    const artGlow = document.querySelector('.am-art-glow');
    const songTitleEl = document.getElementById('song-title');
    const songArtistEl = document.getElementById('song-artist');
    const lyricsContainer = document.getElementById('lyrics-container');
    const lyricsList = document.getElementById('lyrics-list');
    
    const playBtn = document.getElementById('btn-play');
    const playIcon = playBtn.querySelector('.play-icon');
    const pauseIcon = playBtn.querySelector('.pause-icon');
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const volumeSlider = document.getElementById('volume-slider');
    
    const btnToggleDrift = document.getElementById('btn-toggle-drift');
    const driftContainer = document.getElementById('drift-container');
    const driftSlider = document.getElementById('drift-slider');
    const driftVal = document.getElementById('drift-val');
    
    const progressSlider = document.getElementById('progress-slider');
    const progressBarFill = document.querySelector('.progress-bar-fill');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');

    const btnAngelic = document.getElementById('btn-angelic');
    const angelicView = document.getElementById('angelic-view');
    const btnExitAngelic = document.getElementById('btn-exit-angelic');
    const angelicVinylArt = document.getElementById('angelic-vinyl-art');
    const angelicTextContainer = document.getElementById('angelic-text-container');
    const angelicParticleContainer = document.getElementById('angelic-particle-container');
    const vinylRecord = document.querySelector('.vinyl-record');

    // --- State ---
    let playlist = []; // No longer using songs.js
    let currentTrackIndex = 0;
    let isPlaying = false;
    let isShuffle = false;
    let repeatMode = 0; // 0: None, 1: All, 2: One
    let shuffledQueue = []; // Holds indices for shuffle mode
    let currentLyrics = [];
    let activeLyricIndex = -1;
    let isDraggingSlider = false;
    let animationFrameId = null; // For 60-FPS Sync Engine
    let driftRatio = 1.0; // For Progressive Drift Fix
    let isCinematicMode = false;
    let isAngelicMode = false;
    let angelicParticleTimer = 0;
    
    // Web Audio API Variables
    let audioCtx = null;
    let analyser = null;
    let dataArray = null;
    const glassOverlay = document.getElementById('glass-overlay'); // Can be removed later
    
    // Cinematic Mode Elements
    const cinematicView = document.getElementById('cinematic-view');
    const cinematicTextContainer = document.getElementById('cinematic-text-container');
    const btnCinematic = document.getElementById('btn-cinematic');
    const btnExitCinematic = document.getElementById('btn-exit-cinematic');
    const cinematicCanvas = document.getElementById('cinematic-canvas');
    const cineFireLeft = document.getElementById('cine-fire-left');
    const cineFireRight = document.getElementById('cine-fire-right');
    const reactiveDim = document.getElementById('reactive-dim'); // Cached DOM element

    // Cinematic Visualizer State (persistent across frames)
    const NUM_PILLARS = 4;
    const smoothedBars = new Float32Array(NUM_PILLARS);
    const peaks = new Float32Array(NUM_PILLARS);
    const peakVelocities = new Float32Array(NUM_PILLARS);

    // Concert Spotlight Colors (cycling palette)
    let CONCERT_COLORS = [
        [255, 30,  60 ],  // Red
        [30,  100, 255],  // Blue
        [180, 30,  255],  // Purple
        [0,   230, 255],  // Cyan
        [30,  255, 120],  // Green
        [255, 180, 0  ],  // Amber
        [255, 80,  0  ],  // Orange
        [255, 255, 255],  // White
    ];

    // Spotlight state (2 spotlights from top corners)
    const spotlights = [
        { baseAngle: Math.PI * 0.38, sweepRange: 0.18, sweepSpeed: 0.45, phase: 0,
          colorIdx: 0, nextColorIdx: 2, colorT: 0, colorChangeDur: 2.5,
          blink: 1.0, blinkTimer: 2.0, blinkDur: 0, isOff: false },
        { baseAngle: Math.PI * 0.62, sweepRange: 0.20, sweepSpeed: 0.33, phase: Math.PI * 0.6,
          colorIdx: 3, nextColorIdx: 5, colorT: 0, colorChangeDur: 3.0,
          blink: 1.0, blinkTimer: 3.5, blinkDur: 0, isOff: false },
    ];

    // Smoke particle system
    const smokeParticles = [];
    const MAX_SMOKE = 50;
    let smokeSpawnTimer = 0;
    let lastCineTime = 0;
    let fireBurstTime = 0;
    let isFireBursting = false;
    let fireGifBlob = null;
    let fireGifBlobUrl = 'assets/images/fire.gif'; // Default fallback
    
    // Preload GIF to allow instant frame-0 restarts from RAM
    fetch('assets/images/fire.gif').then(r => r.blob()).then(blob => {
        fireGifBlob = blob;
    }).catch(e => console.log('No fire.gif found for preloading'));
    
    // Performance: Offscreen Canvases for Smoke Sprites
    const smokeSprite0 = document.createElement('canvas');
    const smokeSprite1 = document.createElement('canvas');
    smokeSprite0.width = smokeSprite0.height = 128;
    smokeSprite1.width = smokeSprite1.height = 128;
    
    function renderSmokeSprite(canvas, r, g, b) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 128, 128);
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0.00, `rgba(${r},${g},${b},1.0)`);
        grad.addColorStop(0.30, `rgba(${r},${g},${b},0.72)`);
        grad.addColorStop(0.65, `rgba(${r},${g},${b},0.22)`);
        grad.addColorStop(1.00, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(64, 64, 64, 0, Math.PI * 2);
        ctx.fill();
    }

    // --- IndexedDB Storage Config ---
    localforage.config({
        name: 'AppleMusicClone',
        storeName: 'songs_library'
    });

    // --- Audio Visualizer Setup ---
    function initVisualizer() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
            
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    // --- Core Functions ---

    async function initHome() {
        try {
            const savedPlaylist = await localforage.getItem('playlist');
            if (savedPlaylist) {
                // Reconstruct blob URLs dynamically for the current session
                playlist = savedPlaylist.map(song => ({
                    title: song.title,
                    artist: song.artist,
                    lyrics: song.lyrics,
                    drift: song.drift || 1.0,
                    url: URL.createObjectURL(song.audioBlob),
                    cover: URL.createObjectURL(song.coverBlob),
                    audioBlob: song.audioBlob, // Keep reference to save again later if needed
                    coverBlob: song.coverBlob
                }));
            }
        } catch (e) {
            console.error("Error loading library from IndexedDB", e);
        }
        
        renderSongGrid();
        setupEventListeners();
    }

    async function saveLibraryToDB() {
        try {
            // Save the raw blobs to IndexedDB. Transient URLs cannot be saved.
            const playlistToSave = playlist.map(song => ({
                title: song.title,
                artist: song.artist,
                lyrics: song.lyrics,
                drift: song.drift || 1.0,
                audioBlob: song.audioBlob,
                coverBlob: song.coverBlob
            }));
            await localforage.setItem('playlist', playlistToSave);
        } catch (e) {
            console.error("Error saving library to IndexedDB", e);
        }
    }

    function renderSongGrid() {
        homeSongGrid.innerHTML = '';
        playlist.forEach((song, index) => {
            const card = document.createElement('div');
            card.className = 'song-card';
            card.innerHTML = `
                <div class="song-card-inner">
                    <img src="${song.cover}" alt="Cover">
                    <button class="song-options-btn" data-index="${index}" title="Options">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <circle cx="12" cy="5" r="2"></circle>
                            <circle cx="12" cy="12" r="2"></circle>
                            <circle cx="12" cy="19" r="2"></circle>
                        </svg>
                    </button>
                    <div class="context-menu" id="context-menu-${index}">
                        <button class="context-item edit-btn" data-index="${index}">Edit Info</button>
                        <button class="context-item danger delete-song-btn" data-index="${index}">Delete</button>
                    </div>
                </div>
                <div class="song-card-title">${song.title}</div>
                <div class="song-card-artist">${song.artist}</div>
            `;
            card.addEventListener('click', (e) => {
                // If clicked on options, edit, or delete, don't open player
                if (e.target.closest('.song-options-btn') || e.target.closest('.context-menu')) return;
                openPlayer(index);
            });
            homeSongGrid.appendChild(card);
        });

        // Setup options buttons
        document.querySelectorAll('.song-options-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent opening player
                const idx = e.currentTarget.getAttribute('data-index');
                const menu = document.getElementById(`context-menu-${idx}`);
                
                // Close all other menus
                document.querySelectorAll('.context-menu.active').forEach(m => {
                    if (m !== menu) m.classList.remove('active');
                });
                
                menu.classList.toggle('active');
            });
        });
        
        // Setup delete buttons
        document.querySelectorAll('.delete-song-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = e.currentTarget.getAttribute('data-index');
                showDeleteModal(idx);
            });
        });
        
        // Setup edit buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = e.currentTarget.getAttribute('data-index');
                showEditModal(idx);
            });
        });
    }

    let trackToDeleteIndex = null;
    function showDeleteModal(index) {
        trackToDeleteIndex = index;
        document.getElementById('delete-modal').classList.remove('hidden');
    }
    
    document.getElementById('btn-cancel-delete').addEventListener('click', () => {
        document.getElementById('delete-modal').classList.add('hidden');
        trackToDeleteIndex = null;
    });
    
    document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
        if (trackToDeleteIndex !== null) {
            const idx = parseInt(trackToDeleteIndex);
            
            // Cleanup blob URLs if created
            if (playlist[idx].url && playlist[idx].url.startsWith('blob:')) URL.revokeObjectURL(playlist[idx].url);
            if (playlist[idx].cover && playlist[idx].cover.startsWith('blob:')) URL.revokeObjectURL(playlist[idx].cover);
            
            playlist.splice(idx, 1);
            
            if (currentTrackIndex === idx) {
                pauseAudio();
                if (playlist.length > 0) {
                    currentTrackIndex = 0;
                    loadTrack(0);
                } else {
                    currentTrackIndex = -1;
                    audio.src = '';
                    updateMiniPlayerUI();
                }
            } else if (currentTrackIndex > idx) {
                currentTrackIndex--;
            }
            
            renderSongGrid();
            await saveLibraryToDB();
            document.getElementById('delete-modal').classList.add('hidden');
            trackToDeleteIndex = null;
        }
    });

    let trackToEditIndex = null;
    function showEditModal(index) {
        trackToEditIndex = index;
        const song = playlist[index];
        editForm.reset();
        document.getElementById('edit-title').value = song.title || '';
        document.getElementById('edit-artist').value = song.artist || '';
        document.getElementById('edit-modal').classList.remove('hidden');
        
        // Hide context menu just in case
        document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    }
    
    document.getElementById('btn-cancel-edit').addEventListener('click', () => {
        document.getElementById('edit-modal').classList.add('hidden');
        trackToEditIndex = null;
    });
    
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (trackToEditIndex !== null) {
                const idx = parseInt(trackToEditIndex);
                const newTitle = document.getElementById('edit-title').value.trim();
                const newArtist = document.getElementById('edit-artist').value.trim();
                const audioFile = editAudio.files[0];
                const lrcFile = editLrc.files[0];
                const coverFile = editCover.files[0];
                
                if (newTitle && newArtist) {
                    const song = playlist[idx];
                    song.title = newTitle;
                    song.artist = newArtist;
                    
                    // Update audio
                    if (audioFile) {
                        if (song.url && song.url.startsWith('blob:')) URL.revokeObjectURL(song.url);
                        song.audioBlob = audioFile;
                        song.url = URL.createObjectURL(audioFile);
                        // If it's the currently playing track, reload it
                        if (currentTrackIndex === idx) {
                            const wasPlaying = isPlaying;
                            loadTrack(idx);
                            if (wasPlaying) playAudio();
                        }
                    }
                    // Update cover
                    if (coverFile) {
                        if (song.cover && song.cover.startsWith('blob:')) URL.revokeObjectURL(song.cover);
                        song.coverBlob = coverFile;
                        song.cover = URL.createObjectURL(coverFile);
                    }
                    
                    const finishEdit = async () => {
                        renderSongGrid();
                        updateMiniPlayerUI();
                        await saveLibraryToDB();
                        document.getElementById('edit-modal').classList.add('hidden');
                        trackToEditIndex = null;
                    };
                    
                    // Update LRC
                    if (lrcFile) {
                        const reader = new FileReader();
                        reader.onload = function(event) {
                            song.lyrics = event.target.result;
                            if (currentTrackIndex === idx) parseLyrics(song.lyrics);
                            finishEdit();
                        };
                        reader.readAsText(lrcFile);
                    } else {
                        finishEdit();
                    }
                    
                } else {
                    alert('Vui lòng điền đầy đủ Tiêu đề và Tên nghệ sĩ.');
                }
            }
        });
    }

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.song-options-btn') && !e.target.closest('.context-menu')) {
            document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
        }
    });

    function openPlayer(index) {
        currentTrackIndex = index;
        loadTrack(index);
        homeView.classList.add('hidden');
        playerView.classList.remove('hidden');
        const auroraBg = document.getElementById('aurora-bg');
        if (auroraBg) auroraBg.classList.remove('hidden');
        playAudio();
    }

    function closePlayer() {
        playerView.classList.add('hidden');
        homeView.classList.remove('hidden');
        const auroraBg = document.getElementById('aurora-bg');
        if (auroraBg) auroraBg.classList.add('hidden');
        
        // Show mini player if a track is selected
        if (currentTrackIndex !== -1 && playlist[currentTrackIndex]) {
            document.getElementById('mini-player').classList.remove('hidden');
            updateMiniPlayerUI();
        }
    }
    
    function updateMiniPlayerUI() {
        if (currentTrackIndex === -1) {
            document.getElementById('mini-player').classList.add('hidden');
            return;
        }
        const song = playlist[currentTrackIndex];
        document.getElementById('mini-cover').src = song.cover || 'assets/images/cover.png';
        document.getElementById('mini-title').textContent = song.title || 'Unknown Title';
        document.getElementById('mini-artist').textContent = song.artist || 'Unknown Artist';
        
        const btnMiniPlay = document.getElementById('btn-mini-play');
        const btnMiniPause = document.getElementById('btn-mini-pause');
        if (isPlaying) {
            btnMiniPlay.classList.add('hidden');
            btnMiniPause.classList.remove('hidden');
        } else {
            btnMiniPlay.classList.remove('hidden');
            btnMiniPause.classList.add('hidden');
        }
        
        // Sync Repeat & Shuffle buttons visually
        const btnMiniRepeat = document.getElementById('btn-mini-repeat');
        const btnMiniShuffle = document.getElementById('btn-mini-shuffle');
        const miniIconRepeat = btnMiniRepeat.querySelector('.icon-repeat');
        const miniIconRepeat1 = btnMiniRepeat.querySelector('.icon-repeat-1');
        
        if (isShuffle) btnMiniShuffle.classList.add('active-state');
        else btnMiniShuffle.classList.remove('active-state');
        
        if (repeatMode === 0) {
            btnMiniRepeat.classList.remove('active-state');
            miniIconRepeat.classList.remove('hidden');
            miniIconRepeat1.classList.add('hidden');
        } else if (repeatMode === 1) {
            btnMiniRepeat.classList.add('active-state');
            miniIconRepeat.classList.remove('hidden');
            miniIconRepeat1.classList.add('hidden');
        } else if (repeatMode === 2) {
            btnMiniRepeat.classList.add('active-state');
            miniIconRepeat.classList.add('hidden');
            miniIconRepeat1.classList.remove('hidden');
        }
    }
    
    // Setup Mini Player Click Events
    document.getElementById('mini-player').addEventListener('click', (e) => {
        // Prevent opening full player if clicking buttons
        if (e.target.closest('.mini-btn')) return;
        
        if (currentTrackIndex !== -1) {
            // Re-open player
            document.getElementById('mini-player').classList.add('hidden');
            playerView.classList.remove('hidden');
            homeView.classList.add('hidden');
            const auroraBg = document.getElementById('aurora-bg');
            if (auroraBg) auroraBg.classList.remove('hidden');
        }
    });
    
    document.getElementById('btn-mini-play').addEventListener('click', () => togglePlay());
    document.getElementById('btn-mini-pause').addEventListener('click', () => togglePlay());
    document.getElementById('btn-mini-next').addEventListener('click', () => nextTrack(false));
    document.getElementById('btn-mini-prev').addEventListener('click', prevTrack);
    
    document.getElementById('btn-mini-repeat').addEventListener('click', () => {
        const btnRepeat = document.getElementById('btn-repeat');
        if (btnRepeat) btnRepeat.click();
        updateMiniPlayerUI();
    });
    
    document.getElementById('btn-mini-shuffle').addEventListener('click', () => {
        const btnShuffle = document.getElementById('btn-shuffle');
        if (btnShuffle) btnShuffle.click();
        updateMiniPlayerUI();
    });

    function loadTrack(index) {
        const track = playlist[index];
        
        // Setup Audio
        audio.src = track.url;
        audio.load();
        
        // Setup Meta
        songTitleEl.textContent = track.title;
        songArtistEl.textContent = track.artist;
        
        // Apply cover to UI
        coverArt.src = track.cover;
        angelicVinylArt.src = track.cover;
        document.querySelector('.am-art-glow').style.backgroundImage = `url("${track.cover}")`;
        document.getElementById('angelic-bg').style.backgroundImage = `url("${track.cover}")`;
        
        // Extract Color for Aurora
        const applyColors = (uiColors, spotlightColors) => {
            document.documentElement.style.setProperty('--blob-1-color', gb(\, \, \)\);
            document.documentElement.style.setProperty('--blob-2-color', gb(\, \, \)\);
            document.documentElement.style.setProperty('--blob-3-color', gb(\, \, \)\);
            document.documentElement.style.setProperty('--blob-4-color', gb(\, \, \)\);
            
            document.documentElement.style.setProperty('--blob-1-size', \vw\); 
            document.documentElement.style.setProperty('--blob-2-size', \vw\); 
            document.documentElement.style.setProperty('--blob-3-size', \vw\); 
            document.documentElement.style.setProperty('--blob-4-size', \vw\); 

            CONCERT_COLORS = spotlightColors.map(c => [c.r, c.g, c.b]);
            spotlights.forEach(sp => {
                sp.colorIdx = sp.colorIdx % CONCERT_COLORS.length;
                sp.nextColorIdx = sp.nextColorIdx % CONCERT_COLORS.length;
            });
        };
        if (coverArt.complete) {
            extractColorsFromImage(coverArt, applyColors);
        } else {
            coverArt.onload = () => extractColorsFromImage(coverArt, applyColors);
        }
        
        driftRatio = track.drift || 1.0;
        driftSlider.value = driftRatio;
        driftVal.textContent = driftRatio.toFixed(3) + 'x';
        
        // Parse and render Lyrics
        currentLyrics = parseLyrics(track.lyrics);
        renderLyrics();
        
        // Pre-build the first two lines immediately to prevent first-play lag
        if (currentLyrics.length > 0) {
            setTimeout(() => {
                prepareAngelicLine(currentLyrics[0].text, 0);
                if (currentLyrics[1]) {
                    prepareAngelicLine(currentLyrics[1].text, 1);
                }
            }, 200);
        }

        // Update Media Session metadata (enables hardware media keys)
        updateMediaSession(track);
    }

    function updateMediaSession(track) {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title:  track.title  || 'Unknown Title',
            artist: track.artist || 'Unknown Artist',
            album:  track.album  || 'Wavr',
            artwork: track.cover ? [{ src: track.cover, sizes: '512x512' }] : []
        });
        // Action handlers — ánh xạ nút bàn phím/tai nghe → hàm player
        navigator.mediaSession.setActionHandler('play',          () => playAudio());
        navigator.mediaSession.setActionHandler('pause',         () => pauseAudio());
        navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
        navigator.mediaSession.setActionHandler('nexttrack',     () => nextTrack());
        navigator.mediaSession.setActionHandler('stop',          () => { pauseAudio(); audio.currentTime = 0; if (!isPlaying) updateProgress(); });
        navigator.mediaSession.setActionHandler('seekbackward',  (d) => { 
            const newTime = Math.max(0, audio.currentTime - (d?.seekOffset ?? 10));
            prepareLyricNearTime(newTime);
            audio.currentTime = newTime; 
            if (!isPlaying) updateProgress(); 
        });
        navigator.mediaSession.setActionHandler('seekforward',   (d) => { 
            const newTime = Math.min(audio.duration || Infinity, audio.currentTime + (d?.seekOffset ?? 10));
            prepareLyricNearTime(newTime);
            audio.currentTime = newTime; 
            if (!isPlaying) updateProgress(); 
        });
        navigator.mediaSession.setActionHandler('seekto',        (d) => { 
            if (d.seekTime != null) {
                prepareLyricNearTime(d.seekTime);
                audio.currentTime = d.seekTime;
            } 
            if (!isPlaying) updateProgress(); 
        });
    }

    // Cập nhật playback state để thanh notification OS biết đang play/pause
    audio.addEventListener('play',  () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
    audio.addEventListener('pause', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });

                timeFound = true;
            }
        });
        
        currentLyrics.sort((a, b) => a.time - b.time);
    }

    function renderLyrics() {
        lyricsList.innerHTML = '';
        if (angelicTextContainer) angelicTextContainer.innerHTML = '';
        if (cinematicTextContainer) cinematicTextContainer.innerHTML = '';
        activeLyricIndex = -1;
        
        if (currentLyrics.length === 0) {
            lyricsList.innerHTML = '<div class="am-lyric-line placeholder-line">Không có lời bài hát</div>';
            return;
        }
        
        currentLyrics.forEach((lyric, index) => {
            const lineEl = document.createElement('div');
            lineEl.className = 'am-lyric-line';
            lineEl.textContent = preventOrphanWords(lyric.text);
            lineEl.setAttribute('data-index', index);
            
            lineEl.addEventListener('click', () => {
                // Pre-warm the clicked lyric line and the next one immediately
                prepareAngelicLine(lyric.text, index);
                if (currentLyrics[index + 1]) {
                    prepareAngelicLine(currentLyrics[index + 1].text, index + 1);
                }
                audio.currentTime = lyric.time * driftRatio;
                if (!isPlaying) playAudio();
            });
            
            lyricsList.appendChild(lineEl);
        });
    }

    function updateLyricsHighlight(time) {
        if (currentLyrics.length === 0) return;
        
        // O(1) optimized lyric sync: Only check adjacent lyrics instead of looping all
        let newActiveIndex = activeLyricIndex !== -1 ? activeLyricIndex : 0;
        
        // If time passed the next lyric, fast-forward
        while (newActiveIndex < currentLyrics.length - 1 && time >= currentLyrics[newActiveIndex + 1].time * driftRatio) {
            newActiveIndex++;
        }
        // If time went backwards (e.g. user seeked), rewind
        while (newActiveIndex > 0 && time < currentLyrics[newActiveIndex].time * driftRatio) {
            newActiveIndex--;
        }
        // Edge case: time is before the very first lyric
        if (newActiveIndex === 0 && time < currentLyrics[0].time * driftRatio) {
            newActiveIndex = -1;
        }
        
        if (newActiveIndex !== activeLyricIndex && newActiveIndex !== -1) {
            activeLyricIndex = newActiveIndex;
            
            const lines = lyricsList.querySelectorAll('.am-lyric-line');
            lines.forEach((line, idx) => {
                if (idx === activeLyricIndex) {
                    line.classList.add('active');
                } else {
                    line.classList.remove('active');
                }
            });
            
            const activeLine = lines[activeLyricIndex];
            if (activeLine) {
                const containerHeight = lyricsContainer.clientHeight;
                const lineOffsetTop = activeLine.offsetTop;
                const lineHeight = activeLine.clientHeight;
                const targetScroll = lineOffsetTop - (containerHeight * 0.4) + (lineHeight / 2);
                
                lyricsContainer.scrollTo({
                    top: targetScroll,
                    behavior: 'smooth'
                });
            }
            
            // --- Cinematic Mode Trigger ---
            if (isCinematicMode && currentLyrics[activeLyricIndex]) {
                triggerCinematicLine(currentLyrics[activeLyricIndex].text);
            }
            // --- Angelic Mode Trigger ---
            if (isAngelicMode && currentLyrics[activeLyricIndex]) {
                showAngelicLine(activeLyricIndex);
                
                // Ahead-of-Time: Pre-build the NEXT lyric string during idle time
                if (currentLyrics[activeLyricIndex + 1]) {
                    setTimeout(() => {
                        prepareAngelicLine(currentLyrics[activeLyricIndex + 1].text, activeLyricIndex + 1);
                    }, 50); // Small delay to let the current frame render first
                }
            }
        }
    }
    
    // ─── Smart Word-Wrap: Ngăn chữ "mồ côi" ───────────────
    // Nối 2-3 từ cuối câu bằng khoảng trắng không ngắt dòng (non-breaking space).
    // Giúp cho khi màn hình hẹp, trình duyệt sẽ rớt cả cụm 3 từ xuống dòng thay vì 1 từ chơ vơ.
    function preventOrphanWords(text) {
        if (!text) return "";
        const words = text.trim().split(/\s+/);
        if (words.length <= 3) return text;
        
        // Lấy 3 từ cuối và nối bằng non-breaking space (\u00A0)
        const lastWords = words.splice(-3).join('\u00A0');
        return words.join(' ') + ' ' + lastWords;
    }

    function triggerCinematicLine(text) {
        if (!text) return;
        
        // Remove old lines with exit animation
        const oldLines = cinematicTextContainer.querySelectorAll('.cinematic-line-wrapper');
        oldLines.forEach(line => {
            line.classList.remove('cine-enter');
            line.classList.add('cine-exit');
            
            // Mark all exiting words as glitched to prevent new glitches, AND remove active glitch animation instantly
            const exitingWords = line.querySelectorAll('.cine-word');
            exitingWords.forEach(w => {
                w.classList.add('glitched');
                w.classList.remove('glitch-word-anim');
            });
            
            // Randomize exit direction and rotation
            const rot = (Math.random() - 0.5) * 80; // -40deg to +40deg
            const tx = (Math.random() - 0.5) * 60;  // -30vw to +30vw horizontal shift
            line.style.setProperty('--exit-rot', `${rot}deg`);
            line.style.setProperty('--exit-tx', `${tx}vw`);
            
            setTimeout(() => { if (line.parentNode) line.remove(); }, 1200);
        });
        
        // Create new line flying in
        const newWrapper = document.createElement('div');
        newWrapper.className = 'cinematic-line-wrapper cine-enter';
        
        // --- SPARK PARTICLES ---
        const sparkContainer = document.createElement('div');
        sparkContainer.className = 'sparkle-container';
        // Smart Distribution Algorithm: 2-3 sparks per word, strictly capped at 15 to guarantee zero lag, minimum 5.
        const wordCount = text.split(' ').length;
        const numSparks = Math.min(Math.max(wordCount * 3, 5), 15);
        for (let i = 0; i < numSparks; i++) {
            const spark = document.createElement('div');
            spark.className = 'sparkle';
            
            // Randomly select one of the 4 blob colors for the glow
            const colorVar = `--blob-${Math.floor(Math.random() * 4) + 1}-color`;
            spark.style.setProperty('--spark-color', `var(${colorVar})`);
            
            // Spread start position based on text length and 11vmin font size (approx 6vmin per char)
            const spreadWidth = Math.min(text.length * 6, 95);
            const startX = (Math.random() - 0.5) * spreadWidth; 
            const startY = (Math.random() - 0.5) * 12; // Spread vertically around the 11vmin text
            spark.style.left = `calc(50% + ${startX}vmin)`;
            spark.style.top = `calc(50% + ${startY}vmin)`;
            
            // Random explosion vectors (smaller since they are already spread out)
            const angle = Math.random() * Math.PI * 2;
            const distance = 20 + Math.random() * 100; // px spread
            spark.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
            spark.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
            
            // Random delay and duration
            spark.style.animationDelay = `${Math.random() * 0.15}s`;
            spark.style.animationDuration = `${0.6 + Math.random() * 0.6}s`;
            
            sparkContainer.appendChild(spark);
        }
        newWrapper.appendChild(sparkContainer);
        setTimeout(() => { if (sparkContainer.parentNode) sparkContainer.remove(); }, 1500);
        
        const newLine = document.createElement('div');
        newLine.className = 'cinematic-line';
        
        const processedText = preventOrphanWords(text);
        const words = processedText.split(' ');
        const allowGlitch = words.length > 3; // Forbid glitch on short sentences
        
        words.forEach((word, index) => {
            const span = document.createElement('span');
            if (allowGlitch) {
                span.className = 'cine-word glitch-immune';
                // Remove glitch immunity after 1500ms (1.5 seconds) so new words don't glitch immediately
                setTimeout(() => { if (span.parentNode) span.classList.remove('glitch-immune'); }, 1500);
            }
            span.textContent = word;
            span.dataset.text = word;
            newLine.appendChild(span);
            if (index < words.length - 1) {
                newLine.appendChild(document.createTextNode(' '));
            }
        });
        
        newWrapper.appendChild(newLine);
        cinematicTextContainer.appendChild(newWrapper);
    }
    
    function prepareAngelicLine(text, index) {
        if (!text) return;
        
        // Skip if already prepared (AoT logic)
        if (angelicTextContainer.querySelector(`[data-lyric-index="${index}"]`)) return;
        
        // Create new line wrapper pre-built off-screen (forces GPU/Browser compilation)
        const newWrapper = document.createElement('div');
        newWrapper.className = 'angelic-line-wrapper angelic-prebuilt';
        newWrapper.setAttribute('data-lyric-index', index);
        
        // Generate Curvy Musical Staff SVG
        const w = window.innerWidth;
        const maxCharsPerLine = Math.floor((w * 0.8) / 40);
        const estimatedLines = Math.max(1, Math.ceil(text.length / maxCharsPerLine));
        const staffLineGap = 20 + (estimatedLines - 1) * 35; 
        
        const h = 400 + estimatedLines * 50; 
        const yCenter = h / 2;
        const amp = 80 + Math.random() * 60; 
        const phase = Math.random() > 0.5 ? 1 : -1; 
        
        const pathLen = w * 1.5; 
        let paths = '';
        for(let i=0; i<5; i++) {
            const y = yCenter + (i - 2) * staffLineGap;
            paths += `<path class="staff-line" d="M 0,${y} C ${w*0.3},${y - amp*phase} ${w*0.7},${y + amp*phase} ${w},${y}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" style="stroke-dasharray: ${pathLen}; stroke-dashoffset: ${pathLen};"/>`;
        }
        
        // --- Add Music Symbols (Clef & Motifs) ---
        const clefX = 40 + Math.random() * 20;
        const clefT = clefX / w;
        const clefCurveY = yCenter + 3 * (1 - clefT) * clefT * amp * phase * (2 * clefT - 1);
        const clefFontSize = staffLineGap * 4.5;
        paths += `<text class="staff-symbol" x="${clefX}" y="${clefCurveY + clefFontSize*0.25}" font-family="serif" font-size="${clefFontSize}" fill="rgba(255,255,255,0.35)" text-anchor="middle">𝄞</text>`;
        
        const musicMotifs = [
            [{s: '♩', l: 1.5}, {s: '♩', l: 1.5}, {s: '♩', l: -0.5}, {s: '♩', l: -0.5}, {s: '♩', l: -1}, {s: '♩', l: -1}, {s: '♩', l: -0.5}], // Twinkle
            [{s: '♩', l: 0}, {s: '♩', l: 0}, {s: '♩', l: -0.5}, {s: '♩', l: -1}, {s: '♩', l: -1}, {s: '♩', l: -0.5}, {s: '♩', l: 0}], // Ode to Joy
            [{s: '♪', l: 2}, {s: '♪', l: 1.5}, {s: '♪', l: 1}, {s: '♪', l: 0.5}, {s: '♩', l: 0}], // Scale up
            [{s: '♪', l: 1}, {s: '♪', l: 1}, {s: '♪', l: 1}, {s: '♩', l: 2}], // Beethoven 5th
            [{s: '♫', l: 0.5}, {s: '♪', l: -1}, {s: '♩', l: -0.5}] // Short cluster
        ];
        
        const renderMotif = (motif, isLeft) => {
            const gapX = staffLineGap * 2.5; // Wider gap to prevent note collisions
            const motifWidth = (motif.length - 1) * gapX;
            let startX = isLeft 
                ? 180 + Math.random() * Math.max(0, (w * 0.35 - 180) - motifWidth) // Shift right to avoid Treble Clef
                : w * 0.65 + Math.random() * Math.max(0, (w - 60 - w * 0.65) - motifWidth);
                
            motif.forEach((note, idx) => {
                const sx = startX + idx * gapX;
                const t = sx / w;
                const curveY = yCenter + 3 * (1 - t) * t * amp * phase * (2 * t - 1);
                const sy = curveY + (note.l * staffLineGap);
                const sFontSize = staffLineGap * 2.2;
                paths += `<text class="staff-symbol" x="${sx}" y="${sy + sFontSize*0.3}" font-family="serif" font-size="${sFontSize}" fill="rgba(255,255,255,0.25)" text-anchor="middle">${note.s}</text>`;
            });
        };
        
        // Render one motif on the left, one on the right
        renderMotif(musicMotifs[Math.floor(Math.random() * musicMotifs.length)], true);
        renderMotif(musicMotifs[Math.floor(Math.random() * musicMotifs.length)], false);
        // --- End Music Symbols ---
        
        const placedRoots = [];
        const maxAttempts = 150; 
        const targetCount = Math.floor(w / 250) + 1; 
        
        for (let i = 0; i < maxAttempts && placedRoots.length < targetCount; i++) {
            const fx = (w * 0.05) + Math.random() * (w * 0.9); 
            
            const allowedLines = [0, 1, 3, 4];
            const lineRandom = Math.random();
            let chosenLineIndex;
            if (lineRandom < 0.35) chosenLineIndex = 0; 
            else if (lineRandom < 0.5) chosenLineIndex = 1; 
            else if (lineRandom < 0.65) chosenLineIndex = 3; 
            else chosenLineIndex = 4; 
            
            const offset = (chosenLineIndex - 2) * staffLineGap;
            const baseCenter = yCenter + offset;
            
            const t = fx / w;
            const u = 1 - t;
            const fy = u*u*u*baseCenter + 3*u*u*t*(baseCenter - amp*phase) + 3*u*t*t*(baseCenter + amp*phase) + t*t*t*baseCenter;
            
            const hitboxRadius = 60 + Math.random() * 40; 
            
            let isCollision = false;
            for (const root of placedRoots) {
                const dx = fx - root.x;
                const dy = fy - root.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < (hitboxRadius + root.radius + 10)) {
                    isCollision = true;
                    break;
                }
            }
            
            if (!isCollision) {
                placedRoots.push({
                    x: fx,
                    y: fy,
                    chosenLineIndex: chosenLineIndex,
                    radius: hitboxRadius
                });
            }
        }
        
        for (const root of placedRoots) {
            const { x: fx, y: fy, chosenLineIndex, radius } = root;
            
            const t = fx / w; 
            const isGrowingUp = chosenLineIndex < 2;
            const baseAngle = isGrowingUp ? -90 : 90; 
            const maxScale = radius * 0.6;
            let treeBaseScale = 20 + Math.random() * maxScale;
            // Clamp tree size: not too small (<35) and not too large (>75)
            treeBaseScale = Math.max(35, Math.min(treeBaseScale, 75));
            
            const templates = window.WavrFloral.templates;
            const selectedTemplate = templates[Math.floor(Math.random() * templates.length)];
            
            let templateHTML = '';
            selectedTemplate.branches.forEach((branch, idx) => {
                templateHTML += window.WavrFloral.createBranch(branch, idx, treeBaseScale, t);
            });
            
            let rootPaths = `<g transform="rotate(${baseAngle})">${templateHTML}</g>`;
            paths += `<g transform="translate(${fx}, ${fy})">${rootPaths}</g>`;
        }
        
        const svgHTML = `
        <svg class="angelic-staff-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
            ${paths}
        </svg>`;
        
        const newLine = document.createElement('div');
        newLine.className = 'angelic-line';
        
        const safeText = preventOrphanWords(text);
        const words = safeText.split(' ');
        
        let wordsHTML = '';
        words.forEach((word, wordIdx) => {
            const popDelay = 0.1 + wordIdx * 0.08;
            let bFly = '';
            if (Math.random() < 0.3) { 
                const dirX = (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 25); 
                const dirY = (Math.random() > 0.2 ? -1 : 1) * (15 + Math.random() * 30); 
                const rot = (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 30);
                const dur = Math.random() < 0.1 ? '0.5s' : '1.0s';
                const color = Math.random() < 0.1 ? 'var(--blob-3-color)' : 'var(--blob-1-color)';
                const styleStr = `animation-delay: ${popDelay}s, 0s; animation-duration: ${dur}, 0.3s; background-color: ${color}; --dx: ${dirX}px; --dy: ${dirY}px; --drot: ${rot}deg;`;
                bFly = `<div class="sprite-butterfly" style="${styleStr}"></div>`;
            }
            
            wordsHTML += `<span class="angelic-word-sway" style="animation-delay: ${popDelay}s">
                <span class="angelic-word-pop" style="animation-delay: ${popDelay}s">${word}</span>
                ${bFly}
            </span> `;
        });
        
        newLine.innerHTML = wordsHTML.trim();
        newWrapper.innerHTML = svgHTML;
        newWrapper.appendChild(newLine);
        
        angelicTextContainer.appendChild(newWrapper);
    }
    
    function prepareLyricNearTime(time) {
        if (currentLyrics.length === 0) return;
        let index = 0;
        while (index < currentLyrics.length - 1 && time >= currentLyrics[index + 1].time * driftRatio) {
            index++;
        }
        prepareAngelicLine(currentLyrics[index].text, index);
        if (currentLyrics[index + 1]) {
            prepareAngelicLine(currentLyrics[index + 1].text, index + 1);
        }
    }
    
    function showAngelicLine(index) {
        let wrapper = angelicTextContainer.querySelector(`[data-lyric-index="${index}"]`);
        
        // Fallback if not prepared (e.g. user seeked backwards or first load)
        if (!wrapper && currentLyrics[index]) {
            prepareAngelicLine(currentLyrics[index].text, index);
            wrapper = angelicTextContainer.querySelector(`[data-lyric-index="${index}"]`);
        }
        
        if (!wrapper) return;
        
        // Handle exit animations for older lines
        const allWrappers = angelicTextContainer.querySelectorAll('.angelic-line-wrapper');
        allWrappers.forEach(line => {
            // Do not affect other prebuilt lines waiting off-screen
            if (line !== wrapper && !line.classList.contains('angelic-prebuilt') && !line.classList.contains('angelic-exit')) {
                line.classList.add('angelic-exit');
                const rot = (Math.random() - 0.5) * 20;
                line.style.setProperty('--exit-rot', `${rot}deg`);
                setTimeout(() => { if (line.parentNode) line.remove(); }, 800);
            }
        });
        
        // Trigger CSS Animations instantly by bringing it back on screen
        wrapper.classList.remove('angelic-prebuilt'); 
        // Force Reflow to ensure animations play from start
        void wrapper.offsetWidth;
        wrapper.classList.add('angelic-enter-wrapper');
    }

    function spawnAngelicParticle() {
        if (!isAngelicMode) return;
        const p = document.createElement('div');
        p.className = 'angelic-particle';
        
        // Use Global SVG Symbols for extreme performance
        const svgs = [
            `<svg viewBox="0 0 24 24"><use href="#icon-music-note"></use></svg>`,
            `<svg viewBox="0 0 24 24"><use href="#icon-star"></use></svg>`,
            `<svg viewBox="0 0 24 24"><use href="#icon-heart"></use></svg>`
        ];
        p.innerHTML = svgs[Math.floor(Math.random() * svgs.length)];
        
        // Dynamic colors extracted from art cover
        const colorVar = `--blob-${Math.floor(Math.random() * 4) + 1}-color`;
        p.style.setProperty('--p-color', `var(${colorVar})`);
        
        // Physics logic via CSS variables
        const sx = Math.random() * 100;
        const sy = 100 + Math.random() * 10;
        
        // Randomize charm size (15px to 40px)
        const size = 15 + Math.random() * 25;
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        const mx = sx + (Math.random() - 0.5) * 30;
        const my = 40 + Math.random() * 30;
        const ex = mx + (Math.random() - 0.5) * 30;
        const ey = -15; // Above screen
        
        p.style.setProperty('--sx', `${sx}vw`);
        p.style.setProperty('--sy', `${sy}vh`);
        p.style.setProperty('--mx', `${mx}vw`);
        p.style.setProperty('--my', `${my}vh`);
        p.style.setProperty('--ex', `${ex}vw`);
        p.style.setProperty('--ey', `${ey}vh`);
        
        p.style.setProperty('--rot-mid', `${(Math.random() - 0.5) * 180}deg`);
        p.style.setProperty('--rot', `${(Math.random() - 0.5) * 360}deg`);
        
        const dur = 8 + Math.random() * 6; // Very slow and gentle
        p.style.setProperty('--p-dur', `${dur}s`);
        p.style.setProperty('--p-op', `${0.3 + Math.random() * 0.4}`);
        
        angelicParticleContainer.appendChild(p);
        setTimeout(() => { if (p.parentNode) p.remove(); }, dur * 1000);
    }

    let giantButterflyCooldown = 0;
    function spawnGiantButterfly() {
        if (!isAngelicMode) return;
        const now = Date.now();
        if (now - giantButterflyCooldown < 15000) return; // 15 seconds cooldown
        giantButterflyCooldown = now;

        // Frutiger Aero Water Ripple & Katakana Fire Text
        const artistEl = document.getElementById('song-artist');
        let artistName = artistEl ? artistEl.textContent.trim() : '';
        if (artistName === 'Artist Name') artistName = ''; 
        
        const ripple = document.createElement('div');
        ripple.className = 'water-ripple';
        angelicParticleContainer.appendChild(ripple);
        setTimeout(() => { if (ripple.parentNode) ripple.remove(); }, 4000);

        if (artistName !== '') {
            const fireText = document.createElement('div');
            fireText.className = 'kata-fire-text';
            fireText.innerText = artistName;
            
            const isDown = Math.random() > 0.5;
            fireText.style.left = `${10 + Math.random() * 80}%`; // Relative to the visualizer container
            fireText.style.animationName = isDown ? 'kata-fall' : 'kata-rise';
            
            // Glows using art colors (optimized single shadow)
            fireText.style.color = 'var(--blob-1-color)';
            fireText.style.textShadow = `0 0 12px var(--blob-2-color)`;
            
            // Append to angelicParticleContainer to ensure it stays in the visualizer area and behind charms (via z-index)
            angelicParticleContainer.appendChild(fireText);
            setTimeout(() => { if (fireText.parentNode) fireText.remove(); }, 6000);
        }

        const b = document.createElement('div');
        b.className = 'giant-butterfly';
        
        // Probability games for Giant Butterfly!
        const randPath = Math.random();
        let sx, sy, sr, mx, my, mr, ex, ey, er;
        if (randPath < 0.25) { // Top-Left -> Bottom-Right
            sx = '-20vw'; sy = '-20vh'; sr = '15deg';
            mx = '40vw'; my = '40vh'; mr = '5deg';
            ex = '120vw'; ey = '120vh'; er = '15deg';
        } else if (randPath < 0.5) { // Bottom-Left -> Top-Right
            sx = '-20vw'; sy = '120vh'; sr = '5deg';
            mx = '40vw'; my = '50vh'; mr = '-5deg';
            ex = '120vw'; ey = '-20vh'; er = '10deg';
        } else if (randPath < 0.75) { // Top-Right -> Bottom-Left
            sx = '120vw'; sy = '-20vh'; sr = '-15deg';
            mx = '60vw'; my = '40vh'; mr = '-5deg';
            ex = '-20vw'; ey = '120vh'; er = '-15deg';
        } else { // Bottom-Right -> Top-Left
            sx = '120vw'; sy = '120vh'; sr = '-5deg';
            mx = '60vw'; my = '50vh'; mr = '5deg';
            ex = '-20vw'; ey = '-20vh'; er = '-10deg';
        }
        
        // Randomly adjust the "landing" spot slightly to keep it organic
        mx = `calc(${mx} + ${(Math.random()-0.5)*20}vw)`;
        my = `calc(${my} + ${(Math.random()-0.5)*20}vh)`;
        
        b.style.setProperty('--sx', sx); b.style.setProperty('--sy', sy); b.style.setProperty('--sr', sr);
        b.style.setProperty('--mx', mx); b.style.setProperty('--my', my); b.style.setProperty('--mr', mr);
        b.style.setProperty('--ex', ex); b.style.setProperty('--ey', ey); b.style.setProperty('--er', er);
        
        // Force high z-index to fly above lyrics
        b.style.zIndex = '10';
        
        const sizeRand = Math.random();
        let scale = '2.0'; // Default giant butterfly is twice as large as before
        let bgStyle = '';
        if (sizeRand < 0.1) {
            scale = '4.0'; // 10% Super Giant!
            bgStyle = 'background-color: var(--blob-3-color);';
        } else if (sizeRand < 0.4) {
            scale = '1.2'; // 30% "Smaller" but still larger than old default
        }
        
        b.innerHTML = `<div class="sprite-butterfly giant" style="transform: scale(${scale}); ${bgStyle}"></div>`;
        
        // Append to angelic-view so it sits above the lyrics (z-index 2)
        const angelicView = document.getElementById('angelic-view');
        if (angelicView) {
            angelicView.appendChild(b);
            setTimeout(() => { if (b.parentNode) b.remove(); }, 6000); // 6s duration
        }
    }

    // --- 60-FPS Sync Engine & Visualizer ---
    function syncLoop() {
        if (isPlaying) {
            updateProgress(); // Replaces the old timeupdate event completely
            
            // Elegant Apple Music Visualizer
            if (analyser && dataArray) {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                // Calculate bass (average of lowest 10 frequencies)
                for (let i = 0; i < 10; i++) sum += dataArray[i];
                let bassAvg = sum / 10;
                let intensity = bassAvg / 255;
                
                // Update global CSS variable for smooth, elegant reactivity
                document.documentElement.style.setProperty('--beat-intensity', intensity.toFixed(3));
                
                // Angelic Mode Particle Spawner
                if (isAngelicMode) {
                    if (intensity > 0.3) {
                        angelicParticleTimer--;
                        if (angelicParticleTimer <= 0) {
                            spawnAngelicParticle();
                            angelicParticleTimer = 5;
                        }
                    }
                    if (intensity > 0.8) {
                        spawnGiantButterfly();
                    }
                }
                
                // --- CINEMATIC 3.0: MASSIVE 3D PILLARS (PERFORMANCE OPTIMIZED) ---
                if (isCinematicMode && cinematicCanvas) {
                    const ctx = cinematicCanvas.getContext('2d');
                    
                    // Use cached dimensions to prevent layout thrashing
                    if (cinematicCanvas.width !== winWidth || cinematicCanvas.height !== winHeight) {
                        cinematicCanvas.width = winWidth;
                        cinematicCanvas.height = winHeight;
                    }
                    
                    const width = cinematicCanvas.width;
                    const height = cinematicCanvas.height;

                    ctx.clearRect(0, 0, width, height);

                    // --- DELTA TIME ---
                    const nowSec = performance.now() / 1000;
                    const dt = lastCineTime > 0 ? Math.min(nowSec - lastCineTime, 0.05) : 0.016;
                    lastCineTime = nowSec;

                    // 1. Reactive Dimming
                    if (reactiveDim) {
                        const targetOpacity = Math.max(0.1, 0.95 - (Math.pow(intensity, 2) * 1.5));
                        reactiveDim.style.opacity = targetOpacity.toFixed(2);
                    }
                    
                    // --- MASSIVE FIRE PILLARS (FESTIVAL BURST) ---
                    if (cineFireLeft && cineFireRight) {
                        
                        // Trigger a new burst if intensity is very high and cooldown has passed (4 seconds)
                        if (intensity > 0.8 && nowSec - fireBurstTime > 4.0) {
                            isFireBursting = true;
                            fireBurstTime = nowSec;
                            
                            // Restart GIF from frame 0 instantly using a fresh RAM Blob instance
                            if (fireGifBlob) {
                                if (fireGifBlobUrl !== 'assets/images/fire.gif') URL.revokeObjectURL(fireGifBlobUrl);
                                fireGifBlobUrl = URL.createObjectURL(new Blob([fireGifBlob], {type: 'image/gif'}));
                                if (cineFireLeft) cineFireLeft.src = fireGifBlobUrl;
                                if (cineFireRight) cineFireRight.src = fireGifBlobUrl;
                            }
                        }
                        
                        
                        // Optimization: Use Live HTMLCollection instead of querySelectorAll for O(1) access in 60FPS loop
                        if (!window._cachedCineWords) {
                            window._cachedCineWords = document.getElementsByClassName('cine-word');
                        }
                        
                        // Random blocky glitch on an active word (approx 2% chance per frame)
                        if (Math.random() < 0.02 && window._cachedCineWords.length > 0) {
                            const randomWord = window._cachedCineWords[Math.floor(Math.random() * window._cachedCineWords.length)];
                            if (!randomWord.classList.contains('glitch-word-anim') && !randomWord.classList.contains('glitched') && !randomWord.classList.contains('glitch-immune')) {
                                randomWord.classList.add('glitch-word-anim');
                                randomWord.classList.add('glitched'); // Marker to prevent repeat glitching
                                setTimeout(() => randomWord.classList.remove('glitch-word-anim'), 400); // Remove after animation
                            }
                        }
                        
                        if (isFireBursting) {
                            const burstElapsed = nowSec - fireBurstTime;
                            const burstDuration = 1.2; // Flame jet lasts 1.2 seconds total
                            
                            if (burstElapsed < burstDuration) {
                                let translateY = 100; // 100% is hidden off-bottom, 0% is fully up
                                let op = 1;
                                
                                if (burstElapsed < 0.15) {
                                    // 0. Hold off-screen for 150ms to completely skip bad starting frames of the GIF
                                    translateY = 100;
                                } else if (burstElapsed < 0.25) {
                                    // 1. Shoot up extremely fast
                                    translateY = 100 - ((burstElapsed - 0.15) / 0.10) * 100;
                                } else if (burstElapsed < 0.8) {
                                    // 2. Hold at peak, roaring/flickering aggressively
                                    translateY = Math.random() * 3; // 0% to 3% vertical shake
                                    op = 0.85 + Math.random() * 0.15; // Opacity flicker
                                } else {
                                    // 3. Dissipate upwards and fade out
                                    const fadeProgress = (burstElapsed - 0.8) / 0.4;
                                    translateY = -(fadeProgress * 30); // Move up from 0% to -30%
                                    op = 1.0 - fadeProgress;
                                }
                                
                                if (cineFireLeft) {
                                    cineFireLeft.style.transform = `translateY(${translateY}%)`;
                                    cineFireLeft.style.opacity = op.toFixed(2);
                                }
                                if (cineFireRight) {
                                    cineFireRight.style.transform = `translateY(${translateY}%)`;
                                    cineFireRight.style.opacity = op.toFixed(2);
                                }
                            } else {
                                isFireBursting = false;
                                cineFireLeft.style.transform = `translateY(100%)`;
                                cineFireLeft.style.opacity = '0';
                                cineFireRight.style.transform = `translateY(100%)`;
                                cineFireRight.style.opacity = '0';
                            }
                        }
                    }

                    // =============================================
                    // LAYER 1: LED PILLARS (bottom / back)
                    // =============================================
                    const pillarWidth = width * 0.18;
                    const gap = width * 0.04;
                    const totalWidth = (pillarWidth * NUM_PILLARS) + (gap * (NUM_PILLARS - 1));
                    let x = (width - totalWidth) / 2;

                    const blockHeight = height * 0.028;
                    const blockGap = height * 0.007;
                    const blockTotalHeight = blockHeight + blockGap;
                    const totalBlocksPerPillar = Math.ceil(height * 0.95 / blockTotalHeight);
                    const visibleBlocks = totalBlocksPerPillar;

                    const bucketSize = Math.floor((dataArray.length * 0.75) / NUM_PILLARS);
                    const useRoundRect = typeof ctx.roundRect === 'function';

                    const cs = getComputedStyle(document.documentElement);
                    const coverColors = [
                        cs.getPropertyValue('--blob-1-color').trim() || '#ff2d55',
                        cs.getPropertyValue('--blob-2-color').trim() || '#5856d6',
                        cs.getPropertyValue('--blob-3-color').trim() || '#ff9500',
                        cs.getPropertyValue('--blob-4-color').trim() || '#af52de',
                    ];

                    for (let i = 0; i < NUM_PILLARS; i++) {
                        let bucketSum = 0;
                        for (let j = 0; j < bucketSize; j++) bucketSum += dataArray[i * bucketSize + j];
                        const raw = (bucketSum / bucketSize) / 255;

                        const lerpSpeed = raw > smoothedBars[i] ? 0.4 : 0.12;
                        smoothedBars[i] += (raw - smoothedBars[i]) * lerpSpeed;

                        if (smoothedBars[i] >= peaks[i]) {
                            peaks[i] = smoothedBars[i];
                            peakVelocities[i] = 0;
                        } else {
                            peakVelocities[i] += 0.0004;
                            peaks[i] -= peakVelocities[i];
                            if (peaks[i] < 0) peaks[i] = 0;
                        }

                        const litBlocks = Math.min(
                            Math.floor(smoothedBars[i] * totalBlocksPerPillar),
                            visibleBlocks - 1
                        );
                        const baseColor = coverColors[i];

                        ctx.shadowBlur = 0;
                        ctx.beginPath();
                        for (let b = litBlocks; b < visibleBlocks; b++) {
                            const blockY = height - (b * blockTotalHeight) - blockHeight;
                            if (useRoundRect) ctx.roundRect(x, blockY, pillarWidth, blockHeight, 5);
                            else ctx.rect(x, blockY, pillarWidth, blockHeight);
                        }
                        ctx.fillStyle = 'rgba(255,255,255,0.04)';
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        if (litBlocks > 0) {
                            const capped = Math.min(litBlocks, visibleBlocks);
                            const topY = height - (capped * blockTotalHeight);
                            const grad = ctx.createLinearGradient(0, topY, 0, height);
                            grad.addColorStop(0, baseColor);
                            grad.addColorStop(0.5, baseColor);
                            grad.addColorStop(1, 'rgba(0,0,0,0.3)');

                            ctx.beginPath();
                            for (let b = 0; b < capped; b++) {
                                const blockY = height - (b * blockTotalHeight) - blockHeight;
                                if (useRoundRect) ctx.roundRect(x, blockY, pillarWidth, blockHeight, 5);
                                else ctx.rect(x, blockY, pillarWidth, blockHeight);
                            }
                            ctx.fillStyle = grad;
                            ctx.shadowBlur = intensity * 80 + 15;
                            ctx.shadowColor = baseColor;
                            ctx.fill();

                            ctx.shadowBlur = 0;
                            const cpX = pillarWidth * 0.12;
                            const cpY = blockHeight * 0.18;
                            ctx.beginPath();
                            for (let b = 0; b < capped; b++) {
                                const blockY = height - (b * blockTotalHeight) - blockHeight;
                                if (useRoundRect) ctx.roundRect(x + cpX, blockY + cpY, pillarWidth - cpX*2, blockHeight - cpY*2, 3);
                                else ctx.rect(x + cpX, blockY + cpY, pillarWidth - cpX*2, blockHeight - cpY*2);
                            }
                            ctx.fillStyle = 'rgba(255,255,255,0.55)';
                            ctx.fill();

                            const peakBlock = Math.floor(peaks[i] * totalBlocksPerPillar);
                            if (peakBlock > 0 && peakBlock < visibleBlocks) {
                                const peakY = height - (peakBlock * blockTotalHeight) - blockHeight;
                                ctx.shadowBlur = 20;
                                ctx.shadowColor = '#ffffff';
                                ctx.fillStyle = '#ffffff';
                                ctx.beginPath();
                                if (useRoundRect) ctx.roundRect(x, peakY, pillarWidth, blockHeight * 0.5, 3);
                                else ctx.rect(x, peakY, pillarWidth, blockHeight * 0.5);
                            }
                            ctx.fill();
                            ctx.shadowBlur = 0;
                        }

                        x += pillarWidth + gap;
                    }

                    // =============================================
                    // LAYER 2: SPOTLIGHTS (concert beams from corners)
                    // =============================================
                    ctx.save();
                    ctx.globalCompositeOperation = 'screen';

                    for (let si = 0; si < 2; si++) {
                        const sp = spotlights[si];

                        sp.colorT += dt / sp.colorChangeDur;
                        if (sp.colorT >= 1) {
                            sp.colorIdx = sp.nextColorIdx;
                            sp.nextColorIdx = Math.floor(Math.random() * CONCERT_COLORS.length);
                            sp.colorT = 0;
                            sp.colorChangeDur = 2.0 + Math.random() * 3;
                            smokeParticles.forEach(p => {
                                const sc = CONCERT_COLORS[sp.colorIdx];
                                p.r = p.r * 0.5 + sc[0] * 0.5;
                                p.g = p.g * 0.5 + sc[1] * 0.5;
                                p.b = p.b * 0.5 + sc[2] * 0.5;
                            });
                        }
                        const c0 = CONCERT_COLORS[sp.colorIdx % CONCERT_COLORS.length] || [255,255,255];
                        const c1 = CONCERT_COLORS[sp.nextColorIdx % CONCERT_COLORS.length] || [255,255,255];
                        const t  = sp.colorT;
                        const cr = Math.round(c0[0] + (c1[0] - c0[0]) * t);
                        const cg = Math.round(c0[1] + (c1[1] - c0[1]) * t);
                        const cb = Math.round(c0[2] + (c1[2] - c0[2]) * t);
                        
                        // Update offscreen sprite
                        renderSmokeSprite(si === 0 ? smokeSprite0 : smokeSprite1, cr, cg, cb);

                        sp.blinkTimer -= dt;
                        if (sp.blinkTimer <= 0 && !sp.isOff) {
                            sp.isOff = true;
                            sp.blinkDur = 0.04 + Math.random() * 0.12;
                            sp.blinkTimer = 0;
                        }
                        if (sp.isOff) {
                            sp.blinkDur -= dt;
                            sp.blink = 0;
                            if (sp.blinkDur <= 0) {
                                sp.isOff = false;
                                sp.blink = 1.0;
                                sp.blinkTimer = Math.max(0.4, 1.5 + Math.random() * 3.0 - intensity * 1.2);
                            }
                        } else {
                            sp.blink = 0.75 + intensity * 0.25;
                        }

                        if (sp.blink < 0.01) continue;

                        const sweepAngle = sp.baseAngle + Math.sin(nowSec * sp.sweepSpeed + sp.phase) * sp.sweepRange;
                        const spread = 0.12 + intensity * 0.06;
                        const beamLen = Math.sqrt(width * width + height * height);
                        const ox = si === 0 ? width * 0.03 : width * 0.97;
                        const oy = -30;

                        const lx = ox + Math.cos(sweepAngle - spread) * beamLen;
                        const ly = oy + Math.sin(sweepAngle - spread) * beamLen;
                        const rx = ox + Math.cos(sweepAngle + spread) * beamLen;
                        const ry = oy + Math.sin(sweepAngle + spread) * beamLen;

                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(ox, oy);
                        ctx.lineTo(lx, ly);
                        ctx.lineTo(rx, ry);
                        ctx.closePath();
                        ctx.clip();

                        const beamAlpha = sp.blink * (0.45 + intensity * 0.25);
                        const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, beamLen * 0.85);
                        grad.addColorStop(0.0,  `rgba(${cr},${cg},${cb},${beamAlpha})`);
                        grad.addColorStop(0.25, `rgba(${cr},${cg},${cb},${beamAlpha * 0.6})`);
                        grad.addColorStop(0.7,  `rgba(${cr},${cg},${cb},${beamAlpha * 0.15})`);
                        grad.addColorStop(1.0,  `rgba(${cr},${cg},${cb},0)`);
                        ctx.fillStyle = grad;
                        ctx.fillRect(0, 0, width, height);
                        ctx.restore();

                        // Lens flare at origin
                        const flare = ctx.createRadialGradient(ox, oy, 0, ox, oy, 80);
                        flare.addColorStop(0,   `rgba(255,255,255,${sp.blink * 0.9})`);
                        flare.addColorStop(0.3, `rgba(${cr},${cg},${cb},${sp.blink * 0.5})`);
                        flare.addColorStop(1,   `rgba(${cr},${cg},${cb},0)`);
                        ctx.fillStyle = flare;
                        ctx.beginPath();
                        ctx.arc(ox, oy, 80, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    ctx.globalCompositeOperation = 'source-over';
                    ctx.restore();

                    // =============================================
                    // LAYER 3: SMOKE — Realistic Fog Machine
                    // =============================================
                    const isBursting = intensity > 0.65;
                    const spawnInterval = isBursting ? 0.012 : 0.10;
                    const spawnCount   = isBursting ? 4 : 1; // Limit burst particles to prevent fill-rate lag

                    smokeSpawnTimer -= dt;
                    if (smokeSpawnTimer <= 0 && smokeParticles.length < 50) {
                        for (let s = 0; s < spawnCount && smokeParticles.length < 50; s++) {
                            const s0 = CONCERT_COLORS[spotlights[0].colorIdx] || [255,255,255];
                            const s1 = CONCERT_COLORS[spotlights[1].colorIdx] || [255,255,255];
                            const sc = Math.random() > 0.5 ? s0 : s1;
                            const br = isBursting;

                            smokeParticles.push({
                                x:      width * 0.05 + Math.random() * width * 0.9,
                                y:      height + 50,
                                // Burst particles start smaller (tight jet), regular starts wide
                                radius: br ? 20 + Math.random() * 30 : 90 + Math.random() * 130,
                                // Burst: shoot up hard. Normal: gentle crawl
                                vx: (Math.random() - 0.5) * (br ? 30 : 22),
                                vy: br ? -(400 + Math.random() * 350) : -(4 + Math.random() * 8), // Khói thường chỉ là đà nhẹ dưới đáy
                                spriteIdx: (sc === s0) ? 0 : 1, // Store which sprite to use
                                // Turbulence phases (unique per particle → different swirl)
                                tx: Math.random() * Math.PI * 2,
                                ty: Math.random() * Math.PI * 2,
                                life: 1.0,
                                maxLife: br ? 3.5 + Math.random() * 2.0 : 1.5 + Math.random() * 1.5, // Khói thường tan nhanh hơn
                                isBurst: br,
                            });
                        }
                        smokeSpawnTimer = spawnInterval;
                    }

                    ctx.save();
                    ctx.globalCompositeOperation = 'screen';
                    for (let i = smokeParticles.length - 1; i >= 0; i--) {
                        const p = smokeParticles[i];

                        // --- TURBULENCE: xoáy lực ngẫu nhiên mỗi frame ---
                        p.tx += dt * (p.isBurst ? 2.5 : 1.4);
                        p.ty += dt * (p.isBurst ? 2.0 : 1.1);
                        const tForce = p.isBurst ? 20 : 9;
                        p.vx += Math.sin(p.tx) * tForce * dt;
                        p.vy += Math.cos(p.ty) * tForce * 0.3 * dt; // nhẹ hơn theo chiều dọc

                        // --- DRAG: cản gió, giảm tốc tự nhiên ---
                        p.vx *= p.isBurst ? 0.975 : 0.990;
                        p.vy *= p.isBurst ? 0.970 : 0.996;

                        p.x      += p.vx * dt;
                        p.y      += p.vy * dt;
                        // Burst nở rộng nhanh hơn (jet spreading)
                        p.radius += (p.isBurst ? 70 : 32) * dt;
                        p.life   -= dt / p.maxLife;

                        if (p.life <= 0 || p.y < -p.radius * 1.5) {
                            smokeParticles.splice(i, 1);
                            continue;
                        }

                        // Burst particles: opaque hơn khi mới phun, mờ dần
                        const maxAlpha = p.isBurst ? 0.65 : 0.42;
                        const alpha = p.life * maxAlpha;

                        // Performance: Draw pre-rendered sprite with globalAlpha instead of computing gradient
                        ctx.globalAlpha = alpha;
                        const sprite = p.spriteIdx === 0 ? smokeSprite0 : smokeSprite1;
                        ctx.drawImage(sprite, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
                    }
                    ctx.globalAlpha = 1.0; // Reset global alpha
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.restore();
                }
            }
            
            animationFrameId = requestAnimationFrame(syncLoop);
        }
    }

    function playAudio() {
        initVisualizer(); // Init Web Audio API on user interaction
        audio.play().then(() => {
            isPlaying = true;
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
            coverArt.classList.add('playing');
            if (vinylRecord) vinylRecord.classList.add('playing');
            
            // Kick off high-precision 60-fps sync loop
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            syncLoop();
            
        }).catch(err => console.error("Play error:", err));
    }

    function pauseAudio() {
        audio.pause();
        isPlaying = false;
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        coverArt.classList.remove('playing');
        if (vinylRecord) vinylRecord.classList.remove('playing');
        
        // Stop precision engine to save CPU
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
    }

    function togglePlay() {
        if (isPlaying) pauseAudio();
        else playAudio();
        updateMiniPlayerUI();
    }

    function prevTrack() {
        if (playlist.length === 0) return;
        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            return;
        }
        
        if (isShuffle) {
            let qIdx = shuffledQueue.indexOf(currentTrackIndex);
            if (qIdx <= 0) qIdx = shuffledQueue.length - 1;
            else qIdx--;
            currentTrackIndex = shuffledQueue[qIdx];
        } else {
            let index = currentTrackIndex - 1;
            if (index < 0) index = playlist.length - 1;
            currentTrackIndex = index;
        }
        
        loadTrack(currentTrackIndex);
        playAudio();
        updateMiniPlayerUI();
    }

    function nextTrack(isAutoNext = false) {
        if (playlist.length === 0) return;
        
        if (isAutoNext && repeatMode === 2) {
            audio.currentTime = 0;
            playAudio();
            return;
        }
        
        if (isAutoNext && repeatMode === 0 && !isShuffle) {
            if (currentTrackIndex === playlist.length - 1) {
                pauseAudio();
                return;
            }
        }
        
        if (isShuffle) {
            let qIdx = shuffledQueue.indexOf(currentTrackIndex);
            if (qIdx === -1 || qIdx === shuffledQueue.length - 1) {
                // Generate new shuffle queue or loop back
                if (shuffledQueue.length !== playlist.length) generateShuffleQueue();
                qIdx = 0;
            } else {
                qIdx++;
            }
            currentTrackIndex = shuffledQueue[qIdx];
        } else {
            let index = currentTrackIndex + 1;
            if (index >= playlist.length) {
                if (isAutoNext && repeatMode === 0) return; // Stop at end of list
                index = 0;
            }
            currentTrackIndex = index;
        }
        
        loadTrack(currentTrackIndex);
        playAudio();
        updateMiniPlayerUI();
    }
    
    function generateShuffleQueue() {
        shuffledQueue = [];
        for (let i = 0; i < playlist.length; i++) shuffledQueue.push(i);
        // Fisher-Yates
        for (let i = shuffledQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledQueue[i], shuffledQueue[j]] = [shuffledQueue[j], shuffledQueue[i]];
        }
        // Ensure current track is first in new queue to avoid immediate repeat
        if (currentTrackIndex !== -1) {
            const currentQIdx = shuffledQueue.indexOf(currentTrackIndex);
            if (currentQIdx !== -1) {
                shuffledQueue.splice(currentQIdx, 1);
                shuffledQueue.unshift(currentTrackIndex);
            }
        }
    }

    function updateProgress() {
        if (isNaN(audio.duration)) return;
        
        const duration = audio.duration;
        const currentTime = audio.currentTime;
        
        if (!isDraggingSlider) {
            const percent = (currentTime / duration) * 100;
            progressSlider.value = percent;
            progressBarFill.style.width = `${percent}%`;
        }
        
        currentTimeEl.textContent = formatTime(currentTime);
        totalTimeEl.textContent = formatTime(duration);
        
        updateLyricsHighlight(currentTime);
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function handleUploadForm(e) {
        e.preventDefault();
        
        const audioFile = uploadAudio.files[0];
        const lrcFile = uploadLrc.files[0];
        let coverFile = uploadCover.files[0];
        const title = uploadTitle.value.trim() || `Song #${playlist.length + 1}`;
        const artist = uploadArtist.value.trim() || "Unknown Artist";
        
        if (!audioFile || !lrcFile) {
            alert("Vui lòng tải lên ít nhất tệp Audio và Lyrics.");
            return;
        }

        const audioUrl = URL.createObjectURL(audioFile);
        
        const processUpload = async (coverBlob, coverUrl) => {
            // Read LRC file
            const reader = new FileReader();
            reader.onload = async function(event) {
                const lrcText = event.target.result;
                
                // Create new song object
                const newSong = {
                    title: title,
                    artist: artist,
                    url: audioUrl,
                    cover: coverUrl,
                    lyrics: lrcText,
                    drift: 1.0,
                    audioBlob: audioFile,
                    coverBlob: coverBlob
                };
                
                // Add to playlist
                playlist.push(newSong);
                renderSongGrid();
                
                // Save persistently to IndexedDB
                await saveLibraryToDB();
                
                // Reset form and close modal
                uploadForm.reset();
                uploadModal.classList.add('hidden');
            };
            reader.readAsText(lrcFile);
        };

        if (coverFile) {
            processUpload(coverFile, URL.createObjectURL(coverFile));
        } else {
            fetch('assets/images/cover.png').then(r => r.blob()).then(blob => {
                processUpload(blob, URL.createObjectURL(blob));
            }).catch(e => {
                // Ultimate fallback
                processUpload(null, 'assets/images/cover.png');
            });
        }
    }

    // --- Advanced Vibrant Color Extractor ---
    // --- Event Listeners ---
    function setupEventListeners() {
        btnAddSong.addEventListener('click', () => {
            uploadForm.reset();
            uploadModal.classList.remove('hidden');
        });
        btnCloseModal.addEventListener('click', () => uploadModal.classList.add('hidden'));
        uploadForm.addEventListener('submit', handleUploadForm);
        
        uploadAudio.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (window.jsmediatags) {
                window.jsmediatags.read(file, {
                    onSuccess: function(tag) {
                        const tags = tag.tags;
                        if (tags.title) uploadTitle.value = tags.title;
                        if (tags.artist) uploadArtist.value = tags.artist;
                        if (tags.picture) {
                            try {
                                const { data, format } = tags.picture;
                                const blob = new Blob([new Uint8Array(data)], { type: format });
                                const imgFile = new File([blob], "cover.jpg", { type: format });
                                const dt = new DataTransfer();
                                dt.items.add(imgFile);
                                uploadCover.files = dt.files;
                            } catch (err) {
                                console.log("Could not attach cover art", err);
                            }
                        }
                    },
                    onError: function(error) {
                        console.log('Error reading tags', error);
                    }
                });
            }
        });
        
        if (editAudio) {
            editAudio.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (window.jsmediatags) {
                    window.jsmediatags.read(file, {
                        onSuccess: function(tag) {
                            const tags = tag.tags;
                            if (tags.title) document.getElementById('edit-title').value = tags.title;
                            if (tags.artist) document.getElementById('edit-artist').value = tags.artist;
                            if (tags.picture) {
                                try {
                                    const { data, format } = tags.picture;
                                    const blob = new Blob([new Uint8Array(data)], { type: format });
                                    const imgFile = new File([blob], "cover.jpg", { type: format });
                                    const dt = new DataTransfer();
                                    dt.items.add(imgFile);
                                    editCover.files = dt.files;
                                } catch (err) {
                                    console.log("Could not attach cover art", err);
                                }
                            }
                        },
                        onError: function(error) {
                            console.log('Error reading tags', error);
                        }
                    });
                }
            });
        }
        
        btnBackHome.addEventListener('click', closePlayer);
        
        // No longer using timeupdate for progress! using requestAnimationFrame 60-FPS loop instead!
        audio.addEventListener('ended', () => nextTrack(true));
        
        playBtn.addEventListener('click', togglePlay);
        prevBtn.addEventListener('click', prevTrack);
        nextBtn.addEventListener('click', () => nextTrack(false));
        
        // Repeat Button Logic
        const btnRepeat = document.getElementById('btn-repeat');
        const iconRepeat = btnRepeat.querySelector('.icon-repeat');
        const iconRepeat1 = btnRepeat.querySelector('.icon-repeat-1');
        btnRepeat.addEventListener('click', () => {
            repeatMode = (repeatMode + 1) % 3;
            if (repeatMode === 0) {
                btnRepeat.classList.remove('active-state');
                iconRepeat.classList.remove('hidden');
                iconRepeat1.classList.add('hidden');
            } else if (repeatMode === 1) {
                btnRepeat.classList.add('active-state');
                iconRepeat.classList.remove('hidden');
                iconRepeat1.classList.add('hidden');
            } else if (repeatMode === 2) {
                btnRepeat.classList.add('active-state');
                iconRepeat.classList.add('hidden');
                iconRepeat1.classList.remove('hidden');
            }
        });
        
        // Shuffle Button Logic
        const btnShuffle = document.getElementById('btn-shuffle');
        btnShuffle.addEventListener('click', () => {
            isShuffle = !isShuffle;
            if (isShuffle) {
                btnShuffle.classList.add('active-state');
                generateShuffleQueue();
            } else {
                btnShuffle.classList.remove('active-state');
            }
        });
        
        progressSlider.addEventListener('input', (e) => {
            isDraggingSlider = true;
            progressBarFill.style.width = `${e.target.value}%`;
            // Dragging: pre-warm the lyric line they are hovering on
            if (!isNaN(audio.duration)) {
                const targetTime = (e.target.value / 100) * audio.duration;
                prepareLyricNearTime(targetTime);
            }
        });
        progressSlider.addEventListener('change', (e) => {
            if (!isNaN(audio.duration)) {
                const targetTime = (e.target.value / 100) * audio.duration;
                prepareLyricNearTime(targetTime);
                audio.currentTime = targetTime;
                // Force an immediate highlight update if paused
                if (!isPlaying) updateProgress(); 
            }
            isDraggingSlider = false;
        });
        
        volumeSlider.addEventListener('input', (e) => {
            audio.volume = e.target.value / 100;
        });
        
        btnToggleDrift.addEventListener('click', () => {
            driftContainer.classList.toggle('hidden');
        });
        
        btnCinematic.addEventListener('click', () => {
            isCinematicMode = true;
            isAngelicMode = false;
            playerView.classList.add('hidden');
            cinematicView.classList.remove('hidden');
            document.body.classList.add('mouse-active');
            
            // Resize canvas using cached values
            cinematicCanvas.width = winWidth;
            cinematicCanvas.height = winHeight;
            
            // Khởi động dòng hiện tại lập tức
            if (activeLyricIndex !== -1 && currentLyrics[activeLyricIndex]) {
                triggerCinematicLine(currentLyrics[activeLyricIndex].text);
            }
        });
        
        btnExitCinematic.addEventListener('click', () => {
            isCinematicMode = false;
            cinematicView.classList.add('hidden');
            playerView.classList.remove('hidden');
            cinematicTextContainer.innerHTML = ''; // Clear DOM
        });

        btnAngelic.addEventListener('click', () => {
            isAngelicMode = true;
            isCinematicMode = false;
            playerView.classList.add('hidden');
            angelicView.classList.remove('hidden');
            document.body.classList.add('mouse-active');
            
            // Khởi động dòng hiện tại và prepare dòng tiếp theo
            if (activeLyricIndex !== -1 && currentLyrics[activeLyricIndex]) {
                showAngelicLine(activeLyricIndex);
                if (currentLyrics[activeLyricIndex + 1]) {
                    prepareAngelicLine(currentLyrics[activeLyricIndex + 1].text, activeLyricIndex + 1);
                }
            }
        });

        btnExitAngelic.addEventListener('click', () => {
            isAngelicMode = false;
            angelicView.classList.add('hidden');
            playerView.classList.remove('hidden');
            angelicTextContainer.innerHTML = '';
            angelicParticleContainer.innerHTML = '';
        });
        
        // Auto-hide Cinematic/Angelic UI when mouse is idle
        let mouseTimeout = null;
        document.addEventListener('mousemove', () => {
            if (isCinematicMode || isAngelicMode) {
                document.body.classList.add('mouse-active');
                clearTimeout(mouseTimeout);
                mouseTimeout = setTimeout(() => {
                    document.body.classList.remove('mouse-active');
                }, 2000);
            }
        });
        
        driftSlider.addEventListener('input', (e) => {
            driftRatio = parseFloat(e.target.value);
            driftVal.textContent = driftRatio.toFixed(3) + 'x';
            if (playlist[currentTrackIndex]) {
                playlist[currentTrackIndex].drift = driftRatio;
            }
            if (!isPlaying) updateProgress();
        });
        
        driftSlider.addEventListener('change', () => {
            saveLibraryToDB(); // Save persistently when done dragging
        });
        
        document.getElementById('fullscreen-btn').addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.log(`Error attempting to enable fullscreen: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        });
        
        window.addEventListener('keydown', (e) => {
            // Bỏ qua khi đang gõ vào input
            const tag = document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            
            // Không thao tác nếu chưa có bài hát (ví dụ ở màn hình home)
            if (!audio.src || audio.src.endsWith(window.location.pathname) || audio.src === '') return;

            switch (e.code) {
                // ── Phím Space: Play / Pause ─────────────────
                case 'Space':
                    e.preventDefault();
                    togglePlay();
                    break;

                // ── Media Keys (bàn phím có nút media) ──────
                case 'MediaPlayPause':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'MediaTrackNext':
                    e.preventDefault();
                    nextTrack();
                    break;
                case 'MediaTrackPrevious':
                    e.preventDefault();
                    prevTrack();
                    break;
                case 'MediaStop':
                    e.preventDefault();
                    pauseAudio();
                    audio.currentTime = 0;
                    if (!isPlaying) updateProgress();
                    break;

                // ── Arrow Left / Right: Seek ±5s ─────────────
                case 'ArrowLeft':
                    e.preventDefault();
                    const newTimeL = Math.max(0, audio.currentTime - 5);
                    prepareLyricNearTime(newTimeL);
                    audio.currentTime = newTimeL;
                    if (!isPlaying) updateProgress();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    const newTimeR = Math.min(audio.duration || 0, audio.currentTime + 5);
                    prepareLyricNearTime(newTimeR);
                    audio.currentTime = newTimeR;
                    if (!isPlaying) updateProgress();
                    break;

                // ── Arrow Up / Down: Volume ±5% ──────────────
                case 'ArrowUp':
                    e.preventDefault();
                    audio.volume = Math.min(1, audio.volume + 0.05);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    audio.volume = Math.max(0, audio.volume - 0.05);
                    break;
            }
        });
    }

    // Prevent First-Paint Lag in Angelic Mode by pre-compiling SVGs/Shaders
    function preloadAngelicAssets() {
        const dummyContainer = document.createElement('div');
        dummyContainer.style.position = 'absolute';
        dummyContainer.style.top = '-9999px';
        dummyContainer.style.opacity = '0.01';
        dummyContainer.style.pointerEvents = 'none';
        
        // Generate a minimal branch to force browser to parse CSS animations and SVG layout
        const branchStr = window.WavrFloral.createBranch({ angle: 0, scale: 0.1, cy: 1, flower: true }, 0, 10, 0);
        
        // Pre-warm the fireFilter SVG shader by applying it to a dummy text element on startup
        const warmUpFireText = `<div style="font-family: 'DotGothic16'; filter: url(#fireFilter); font-size: 1rem; width: 10px; height: 10px;">Prewarm</div>`;
        
        dummyContainer.innerHTML = `<svg width="10" height="10">${branchStr}</svg>${warmUpFireText}`;
        
        document.body.appendChild(dummyContainer);
        
        // Clean up after 2 seconds
        setTimeout(() => { if (dummyContainer.parentNode) dummyContainer.remove(); }, 2000);
    }

    function preloadCinematicAssets() {
        const dummyContainer = document.createElement('div');
        dummyContainer.style.position = 'absolute';
        dummyContainer.style.top = '-9999px';
        dummyContainer.style.opacity = '0.01';
        dummyContainer.style.pointerEvents = 'none';
        
        // Create dummy elements for all heavy Cinematic classes to force GPU compilation
        dummyContainer.innerHTML = `
            <div class="cinematic-line-wrapper cine-enter">
                <div class="sparkle" style="animation-name: sparkle-shoot;"></div>
                <div class="cinematic-line">
                    <span class="cine-word glitch-word-anim" data-text="Prewarm">Prewarm</span>
                </div>
            </div>
        `;
        
        document.body.appendChild(dummyContainer);
        setTimeout(() => { if (dummyContainer.parentNode) dummyContainer.remove(); }, 2000);
    }

    // Ignite Application
    preloadAngelicAssets();
    preloadCinematicAssets();
    initHome();
});
