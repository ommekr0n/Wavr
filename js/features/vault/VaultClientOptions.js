// Wavr supports password login only. Confirmation links verify email at Supabase;
// users then log in explicitly, so URL-supplied sessions are never trusted.
export const vaultClientAuthOptions = Object.freeze({
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
});
