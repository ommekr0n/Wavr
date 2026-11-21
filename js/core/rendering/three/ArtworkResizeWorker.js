// The input is transferred once and closed here. Output bitmaps are oriented for Three.js textures.
self.onmessage = async ({ data: { id, bitmap, width, height, crop } }) => {
    let output;
    try {
        const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d');
        if (!context) throw new Error('Artwork canvas unavailable');
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, ...crop, 0, 0, width, height);
        output = await createImageBitmap(canvas, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
        self.postMessage({ id, bitmap: output }, [output]);
    } catch {
        output?.close(); self.postMessage({ id, error: true });
    } finally { bitmap.close(); }
};
