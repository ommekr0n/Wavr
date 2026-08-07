/**
 * SupabaseService.js
 * Handles authentication, private track storage, LRC lyrics cloud sync,
 * and Row Level Security (RLS) operations for Wavr Personal Vault.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const R2_PUBLIC_DOMAIN = (import.meta.env.VITE_R2_PUBLIC_DOMAIN || '').replace(/\/$/, '');

export const isSupabaseConfigured = Boolean(
    SUPABASE_URL && 
    SUPABASE_ANON_KEY && 
    !SUPABASE_URL.includes('your-supabase-project-id')
);

export const supabase = isSupabaseConfigured 
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }) 
    : null;

export const SupabaseService = {
    isConfigured() {
        return isSupabaseConfigured;
    },

    // ── Authentication ─────────────────────────────────────────────────────────
    async signUp(email, password) {
        if (!supabase) throw new Error('Supabase is not configured.');
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        return data;
    },

    async signIn(email, password) {
        if (!supabase) throw new Error('Supabase is not configured.');
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
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
        if (!supabase) return () => {};
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            callback(event, session);
        });
        return () => subscription.unsubscribe();
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
        return data || [];
    },

    async getUserStorageBytes() {
        if (!supabase) return 0;
        const user = await this.getCurrentUser();
        if (!user) return 0;

        const { data, error } = await supabase
            .rpc('get_user_storage_bytes', { p_user_id: user.id });

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
        const { data, error } = await supabase.storage
            .from('wavr-media')
            .upload(fullPath, file, { upsert: true });

        if (error) throw error;

        if (R2_PUBLIC_DOMAIN) {
            return `${R2_PUBLIC_DOMAIN}/${fullPath}`;
        }

        const { data: publicUrlData } = supabase.storage
            .from('wavr-media')
            .getPublicUrl(fullPath);

        return publicUrlData.publicUrl;
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
            if (track.audio_url && track.audio_url.includes('/wavr-media/')) {
                const parts = track.audio_url.split('/wavr-media/');
                if (parts[1]) filesToRemove.push(decodeURIComponent(parts[1]));
            }
            if (track.cover_url && track.cover_url.includes('/wavr-media/')) {
                const parts = track.cover_url.split('/wavr-media/');
                if (parts[1]) filesToRemove.push(decodeURIComponent(parts[1]));
            }
            if (filesToRemove.length > 0) {
                await supabase.storage.from('wavr-media').remove(filesToRemove);
            }
        }

        const { error } = await supabase
            .from('tracks')
            .delete()
            .eq('id', trackId);

        if (error) throw error;
    }
};
