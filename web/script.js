// Academi Web App JavaScript

class AcademiApp {
    constructor() {
        this.currentScreen = 'chat';
        this.messages = [
            {
                id: 1,
                text: "Hello! I'm Academi, your AI study assistant. Ask me anything or pick a topic below!",
                isUser: false,
                hasSource: false,
            }
        ];
        this.isTyping = false;
        this.messageId = 1;
        this.apiBaseUrl = 'http://localhost:8978/api/v1';
        this.authToken = localStorage.getItem('authToken') || null;
        this.documentMode = localStorage.getItem('academi_document_mode') === '1';
        this.researchEnabled = localStorage.getItem('academi_research') !== '0';
        this.docsList = [];
        this._statusResetTimer = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.switchScreen('chat');
        this.renderMessages();
    }

    bindEvents() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const screen = e.currentTarget.dataset.screen;
                this.switchScreen(screen);
            });
        });

        // Message input
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');

        messageInput.addEventListener('input', () => {
            this.updateSendButton();
            this.adjustTextareaHeight();
        });

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        sendButton.addEventListener('click', () => this.sendMessage());

        const docToggle = document.getElementById('documentModeToggle');
        const researchToggle = document.getElementById('researchToggle');
        if (docToggle) {
            docToggle.checked = this.documentMode;
            docToggle.addEventListener('change', () => {
                this.documentMode = docToggle.checked;
                localStorage.setItem('academi_document_mode', this.documentMode ? '1' : '0');
            });
        }
        if (researchToggle) {
            researchToggle.checked = this.researchEnabled;
            researchToggle.addEventListener('change', () => {
                this.researchEnabled = researchToggle.checked;
                localStorage.setItem('academi_research', this.researchEnabled ? '1' : '0');
            });
        }

        // Suggestions toggle
        const suggestionsToggle = document.getElementById('suggestionsToggle');
        if (suggestionsToggle) {
            suggestionsToggle.addEventListener('click', () => {
                this.toggleSuggestionsPanel();
            });
        }

        // Quick actions
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const query = e.currentTarget.dataset.query;
                this.toggleSuggestionsPanel();
                this.sendMessage(query);
            });
        });

        // Topic tags
        document.querySelectorAll('.tag-chip[data-topic]').forEach(tag => {
            tag.addEventListener('click', (e) => {
                const topic = e.currentTarget.dataset.topic;
                this.toggleSuggestionsPanel();
                this.sendMessage(`Tell me about ${topic}`);
            });
        });

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        const docSearch = document.getElementById('docSearch');
        if (docSearch) {
            docSearch.addEventListener('input', () => this.renderDocsGrid(docSearch.value.trim()));
        }

        const modal = document.getElementById('docModal');
        const modalClose = document.getElementById('docModalClose');
        const modalBackdrop = document.getElementById('docModalBackdrop');
        if (modalClose) modalClose.addEventListener('click', () => this.closeDocModal());
        if (modalBackdrop) modalBackdrop.addEventListener('click', () => this.closeDocModal());
    }

    switchScreen(screenName) {
        // Update active tab
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeTab = document.querySelector(`[data-screen="${screenName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
            screen.style.removeProperty('display');
        });

        const activeScreen = document.getElementById(`${screenName}Screen`);
        if (activeScreen) {
            activeScreen.classList.add('active');
        }

        this.currentScreen = screenName;
        this.updateUI();
        if (screenName === 'docs') {
            this.loadDocs();
        }
    }

    updateSendButton() {
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const hasText = messageInput.value.trim().length > 0;

        sendButton.disabled = !hasText;
        sendButton.style.opacity = hasText ? '1' : '0.5';
    }

    adjustTextareaHeight() {
        const textarea = document.getElementById('messageInput');
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }

    toggleSuggestionsPanel() {
        const panel = document.getElementById('suggestionsPanel');
        const toggleBtn = document.getElementById('suggestionsToggle');
        panel.classList.toggle('active');
        toggleBtn.classList.toggle('active');
    }

    async sendMessage(text = null) {
        const messageInput = document.getElementById('messageInput');
        const messageText = text || messageInput.value.trim();

        if (!messageText) return;

        // Add user message
        this.addMessage(messageText, true);
        messageInput.value = '';
        this.updateSendButton();
        this.adjustTextareaHeight();

        // Show typing indicator
        this.showTyping(true);

        // Call backend API (full history for multi-turn document agent)
        try {
            const response = await this.callAIChat();
            this.addMessage(response.text, false, response.sources);
            if (response.savedDocument) {
                this.flashStatus(`Saved to Docs: ${response.savedDocument.title}`);
                this.loadDocs();
            }
        } catch (error) {
            console.error('AI chat error:', error);
            this.addMessage('Sorry, I encountered an error. Please try again.', false, []);
        }

        this.showTyping(false);
    }

    addMessage(text, isUser, sources = []) {
        this.messageId++;
        const message = {
            id: this.messageId,
            text: text,
            isUser: isUser,
            hasSource: !isUser && sources.length > 0,
            sources: sources,
        };

        this.messages.push(message);
        this.renderMessages();
    }

    renderMessages() {
        const messagesContainer = document.getElementById('messages');
        messagesContainer.innerHTML = '';

        this.messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `message ${message.isUser ? 'user-message' : 'ai-message'} fade-in`;

            let sourcesHtml = '';
            if (message.hasSource && message.sources && message.sources.length > 0) {
                const iconFor = (t) => {
                    if (t === 'wiki') return '⌁';
                    if (t === 'paper') return '⧗';
                    if (t === 'internal') return '⟲';
                    return '⧉';
                };
                sourcesHtml = `
                    <div class="message-sources">
                        ${message.sources.map((source) => {
                            const title = this.escapeHtml(source.title || '');
                            const url = source.url ? String(source.url) : '';
                            const inner = url
                                ? `<a href="${this.escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="source-link">${title}</a>`
                                : `<span>${title}</span>`;
                            return `
                            <div class="source-item">
                                <span class="source-icon">${iconFor(source.type)}</span>
                                ${inner}
                            </div>`;
                        }).join('')}
                    </div>
                `;
            }

            messageElement.innerHTML = `
                <div class="message-content">
                    <p>${this.formatMessage(message.text)}</p>
                    ${sourcesHtml}
                    ${!message.isUser ? `
                        <div class="message-actions">
                            <button class="action-btn small">⍟ Save</button>
                            <button class="action-btn small">⧉ Share</button>
                            <button class="action-btn small">⎘ Copy</button>
                        </div>
                    ` : ''}
                </div>
            `;

            messagesContainer.appendChild(messageElement);
        });

        const scrollRoot = document.getElementById('messagesContainer');
        const scrollToBottom = () => {
            if (scrollRoot) {
                scrollRoot.scrollTop = scrollRoot.scrollHeight;
            }
        };
        requestAnimationFrame(() => {
            requestAnimationFrame(scrollToBottom);
        });
    }

    escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    formatMessage(text) {
        return this.escapeHtml(text);
    }

    buildApiMessages() {
        return this.messages.map((m) => ({
            role: m.isUser ? 'user' : 'assistant',
            content: m.text,
        }));
    }

    async callAIChat() {
        const headers = {
            'Content-Type': 'application/json',
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        const response = await fetch(`${this.apiBaseUrl}/ai/chat`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                messages: this.buildApiMessages(),
                context: {},
                document_mode: this.documentMode,
                disable_research: this.documentMode ? !this.researchEnabled : true,
            }),
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody.error || 'Failed to get AI response');
        }

        const data = await response.json();
        return {
            text: data.response,
            sources: data.sources || [],
            savedDocument: data.saved_document || null,
        };
    }

    flashStatus(msg) {
        const statusText = document.getElementById('statusText');
        if (!statusText) return;
        if (this._statusResetTimer) clearTimeout(this._statusResetTimer);
        statusText.textContent = msg;
        this._statusResetTimer = setTimeout(() => {
            this.updateUI();
            this._statusResetTimer = null;
        }, 4500);
    }

    async loadDocs() {
        const grid = document.getElementById('docsGrid');
        if (!grid) return;
        try {
            const headers = { Accept: 'application/json' };
            if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
            const res = await fetch(`${this.apiBaseUrl}/docs`, { headers });
            if (!res.ok) throw new Error('Failed to load docs');
            this.docsList = await res.json();
            const q = document.getElementById('docSearch')?.value?.trim() || '';
            this.renderDocsGrid(q);
        } catch (e) {
            console.error(e);
            this.docsList = [];
            this.renderDocsGrid('');
        }
    }

    renderDocsGrid(query) {
        const grid = document.getElementById('docsGrid');
        const emptyEl = document.getElementById('docsEmpty');
        if (!grid) return;
        grid.querySelectorAll('.doc-card').forEach((n) => n.remove());

        const q = (query || '').toLowerCase();
        let list = this.docsList;
        if (q) {
            list = this.docsList.filter((d) => {
                const blob = `${d.title || ''} ${d.ai_summary || ''} ${d.content || ''} ${(d.tags || []).join(' ')}`.toLowerCase();
                return blob.includes(q);
            });
        }

        if (!list.length) {
            if (emptyEl) emptyEl.hidden = false;
            return;
        }
        if (emptyEl) emptyEl.hidden = true;

        const sorted = [...list].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        for (const doc of sorted) {
            const card = document.createElement('div');
            card.className = 'doc-card glass';
            card.setAttribute('role', 'button');
            card.dataset.docId = doc.id;
            const tags = (doc.tags || []).slice(0, 6).map((t) => `<span class="tag-chip">${this.escapeHtml(t)}</span>`).join('');
            const rawSum = doc.ai_summary || (doc.content ? String(doc.content).slice(0, 220) : '') || '';
            const summary = this.escapeHtml(rawSum);
            const truncated = (doc.content && doc.content.length > 220) || (doc.ai_summary && doc.ai_summary.length > 220);
            const title = this.escapeHtml(doc.title || 'Untitled');
            card.innerHTML = `
                <div class="doc-preview"><div class="doc-icon">⧉</div></div>
                <div class="doc-info">
                    <h4>${title}</h4>
                    <p>${summary}${truncated ? '…' : ''}</p>
                    <div class="doc-tags truncated">${tags}</div>
                </div>
            `;
            card.addEventListener('click', () => this.openDocModal(doc.id));
            grid.appendChild(card);
        }
    }

    async openDocModal(docId) {
        let doc = this.docsList.find((d) => d.id === docId);
        const modal = document.getElementById('docModal');
        const titleEl = document.getElementById('docModalTitle');
        const bodyEl = document.getElementById('docModalBody');
        if (!modal || !titleEl || !bodyEl) return;

        if (!doc || !doc.content) {
            try {
                const headers = { Accept: 'application/json' };
                if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
                const res = await fetch(`${this.apiBaseUrl}/docs/${encodeURIComponent(docId)}`, { headers });
                if (res.ok) doc = await res.json();
            } catch (e) {
                console.error(e);
            }
        }
        if (!doc) return;

        titleEl.textContent = doc.title || 'Document';
        bodyEl.textContent = doc.content || doc.ai_summary || '(No body)';
        modal.hidden = false;
    }

    closeDocModal() {
        const modal = document.getElementById('docModal');
        if (modal) modal.hidden = true;
    }

    generateAIResponse(query) {
        const responses = {
            summarize: "Here's a concise summary of the topic:\n\n• Key concept 1: The fundamental principles\n• Key concept 2: The practical applications\n• Key concept 3: The future implications\n\nWould you like me to elaborate on any specific point?",
            explain: "Let me break this down step by step:\n\n1. First, we need to understand the basic framework\n2. Then we look at how the components interact\n3. Finally, we apply this to real-world scenarios\n\nThis approach will help you build a solid understanding.",
            default: "Great question! Based on my analysis across multiple sources:\n\nThe core concept revolves around three main pillars:\n\n📌 Theory — The foundational principles\n📌 Practice — Real-world applications\n📌 Innovation — Emerging developments\n\nI've pulled information from academic papers, community discussions, and web sources. Check the sources below for full references.",
        };

        const lowerQuery = query.toLowerCase();
        if (lowerQuery.includes('summarize')) return responses.summarize;
        if (lowerQuery.includes('explain')) return responses.explain;
        return responses.default;
    }

    showTyping(show) {
        const typingIndicator = document.getElementById('typingIndicator');
        const statusGlow = document.getElementById('statusGlow');
        const statusText = document.getElementById('statusText');

        if (show) {
            typingIndicator.style.display = 'flex';
            statusGlow.classList.add('active');
            statusText.textContent = 'Thinking...';
            this.isTyping = true;
        } else {
            typingIndicator.style.display = 'none';
            statusGlow.classList.remove('active');
            statusText.textContent = 'Online';
            this.isTyping = false;
        }
    }

    toggleTheme() {
        const root = document.documentElement;
        const currentTheme = root.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        root.setAttribute('data-theme', newTheme);
        document.getElementById('themeToggle').textContent = newTheme === 'dark' ? '🌙 Dark' : '☀️ Light';

        // Update theme colors (simplified)
        if (newTheme === 'light') {
            root.style.setProperty('--bg-primary', '#F7F9FC');
            root.style.setProperty('--bg-secondary', '#FFFFFF');
            root.style.setProperty('--text-primary', '#0A0F1C');
            root.style.setProperty('--text-secondary', '#5C6A8A');
        } else {
            root.style.setProperty('--bg-primary', '#0A0F1C');
            root.style.setProperty('--bg-secondary', '#12182A');
            root.style.setProperty('--text-primary', '#FFFFFF');
            root.style.setProperty('--text-secondary', '#A8B2D1');
        }
    }

    updateUI() {
        // Update status based on current screen
        const statusText = document.getElementById('statusText');
        if (this.currentScreen === 'chat') {
            statusText.textContent = this.isTyping ? 'Thinking...' : 'Online';
        } else {
            statusText.textContent = 'Ready';
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AcademiApp();
});

// Add some mobile-specific enhancements
if ('serviceWorker' in navigator) {
    // Register service worker for PWA capabilities
    window.addEventListener('load', () => {
        // navigator.serviceWorker.register('/sw.js');
    });
}

// Touch feedback
document.addEventListener('touchstart', (e) => {
    if (e.target.classList.contains('tab-btn') || e.target.classList.contains('action-btn')) {
        e.target.style.transform = 'scale(0.95)';
    }
}, { passive: true });

document.addEventListener('touchend', (e) => {
    if (e.target.classList.contains('tab-btn') || e.target.classList.contains('action-btn')) {
        e.target.style.transform = '';
    }
}, { passive: true });