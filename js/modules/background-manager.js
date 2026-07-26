/**
 * Wavr - Custom Background Wallpaper & Glass Frost Controller
 */

let db = null;
let currentImage = null; // Holds the HTMLImageElement being cropped
let cropScale = 1;
let imgX = 0;
let imgY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

const CROP_WIDTH = 640;
const CROP_HEIGHT = 360; // 16:9 Aspect Ratio

// Safely get localforage from window or wait for it
async function getDB() {
    if (db) return db;
    if (window.localforage) {
        db = window.localforage;
        return db;
    }
    // Fallback if localforage is loading
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (window.localforage) {
                db = window.localforage;
                clearInterval(interval);
                resolve(db);
            }
        }, 50);
    });
}

function showNotification(message) {
    if (window.appMainContext && typeof window.appMainContext.showToast === 'function') {
        window.appMainContext.showToast(message);
    } else {
        // Fallback custom toast if main context is not initialized yet
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
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
}

// Convert image to Blob and save
async function saveAndApplyBackground(blob) {
    const store = await getDB();
    try {
        await store.setItem('wavr_custom_bg', blob);
        applyBackgroundImage(blob);
        showNotification("Wallpaper updated successfully!");
    } catch (e) {
        console.error("Failed to save custom background", e);
        showNotification("Failed to save wallpaper.");
    }
}

// Set background image on target layers
function applyBackgroundImage(blob) {
    const bgLayer = document.getElementById('app-custom-bg-layer');
    if (!bgLayer) return;

    if (blob) {
        const url = URL.createObjectURL(blob);
        
        // Clean up old object URLs if any
        if (bgLayer.dataset.bgUrl) {
            URL.revokeObjectURL(bgLayer.dataset.bgUrl);
        }

        bgLayer.style.backgroundImage = `url('${url}')`;
        bgLayer.dataset.bgUrl = url;
        bgLayer.classList.add('active');
    } else {
        if (bgLayer.dataset.bgUrl) {
            URL.revokeObjectURL(bgLayer.dataset.bgUrl);
            delete bgLayer.dataset.bgUrl;
        }
        bgLayer.style.backgroundImage = '';
        bgLayer.classList.remove('active');
    }
}

export const BackgroundManager = {
    async init() {
        const store = await getDB();

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

        // 2. Load saved background image
        try {
            const savedBgBlob = await store.getItem('wavr_custom_bg');
            if (savedBgBlob) {
                applyBackgroundImage(savedBgBlob);
            }
        } catch (e) {
            console.error("Failed to load saved background image", e);
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
                    await store.removeItem('wavr_custom_bg');
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

    processImageFile(file) {
        if (!file.type.startsWith('image/')) {
            showNotification("Please select a valid image file.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const w = img.width;
                const h = img.height;

                // Scenario A: Image is too large -> Trigger Crop Modal
                if (w > 1920 || h > 1080) {
                    this.openCropModal(img);
                } 
                // Scenario B: Image is too small -> Warn, upscale, save
                else if (w < 1280 || h < 720) {
                    showNotification("Image is below recommended HD resolution. Auto-upscaling to fit...");
                    this.upscaleImage(img);
                }
                // Scenario C: Perfect fit -> Compress to WebP directly
                else {
                    this.directSaveImage(img);
                }
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
                }, 'image/webp', 0.85);
            });
        }
    },

    upscaleImage(img) {
        const outCanvas = document.createElement('canvas');
        outCanvas.width = 1920;
        outCanvas.height = 1080;
        const outCtx = outCanvas.getContext('2d');

        // Apply high quality smoothing
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';

        // Fit cover calculation
        const scale = Math.max(1920 / img.width, 1080 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (1920 - w) / 2;
        const y = (1080 - h) / 2;

        outCtx.drawImage(img, x, y, w, h);

        outCanvas.toBlob((blob) => {
            saveAndApplyBackground(blob);
        }, 'image/webp', 0.85);
    },

    directSaveImage(img) {
        const outCanvas = document.createElement('canvas');
        outCanvas.width = 1920;
        outCanvas.height = 1080;
        const outCtx = outCanvas.getContext('2d');

        // Draw cover fit
        const scale = Math.max(1920 / img.width, 1080 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (1920 - w) / 2;
        const y = (1080 - h) / 2;

        outCtx.drawImage(img, x, y, w, h);

        outCanvas.toBlob((blob) => {
            saveAndApplyBackground(blob);
        }, 'image/webp', 0.85);
    }
};

window.appMainContext = window.appMainContext || {};
window.appMainContext.showToast = showNotification;
