/**
 * R2Service.js
 * Dedicated Cloudflare R2 S3 Uploader & Media CDN Service.
 * Uploads MP3/FLAC audio files and WebP album covers directly to Cloudflare R2 (10GB $0 Egress).
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const R2_ENDPOINT = import.meta.env.VITE_R2_ENDPOINT || 'https://97b1f534fd6446064a0695ea52401718.r2.cloudflarestorage.com';
const R2_PUBLIC_DOMAIN = (import.meta.env.VITE_R2_PUBLIC_DOMAIN || 'https://pub-ad9d2da16833484899017a239642b570.r2.dev').replace(/\/$/, '');
const R2_BUCKET = import.meta.env.VITE_R2_BUCKET || 'wavr-media';
const R2_ACCESS_KEY_ID = import.meta.env.VITE_R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = import.meta.env.VITE_R2_SECRET_ACCESS_KEY || '';

export const isR2Configured = Boolean(R2_ENDPOINT && R2_PUBLIC_DOMAIN && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

let s3Client = null;
if (isR2Configured) {
    s3Client = new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    });
}

export const R2Service = {
    isConfigured() {
        return isR2Configured;
    },

    /**
     * Uploads a file directly to Cloudflare R2 Bucket and returns the R2 Public CDN URL.
     */
    async uploadMediaFile(file, path) {
        if (!s3Client) {
            throw new Error('Cloudflare R2 API Keys not configured in .env file.');
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        const command = new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: path,
            Body: buffer,
            ContentType: file.type || 'application/octet-stream',
        });

        await s3Client.send(command);

        // Return CDN Public URL
        return `${R2_PUBLIC_DOMAIN}/${path}`;
    },

    /**
     * Deletes a file from Cloudflare R2 Bucket by path.
     */
    async deleteMediaFile(path) {
        if (!s3Client) return;

        const command = new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: path,
        });

        await s3Client.send(command);
    }
};
