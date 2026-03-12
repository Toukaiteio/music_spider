// frontend/pages/MusicClawPage.js

class MusicClawPage {
    constructor() {
        this.appState = null;
        this.managers = null;
        this.messages = [
            {
                role: 'assistant',
                content: 'Hello! I am your Music Claw assistant. How can I help you today?',
                timestamp: new Date().toISOString()
            },
            {
                role: 'user',
                content: 'Search for some J-Pop songs from Bilibili.',
                timestamp: new Date().toISOString()
            },
            {
                role: 'assistant',
                content: 'Sure! I am searching for J-Pop songs on Bilibili...',
                tool_call: {
                    name: 'search_music',
                    parameters: { query: 'J-Pop', source: 'bilibili' }
                },
                tool_result: {
                    status: 'success',
                    data: [
                        { title: 'Pretender', artist: 'Official Hige Dandism' },
                        { title: 'Gurenge', artist: 'LiSA' }
                    ]
                },
                timestamp: new Date().toISOString()
            }
        ];
        this.history = [
            { id: 1, title: 'J-Pop search', date: '2026-03-12' },
            { id: 2, title: 'Download Official Hige Dandism', date: '2026-03-11' }
        ];
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
                        <span>New Conversation</span>
                    </div>
                    <div class="claw-actions">
                        <button id="claw-history-button" class="icon-button floating" title="View History">
                            <span class="material-icons">history</span>
                        </button>
                        <button id="claw-new-chat-button" class="icon-button floating" title="New Chat">
                            <span class="material-icons">add</span>
                        </button>
                    </div>
                </div>

                <div id="claw-chat-container" class="claw-chat-container">
                    <div id="claw-messages" class="claw-messages">
                        <!-- Messages will be rendered here -->
                    </div>
                </div>

                <div class="claw-input-area">
                    <div class="claw-input-wrapper">
                        <textarea id="claw-user-input" placeholder="Ask Music Claw something..." rows="1"></textarea>
                        <button id="claw-send-button" class="icon-button primary">
                            <span class="material-icons">send</span>
                        </button>
                    </div>
                </div>

                <div id="claw-history-drawer" class="claw-history-drawer hidden">
                    <div class="drawer-header">
                        <h3>Chat History</h3>
                        <button id="close-history-button" class="icon-button">
                            <span class="material-icons">close</span>
                        </button>
                    </div>
                    <div class="history-list">
                        ${this.history.map(item => `
                            <div class="history-item">
                                <span class="material-icons">chat_bubble_outline</span>
                                <div class="history-info">
                                    <span class="history-title">${item.title}</span>
                                    <span class="history-date">${item.date}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    onLoad(container, subPageId, appState, managers) {
        this.renderMessages();
        this._setupEventListeners(container);
    }

    renderMessages() {
        const messagesContainer = document.getElementById('claw-messages');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = this.messages.map(msg => this.renderMessage(msg)).join('');
        this.scrollToBottom();
    }

    renderMessage(msg) {
        let contentHtml = `<div class="message-text">${msg.content}</div>`;
        
        if (msg.tool_call || msg.tool_result) {
            contentHtml += this.renderToolResult(msg.tool_call, msg.tool_result);
        }

        const isAssistant = msg.role === 'assistant';
        const messageClass = isAssistant ? 'assistant no-bubble' : 'user';

        return `
            <div class="message ${messageClass}">
                <div class="message-content-wrapper">
                    <div class="message-body">
                        ${contentHtml}
                    </div>
                    <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                </div>
            </div>
        `;
    }

    renderToolResult(toolCall, toolResult) {
        const toolName = toolCall?.name || 'Unknown Tool';
        const data = toolResult?.data || {};
        
        return `
            <div class="tool-result-base">
                <div class="tool-result-header">
                    <span class="material-icons">build</span>
                    <span class="tool-name">${toolName}</span>
                    <div class="tool-status-tag success">
                        <span class="material-icons">check_circle</span>
                        Done
                    </div>
                </div>
                <div class="tool-result-body">
                    <pre><code>${JSON.stringify(data, null, 2)}</code></pre>
                </div>
            </div>
        `;
    }

    scrollToBottom() {
        const container = document.getElementById('claw-chat-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    _setupEventListeners(container) {
        const historyBtn = container.querySelector('#claw-history-button');
        const newChatBtn = container.querySelector('#claw-new-chat-button');
        const closeHistoryBtn = container.querySelector('#close-history-button');
        const historyDrawer = container.querySelector('#claw-history-drawer');
        const sendBtn = container.querySelector('#claw-send-button');
        const textarea = container.querySelector('#claw-user-input');

        if (historyBtn && historyDrawer) {
            historyBtn.addEventListener('click', () => {
                historyDrawer.classList.toggle('hidden');
            });
        }

        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => {
                if (confirm('Clear current conversation?')) {
                    this.messages = [{
                        role: 'assistant',
                        content: 'Hello! I am your Music Claw assistant. How can I help you today?',
                        timestamp: new Date().toISOString()
                    }];
                    this.renderMessages();
                }
            });
        }

        if (closeHistoryBtn && historyDrawer) {
            closeHistoryBtn.addEventListener('click', () => {
                historyDrawer.classList.add('hidden');
            });
        }

        if (textarea) {
            textarea.addEventListener('input', () => {
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
            });

            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._handleSendMessage();
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this._handleSendMessage());
        }
    }

    _handleSendMessage() {
        const textarea = document.getElementById('claw-user-input');
        const content = textarea.value.trim();
        if (!content) return;

        this.messages.push({
            role: 'user',
            content: content,
            timestamp: new Date().toISOString()
        });

        textarea.value = '';
        textarea.style.height = 'auto';
        this.renderMessages();

        // Simulate assistant thinking
        setTimeout(() => {
            this.messages.push({
                role: 'assistant',
                content: 'I received your message: "' + content + '". Functional logic will be implemented soon!',
                timestamp: new Date().toISOString()
            });
            this.renderMessages();
        }, 1000);
    }
}

export default MusicClawPage;
