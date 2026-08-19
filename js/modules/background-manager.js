/**
 * Wavr - Custom Background Wallpaper & Glass Frost Controller
 * Full Cloud Sync via Supabase & Cloudflare R2 + Instant Local Cache
 */

import { SupabaseService } from '../services/SupabaseService.js';

let currentImage = null; // Holds the HTMLImageElement being cropped
let cropScale = 1;
let imgX = 0;
let imgY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

const CROP_WIDTH = 640;
const CROP_HEIGHT = 360; // 16:9 Aspect Ratio

const DB_NAME = 'wavr_background_db';
const STORE_NAME = 'settings';

function openBackgroundDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getStoredBackground() {
    try {
        const db = await openBackgroundDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get('wavr_custom_bg');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        console.warn('Failed to read background from IndexedDB:', e);
        return null;
    }
}

async function setStoredBackground(blob) {
    try {
        const db = await openBackgroundDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(blob, 'wavr_custom_bg');
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.error('Failed to save background to IndexedDB:', e);
        throw e;
    }
}

async function removeStoredBackground() {
    try {
        const db = await openBackgroundDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete('wavr_custom_bg');
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
        });
    } catch (e) {
        console.error('Failed to remove background from IndexedDB:', e);
    }
}

function showNotification(message) {
    if (window.appMainContext && typeof window.appMainContext.showToast === 'function') {
        window.appMainContext.showToast(message);
    } else {
        let toast = document.getElementById('wavr-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'wavr-toast';
            toast.className = 'wavr-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2200);
    }
}

// Draw crop preview on canvas
function drawCropPreview(canvas, ctx) {
    if (!currentImage) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image with current offset and scale
    const drawW = currentImage.width * cropScale;
    const drawH = currentImage.height * cropScale;
    
    ctx.drawImage(currentImage, imgX, imgY, drawW, drawH);

    // Draw a subtle golden grid to guide the user
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    
    // Vertical gridlines
    ctx.beginPath();
    ctx.moveTo(canvas.width / 3, 0);
    ctx.lineTo(canvas.width / 3, canvas.height);
    ctx.moveTo((canvas.width * 2) / 3, 0);
    ctx.lineTo((canvas.width * 2) / 3, canvas.height);
    
    // Horizontal gridlines
    ctx.moveTo(0, canvas.height / 3);
    ctx.lineTo(canvas.width, canvas.height / 3);
    ctx.moveTo(0, (canvas.height * 2) / 3);
    ctx.lineTo(canvas.width, (canvas.height * 2) / 3);
    ctx.stroke();

    // Outline viewport border
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
}

// Convert image to Blob and save to Cloudflare R2 / Supabase + Local Cache
async function saveAndApplyBackground(blob) {
    try {
        // 1. Instant local display & cache
        await setStoredBackground(blob);
        applyBackgroundImage(blob);

        // 2. Upload to Cloudflare R2 / Supabase if user is logged into Cloud Vault
        if (SupabaseService.isConfigured()) {
            const user = await SupabaseService.getCurrentUser();
            if (user) {
                try {
                    const cloudPath = `wallpapers/${Date.now()}.webp`;
                    const cloudUrl = await SupabaseService.uploadMediaFile(blob, cloudPath);
                    await SupabaseService.updateUserPreferences({ wallpaper_url: cloudUrl });
                    showNotification("Wallpaper synced to Cloud Vault & R2!");
                    return;
                } catch (cloudErr) {
                    console.warn("Cloud wallpaper upload failed, fallback to local:", cloudErr);
                }
            }
        }

        showNotification("Wallpaper updated successfully!");
    } catch (e) {
        console.error("Failed to save custom background", e);
        showNotification("Failed to save wallpaper.");
    }
}

// Set background image on target layers (supports Blob or direct URL string)
function applyBackgroundImage(source) {
    const bgLayer = document.getElementById('app-custom-bg-layer');
    if (!bgLayer) return;

    if (source) {
        let url = '';
        if (typeof source === 'string') {
            url = source;
        } else if (source instanceof Blob) {
            url = URL.createObjectURL(source);
            // Clean up old object URLs if any
            if (bgLayer.dataset.bgUrl && bgLayer.dataset.bgUrl.startsWith('blob:')) {
                URL.revokeObjectURL(bgLayer.dataset.bgUrl);
            }
            bgLayer.dataset.bgUrl = url;
        }

        bgLayer.style.backgroundImage = `url('${url}')`;
        bgLayer.classList.add('active');
    } else {
        if (bgLayer.dataset.bgUrl && bgLayer.dataset.bgUrl.startsWith('blob:')) {
            URL.revokeObjectURL(bgLayer.dataset.bgUrl);
            delete bgLayer.dataset.bgUrl;
        }
        bgLayer.style.backgroundImage = '';
        bgLayer.classList.remove('active');
    }
}

export const BackgroundManager = {
    async init() {
        // 1. Load saved blur, opacity & grid state
        let savedBlur = localStorage.getItem('wavr_bg_blur');
        if (savedBlur === null) savedBlur = '16';
        let savedOpacity = localStorage.getItem('wavr_bg_opacity');
        if (savedOpacity === null) savedOpacity = '35';
        let savedCheckerboard = localStorage.getItem('wavr_checkerboard_enabled');
        if (savedCheckerboard === null) savedCheckerboard = 'true';

        document.documentElement.style.setProperty('--bg-glass-blur', `${savedBlur}px`);
        document.documentElement.style.setProperty('--bg-overlay-opacity', `${savedOpacity / 100}`);

        // Set slider values
        const rangeBlur = document.getElementById('range-bg-blur');
        const valBlur = document.getElementById('val-bg-blur');
        if (rangeBlur) {
            rangeBlur.value = savedBlur;
            if (valBlur) valBlur.textContent = `${savedBlur}px`;
        }

        const rangeOpacity = document.getElementById('range-bg-opacity');
        const valOpacity = document.getElementById('val-bg-opacity');
        if (rangeOpacity) {
            rangeOpacity.value = savedOpacity;
            if (valOpacity) valOpacity.textContent = `${savedOpacity}%`;
        }

        // Initialize Checkerboard Background state
        const btnToggleCheckerboard = document.getElementById('btn-toggle-checkerboard');
        const textToggleCheckerboard = document.getElementById('text-toggle-checkerboard');

        const applyCheckerboardState = (enabled) => {
            if (enabled) {
                document.body.classList.remove('hide-checkerboard');
            } else {
                document.body.classList.add('hide-checkerboard');
            }
            if (textToggleCheckerboard) {
                textToggleCheckerboard.textContent = enabled ? 'Hide Checkerboard' : 'Show Checkerboard';
            }
            if (btnToggleCheckerboard) {
                if (enabled) {
                    btnToggleCheckerboard.classList.remove('neutral');
                    btnToggleCheckerboard.classList.add('primary');
                } else {
                    btnToggleCheckerboard.classList.remove('primary');
                    btnToggleCheckerboard.classList.add('neutral');
                }
            }
            localStorage.setItem('wavr_checkerboard_enabled', enabled ? 'true' : 'false');
        };

        applyCheckerboardState(savedCheckerboard === 'true');

        if (btnToggleCheckerboard) {
            btnToggleCheckerboard.addEventListener('click', () => {
                const isCurrentlyEnabled = !document.body.classList.contains('hide-checkerboard');
                applyCheckerboardState(!isCurrentlyEnabled);
            });
        }

        // 2. Load wallpaper: Prioritize Cloud Vault URL if logged in, fallback to local cache
        await this.syncWallpaperFromCloudOrLocal();

        // Listen to Auth state changes to auto-sync cloud wallpaper on login
        if (SupabaseService.isConfigured()) {
            SupabaseService.onAuthStateChange(async () => {
                await this.syncWallpaperFromCloudOrLocal();
            });
        }

        // 3. Bind range slider input events
        if (rangeBlur) {
            rangeBlur.addEventListener('input', (e) => {
                const val = e.target.value;
                if (valBlur) valBlur.textContent = `${val}px`;
                document.documentElement.style.setProperty('--bg-glass-blur', `${val}px`);
                localStorage.setItem('wavr_bg_blur', val);
            });
        }

        if (rangeOpacity) {
            rangeOpacity.addEventListener('input', (e) => {
                const val = e.target.value;
                if (valOpacity) valOpacity.textContent = `${val}%`;
                document.documentElement.style.setProperty('--bg-overlay-opacity', `${val / 100}`);
                localStorage.setItem('wavr_bg_opacity', val);
            });
        }

        // 4. Bind file input click & change
        const fileInput = document.getElementById('input-bg-file');
        const btnChangeBg = document.getElementById('btn-change-bg');
        const btnResetBg = document.getElementById('btn-reset-bg');

        if (btnChangeBg && fileInput) {
            btnChangeBg.addEventListener('click', () => {
                fileInput.click();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.processImageFile(file);
                }
                fileInput.value = ''; // Reset file input
            });
        }

        if (btnResetBg) {
            btnResetBg.addEventListener('click', async () => {
                try {
                    await removeStoredBackground();
                    if (SupabaseService.isConfigured()) {
                        await SupabaseService.updateUserPreferences({ wallpaper_url: null });
                    }
                    applyBackgroundImage(null);
                    showNotification("Wallpaper reset to default.");
                } catch(err) {
                    console.error("Reset failed", err);
                }
            });
        }

        // 5. Setup crop canvas controls
        this.setupCropCanvasEvents();
    },

    async syncWallpaperFromCloudOrLocal() {
        try {
            if (SupabaseService.isConfigured()) {
                const prefs = await SupabaseService.getUserPreferences();
                if (prefs && prefs.wallpaper_url) {
                    applyBackgroundImage(prefs.wallpaper_url);
                    return;
                }
            }

            // Fallback to local storage
            const savedBgBlob = await getStoredBackground();
            if (savedBgBlob) {
                applyBackgroundImage(savedBgBlob);
            }
        } catch (e) {
            console.error("Failed to load background image", e);
        }
    },

    processImageFile(file) {
        if (!file.type.startsWith('image/')) {
            showNotification("Please select a valid image file.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.openCropModal(img);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    openCropModal(img) {
        currentImage = img;
        const modal = document.getElementById('image-crop-modal');
        const canvas = document.getElementById('crop-canvas');
        if (!modal || !canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = CROP_WIDTH;
        canvas.height = CROP_HEIGHT;

        // Auto scale to fill canvas
        cropScale = Math.max(CROP_WIDTH / img.width, CROP_HEIGHT / img.height);
        
        // Center the image initially
        imgX = (CROP_WIDTH - img.width * cropScale) / 2;
        imgY = (CROP_HEIGHT - img.height * cropScale) / 2;

        modal.classList.remove('hidden');
        drawCropPreview(canvas, ctx);
    },

    setupCropCanvasEvents() {
        const canvas = document.getElementById('crop-canvas');
        const modal = document.getElementById('image-crop-modal');
        const btnCancel = document.getElementById('btn-crop-cancel');
        const btnApply = document.getElementById('btn-crop-apply');

        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const dragStart = (clientX, clientY) => {
            isDragging = true;
            startX = clientX - imgX;
            startY = clientY - imgY;
        };

        const dragMove = (clientX, clientY) => {
            if (!isDragging || !currentImage) return;

            let newX = clientX - startX;
            let newY = clientY - startY;

            const maxLimitX = 0;
            const minLimitX = CROP_WIDTH - currentImage.width * cropScale;
            const maxLimitY = 0;
            const minLimitY = CROP_HEIGHT - currentImage.height * cropScale;

            // Restrict bounds so it never leaves blank gaps
            imgX = Math.max(minLimitX, Math.min(maxLimitX, newX));
            imgY = Math.max(minLimitY, Math.min(maxLimitY, newY));

            drawCropPreview(canvas, ctx);
        };

        const dragEnd = () => {
            isDragging = false;
        };

        // Mouse Events
        canvas.addEventListener('mousedown', (e) => {
            dragStart(e.clientX, e.clientY);
        });
        window.addEventListener('mousemove', (e) => {
            if (isDragging) dragMove(e.clientX, e.clientY);
        });
        window.addEventListener('mouseup', dragEnd);

        // Touch Events
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                dragStart(e.touches[0].clientX, e.touches[0].clientY);
            }
        });
        canvas.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length === 1) {
                dragMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        });
        canvas.addEventListener('touchend', dragEnd);

        if (btnCancel && modal) {
            btnCancel.addEventListener('click', () => {
                modal.classList.add('hidden');
                currentImage = null;
            });
        }

        if (btnApply && modal) {
            btnApply.addEventListener('click', () => {
                if (!currentImage) return;

                // Create offscreen canvas at HD 1920x1080 size
                const outCanvas = document.createElement('canvas');
                outCanvas.width = 1920;
                outCanvas.height = 1080;
                const outCtx = outCanvas.getContext('2d');

                // Map canvas relative coords back to original image coords
                const sX = -imgX / cropScale;
                const sY = -imgY / cropScale;
                const sW = CROP_WIDTH / cropScale;
                const sH = CROP_HEIGHT / cropScale;

                outCtx.drawImage(currentImage, sX, sY, sW, sH, 0, 0, 1920, 1080);

                outCanvas.toBlob((blob) => {
                    saveAndApplyBackground(blob);
                    modal.classList.add('hidden');
                    currentImage = null;
                }, 'image/webp', 0.88);
            });
        }
    }
};

window.appMainContext = window.appMainContext || {};
