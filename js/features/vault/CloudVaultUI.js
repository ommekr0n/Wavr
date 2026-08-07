/**
 * CloudVaultUI.js
 * Modular UI handler for Personal Cloud Vault Auth & Cloud Sync Modal.
 */
import { SupabaseService } from '../../services/SupabaseService.js';

export function initCloudVaultUI(showToast) {
    const btnAuthVault = document.getElementById('btn-auth-vault');
    const btnCloudVaultHome = document.getElementById('btn-cloud-vault-home');
    const modalCloudVault = document.getElementById('modal-cloud-vault');
    const btnCloseCloudVault = document.getElementById('btn-close-cloud-vault');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const vaultAuthForm = document.getElementById('vault-auth-form');
    const vaultEmail = document.getElementById('vault-email');
    const vaultPassword = document.getElementById('vault-password');
    const vaultAuthError = document.getElementById('vault-auth-error');
    const vaultAuthSuccess = document.getElementById('vault-auth-success');
    const btnVaultSubmit = document.getElementById('btn-vault-submit');
    const vaultAuthSection = document.getElementById('vault-auth-section');
    const vaultStatusSection = document.getElementById('vault-status-section');
    const vaultUserEmail = document.getElementById('vault-user-email');
    const vaultTrackCount = document.getElementById('vault-track-count');
    const btnVaultLogout = document.getElementById('btn-vault-logout');
    const btnSyncCloudTracks = document.getElementById('btn-sync-cloud-tracks');

    if (!modalCloudVault) return;

    let isSignUpMode = false;

    async function updateVaultUIState() {
        if (!SupabaseService.isConfigured()) {
            if (vaultAuthError) {
                vaultAuthError.textContent = 'Supabase keys not detected in .env file.';
                vaultAuthError.classList.remove('hidden');
            }
            return;
        }

        try {
            const user = await SupabaseService.getCurrentUser();
            const homeVaultText = document.querySelector('#btn-cloud-vault-home .vault-btn-text');
            if (user) {
                if (vaultAuthSection) vaultAuthSection.classList.add('hidden');
                if (vaultStatusSection) vaultStatusSection.classList.remove('hidden');
                if (vaultUserEmail) vaultUserEmail.textContent = user.email;
                const tracks = await SupabaseService.fetchUserTracks();
                if (vaultTrackCount) vaultTrackCount.textContent = tracks.length;
                if (homeVaultText) homeVaultText.textContent = '☁️ Cloud Vault';
                if (btnAuthVault) btnAuthVault.title = `Cloud Vault (${user.email})`;
            } else {
                if (vaultAuthSection) vaultAuthSection.classList.remove('hidden');
                if (vaultStatusSection) vaultStatusSection.classList.add('hidden');
                if (homeVaultText) homeVaultText.textContent = 'Log In / Sign Up';
                if (btnAuthVault) btnAuthVault.title = 'Log In / Sign Up to Personal Cloud Vault';
            }
        } catch (err) {
            console.warn('Vault UI update error:', err);
        }
    }

    const openVaultModal = () => {
        if (modalCloudVault) {
            modalCloudVault.classList.remove('hidden');
            updateVaultUIState();
        }
    };

    // Direct event listeners
    if (btnAuthVault) btnAuthVault.addEventListener('click', openVaultModal);
    if (btnCloudVaultHome) btnCloudVaultHome.addEventListener('click', openVaultModal);

    // Global event delegation (fail-safe fallback)
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-cloud-vault-home') || e.target.closest('#btn-auth-vault') || e.target.closest('.vault-header-btn')) {
            openVaultModal();
        }
    });

    if (btnCloseCloudVault) {
        btnCloseCloudVault.addEventListener('click', () => {
            modalCloudVault.classList.add('hidden');
        });
    }

    if (tabLogin && tabSignup) {
        tabLogin.addEventListener('click', () => {
            isSignUpMode = false;
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            if (btnVaultSubmit) btnVaultSubmit.textContent = 'Log In to Vault';
            if (vaultAuthError) vaultAuthError.classList.add('hidden');
            if (vaultAuthSuccess) vaultAuthSuccess.classList.add('hidden');
        });

        tabSignup.addEventListener('click', () => {
            isSignUpMode = true;
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            if (btnVaultSubmit) btnVaultSubmit.textContent = 'Sign Up for Vault';
            if (vaultAuthError) vaultAuthError.classList.add('hidden');
            if (vaultAuthSuccess) vaultAuthSuccess.classList.add('hidden');
        });
    }

    if (vaultAuthForm) {
        vaultAuthForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (vaultAuthError) vaultAuthError.classList.add('hidden');
            if (vaultAuthSuccess) vaultAuthSuccess.classList.add('hidden');
            if (btnVaultSubmit) btnVaultSubmit.disabled = true;

            const email = vaultEmail ? vaultEmail.value.trim() : '';
            const password = vaultPassword ? vaultPassword.value : '';

            try {
                if (isSignUpMode) {
                    await SupabaseService.signUp(email, password);
                    if (vaultAuthSuccess) {
                        vaultAuthSuccess.textContent = 'Vault created! Check your email or sign in.';
                        vaultAuthSuccess.classList.remove('hidden');
                    }
                } else {
                    await SupabaseService.signIn(email, password);
                    if (vaultAuthSuccess) {
                        vaultAuthSuccess.textContent = 'Vault connected successfully!';
                        vaultAuthSuccess.classList.remove('hidden');
                    }
                    setTimeout(() => updateVaultUIState(), 600);
                }
            } catch (err) {
                if (vaultAuthError) {
                    vaultAuthError.textContent = err.message || 'Authentication failed.';
                    vaultAuthError.classList.remove('hidden');
                }
            } finally {
                if (btnVaultSubmit) btnVaultSubmit.disabled = false;
            }
        });
    }

    if (btnVaultLogout) {
        btnVaultLogout.addEventListener('click', async () => {
            await SupabaseService.signOut();
            updateVaultUIState();
        });
    }

    if (btnSyncCloudTracks) {
        btnSyncCloudTracks.addEventListener('click', async () => {
            btnSyncCloudTracks.disabled = true;
            btnSyncCloudTracks.textContent = 'Syncing...';
            try {
                const tracks = await SupabaseService.fetchUserTracks();
                if (vaultTrackCount) vaultTrackCount.textContent = tracks.length;
                if (showToast) showToast(`Synced ${tracks.length} private cloud tracks!`, 'info');
            } catch (err) {
                if (showToast) showToast('Failed to sync cloud tracks.', 'error');
            } finally {
                btnSyncCloudTracks.disabled = false;
                btnSyncCloudTracks.textContent = '🔄 Sync Cloud Tracks';
            }
        });
    }

    SupabaseService.onAuthStateChange(() => {
        updateVaultUIState();
    });
}
