export const SIGNUP_PASSWORD_MIN_LENGTH = 12;
export const SIGNUP_NOTICE = 'If this email is eligible, your registration has been received. Check your inbox if confirmation is required, then log in.';

export class VaultAuthError extends Error {
    constructor(code) { super(code); this.code = code; }
}

export function validateCredentials(email, password, signup = false) {
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new VaultAuthError('invalid_email_input');
    }
    if (typeof password !== 'string' || !password.length || password.length > 1024) {
        throw new VaultAuthError('invalid_password_input');
    }
    if (signup && [...password].length < SIGNUP_PASSWORD_MIN_LENGTH) {
        throw new VaultAuthError('weak_password_input');
    }
    return { email: normalizedEmail, password };
}

// Never display Auth server messages: they can disclose account existence/confirmation.
export function authErrorMessage(error) {
    switch (error?.code) {
        case 'invalid_email_input': return 'Enter a valid email address.';
        case 'invalid_password_input': return 'Enter a password of no more than 1024 characters.';
        case 'weak_password_input': return 'Use at least 12 characters for your new password.';
        case 'weak_password': return 'Choose a stronger password that meets the security requirements.';
        case 'over_request_rate_limit':
        case 'over_email_send_rate_limit': return 'Too many attempts. Please wait before trying again.';
        case 'captcha_failed':
        case 'captcha_required': return 'Complete the security check and try again.';
        default: return 'Unable to authenticate. Check your credentials or try again later.';
    }
}
