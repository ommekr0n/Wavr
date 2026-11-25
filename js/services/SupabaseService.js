/**
 * SupabaseService.js
 * Handles authentication, private track storage, LRC lyrics cloud sync,
 * and Row Level Security (RLS) operations for Wavr Personal Vault.
 */
import { createClient } from '@supabase/supabase-js';
import { createVaultAuthOperations, subscribeToVaultAuth } from '../features/vault/VaultAuthOperations.js';
import { vaultClientAuthOptions } from '../features/vault/VaultClientOptions.js';
import { createPrivateMediaResolver, mediaUrlNeedsRefresh, privateMediaUri } from '../features/vault/PrivateMediaUrls.js';
import { setMediaUrlResolver } from '../features/vault/MediaUrlAccess.js';

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://stbzeroodquuevmrwfyi.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_DTIzsD_0Qwotf4MZWsHs4w_N6uj-UQh';
const R2_URI_PREFIX = 'r2://';
const MEDIA_WORKER_URL = (import.meta.env?.VITE_MEDIA_WORKER_URL || 'https://wavr-media-gateway.vinhvy-vn.workers.dev').replace(/\/$/, '');
const resolvePrivateMedia = createPrivateMediaResolver(MEDIA_WORKER_URL, (...args) => SupabaseService.requestMediaWorker(...args));
setMediaUrlResolver(resolvePrivateMedia);

export const isSupabaseConfigured = Boolean(
    SUPABASE_URL && 
    SUPABASE_ANON_KEY && 
    !SUPABASE_URL.includes('your-supabase-project-id')
);

export const supabase = isSupabaseConfigured 
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: vaultClientAuthOptions
    }) 
    : null;

const vaultAuth = createVaultAuthOperations(supabase, {
    captchaRequired: Boolean(import.meta.env?.VITE_TURNSTILE_SITE_KEY)
});

const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);

export async function withNetworkRetry(fn, retries = 2, delayMs = 60) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const result = await fn();
            if (result && typeof result.status === 'number' && TRANSIENT_STATUS_CODES.has(result.status) && attempt < retries) {
                await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
                continue;
            }
            return result;
        } catch (err) {
            lastError = err;
            const status = err?.status || err?.statusCode;
            const isTransient = !status || TRANSIENT_STATUS_CODES.has(status) || /network|fetch|timeout|502|503|504/i.test(String(err?.message || err));
            if (!isTransient || attempt >= retries) throw err;
            await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
        }
    }
    throw lastError;
}

const defaultResolveMediaUrl = async function resolveMediaUrl(uri) {
    return resolvePrivateMedia(uri);
};

export const SupabaseService = {
    isConfigured() {
        return isSupabaseConfigured;
    },

    // ── Authentication ─────────────────────────────────────────────────────────
    async signUp(email, password, captchaToken) {
        return vaultAuth.submit(true, email, password, captchaToken);
    },

    async signIn(email, password, captchaToken) {
        return vaultAuth.submit(false, email, password, captchaToken);
    },

    async signOut() {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    async getSession() {
        if (!supabase) return null;
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    },

    async getCurrentUser() {
        if (!supabase) return null;
        if (typeof supabase.auth?.getSession === 'function') {
            try {
                const sessionRes = await supabase.auth.getSession();
                const session = sessionRes?.data?.session;
                if (session?.user) {
                    const expiresAtMs = session.expires_at ? Number(session.expires_at) * 1000 : Infinity;
                    if (expiresAtMs > Date.now() + 5_000) {
                        return session.user;
                    }
                }
            } catch {
                // Fall back to auth.getUser()
            }
        }
        if (typeof supabase.auth?.getUser === 'function') {
            const { data: { user } } = await supabase.auth.getUser();
            return user;
        }
        return null;
    },

    onAuthStateChange(callback) {
        return subscribeToVaultAuth(supabase, callback);
    },

    // ── Private Track Storage & Database ──────────────────────────────────────
    async getUserTrackCount() {
        if (!supabase) return 0;
        const user = await this.getCurrentUser();
        if (!user) return 0;

        try {
            const query = supabase.from('tracks').select('id', { count: 'exact', head: true });
            const res = typeof query?.eq === 'function' ? await query.eq('user_id', user.id) : await query;
            if (res && !res.error && typeof res.count === 'number') {
                return res.count;
            }
        } catch {
            // Fall back to fetchUserTracks length if count head query is unsupported
        }
        const tracks = await this.fetchUserTracks();
        return tracks.length;
    },

    async fetchUserTracks() {
        if (!supabase) return [];
        const user = await this.getCurrentUser();
        if (!user) return [];

        const { data, error } = await withNetworkRetry(() =>
            supabase
                .from('tracks')
                .select('*')
                .order('created_at', { ascending: false })
        );

        if (error) {
            console.error('Error fetching user tracks:', error);
            throw error;
        }
        const rows = data || [];
        if (rows.length === 0) return [];

        // Batch-resolve all tracks' audio_url & cover_url in 1 single /v1/signed-batch request when using default resolver
        if (this.resolveMediaUrl === defaultResolveMediaUrl && typeof resolvePrivateMedia.batch === 'function') {
            try {
                const allUris = [];
                for (const track of rows) {
                    allUris.push(track.audio_url, track.cover_url);
                }
                const resolvedUris = await resolvePrivateMedia.batch(allUris);
                return rows.map((track, idx) => ({
                    ...track,
                    audio_url: resolvedUris[idx * 2] ?? track.audio_url,
                    cover_url: resolvedUris[idx * 2 + 1] ?? track.cover_url
                }));
            } catch {
                // Fall back to per-track resolution so partial failures are isolated
            }
        }

        return Promise.all(rows.map(async (track) => {
            let audioUrl = track.audio_url;
            let coverUrl = track.cover_url;
            try {
                audioUrl = await this.resolveMediaUrl(track.audio_url);
            } catch (resolveErr) {
                console.warn('Failed to resolve track audio URL:', resolveErr);
            }
            try {
                coverUrl = await this.resolveMediaUrl(track.cover_url);
            } catch (resolveErr) {
                console.warn('Failed to resolve track cover URL:', resolveErr);
            }
            return {
                ...track,
                audio_url: audioUrl,
                cover_url: coverUrl
            };
        }));
    },

    async getUserStorageBytes() {
        if (!supabase) return 0;
        const user = await this.getCurrentUser();
        if (!user) return 0;

        const { data, error } = await supabase
            .rpc('get_user_storage_bytes');

        if (error) {
            // Fallback calculation if RPC function not created yet
            const tracks = await this.fetchUserTracks();
            return tracks.reduce((acc, t) => acc + (t.file_size || 0), 0);
        }
        return Number(data) || 0;
    },

    async uploadMediaFile(file, path) {
        if (!supabase) throw new Error('Supabase is not configured.');
        const user = await this.getCurrentUser();
        if (!user) throw new Error('User not authenticated. Please sign in to your Cloud Vault.');

        const fullPath = `${user.id}/${path}`;
        const response = await this.requestMediaWorker(`/v1/media/${this.encodeMediaPath(fullPath)}`, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file
        });
        if (!response.ok) throw new Error('Could not upload media to the private vault.');
        return `${R2_URI_PREFIX}${fullPath}`;
    },

    encodeMediaPath(path) {
        return path.split('/').map(encodeURIComponent).join('/');
    },

    async requestMediaWorker(path, options = {}) {
        if (!supabase) throw new Error('Supabase is not configured.');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('User not authenticated. Please sign in to your Cloud Vault.');
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${session.access_token}`);
        const method = (options.method || 'GET').toUpperCase();
        const isRetryable = method === 'GET' || method === 'HEAD' || path.startsWith('/v1/signed');
        const execFetch = () => fetch(`${MEDIA_WORKER_URL}${path}`, { ...options, headers });
        return isRetryable ? withNetworkRetry(execFetch) : execFetch();
    },

    /** Returns a short-lived Worker URL only for media owned by the signed-in user. */
    resolveMediaUrl: defaultResolveMediaUrl,

    async resolveMediaUrlsBatch(uris) {
        if (typeof resolvePrivateMedia.batch === 'function') {
            return resolvePrivateMedia.batch(uris);
        }
        return Promise.all((uris || []).map(u => this.resolveMediaUrl(u)));
    },

    mediaUrlNeedsRefresh(uri) { return mediaUrlNeedsRefresh(uri, MEDIA_WORKER_URL); },

    async saveTrack(trackData) {
        if (!supabase) throw new Error('Supabase is not configured.');
        const user = await this.getCurrentUser();
        if (!user) throw new Error('User not authenticated.');

        const trackPayload = {
            user_id: user.id,
            title: trackData.title,
            artist: trackData.artist || 'Unknown Artist',
            album: trackData.album || 'Unknown Album',
            duration: trackData.duration || 0,
            file_size: trackData.fileSize || 0,
            audio_url: privateMediaUri(trackData.audioUrl, MEDIA_WORKER_URL),
            cover_url: privateMediaUri(trackData.coverUrl, MEDIA_WORKER_URL) || null,
            lrc_text: trackData.lrcText || '',
            waveform_data: trackData.waveformData || null,
            is_enhanced: Boolean(trackData.isEnhanced)
        };

        const { data, error } = await supabase
            .from('tracks')
            .insert([trackPayload])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updateTrack(trackId, updates) {
        if (!supabase) throw new Error('Supabase is not configured.');
        const user = await this.getCurrentUser();
        if (!user) throw new Error('User not authenticated.');

        const updatePayload = {};
        if (updates.title !== undefined) updatePayload.title = updates.title;
        if (updates.artist !== undefined) updatePayload.artist = updates.artist;
        if (updates.album !== undefined) updatePayload.album = updates.album;
        if (updates.audioUrl !== undefined) updatePayload.audio_url = privateMediaUri(updates.audioUrl, MEDIA_WORKER_URL);
        if (updates.coverUrl !== undefined) updatePayload.cover_url = privateMediaUri(updates.coverUrl, MEDIA_WORKER_URL);
        if (updates.lrcText !== undefined) updatePayload.lrc_text = updates.lrcText;
        if (updates.fileSize !== undefined) updatePayload.file_size = updates.fileSize;
        if (updates.isEnhanced !== undefined) updatePayload.is_enhanced = updates.isEnhanced;
        updatePayload.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('tracks')
            .update(updatePayload)
            .eq('id', trackId)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteTrack(trackId) {
        if (!supabase) throw new Error('Supabase is not configured.');
        const user = await this.getCurrentUser();
        if (!user) throw new Error('User not authenticated.');

        // Delete DB row first (enforcing ownership) and capture media refs for best-effort R2 cleanup
        const { data: track, error } = await supabase
            .from('tracks')
            .delete()
            .eq('id', trackId)
            .eq('user_id', user.id)
            .select('audio_url, cover_url')
            .maybeSingle();

        if (error) throw error;

        if (track) {
            const filesToRemove = [];
            for (const rawUrl of [track.audio_url, track.cover_url]) {
                if (!rawUrl) continue;
                if (rawUrl.startsWith(R2_URI_PREFIX)) {
                    filesToRemove.push(rawUrl.slice(R2_URI_PREFIX.length));
                } else if (rawUrl.includes('/wavr-media/')) {
                    const parts = rawUrl.split('/wavr-media/');
                    if (parts[1]) {
                        const cleanPath = parts[1].split(/[?#]/)[0];
                        if (cleanPath) {
                            try {
                                filesToRemove.push(decodeURIComponent(cleanPath));
                            } catch {
                                filesToRemove.push(cleanPath);
                            }
                        }
                    }
                }
            }
            if (filesToRemove.length > 0) {
                await Promise.allSettled(filesToRemove.map(async (path) => {
                    try {
                        const response = await this.requestMediaWorker(`/v1/media/${this.encodeMediaPath(path)}`, { method: 'DELETE' });
                        if (!response.ok) console.warn('Cloud media file cleanup failed.');
                    } catch (cleanupErr) {
                        console.warn('Cloud media file cleanup error:', cleanupErr);
                    }
                }));
            }
        }
    },

    // ── User Cloud Preferences (Dedicated Table + user_metadata Fallback) ──────
    async updateUserPreferences(prefs) {
        if (!supabase || !prefs || typeof prefs !== 'object') return;
        const user = await this.getCurrentUser();
        if (!user) return;

        const rowPayload = {
            user_id: user.id,
            updated_at: new Date().toISOString()
        };
        if (prefs.vinyl_boxes !== undefined) rowPayload.vinyl_boxes = prefs.vinyl_boxes;
        if (prefs.library_order !== undefined) rowPayload.library_order = prefs.library_order;

        try {
            const table = supabase.from('user_preferences');
            if (table && typeof table.upsert === 'function') {
                const { data, error } = await table
                    .upsert(rowPayload, { onConflict: 'user_id' })
                    .select('vinyl_boxes, library_order')
                    .maybeSingle();
                if (!error) return data || rowPayload;
            }
        } catch {
            // Fall back to user_metadata if table is not migrated yet
        }

        const currentMeta = user.user_metadata || {};
        const updatedMeta = { ...currentMeta, ...prefs };
        const { data, error } = await supabase.auth.updateUser({
            data: updatedMeta
        });
        if (error) {
            console.warn('Failed to update user preferences on Supabase:', error);
        }
        return data?.user;
    },

    async getUserPreferences() {
        if (!supabase) return null;
        const user = await this.getCurrentUser();
        if (!user) return null;

        try {
            const table = supabase.from('user_preferences');
            if (table && typeof table.select === 'function') {
                const { data, error } = await table
                    .select('vinyl_boxes, library_order')
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (!error && data) {
                    return data;
                }
                // Opportunistically migrate existing user_metadata preferences to public.user_preferences
                const meta = user.user_metadata;
                if (!error && !data && meta && (meta.vinyl_boxes !== undefined || meta.library_order !== undefined) && typeof table.upsert === 'function') {
                    const migrated = {
                        user_id: user.id,
                        vinyl_boxes: meta.vinyl_boxes ?? [],
                        library_order: meta.library_order ?? [],
                        updated_at: new Date().toISOString()
                    };
                    await table.upsert(migrated, { onConflict: 'user_id' });
                    return { vinyl_boxes: migrated.vinyl_boxes, library_order: migrated.library_order };
                }
            }
        } catch {
            // Fall back to user_metadata if table query fails
        }
        return user?.user_metadata || null;
    }
};
