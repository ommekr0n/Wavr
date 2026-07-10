export function extractColorsFromImage(imgEl, updateCSSVariables) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const grid = 10; // Sample 100 pixels
    canvas.width = grid;
    canvas.height = grid;
    
    try {
        ctx.drawImage(imgEl, 0, 0, grid, grid);
        const data = ctx.getImageData(0, 0, grid, grid).data;
        let pixels = [];
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            const brightness = (r + g + b) / 3;
            
            if (brightness > 30 && brightness < 230) {
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const saturation = max - min;
                pixels.push({ r, g, b, saturation });
            }
        }
        
        pixels.sort((a, b) => b.saturation - a.saturation);
        
        let selectedColors = [];
        for (let p of pixels) {
            if (selectedColors.length >= 8) break;
            
            let isDistinct = true;
            for (let sc of selectedColors) {
                const dist = Math.abs(p.r - sc.r) + Math.abs(p.g - sc.g) + Math.abs(p.b - sc.b);
                if (dist < 60) {
                    isDistinct = false;
                    break;
                }
            }
            if (isDistinct) selectedColors.push(p);
        }
        
        while (selectedColors.length < 8) {
            if (pixels.length > 0) {
                selectedColors.push(pixels[Math.floor(Math.random() * pixels.length)]);
            } else {
                selectedColors.push({r: Math.floor(Math.random()*255), g: Math.floor(Math.random()*255), b: Math.floor(Math.random()*255)});
            }
        }
        
        const uiColors = selectedColors.slice(0, 4);
        const spotlightColors = selectedColors.slice(4, 8);
        uiColors.sort(() => Math.random() - 0.5);
        
        updateCSSVariables(uiColors, spotlightColors);
        return spotlightColors;
    } catch (e) {
        console.log("Could not extract colors, CORS issue likely.");
        return null;
    }
}
