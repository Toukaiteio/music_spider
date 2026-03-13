// frontend/pages/AuthManagerPage.js - Version 1.3

import UIManager from '../modules/UIManager.js';

const SOURCE_ICONS = {
  bilibili: '<img src="source_icon/bilibili.ico" width="28" height="28" alt="bilibili">',
  netease: '<img src="source_icon/netease.ico" width="28" height="28" alt="netease">',
  kugou: '<img src="source_icon/kugou.ico" width="28" height="28" alt="kugou">',
  soundcloud: '<img src="source_icon/soundcloud.ico" width="28" height="28" alt="soundcloud">'
};

class AuthManagerPage {
  constructor() {
    this.managers = null;
    this.sources = [];
    this.pollingIntervals = {};
  }

  init(appState, managers) {
    this.managers = managers;
  }

  getHTML() {
    return `
      <div id="source-manager-page" class="page-container">
        <div class="page-header">
            <h2>Source Manager</h2>
            <p class="subtitle">Manage and toggle music sources</p>
        </div>

        <div class="source-manager-columns">
            <div class="source-column" id="enabled-column">
                <div class="column-header">
                    <span class="material-icons">check_circle</span>
                    <h3>Enabled Sources</h3>
                    <span class="count-badge" id="enabled-count">0</span>
                </div>
                <div class="source-list" id="enabled-list">
                    <!-- Enabled sources here -->
                </div>
            </div>

            <div class="source-column" id="disabled-column">
                <div class="column-header">
                    <span class="material-icons">block</span>
                    <h3>Disabled Sources</h3>
                    <span class="count-badge" id="disabled-count">0</span>
                </div>
                <div class="source-list" id="disabled-list">
                    <!-- Disabled sources here -->
                </div>
            </div>
        </div>
      </div>
    `;
  }

  async onLoad(containerElement, subPageId, appState, managers) {
    this.managers = managers;
    this.container = containerElement;
    await this.loadSourceStatuses();
  }

  onUnload() {
    for (const source in this.pollingIntervals) {
      clearInterval(this.pollingIntervals[source]);
    }
    this.pollingIntervals = {};
  }

  async loadSourceStatuses() {
    try {
      const response = await this.managers.webSocketManager.sendWebSocketCommand('get_all_auth_status', {});
      this.sources = response.data?.statuses || [];
      this.renderSources();
    } catch (error) {
      console.error("[AuthManager] Failed to load source statuses", error);
      UIManager.showToast("Failed to load sources", "error");
    }
  }

  renderSources() {
    const enabledList = this.container.querySelector('#enabled-list');
    const disabledList = this.container.querySelector('#disabled-list');
    const enabledCount = this.container.querySelector('#enabled-count');
    const disabledCount = this.container.querySelector('#disabled-count');

    if (!enabledList || !disabledList) return;

    enabledList.innerHTML = '';
    disabledList.innerHTML = '';

    const enabledSources = this.sources.filter(s => s.enabled);
    const disabledSources = this.sources.filter(s => !s.enabled);

    enabledCount.textContent = enabledSources.length;
    disabledCount.textContent = disabledSources.length;

    enabledSources.forEach(source => {
        enabledList.appendChild(this.createSourceItem(source, true));
    });

    disabledSources.forEach(source => {
        disabledList.appendChild(this.createSourceItem(source, false));
    });
  }

  createSourceItem(source, isEnabled) {
    const item = document.createElement('div');
    const isLoggedIn = source.is_logged_in === true || source.is_logged_in === "true";
    item.className = `source-card ${isLoggedIn ? 'authorized' : 'unauth'}`;
    item.id = `source-card-${source.source}`;
    
    const sourceIcon = SOURCE_ICONS[source.source] || '<span class="material-icons">cloud</span>';
    const statusText = isLoggedIn ? 'Authorized' : 'Unauthorized';

    item.innerHTML = `
        <div class="source-main-row">
            <div class="source-item-left">
                <div class="source-item-icon">${sourceIcon}</div>
                <div class="source-item-info">
                    <span class="source-item-name">${source.source.charAt(0).toUpperCase() + source.source.slice(1)}</span>
                    <div style="display: flex; gap: 6px;">
                        <span class="source-status-pill ${isLoggedIn ? 'pill-green' : 'pill-red'}">${statusText}</span>
                        ${!isLoggedIn && (source.require_auth_to_enable === true || source.require_auth_to_enable === "true") ? '<span class="source-status-pill pill-orange">Require Authorization</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="source-item-actions">
                ${isLoggedIn ? 
                    ((source.require_auth_to_enable === true || source.require_auth_to_enable === "true") && isEnabled ? 
                        `<button class="text-button btn-logout-action action-button-disabled" disabled title="请先在右侧禁用此源后再登出">Logout</button>` :
                        `<button class="text-button btn-logout-action">Logout</button>`
                    ) :
                    `<button class="text-button btn-login-action">Login</button>`
                }
                <button class="btn-move-circle" title="${isEnabled ? 'Disable' : 'Enable'}">
                    <span class="material-icons">${isEnabled ? 'chevron_right' : 'chevron_left'}</span>
                </button>
            </div>
        </div>
        <div class="source-auth-expansion" id="expansion-${source.source}">
            <div class="expansion-content"></div>
        </div>
    `;

    const moveBtn = item.querySelector('.btn-move-circle');
    moveBtn.onclick = (e) => {
        e.stopPropagation();
        this.handleToggleSource(source.source, !isEnabled);
    };

    const loginBtn = item.querySelector('.btn-login-action');
    if (loginBtn) {
        loginBtn.onclick = (e) => {
            e.stopPropagation();
            this.handleLogin(source.source);
        };
    }

    const logoutBtn = item.querySelector('.btn-logout-action');
    if (logoutBtn) {
        logoutBtn.onclick = (e) => {
            e.stopPropagation();
            this.showCustomConfirm(`Logout from ${source.source}?`, () => this.handleLogout(source.source));
        };
    }

    return item;
  }

  async handleToggleSource(source, enabled) {
    const cmd = enabled ? 'enable_source' : 'disable_source';
    try {
      const resp = await this.managers.webSocketManager.sendWebSocketCommand(cmd, { source });
      if (resp.code === 0) {
        UIManager.showToast(`${source} ${enabled ? 'enabled' : 'disabled'}`, "success");
        await this.loadSourceStatuses();
      } else {
        UIManager.showToast(resp.error || "Action failed", "error");
      }
    } catch (err) {
      UIManager.showToast(err.message, "error");
    }
  }

  async handleLogin(source) {
    const expansion = this.container.querySelector(`#expansion-${source}`);
    const content = expansion.querySelector('.expansion-content');
    
    // Toggle if already open
    if (expansion.classList.contains('expanded')) {
        expansion.classList.remove('expanded');
        return;
    }

    try {
        const resp = await this.managers.webSocketManager.sendWebSocketCommand('get_auth_action', { source });
        if (resp.code !== 0) {
            UIManager.showToast(resp.error, "error");
            return;
        }
        
        const data = resp.data;
        content.innerHTML = '';
        
        if (data.type === 'qrcode') {
            this.renderQRInExpansion(source, data, content);
        } else if (data.type === 'manual') {
            this.renderManualInExpansion(source, data, content);
        }
        
        expansion.classList.add('expanded');
    } catch (error) {
        UIManager.showToast("Login failed: " + error.message, "error");
    }
  }

  renderQRInExpansion(source, action, container) {
    container.innerHTML = `
        <div class="qr-expansion-wrapper">
            <div class="qr-frame">
                <img src="${action.qrcode_base64}" alt="QR Code">
            </div>
            <div class="qr-info">
                <p>Scan with ${source.toUpperCase()} App</p>
                <div id="qr-status-${source}" class="qr-status-text">Waiting for scan...</div>
                <button class="text-button btn-auth-cancel" style="margin-top: 15px;">Cancel</button>
            </div>
        </div>
    `;

    container.querySelector('.btn-auth-cancel').onclick = () => {
        this.container.querySelector(`#expansion-${source}`).classList.remove('expanded');
    };

    if (this.pollingIntervals[source]) clearInterval(this.pollingIntervals[source]);

    this.pollingIntervals[source] = setInterval(async () => {
        const expansion = this.container.querySelector(`#expansion-${source}`);
        if (!expansion || !expansion.classList.contains('expanded')) {
            clearInterval(this.pollingIntervals[source]);
            return;
        }

        try {
            const pollResp = await this.managers.webSocketManager.sendWebSocketCommand('poll_auth_status', {
                source,
                params: { qrcode_key: action.qrcode_key }
            });
            
            const statusEl = container.querySelector(`#qr-status-${source}`);
            if (pollResp.code === 0) {
                const status = pollResp.data;
                if (status.status === 'success') {
                    statusEl.innerText = "Login successful!";
                    statusEl.style.color = "#34C759";
                    clearInterval(this.pollingIntervals[source]);
                    setTimeout(() => {
                        expansion.classList.remove('expanded');
                        this.loadSourceStatuses();
                    }, 1500);
                } else if (status.status === 'expired') {
                    statusEl.innerText = "QR Code expired. Refreshing...";
                    clearInterval(this.pollingIntervals[source]);
                    setTimeout(() => this.handleLogin(source), 2000);
                } else {
                    statusEl.innerText = status.message || "Waiting...";
                }
            }
        } catch (err) {
            console.error("Polling error:", err);
        }
    }, 3000);
  }

  renderManualInExpansion(source, action, container) {
    const fieldsHtml = action.fields.map(f => `
        <div class="auth-field">
            <label>${f.label}</label>
            <input type="${f.type}" class="login-input" data-name="${f.name}">
        </div>
    `).join('');

    container.innerHTML = `
        <div class="manual-expansion-wrapper">
            <div class="auth-fields-grid">${fieldsHtml}</div>
            <div class="auth-actions" style="gap: 12px;">
                <button class="text-button btn-auth-cancel">Cancel</button>
                <button class="dialog-button primary btn-auth-submit">Authorize</button>
            </div>
        </div>
    `;

    container.querySelector('.btn-auth-cancel').onclick = () => {
        this.container.querySelector(`#expansion-${source}`).classList.remove('expanded');
    };

    container.querySelector('.btn-auth-submit').onclick = async () => {
        const params = {};
        container.querySelectorAll('.login-input').forEach(input => {
            params[input.dataset.name] = input.value;
        });

        try {
            const resp = await this.managers.webSocketManager.sendWebSocketCommand('login_with_params', { source, params });
            if (resp.code === 0 && resp.data?.status === 'success') {
                UIManager.showToast("Authorized successfully", "success");
                this.container.querySelector(`#expansion-${source}`).classList.remove('expanded');
                this.loadSourceStatuses();
            } else {
                UIManager.showToast(resp.data?.message || resp.error || "Authorization failed", "error");
            }
        } catch (err) {
            UIManager.showToast(err.message, "error");
        }
    };
  }

  async handleLogout(source) {
    try {
        const resp = await this.managers.webSocketManager.sendWebSocketCommand('logout', { source });
        if (resp.code === 0) {
            UIManager.showToast(`Logged out from ${source}`, "success");
            await this.loadSourceStatuses();
        } else {
            UIManager.showToast(resp.error, "error");
        }
    } catch (err) {
        UIManager.showToast(err.message, "error");
    }
  }

  showCustomConfirm(message, onConfirm) {
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay visible';
    dialog.innerHTML = `
        <div class="dialog-box" style="max-width: 400px;">
            <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 25px;">
                <span class="material-icons" style="font-size: 32px; color: #FF3B30;">help_outline</span>
                <p style="margin: 0; font-size: 1.1em;">${message}</p>
            </div>
            <div class="dialog-actions" style="justify-content: flex-end; gap: 12px;">
                <button class="dialog-button secondary btn-cancel">Cancel</button>
                <button class="dialog-button primary btn-confirm" style="background: #FF3B30; border-color: #FF3B30;">Logout</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    const cleanup = () => {
        if (dialog.parentElement) document.body.removeChild(dialog);
    };

    dialog.querySelector('.btn-cancel').onclick = cleanup;
    dialog.querySelector('.btn-confirm').onclick = () => {
        onConfirm();
        cleanup();
    };
  }
}

export default AuthManagerPage;
