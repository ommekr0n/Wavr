/**
 * VisualFX.js — Central hub for all reactive visual effects
 * ===========================================================
 * Implements (zero-lag, performance-optimized):
 *   1. Lyric Breathing  — chữ scale theo sub-bass với lerp mượt
 *   2. Ink Wash Exit    — sumi-e dissolve dùng SVG feTurbulence khi lyric thoát
 *   3. Parallax Depth   — staff SVG dịch chuyển ngược chiều chuột (mousemove)
 *   4. Syllable Pop     — split syllable với delay nhỏ hơn word-by-word
 *   5. Beat Zoom Pulse  — cinematic text container scale theo bass onset
 *   6. Chromatic Aberration — RGB shift trên cinematic text lúc enter
 *   7. Vignette Pulse   — overlay tối rìa màn hình theo energy
 *   8. Reactive Particles — spawn nhiều/ít theo energy level
 *
 * Design constraints:
 *   - Không dùng layout-triggering properties (offsetWidth, getBoundingClientRect) trong rAF
 *   - Dùng CSS Custom Properties làm "bridge" tuyệt đối giữa JS và CSS
 *   - Mỗi effect có guard/throttle riêng để không ăn CPU khi mode không active
 */

// ── State ─────────────────────────────────────────────────────────────────────
let _breathScale     = 1.0;   // Smoothed breath scale (lerp target)
let _vignetteOpacity = 0.0;   // Smoothed vignette opacity
let _mouseX          = 0;     // Normalised mouse X (-1 to 1)
let _mouseY          = 0;     // Normalised mouse Y (-1 to 1)
let _parallaxAttached = false;
let _vignetteEl      = null;
let _cinTextContainer = null;
let _zoomCooldown    = 0;     // Frames remaining before next zoom allowed
let _chromaTimeout   = null;

// ── 1. Lyric Breathing ────────────────────────────────────────────────────────
/**
 * Gọi mỗi frame trong syncLoop khi Angelic Mode active.
 * Lerp scale chữ theo sub-bass intensity để không bị jerky.
 * @param {number} intensity - 0..1 sub-bass intensity từ FFTAnalyzer
 * @param {HTMLElement} angelicTextContainer
 */
export function updateLyricBreath(intensity, angelicTextContainer) {
    if (!angelicTextContainer) return;

    // Target scale: rất nhỏ (1.0 → 1.025 max) để không bị choking khi nhạc mạnh
    const targetScale = 1.0 + Math.min(intensity * 0.04, 0.025);

    // Lerp mượt: attack nhanh (0.15), decay chậm (0.06) — giống cơ hoành thở
    const lerpRate = targetScale > _breathScale ? 0.15 : 0.06;
    _breathScale += (_breathScale < targetScale ? 1 : -1) * lerpRate * Math.abs(targetScale - _breathScale);

    // Dùng CSS var thay vì style trực tiếp — tránh layout thrash
    angelicTextContainer.style.setProperty('--breath-scale', _breathScale.toFixed(4));
}

// ── 2. Ink Wash Exit (Sumi-e) ─────────────────────────────────────────────────
/**
 * Thêm class .ink-wash-exit vào wrapper thay vì .angelic-exit bình thường.
 * CSS sẽ apply SVG turbulence filter cho hiệu ứng mực tan trong nước.
 * @param {HTMLElement} wrapper - .angelic-line-wrapper đang thoát
 */
export function applyInkWashExit(wrapper) {
    if (!wrapper) return;
    wrapper.classList.add('ink-wash-exit');
    const rot = (Math.random() - 0.5) * 2;
    wrapper.style.setProperty('--exit-rot', `${rot}deg`);
    setTimeout(() => { if (wrapper.parentNode) wrapper.remove(); }, 330);
}

// ── 3. Parallax Depth (Removed as requested) ──────────────────────────────────
export function attachParallax() {}
export function updateParallax() {}

let _cinePulsePhase  = 0;
let _lastPulseTime   = performance.now();
let _currentFreq     = 1.2;  // Smoothed current frequency (lerped, not jumped)
let _jitterX         = 0;    // Current smoothed jitter X (px)
let _jitterY         = 0;    // Current smoothed jitter Y (px)
let _jitterTargetX   = 0;    // Random target X
let _jitterTargetY   = 0;    // Random target Y
let _jitterFrame     = 0;    // Frame counter for target refresh

// ── 5. Periodic Frequency-Modulated Pulse Engine (Cinematic Mode Only) ──────
/**
 * Continuous periodic pulse whose speed is modulated by music intensity.
 *
 * Algorithm:
 *   - Phase angle advances every frame based on currentFreq (Hz).
 *   - Calm music (strength ~0):   ~0.8 Hz  → slow, gentle breathing rhythm
 *   - Intense music (strength ~1): ~3.0 Hz  → rapid, energetic heartbeat
 *   - Wave is raised to power 3.5 → sharp clear peak, long flat rest between pulses
 *   - Amplitude is small (2–4%) so text grows noticeably but not bouncily.
 *
 * @param {number}  intensity - Sub-bass intensity (0..1)
 * @param {number}  energy    - Overall audio energy (0..1)
 * @param {HTMLElement} cinematicTextContainer
 */
export function updateCinematicLyricBeat(intensity, energy, cinematicTextContainer) {
    if (!cinematicTextContainer) return;

    const now = performance.now();
    const dt  = Math.min((now - _lastPulseTime) / 1000, 0.05);
    _lastPulseTime = now;

    const combinedStrength = Math.min(1.0, intensity * 0.7 + energy * 0.3);

    // Frequency: 1.0 Hz calm → 3.5 Hz intense
    // Lerp frequency so it glides smoothly instead of jumping every frame
    const targetFreq  = 1.0 + (3.5 - 1.0) * Math.pow(combinedStrength, 0.8);
    const freqLerp    = combinedStrength > _currentFreq / 3.5 ? 0.04 : 0.015; // faster attack, slow release
    _currentFreq     += (targetFreq - _currentFreq) * freqLerp;

    _cinePulsePhase += Math.PI * 2 * _currentFreq * dt;
    if (_cinePulsePhase > Math.PI * 2) _cinePulsePhase %= Math.PI * 2;

    // Power-2 wave via multiplication (faster than Math.pow)
    const rawWave    = 0.5 * (1.0 - Math.cos(_cinePulsePhase));
    const shapedWave = rawWave * rawWave;

    // Amplitude: 0.8% quiet → 1.5% intense (very subtle)
    const amplitude  = 0.008 + combinedStrength * 0.007;
    const pulseScale = 1.0 + shapedWave * amplitude;

    // ── Jitter / Tremor ───────────────────────────────────────────────────────
    _jitterFrame++;
    if (_jitterFrame >= 3) {
        _jitterFrame = 0;
        const maxJitter = 0.2 + combinedStrength * 0.6; // 0.2px quiet → 0.8px intense
        _jitterTargetX = (Math.random() - 0.5) * 2 * maxJitter;
        _jitterTargetY = (Math.random() - 0.5) * 2 * maxJitter;
    }
    _jitterX += (_jitterTargetX - _jitterX) * 0.35;
    _jitterY += (_jitterTargetY - _jitterY) * 0.35;

    // Round to 2 decimal places via integer math (avoids toFixed string alloc per frame)
    const jx = (Math.round(_jitterX * 100) / 100);
    const jy = (Math.round(_jitterY * 100) / 100);
    const ps = (Math.round(pulseScale * 10000) / 10000);

    cinematicTextContainer.style.setProperty('--cine-beat-scale', ps);
    cinematicTextContainer.style.setProperty('--cine-jitter-x', jx + 'px');
    cinematicTextContainer.style.setProperty('--cine-jitter-y', jy + 'px');
}

export function triggerBeatZoom(cinematicTextContainer, intensity) {
    if (!cinematicTextContainer) return;
    updateCinematicLyricBeat(intensity, intensity, cinematicTextContainer);
}

export function tickZoomCooldown() {
    if (_zoomCooldown > 0) _zoomCooldown--;
}

// ── 6. Chromatic Aberration ───────────────────────────────────────────────────
/**
 * Bật class .chroma-enter trên wrapper mới trong Cinematic Mode.
 * CSS sẽ animate ::before/::after RGB shift trong 200ms rồi tự fade.
 * @param {HTMLElement} wrapper - .cinematic-line-wrapper mới
 */
export function applyChromaAberration(wrapper) {
    if (!wrapper) return;
    wrapper.classList.add('chroma-enter');
    // Tự cleanup sau animation xong
    if (_chromaTimeout) clearTimeout(_chromaTimeout);
    _chromaTimeout = setTimeout(() => {
        wrapper.classList.remove('chroma-enter');
    }, 350);
}

// ── 7. Vignette Pulse ─────────────────────────────────────────────────────────
/**
 * Tạo vignette overlay element và gắn vào view.
 * @param {HTMLElement} parentEl - #cinematic-view hoặc #angelic-view
 */
export function createVignetteOverlay(parentEl) {
    if (!parentEl || parentEl.querySelector('.vignette-overlay')) return;
    _vignetteEl = document.createElement('div');
    _vignetteEl.className = 'vignette-overlay';
    // z-index cao hơn canvas, thấp hơn text
    _vignetteEl.style.cssText = `
        position:absolute; inset:0; pointer-events:none; z-index:8;
        background: radial-gradient(ellipse at center,
            transparent 40%,
            rgba(0,0,0,var(--vignette-opacity,0.0)) 100%);
        will-change: --vignette-opacity;
    `;
    parentEl.appendChild(_vignetteEl);
}

/**
 * Gọi mỗi frame để lerp vignette opacity theo energy.
 * @param {number} energy - 0..1 từ FFTAnalyzer
 */
export function updateVignette(energy) {
    if (!_vignetteEl) return;
    // Nghịch đảo: energy thấp → vignette tối (cảm giác verse thâm trầm), energy cao → vignette sáng
    const target = Math.max(0, 0.6 - energy * 0.7);
    _vignetteOpacity += (_vignetteOpacity < target ? 0.04 : 0.025) * Math.abs(target - _vignetteOpacity) / (Math.abs(target - _vignetteOpacity) + 0.001);
    // Dùng CSS var — custom property animation không trigger layout
    _vignetteEl.style.setProperty('--vignette-opacity', _vignetteOpacity.toFixed(3));
}

export function removeVignetteOverlay() {
    if (_vignetteEl && _vignetteEl.parentNode) _vignetteEl.remove();
    _vignetteEl = null;
    _vignetteOpacity = 0;
}

// ── 8. Reactive Particles Intensity ──────────────────────────────────────────
/**
 * Tính timer kế tiếp cho particle spawn dựa trên energy.
 * Energy cao → spawn nhanh, energy thấp → spawn chậm.
 * @param {number} energy    - 0..1 overall energy
 * @param {number} intensity - 0..1 sub-bass intensity
 * @returns {number} số frame đến lần spawn tiếp theo
 */
export function getReactiveParticleTimer(energy, intensity) {
    if (intensity > 0.6)  return 2;   // Drop: rất nhanh
    if (intensity > 0.35) return 4;   // Chorus: nhanh
    if (energy > 0.3)     return 6;   // Build-up
    if (intensity > 0.15) return 8;   // Verse
    return 14;                        // Intro/outro: chậm
}

// ── 4. Syllable Split Utility ─────────────────────────────────────────────────
/**
 * Tách từ thành âm tiết đơn giản bằng heuristic tiếng Anh/Việt.
 * Không dùng lib nặng — chỉ pattern matching đủ dùng.
 * @param {string} word
 * @returns {string[]} mảng âm tiết
 */
export function splitSyllables(word) {
    if (!word || word.length <= 3) return [word];

    // Vowel clusters: mỗi cụm nguyên âm là 1 âm tiết (heuristic đơn giản)
    const VOWELS = /[aeiouáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/i;
    const syllables = [];
    let current = '';
    let inVowel = false;

    for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        const isVow = VOWELS.test(ch);

        if (isVow !== inVowel && current.length > 2) {
            // Chuyển từ consonant→vowel hoặc vowel→consonant: cắt âm tiết
            if (!isVow && current.length > 0) {
                current += ch;
                syllables.push(current);
                current = '';
                inVowel = false;
                continue;
            }
        }
        current += ch;
        inVowel = isVow;
    }
    if (current) syllables.push(current);

    // Nếu split ra chỉ 1 âm tiết (từ ngắn) thì giữ nguyên
    return syllables.length > 1 ? syllables : [word];
}
