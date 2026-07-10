// Centralized state management
export const state = {
    playlist: [],
    currentTrackIndex: 0,
    isPlaying: false,
    isShuffle: false,
    repeatMode: 0, // 0: None, 1: All, 2: One
    shuffledQueue: [],
    currentLyrics: [],
    activeLyricIndex: -1,
    isDraggingSlider: false,
    animationFrameId: null,
    driftRatio: 1.0,
    isCinematicMode: false,
    isAngelicMode: false,
    angelicParticleTimer: 0,

    // Web Audio API Variables
    audioCtx: null,
    analyser: null,
    dataArray: null,

    // Visualizer State
    NUM_PILLARS: 4,
    smoothedBars: new Float32Array(4),
    peaks: new Float32Array(4),
    peakVelocities: new Float32Array(4),

    // Spotlight Colors
    CONCERT_COLORS: [
        [255, 30,  60 ],  // Red
        [30,  100, 255],  // Blue
        [180, 30,  255],  // Purple
        [0,   230, 255],  // Cyan
        [30,  255, 120],  // Green
        [255, 180, 0  ],  // Amber
        [255, 80,  0  ],  // Orange
        [255, 255, 255],  // White
    ],

    spotlights: [
        { baseAngle: Math.PI * 0.38, sweepRange: 0.18, sweepSpeed: 0.45, phase: 0,
          colorIdx: 0, nextColorIdx: 2, colorT: 0, colorChangeDur: 2.5,
          blink: 1.0, blinkTimer: 2.0, blinkDur: 0, isOff: false },
        { baseAngle: Math.PI * 0.62, sweepRange: 0.20, sweepSpeed: 0.33, phase: Math.PI * 0.6,
          colorIdx: 3, nextColorIdx: 5, colorT: 0, colorChangeDur: 3.0,
          blink: 1.0, blinkTimer: 3.5, blinkDur: 0, isOff: false },
    ],

    // Smoke particles
    smokeParticles: [],
    MAX_SMOKE: 50,
    smokeSpawnTimer: 0,
    lastCineTime: 0,
    fireBurstTime: 0,
    isFireBursting: false,
    fireGifBlob: null,
    fireGifBlobUrl: 'assets/images/fire.gif'
};
