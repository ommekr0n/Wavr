# Security notes for maintainers

## Before deploying

1. Run the complete [`supabase_schema.sql`](supabase_schema.sql) script in the target Supabase project. It enables Row Level Security for library data.
2. Set only `VITE_SUPABASE_URL` and a Supabase **publishable/anon** key in `.env.local`. These values are designed for browser use; access remains constrained by the database and storage policies.
3. Never add a Supabase service-role key, Cloudflare R2/S3 key, password, or other privileged credential to browser code, `.env` files that will be deployed, or `VITE_*` variables.
4. If this project was deployed before 23 September 2026, revoke the previously exposed R2 access key. The old key was embedded in a frontend module and must be treated as compromised. Audit the R2 bucket for unexpected objects or changes.

## Media access model

New cloud uploads are stored with an `r2://...` reference. The browser sends authenticated requests to the Cloudflare media Worker, which verifies the Supabase session and issues a 15-minute signed media link. The browser never receives an R2 storage secret.

The R2 bucket must remain private. Bind it to the Worker as `MEDIA`, store `MEDIA_SIGNING_KEY` only as a Worker secret, and set `ALLOWED_ORIGINS` to the specific development and production origins that may call the Worker. Do not use `*` for this setting.

## Routine checks

- Run `npm audit --omit=dev` with network access before each release.
- Run `npm run build` before deployment.
- Check that the Supabase dashboard still shows RLS enabled for `tracks`, `playlists`, and `playlist_tracks`; and check that the R2 bucket has no public access enabled.
