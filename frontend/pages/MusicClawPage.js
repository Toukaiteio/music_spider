// frontend/pages/MusicClawPage.js

import { ClawPreferencesModal } from './claw/ClawPreferencesModal.js';
import { ClawSettingsModal } from './claw/ClawSettingsModal.js';

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
        this.llmConfig = { models: [], active_model_id: "" };
        
        this._restoreSession();
    }

    async _loadLLMConfig() {
        try {
            const resp = await this.managers.webSocketManager.sendWebSocketCommand('get_llm_config', {});
            if (resp.code === 0 && resp.data) {
                this.llmConfig = resp.data;
            }
        } catch (e) {
            console.error("Failed to load LLM config from backend", e);
        }
    }

    async _saveLLMConfig() {
        try {
            await this.managers.webSocketManager.sendWebSocketCommand('save_llm_config', {
                config: this.llmConfig
            });
        } catch (e) {
            console.error("Failed to save LLM config to backend", e);
        }
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
        this.settingsModal = new ClawSettingsModal(this);
        this.preferencesModal = new ClawPreferencesModal(managers);
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
                    <button id="claw-preferences-button" class="icon-button floating" title="Listening Insights">
                        <span class="material-icons">insights</span>
                    </button>
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

            </div>

            ${this.settingsModal ? this.settingsModal.getHTML() : ''}
            ${this.preferencesModal ? this.preferencesModal.getHTML() : ''}
        `;
    }

    onLoad(container, subPageId, appState, managers) {
        this.managers = managers;

        // Render the page immediately — do NOT block on async config loads.
        // The LLM config is only needed when the user actually sends a message;
        // the downloaded-IDs list is a progressive enhancement for track badges.
        if (this.messages.length === 0) {
            this._showWelcome();
        } else {
            this._renderMessages();
            const messagesEl = document.getElementById('claw-messages');
            if (messagesEl) this._bindTrackEvents(messagesEl);
        }

        // Load configs in background — failures are silently tolerated
        this._updateDownloadedList();
        this._loadLLMConfig();

        this._setupEventListeners(container);
        if (this.settingsModal) this.settingsModal.setup(container);
        if (this.preferencesModal) this.preferencesModal.setup(container);

        // Register for real-time download progress updates
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
        container.innerHTML = this.messages.map((m, i) => this._renderMessage(m, i)).join('');
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

    _renderMessage(msg, index) {
        if (msg.role === 'tool') {
            return this._renderToolMessage(msg, index);
        }
        
        const isAssistant = msg.role === 'assistant';
        const cls = isAssistant ? 'assistant no-bubble' : 'user';
        
        // Assistant message might contain both text and tool calls
        let bodyHtml = '';
        if (msg.content) {
            bodyHtml = `<div class="message-text">${isAssistant ? this._md(msg.content) : this._esc(msg.content)}</div>`;
        }

        // Avoid redundant timestamps: only show if first message or > 60s gap OR if roles changed
        let showTime = true;
        if (index > 0) {
            const prev = this.messages[index - 1];
            const diff = new Date(msg.timestamp) - new Date(prev.timestamp);
            if (prev.role === msg.role && diff < 60000) {
                showTime = false;
            }
        }
        
        const timeHtml = showTime ? `<div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>` : '';

        return `
            <div class="message ${cls}">
                <div class="message-content-wrapper">
                    <div class="message-body">${bodyHtml}</div>
                    ${timeHtml}
                </div>
            </div>`;
    }

    _renderToolMessage(msg, index) {
        const result = msg.content ? JSON.parse(msg.content) : {};
        let tracks = result.results;
        if (!tracks && Array.isArray(result)) tracks = result;
        
        const isTrackList = tracks && Array.isArray(tracks);
        
        // Use consistent timestamp hiding logic for tool results too
        let showTime = true;
        if (index > 0) {
            const prev = this.messages[index - 1];
            const diff = new Date(msg.timestamp) - new Date(prev.timestamp);
            if (prev.role === msg.role && diff < 60000) {
                showTime = false;
            }
        }
        const timeHtml = showTime ? `<div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>` : '';
        
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
                    ${timeHtml}
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
                // Not a stream (is_stream: false). Finalize or create new.
                const content = update.content || '';
                if (this._currentStreamingMsg) {
                    this._currentStreamingMsg.content = content;
                    if (this._currentStreamingEl) {
                        const bodyEl = this._currentStreamingEl.querySelector('.message-body');
                        if (bodyEl) {
                            bodyEl.innerHTML = `<div class="message-text">${this._md(content)}</div>`;
                        }
                    }
                    this._currentStreamingMsg = null;
                    this._currentStreamingEl = null;
                } else {
                    const assistantMsg = {
                        role: 'assistant',
                        content,
                        timestamp: new Date().toISOString(),
                    };
                    this.messages.push(assistantMsg);
                    this._appendMessage(assistantMsg);
                }
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
            
            const content = (update.content || '').trim();
            if (!content) {
                this._currentStreamingMsg = null;
                this._currentStreamingEl = null;
                this._saveSession();
                return;
            }
            
            if (this._currentStreamingMsg) {
                // Finalize streaming
                this._currentStreamingMsg.content = content;
                if (this._currentStreamingEl) {
                    const bodyEl = this._currentStreamingEl.querySelector('.message-body');
                    if (bodyEl) {
                        bodyEl.innerHTML = `<div class="message-text">${this._md(content)}</div>`;
                    }
                }
                this._currentStreamingMsg = null;
                this._currentStreamingEl = null;
                this._saveSession();
                return;
            }
            
            // Not streaming previously, just create new message if it doesn't match last
            const last = this.messages[this.messages.length - 1];
            if (last && last.role === 'assistant' && last.content.trim() === content) {
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
            return;
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
        const models = this.llmConfig.models || [];
        const activeId = this.llmConfig.active_model_id;
        if (models.length > 0) {
            const active = models.find(m => m.id === activeId) || models[0];
            return active;
        }
        return null;
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
