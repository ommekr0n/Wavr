import { SIGNUP_NOTICE, SIGNUP_PASSWORD_MIN_LENGTH, authErrorMessage } from './VaultAuthPolicy.js';

export function initVaultAuthForm({ document: doc = document, service, captcha, onAuthenticated }) {
    const form = doc.getElementById('vault-auth-form');
    if (!form) return;
    const email = doc.getElementById('vault-email');
    const password = doc.getElementById('vault-password');
    const submit = doc.getElementById('btn-vault-submit');
    const login = doc.getElementById('tab-login');
    const signup = doc.getElementById('tab-signup');
    const error = doc.getElementById('vault-auth-error');
    const success = doc.getElementById('vault-auth-success');
    const hint = doc.getElementById('vault-password-hint');
    let signupMode = false, pending = false;

    function clearMessages() {
        error.classList.add('hidden');
        success.classList.add('hidden');
    }
    function setMode(next) {
        if (pending) return;
        signupMode = next;
        login.classList.toggle('active', !next);
        signup.classList.toggle('active', next);
        password.value = '';
        password.autocomplete = next ? 'new-password' : 'current-password';
        password.minLength = next ? SIGNUP_PASSWORD_MIN_LENGTH : 1;
        hint.classList.toggle('hidden', !next);
        submit.textContent = next ? 'Sign Up for Vault' : 'Log In to Vault';
        clearMessages();
        captcha.reset();
    }
    login.addEventListener('click', () => setMode(false));
    signup.addEventListener('click', () => setMode(true));
    doc.getElementById('btn-close-cloud-vault')?.addEventListener('click', () => {
        password.value = '';
        clearMessages();
        captcha.reset();
    });
    setMode(false);

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (pending || !form.reportValidity()) return;
        const requestIsSignup = signupMode;
        pending = true;
        clearMessages();
        form.setAttribute('aria-busy', 'true');
        submit.disabled = login.disabled = signup.disabled = true;
        try {
            const token = captcha.getToken();
            const data = await (requestIsSignup
                ? service.signUp(email.value, password.value, token)
                : service.signIn(email.value, password.value, token));
            success.textContent = requestIsSignup ? SIGNUP_NOTICE : 'Vault connected successfully!';
            success.classList.remove('hidden');
            if (data?.session) await onAuthenticated();
        } catch (failure) {
            error.textContent = authErrorMessage(failure);
            error.classList.remove('hidden');
        } finally {
            password.value = '';
            captcha.reset();
            pending = false;
            form.setAttribute('aria-busy', 'false');
            submit.disabled = login.disabled = signup.disabled = false;
        }
    });
}
