/**
 * SupabaseService.js
 * Handles authentication, private track storage, LRC lyrics cloud sync,
 * and Row Level Security (RLS) operations for Wavr Personal Vault.
 */
import { createClient } from '@supabase/supabase-js';
import { createVaultAuthOperations, subscribeToVaultAuth } from '../features/vault/VaultAuthOperations.js';
import { vaultClientAuthOptions } from '../features/vault/VaultClientOptions.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://stbzeroodquuevmrwfyi.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_DTIzsD_0Qwotf4MZWsHs4w_N6uj-UQh';
const R2_URI_PREFIX = 'r2://';
const MEDIA_WORKER_URL = (import.meta.env.VITE_MEDIA_WORKER_URL || 'https://wavr-media-gateway.vinhvy-vn.workers.dev').replace(/\/$/, '');

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
    captchaRequired: Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY)
});

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

    async getCurrentUser() {
        if (!supabase) return null;
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    onAuthStateChange(callback) {
        return subscribeToVaultAuth(supabase, callback);
    },

    // ── Private Track Storage & Database ──────────────────────────────────────
    async fetchUserTracks() {
        if (!supabase) return [];
        const user = await this.getCurrentUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('tracks')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching user tracks:', error);
            throw error;
        }
        return Promise.all((data || []).map(async (track) => ({
            ...track,
            audio_url: await this.resolveMediaUrl(track.audio_url),
            cover_url: await this.resolveMediaUrl(track.cover_url)
        })));
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
        return fetch(`${MEDIA_WORKER_URL}${path}`, { ...options, headers });
    },

    /** Returns a short-lived Worker URL only for media owned by the signed-in user. */
    async resolveMediaUrl(uri) {
        if (!uri) return uri;
        let path = null;
        if (uri.startsWith(R2_URI_PREFIX)) path = uri.slice(R2_URI_PREFIX.length);
        else {
            try {
                const legacyUrl = new URL(uri);
                if (legacyUrl.hostname.endsWith('.r2.dev')) path = decodeURIComponent(legacyUrl.pathname.replace(/^\//, ''));
            } catch (_) {}
        }
        if (!path) return uri;
        const response = await this.requestMediaWorker(`/v1/signed/${this.encodeMediaPath(path)}`, { method: 'POST' });
        if (!response.ok) throw new Error('Could not access private cloud media.');
        return (await response.json()).url;
    },

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
            audio_url: trackData.audioUrl,
            cover_url: trackData.coverUrl || null,
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
        if (updates.audioUrl !== undefined) updatePayload.audio_url = updates.audioUrl;
        if (updates.coverUrl !== undefined) updatePayload.cover_url = updates.coverUrl;
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

        // Get track info first to clean up media files
        const { data: track } = await supabase
            .from('tracks')
            .select('audio_url, cover_url')
            .eq('id', trackId)
            .single();

        if (track) {
            const filesToRemove = [];
            if (track.audio_url?.startsWith(R2_URI_PREFIX)) {
                filesToRemove.push(track.audio_url.slice(R2_URI_PREFIX.length));
            } else if (track.audio_url && track.audio_url.includes('/wavr-media/')) {
                const parts = track.audio_url.split('/wavr-media/');
                if (parts[1]) filesToRemove.push(decodeURIComponent(parts[1]));
            }
            if (track.cover_url?.startsWith(R2_URI_PREFIX)) {
                filesToRemove.push(track.cover_url.slice(R2_URI_PREFIX.length));
            } else if (track.cover_url && track.cover_url.includes('/wavr-media/')) {
                const parts = track.cover_url.split('/wavr-media/');
                if (parts[1]) filesToRemove.push(decodeURIComponent(parts[1]));
            }
            if (filesToRemove.length > 0) {
                await Promise.all(filesToRemove.map(async (path) => {
                    const response = await this.requestMediaWorker(`/v1/media/${this.encodeMediaPath(path)}`, { method: 'DELETE' });
                    if (!response.ok) console.warn('Cloud media file cleanup failed.');
                }));
            }
        }

        const { error } = await supabase
            .from('tracks')
            .delete()
            .eq('id', trackId)
            .eq('user_id', user.id);

        if (error) throw error;
    },

    // ── User Cloud Preferences & Wallpaper ─────────────────────────────────────
    async updateUserPreferences(prefs) {
        if (!supabase) return;
        const user = await this.getCurrentUser();
        if (!user) return;

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
        return user?.user_metadata || null;
    }
};
