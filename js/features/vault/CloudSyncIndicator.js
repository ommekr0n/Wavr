/**
 * CloudSyncIndicator.js
 * Real-time visual status indicator for Cloud Vault connection & sync states.
 */

import { SupabaseService } from '../../services/SupabaseService.js';

let currentSyncState = 'local'; // 'local' | 'synced' | 'syncing' | 'offline'

export const CloudSyncIndicator = {
    getState() {
        return currentSyncState;
    },

    setState(state) {
        currentSyncState = state;
        this.updateUI();
    },

    async updateUI() {
        const homeBtn = document.getElementById('btn-cloud-vault-home');
        const playerBtn = document.getElementById('btn-auth-vault');

        const isConfigured = SupabaseService.isConfigured();
        const user = isConfigured ? await SupabaseService.getCurrentUser().catch(() => null) : null;

        if (!isConfigured || !user) {
            currentSyncState = 'local';
        }

        const stateConfig = {
            synced: {
                dotColor: '#00e5ff',
                text: '☁️ Cloud Synced',
                title: user ? `Connected as ${user.email} (All tracks synced)` : 'Cloud Vault Synced',
                pulse: false
            },
            syncing: {
                dotColor: '#ffb703',
                text: '🔄 Syncing...',
                title: 'Syncing changes with Cloud Vault...',
                pulse: true
            },
            offline: {
                dotColor: '#ef5350',
                text: '⚠️ Offline',
                title: 'Disconnected from Cloud Vault. Working locally.',
                pulse: false
            },
            local: {
                dotColor: 'rgba(255,255,255,0.4)',
                text: 'Log In / Sign Up',
                title: 'Sign In to sync your library across devices',
                pulse: false
            }
        };

        const config = stateConfig[currentSyncState] || stateConfig.local;

        if (homeBtn) {
            const btnText = homeBtn.querySelector('.vault-btn-text');
            if (btnText) {
                btnText.textContent = config.text;
            }
            homeBtn.title = config.title;

            let dot = homeBtn.querySelector('.sync-status-dot');
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'sync-status-dot';
                homeBtn.prepend(dot);
            }
            dot.style.backgroundColor = config.dotColor;
            if (config.pulse) {
                dot.classList.add('sync-dot-pulse');
            } else {
                dot.classList.remove('sync-dot-pulse');
            }
        }

        if (playerBtn) {
            playerBtn.title = config.title;
            let dot = playerBtn.querySelector('.sync-status-dot');
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'sync-status-dot mini';
                playerBtn.appendChild(dot);
            }
            dot.style.backgroundColor = config.dotColor;
            if (config.pulse) {
                dot.classList.add('sync-dot-pulse');
            } else {
                dot.classList.remove('sync-dot-pulse');
            }
        }
    },

    init() {
        this.updateUI();

        window.addEventListener('online', () => {
            this.setState('synced');
        });

        window.addEventListener('offline', () => {
            this.setState('offline');
        });

        document.addEventListener('wavr:syncStatusChange', (e) => {
            if (e.detail?.state) {
                this.setState(e.detail.state);
            }
        });
    }
};
