import test from 'node:test';
import assert from 'node:assert/strict';
import { createVaultAuthOperations, subscribeToVaultAuth } from '../js/features/vault/VaultAuthOperations.js';
import { authErrorMessage, SIGNUP_NOTICE } from '../js/features/vault/VaultAuthPolicy.js';
import { initVaultAuthForm } from '../js/features/vault/VaultAuthForm.js';
import { initVaultSessionBoundary, clearVaultBrowserState } from '../js/features/vault/VaultSessionBoundary.js';
import { createVaultCaptcha } from '../js/features/vault/VaultCaptcha.js';
import { vaultClientAuthOptions } from '../js/features/vault/VaultClientOptions.js';
import { createClient } from '@supabase/supabase-js';

const settle = () => new Promise(resolve => setTimeout(resolve, 10));
const secret = '  long unique passphrase  ';

test('the installed Supabase SDK ignores sessions injected through a login URL', async t => {
    const originalWindow = globalThis.window, originalDocument = globalThis.document;
    globalThis.window = { location: { href: 'https://wavr.example/#access_token=attacker-token&refresh_token=attacker-refresh&expires_in=3600&token_type=bearer' } };
    globalThis.document = { visibilityState: 'visible' };
    t.after(() => { globalThis.window = originalWindow; globalThis.document = originalDocument; });
    const stored = new Map();
    let requests = 0;
    const client = createClient('https://auth.example', 'public-key', {
        auth: {
            ...vaultClientAuthOptions, autoRefreshToken: false,
            storageKey: 'url-injection-test',
            storage: {
                getItem: key => stored.get(key) || null,
                setItem: (key, value) => stored.set(key, value),
                removeItem: key => stored.delete(key)
            }
        },
        global: { fetch: async () => { requests++; throw new Error('URL session must not reach Auth'); } }
    });
    t.after(() => client.auth.dispose());
    const { data, error } = await client.auth.getSession();
    assert.equal(error, null);
    assert.equal(data.session, null);
    assert.equal(stored.size, 0);
    assert.equal(requests, 0);
});
function authFixture(result = { data: { session: null }, error: null }) {
    const calls = [];
    const submit = async payload => { calls.push(payload); return result; };
    return { calls, client: { auth: { signUp: submit, signInWithPassword: submit } } };
}

test('invalid signup input is rejected before the network; existing short passwords still log in', async () => {
    const { client, calls } = authFixture();
    const auth = createVaultAuthOperations(client);
    await assert.rejects(auth.submit(true, 'person@example.com', 'short'), { code: 'weak_password_input' });
    await assert.rejects(auth.submit(true, 'bad-email', secret), { code: 'invalid_email_input' });
    await assert.rejects(auth.submit(false, 'person@example.com', ''), { code: 'invalid_password_input' });
    assert.equal(calls.length, 0);
    await auth.submit(false, ' person@example.com ', 'short');
    assert.deepEqual(calls[0], { email: 'person@example.com', password: 'short', options: {} });
});

test('password whitespace is preserved and CAPTCHA is passed for both signup and login', async () => {
    const { client, calls } = authFixture();
    const auth = createVaultAuthOperations(client, { captchaRequired: true });
    await assert.rejects(auth.submit(true, 'person@example.com', secret), { code: 'captcha_required' });
    assert.equal(calls.length, 0);
    for (const signup of [true, false]) await auth.submit(signup, 'person@example.com', secret, 'challenge-token');
    for (const payload of calls) {
        assert.equal(payload.password, secret);
        assert.equal(payload.options.captchaToken, 'challenge-token');
    }
});

test('existing registration receives the same notice and no raw server error escapes', async () => {
    for (const code of ['user_already_exists', 'email_exists']) {
        const { client } = authFixture({ data: null, error: { code, message: 'This person already exists' } });
        assert.deepEqual(await createVaultAuthOperations(client).submit(true, 'person@example.com', secret), { user: null, session: null });
    }
    const { client } = authFixture({ data: null, error: { code: 'email_not_confirmed', message: 'Email exists but is not confirmed' } });
    await assert.rejects(createVaultAuthOperations(client).submit(false, 'person@example.com', secret), error => {
        assert.equal(error.message, 'email_not_confirmed');
        assert.equal(authErrorMessage(error), authErrorMessage({ code: 'invalid_credentials' }));
        assert.doesNotMatch(authErrorMessage(error), /confirmed|exists/);
        return true;
    });
    assert.equal(authErrorMessage(new Error('<script>secret server details</script>')), authErrorMessage({}));
});

test('Auth subscribers run after the SDK releases its lock and unsubscribe cancels delivery', async () => {
    let handler, lockHeld = false, called = 0, unsubscribed = 0;
    const client = { auth: { onAuthStateChange(callback) {
        handler = callback;
        return { data: { subscription: { unsubscribe() { unsubscribed++; } } } };
    } } };
    const unsubscribe = subscribeToVaultAuth(client, async () => {
        assert.equal(lockHeld, false);
        called++;
    });
    lockHeld = true;
    handler('SIGNED_IN', { user: { id: 'a' } });
    assert.equal(called, 0);
    lockHeld = false;
    await settle();
    assert.equal(called, 1);
    handler('TOKEN_REFRESHED', null);
    unsubscribe();
    await settle();
    assert.equal(called, 1);
    assert.equal(unsubscribed, 1);
});

class Element {
    value = ''; disabled = false; textContent = ''; handlers = new Map(); attributes = new Map();
    classList = {
        values: new Set(['hidden']),
        add: value => this.classList.values.add(value),
        remove: value => this.classList.values.delete(value),
        toggle: (value, force) => force ? this.classList.values.add(value) : this.classList.values.delete(value),
        contains: value => this.classList.values.has(value)
    };
    addEventListener(name, callback) { this.handlers.set(name, callback); }
    emit(name) { return this.handlers.get(name)?.({ preventDefault() {} }); }
    reportValidity() { return true; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    replaceChildren() { this.cleared = true; }
}
function formFixture(service) {
    const ids = ['vault-auth-form', 'vault-email', 'vault-password', 'btn-vault-submit', 'tab-login', 'tab-signup', 'vault-auth-error', 'vault-auth-success', 'vault-password-hint', 'btn-close-cloud-vault'];
    const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
    const captcha = { reset() {}, getToken() { return 'captcha-token'; } };
    let authenticated = 0;
    initVaultAuthForm({ document: { getElementById: id => elements[id] }, service, captcha, onAuthenticated: () => { authenticated++; } });
    elements['vault-email'].value = 'person@example.com';
    elements['vault-password'].value = secret;
    return { elements, getAuthenticated: () => authenticated };
}

test('a pending form prevents duplicate requests and mode changes; success clears password', async () => {
    let resolve, calls = 0;
    const { elements, getAuthenticated } = formFixture({ signIn: () => {
        calls++;
        return new Promise(done => { resolve = done; });
    } });
    const first = elements['vault-auth-form'].emit('submit');
    await elements['vault-auth-form'].emit('submit');
    elements['tab-signup'].emit('click');
    assert.equal(calls, 1);
    assert.equal(elements['vault-password'].autocomplete, 'current-password');
    assert.equal(elements['btn-vault-submit'].disabled, true);
    resolve({ session: { user: { id: 'a' } } });
    await first;
    assert.equal(getAuthenticated(), 1);
    assert.equal(elements['vault-password'].value, '');
    assert.equal(elements['btn-vault-submit'].disabled, false);
});

test('signup without a session never claims the vault exists; failures clear password and hide account status', async () => {
    const { elements, getAuthenticated } = formFixture({ signUp: async () => ({ session: null }), signIn: async () => { throw { code: 'email_not_confirmed', message: 'Account exists' }; } });
    elements['tab-signup'].emit('click');
    assert.equal(elements['vault-password'].autocomplete, 'new-password');
    assert.equal(elements['vault-password'].minLength, 12);
    elements['vault-password'].value = secret;
    await elements['vault-auth-form'].emit('submit');
    assert.equal(elements['vault-auth-success'].textContent, SIGNUP_NOTICE);
    assert.equal(getAuthenticated(), 0);
    elements['tab-login'].emit('click');
    elements['vault-password'].value = secret;
    await elements['vault-auth-form'].emit('submit');
    assert.equal(elements['vault-auth-error'].textContent, authErrorMessage({ code: 'invalid_credentials' }));
    assert.equal(elements['vault-password'].value, '');
    elements['vault-password'].value = secret;
    elements['btn-close-cloud-vault'].emit('click');
    assert.equal(elements['vault-password'].value, '');
});

test('identity changes clear private state before one reload; token refresh and initial restored session do not reload', () => {
    for (const nextId of [null, 'b']) {
        const effects = [];
        let notify;
        initVaultSessionBoundary({ onAuthStateChange(callback) { notify = callback; } }, {
            clearPrivateState: () => effects.push('clear'), reload: () => effects.push('reload')
        });
        notify('INITIAL_SESSION', { user: { id: 'a' } });
        notify('SIGNED_IN', { user: { id: 'a' } });
        notify('TOKEN_REFRESHED', { user: { id: 'a' } });
        assert.deepEqual(effects, []);
        const session = nextId ? { user: { id: nextId } } : null;
        notify(nextId ? 'SIGNED_IN' : 'SIGNED_OUT', session);
        notify('SIGNED_OUT', null);
        assert.deepEqual(effects, ['clear', 'reload']);
    }
});

test('logout cleanup stops audio and clears library caches without deleting unrelated browser data', () => {
    const elements = Object.fromEntries(['audio-player', 'home-song-grid', 'edit-song-grid', 'edit-library-view'].map(id => [id, new Element()]));
    const audio = elements['audio-player'];
    const effects = [];
    audio.pause = () => effects.push('pause');
    audio.load = () => effects.push('load');
    audio.setAttribute('src', 'https://private.example/signed-audio');
    const removed = [];
    clearVaultBrowserState({ getElementById: id => elements[id] }, { removeItem: key => removed.push(key) });
    assert.deepEqual(effects, ['pause', 'load']);
    assert.equal(audio.attributes.has('src'), false);
    assert.equal(elements['home-song-grid'].cleared, true);
    assert.deepEqual(removed, ['wavr_vinyl_boxes', 'wavr_library_order']);
});

test('CAPTCHA rejects missing, expired and consumed tokens and reuses one widget', async t => {
    const originalWindow = globalThis.window;
    let callbacks, renders = 0, resets = 0;
    globalThis.window = { turnstile: { render(container, options) { callbacks = options; renders++; return 'widget'; }, reset() { resets++; } } };
    t.after(() => { globalThis.window = originalWindow; });
    const captcha = createVaultCaptcha(new Element(), 'public-site-key');
    assert.throws(() => captcha.getToken(), { code: 'captcha_required' });
    await Promise.all([captcha.mount(), captcha.mount()]);
    assert.equal(renders, 1);
    callbacks.callback('valid-token');
    assert.equal(captcha.getToken(), 'valid-token');
    callbacks['expired-callback']();
    assert.throws(() => captcha.getToken(), { code: 'captcha_required' });
    callbacks.callback('next-token');
    captcha.reset();
    assert.equal(resets, 1);
    assert.throws(() => captcha.getToken(), { code: 'captcha_required' });
});
