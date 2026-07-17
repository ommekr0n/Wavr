import { parseLyrics } from './modules/lyric-parser.js';
import { extractColorsFromImage } from './modules/color-extractor.js';
import { DOM } from './modules/dom.js';
import { initSettings, initEditLibrary } from './modules/edit-library.js';
import { startScreenRecording } from './modules/recorder.js';

    
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

    // Global ESC handler for gradual exit
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // 1. Context Menu
            const activeMenu = document.querySelector('.context-menu.active');
            if (activeMenu) {
                activeMenu.classList.remove('active');
                return;
            }
            
            // 2. Modals
            const activeModal = document.querySelector('.modal:not(.hidden), .modal-backdrop:not(.hidden)');
            if (activeModal) {
                const closeBtn = activeModal.querySelector('.close-btn, .btn-close, .btn-cancel, #btn-close-modal, .btn-create-box-cancel, [title="Close"], button[id*="cancel"]');
                if (closeBtn) closeBtn.click();
                else activeModal.classList.add('hidden');
                return;
            }
            
            // 2.5. Cinematic/Angelic Mode
            if (typeof isCinematicMode !== 'undefined' && isCinematicMode) {
                const btnExitCine = document.getElementById('btn-exit-cinematic');
                if (btnExitCine) btnExitCine.click();
                return;
            }
            if (typeof isAngelicMode !== 'undefined' && isAngelicMode) {
                const btnExitAngel = document.getElementById('btn-exit-angelic');
                if (btnExitAngel) btnExitAngel.click();
                return;
            }
            
            // 3. Player View (Higher priority than box since it overlays everything)
            const playerViewEl = document.getElementById('player-view');
            if (playerViewEl && !playerViewEl.classList.contains('hidden') && typeof closePlayer === 'function') {
                closePlayer();
                return;
            }

            // 4. Expanded Vinyl Box
            const expandedBox = document.querySelector('.vinyl-box-card.expanded-active');
            if (expandedBox) {
                const boxCloseBtn = expandedBox.querySelector('.btn-close-box');
                if (boxCloseBtn) {
                    boxCloseBtn.click();
                    return;
                }
            }
            
            // 5. Edit Library View
            const editLibraryViewEl = document.getElementById('edit-library-view');
            if (editLibraryViewEl && !editLibraryViewEl.classList.contains('hidden')) {
                const doneBtn = document.getElementById('btn-edit-done');
                if (doneBtn) {
                    doneBtn.click();
                    return;
                }
            }
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
    const btnMute = document.getElementById('btn-mute');
    
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
    let playlist = [];
    let activeQueue = []; // Active playback queue (either unboxed songs or a specific box's songs)
    let activePlaylistContext = 'library'; // 'library' or the vinyl box ID like 'vinyl-xxx'
    // In-memory cache: avoids hitting IndexedDB on every renderSongGrid call
    let cachedVinylBoxes = [];
    let cachedLibraryOrder = [];
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
    let lastVolume = 0.8;
    let isMuted = false;
    let isCinematicMode = false;
    let isAngelicMode = false;
    let angelicParticleTimer = 0;
    
    // Window Dimension Caching
    let winWidth = window.innerWidth;
    let winHeight = window.innerHeight;
    window.addEventListener('resize', () => {
        winWidth = window.innerWidth;
        winHeight = window.innerHeight;
    });
    
    // Web Audio API Variables
    let audioCtx = null;
    let analyser = null;
    let dataArray = null;
    let eqNodes = [];

    
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
            
            // Create 5-band EQ
            const freqs = [60, 230, 910, 3600, 14000];
            const sliders = document.querySelectorAll('.eq-slider');
            eqNodes = freqs.map((freq, idx) => {
                const node = audioCtx.createBiquadFilter();
                node.type = 'peaking';
                node.frequency.value = freq;
                node.Q.value = 1;
                const initialGain = sliders[idx] ? parseFloat(sliders[idx].value) : 0;
                node.gain.value = initialGain;
                return node;
            });
            
            // Connect: source -> eq0 -> eq1 -> eq2 -> eq3 -> eq4 -> analyser -> destination
            source.connect(eqNodes[0]);
            for (let i = 0; i < eqNodes.length - 1; i++) {
                eqNodes[i].connect(eqNodes[i+1]);
            }
            eqNodes[eqNodes.length - 1].connect(analyser);
            analyser.connect(audioCtx.destination);
            
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function updateVolumeIcon(volume) {
        if (!btnMute) return;
        if (volume === 0) {
            btnMute.innerHTML = `
                <svg id="volume-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <line x1="23" y1="9" x2="17" y2="15"></line>
                    <line x1="17" y1="9" x2="23" y2="15"></line>
                </svg>
            `;
        } else if (volume < 0.5) {
            btnMute.innerHTML = `
                <svg id="volume-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
            `;
        } else {
            btnMute.innerHTML = `
                <svg id="volume-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
            `;
        }
    }

    // --- Core Functions ---

    async function initHome() {
        audio.volume = 0.8; // Initialize volume to match the slider default (80%)
        try {
            const savedPlaylist = await localforage.getItem('playlist');
            if (savedPlaylist) {
                let needsSave = false;
                // Reconstruct blob URLs dynamically for the current session
                playlist = savedPlaylist.map((song, idx) => {
                    let url = song.url || '';
                    let cover = song.cover || 'assets/images/cover.png';
                    try {
                        if (song.audioBlob instanceof Blob) url = URL.createObjectURL(song.audioBlob);
                        if (song.coverBlob instanceof Blob) cover = URL.createObjectURL(song.coverBlob);
                    } catch(blobErr) { console.warn('Blob URL error', blobErr); }
                    if (!song.id) {
                        needsSave = true;
                    }
                    return {
                        id: song.id || 'song-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000),
                        title: song.title,
                        artist: song.artist,
                        lyrics: song.lyrics,
                        drift: song.drift || 1.0,
                        url,
                        cover,
                        audioBlob: song.audioBlob,
                        coverBlob: song.coverBlob
                    };
                });
                if (needsSave) {
                    await saveLibraryToDB();
                }
            }
        } catch (e) {
            console.error("Error loading library from IndexedDB", e);
        }
        
        await renderSongGrid();
        setupEventListeners();

        // Initialize Settings and Edit Library Modules
        initSettings();
        initEditLibrary(playlist, async () => {
            // Callback: reload playlist from IndexedDB and re-render grid
            try {
                const savedPlaylist = await localforage.getItem('playlist');
                if (savedPlaylist) {
                    let needsSave = false;
                    playlist = savedPlaylist.map((song, idx) => {
                        let url = song.url || '';
                        let cover = song.cover || 'assets/images/cover.png';
                        try {
                            if (song.audioBlob instanceof Blob) url = URL.createObjectURL(song.audioBlob);
                            if (song.coverBlob instanceof Blob) cover = URL.createObjectURL(song.coverBlob);
                        } catch(blobErr) { console.warn('Blob URL error', blobErr); }
                        if (!song.id) {
                            needsSave = true;
                        }
                        return {
                            id: song.id || 'song-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000),
                            title: song.title,
                            artist: song.artist,
                            lyrics: song.lyrics,
                            drift: song.drift || 1.0,
                            url,
                            cover,
                            audioBlob: song.audioBlob,
                            coverBlob: song.coverBlob  // BUG 11 FIX: preserve coverBlob
                        };
                    });
                    if (needsSave) {
                        await saveLibraryToDB();
                    }
                }
            } catch (e) {
                console.error("Error reloading library", e);
            }
            await renderSongGrid();
        });
    }

    async function saveLibraryToDB() {
        try {
            // Save the raw blobs to IndexedDB. Transient URLs cannot be saved.
            const playlistToSave = playlist.map(song => ({
                id: song.id || 'song-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
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

    async function renderSongGrid() {
        homeSongGrid.innerHTML = '';
        // Use cache; only refresh from DB if cache is empty (first load)
        if (cachedVinylBoxes.length === 0 && cachedLibraryOrder.length === 0) {
            try {
                cachedVinylBoxes = await localforage.getItem('vinyl_boxes') || [];
                cachedLibraryOrder = await localforage.getItem('library_order') || [];
            } catch (e) {
                console.error("Error loading vinyl boxes or order", e);
            }
        }
        const vinylBoxes = cachedVinylBoxes;
        const libraryOrder = cachedLibraryOrder;

        // Get set of all boxed song IDs
        const boxedSongIds = new Set();
        vinylBoxes.forEach(box => {
            if (box.songIds) {
                box.songIds.forEach(id => boxedSongIds.add(id));
            }
        });

        const unorderedItems = [];

        // Add Vinyl Boxes
        vinylBoxes.forEach(box => {
            unorderedItems.push({
                type: 'box',
                id: box.id,
                name: box.name,
                songIds: box.songIds || [],
                raw: box
            });
        });

        // Add Unboxed Songs
        playlist.forEach((song, index) => {
            if (!boxedSongIds.has(song.id)) {
                unorderedItems.push({
                    type: 'song',
                    id: song.id,
                    index: index,
                    raw: song
                });
            }
        });

        // Sort items according to libraryOrder
        const gridItems = [];
        const itemMap = new Map();
        unorderedItems.forEach(item => itemMap.set(item.id, item));

        libraryOrder.forEach(orderId => {
            if (itemMap.has(orderId)) {
                gridItems.push(itemMap.get(orderId));
                itemMap.delete(orderId);
            }
        });

        // Append any remaining items (new boxes or songs not yet in order array)
        itemMap.forEach(item => gridItems.push(item));

        gridItems.forEach(item => {
            const card = document.createElement('div');
            if (item.type === 'song') {
                const song = item.raw;
                card.className = 'song-card';
                card.setAttribute('data-index', item.index);
                card.setAttribute('data-id', song.id);
                card.innerHTML = `
                    <div class="song-card-inner">
                        <img src="${song.cover || 'assets/images/cover.png'}" alt="Cover">
                    </div>
                    <div class="song-card-title">${song.title}</div>
                    <div class="song-card-artist">${song.artist}</div>
                `;
            } else {
                const box = item.raw;
                card.className = 'song-card vinyl-box-card';
                card.setAttribute('data-box-id', box.id);
                card.style.setProperty('--box-color', box.color || '#5a4232');
                
                const boxSongs = (box.songIds || []).map(id => playlist.find(s => s.id === id)).filter(Boolean);
                const recentSongs = [...boxSongs].slice(0, 4);
                
                let sleevesHTML = '';
                for (let i = 0; i < recentSongs.length; i++) {
                    const song = recentSongs[i];
                    const coverUrl = song.cover || 'assets/images/cover.png';
                    const sleeveClass = `sleeve-${i}`;
                    sleevesHTML += `<div class="peeking-sleeve ${sleeveClass}" style="background-image: url('${coverUrl}')"></div>`;
                }

                card.innerHTML = `
                    <div class="song-card-inner box-card-inner" style="aspect-ratio: 1/1; margin-bottom: 15px;">
                        <div class="vinyl-box-visual" style="--box-color: ${box.color || '#5a4232'};">
                            <div class="vinyl-sleeves-container">
                                ${sleevesHTML}
                                <div class="glass-front"></div>
                            </div>
                        </div>
                    </div>
                    <div class="song-card-title">${box.name}</div>
                    <div class="song-card-artist">${box.songIds ? box.songIds.length : 0} Tracks</div>
                `;
            }
            homeSongGrid.appendChild(card);
        });

        setupBoxExpansionListeners(vinylBoxes);
        activeQueue = playlist.filter(s => !boxedSongIds.has(s.id)); // Default active queue is unboxed songs
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
        try {
            if (trackToDeleteIndex !== null) {
                const idx = parseInt(trackToDeleteIndex);
                
                // Clean up Blob URLs if necessary
                if (playlist[idx].url && playlist[idx].url.startsWith('blob:')) URL.revokeObjectURL(playlist[idx].url);
                if (playlist[idx].cover && playlist[idx].cover.startsWith('blob:')) URL.revokeObjectURL(playlist[idx].cover);
                
                // If the song being deleted is currently playing, pause it BEFORE splicing
                // so that the pause event listener doesn't read from an undefined index.
                if (currentTrackIndex === idx) {
                    pauseAudio();
                    playlist.splice(idx, 1);
                    
                    if (playlist.length > 0) {
                        // BUG 10 FIX: rebuild activeQueue before calling loadTrack
                        await renderSongGrid();
                        currentTrackIndex = 0;
                        loadTrack(0);
                        updateMiniPlayerUI();
                    } else {
                        currentTrackIndex = -1;
                        audio.src = '';
                        updateMiniPlayerUI();
                    }
                } else {
                    playlist.splice(idx, 1);
                    if (currentTrackIndex > idx) {
                        currentTrackIndex--;
                    }
                }
                
                renderSongGrid();
                await saveLibraryToDB();
                
                // Notify edit-library to re-render immediately so the song disappears right away
                document.dispatchEvent(new CustomEvent('wavr:libraryChanged'));
                
                document.getElementById('delete-modal').classList.add('hidden');
                trackToDeleteIndex = null;
            }
        } catch (error) {
            console.error("Delete error: ", error);
            alert("Lỗi khi xóa bài hát: " + error.message);
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

    let isPlayerTransitioning = false;

    window.closePlayer = closePlayer; // Expose for ESC handler

    function openPlayer(index) {
        currentTrackIndex = index;
        loadTrack(index);
        syncPlayerControlsUI();
        
        document.getElementById('mini-player').classList.remove('hidden');
        updateMiniPlayerUI();
        
        playAudio();
    }

    function closePlayer() {
        if (isPlayerTransitioning) return;
        isPlayerTransitioning = true;
        
        playerView.classList.remove('player-active');
        const overlay = document.getElementById('fade-overlay');
        if (overlay) overlay.classList.add('active');
        
        setTimeout(() => {
            playerView.classList.add('hidden');
            const auroraBg = document.getElementById('aurora-bg');
            if (auroraBg) auroraBg.classList.add('hidden');
            
            homeView.classList.remove('hidden');
            void homeView.offsetHeight;
            
            if (overlay) overlay.classList.remove('active');
            
            setTimeout(() => {
                isPlayerTransitioning = false;
                if (currentTrackIndex !== -1 && playlist[currentTrackIndex]) {
                    document.getElementById('mini-player').classList.remove('hidden');
                    updateMiniPlayerUI();
                }
            }, 200);
        }, 200);
    }
    
    function updateMiniPlayerUI() {
        const source = getPlaybackSource();
        if (currentTrackIndex === -1 || !source[currentTrackIndex]) {
            document.getElementById('mini-player').classList.add('hidden');
            return;
        }
        const song = source[currentTrackIndex];
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
        
        if (currentTrackIndex !== -1 && !isPlayerTransitioning) {
            document.getElementById('mini-player').classList.add('hidden');
            isPlayerTransitioning = true;
            
            const overlay = document.getElementById('fade-overlay');
            if (overlay) overlay.classList.add('active');
            
            setTimeout(() => {
                homeView.classList.add('hidden');
                playerView.classList.remove('hidden');
                const auroraBg = document.getElementById('aurora-bg');
                if (auroraBg) auroraBg.classList.remove('hidden');
                
                void playerView.offsetHeight;
                playerView.classList.add('player-active');
                if (overlay) overlay.classList.remove('active');
                
                setTimeout(() => {
                    isPlayerTransitioning = false;
                }, 200);
            }, 200);
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

    function getPlaybackSource() {
        if (isShuffle && repeatMode === 0) {
            return playlist;
        }
        return activeQueue;
    }

    let toastTimeout = null;
    function showToast(message) {
        let toast = document.getElementById('wavr-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'wavr-toast';
            toast.className = 'wavr-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }

    function syncPlayerControlsUI() {
        const btnRepeat = document.getElementById('btn-repeat');
        if (!btnRepeat) return;
        const iconRepeat = btnRepeat.querySelector('.icon-repeat');
        const iconRepeat1 = btnRepeat.querySelector('.icon-repeat-1');
        const btnShuffle = document.getElementById('btn-shuffle');
        
        // Main Repeat Button
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
        
        // Main Shuffle Button
        if (isShuffle) {
            btnShuffle.classList.add('active-state');
        } else {
            btnShuffle.classList.remove('active-state');
        }
        
        // Mini Player
        updateMiniPlayerUI();
    }

    function loadTrack(index) {
        const source = getPlaybackSource();
        const track = source[index];
        if (!track) {
            console.warn('loadTrack: no track at index', index, 'source.length=', source.length);
            return;
        }
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
            document.documentElement.style.setProperty('--blob-1-color', `rgb(${uiColors[0].r}, ${uiColors[0].g}, ${uiColors[0].b})`);
            document.documentElement.style.setProperty('--blob-2-color', `rgb(${uiColors[1].r}, ${uiColors[1].g}, ${uiColors[1].b})`);
            document.documentElement.style.setProperty('--blob-3-color', `rgb(${uiColors[2].r}, ${uiColors[2].g}, ${uiColors[2].b})`);
            document.documentElement.style.setProperty('--blob-4-color', `rgb(${uiColors[3].r}, ${uiColors[3].g}, ${uiColors[3].b})`);
            
            document.documentElement.style.setProperty('--blob-1-size', `${Math.floor(Math.random() * 20 + 30)}vw`); 
            document.documentElement.style.setProperty('--blob-2-size', `${Math.floor(Math.random() * 20 + 30)}vw`); 
            document.documentElement.style.setProperty('--blob-3-size', `${Math.floor(Math.random() * 20 + 30)}vw`); 
            document.documentElement.style.setProperty('--blob-4-size', `${Math.floor(Math.random() * 20 + 30)}vw`); 

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


    function renderLyrics() {
        lyricsList.innerHTML = '';
        if (angelicTextContainer) angelicTextContainer.innerHTML = '';
        if (cinematicTextContainer) cinematicTextContainer.innerHTML = '';
        activeLyricIndex = -1;
        
        if (currentLyrics.length === 0) {
            lyricsList.innerHTML = '<div class="am-lyric-line placeholder-line">No lyrics available</div>';
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
        
        // 1. Xử lý cụm ngoặc đơn (...)
        let processedText = text.replace(/\([^)]*\)/g, (match) => {
            if (match.length <= 40) {
                // Ngắn: thay khoảng trắng thường thành non-breaking space
                return match.replace(/ /g, '\u00A0');
            } else {
                // Dài: chèn \n trước dấu ( để xuống dòng
                return '\n' + match;
            }
        });

        // 2. Logic orphan-word cũ (xử lý từng dòng để không làm mất \n)
        const lines = processedText.split('\n');
        const processedLines = lines.map(line => {
            // Split bằng dấu cách thường (tránh \s vì \s match cả \u00A0)
            const words = line.trim().split(/ +/);
            if (words.length <= 3) return line;
            
            // Nối 3 từ cuối bằng non-breaking space
            const lastWords = words.splice(-3).join('\u00A0');
            return words.join(' ') + ' ' + lastWords;
        });
        
        return processedLines.join('\n');
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
        
        const pathLen = Math.ceil(w * 1.15); 
        let paths = '';
        for(let i=0; i<5; i++) {
            const y = yCenter + (i - 2) * staffLineGap;
            paths += `<path class="staff-line" d="M 0,${y} C ${w*0.3},${y - amp*phase} ${w*0.7},${y + amp*phase} ${w},${y}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray: ${pathLen}; stroke-dashoffset: ${pathLen};"/>`;
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
        // Light templates (2-3 branches) for dense scenes, all templates for sparse scenes
        const lightTemplateIndices = [1, 2, 3, 7]; // Elegant Twin, Majestic, Heart, Asymmetrical
        const targetCount = Math.max(2, Math.floor(w / 320));

        // --- Stratified Placement (even spacing, no random clustering) ---
        // Divide usable width into equal slots, place one tree per slot with small jitter.
        const usableLeft  = w * 0.06;
        const usableWidth = w * 0.88;
        const slotWidth   = usableWidth / targetCount;

        // Alternating line pattern: outer-top → outer-bottom → inner-top → inner-bottom
        // Creates a natural rhythm: tall peak, deep valley, medium high, medium low…
        const linePattern = [0, 4, 1, 3];

        for (let i = 0; i < targetCount; i++) {
            // Even horizontal spread: centre of slot ± up to 30% of slot width
            const slotCenter = usableLeft + (i + 0.5) * slotWidth;
            const xJitter    = (Math.random() - 0.5) * slotWidth * 0.6;
            const fx = Math.max(usableLeft, Math.min(usableLeft + usableWidth, slotCenter + xJitter));

            // Deterministic top/bottom alternation with slight random swap (10%) for life
            let chosenLineIndex = linePattern[i % linePattern.length];
            if (Math.random() < 0.1) {
                // Occasionally swap to the opposite side to avoid feeling mechanical
                const swapMap = { 0: 4, 4: 0, 1: 3, 3: 1 };
                chosenLineIndex = swapMap[chosenLineIndex];
            }

            const offset     = (chosenLineIndex - 2) * staffLineGap;
            const baseCenter = yCenter + offset;

            const t = fx / w;
            const u = 1 - t;
            const fy = u*u*u*baseCenter + 3*u*u*t*(baseCenter - amp*phase) + 3*u*t*t*(baseCenter + amp*phase) + t*t*t*baseCenter;

            // --- Bezier Tangent for lean angle ---
            const u_t = 1 - t;
            const dBx = 3 * (
                (w * 0.3)         * u_t * u_t +
                2 * (w * 0.4) * t * u_t +
                (w * 0.3)         * t * t
            );
            const dy0 = -amp * phase;
            const dy1 =  amp * phase;
            const dy2 = -amp * phase;
            const dBy = 3 * (
                dy0 * u_t * u_t +
                2 * dy1 * t * u_t +
                dy2 * t * t
            );
            const tangentAngleDeg = Math.atan2(dBy, dBx) * (180 / Math.PI);
            const jitter = (Math.random() - 0.5) * 10;
            const rawLean = Math.max(-35, Math.min(35, tangentAngleDeg + jitter));

            placedRoots.push({ x: fx, y: fy, chosenLineIndex, leanAngle: rawLean });
        }
        
        for (const root of placedRoots) {
            const { x: fx, y: fy, chosenLineIndex, radius, leanAngle = 0 } = root;
            
            const t = fx / w; 
            const isGrowingUp = chosenLineIndex < 2;
            const baseAngle = isGrowingUp ? (-90 - leanAngle) : (90 + leanAngle);
            // Fixed range: 48 = min readable, 78 = max before overlapping lyrics
            const treeBaseScale = 48 + Math.random() * 30;
            
            const templates = window.WavrFloral.templates;
            // When scene is dense (many trees), prefer lighter 2-branch templates to stay performant
            const useLightTemplate = targetCount > 3;
            const templatePool = useLightTemplate
                ? lightTemplateIndices.map(i => templates[i])
                : templates;
            const selectedTemplate = templatePool[Math.floor(Math.random() * templatePool.length)];
            
            let templateHTML = '';
            selectedTemplate.branches.forEach((branch, idx) => {
                templateHTML += window.WavrFloral.createBranch(branch, idx, treeBaseScale, t);
            });
            
            let rootPaths = `<g transform="rotate(${baseAngle})">${templateHTML}</g>`;
            paths += `<g transform="translate(${fx}, ${fy})">${rootPaths}</g>`;
        }
        
        const svgHTML = `
        <svg class="angelic-staff-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="geometricPrecision" overflow="visible">
            ${paths}
        </svg>`;
        
        const newLine = document.createElement('div');
        newLine.className = 'angelic-line';
        
        const safeText = preventOrphanWords(text);
        const textLines = safeText.split('\n');
        
        let wordsHTML = '';
        let globalWordIdx = 0;
        
        textLines.forEach((lineText, lineIdx) => {
            if (lineIdx > 0) {
                wordsHTML += '<br />';
            }
            
            const words = lineText.split(' ').filter(w => w.length > 0);
            // If the lyric is very long (multiple lines), reduce butterfly chance to maintain 60 FPS
            const butterflyChance = safeText.length > 60 ? 0.15 : 0.3;
            
            words.forEach((word) => {
                const popDelay = 0.1 + globalWordIdx * 0.06; // Slightly faster pop to feel snappier
                let bFly = '';
                if (Math.random() < butterflyChance) { 
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
                globalWordIdx++;
            });
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
        let intensity = 0;
        if (isPlaying) {
            updateProgress(); // Replaces the old timeupdate event completely
            
            // Elegant Apple Music Visualizer
            if (analyser && dataArray) {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                // Calculate bass (average of lowest 10 frequencies)
                for (let i = 0; i < 10; i++) sum += dataArray[i];
                let bassAvg = sum / 10;
                intensity = bassAvg / 255;
                
                // Update global CSS variable for smooth, elegant reactivity
                document.documentElement.style.setProperty('--beat-intensity', intensity.toFixed(3));
                
                // Angelic Mode Particle Spawner
                if (isAngelicMode) {
                    if (intensity > 0.3) {
                        angelicParticleTimer--;
                        if (angelicParticleTimer <= 0) {
                            spawnAngelicParticle();
                            angelicParticleTimer = 10; // Increased cooldown to prevent frame drops
                        }
                    }
                    if (intensity > 0.8) {
                        spawnGiantButterfly();
                    }
                }
            } // end if analyser
        } // end if isPlaying
        
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
                        const targetOpacity = isPlaying ? Math.max(0.1, 0.8 - (Math.pow(intensity, 2) * 1.5)) : 0.0;
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

                    const _data = dataArray || new Uint8Array(256);
                    const bucketSize = Math.floor((_data.length * 0.75) / NUM_PILLARS);
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
                        for (let j = 0; j < bucketSize; j++) bucketSum += _data[i * bucketSize + j];
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

            // Keep the loop running to ensure canvas draws properly
            animationFrameId = requestAnimationFrame(syncLoop);
    }

    function playAudio() {
        initVisualizer(); // Init Web Audio API on user interaction
        audio.play().then(() => {
            isPlaying = true;
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
            coverArt.classList.add('playing');
            if (vinylRecord) vinylRecord.classList.add('playing');
            updateMiniPlayerUI();
            
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
        updateMiniPlayerUI();
        
        // Stop precision engine to save CPU
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
    }

    function togglePlay() {
        if (isPlaying) pauseAudio();
        else playAudio();
        updateMiniPlayerUI();
    }

    function prevTrack() {
        const source = getPlaybackSource();
        if (source.length === 0) return;
        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            return;
        }
        
        // Repeat 1 (repeatMode === 2): restart the song immediately
        if (repeatMode === 2) {
            audio.currentTime = 0;
            playAudio();
            return;
        }
        
        if (isShuffle) {
            let qIdx = shuffledQueue.indexOf(currentTrackIndex);
            if (qIdx <= 0) qIdx = shuffledQueue.length - 1;
            else qIdx--;
            currentTrackIndex = shuffledQueue[qIdx];
        } else {
            let index = currentTrackIndex - 1;
            if (index < 0) index = source.length - 1;
            currentTrackIndex = index;
        }
        
        loadTrack(currentTrackIndex);
        playAudio();
        updateMiniPlayerUI();
    }

    function nextTrack(isAutoNext = false) {
        const source = getPlaybackSource();
        if (source.length === 0) return;
        
        // Repeat 1 (repeatMode === 2): Loop current track (ignores shuffle setting)
        if (repeatMode === 2) {
            audio.currentTime = 0;
            playAudio();
            return;
        }
        
        if (isShuffle) {
            let qIdx = shuffledQueue.indexOf(currentTrackIndex);
            const sourceLengthMismatch = shuffledQueue.length !== source.length;
            
            if (qIdx === -1 || qIdx === shuffledQueue.length - 1 || sourceLengthMismatch) {
                // If it is auto-advance (song naturally finished) and repeatMode is 0 (no repeat), STOP
                if (isAutoNext && repeatMode === 0) {
                    pauseAudio();
                    return;
                }
                // Otherwise, reshuffle and start over, excluding current from the start to prevent immediate repeat
                generateShuffleQueue(true);
                qIdx = 0;
            } else {
                qIdx++;
            }
            currentTrackIndex = shuffledQueue[qIdx];
        } else {
            let index = currentTrackIndex + 1;
            if (index >= source.length) {
                if (repeatMode === 0) {
                    // Both shuffle and repeat are off: stop at end of list
                    pauseAudio();
                    return;
                }
                index = 0; // Wrap around for Repeat All
            }
            currentTrackIndex = index;
        }
        
        loadTrack(currentTrackIndex);
        playAudio();
        updateMiniPlayerUI();
    }
    
    function generateShuffleQueue(excludeCurrent = false) {
        shuffledQueue = [];
        const source = getPlaybackSource();
        for (let i = 0; i < source.length; i++) shuffledQueue.push(i);
        // Fisher-Yates
        for (let i = shuffledQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledQueue[i], shuffledQueue[j]] = [shuffledQueue[j], shuffledQueue[i]];
        }
        // Handle current track placement to avoid immediate repeat on loop/reshuffle
        if (currentTrackIndex !== -1 && source.length > 1) {
            const currentQIdx = shuffledQueue.indexOf(currentTrackIndex);
            if (currentQIdx !== -1) {
                shuffledQueue.splice(currentQIdx, 1);
                if (excludeCurrent) {
                    // Put the current track at the end so it plays last in the new queue
                    shuffledQueue.push(currentTrackIndex);
                } else {
                    // Put the current track at the beginning (e.g. when shuffle is first toggled on)
                    shuffledQueue.unshift(currentTrackIndex);
                }
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

                // Ensure coverBlob is a true Blob (not just a File ref that may be GC'd)
                let persistBlob = coverBlob;
                if (coverBlob instanceof File) {
                    const ab = await coverBlob.arrayBuffer();
                    persistBlob = new Blob([ab], { type: coverBlob.type });
                }
                
                // Create new song object WITH a stable ID from the start
                const newSong = {
                    id: 'song-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
                    title: title,
                    artist: artist,
                    url: audioUrl,
                    cover: coverUrl,
                    lyrics: lrcText,
                    drift: 1.0,
                    audioBlob: audioFile,
                    coverBlob: persistBlob
                };
                
                // Add to in-memory playlist immediately
                playlist.push(newSong);
                
                // Save to IndexedDB first, then re-render so grid reads fresh data
                await saveLibraryToDB();
                await renderSongGrid();
                
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
        // Song grid event delegation (optimizes memory and render speed)
        homeSongGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.song-card');

            const optionBtn = e.target.closest('.song-options-btn');

            if (optionBtn) {
                e.stopPropagation();
                const idx = optionBtn.getAttribute('data-index');
                const menu = document.getElementById(`context-menu-${idx}`);
                
                // Close other menus
                document.querySelectorAll('.context-menu.active').forEach(m => {
                    if (m !== menu) m.classList.remove('active');
                });
                
                if (menu) menu.classList.toggle('active');
                return;
            }

            // BUG 1 FIX: contextItem was never defined — remove dead block
            if (card) {
                if (card.classList.contains('vinyl-box-card')) return; // handled in setupBoxExpansionListeners
                
                const songId = card.getAttribute('data-id');
                // Always use full library as source when clicking a song outside a box
                activeQueue = [...playlist];
                const pIdx = playlist.findIndex(s => s.id === songId);
                if (pIdx !== -1) {
                    activePlaylistContext = 'library';
                    openPlayer(pIdx);
                }
            }
        });

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
        btnRepeat.addEventListener('click', () => {
            const currentTrack = getPlaybackSource()[currentTrackIndex];
            
            repeatMode = (repeatMode + 1) % 3;
            
            // Re-map currentTrackIndex to the new source list after repeatMode changes
            const newSource = getPlaybackSource();
            if (currentTrack) {
                const newIdx = newSource.findIndex(s => s.id === currentTrack.id);
                if (newIdx !== -1) currentTrackIndex = newIdx;
            }
            
            // Reshuffle queue if shuffle is active
            if (isShuffle) {
                generateShuffleQueue();
            }
            
            // Show premium feedback
            if (repeatMode === 0) showToast("Repeat: Off");
            else if (repeatMode === 1) showToast("Repeat: All");
            else if (repeatMode === 2) showToast("Repeat: One");
            
            syncPlayerControlsUI();
        });
        
        // Shuffle Button Logic
        const btnShuffle = document.getElementById('btn-shuffle');
        btnShuffle.addEventListener('click', () => {
            const currentTrack = getPlaybackSource()[currentTrackIndex];
            
            isShuffle = !isShuffle;
            
            // Re-map currentTrackIndex to the new source list after isShuffle changes
            const newSource = getPlaybackSource();
            if (currentTrack) {
                const newIdx = newSource.findIndex(s => s.id === currentTrack.id);
                if (newIdx !== -1) currentTrackIndex = newIdx;
            }
            
            if (isShuffle) {
                generateShuffleQueue();
                if (repeatMode === 0) {
                    showToast("Shuffle: On (Playing Library)");
                } else {
                    showToast("Shuffle: On (Playing Playlist)");
                }
            } else {
                showToast("Shuffle: Off");
            }
            
            syncPlayerControlsUI();
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
            const val = e.target.value / 100;
            audio.volume = val;
            isMuted = (val === 0);
            updateVolumeIcon(val);
        });
        
        if (btnMute) {
            btnMute.addEventListener('click', () => {
                isMuted = !isMuted;
                if (isMuted) {
                    lastVolume = audio.volume > 0 ? audio.volume : 0.8;
                    audio.volume = 0;
                    volumeSlider.value = 0;
                    updateVolumeIcon(0);
                } else {
                    audio.volume = lastVolume;
                    volumeSlider.value = lastVolume * 100;
                    updateVolumeIcon(lastVolume);
                }
            });
        }
        
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
            const source = getPlaybackSource();
            if (source[currentTrackIndex]) {
                source[currentTrackIndex].drift = driftRatio;
                // Sync back to main playlist
                const trackId = source[currentTrackIndex].id;
                const plTrack = playlist.find(s => s.id === trackId);
                if (plTrack) plTrack.drift = driftRatio;
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

                // BUG 19 FIX: wrap case bodies in {} to avoid const in switch scope error
                case 'ArrowLeft': {
                    e.preventDefault();
                    const newTimeL = Math.max(0, audio.currentTime - 5);
                    prepareLyricNearTime(newTimeL);
                    audio.currentTime = newTimeL;
                    if (!isPlaying) updateProgress();
                    break;
                }
                case 'ArrowRight': {
                    e.preventDefault();
                    const newTimeR = Math.min(audio.duration || 0, audio.currentTime + 5);
                    prepareLyricNearTime(newTimeR);
                    audio.currentTime = newTimeR;
                    if (!isPlaying) updateProgress();
                    break;
                }

                // ── Arrow Up / Down: Volume ±5% ──────────────
                case 'ArrowUp': {
                    e.preventDefault();
                    const newVolUp = Math.min(1, audio.volume + 0.05);
                    audio.volume = newVolUp;
                    volumeSlider.value = newVolUp * 100;
                    isMuted = (newVolUp === 0);
                    updateVolumeIcon(newVolUp);
                    break;
                }
                case 'ArrowDown': {
                    e.preventDefault();
                    const newVolDown = Math.max(0, audio.volume - 0.05);
                    audio.volume = newVolDown;
                    volumeSlider.value = newVolDown * 100;
                    isMuted = (newVolDown === 0);
                    updateVolumeIcon(newVolDown);
                    break;
                }
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
    
    // Start the engine immediately for idle rendering (e.g. paused cinematic mode)
    requestAnimationFrame(syncLoop);

    // --- EQ Modal Logic ---
    const btnEq = document.getElementById('btn-eq');
    const eqModal = document.getElementById('eq-modal');
    const btnCloseEq = document.getElementById('btn-close-eq');
    const eqSliders = document.querySelectorAll('.eq-slider');
    const eqPresets = document.getElementById('eq-presets');
    const eqVals = document.querySelectorAll('.eq-val');
    
    if (btnEq && eqModal && btnCloseEq) {
        btnEq.addEventListener('click', () => {
            eqModal.classList.remove('hidden');
        });
        
        btnCloseEq.addEventListener('click', () => {
            eqModal.classList.add('hidden');
        });
        
        eqModal.addEventListener('click', (e) => {
            if (e.target === eqModal) {
                eqModal.classList.add('hidden');
            }
        });
    }
    
    const PRESETS = {
        default: [0, 0, 0, 0, 0],
        hiphop: [5, 3, 0, 2, 4],
        pop: [-2, 1, 4, 3, -1],
        classical: [0, 0, 0, 0, 0],
        bassboost: [8, 5, 0, 0, 0],
        electronic: [4, -1, -2, 3, 5],
        acoustic: [-2, -1, 3, 4, 2]
    };
    
    if (eqPresets) {
        eqPresets.addEventListener('change', (e) => {
            const preset = PRESETS[e.target.value] || PRESETS.default;
            eqSliders.forEach((slider, i) => {
                slider.value = preset[i];
                if (eqNodes[i]) eqNodes[i].gain.value = preset[i];
                eqVals[i].textContent = (preset[i] > 0 ? '+' : '') + preset[i] + 'dB';
            });
        });
    }
    
    eqSliders.forEach((slider, i) => {
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (eqNodes[i]) eqNodes[i].gain.value = val;
            eqVals[i].textContent = (val > 0 ? '+' : '') + val + 'dB';
            
            // Custom change means it's no longer a predefined preset
            if (eqPresets) eqPresets.value = 'default';
        });
    });

    // --- Screen Recording UI Logic ---
    const btnRecord = document.getElementById('btn-record');
    const recordPopover = document.getElementById('record-popover');
    const recordingSetupModal = document.getElementById('recording-setup-modal');
    const btnCancelRecording = document.getElementById('btn-cancel-recording');
    const btnConfirmRecording = document.getElementById('btn-confirm-recording');
    
    // Extensible list of recording modes
    const recordingModes = [
        { id: 'normal', label: 'Normal Player', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>' },
        { id: 'cinematic', label: 'Cinematic Mode', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>' },
        { id: 'angelic', label: 'Angelic Mode', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' }
    ];
    
    let selectedRecordingMode = null;
    
    if (btnRecord && recordPopover) {
        // Render dynamic options
        recordPopover.innerHTML = recordingModes.map(mode => `
            <button class="record-option-item" data-mode="${mode.id}">
                ${mode.icon}
                <span>${mode.label}</span>
            </button>
        `).join('');
        
        btnRecord.addEventListener('click', (e) => {
            e.stopPropagation();
            recordPopover.classList.toggle('hidden');
            requestAnimationFrame(() => {
                recordPopover.classList.toggle('active');
            });
        });
        
        document.addEventListener('click', (e) => {
            if (!recordPopover.classList.contains('hidden') && !e.target.closest('.record-container')) {
                recordPopover.classList.remove('active');
                setTimeout(() => recordPopover.classList.add('hidden'), 200);
            }
        });
        
        recordPopover.addEventListener('click', (e) => {
            const btn = e.target.closest('.record-option-item');
            if (btn) {
                selectedRecordingMode = btn.getAttribute('data-mode');
                recordPopover.classList.remove('active');
                recordPopover.classList.add('hidden');
                
                if (recordingSetupModal) {
                    recordingSetupModal.classList.remove('hidden');
                }
            }
        });
    }
    
    if (btnCancelRecording && recordingSetupModal) {
        btnCancelRecording.addEventListener('click', () => {
            recordingSetupModal.classList.add('hidden');
        });
    }
    
    if (btnConfirmRecording && recordingSetupModal) {
        btnConfirmRecording.addEventListener('click', () => {
            recordingSetupModal.classList.add('hidden');
            if (selectedRecordingMode) {
                const event = new CustomEvent('startRecording', { detail: { mode: selectedRecordingMode } });
                document.dispatchEvent(event);
            }
        });
    }

    document.addEventListener('startRecording', (e) => {
        const mode = e.detail?.mode || 'normal';
        startScreenRecording(mode, {
            playAudio,
            pauseAudio,
            showToast,
            getCurrentTrack: () => playlist[currentTrackIndex] || null
        });
    });

    // --- Box Expansion and Modal Logic ---
    function setupBoxExpansionListeners(vinylBoxes) {
        const boxCards = homeSongGrid.querySelectorAll('.vinyl-box-card');
        boxCards.forEach(card => {
            card.addEventListener('click', (e) => {
                if (card.classList.contains('expanded-active')) return;

                const boxId = card.getAttribute('data-box-id');
                toggleBoxExpansion(card, boxId, vinylBoxes);
            });
        });
    }

    let activeExpandedCard = null;

    function toggleBoxExpansion(card, boxId, vinylBoxes) {
        if (activeExpandedCard === card) {
            closeBoxExpansion();
            return;
        }

        closeBoxExpansion();

        const box = vinylBoxes.find(b => b.id === boxId);
        if (!box) return;

        card.setAttribute('data-original-html', card.innerHTML);
        card.classList.add('expanded-active');
        activeExpandedCard = card;

        const boxSongs = (box.songIds || []).map(id => playlist.find(s => s.id === id)).filter(Boolean);

        let songsHTML = '';
        if (boxSongs.length === 0) {
            songsHTML = `<div style="padding: 20px; color: var(--text-secondary); font-size: 0.9rem; text-align: center; width: 100%;">This box is empty. Go to Edit Library to add tracks.</div>`;
        } else {
            boxSongs.forEach((song, idx) => {
                songsHTML += `
                    <div class="song-card box-slider-song-card" data-idx="${idx}" style="cursor: pointer;">
                        <div class="song-cover-wrapper" style="width: 100%; position: relative; aspect-ratio: 1/1; border-radius: 8px; overflow: hidden; margin-bottom: 10px;">
                            <img src="${song.cover || 'assets/images/cover.png'}" alt="${song.title}" style="width: 100%; height: 100%; object-fit: cover;">
                        </div>
                        <div class="song-card-title">${song.title}</div>
                        <div class="song-card-artist">${song.artist}</div>
                    </div>
                `;
            });
        }

        // Updated expanded view with a subtle scrollbar wrapper
        card.innerHTML = `
            <div class="box-expansion-content" style="width: 100%; animation: fadeIn 0.3s ease;">
                <div class="box-expansion-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <div>
                        <h2 style="margin: 0; font-size: 1.5rem; font-weight: 600;">${box.name}</h2>
                        <span style="color: var(--text-secondary); font-size: 0.9rem;">${boxSongs.length} Tracks</span>
                    </div>
                    <div class="box-expansion-controls" style="display: flex; gap: 10px;">
                        <button class="btn-play-box glass-icon-btn primary" title="Play Box">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                <path d="M8 5v14l11-7z"></path>
                            </svg>
                        </button>
                        <button class="btn-close-box glass-icon-btn danger" title="Close"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                    </div>
                </div>
                <div class="box-expansion-slider-wrapper" style="overflow-x: auto; overflow-y: hidden; padding-bottom: 10px;">
                    <div class="box-expansion-slider" style="display: flex; gap: 20px; min-width: min-content;">
                        ${songsHTML}
                    </div>
                </div>
            </div>
        `;

        // Event Listeners for the expanded view
        const closeBtn = card.querySelector('.btn-close-box');
        if (closeBtn) closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeBoxExpansion();
        });

        const playBtn = card.querySelector('.btn-play-box');
        if (playBtn) playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (boxSongs.length > 0) {
                activeQueue = [...boxSongs];
                activePlaylistContext = box.id;
                
                // Auto-enable Shuffle + Repeat All when playing a playlist (Spotify behavior)
                isShuffle = true;
                repeatMode = 1; // Repeat All
                generateShuffleQueue(false);
                syncPlayerControlsUI();
                
                openPlayer(0);
            }
        });

        // Clicking a song inside the expanded box
        const sliderSongs = card.querySelectorAll('.box-slider-song-card');
        sliderSongs.forEach(songCard => {
            songCard.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(songCard.getAttribute('data-idx'));
                activeQueue = [...boxSongs];
                activePlaylistContext = box.id;
                openPlayer(idx);
            });
        });
    }

    function closeBoxExpansion() {
        if (activeExpandedCard) {
            activeExpandedCard.classList.remove('expanded-active');
            // Restore original HTML
            const originalHTML = activeExpandedCard.getAttribute('data-original-html');
            if (originalHTML) {
                activeExpandedCard.innerHTML = originalHTML;
            }
            activeExpandedCard = null;
        }
    }

    // Modal to add songs to a box
    let currentBoxIdForAdd = null;
    let currentVinylBoxesArray = null;
    
    function openAddSongsModal(box, vinylBoxesArray) {
        currentBoxIdForAdd = box.id;
        currentVinylBoxesArray = vinylBoxesArray;
        const modal = document.getElementById('add-songs-to-box-modal');
        const list = document.getElementById('add-songs-list');
        list.innerHTML = '';

        const boxSongIds = new Set(box.songIds || []);
        const availableSongs = playlist.filter(song => !boxSongIds.has(song.id));

        if (availableSongs.length === 0) {
            list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No other songs available to add.</div>';
        } else {
            availableSongs.forEach(song => {
                const item = document.createElement('div');
                item.className = 'add-song-item';
                item.innerHTML = `
                    <img src="${song.cover || 'assets/images/cover.png'}" alt="Cover">
                    <div class="add-song-info">
                        <div class="title">${song.title}</div>
                        <div class="artist">${song.artist}</div>
                    </div>
                    <button class="add-song-quick-btn glass-icon-btn primary" title="Add to Box">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                `;
                list.appendChild(item);
                
                // Click to add immediately
                item.addEventListener('click', () => {
                    if (!currentBoxIdForAdd || !currentVinylBoxesArray) return;
                    const b = currentVinylBoxesArray.find(b => b.id === currentBoxIdForAdd);
                    if (b) {
                        if (!b.songIds) b.songIds = [];
                        b.songIds.push(song.id);
                        
                        // Update in-memory cache so home grid is correct without re-reading DB
                        cachedVinylBoxes = currentVinylBoxesArray;
                        
                        // Save to DB then refresh both grids
                        localforage.setItem('vinyl_boxes', currentVinylBoxesArray).then(() => {
                            renderSongGrid();
                            // Immediately sync edit-library's localVinylBoxes + re-render edit grid
                            if (window.appEditLibraryContext && window.appEditLibraryContext.syncBoxes) {
                                window.appEditLibraryContext.syncBoxes([...currentVinylBoxesArray]);
                            }
                        });
                    }
                    
                    // Visually remove from the modal
                    item.remove();
                    if (list.children.length === 0) {
                        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No other songs available to add.</div>';
                    }
                });
            });
        }
        
        modal.classList.remove('hidden');
    }

    // Modal Cancel for adding songs
    document.getElementById('btn-cancel-add-songs').addEventListener('click', () => {
        document.getElementById('add-songs-to-box-modal').classList.add('hidden');
        currentBoxIdForAdd = null;
        currentVinylBoxesArray = null;
    });

    // Expose helpers for edit mode
    function showEditModalBySongId(songId) {
        const index = playlist.findIndex(s => s.id === songId);
        if (index !== -1) showEditModal(index);
    }
    
    function showDeleteModalBySongId(songId) {
        const index = playlist.findIndex(s => s.id === songId);
        if (index !== -1) showDeleteModal(index);
    }

    // Expose methods to other modules
    window.appMainContext = {
        renderSongGrid: renderSongGrid,
        openAddSongsModal: openAddSongsModal,
        showEditModalBySongId: showEditModalBySongId,
        showDeleteModalBySongId: showDeleteModalBySongId,
        getPlaylist: () => playlist,
        // Called by edit-library after any box/order mutation to keep home grid cache in sync
        updateBoxCache: (boxes, order) => {
            if (boxes !== undefined) cachedVinylBoxes = boxes;
            if (order !== undefined) cachedLibraryOrder = order;
        },
        openPlaylistNameModal: (box, boxes, cb) => {
            document.dispatchEvent(new CustomEvent('wavr:openEditBox', { detail: { boxId: box.id, cb } }));
        }
    };
