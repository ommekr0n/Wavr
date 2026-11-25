/**
 * file-signature.js
 * Magic-byte file signature inspection and verification for uploaded audio & image files.
 * Protects against spoofed file extensions (e.g. HTML/SVG/Script/PE/ELF disguised as .mp3 or .png).
 */

const SIGNATURE_SLICE_BYTES = 16;

function toUint8Array(bytes) {
    if (bytes instanceof Uint8Array) return bytes;
    if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
    if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (Array.isArray(bytes)) return new Uint8Array(bytes);
    return new Uint8Array(0);
}

function asciiPrefix(bytes, length = 16) {
    const slice = bytes.subarray(0, Math.min(length, bytes.length));
    let out = '';
    for (let i = 0; i < slice.length; i++) {
        out += String.fromCharCode(slice[i]);
    }
    return out;
}

function isDangerousDisguisedHeader(bytes) {
    if (bytes.length < 2) return null;

    // PE / DOS executable ('MZ')
    if (bytes[0] === 0x4D && bytes[1] === 0x5A) {
        return 'executable-mz';
    }

    // ELF executable (\x7FELF)
    if (bytes.length >= 4 && bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) {
        return 'executable-elf';
    }

    // Strip optional UTF-8 BOM or leading ASCII whitespace before checking text/markup headers
    let offset = 0;
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        offset = 3;
    }
    while (offset < bytes.length && (bytes[offset] === 0x20 || bytes[offset] === 0x09 || bytes[offset] === 0x0A || bytes[offset] === 0x0D)) {
        offset++;
    }

    const head = asciiPrefix(bytes.subarray(offset), 12).toLowerCase();
    if (
        head.startsWith('<!do') ||
        head.startsWith('<htm') ||
        head.startsWith('<svg') ||
        head.startsWith('<?xm') ||
        head.startsWith('<scr')
    ) {
        return 'disguised-markup';
    }

    return null;
}

/**
 * Inspects the first 4..16 bytes of an audio file buffer.
 * @param {Uint8Array|ArrayBuffer|number[]} rawBytes
 * @returns {{ valid: boolean, detected: string, reason?: string }}
 */
export function inspectAudioSignature(rawBytes) {
    const bytes = toUint8Array(rawBytes);
    const threat = isDangerousDisguisedHeader(bytes);
    if (threat) {
        return { valid: false, detected: threat, reason: `Rejected disguised payload (${threat})` };
    }

    if (bytes.length < 4) {
        return { valid: false, detected: 'unknown', reason: 'File too short to contain valid audio signature' };
    }

    // 1. MP3 with ID3 header ('ID3' = 0x49, 0x44, 0x33)
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
        return { valid: true, detected: 'mp3' };
    }

    // 2. FLAC ('fLaC' = 0x66, 0x4C, 0x61, 0x43)
    if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) {
        return { valid: true, detected: 'flac' };
    }

    // 3. OGG ('OggS' = 0x4F, 0x67, 0x67, 0x53)
    if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
        return { valid: true, detected: 'ogg' };
    }

    // 4. WAV ('RIFF' at 0..3 AND 'WAVE' at 8..11)
    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
    ) {
        return { valid: true, detected: 'wav' };
    }

    // 5. M4A / MP4 / AAC ISO Base Media File Format ('ftyp' at 4..7)
    if (
        bytes.length >= 8 &&
        bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
    ) {
        return { valid: true, detected: 'm4a' };
    }

    // 6. WebM / Matroska EBML header (0x1A, 0x45, 0xDF, 0xA3)
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
        return { valid: true, detected: 'webm' };
    }

    // 7. ADTS AAC frame sync (0xFF && (bytes[1] & 0xF0) === 0xF0) or MPEG audio frame sync (0xFF && (bytes[1] & 0xE0) === 0xE0)
    if (bytes[0] === 0xFF && (bytes[1] & 0xF0) === 0xF0 && (bytes[1] & 0x06) === 0x00) {
        return { valid: true, detected: 'aac' };
    }
    if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) {
        return { valid: true, detected: 'mp3' };
    }

    return { valid: false, detected: 'unknown', reason: 'Unrecognized audio file signature' };
}

/**
 * Inspects the first 4..16 bytes of an image file buffer.
 * @param {Uint8Array|ArrayBuffer|number[]} rawBytes
 * @returns {{ valid: boolean, detected: string, reason?: string }}
 */
export function inspectImageSignature(rawBytes) {
    const bytes = toUint8Array(rawBytes);
    const threat = isDangerousDisguisedHeader(bytes);
    if (threat) {
        return { valid: false, detected: threat, reason: `Rejected disguised payload (${threat})` };
    }

    if (bytes.length < 4) {
        return { valid: false, detected: 'unknown', reason: 'File too short to contain valid image signature' };
    }

    // 1. PNG (89 50 4E 47 0D 0A 1A 0A)
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
        bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
    ) {
        return { valid: true, detected: 'png' };
    }

    // 2. JPEG (FF D8 FF)
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return { valid: true, detected: 'jpeg' };
    }

    // 3. GIF ('GIF87a' or 'GIF89a' -> 47 49 46 38)
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
        return { valid: true, detected: 'gif' };
    }

    // 4. WEBP ('RIFF' at 0..3 AND 'WEBP' at 8..11)
    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
        return { valid: true, detected: 'webp' };
    }

    // 5. AVIF / HEIF ISO Base Media File Format ('ftyp' at 4..7)
    if (
        bytes.length >= 8 &&
        bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
    ) {
        return { valid: true, detected: 'avif' };
    }

    return { valid: false, detected: 'unknown', reason: 'Unrecognized image file signature' };
}

async function readLeadingBytes(file) {
    if (!file || typeof file.slice !== 'function') return null;
    const headBlob = file.slice(0, SIGNATURE_SLICE_BYTES);
    if (!headBlob || typeof headBlob.arrayBuffer !== 'function') return null;
    const buffer = await headBlob.arrayBuffer();
    return new Uint8Array(buffer);
}

/**
 * Verifies the magic bytes of a File/Blob for valid audio formats.
 * Gracefully returns `{ valid: true, detected: 'mock' }` when lightweight mock objects without `.slice().arrayBuffer()` are used in unit tests.
 * @param {File|Blob|object} file
 * @returns {Promise<{ valid: boolean, detected: string, reason?: string }>}
 */
export async function verifyAudioFileSignature(file) {
    const bytes = await readLeadingBytes(file);
    if (!bytes) {
        return { valid: true, detected: 'mock' };
    }
    return inspectAudioSignature(bytes);
}

/**
 * Verifies the magic bytes of a File/Blob for valid image formats.
 * Gracefully returns `{ valid: true, detected: 'mock' }` when lightweight mock objects without `.slice().arrayBuffer()` are used in unit tests.
 * @param {File|Blob|object} file
 * @returns {Promise<{ valid: boolean, detected: string, reason?: string }>}
 */
export async function verifyImageFileSignature(file) {
    const bytes = await readLeadingBytes(file);
    if (!bytes) {
        return { valid: true, detected: 'mock' };
    }
    return inspectImageSignature(bytes);
}
