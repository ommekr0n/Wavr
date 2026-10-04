import { validateCredentials, VaultAuthError } from './VaultAuthPolicy.js';

export function createVaultAuthOperations(client, { captchaRequired = false } = {}) {
    return {
        async submit(signup, email, password, captchaToken) {
            if (!client) throw new VaultAuthError('auth_unavailable');
            const credentials = validateCredentials(email, password, signup);
            if (captchaRequired && !captchaToken) throw new VaultAuthError('captcha_required');
            const payload = { ...credentials, options: captchaToken ? { captchaToken } : {} };
            const { data, error } = signup
                ? await client.auth.signUp(payload)
                : await client.auth.signInWithPassword(payload);
            if (error) {
                if (signup && ['user_already_exists', 'email_exists'].includes(error.code)) {
                    return { user: null, session: null };
                }
                throw new VaultAuthError(error.code);
            }
            return data;
        }
    };
}

// Leave the Auth client's lock before subscribers call getUser()/other SDK methods.
export function subscribeToVaultAuth(client, callback) {
    if (!client) return () => {};
    let active = true;
    const timers = new Set();
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        const timer = setTimeout(() => {
            timers.delete(timer);
            if (active) Promise.resolve().then(() => callback(event, session)).catch(() => {
                console.warn('Cloud Vault session update failed.');
            });
        }, 0);
        timers.add(timer);
    });
    return () => {
        active = false;
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        subscription.unsubscribe();
    };
}
