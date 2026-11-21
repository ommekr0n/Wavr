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
    duration FLOAT8 DEFAULT 0 CHECK (duration >= 0),
    file_size BIGINT DEFAULT 0 CHECK (file_size >= 0),
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

-- Enforce non-negative duration and file_size constraints idempotently
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tracks_file_size_nonnegative'
          AND conrelid = 'public.tracks'::regclass
    ) THEN
        ALTER TABLE public.tracks
            ADD CONSTRAINT tracks_file_size_nonnegative CHECK (file_size >= 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tracks_duration_nonnegative'
          AND conrelid = 'public.tracks'::regclass
    ) THEN
        ALTER TABLE public.tracks
            ADD CONSTRAINT tracks_duration_nonnegative CHECK (duration >= 0);
    END IF;
END $$;

-- Data API access is explicit. Anonymous clients do not need direct table access;
-- signed-in users are still constrained to their own rows by the RLS policies below.
REVOKE ALL ON TABLE public.tracks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tracks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tracks TO service_role;

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
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tracks"
    ON public.tracks FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tracks"
    ON public.tracks FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tracks"
    ON public.tracks FOR DELETE
    TO authenticated
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

-- PostgreSQL grants function execution to PUBLIC by default, so revoke that
-- inherited access before opting authenticated callers in.
REVOKE EXECUTE ON FUNCTION public.get_user_storage_bytes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_storage_bytes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_storage_bytes() TO service_role;

-- 4. Create Playlists Table
CREATE TABLE IF NOT EXISTS public.playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

REVOKE ALL ON TABLE public.playlists FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.playlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.playlists TO service_role;

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON public.playlists(user_id);

DROP POLICY IF EXISTS "Users can manage own playlists" ON public.playlists;
CREATE POLICY "Users can manage own playlists"
    ON public.playlists FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Playlist Tracks Junction Table
CREATE TABLE IF NOT EXISTS public.playlist_tracks (
    playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (playlist_id, track_id)
);

REVOKE ALL ON TABLE public.playlist_tracks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.playlist_tracks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.playlist_tracks TO service_role;

ALTER TABLE public.playlist_tracks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON public.playlist_tracks(track_id);

DROP POLICY IF EXISTS "Users can manage own playlist tracks" ON public.playlist_tracks;
CREATE POLICY "Users can manage own playlist tracks"
    ON public.playlist_tracks FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.playlists p 
            WHERE p.id = playlist_tracks.playlist_id AND p.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.tracks t
            WHERE t.id = playlist_tracks.track_id AND t.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = playlist_tracks.playlist_id AND p.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.tracks t
            WHERE t.id = playlist_tracks.track_id AND t.user_id = auth.uid()
        )
    );

-- 5. Create Media Storage Bucket Policies (wavr-media)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'wavr-media',
    'wavr-media',
    false,
    104857600,
    ARRAY[
        'audio/mpeg',
        'audio/mp3',
        'audio/mp4',
        'audio/aac',
        'audio/wav',
        'audio/x-wav',
        'audio/flac',
        'audio/ogg',
        'audio/webm',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/avif',
        'application/octet-stream'
    ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can access own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own media" ON storage.objects;

CREATE POLICY "Users can upload own media"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'wavr-media' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can access own media"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'wavr-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete own media"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'wavr-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can update own media"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'wavr-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'wavr-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
