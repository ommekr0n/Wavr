/**
 * R2Service.js
 * Legacy compatibility module.
 *
 * Browser applications must never contain an S3/R2 secret key. Wavr now uploads
 * through Supabase Storage, where row-level policies enforce ownership.
 */
export const isR2Configured = false;

export const R2Service = {
    isConfigured() {
        return false;
    },

    /**
     * Uploads a file directly to Cloudflare R2 Bucket and returns the R2 Public CDN URL.
     */
    async uploadMediaFile(file, path) {
        throw new Error('Direct R2 uploads are disabled because browser code cannot safely store R2 credentials.');
    },

    /**
     * Deletes a file from Cloudflare R2 Bucket by path.
     */
    async deleteMediaFile(path) {
        throw new Error('Direct R2 deletion is disabled.');
    }
};
