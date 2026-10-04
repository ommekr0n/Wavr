# Security notes for maintainers

## Before deploying

1. Run the complete [`supabase_schema.sql`](supabase_schema.sql) script in the target Supabase project. It enables Row Level Security for library data.
2. Set only `VITE_SUPABASE_URL` and a Supabase **publishable/anon** key in `.env.local`. These values are designed for browser use; access remains constrained by the database and storage policies.
3. Never add a Supabase service-role key, Cloudflare R2/S3 key, password, or other privileged credential to browser code, `.env` files that will be deployed, or `VITE_*` variables.
4. If this project was deployed before 23 September 2026, revoke the previously exposed R2 access key. The old key was embedded in a frontend module and must be treated as compromised. Audit the R2 bucket for unexpected objects or changes.

## Media access model

New cloud uploads are stored with an `r2://...` reference. The browser sends authenticated requests to the Cloudflare media Worker, which verifies the Supabase session and issues a 15-minute signed media link. The browser never receives an R2 storage secret.

The R2 bucket must remain private. Bind it to the Worker as `MEDIA`, store `MEDIA_SIGNING_KEY` only as a Worker secret, and set `ALLOWED_ORIGINS` to the specific development and production origins that may call the Worker. Do not use `*` for this setting.

## Password authentication

Before deploying the Auth changes, configure the target Supabase project:

1. Enable **Confirm email** for the email provider. On 4 October 2026, the linked project's public Auth settings returned `mailer_autoconfirm: true`; email ownership was not required for registration. Existing auto-confirmed accounts are not retroactively verified by changing this setting.
2. Enforce a minimum password length of **12** on the Auth server. The registration form also checks this length for usability, but direct API requests bypass browser validation. Existing users can still log in with older passwords.
3. Enable [leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) if supported by the project's plan. The live security advisor reported this protection disabled on 4 October 2026.
4. Enable [CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha) using Cloudflare Turnstile. Put the **public site key** in `VITE_TURNSTILE_SITE_KEY`, and its **secret key** only in Supabase Auth's CAPTCHA settings. Configure allowed hostnames on the Turnstile widget. Deploy the frontend with its site key together with enabling server protection; enabling only one side does not enforce bot protection. A configured widget blocks form submissions when its token is missing or expired, and Supabase verifies the token.
5. Review [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), particularly password token requests, registration and email sending. Button disabling prevents duplicate clicks only; the Auth server must enforce limits against scripts and direct requests.
6. Set the exact production Site URL and allowed email redirect URLs. Configure a working SMTP provider and verify actual delivery before enabling email confirmation in production.

Wavr currently uses password login only. It ignores sessions embedded in URL fragments. Confirmation links verify the email with Supabase; the user then logs in explicitly. Introducing OAuth, magic links or password recovery requires a separate callback flow, preferably PKCE with a code verifier, rather than re-enabling implicit URL session imports.

Auth callbacks run after the SDK releases its lock. On logout or account changes, Wavr stops audio, removes local library ordering caches, and reloads the page to discard the previous account's queues and signed media URLs. Same-account token refresh does not reload the page.

The browser still stores the Supabase session in localStorage, as is customary for a client-only SPA. Same-origin JavaScript can access it, so preventing XSS remains necessary. HttpOnly session cookies require a server-backed authentication architecture. Issued access tokens and media links can remain valid until expiry after logout; immediate invalidation requires additional server-side session checks.

The source changes do not update live Supabase Auth settings or deploy the frontend. After the project owner configured CAPTCHA on 4 October 2026, a login request without a CAPTCHA token was rejected with HTTP 400 and `captcha_failed`, confirming server enforcement. The hosting build must also receive `VITE_TURNSTILE_SITE_KEY`; the local `.env` is not committed to Git. See the focused [Auth review](security-audit/2026-10-04/auth-review.md) for the verified findings and remaining server configuration.

## Routine checks

- Run `npm audit --omit=dev` with network access before each release.
- Run `npm run build` before deployment.
- Check that the Supabase dashboard still shows RLS enabled for `tracks`, `playlists`, and `playlist_tracks`; and check that the R2 bucket has no public access enabled.
