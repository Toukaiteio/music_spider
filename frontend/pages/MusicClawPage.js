// frontend/pages/MusicClawPage.js

class MusicClawPage {
    constructor() {
        this.appState = null;
        this.managers = null;
        // Conversation: array of { role, content, timestamp, tool_call?, tool_result? }
        this.messages = [];
        this.sessionId = `session_${Date.now()}`;
        this.isLoading = false;
        // Pending tool call cards: tool_call_id -> DOM element
        this._pendingToolCards = {};
    }

    init(appState, managers) {
        this.appState = appState;
        this.managers = managers;
    }

    getHTML() {
        return `
            <div id="music-claw-page" class="page-container">
                <div class="claw-toolbar">
                    <div class="claw-center-title">
                        <span id="claw-session-title">New Conversation</span>
                    </div>
                    <div class="claw-actions">
                        <button id="claw-new-chat-button" class="icon-button floating" title="New Chat">
                            <span class="material-icons">add</span>
                        </button>
                    </div>
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
        `;
    }

    onLoad(container, subPageId, appState, managers) {
        this._showWelcome();
        this._setupEventListeners(container);
    }

    // ── Welcome message ────────────────────────────────────────────────────────

    _showWelcome() {
        const welcome = {
            role: 'assistant',
            content: 'Hello! I\'m **Music Claw**, your AI music assistant.\n\nI can help you:\n• Search for music on Bilibili, Netease, or Kugou\n• Look up your local music library\n• Manage your playlists and "Liked" songs\n• Fetch high-quality metadata and lyrics\n• Control playback with your voice (typing)\n\nTry saying: *"Find some lo-fi music on Netease and play it"* or *"Search for Eminem in my library"*.',
            timestamp: new Date().toISOString(),
        };
        this.messages = [welcome];
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
        if (!container) return;
        const div = document.createElement('div');
        div.innerHTML = this._renderMessage(msg);
        container.appendChild(div.firstElementChild);
        this._scrollToBottom();
    }

    _renderMessage(msg) {
        const isAssistant = msg.role === 'assistant';
        const cls = isAssistant ? 'assistant no-bubble' : 'user';
        const bodyHtml = isAssistant
            ? `<div class="message-text">${this._md(msg.content)}</div>`
            : `<div class="message-text">${this._esc(msg.content)}</div>`;

        return `
            <div class="message ${cls}">
                <div class="message-content-wrapper">
                    <div class="message-body">${bodyHtml}</div>
                    <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
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
            <div class="message-content-wrapper" style="width:100%">
                <div class="message-body">
                    <div class="tool-result-base">
                        <div class="tool-result-header">
                            <span class="material-icons">build</span>
                            <span class="tool-name">${this._esc(toolCall.name)}</span>
                            <div class="tool-status-tag" id="ts-${toolCall.id}">
                                <span class="material-icons claw-spin">autorenew</span>
                                Running…
                            </div>
                        </div>
                        <div class="tool-result-body" id="tb-${toolCall.id}">
                            <pre><code>${JSON.stringify(toolCall.parameters, null, 2)}</code></pre>
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
            statusEl.innerHTML = `<span class="material-icons">check_circle</span> Done`;
        }
        if (bodyEl) {
            const result = toolResult.result || {};
            if (result.results && Array.isArray(result.results)) {
                bodyEl.innerHTML = `
                    <div class="claw-tool-results-list">
                        ${result.results.map(track => this._renderTrackItem(track)).join('')}
                    </div>
                `;
                this._bindTrackEvents(bodyEl);
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
                    <div class="claw-thinking-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>`;
        container.appendChild(div);
        this._scrollToBottom();
    }

    _hideThinking() {
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

        // Update title on first real user message
        if (this.messages.filter(m => m.role === 'user').length === 1) {
            const titleEl = document.getElementById('claw-session-title');
            if (titleEl) titleEl.textContent = content.slice(0, 40);
        }

        this._setLoading(true);
        this._showThinking();

        // Build history (user/assistant pairs, excluding welcome)
        const history = this.messages
            .slice(0, -1) // exclude the just-added user message
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: m.content }));

        try {
            await this.managers.webSocketManager.sendClawCommand(
                'music_claw_chat',
                { message: content, session_id: this.sessionId, history },
                (update) => this._handleUpdate(update)
            );
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
            // Already showing thinking indicator
            return;
        }

        if (update_type === 'tool_call') {
            this._hideThinking();
            this._appendToolCallCard(update.tool_call);
            return;
        }

        if (update_type === 'tool_result') {
            this._resolveToolCallCard(update.tool_result);
            this._showThinking(); // Show thinking again while LLM processes
            return;
        }

        if (update_type === 'complete') {
            this._hideThinking();
            const assistantMsg = {
                role: 'assistant',
                content: update.content || '',
                timestamp: new Date().toISOString(),
            };
            this.messages.push(assistantMsg);
            this._appendMessage(assistantMsg);
        }
    }

    // ── Track Item Rendering ──────────────────────────────────────────────────

    _renderTrackItem(track) {
        const musicId = track.music_id || track.id;
        const artist = track.artist || track.author || 'Unknown Artist';
        const cover = track.artwork_url || track.cover_path || 'placeholder_album_art.png';
        const source = track.source || 'unknown';
        
        return `
            <div class="claw-track-item" data-track='${JSON.stringify(track).replace(/'/g, "&apos;")}'>
                <div class="track-thumb">
                    <img src="${this._esc(cover)}" alt="cover">
                    <div class="track-play-overlay">
                        <span class="material-icons">play_arrow</span>
                    </div>
                </div>
                <div class="track-info">
                    <div class="track-title">${this._esc(track.title)}</div>
                    <div class="track-artist">${this._esc(artist)}</div>
                </div>
                <div class="track-actions">
                    <button class="track-action-btn download-btn" title="Download">
                        <span class="material-icons">download</span>
                    </button>
                    <button class="track-action-btn favorite-btn" title="Add to Liked">
                        <span class="material-icons">favorite_border</span>
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
                this.managers.webSocketManager.sendWebSocketCommand('download_track', {
                    source: track.source,
                    track_data: track
                }).then(() => {
                    this.managers.uiManager.showToast(`Starting download: ${track.title}`, 'info');
                }).catch(err => {
                    this.managers.uiManager.showToast(`Download failed: ${err.message}`, 'error');
                });
            });

            // Favorite
            item.querySelector('.favorite-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.managers.webSocketManager.sendWebSocketCommand('add_to_playlist', {
                    playlist_name: 'Liked',
                    track_data: track
                }).then(() => {
                    this.managers.uiManager.showToast(`Added to Liked: ${track.title}`, 'success');
                    e.target.textContent = 'favorite';
                    e.target.style.color = '#ff2d55';
                });
            });
        });
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
