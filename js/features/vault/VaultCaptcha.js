import { VaultAuthError } from './VaultAuthPolicy.js';

let scriptPromise;
function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!scriptPromise) {
        scriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            const timeout = setTimeout(() => { script.remove(); reject(new VaultAuthError('captcha_failed')); }, 15000);
            script.onload = () => {
                clearTimeout(timeout);
                if (window.turnstile) resolve(window.turnstile);
                else reject(new VaultAuthError('captcha_failed'));
            };
            script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new VaultAuthError('captcha_failed')); };
            document.head.append(script);
        }).catch(error => { scriptPromise = null; throw error; });
    }
    return scriptPromise;
}

export function createVaultCaptcha(container, sitekey) {
    let widgetId, mounting, token = '';
    return {
        async mount() {
            if (!sitekey || widgetId !== undefined) return;
            if (!mounting) mounting = (async () => {
                const turnstile = await loadTurnstile();
                container.classList.remove('hidden');
                widgetId = turnstile.render(container, {
                    sitekey, theme: 'dark',
                    callback: value => { token = value; },
                    'expired-callback': () => { token = ''; },
                    'error-callback': () => { token = ''; }
                });
            })().finally(() => { mounting = null; });
            return mounting;
        },
        getToken() {
            if (sitekey && !token) throw new VaultAuthError('captcha_required');
            return token || undefined;
        },
        reset() {
            token = '';
            if (widgetId !== undefined) window.turnstile.reset(widgetId);
        }
    };
}
