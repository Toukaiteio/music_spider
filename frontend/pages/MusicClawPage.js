// frontend/pages/MusicClawPage.js

class MusicClawPage {
    constructor() {
        this.appState = null;
        this.managers = null;
        this.messages = [];
        this.sessionId = null;
        this.isLoading = false;
        // Pending tool call cards: tool_call_id -> DOM element
        this._pendingToolCards = {};
        this._currentStreamingMsg = null;
        this._currentStreamingEl = null;
        this._thinkingRotationTimer = null;
        this._lastThinkingDisplay = "";
        this._downloadedIds = new Set();
        
        this._restoreSession();
    }

    _restoreSession() {
        try {
            const saved = sessionStorage.getItem('music_claw_session');
            if (saved) {
                const data = JSON.parse(saved);
                this.sessionId = data.sessionId;
                this.messages = data.messages || [];
            }
        } catch (e) {
            console.warn("Failed to restore Music Claw session", e);
        }
        if (!this.sessionId) {
            this.sessionId = `session_${Date.now()}`;
        }
    }

    _saveSession() {
        try {
            sessionStorage.setItem('music_claw_session', JSON.stringify({
                sessionId: this.sessionId,
                messages: this.messages
            }));
        } catch (e) {
            console.error("Failed to save Music Claw session", e);
        }
    }

    init(appState, managers) {
        this.appState = appState;
        this.managers = managers;
    }

    getHTML() {
        return `
            <style>
                #claw-settings-modal {
                    background: rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                }
                .claw-settings-content {
                    width: 760px !important;
                    height: 600px !important;
                    background: rgba(30,30,34, 0.95) !important;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(30px);
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
                }
                .claw-settings-sidebar {
                    width: 240px;
                    border-right: 1px solid rgba(255, 255, 255, 0.08);
                    padding: 16px;
                    background: rgba(0, 0, 0, 0.2);
                }
                .claw-settings-main {
                    flex: 1;
                    padding: 16px;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                }
                .claw-settings-model-item {
                    transition: all 0.2s ease;
                    border: 1px solid transparent !important;
                }
                .claw-settings-model-item:hover {
                    background: rgba(255, 255, 255, 0.05) !important;
                    border-color: rgba(255, 255, 255, 0.1) !important;
                }
                .claw-settings-model-item.active {
                    background: var(--icon-color, #007aff) !important;
                    color: white !important;
                }
                .claw-settings-model-item.editing {
                    border-color: var(--icon-color, #007aff) !important;
                    background: rgba(0, 122, 255, 0.1) !important;
                }
                .form-control-premium {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: white;
                    padding: 10px 12px;
                    width: 100%;
                    outline: none;
                }
                .form-control-premium:focus {
                    border-color: var(--icon-color, #007aff);
                    background: rgba(255, 255, 255, 0.08);
                }
                .form-label {
                    font-size: 12px;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.5);
                    margin-bottom: 6px;
                    display: block;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                /* Tool Card Improvements */
                .tool-result-base {
                    background: rgba(30,30,35, 0.4);
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 12px;
                    margin: 8px 0 12px 0;
                    overflow: hidden;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    width: 100%;
                    box-sizing: border-box;
                }
                .tool-result-header {
                    padding: 8px 14px;
                    background: transparent;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    user-select: none;
                    transition: background 0.2s;
                }
                .tool-result-header:hover { background: rgba(255, 255, 255, 0.05); }
                .tool-result-base.expanded .tool-result-header {
                    border-bottom: none;
                }
                .tool-info-pill {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .tool-icon-circle {
                    width: 22px;
                    height: 22px;
                    background: transparent;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--icon-color, #007aff);
                }
                .tool-name {
                    font-weight: 600;
                    font-size: 13px;
                    color: rgba(255,255,255,0.8);
                }
                .tool-header-right {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .tool-status-tag {
                    font-size: 11px;
                    padding: 2px 10px;
                    border-radius: 20px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    background: rgba(255,255,255,0.05);
                    color: rgba(255,255,255,0.5);
                }
                .tool-status-tag.success { color: #4ade80; background: rgba(74, 222, 128, 0.1); }
                .tool-status-tag.error { color: #f87171; background: rgba(248, 113, 113, 0.1); }
                
                .tool-expand-icon {
                    font-size: 18px;
                    color: rgba(255,255,255,0.3);
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .tool-result-base.expanded .tool-expand-icon {
                    transform: rotate(180deg);
                }
                .tool-result-body {
                    display: none;
                    padding: 12px;
                    background: rgba(0, 0, 0, 0.1);
                }
                .tool-result-base.expanded .tool-result-body {
                    display: block;
                }

                /* Search item adjustments */
                .track-source-badge {
                    position: absolute;
                    bottom: 4px;
                    right: 4px;
                    width: 14px;
                    height: 14px;
                    background: rgba(0,0,0,0.5);
                    border-radius: 3px;
                    padding: 2px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(4px);
                }
                .track-source-badge img { width: 100%; height: 100%; object-fit: contain; }
                
                .claw-track-item {
                    position: relative;
                    transition: background 0.2s;
                }
                .claw-track-item.downloaded {
                    background: rgba(255, 255, 255, 0.04);
                }
                .claw-track-item.downloaded .download-btn {
                    color: #4ade80;
                    opacity: 0.8;
                }
                .claw-track-item:hover { background: rgba(255,255,255,0.03); }
            </style>
            <div id="music-claw-page" class="page-container">
                <!-- Toolbar removed as requested -->
                <div class="claw-floating-actions" style="position: absolute; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 20;">
                    <button id="claw-settings-button" class="icon-button floating" title="Settings">
                        <span class="material-icons">settings</span>
                    </button>
                    <button id="claw-new-chat-button" class="icon-button floating" title="New Chat">
                        <span class="material-icons">add</span>
                    </button>
                </div>

                <div id="claw-chat-container" class="claw-chat-container">
                    <div id="claw-messages" class="claw-messages">
                        <!-- Messages rendered here -->
                    </div>
                </div>

                <div class="claw-input-area">
                    <div class="claw-input-wrapper">
                        <textarea id="claw-user-input" placeholder="Ask Music Claw something…" rows="1"></textarea>
                        <button id="claw-send-button" class="icon-button primary">
                            <span class="material-icons">send</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Settings Modal -->
            <div id="claw-settings-modal" class="modal-overlay" style="display:none; z-index: 1000; position: fixed; top:0; left:0; width:100%; height:100%; align-items:center; justify-content:center;">
                <div class="modal-content claw-settings-content" style="display: flex; flex-direction: column; border-radius: 16px; overflow: hidden;">
                    <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.1);">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="material-icons" style="color: var(--icon-color)">settings</span>
                            <h2 style="margin: 0; font-size: 1rem; font-weight: 500;">Music Claw Settings</h2>
                        </div>
                        <button id="claw-settings-close" class="icon-button" style="padding: 4px;"><span class="material-icons" style="font-size: 20px;">close</span></button>
                    </div>
                    <div class="modal-body" style="flex: 1; display: flex; overflow: hidden;">
                        
                        <!-- Models List Sidebar -->
                        <div class="claw-settings-sidebar">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding: 0 4px;">
                                <h3 style="margin: 0; font-size: 0.85rem; font-weight: 600; color: rgba(255,255,255,0.6);">MODELS</h3>
                                <button id="claw-settings-add-model" class="icon-button small primary" style="width:24px; height:24px;"><span class="material-icons" style="font-size:16px;">add</span></button>
                            </div>
                            <div id="claw-models-list" style="display: flex; flex-direction: column; gap: 4px;">
                                <!-- Model items rendered here -->
                            </div>
                        </div>

                        <!-- Model Editor Main -->
                        <div class="claw-settings-main">
                            <div id="claw-model-editor-panel" style="display: none; flex-direction: column; height: 100%;">
                                <div style="margin-bottom: 24px;">
                                    <h3 id="claw-model-editor-title" style="margin: 0; font-size: 1.4rem; font-weight: 600;">Edit Model</h3>
                                    <p style="margin: 4px 0 0; color: rgba(255,255,255,0.4); font-size: 0.9rem;">Configure your OpenAI SDK compatible model.</p>
                                </div>

                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                                    <div class="form-group">
                                        <label class="form-label">Provider Name</label>
                                        <input type="text" id="claw-model-provider" placeholder="e.g. OpenAI" class="form-control-premium">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Model Name</label>
                                        <input type="text" id="claw-model-name" placeholder="e.g. gpt-4o" class="form-control-premium">
                                    </div>
                                </div>

                                <div class="form-group" style="margin-bottom: 16px;">
                                    <label class="form-label">Base URL</label>
                                    <input type="text" id="claw-model-base-url" placeholder="https://api.openai.com/v1" class="form-control-premium">
                                </div>

                                <div class="form-group" style="margin-bottom: 16px;">
                                    <label class="form-label">API Keys (Separate by newline for Load Balancing)</label>
                                    <textarea id="claw-model-api-keys" placeholder="sk-..." class="form-control-premium" rows="4" style="font-family: 'Fira Code', monospace; font-size: 13px; -webkit-text-security: disc;"></textarea>
                                </div>

                                <div class="form-group">
                                    <label class="form-label">Failover & Load Balancing</label>
                                    <select id="claw-model-lb-mode" class="form-control-premium" style="appearance: none; background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22rgba(255,255,255,0.4)%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E'); background-repeat: no-repeat; background-position: right 10px center; background-size: 16px;">
                                        <option value="round_robin">Round Robin (Auto rotate)</option>
                                        <option value="fallback">Fallback (Serial switching on failure)</option>
                                    </select>
                                </div>

                                <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: auto; padding-top: 24px;">
                                    <button id="claw-settings-delete-model" class="btn" style="background: rgba(229, 62, 62, 0.15); color: #fc8181; border: 1px solid rgba(229, 62, 62, 0.2); padding: 8px 16px; border-radius: 8px; cursor: pointer;">Delete</button>
                                    <button id="claw-settings-save-model" class="btn primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500;">Save Changes</button>
                                </div>
                            </div>
                            <div id="claw-model-editor-empty" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: rgba(255,255,255,0.3); text-align: center;">
                                <span class="material-icons" style="font-size: 48px; margin-bottom: 12px;">auto_awesome</span>
                                <p>Select a model from the sidebar to edit<br>or click the plus icon to add a new provider.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    onLoad(container, subPageId, appState, managers) {
        this.managers = managers;
        this._updateDownloadedList().then(() => {
            if (this.messages.length === 0) {
                this._showWelcome();
            } else {
                this._renderMessages();
                const messagesEl = document.getElementById('claw-messages');
                if (messagesEl) this._bindTrackEvents(messagesEl);
            }
        });
        this._setupEventListeners(container);
        this._setupSettings(container);
        
        // Register for real-time updates
        if (this.managers.webSocketManager) {
            this.managers.webSocketManager.registerPushHandler('download_progress', (data) => this._handleDownloadProgress(data));
        }
    }

    async _updateDownloadedList() {
        try {
            const resp = await this.managers.webSocketManager.sendWebSocketCommand('get_downloaded_music', {});
            const list = resp.data && resp.data.library ? resp.data.library : [];
            this._downloadedIds = new Set(list.map(t => String(t.music_id || t.id || t.bvid)));
        } catch(e) { console.warn("Failed to update downloads list", e); }
    }

    _handleDownloadProgress(data) {
        const music_id = data.track_id || (data.track_details && data.track_details.music_id);
        if (!music_id) return;

        const stringId = String(music_id);
        const item = document.querySelector(`.claw-track-item[data-id="${stringId}"]`);
        if (!item) return;

        const btn = item.querySelector('.download-btn');
        const icon = btn.querySelector('.material-icons');

        if (data.status === 'downloading' || data.status === 'pending') {
            const pct = Math.round(data.progress_percent || 0);
            icon.textContent = 'downloading';
            btn.title = `Downloading... ${pct}%`;
        } else if (data.status === 'completed_track' || data.status === 'finished') {
            icon.textContent = 'done';
            btn.disabled = true;
            btn.title = 'Downloaded';
            item.classList.add('downloaded');
            this._downloadedIds.add(stringId);
        } else if (data.status === 'error') {
            icon.textContent = 'report_problem';
            btn.title = `Error: ${data.error_message || data.error || 'Failed'}`;
        }
    }

    // ── Welcome message ────────────────────────────────────────────────────────

    _showWelcome() {
        const welcome = {
            role: 'assistant',
            content: 'Hello! I\'m **Music Claw**, your AI music assistant.\n\nI can help you:\n• Search for music on Bilibili, Netease, or Kugou\n• Look up your local music library\n• Manage your playlists and "Liked" songs\n• Fetch high-quality metadata and lyrics\n• Control playback with your voice (typing)\n\nTry saying: *"Find some lo-fi music on Netease and play it"* or *"Search for Eminem in my library"*.',
            timestamp: new Date().toISOString(),
        };
        this.messages = [welcome];
        this._saveSession();
        this._renderMessages();
    }

    // ── Message rendering ──────────────────────────────────────────────────────

    _renderMessages() {
        const container = document.getElementById('claw-messages');
        if (!container) return;
        container.innerHTML = this.messages.map(m => this._renderMessage(m)).join('');
        this._scrollToBottom();
    }

    _appendMessage(msg) {
        const container = document.getElementById('claw-messages');
        if (!container) return null;
        const div = document.createElement('div');
        div.innerHTML = this._renderMessage(msg);
        const el = div.firstElementChild;
        container.appendChild(el);
        this._scrollToBottom();
        return el;
    }

    _renderMessage(msg) {
        if (msg.role === 'tool') {
            return this._renderToolMessage(msg);
        }
        
        const isAssistant = msg.role === 'assistant';
        const cls = isAssistant ? 'assistant no-bubble' : 'user';
        
        // Assistant message might contain both text and tool calls
        let bodyHtml = '';
        if (msg.content) {
            bodyHtml = `<div class="message-text">${isAssistant ? this._md(msg.content) : this._esc(msg.content)}</div>`;
        }
        
        if (isAssistant && msg.tool_calls) {
            // If we have saved tool calls in history, we render placeholders or summaries?
            // Actually, for simplicity, we don't render assistant's call block if we have the following tool result.
            // But if it's GLM/Zai, tool calls are inside content anyway (if not native).
        }

        return `
            <div class="message ${cls}">
                <div class="message-content-wrapper">
                    <div class="message-body">${bodyHtml}</div>
                    <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                </div>
            </div>`;
    }

    _renderToolMessage(msg) {
        const result = msg.content ? JSON.parse(msg.content) : {};
        let tracks = result.results;
        if (!tracks && Array.isArray(result)) tracks = result;
        
        const isTrackList = tracks && Array.isArray(tracks);
        
        let bodyContent = '';
        if (isTrackList) {
            bodyContent = `<div class="claw-tool-results-list">${tracks.map(t => this._renderTrackItem(t)).join('')}</div>`;
        } else if (result.error) {
            bodyContent = `<div class="status-msg-inline error"><span class="material-icons">warning</span> ${this._esc(result.error)}</div>`;
        } else if (result.lyrics) {
             bodyContent = `<div class="lyrics-preview-small">${this._esc(result.lyrics.slice(0, 200))}...</div>`;
        } else {
            bodyContent = `<div class="status-msg-inline"><span class="material-icons">info</span> ${this._esc(result.message || 'Action completed')}</div>`;
        }

        return `
            <div class="message assistant no-bubble">
                <div class="message-content-wrapper" style="width:100%">
                    <div class="message-body">
                        <div class="tool-result-base expanded">
                            <div class="tool-result-header" onclick="this.parentElement.classList.toggle('expanded')">
                                <div class="tool-info-pill">
                                    <div class="tool-icon-circle">
                                        <span class="material-icons" style="font-size: 16px;">build</span>
                                    </div>
                                    <span class="tool-name">${this._esc(msg.name)}</span>
                                </div>
                                <div class="tool-header-right">
                                    <div class="tool-status-tag success">
                                        <span class="material-icons" style="font-size:12px;">done</span> Finished
                                    </div>
                                    <span class="material-icons tool-expand-icon">expand_more</span>
                                </div>
                            </div>
                            <div class="tool-result-body">
                                ${bodyContent}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // ── Tool call card rendering ───────────────────────────────────────────────

    _appendToolCallCard(toolCall) {
        const container = document.getElementById('claw-messages');
        if (!container) return;

        const card = document.createElement('div');
        card.className = 'message assistant no-bubble';
        card.dataset.toolCallId = toolCall.id;
        card.innerHTML = `
            <div class="message-content-wrapper" style="width:100% !important; max-width: 100% !important;">
                <div class="message-body">
                    <div class="tool-result-base">
                        <div class="tool-result-header" onclick="this.parentElement.classList.toggle('expanded')">
                            <div class="tool-info-pill">
                                <div class="tool-icon-circle">
                                    <span class="material-icons" style="font-size: 16px;">build</span>
                                </div>
                                <span class="tool-name">${this._esc(toolCall.name)}</span>
                            </div>
                            <div class="tool-header-right">
                                <div class="tool-status-tag" id="ts-${toolCall.id}">
                                    <div class="claw-spinner-tiny"></div> Running
                                </div>
                                <span class="material-icons tool-expand-icon">expand_more</span>
                            </div>
                        </div>
                        <div class="tool-result-body" id="tb-${toolCall.id}">
                            <div style="font-size: 11px; color: rgba(255,255,255,0.3); margin-bottom: 8px;">Parameters</div>
                            <pre style="margin:0; font-size: 12px; max-height: 100px;"><code>${JSON.stringify(toolCall.parameters, null, 2)}</code></pre>
                        </div>
                    </div>
                </div>
            </div>`;
        container.appendChild(card);
        this._pendingToolCards[toolCall.id] = card;
        this._scrollToBottom();
    }

    _resolveToolCallCard(toolResult) {
        const card = this._pendingToolCards[toolResult.id];
        if (!card) return;

        const statusEl = card.querySelector(`#ts-${toolResult.id}`);
        const bodyEl = card.querySelector(`#tb-${toolResult.id}`);

        if (statusEl) {
            statusEl.className = 'tool-status-tag success';
            statusEl.innerHTML = `<span class="material-icons" style="font-size:12px;">done</span> Finished`;
        }
        if (bodyEl) {
            card.querySelector('.tool-result-base').classList.add('expanded');
            const result = toolResult.result || {};
            // Flatten nested results if needed
            let tracks = result.results;
            if (!tracks && Array.isArray(result)) tracks = result;
            
            if (tracks && Array.isArray(tracks)) {
                bodyEl.innerHTML = `
                    <div class="claw-tool-results-list">
                        ${tracks.map(track => this._renderTrackItem(track)).join('')}
                    </div>
                `;
                this._bindTrackEvents(bodyEl);
            } else if (result.status === 'success' || result.lyrics) {
                // For direct success messages or lyrics, render a cleaner display
                if (result.lyrics) {
                    bodyEl.innerHTML = `<div class="lyrics-preview-small">${this._esc(result.lyrics.slice(0, 200))}...</div>`;
                } else {
                    bodyEl.innerHTML = `<div class="status-msg-inline"><span class="material-icons">info</span> ${this._esc(result.message || 'Operation successful')}</div>`;
                }
            } else if (result.error) {
                statusEl.className = 'tool-status-tag error';
                statusEl.innerHTML = `<span class="material-icons">error</span> Failed`;
                bodyEl.innerHTML = `<div class="status-msg-inline error"><span class="material-icons">warning</span> ${this._esc(result.error)}</div>`;
            } else {
                bodyEl.innerHTML = `<pre><code>${JSON.stringify(result, null, 2)}</code></pre>`;
            }
        }
        delete this._pendingToolCards[toolResult.id];
        this._scrollToBottom();
    }

    // ── Thinking indicator ────────────────────────────────────────────────────

    _showThinking() {
        const container = document.getElementById('claw-messages');
        if (!container || document.getElementById('claw-thinking')) return;
        
        const div = document.createElement('div');
        div.id = 'claw-thinking';
        div.className = 'message assistant no-bubble';
        div.innerHTML = `
            <div class="message-content-wrapper" style="width:100%">
                <div class="message-body">
                    <div class="claw-thinking-container">
                        <div class="claw-thinking-header">
                            <div class="thinking-label">
                                <span class="material-icons" style="font-size:16px">psychology</span>
                                Thinking
                            </div>
                            <div class="thinking-status-text">Analysing request...</div>
                            <span class="material-icons thinking-toggle-icon">expand_more</span>
                        </div>
                        <div class="claw-thinking-content">
                            <div class="thinking-content-inner"></div>
                        </div>
                    </div>
                </div>
            </div>`;
        
        container.appendChild(div);
        
        // Setup toggle
        const containerEl = div.querySelector('.claw-thinking-container');
        const header = div.querySelector('.claw-thinking-header');
        header.addEventListener('click', () => {
            containerEl.classList.toggle('expanded');
        });

        this._startThinkingRotation();
        this._scrollToBottom();
    }

    _startThinkingRotation() {
        if (this._thinkingRotationTimer) return;
        this._thinkingRotationTimer = setInterval(() => {
            const thinkingEl = document.getElementById('claw-thinking');
            if (!thinkingEl) {
                this._stopThinkingRotation();
                return;
            }

            const inner = thinkingEl.querySelector('.thinking-content-inner');
            const statusEl = thinkingEl.querySelector('.thinking-status-text');
            const fullText = inner.textContent.trim();
            if (!fullText) return;

            // Get last non-empty line or last fragment
            const lines = fullText.split('\n').filter(l => l.trim());
            let latest = lines.length > 0 ? lines[lines.length - 1] : fullText;
            if (latest.length > 50) latest =latest.substring(0, 47) + "...";

            if (latest && latest !== this._lastThinkingDisplay) {
                statusEl.classList.add('fade-out');
                setTimeout(() => {
                    statusEl.textContent = latest;
                    statusEl.classList.remove('fade-out');
                    statusEl.classList.add('fade-in');
                    this._lastThinkingDisplay = latest;
                }, 500);
            }
        }, 2500);
    }

    _stopThinkingRotation() {
        if (this._thinkingRotationTimer) {
            clearInterval(this._thinkingRotationTimer);
            this._thinkingRotationTimer = null;
        }
        this._lastThinkingDisplay = "";
    }

    _hideThinking() {
        this._stopThinkingRotation();
        const el = document.getElementById('claw-thinking');
        if (el) el.remove();
    }

    // ── Event listeners ───────────────────────────────────────────────────────

    _setupEventListeners(container) {
        const newChatBtn = container.querySelector('#claw-new-chat-button');
        const sendBtn = container.querySelector('#claw-send-button');
        const textarea = container.querySelector('#claw-user-input');

        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => this._newChat());
        }

        if (textarea) {
            textarea.addEventListener('input', () => {
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
            });
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._handleSend();
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this._handleSend());
        }
    }

    _newChat() {
        if (this.isLoading) return;
        this.messages = [];
        this.sessionId = `session_${Date.now()}`;
        this._pendingToolCards = {};
        this._currentStreamingMsg = null;
        this._currentStreamingEl = null;
        this._stopThinkingRotation();
        sessionStorage.removeItem('music_claw_session');
        const titleEl = document.getElementById('claw-session-title');
        if (titleEl) titleEl.textContent = 'New Conversation';
        this._showWelcome();
    }

    // ── Send message ──────────────────────────────────────────────────────────

    async _handleSend() {
        if (this.isLoading) return;
        const textarea = document.getElementById('claw-user-input');
        const content = textarea.value.trim();
        if (!content) return;

        // Clear input
        textarea.value = '';
        textarea.style.height = 'auto';

        // Add user message
        const userMsg = { role: 'user', content, timestamp: new Date().toISOString() };
        this.messages.push(userMsg);
        this._appendMessage(userMsg);

        // Update tab/window title on first real user message
        if (this.messages.filter(m => m.role === 'user').length === 1) {
            // Title section removed, but we can still reflect in document.title if desired
            // document.title = content.slice(0, 40);
        }

        this._setLoading(true);
        this._showThinking();

        // Build history
        const history = this.messages
            .slice(0, -1) // exclude the just-added user message
            .filter(m => ['user', 'assistant', 'tool'].includes(m.role))
            .map(m => {
                const item = { role: m.role, content: m.content };
                if (m.role === 'tool') {
                    item.tool_call_id = m.tool_call_id;
                    item.name = m.name;
                }
                if (m.role === 'assistant' && m.tool_calls) {
                    item.tool_calls = m.tool_calls;
                }
                return item;
            });

        const config = this._getActiveModelConfig();
        const llm_config = config ? {
            api_keys: config.apiKeys.split(/[\r\n]+/).map(k=>k.trim()).filter(k=>k),
            base_url: config.baseUrl,
            model: config.model,
            lb_mode: config.lbMode
        } : {};

        try {
            await this.managers.webSocketManager.sendClawCommand(
                'music_claw_chat',
                { message: content, session_id: this.sessionId, history, llm_config },
                (update) => this._handleUpdate(update)
            );
            this._saveSession();
        } catch (err) {
            this._hideThinking();
            const errMsg = {
                role: 'assistant',
                content: `Sorry, an error occurred: ${err.message}`,
                timestamp: new Date().toISOString(),
            };
            this.messages.push(errMsg);
            this._appendMessage(errMsg);
        } finally {
            this._setLoading(false);
        }
    }

    // ── Handle streaming updates ──────────────────────────────────────────────

    _handleUpdate(update) {
        const { update_type } = update;

        if (update_type === 'thinking') {
            if (update.is_stream && update.content) {
                this._showThinking();
                const thinkingEl = document.getElementById('claw-thinking');
                if (thinkingEl) {
                    const inner = thinkingEl.querySelector('.thinking-content-inner');
                    if (inner) {
                        inner.textContent += update.content;
                    }
                }
                this._scrollToBottom();
            }
            return;
        }

        if (update_type === 'text') {
            this._hideThinking();
            
            if (update.is_stream) {
                // If we are currently streaming, append to the existing message
                if (this._currentStreamingMsg) {
                    this._currentStreamingMsg.content += (update.content || '');
                    if (this._currentStreamingEl) {
                        const bodyEl = this._currentStreamingEl.querySelector('.message-body');
                        if (bodyEl) {
                            bodyEl.innerHTML = `<div class="message-text">${this._md(this._currentStreamingMsg.content)}</div>`;
                        }
                    }
                    this._scrollToBottom();
                } else {
                    // Start a new streaming message
                    const assistantMsg = {
                        role: 'assistant',
                        content: update.content || '',
                        timestamp: new Date().toISOString(),
                    };
                    this.messages.push(assistantMsg);
                    this._currentStreamingMsg = assistantMsg;
                    this._currentStreamingEl = this._appendMessage(assistantMsg);
                }
            } else {
                // Not a stream, or end of one? 
                const assistantMsg = {
                    role: 'assistant',
                    content: update.content || '',
                    timestamp: new Date().toISOString(),
                };
                this.messages.push(assistantMsg);
                this._appendMessage(assistantMsg);
                this._currentStreamingMsg = null;
                this._currentStreamingEl = null;
            }
            return;
        }

        if (update_type === 'tool_call') {
            this._hideThinking();
            this._currentStreamingMsg = null;
            this._currentStreamingEl = null;
            this._appendToolCallCard(update.tool_call);
            
            // Add to history (as assistant with tool_calls)
            this.messages.push({
                role: 'assistant',
                content: '',
                tool_calls: [update.tool_call],
                timestamp: new Date().toISOString()
            });
            return;
        }

        if (update_type === 'tool_result') {
            this._resolveToolCallCard(update.tool_result);
            
            // Add to history (as tool)
            this.messages.push({
                role: 'tool',
                tool_call_id: update.tool_result.id,
                name: update.tool_result.name,
                content: JSON.stringify(update.tool_result.result),
                timestamp: new Date().toISOString()
            });
            
            this._showThinking(); // Show thinking again while LLM processes
            return;
        }

        if (update_type === 'complete') {
            this._hideThinking();
            this._currentStreamingMsg = null;
            this._currentStreamingEl = null;

            const content = (update.content || '').trim();
            if (!content) {
                this._saveSession();
                return;
            }
            
            // If the last message was already this content (from a 'text' update), ignore
            const last = this.messages[this.messages.length - 1];
            if (last && last.role === 'assistant' && last.content === content) {
                this._saveSession();
                return;
            }

            const assistantMsg = {
                role: 'assistant',
                content,
                timestamp: new Date().toISOString(),
            };
            this.messages.push(assistantMsg);
            this._appendMessage(assistantMsg);
            this._saveSession();
        }
    }

    // ── Track Item Rendering ──────────────────────────────────────────────────

    _renderTrackItem(track) {
        const music_id = track.music_id || track.id || track.bvid;
        const isDownloaded = this._downloadedIds.has(String(music_id));
        const artist = track.artist || track.author || 'Unknown Artist';
        const cover = track.artwork_url || track.cover_path || 'placeholder_album_art.png';
        const source = track.source || 'unknown';
        
        return `
            <div class="claw-track-item ${isDownloaded ? 'downloaded' : ''}" data-id="${this._esc(music_id)}" data-track='${JSON.stringify(track).replace(/'/g, "&apos;")}'>
                <div class="track-thumb">
                    <img src="${this._esc(cover)}" alt="cover" referrerpolicy="no-referrer">
                    <div class="track-source-badge">
                        <img src="/source_icon/${this._esc(source)}.ico" onerror="this.parentElement.style.display='none'">
                    </div>
                    <div class="track-play-overlay">
                        <span class="material-icons">play_arrow</span>
                    </div>
                </div>
                <div class="track-info">
                    <div class="track-title">${this._esc(track.title)}</div>
                    <div class="track-artist">${this._esc(artist)}</div>
                </div>
                <div class="track-actions">
                    <button class="track-action-btn download-btn" title="${isDownloaded ? 'Downloaded' : 'Download'}" ${isDownloaded ? 'disabled' : ''}>
                        <span class="material-icons">${isDownloaded ? 'done' : 'download'}</span>
                    </button>
                </div>
            </div>
        `;
    }

    _bindTrackEvents(container) {
        container.querySelectorAll('.claw-track-item').forEach(item => {
            const track = JSON.parse(item.dataset.track);
            
            // Play on click (thumb or info)
            item.querySelector('.track-thumb').addEventListener('click', () => {
                this.managers.playerManager.playTrackFromCard(JSON.stringify(track));
            });

            // Download
            item.querySelector('.download-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.managers.uiManager.addTrackToDownloadQueue(track, this.managers.webSocketManager);
            });

        });
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    _getActiveModelConfig() {
        let models = [];
        try {
            models = JSON.parse(localStorage.getItem('music_claw_models') || '[]');
        } catch(e) {}
        const activeId = localStorage.getItem('music_claw_active_model_id');
        if (models.length > 0) {
            const active = models.find(m => m.id === activeId) || models[0];
            return active;
        }
        return null;
    }

    _setupSettings(container) {
        const btn = document.getElementById('claw-settings-button');
        const modal = document.getElementById('claw-settings-modal');
        const closeBtn = document.getElementById('claw-settings-close');
        if (!btn || !modal) return;

        btn.addEventListener('click', () => {
            this._renderSettings();
            modal.style.display = 'flex';
        });

        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.addEventListener('click', (e) => {
            // Click-outside closing logic removed per user request
        });

        const addBtn = document.getElementById('claw-settings-add-model');
        const saveBtn = document.getElementById('claw-settings-save-model');
        const delBtn = document.getElementById('claw-settings-delete-model');

        addBtn.addEventListener('click', () => {
            this._editingModelId = null;
            this._showModelEditor({
                providerName: 'New Provider',
                model: 'gpt-4o',
                baseUrl: 'https://api.openai.com/v1',
                apiKeys: '',
                lbMode: 'round_robin'
            });
        });

        saveBtn.addEventListener('click', () => {
            const pName = document.getElementById('claw-model-provider').value.trim();
            const mName = document.getElementById('claw-model-name').value.trim();
            const bUrl = document.getElementById('claw-model-base-url').value.trim();
            const keys = document.getElementById('claw-model-api-keys').value.trim();
            const lbMode = document.getElementById('claw-model-lb-mode').value;

            if (!pName || !mName || !keys) {
                alert("Provider, Model, and at least one API Key are required.");
                return;
            }

            let models = [];
            try { models = JSON.parse(localStorage.getItem('music_claw_models') || '[]'); } catch(e) {}
            
            if (this._editingModelId) {
                const md = models.find(m => m.id === this._editingModelId);
                if (md) {
                    md.providerName = pName;
                    md.model = mName;
                    md.baseUrl = bUrl;
                    md.apiKeys = keys;
                    md.lbMode = lbMode;
                }
            } else {
                const newId = 'mdl_' + Date.now();
                models.push({
                    id: newId,
                    providerName: pName,
                    model: mName,
                    baseUrl: bUrl,
                    apiKeys: keys,
                    lbMode: lbMode,
                    adapter: 'openai_sdk'
                });
                this._editingModelId = newId;
                if (!localStorage.getItem('music_claw_active_model_id')) {
                    localStorage.setItem('music_claw_active_model_id', newId);
                }
            }
            
            localStorage.setItem('music_claw_models', JSON.stringify(models));
            this._renderSettings();
            document.getElementById('claw-settings-save-model').textContent = 'Saved!';
            setTimeout(() => document.getElementById('claw-settings-save-model').textContent = 'Save', 1000);
        });

        delBtn.addEventListener('click', () => {
            if (!this._editingModelId) return;
            if (!confirm('Delete this model?')) return;
            
            let models = [];
            try { models = JSON.parse(localStorage.getItem('music_claw_models') || '[]'); } catch(e) {}
            models = models.filter(m => m.id !== this._editingModelId);
            localStorage.setItem('music_claw_models', JSON.stringify(models));
            
            if (localStorage.getItem('music_claw_active_model_id') === this._editingModelId) {
                localStorage.setItem('music_claw_active_model_id', models.length ? models[0].id : '');
            }
            
            this._editingModelId = null;
            this._renderSettings();
        });
    }

    _renderSettings() {
        const listEl = document.getElementById('claw-models-list');
        const editor = document.getElementById('claw-model-editor-panel');
        const empty = document.getElementById('claw-model-editor-empty');

        let models = [];
        try { models = JSON.parse(localStorage.getItem('music_claw_models') || '[]'); } catch(e) {}
        const activeId = localStorage.getItem('music_claw_active_model_id');

        if (models.length === 0) {
            listEl.innerHTML = '<div style="color: rgba(255,255,255,0.3); font-size: 0.85rem; padding: 20px; text-align:center;">No models configured.</div>';
            editor.style.display = 'none';
            empty.style.display = 'flex';
            this._editingModelId = null;
            return;
        }

        listEl.innerHTML = models.map(m => {
            const isEditing = this._editingModelId === m.id;
            const isActive = activeId === m.id;
            
            return `
                <div data-id="${this._esc(m.id)}" class="claw-settings-model-item ${isActive ? 'active' : ''} ${isEditing ? 'editing' : ''}" style="padding: 12px; border-radius: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <div style="display:flex; flex-direction:column; gap:2px; flex:1; min-width:0;">
                        <span style="font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${isActive ? '#fff' : 'rgba(255,255,255,0.9)'}">${this._esc(m.providerName)}</span>
                        <span style="font-size: 11px; color: ${isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)'}">${this._esc(m.model)}</span>
                    </div>
                    ${isActive ? 
                        '<span class="material-icons" style="font-size:18px; margin-left:8px;">check_circle</span>' : 
                        '<button class="icon-button small set-active-btn" style="color: rgba(255,255,255,0.3);"><span class="material-icons" style="font-size:18px;">radio_button_unchecked</span></button>'
                    }
                </div>
            `;
        }).join('');

        // Attach events
        listEl.querySelectorAll('.claw-settings-model-item').forEach(item => {
            const id = item.dataset.id;
            item.addEventListener('click', (e) => {
                if (e.target.closest('.set-active-btn')) {
                    // Set active
                    localStorage.setItem('music_claw_active_model_id', id);
                    this._renderSettings();
                    e.stopPropagation();
                    return;
                }
                const md = models.find(m => m.id === id);
                this._editingModelId = id;
                this._showModelEditor(md);
                this._renderSettings(); // update selection visual
            });
        });

        // Show editor if something is selected or we just re-rendered with active ID
        if (!this._editingModelId && activeId) {
            this._editingModelId = activeId;
        }

        if (this._editingModelId) {
            const md = models.find(m => m.id === this._editingModelId);
            if (md) this._showModelEditor(md);
        } else {
            editor.style.display = 'none';
            empty.style.display = 'flex';
        }
    }

    _showModelEditor(modelData) {
        document.getElementById('claw-model-editor-panel').style.display = 'flex';
        document.getElementById('claw-model-editor-empty').style.display = 'none';
        
        document.getElementById('claw-model-editor-title').textContent = this._editingModelId ? 'Edit Model' : 'Add New Model';
        document.getElementById('claw-model-provider').value = modelData.providerName || '';
        document.getElementById('claw-model-name').value = modelData.model || '';
        document.getElementById('claw-model-base-url').value = modelData.baseUrl || '';
        document.getElementById('claw-model-api-keys').value = modelData.apiKeys || '';
        document.getElementById('claw-model-lb-mode').value = modelData.lbMode || 'round_robin';
        
        const delBtn = document.getElementById('claw-settings-delete-model');
        if (this._editingModelId) {
            delBtn.style.display = 'block';
        } else {
            delBtn.style.display = 'none';
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _setLoading(val) {
        this.isLoading = val;
        const sendBtn = document.getElementById('claw-send-button');
        const textarea = document.getElementById('claw-user-input');
        if (sendBtn) sendBtn.disabled = val;
        if (textarea) textarea.disabled = val;
    }

    _scrollToBottom() {
        const c = document.getElementById('claw-chat-container');
        if (c) c.scrollTop = c.scrollHeight;
    }

    /** Minimal Markdown: bold, italic, newlines, unordered lists */
    _md(text) {
        if (!text) return '';
        let t = this._esc(text);
        // **bold**
        t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // *italic*
        t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // bullet lists (lines starting with •, -, or *)
        t = t.replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>');
        t = t.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        // newlines
        t = t.replace(/\n/g, '<br>');
        return t;
    }

    /** HTML-escape */
    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

export default MusicClawPage;
