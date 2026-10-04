/**
 * CloudVaultUI.js
 * Modular UI handler for Personal Cloud Vault Auth & Cloud Sync Modal.
 */
import { SupabaseService } from '../../services/SupabaseService.js';
import { CloudSyncIndicator } from './CloudSyncIndicator.js';
import { createVaultCaptcha } from './VaultCaptcha.js';
import { initVaultAuthForm } from './VaultAuthForm.js';

export function initCloudVaultUI(showToast) {
    const btnAuthVault = document.getElementById('btn-auth-vault');
    const modalCloudVault = document.getElementById('modal-cloud-vault');
    const btnCloseCloudVault = document.getElementById('btn-close-cloud-vault');
    const vaultAuthError = document.getElementById('vault-auth-error');
    const vaultAuthSection = document.getElementById('vault-auth-section');
    const vaultStatusSection = document.getElementById('vault-status-section');
    const vaultUserEmail = document.getElementById('vault-user-email');
    const vaultTrackCount = document.getElementById('vault-track-count');
    const btnVaultLogout = document.getElementById('btn-vault-logout');
    const btnSyncCloudTracks = document.getElementById('btn-sync-cloud-tracks');

    if (!modalCloudVault) return;

    let uiRevision = 0;
    const captcha = createVaultCaptcha(document.getElementById('vault-captcha'), import.meta.env.VITE_TURNSTILE_SITE_KEY);

    async function updateVaultUIState() {
        const revision = ++uiRevision;
        if (!SupabaseService.isConfigured()) {
            if (vaultAuthError) {
                vaultAuthError.textContent = 'Cloud Vault is temporarily unavailable.';
                vaultAuthError.classList.remove('hidden');
            }
            return;
        }

        try {
            const user = await SupabaseService.getCurrentUser();
            if (revision !== uiRevision) return;
            const homeVaultText = document.querySelector('#btn-cloud-vault-home .vault-btn-text');
            if (user) {
                if (vaultAuthSection) vaultAuthSection.classList.add('hidden');
                if (vaultStatusSection) vaultStatusSection.classList.remove('hidden');
                if (vaultUserEmail) vaultUserEmail.textContent = user.email;
                const tracks = await SupabaseService.fetchUserTracks();
                if (revision !== uiRevision) return;
                if (vaultTrackCount) vaultTrackCount.textContent = tracks.length;
                if (homeVaultText) homeVaultText.textContent = '☁️ Cloud Vault';
                if (btnAuthVault) btnAuthVault.title = `Cloud Vault (${user.email})`;
            } else {
                if (vaultAuthSection) vaultAuthSection.classList.remove('hidden');
                if (vaultStatusSection) vaultStatusSection.classList.add('hidden');
                if (vaultUserEmail) vaultUserEmail.textContent = '';
                if (vaultTrackCount) vaultTrackCount.textContent = '0';
                if (homeVaultText) homeVaultText.textContent = 'Log In / Sign Up';
                if (btnAuthVault) btnAuthVault.title = 'Log In / Sign Up to Personal Cloud Vault';
            }
            await CloudSyncIndicator.updateUI();
        } catch (err) {
            console.warn('Vault UI update failed.');
        }
    }

    const openVaultModal = () => {
        if (modalCloudVault) {
            modalCloudVault.classList.remove('hidden');
            updateVaultUIState();
            captcha.mount().catch(() => {
                vaultAuthError.textContent = 'Security check unavailable. Reopen the vault to try again.';
                vaultAuthError.classList.remove('hidden');
            });
        }
    };

    // One delegated listener also handles dynamically rendered vault buttons.
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

    initVaultAuthForm({ service: SupabaseService, captcha, onAuthenticated: updateVaultUIState });

    if (btnVaultLogout) {
        btnVaultLogout.addEventListener('click', async () => {
            if (btnVaultLogout.disabled) return;
            btnVaultLogout.disabled = true;
            try {
                await SupabaseService.signOut();
                await updateVaultUIState();
            } catch {
                if (showToast) showToast('Unable to sign out. Please try again.', 'error');
            } finally {
                btnVaultLogout.disabled = false;
            }
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
