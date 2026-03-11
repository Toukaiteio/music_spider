// frontend/pages/AuthManagerPage.js

import UIManager from '../modules/UIManager.js';

const SOURCE_ICONS = {
  bilibili: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/></svg>`,
  soundcloud: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M1.175 12.225C.513 12.225 0 12.75 0 13.413v.013c0 .663.513 1.188 1.175 1.188.663 0 1.176-.525 1.176-1.188v-.013c0-.663-.513-1.188-1.176-1.188zm2.213 1.025c-.013-.65-.525-1.175-1.187-1.175-.65 0-1.176.525-1.188 1.175v1.188c0 .65.526 1.175 1.188 1.175.662 0 1.187-.525 1.187-1.175v-1.188zm2.2-2.75c-.013-.65-.526-1.175-1.188-1.175-.65 0-1.175.525-1.188 1.175v3.938c0 .65.525 1.175 1.188 1.175.662 0 1.187-.525 1.187-1.175V10.5zm2.2-1.25c-.013-.65-.525-1.175-1.188-1.175-.65 0-1.175.525-1.187 1.175v5.188c0 .65.525 1.175 1.187 1.175.663 0 1.188-.525 1.188-1.175V9.25zm2.2-.7c-.013-.65-.526-1.175-1.188-1.175-.662 0-1.187.525-1.187 1.175v5.888c0 .65.525 1.175 1.187 1.175.662 0 1.188-.525 1.188-1.175V8.55zm3.362-3.525c-1.025 0-1.988.338-2.763.9-.35-2.1-2.175-3.7-4.375-3.7-2.45 0-4.438 1.988-4.438 4.438 0 .175.013.35.038.513C1.3 7.438.163 8.688.163 10.2c0 1.663 1.35 3.013 3.012 3.013h.013V9.25c0-.65.525-1.175 1.187-1.175.663 0 1.188.525 1.188 1.175v5.888c0 .65-.525 1.175-1.188 1.175-.662 0-1.187-.525-1.187-1.175V13.7h-.013C1.35 13.7 0 12.35 0 10.688c0-1.45 1.012-2.663 2.375-2.962-.013-.163-.025-.325-.025-.488C2.35 4.8 4.15 3 6.387 3c1.7 0 3.175 1 3.863 2.45.525-.25 1.112-.4 1.737-.4C13.863 5.05 15.5 6.7 15.5 8.712c0 .375-.063.738-.163 1.076C16.625 10.188 17.5 11.25 17.5 12.5c0 1.613-1.313 2.913-2.938 2.913H10.7V8.55c0-.65-.525-1.175-1.188-1.175-.662 0-1.187.525-1.187 1.175v6.863h6.237C16.988 15.413 18.5 13.9 18.5 12.063c0-1.625-1.1-3-2.65-3.4.063-.363.1-.737.1-1.113 0-2.475-2-4.475-4.5-4.475z"/></svg>`,
};

class AuthManagerPage {
  constructor() {
    this.managers = null;
    this.pollingIntervals = {};
  }

  init(appState, managers) {
    this.managers = managers;
  }

  getHTML() {
    return `
      <div id="auth-manager-page">
        <h2>Authorization Manager</h2>
        <div id="auth-sources-container" class="form-columns-wrapper">
          <div style="text-align: center; color: rgba(255,255,255,0.3); width: 100%; padding: 60px 0;">
            <span class="material-icons" style="font-size: 28px; animation: spin 1.2s infinite linear; display: block; margin: 0 auto 12px;">sync</span>
            Loading...
          </div>
        </div>
      </div>
    `;
  }

  async onLoad(containerElement, subPageId, appState, managers) {
    this.managers = managers;
    this.container = containerElement;
    await this.loadAuthStatuses();
  }

  onUnload() {
    for (const source in this.pollingIntervals) {
      clearInterval(this.pollingIntervals[source]);
    }
    this.pollingIntervals = {};
  }

  async loadAuthStatuses() {
    try {
      const response = await this.managers.webSocketManager.sendWebSocketCommand('get_all_auth_status', {});
      const statuses = response.data?.statuses || [];
      this.renderSources(statuses);
    } catch (error) {
      console.error("Failed to load auth statuses", error);
      UIManager.showToast("Failed to load authorization statuses", "error");
    }
  }

  renderSources(statuses) {
    const container = this.container.querySelector('#auth-sources-container');
    if (!container) return;

    container.innerHTML = '';

    if (statuses.length === 0) {
      container.innerHTML = `<p style="color: rgba(255,255,255,0.3); padding: 40px 0;">No authorization sources are currently enabled.</p>`;
      return;
    }

    statuses.forEach(status => {
      const section = document.createElement('div');
      section.className = 'form-section auth-source-section';
      section.style.cssText = `flex: 1; min-width: 280px; max-width: 480px;`;

      const sourceName = status.source.charAt(0).toUpperCase() + status.source.slice(1);
      const icon = SOURCE_ICONS[status.source] || `<span class="material-icons" style="font-size:28px;">cloud</span>`;

      // Header row: icon + name on left, status badge on right
      const headerRow = document.createElement('div');
      headerRow.style.cssText = `display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.07);`;

      const headerLeft = document.createElement('div');
      headerLeft.style.cssText = `display: flex; align-items: center; gap: 12px;`;
      headerLeft.innerHTML = `
        <div style="color: rgba(255,255,255,0.55);">${icon}</div>
        <span style="font-size: 1.05em; font-weight: 600; color: var(--text-color-primary);">${sourceName}</span>
      `;

      const badge = document.createElement('span');
      if (status.is_logged_in) {
        badge.textContent = 'Authorized';
        badge.style.cssText = `padding: 3px 10px; border-radius: 20px; font-size: 0.72em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; background: rgba(52,199,89,0.13); color: #34C759; border: 1px solid rgba(52,199,89,0.20);`;
      } else {
        badge.textContent = 'Not Authorized';
        badge.style.cssText = `padding: 3px 10px; border-radius: 20px; font-size: 0.72em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; background: rgba(255,59,48,0.10); color: rgba(255,100,90,0.85); border: 1px solid rgba(255,59,48,0.18);`;
      }

      headerRow.appendChild(headerLeft);
      headerRow.appendChild(badge);
      section.appendChild(headerRow);

      // Content + action row: info text on left, button(s) on right — side by side
      const bodyRow = document.createElement('div');
      bodyRow.style.cssText = `display: flex; align-items: center; justify-content: space-between; gap: 16px;`;

      const contentArea = document.createElement('div');
      contentArea.className = `auth-content-${status.source}`;
      contentArea.style.cssText = `flex: 1; min-width: 0;`;

      const actionArea = document.createElement('div');
      actionArea.className = 'form-actions';
      actionArea.style.cssText = `flex-basis: auto !important; flex-shrink: 0; display: flex; gap: 8px; align-items: center; padding: 0; border: none; margin: 0;`;

      this._renderIdleState(status, contentArea, actionArea);

      bodyRow.appendChild(contentArea);
      bodyRow.appendChild(actionArea);
      section.appendChild(bodyRow);

      container.appendChild(section);
    });
  }

  _renderIdleState(status, contentArea, actionArea) {
    if (status.is_logged_in) {
      contentArea.innerHTML = `<p style="font-size: 0.88em; color: rgba(255,255,255,0.38); margin: 0; line-height: 1.5;">Session active. You can access all features for this source.</p>`;
      actionArea.innerHTML = '';
      const logoutBtn = document.createElement('button');
      logoutBtn.className = 'dialog-button secondary';
      logoutBtn.textContent = 'Logout';
      logoutBtn.onclick = () => this.handleLogout(status.source);
      actionArea.appendChild(logoutBtn);
    } else {
      contentArea.innerHTML = `<p style="font-size: 0.88em; color: rgba(255,255,255,0.38); margin: 0; line-height: 1.5;">Authorization required to download from this source.</p>`;
      actionArea.innerHTML = '';
      const loginBtn = document.createElement('button');
      loginBtn.className = 'dialog-button primary';
      loginBtn.textContent = 'Authorize';
      loginBtn.onclick = () => this.handleLoginInit(status.source, contentArea, actionArea);
      actionArea.appendChild(loginBtn);
    }
  }

  async handleLogout(source) {
    try {
      const resp = await this.managers.webSocketManager.sendWebSocketCommand('logout', { source });
      if (resp.code === 0) {
        UIManager.showToast(`Logged out from ${source}`, "success");
        await this.loadAuthStatuses();
      } else {
        UIManager.showToast(`Logout failed: ${resp.error}`, "error");
      }
    } catch (err) {
      UIManager.showToast(`Error: ${err.message}`, "error");
    }
  }

  async handleLoginInit(source, contentArea, actionArea) {
    try {
      actionArea.innerHTML = `<span class="material-icons" style="animation: spin 1.2s infinite linear; color: rgba(255,255,255,0.4); font-size: 20px;">sync</span>`;
      const resp = await this.managers.webSocketManager.sendWebSocketCommand('get_auth_action', { source });

      if (resp.code !== 0) {
        UIManager.showToast(`Failed: ${resp.error}`, "error");
        await this.loadAuthStatuses();
        return;
      }

      const data = resp.data;
      if (data.type === 'qrcode') {
        this.renderQRCodeLogin(source, data, contentArea, actionArea);
      } else if (data.type === 'manual') {
        this.renderManualLogin(source, data, contentArea, actionArea);
      }
    } catch (error) {
      UIManager.showToast(`Error: ${error.message}`, "error");
      await this.loadAuthStatuses();
    }
  }

  renderQRCodeLogin(source, data, contentArea, actionArea) {
    // Switch to a vertical stacked layout for QR code
    const bodyRow = contentArea.parentElement;
    bodyRow.style.flexDirection = 'column';
    bodyRow.style.alignItems = 'flex-start';

    contentArea.style.width = '100%';
    contentArea.innerHTML = `
      <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
        <div style="background: #fff; padding: 8px; border-radius: 10px; display: inline-block; flex-shrink: 0;">
          <img src="${data.qrcode_base64}" alt="QR Code" style="width: 110px; height: 110px; display: block;">
        </div>
        <div>
          <p style="font-size: 0.88em; color: rgba(255,255,255,0.55); margin: 0 0 8px 0;">Scan with the official app to login.</p>
          <p class="qr-status-text" style="font-size: 0.82em; color: rgba(255,255,255,0.35); margin: 0;">Waiting for scan...</p>
        </div>
      </div>
    `;

    actionArea.innerHTML = '';
    actionArea.style.cssText = `flex-shrink: 0; display: flex; gap: 8px; align-items: center; width: 100%; justify-content: flex-end; margin-top: 14px;`;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dialog-button secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
      clearInterval(this.pollingIntervals[source]);
      this.loadAuthStatuses();
    };
    actionArea.appendChild(cancelBtn);

    const statusText = contentArea.querySelector('.qr-status-text');

    if (this.pollingIntervals[source]) clearInterval(this.pollingIntervals[source]);

    this.pollingIntervals[source] = setInterval(async () => {
      try {
        const pollResp = await this.managers.webSocketManager.sendWebSocketCommand('poll_auth_status', {
          source,
          params: { qrcode_key: data.qrcode_key }
        });

        if (pollResp.code === 0) {
          const pollData = pollResp.data;
          if (statusText) statusText.textContent = pollData.message;

          if (pollData.status === 'success') {
            clearInterval(this.pollingIntervals[source]);
            UIManager.showToast(`${source} authorized`, 'success');
            await this.loadAuthStatuses();
          } else if (['expired', 'failed', 'error'].includes(pollData.status)) {
            clearInterval(this.pollingIntervals[source]);
            if (statusText) { statusText.style.color = 'rgba(255,90,80,0.85)'; }
            cancelBtn.textContent = 'Retry';
          }
        }
      } catch (err) { console.error(err); }
    }, 3000);
  }

  renderManualLogin(source, data, contentArea, actionArea) {
    // Switch to vertical layout for the form
    const bodyRow = contentArea.parentElement;
    bodyRow.style.flexDirection = 'column';
    bodyRow.style.alignItems = 'stretch';

    const fieldsHtml = data.fields.map(field => `
      <div style="margin-bottom: 14px;">
        <label>${field.label}</label>
        <input type="${field.type}" name="${field.name}" placeholder="Required">
      </div>
    `).join('');

    contentArea.style.width = '100%';
    contentArea.innerHTML = `<form id="form-${source}">${fieldsHtml}</form>`;

    actionArea.innerHTML = '';
    actionArea.style.cssText = `display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-top: 4px; width: 100%;`;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dialog-button secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => this.loadAuthStatuses();

    const submitBtn = document.createElement('button');
    submitBtn.className = 'dialog-button primary';
    submitBtn.textContent = 'Submit';

    submitBtn.onclick = async () => {
      const form = contentArea.querySelector(`#form-${source}`);
      const params = {};
      new FormData(form).forEach((v, k) => { params[k] = v; });

      submitBtn.disabled = true;
      submitBtn.textContent = '...';

      try {
        const resp = await this.managers.webSocketManager.sendWebSocketCommand('login_with_params', { source, params });
        if (resp.code === 0) {
          UIManager.showToast(`${source} authorized`, 'success');
          await this.loadAuthStatuses();
        } else {
          UIManager.showToast(resp.error, 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit';
        }
      } catch (err) {
        UIManager.showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }
    };

    actionArea.appendChild(cancelBtn);
    actionArea.appendChild(submitBtn);
  }
}

export default AuthManagerPage;
