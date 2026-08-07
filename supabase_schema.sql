-- ============================================================================
-- WAVR SUPABASE DATABASE SCHEMA & SECURITY POLICIES (IDEMPOTENT & LINTER CLEAN)
-- Paste this script into your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ============================================================================

-- 1. Create Tracks Table
CREATE TABLE IF NOT EXISTS public.tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    artist TEXT DEFAULT 'Unknown Artist',
    album TEXT DEFAULT 'Unknown Album',
    duration FLOAT8 DEFAULT 0,
    file_size BIGINT DEFAULT 0,
    audio_url TEXT NOT NULL,
    cover_url TEXT,
    lrc_text TEXT,
    waveform_data JSONB,
    is_enhanced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safely add file_size column if table was created in an earlier step
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;

-- Index for ultra-fast user queries
CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON public.tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON public.tracks(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;

-- 2. Row Level Security Policies for Tracks (Drop if exists first to allow re-running)
DROP POLICY IF EXISTS "Users can view own tracks" ON public.tracks;
DROP POLICY IF EXISTS "Users can insert own tracks" ON public.tracks;
DROP POLICY IF EXISTS "Users can update own tracks" ON public.tracks;
DROP POLICY IF EXISTS "Users can delete own tracks" ON public.tracks;

CREATE POLICY "Users can view own tracks"
    ON public.tracks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tracks"
    ON public.tracks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tracks"
    ON public.tracks FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tracks"
    ON public.tracks FOR DELETE
    USING (auth.uid() = user_id);

-- 3. Storage Quota Helper Function (Cleaned for Supabase Database Linter 0011, 0028, 0029)
DROP FUNCTION IF EXISTS public.get_user_storage_bytes(UUID);
DROP FUNCTION IF EXISTS public.get_user_storage_bytes();

CREATE OR REPLACE FUNCTION public.get_user_storage_bytes()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_total BIGINT;
BEGIN
    SELECT COALESCE(SUM(file_size), 0) INTO v_total
    FROM public.tracks
    WHERE user_id = auth.uid();
    
    RETURN v_total;
END;
$$;

-- Revoke execution from anonymous public role for security
REVOKE EXECUTE ON FUNCTION public.get_user_storage_bytes() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_storage_bytes() TO authenticated;

-- 4. Create Playlists Table
CREATE TABLE IF NOT EXISTS public.playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own playlists" ON public.playlists;
CREATE POLICY "Users can manage own playlists"
    ON public.playlists FOR ALL
    USING (auth.uid() = user_id);

-- Playlist Tracks Junction Table
CREATE TABLE IF NOT EXISTS public.playlist_tracks (
    playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (playlist_id, track_id)
);

ALTER TABLE public.playlist_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own playlist tracks" ON public.playlist_tracks;
CREATE POLICY "Users can manage own playlist tracks"
    ON public.playlist_tracks FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.playlists p 
            WHERE p.id = playlist_tracks.playlist_id AND p.user_id = auth.uid()
        )
    );

-- 5. Create Media Storage Bucket Policies (wavr-media)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('wavr-media', 'wavr-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can access own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own media" ON storage.objects;

CREATE POLICY "Users can upload own media"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'wavr-media' 
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can access own media"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'wavr-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete own media"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'wavr-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
