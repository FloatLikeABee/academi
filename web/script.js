// Academi Web App JavaScript

/** Backend /api/v1 base. On real devices, localhost is wrong — use page hostname + academi-api-port, or set meta/localStorage. */
function resolveAcademiApiBaseUrl() {
    try {
        const stored = localStorage.getItem('academi_api_base');
        if (stored && /^https?:\/\//i.test(stored.trim())) {
            return stored.trim().replace(/\/+$/, '');
        }
    } catch (_) {
        /* private mode */
    }

    const meta = document.querySelector('meta[name="academi-api-base"]');
    const metaBase = meta?.getAttribute('content')?.trim();
    if (metaBase && /^https?:\/\//i.test(metaBase)) {
        return metaBase.replace(/\/+$/, '');
    }

    let apiPort = '8978';
    const portMeta = document.querySelector('meta[name="academi-api-port"]');
    if (portMeta?.getAttribute('content')?.trim()) {
        apiPort = portMeta.getAttribute('content').trim();
    }

    const { protocol, hostname } = window.location;
    const isLocal =
        !hostname ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]';

    if (isLocal) {
        return `http://localhost:${apiPort}/api/v1`;
    }

    const scheme = protocol === 'https:' ? 'https' : 'http';
    return `${scheme}://${hostname}:${apiPort}/api/v1`;
}

async function readApiErrorResponse(res) {
    const text = await res.text();
    try {
        const j = JSON.parse(text);
        if (j && typeof j.error === 'string' && j.error) return j.error;
    } catch (_) {
        /* not JSON */
    }
    const hint = text && text.trim() ? text.trim().slice(0, 180) : '';
    return hint || `Request failed (${res.status})`;
}

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
        this.apiBaseUrl = resolveAcademiApiBaseUrl();
        this.authToken = localStorage.getItem('authToken') || null;
        this.documentMode = localStorage.getItem('academi_document_mode') === '1';
        this.researchEnabled = localStorage.getItem('academi_research') !== '0';
        this.helpYouLearnMode = localStorage.getItem('academi_help_learn') === '1';
        this.pendingDocIds = [];
        this.docsList = [];
        this._statusResetTimer = null;
        this._learnAnalysisText = '';
        this._learnAnalysisTitle = 'Learning analysis';
        this.currentSessionId = null;
        this._persistTimer = null;
        this.guideSubjects = [];
        this.guideSelectedSubject = null;
        this.guideList = [];
        this.guideActive = null;
        this.currentUser = null;
        try {
            this.currentUser = JSON.parse(localStorage.getItem('authUser') || 'null');
        } catch {
            this.currentUser = null;
        }
        this._communityDetailPostId = null;
        this._guideEditorId = null;

        this.init();
    }

    init() {
        this.bindEvents();
        void this.ensureMockSession().then(() => {
            this.applyProfileUser();
        });
        this.switchScreen('chat');
        void this.bootstrapChatSession().finally(() => {
            this.updateSendButton();
        });
    }

    async ensureMockSession() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/auth/mock`, { method: 'POST' });
            if (!res.ok) return;
            const data = await res.json();
            if (data.token) {
                this.authToken = data.token;
                localStorage.setItem('authToken', data.token);
            }
            if (data.user) {
                this.currentUser = data.user;
                localStorage.setItem('authUser', JSON.stringify(data.user));
            }
            this.applyProfileUser();
        } catch (e) {
            console.warn('Demo session:', e);
        }
    }

    applyProfileUser() {
        const el = document.getElementById('profileUserName');
        if (!el) return;
        const name = this.currentUser?.name || this.currentUser?.email || 'Guest';
        el.textContent = name;
    }

    authBearerHeaders(extra = {}) {
        const h = { ...extra };
        if (this.authToken) h['Authorization'] = `Bearer ${this.authToken}`;
        return h;
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

        const helpLearnToggle = document.getElementById('helpLearnToggle');
        if (helpLearnToggle) {
            helpLearnToggle.checked = this.helpYouLearnMode;
            helpLearnToggle.addEventListener('change', () => {
                this.helpYouLearnMode = helpLearnToggle.checked;
                localStorage.setItem('academi_help_learn', this.helpYouLearnMode ? '1' : '0');
                this.updateSendButton();
            });
        }

        const chatFileInput = document.getElementById('chatFileInput');
        if (chatFileInput) {
            chatFileInput.addEventListener('change', (e) => {
                const files = e.target.files;
                if (!files?.length) return;
                void this.uploadChatFiles(files).finally(() => {
                    e.target.value = '';
                });
            });
        }

        document.getElementById('createDocBtn')?.addEventListener('click', () => this.openCreateDocModal());
        document.getElementById('createDocModalClose')?.addEventListener('click', () => this.closeCreateDocModal());
        document.getElementById('createDocModalBackdrop')?.addEventListener('click', () => this.closeCreateDocModal());
        document.getElementById('createDocCancel')?.addEventListener('click', () => this.closeCreateDocModal());
        document.getElementById('createDocSaveBtn')?.addEventListener('click', () => this.submitCreateDoc(false));
        document.getElementById('createDocSaveAnalyzeBtn')?.addEventListener('click', () => this.submitCreateDoc(true));
        document.getElementById('createDocFile')?.addEventListener('change', () => this.updateCreateDocFileName());

        document.getElementById('learnModalClose')?.addEventListener('click', () => this.closeLearnModal());
        document.getElementById('learnModalBackdrop')?.addEventListener('click', () => this.closeLearnModal());
        document.getElementById('learnModalDismiss')?.addEventListener('click', () => this.closeLearnModal());
        document.getElementById('learnModalSaveDoc')?.addEventListener('click', () => this.saveLearnAnalysisToDocs());

        document.getElementById('docsGrid')?.addEventListener('click', (e) => {
            const learnBtn = e.target.closest('.doc-learn-btn');
            if (learnBtn) {
                e.preventDefault();
                e.stopPropagation();
                const id = learnBtn.dataset.docId;
                if (id) this.runLearnForDoc(id);
                return;
            }
        });

        // Suggestions toggle + dismiss when tapping outside the panel (mobile/desktop)
        const suggestionsToggle = document.getElementById('suggestionsToggle');
        if (suggestionsToggle) {
            suggestionsToggle.addEventListener('click', () => {
                this.toggleSuggestionsPanel();
            });
        }
        const suggestionsPanel = document.getElementById('suggestionsPanel');
        if (suggestionsPanel && suggestionsToggle) {
            const dismissIfOutside = (e) => {
                if (!suggestionsPanel.classList.contains('active')) return;
                const t = e.target;
                if (suggestionsPanel.contains(t) || suggestionsToggle.contains(t)) return;
                this.closeSuggestionsPanel();
            };
            document.addEventListener('pointerdown', dismissIfOutside, { passive: true });
        }

        // Quick actions
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const query = e.currentTarget.dataset.query;
                this.closeSuggestionsPanel();
                this.sendMessage(query);
            });
        });

        // Topic tags
        document.querySelectorAll('.tag-chip[data-topic]').forEach(tag => {
            tag.addEventListener('click', (e) => {
                const topic = e.currentTarget.dataset.topic;
                this.closeSuggestionsPanel();
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

        document.getElementById('chatHistoryBtn')?.addEventListener('click', () => this.openChatHistoryDrawer());
        document.getElementById('chatHistoryBackdrop')?.addEventListener('click', () => this.closeChatHistoryDrawer());
        document.getElementById('chatHistoryClose')?.addEventListener('click', () => this.closeChatHistoryDrawer());
        document.getElementById('newChatSessionBtn')?.addEventListener('click', () => this.createNewChatSession());

        document.getElementById('chatHistoryList')?.addEventListener('click', (e) => {
            const del = e.target.closest('.chat-history-del');
            if (del) {
                e.preventDefault();
                e.stopPropagation();
                const id = del.dataset.id;
                if (id) void this.deleteChatSession(id);
                return;
            }
            const item = e.target.closest('.chat-history-item');
            if (item) {
                const id = item.dataset.id;
                if (id) void this.loadChatSession(id);
            }
        });

        document.getElementById('messages')?.addEventListener('click', (e) => {
            const saveBtn = e.target.closest('.save-ai-btn');
            if (!saveBtn) return;
            const messageId = Number(saveBtn.dataset.messageId || 0);
            if (!messageId) return;
            void this.saveAIMessageToDocs(messageId, saveBtn);
        });

        document.getElementById('guideSubjectPickerBtn')?.addEventListener('click', () => this.openGuideSubjectModal());
        document.getElementById('guideSubjectModalClose')?.addEventListener('click', () => this.closeGuideSubjectModal());
        document.getElementById('guideSubjectModalBackdrop')?.addEventListener('click', () => this.closeGuideSubjectModal());
        document.getElementById('guideSubjectModalList')?.addEventListener('click', (e) => {
            const card = e.target.closest('.guide-subject-card');
            if (!card?.dataset?.subjectId) return;
            void this.openGuideSubject(card.dataset.subjectId);
        });

        document.getElementById('guideBackToList')?.addEventListener('click', () => this.backToGuideList());
        document.getElementById('guideCatalogList')?.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.guide-edit-btn');
            if (editBtn?.dataset?.guideId) {
                e.preventDefault();
                e.stopPropagation();
                void this.openGuideEditorEdit(editBtn.dataset.guideId);
                return;
            }
            const delBtn = e.target.closest('.guide-delete-btn');
            if (delBtn?.dataset?.guideId) {
                e.preventDefault();
                e.stopPropagation();
                if (!window.confirm('Delete this guide permanently?')) return;
                void this.deleteUserGuide(delBtn.dataset.guideId);
                return;
            }
            const openBtn = e.target.closest('.guide-catalog-open');
            if (openBtn?.dataset?.guideId) {
                void this.openGuideDetail(openBtn.dataset.guideId);
            }
        });

        document.getElementById('guideFabBtn')?.addEventListener('click', () => void this.openGuideEditorCreate());
        document.getElementById('guideEditorModalClose')?.addEventListener('click', () => this.closeGuideEditorModal());
        document.getElementById('guideEditorModalBackdrop')?.addEventListener('click', () => this.closeGuideEditorModal());
        document.getElementById('guideEditorCancelBtn')?.addEventListener('click', () => this.closeGuideEditorModal());
        document.getElementById('guideEditorSaveBtn')?.addEventListener('click', () => void this.submitGuideEditor());
        document.getElementById('guideEditorDeleteBtn')?.addEventListener('click', () => void this.deleteGuideFromEditor());
        document.getElementById('guideFormAddStepBtn')?.addEventListener('click', () => this.appendGuideFormStepRow(null));
        document.getElementById('guideFormNewSubjectToggle')?.addEventListener('change', (e) => {
            const on = e.target.checked;
            const fields = document.getElementById('guideFormNewSubjectFields');
            const sel = document.getElementById('guideFormSubjectSelect');
            if (fields) fields.hidden = !on;
            if (sel) sel.disabled = on;
        });

        document.getElementById('guideUserSubjectsList')?.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.guide-user-subject-edit');
            if (editBtn?.dataset?.subjectId) {
                void this.promptEditUserSubject(editBtn.dataset.subjectId);
                return;
            }
            const delBtn = e.target.closest('.guide-user-subject-delete');
            if (delBtn?.dataset?.subjectId) {
                void this.deleteUserSubject(delBtn.dataset.subjectId);
            }
        });

        document.getElementById('guideDetailHeader')?.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.guide-detail-edit-btn');
            if (editBtn?.dataset?.guideId) {
                void this.openGuideEditorEdit(editBtn.dataset.guideId);
                return;
            }
            const delBtn = e.target.closest('.guide-detail-delete-btn');
            if (delBtn?.dataset?.guideId) {
                if (!window.confirm('Delete this guide permanently?')) return;
                void this.deleteUserGuide(delBtn.dataset.guideId);
            }
        });

        document.getElementById('guideDetailSteps')?.addEventListener('change', (e) => {
            const cb = e.target.closest('input[type="checkbox"].guide-step-check');
            if (!cb || !this.guideActive) return;
            const stepId = Number(cb.dataset.stepId || 0);
            if (!stepId) return;
            this.setGuideStepDone(this.guideActive.id, stepId, cb.checked);
            this.refreshGuideDetailProgress();
        });

        document.getElementById('communityAddPostBtn')?.addEventListener('click', () => this.openCommunityCreateModal());
        document.getElementById('communityCreateModalClose')?.addEventListener('click', () => this.closeCommunityCreateModal());
        document.getElementById('communityCreateModalBackdrop')?.addEventListener('click', () => this.closeCommunityCreateModal());
        document.getElementById('communityCreateModalCancel')?.addEventListener('click', () => this.closeCommunityCreateModal());
        document.getElementById('communityModalPostSubmit')?.addEventListener('click', () => void this.submitCommunityPost());

        document.getElementById('communityPostDetailClose')?.addEventListener('click', () => this.closeCommunityPostDetailModal());
        document.getElementById('communityPostDetailBackdrop')?.addEventListener('click', () => this.closeCommunityPostDetailModal());
        document.getElementById('communityDetailVoteUp')?.addEventListener('click', () => {
            if (this._communityDetailPostId) void this.voteCommunityPost(this._communityDetailPostId, 'up');
        });
        document.getElementById('communityDetailVoteDown')?.addEventListener('click', () => {
            if (this._communityDetailPostId) void this.voteCommunityPost(this._communityDetailPostId, 'down');
        });
        document.getElementById('communityDetailReplySend')?.addEventListener('click', () =>
            void this.submitCommunityCommentFromDetail()
        );

        document.getElementById('communityFeed')?.addEventListener('click', (e) => {
            const row = e.target.closest('.community-post-row');
            if (row?.dataset?.postId) {
                e.preventDefault();
                void this.openCommunityPostDetail(row.dataset.postId);
            }
        });

        document.getElementById('communityPostDetailModal')?.addEventListener('click', (e) => {
            const od = e.target.closest('.community-detail-open-doc');
            if (od?.dataset?.docId) {
                e.preventDefault();
                const id = od.dataset.docId;
                this.closeCommunityPostDetailModal();
                this.switchScreen('docs');
                void this.loadDocs().then(() => this.openDocModal(id));
            }
        });

        document.getElementById('docsGrid')?.addEventListener('click', (e) => {
            const pub = e.target.closest('.doc-publish-btn');
            if (pub?.dataset?.docId) {
                e.stopPropagation();
                void this.publishDocToCommunity(pub.dataset.docId);
                return;
            }
            const learn = e.target.closest('.doc-learn-btn');
            if (learn?.dataset?.docId) {
                e.stopPropagation();
                void this.runLearnForDoc(learn.dataset.docId);
                return;
            }
            const card = e.target.closest('.doc-card');
            if (card?.dataset?.docId) {
                this.openDocModal(card.dataset.docId);
            }
        });
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
        if (screenName === 'community') {
            void this.loadCommunity();
        }
        if (screenName === 'guide') {
            void this.loadGuideScreen();
        }
    }

    updateSendButton() {
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const hasText = messageInput.value.trim().length > 0;
        const hasAttach = this.pendingDocIds.length > 0;

        sendButton.disabled = !hasText && !hasAttach;
        sendButton.style.opacity = hasText || hasAttach ? '1' : '0.5';
        const badge = document.getElementById('attachBadge');
        if (badge) {
            if (this.pendingDocIds.length > 0) {
                badge.hidden = false;
                badge.textContent = `${this.pendingDocIds.length} file(s)`;
            } else {
                badge.hidden = true;
            }
        }
    }

    adjustTextareaHeight() {
        const textarea = document.getElementById('messageInput');
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(36, Math.min(textarea.scrollHeight, 100)) + 'px';
    }

    closeSuggestionsPanel() {
        const panel = document.getElementById('suggestionsPanel');
        const toggleBtn = document.getElementById('suggestionsToggle');
        if (!panel || !toggleBtn) return;
        panel.classList.remove('active');
        toggleBtn.classList.remove('active');
    }

    toggleSuggestionsPanel() {
        const panel = document.getElementById('suggestionsPanel');
        const toggleBtn = document.getElementById('suggestionsToggle');
        if (!panel || !toggleBtn) return;
        panel.classList.toggle('active');
        toggleBtn.classList.toggle('active');
    }

    async ensureSession() {
        if (this.currentSessionId) return;
        const res = await fetch(`${this.apiBaseUrl}/chat-sessions`, {
            method: 'POST',
            headers: this.sessionHeaders(),
        });
        if (!res.ok) throw new Error('Could not create session');
        const sess = await res.json();
        this.currentSessionId = sess.id;
        localStorage.setItem('academi_chat_session_id', sess.id);
        void this.renderChatHistoryList();
    }

    async sendMessage(text = null) {
        try {
            await this.ensureSession();
        } catch (e) {
            console.error(e);
        }

        const messageInput = document.getElementById('messageInput');
        let messageText = text != null ? text : messageInput.value.trim();

        if (!messageText && this.pendingDocIds.length === 0) return;

        if (!messageText && this.pendingDocIds.length > 0) {
            messageText = this.helpYouLearnMode
                ? 'Help me learn from the attached material with research context where useful.'
                : 'Here are attached documents — please read them in context of our conversation.';
        }

        this.addMessage(messageText, true);
        messageInput.value = '';
        this.updateSendButton();
        this.adjustTextareaHeight();

        this.showTyping(true);

        const docIdsSnapshot = [...this.pendingDocIds];
        try {
            const response = await this.callAIChat();
            this.pendingDocIds = [];
            this.updateSendButton();
            this.addMessage(response.text, false, response.sources);
            if (response.savedDocument) {
                this.flashStatus(`Saved to Docs: ${response.savedDocument.title}`);
                this.loadDocs();
            }
            if (response.offerSaveAnalysis) {
                this._learnAnalysisText = response.text;
                this._learnAnalysisTitle = `Learning notes (${new Date().toLocaleString()})`;
                if (window.confirm('Save this analysis as a new document in Docs?')) {
                    await this.saveLearnAnalysisToDocs();
                }
            }
        } catch (error) {
            console.error('AI chat error:', error);
            this.pendingDocIds = docIdsSnapshot;
            this.updateSendButton();
            this.addMessage('Sorry, I encountered an error. Please try again.', false, []);
        }

        this.persistSession();
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
                    <div class="message-text">${this.formatMessage(message.text)}</div>
                    ${sourcesHtml}
                    ${!message.isUser ? `
                        <div class="message-actions">
                            <button class="action-btn small save-ai-btn" data-message-id="${message.id}" type="button">⍟ Save</button>
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
        return this.markdownToHtml(text);
    }

    inlineMarkdown(text) {
        let out = text;
        out = out.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
        out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="source-link">$1</a>');
        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        return out;
    }

    markdownToHtml(text) {
        const escaped = this.escapeHtml(String(text || '')).replace(/\r\n/g, '\n');
        const codeBlocks = [];
        const withCodeTokens = escaped.replace(/```([a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
            const token = `@@CODE_BLOCK_${codeBlocks.length}@@`;
            const languageClass = lang ? ` lang-${lang.toLowerCase()}` : '';
            codeBlocks.push(`<pre class="md-code-block"><code class="${languageClass}">${code.trim()}</code></pre>`);
            return token;
        });

        const lines = withCodeTokens.split('\n');
        const html = [];
        const paragraph = [];
        let inUl = false;
        let inOl = false;

        const isTableLine = (line) => {
            const trimmed = line.trim();
            return trimmed.includes('|') && /^\|?.+\|.+\|?$/.test(trimmed);
        };
        const isTableSeparator = (line) => {
            const trimmed = line.trim();
            return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);
        };
        const parseTableCells = (line) => {
            const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
            return trimmed.split('|').map((cell) => this.inlineMarkdown(cell.trim()));
        };
        const emitTable = (headerLine, separatorLine, bodyLines) => {
            const headerCells = parseTableCells(headerLine);
            const separators = separatorLine
                .trim()
                .replace(/^\|/, '')
                .replace(/\|$/, '')
                .split('|')
                .map((s) => s.trim());
            const aligns = separators.map((s) => {
                const left = s.startsWith(':');
                const right = s.endsWith(':');
                if (left && right) return 'center';
                if (right) return 'right';
                return 'left';
            });
            const rows = bodyLines.map(parseTableCells);
            const headHtml = headerCells
                .map((cell, i) => `<th style="text-align:${aligns[i] || 'left'}">${cell}</th>`)
                .join('');
            const bodyHtml = rows
                .map((cells) => {
                    const row = cells
                        .map((cell, i) => `<td style="text-align:${aligns[i] || 'left'}">${cell}</td>`)
                        .join('');
                    return `<tr>${row}</tr>`;
                })
                .join('');
            return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
        };

        const flushParagraph = () => {
            if (!paragraph.length) return;
            html.push(`<p>${paragraph.join('<br>')}</p>`);
            paragraph.length = 0;
        };
        const closeLists = () => {
            if (inUl) {
                html.push('</ul>');
                inUl = false;
            }
            if (inOl) {
                html.push('</ol>');
                inOl = false;
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trimEnd();
            const codeTokenMatch = line.match(/^@@CODE_BLOCK_(\d+)@@$/);
            if (codeTokenMatch) {
                flushParagraph();
                closeLists();
                html.push(codeBlocks[Number(codeTokenMatch[1])] || '');
                continue;
            }

            if (!line.trim()) {
                flushParagraph();
                closeLists();
                continue;
            }

            // GFM-style pipe table:
            // | h1 | h2 |
            // | --- | ---: |
            // | v1 | v2 |
            if (isTableLine(line)) {
                const next = lines[i + 1] || '';
                if (next && isTableSeparator(next)) {
                    flushParagraph();
                    closeLists();
                    const body = [];
                    let j = i + 2;
                    while (j < lines.length && isTableLine(lines[j]) && !isTableSeparator(lines[j])) {
                        body.push(lines[j]);
                        j++;
                    }
                    html.push(emitTable(line, next, body));
                    i = j - 1;
                    continue;
                }
            }

            const heading = line.match(/^(#{1,6})\s+(.+)$/);
            if (heading) {
                flushParagraph();
                closeLists();
                const level = heading[1].length;
                html.push(`<h${level}>${this.inlineMarkdown(heading[2])}</h${level}>`);
                continue;
            }

            const ul = line.match(/^[-*]\s+(.+)$/);
            if (ul) {
                flushParagraph();
                if (inOl) {
                    html.push('</ol>');
                    inOl = false;
                }
                if (!inUl) {
                    html.push('<ul>');
                    inUl = true;
                }
                html.push(`<li>${this.inlineMarkdown(ul[1])}</li>`);
                continue;
            }

            const ol = line.match(/^\d+\.\s+(.+)$/);
            if (ol) {
                flushParagraph();
                if (inUl) {
                    html.push('</ul>');
                    inUl = false;
                }
                if (!inOl) {
                    html.push('<ol>');
                    inOl = true;
                }
                html.push(`<li>${this.inlineMarkdown(ol[1])}</li>`);
                continue;
            }

            paragraph.push(this.inlineMarkdown(line));
        }

        flushParagraph();
        closeLists();
        return html.join('');
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
                disable_research: (this.documentMode || this.helpYouLearnMode) ? !this.researchEnabled : true,
                doc_ids: [...this.pendingDocIds],
                help_you_learn: this.helpYouLearnMode,
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
            offerSaveAnalysis: !!data.offer_save_analysis,
        };
    }

    isDocLearnable(doc) {
        const t = (doc.type || '').toLowerCase();
        return ['markdown', 'text', 'pdf', 'image'].includes(t);
    }

    async uploadChatFiles(fileList) {
        await this.ensureMockSession();
        const headers = {};
        if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
        for (const file of fileList) {
            const fd = new FormData();
            fd.append('file', file);
            try {
                const res = await fetch(`${this.apiBaseUrl}/docs/upload`, { method: 'POST', headers, body: fd });
                if (!res.ok) throw new Error(await readApiErrorResponse(res));
                const doc = await res.json();
                if (doc.id) this.pendingDocIds.push(doc.id);
            } catch (e) {
                console.error(e);
                alert(e.message || 'Upload failed');
            }
        }
        if (!this.helpYouLearnMode && this.pendingDocIds.length > 0) {
            /* user may want learn mode for uploads */
        }
        this.updateSendButton();
        this.flashStatus(`${this.pendingDocIds.length} file(s) ready to send`);
    }

    openCreateDocModal() {
        document.getElementById('createDocTitle').value = '';
        document.getElementById('createDocContent').value = '';
        const f = document.getElementById('createDocFile');
        if (f) f.value = '';
        this.updateCreateDocFileName();
        document.getElementById('createDocModal').hidden = false;
    }

    closeCreateDocModal() {
        document.getElementById('createDocModal').hidden = true;
        this.updateCreateDocFileName();
    }

    updateCreateDocFileName() {
        const fileEl = document.getElementById('createDocFile');
        const nameEl = document.getElementById('createDocFileName');
        if (!nameEl) return;
        const fileName = fileEl?.files?.[0]?.name;
        nameEl.textContent = fileName ? `Selected: ${fileName}` : 'No file selected';
    }

    async submitCreateDoc(runLearnAfter) {
        const title = document.getElementById('createDocTitle').value.trim();
        const content = document.getElementById('createDocContent').value.trim();
        const fileEl = document.getElementById('createDocFile');
        const file = fileEl?.files?.[0];

        if (file) {
            const fd = new FormData();
            fd.append('file', file);
            if (title) fd.append('title', title);
            try {
                const res = await fetch(`${this.apiBaseUrl}/docs/upload`, {
                    method: 'POST',
                    headers: this.authBearerHeaders(),
                    body: fd,
                });
                if (!res.ok) throw new Error(await readApiErrorResponse(res));
                const doc = await res.json();
                this.closeCreateDocModal();
                if (fileEl) fileEl.value = '';
                this.updateCreateDocFileName();
                await this.loadDocs();
                this.flashStatus(`Uploaded: ${doc.title || 'Document'}`);
                if (runLearnAfter && doc.id) {
                    await this.runLearnForDoc(doc.id);
                }
            } catch (e) {
                console.error(e);
                alert(e.message || 'Upload failed');
            }
            return;
        }

        if (!title || !content) {
            alert('Add a file, or fill in both title and content.');
            return;
        }
        const headers = this.authBearerHeaders({
            'Content-Type': 'application/json',
            Accept: 'application/json',
        });
        try {
            const res = await fetch(`${this.apiBaseUrl}/docs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    title,
                    type: 'markdown',
                    content,
                    tags: ['#created', '#notes'],
                }),
            });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            const doc = await res.json();
            this.closeCreateDocModal();
            await this.loadDocs();
            this.flashStatus(`Saved: ${doc.title}`);
            if (runLearnAfter && doc.id) {
                await this.runLearnForDoc(doc.id);
            }
        } catch (e) {
            console.error(e);
            alert(e.message || 'Could not save document');
        }
    }

    async runLearnForDoc(docId) {
        const doc = this.docsList.find((d) => d.id === docId);
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
        const learnModal = document.getElementById('learnModal');
        const bodyEl = document.getElementById('learnModalBody');
        const heading = document.getElementById('learnModalHeading');
        if (heading) heading.textContent = doc ? `Help you learn · ${doc.title}` : 'Help you learn';
        if (bodyEl) bodyEl.textContent = 'Analyzing…';
        if (learnModal) learnModal.hidden = false;
        try {
            const res = await fetch(`${this.apiBaseUrl}/ai/learn`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    doc_id: docId,
                    disable_research: !this.researchEnabled,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Analysis failed');
            }
            const data = await res.json();
            this._learnAnalysisText = data.response || '';
            this._learnAnalysisTitle = `Learning: ${doc ? doc.title : 'Document'}`;
            if (bodyEl) bodyEl.textContent = this._learnAnalysisText;
        } catch (e) {
            console.error(e);
            if (bodyEl) bodyEl.textContent = e.message || 'Error';
        }
    }

    closeLearnModal() {
        document.getElementById('learnModal').hidden = true;
    }

    async saveLearnAnalysisToDocs() {
        const content = this._learnAnalysisText;
        if (!content || !content.trim()) return;
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
        try {
            const res = await fetch(`${this.apiBaseUrl}/docs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    title: this._learnAnalysisTitle || 'Learning analysis',
                    type: 'markdown',
                    content,
                    tags: ['#analysis', '#help-you-learn'],
                }),
            });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            this.closeLearnModal();
            await this.loadDocs();
            this.flashStatus('Analysis saved to Docs');
        } catch (e) {
            console.error(e);
            alert(e.message || 'Could not save analysis');
        }
    }

    stripIntroAndAsk(text) {
        const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
        const cleaned = [...lines];

        while (cleaned.length && !cleaned[0].trim()) cleaned.shift();
        while (cleaned.length && !cleaned[cleaned.length - 1].trim()) cleaned.pop();

        const introPattern = /^(hi|hello|hey|great question|good question|nice question|sure|absolutely|of course|let me|here(?:'| i)s|thanks for|happy to)/i;
        const leadingQuestionPattern = /^(.*\?)$/;
        const trailingAskPattern = /(\?$)|(would you like|do you want|want me to|let me know|anything else|follow up)/i;

        if (cleaned.length && introPattern.test(cleaned[0].trim())) {
            cleaned.shift();
        }
        if (cleaned.length && leadingQuestionPattern.test(cleaned[0].trim()) && cleaned[0].trim().length < 120) {
            cleaned.shift();
        }
        while (cleaned.length && trailingAskPattern.test(cleaned[cleaned.length - 1].trim())) {
            cleaned.pop();
        }

        while (cleaned.length && !cleaned[0].trim()) cleaned.shift();
        while (cleaned.length && !cleaned[cleaned.length - 1].trim()) cleaned.pop();
        return cleaned.join('\n').trim();
    }

    generateDocTitleFromContent(content) {
        const firstLine = String(content || '')
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.length > 0) || '';

        if (!firstLine) return 'Study notes';

        let title = firstLine.replace(/^[-*#>\d.\s]+/, '').trim();
        if (!title) title = firstLine.trim();
        if (!title) return 'Study notes';

        const asciiWords = title
            .replace(/[^\w\s-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(Boolean)
            .slice(0, 8);

        if (asciiWords.length > 0) {
            const candidate = asciiWords.join(' ');
            const titled = candidate.charAt(0).toUpperCase() + candidate.slice(1);
            return titled.length > 70 ? `${titled.slice(0, 67).trimEnd()}...` : titled;
        }

        const raw = title.replace(/\s+/g, ' ').trim();
        return raw.length > 70 ? `${raw.slice(0, 67).trimEnd()}...` : raw;
    }

    async saveAIMessageToDocs(messageId, buttonEl) {
        const message = this.messages.find((m) => m.id === messageId && !m.isUser);
        if (!message) return;

        const cleanedContent = this.stripIntroAndAsk(message.text);
        const contentToSave = cleanedContent || message.text;
        const title = this.generateDocTitleFromContent(contentToSave);

        const originalText = buttonEl?.textContent || '⍟ Save';
        if (buttonEl) {
            buttonEl.disabled = true;
            buttonEl.textContent = 'Saving...';
        }

        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

        try {
            const res = await fetch(`${this.apiBaseUrl}/docs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    title,
                    type: 'markdown',
                    content: contentToSave,
                    tags: ['#saved-from-chat'],
                }),
            });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            const doc = await res.json();
            this.flashStatus(`Saved to Docs: ${doc.title || title}`);
            await this.loadDocs();
            if (buttonEl) buttonEl.textContent = 'Saved';
        } catch (e) {
            console.error(e);
            alert(e.message || 'Could not save this response');
            if (buttonEl) buttonEl.textContent = originalText;
        } finally {
            if (buttonEl) {
                setTimeout(() => {
                    buttonEl.disabled = false;
                    if (buttonEl.textContent === 'Saved') buttonEl.textContent = originalText;
                }, 1200);
            }
        }
    }

    openCommunityCreateModal() {
        const ta = document.getElementById('communityModalPostInput');
        if (ta) ta.value = '';
        const m = document.getElementById('communityCreateModal');
        if (m) m.hidden = false;
    }

    closeCommunityCreateModal() {
        const m = document.getElementById('communityCreateModal');
        if (m) m.hidden = true;
    }

    closeCommunityPostDetailModal() {
        this._communityDetailPostId = null;
        const m = document.getElementById('communityPostDetailModal');
        if (m) m.hidden = true;
    }

    truncatePreview(text, maxLen) {
        const s = (text || '').replace(/\s+/g, ' ').trim();
        if (s.length <= maxLen) return s;
        return s.slice(0, maxLen - 1) + '…';
    }

    renderCommunityPostRow(post) {
        const wrap = document.createElement('button');
        wrap.type = 'button';
        wrap.className = 'community-post-row glass';
        wrap.dataset.postId = post.id;
        const preview = this.truncatePreview(post.content, 160);
        const author = this.escapeHtml(post.author_name || 'Member');
        const when = this.escapeHtml(this.formatSessionTime(post.created_at));
        const replies = post.comments ?? 0;
        const ups = post.upvotes ?? 0;
        wrap.innerHTML = `
            <div class="community-post-row-top">
                <span class="community-post-row-author">${author}</span>
                <span class="community-post-row-time">${when}</span>
            </div>
            <p class="community-post-row-preview">${this.escapeHtml(preview || '(No text)')}</p>
            <div class="community-post-row-meta">
                <span>△ ${ups}</span><span>${replies} repl${replies === 1 ? 'y' : 'ies'}</span>
            </div>
        `;
        return wrap;
    }

    async openCommunityPostDetail(postId) {
        await this.ensureMockSession();
        this._communityDetailPostId = postId;
        const modal = document.getElementById('communityPostDetailModal');
        if (modal) modal.hidden = false;
        await this.refreshCommunityPostDetail();
    }

    async refreshCommunityPostDetail() {
        const postId = this._communityDetailPostId;
        if (!postId) return;
        try {
            const pres = await fetch(`${this.apiBaseUrl}/community/posts/${encodeURIComponent(postId)}`, {
                headers: this.authBearerHeaders({ Accept: 'application/json' }),
            });
            if (!pres.ok) throw new Error(await readApiErrorResponse(pres));
            const post = await pres.json();

            let comments = [];
            const crs = await fetch(`${this.apiBaseUrl}/community/posts/${encodeURIComponent(postId)}/comments`, {
                headers: this.authBearerHeaders({ Accept: 'application/json' }),
            });
            if (crs.ok) {
                const raw = await crs.json();
                comments = Array.isArray(raw) ? raw : [];
            }

            this.fillCommunityPostDetail(post, comments);
        } catch (e) {
            console.error(e);
            alert(e.message || 'Could not load post');
            this.closeCommunityPostDetailModal();
        }
    }

    fillCommunityPostDetail(post, comments) {
        const author = post.author_name || 'Member';
        const when = this.formatSessionTime(post.created_at);
        const meta = document.getElementById('communityPostDetailMeta');
        if (meta) meta.textContent = `${author} · ${when}`;

        const contentEl = document.getElementById('communityPostDetailContent');
        if (contentEl) contentEl.textContent = post.content || '';

        const tagsEl = document.getElementById('communityPostDetailTags');
        if (tagsEl) {
            const tags = post.tags || [];
            if (tags.length) {
                tagsEl.innerHTML = tags.map((t) => `<span class="tag-chip">${this.escapeHtml(t)}</span>`).join('');
                tagsEl.hidden = false;
            } else {
                tagsEl.innerHTML = '';
                tagsEl.hidden = true;
            }
        }

        const docWrap = document.getElementById('communityPostDetailDoc');
        if (docWrap) {
            if (post.doc_id) {
                docWrap.innerHTML = `<button type="button" class="action-btn small community-detail-open-doc" data-doc-id="${this.escapeHtml(post.doc_id)}">Open in Docs</button>`;
                docWrap.hidden = false;
            } else {
                docWrap.innerHTML = '';
                docWrap.hidden = true;
            }
        }

        const upEl = document.getElementById('communityDetailUpCount');
        const downEl = document.getElementById('communityDetailDownCount');
        if (upEl) upEl.textContent = String(post.upvotes ?? 0);
        if (downEl) downEl.textContent = String(post.downvotes ?? 0);

        const list = document.getElementById('communityPostDetailComments');
        if (list) {
            if (!comments.length) {
                list.innerHTML = '<p class="guide-hint" style="margin:0;font-size:12px">No replies yet.</p>';
            } else {
                list.innerHTML = comments
                    .map((c) => {
                        const a = this.escapeHtml(c.author_name || 'Member');
                        const txt = this.escapeHtml(c.content || '');
                        return `<div class="community-comment-line"><span class="community-comment-author">${a}</span>${txt}</div>`;
                    })
                    .join('');
            }
        }
    }

    async loadCommunity() {
        await this.ensureMockSession();
        const feed = document.getElementById('communityFeed');
        if (!feed) return;
        feed.innerHTML = '<p class="guide-loading">Loading community…</p>';
        try {
            const res = await fetch(`${this.apiBaseUrl}/community/posts`, {
                headers: this.authBearerHeaders({ Accept: 'application/json' }),
            });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            const rawPosts = await res.json();
            const posts = Array.isArray(rawPosts) ? rawPosts : [];
            feed.innerHTML = '';
            if (!posts.length) {
                feed.innerHTML = '<p class="guide-hint">No posts yet. Tap ＋ to add one.</p>';
                return;
            }
            for (const p of posts) {
                if (!p || typeof p !== 'object' || !p.id) continue;
                feed.appendChild(this.renderCommunityPostRow(p));
            }
        } catch (e) {
            console.error(e);
            feed.innerHTML = `<p class="guide-error">${this.escapeHtml(e.message || 'Failed to load')}</p>`;
        }
    }

    async submitCommunityPost() {
        await this.ensureMockSession();
        const input = document.getElementById('communityModalPostInput');
        const text = (input?.value || '').trim();
        if (!text) {
            alert('Write something to post.');
            return;
        }
        try {
            const res = await fetch(`${this.apiBaseUrl}/community/posts`, {
                method: 'POST',
                headers: this.authBearerHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
                body: JSON.stringify({ content: text, tags: [] }),
            });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            if (input) input.value = '';
            this.closeCommunityCreateModal();
            await this.loadCommunity();
            this.flashStatus('Posted to community');
        } catch (e) {
            console.error(e);
            alert(e.message || 'Could not post');
        }
    }

    async voteCommunityPost(postId, type) {
        await this.ensureMockSession();
        try {
            const res = await fetch(`${this.apiBaseUrl}/community/posts/${encodeURIComponent(postId)}/vote`, {
                method: 'POST',
                headers: this.authBearerHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
                body: JSON.stringify({ type }),
            });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            await this.loadCommunity();
            if (this._communityDetailPostId === postId) {
                await this.refreshCommunityPostDetail();
            }
        } catch (e) {
            alert(e.message || 'Vote failed');
        }
    }

    async submitCommunityCommentFromDetail() {
        const postId = this._communityDetailPostId;
        if (!postId) return;
        const ta = document.getElementById('communityDetailReplyInput');
        const btn = document.getElementById('communityDetailReplySend');
        const text = (ta?.value || '').trim();
        if (!text) return;
        await this.submitCommunityComment(postId, text, ta, btn);
    }

    async submitCommunityComment(postId, text, textareaEl, buttonEl) {
        await this.ensureMockSession();
        const orig = buttonEl?.textContent;
        if (buttonEl) {
            buttonEl.disabled = true;
            buttonEl.textContent = '…';
        }
        try {
            const res = await fetch(`${this.apiBaseUrl}/community/posts/${encodeURIComponent(postId)}/comments`, {
                method: 'POST',
                headers: this.authBearerHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
                body: JSON.stringify({ content: text }),
            });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            if (textareaEl) textareaEl.value = '';
            await this.loadCommunity();
            if (this._communityDetailPostId === postId) {
                await this.refreshCommunityPostDetail();
            }
        } catch (e) {
            alert(e.message || 'Reply failed');
        } finally {
            if (buttonEl) {
                buttonEl.disabled = false;
                buttonEl.textContent = orig || 'Reply';
            }
        }
    }

    async publishDocToCommunity(docId) {
        await this.ensureMockSession();
        const doc = this.docsList.find((d) => d.id === docId);
        const title = doc?.title || 'Document';
        const note = window.prompt(`Share “${title}” to Community. Add an optional note:`, '') ?? '';
        try {
            const res = await fetch(`${this.apiBaseUrl}/community/posts`, {
                method: 'POST',
                headers: this.authBearerHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
                body: JSON.stringify({
                    content: note.trim(),
                    doc_id: docId,
                    doc_title: title,
                    tags: ['#docs', '#Published'],
                }),
            });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            this.flashStatus('Published to Community');
            this.switchScreen('community');
            await this.loadCommunity();
        } catch (e) {
            alert(e.message || 'Could not publish');
        }
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
            const res = await fetch(`${this.apiBaseUrl}/docs?brief=1`, { headers });
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
            const learnBtn = this.isDocLearnable(doc)
                ? `<button type="button" class="doc-learn-btn" data-doc-id="${this.escapeHtml(doc.id)}">Help you learn</button>`
                : '';
            const publishBtn = `<button type="button" class="doc-publish-btn" data-doc-id="${this.escapeHtml(doc.id)}">Share to Community</button>`;
            card.innerHTML = `
                <div class="doc-preview"><div class="doc-icon">⧉</div></div>
                <div class="doc-info">
                    <h4>${title}</h4>
                    <p>${summary}${truncated ? '…' : ''}</p>
                    <div class="doc-tags truncated">${tags}</div>
                    <div class="doc-card-actions">${publishBtn}${learnBtn}</div>
                </div>
            `;
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
        if ((doc.type || '').toLowerCase() === 'image' && doc.id) {
            const url = `${this.apiBaseUrl}/docs/${encodeURIComponent(doc.id)}/file`;
            bodyEl.classList.remove('doc-modal-body--md');
            bodyEl.textContent = `${doc.ai_summary || 'Image document.'}\n\nFile (open in browser): ${url}`;
        } else {
            bodyEl.classList.add('doc-modal-body--md');
            const raw = doc.content || doc.ai_summary || '(No body)';
            bodyEl.innerHTML = this.markdownToHtml(raw);
        }
        modal.hidden = false;
    }

    closeDocModal() {
        const modal = document.getElementById('docModal');
        if (modal) modal.hidden = true;
    }

    openChatHistoryDrawer() {
        const d = document.getElementById('chatHistoryDrawer');
        if (d) d.hidden = false;
        void this.renderChatHistoryList();
    }

    closeChatHistoryDrawer() {
        const d = document.getElementById('chatHistoryDrawer');
        if (d) d.hidden = true;
    }

    sessionHeaders() {
        const h = { Accept: 'application/json', 'Content-Type': 'application/json' };
        if (this.authToken) h['Authorization'] = `Bearer ${this.authToken}`;
        return h;
    }

    messagesToRows() {
        return this.messages.map((m) => ({
            role: m.isUser ? 'user' : 'assistant',
            content: m.text,
            sources: (m.sources || []).map((s) => ({
                title: s.title || '',
                type: s.type || 'internal',
                url: s.url || '',
            })),
        }));
    }

    persistSession() {
        if (!this.currentSessionId) return;
        clearTimeout(this._persistTimer);
        this._persistTimer = setTimeout(() => void this.flushSession(), 450);
    }

    async flushSession() {
        const id = this.currentSessionId;
        if (!id) return;
        const rows = this.messagesToRows();
        try {
            await fetch(`${this.apiBaseUrl}/chat-sessions/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: this.sessionHeaders(),
                body: JSON.stringify({ messages: rows }),
            });
            void this.renderChatHistoryList();
        } catch (e) {
            console.warn('Session save failed', e);
        }
    }

    resetMessagesToGreeting() {
        this.messageId = 1;
        this.messages = [
            {
                id: 1,
                text: "Hello! I'm Academi, your AI study assistant. Ask me anything or use the ⚡ button for quick actions!",
                isUser: false,
                hasSource: false,
                sources: [],
            },
        ];
    }

    applySessionPayload(sess) {
        this.currentSessionId = sess.id;
        localStorage.setItem('academi_chat_session_id', sess.id);
        if (sess.messages && sess.messages.length > 0) {
            this.messages = sess.messages.map((m, i) => ({
                id: i + 1,
                text: m.content,
                isUser: m.role === 'user',
                hasSource: !!(m.sources && m.sources.length),
                sources: m.sources || [],
            }));
            this.messageId = this.messages.length;
        } else {
            this.resetMessagesToGreeting();
        }
        this.pendingDocIds = [];
        this.updateSendButton();
        this.renderMessages();
    }

    async bootstrapChatSession() {
        try {
            const savedId = localStorage.getItem('academi_chat_session_id');
            if (savedId) {
                const res = await fetch(`${this.apiBaseUrl}/chat-sessions/${encodeURIComponent(savedId)}`, {
                    headers: this.sessionHeaders(),
                });
                if (res.ok) {
                    const sess = await res.json();
                    this.applySessionPayload(sess);
                    return;
                }
            }
            await this.createNewChatSession();
        } catch (e) {
            console.warn('Chat session bootstrap', e);
            this.resetMessagesToGreeting();
            this.currentSessionId = null;
            this.renderMessages();
        }
    }

    async createNewChatSession() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/chat-sessions`, {
                method: 'POST',
                headers: this.sessionHeaders(),
            });
            if (!res.ok) throw new Error('Could not start chat');
            const sess = await res.json();
            this.applySessionPayload(sess);
            this.closeChatHistoryDrawer();
            await this.flushSession();
            void this.renderChatHistoryList();
        } catch (e) {
            console.error(e);
            alert(
                'Could not create a new chat session. Open this app using your computer\'s LAN address (not localhost), or set localStorage key academi_api_base to your API URL.',
            );
        }
    }

    async loadChatSession(id) {
        try {
            const res = await fetch(`${this.apiBaseUrl}/chat-sessions/${encodeURIComponent(id)}`, {
                headers: this.sessionHeaders(),
            });
            if (!res.ok) throw new Error('Not found');
            const sess = await res.json();
            this.applySessionPayload(sess);
            this.closeChatHistoryDrawer();
            void this.renderChatHistoryList();
        } catch (e) {
            console.error(e);
            alert('Could not open that chat.');
        }
    }

    async deleteChatSession(id) {
        if (!window.confirm('Delete this chat from history?')) return;
        try {
            await fetch(`${this.apiBaseUrl}/chat-sessions/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: this.sessionHeaders(),
            });
            if (this.currentSessionId === id) {
                localStorage.removeItem('academi_chat_session_id');
                await this.createNewChatSession();
            }
            void this.renderChatHistoryList();
        } catch (e) {
            console.error(e);
        }
    }

    formatSessionTime(ts) {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    async renderChatHistoryList() {
        const ul = document.getElementById('chatHistoryList');
        if (!ul) return;
        try {
            const res = await fetch(`${this.apiBaseUrl}/chat-sessions`, { headers: this.sessionHeaders() });
            if (!res.ok) throw new Error('list failed');
            const items = await res.json();
            ul.innerHTML = '';
            for (const row of items) {
                const li = document.createElement('li');
                li.className = 'chat-history-row';
                const isActive = row.id === this.currentSessionId;
                const t = this.escapeHtml(row.title || 'Chat');
                const preview = this.escapeHtml(row.preview || '');
                const when = this.escapeHtml(this.formatSessionTime(row.updated_at));
                li.innerHTML = `
                    <button type="button" class="chat-history-item${isActive ? ' active' : ''}" data-id="${this.escapeHtml(row.id)}">
                        <span class="chat-history-item-title">${t}</span>
                        <span class="chat-history-item-meta">${preview}<br><span style="opacity:0.8">${when}</span></span>
                    </button>
                    <button type="button" class="chat-history-del" data-id="${this.escapeHtml(row.id)}" title="Delete">✕</button>
                `;
                ul.appendChild(li);
            }
        } catch (e) {
            ul.innerHTML = '<li class="chat-history-hint">Could not load history.</li>';
        }
    }

    guideApiHeaders() {
        const h = { Accept: 'application/json' };
        if (this.authToken) h['Authorization'] = `Bearer ${this.authToken}`;
        return h;
    }

    guideMutationHeaders() {
        return this.authBearerHeaders({
            'Content-Type': 'application/json',
            Accept: 'application/json',
        });
    }

    async refreshGuideSubjectsFromApi() {
        const res = await fetch(`${this.apiBaseUrl}/guides/subjects`, { headers: this.guideApiHeaders() });
        if (!res.ok) throw new Error(await readApiErrorResponse(res));
        this.guideSubjects = await res.json();
    }

    guideDoneStorageKey(guideId) {
        return `academi_guide_done:${guideId}`;
    }

    getGuideDoneList(guideId) {
        try {
            const raw = localStorage.getItem(this.guideDoneStorageKey(guideId));
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    setGuideStepDone(guideId, stepId, done) {
        let cur = this.getGuideDoneList(guideId);
        const ix = cur.indexOf(stepId);
        if (done && ix < 0) cur = [...cur, stepId];
        if (!done && ix >= 0) cur = cur.filter((n) => n !== stepId);
        localStorage.setItem(this.guideDoneStorageKey(guideId), JSON.stringify(cur));
    }

    showGuidePanel(which) {
        const list = document.getElementById('guideListView');
        const detail = document.getElementById('guideDetailView');
        const fab = document.getElementById('guideFabBtn');
        if (list) list.hidden = which !== 'list';
        if (detail) detail.hidden = which !== 'detail';
        if (fab) fab.hidden = which !== 'list';
    }

    updateGuideSubjectToolbar() {
        const el = document.getElementById('guideSubjectPickerLabel');
        const btn = document.getElementById('guideSubjectPickerBtn');
        if (el && this.guideSelectedSubject) {
            const icon = this.guideSelectedSubject.icon || '📚';
            const name = this.guideSelectedSubject.name || 'Subject';
            el.textContent = `${icon}  ${name}`;
        } else if (el) {
            el.textContent = '…';
        }
        if (btn) btn.setAttribute('aria-expanded', document.getElementById('guideSubjectModal')?.hidden === false ? 'true' : 'false');
    }

    closeGuideSubjectModal() {
        const m = document.getElementById('guideSubjectModal');
        if (m) m.hidden = true;
        const btn = document.getElementById('guideSubjectPickerBtn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    async openGuideSubjectModal() {
        if (!this.guideSubjects.length) {
            try {
                const res = await fetch(`${this.apiBaseUrl}/guides/subjects`, { headers: this.guideApiHeaders() });
                if (!res.ok) throw new Error(await readApiErrorResponse(res));
                this.guideSubjects = await res.json();
            } catch (e) {
                console.error(e);
                alert(e.message || 'Could not load subjects');
                return;
            }
        }
        this.renderGuideSubjectModalGrid();
        const m = document.getElementById('guideSubjectModal');
        if (m) m.hidden = false;
        const btn = document.getElementById('guideSubjectPickerBtn');
        if (btn) btn.setAttribute('aria-expanded', 'true');
    }

    renderGuideSubjectModalGrid() {
        const grid = document.getElementById('guideSubjectModalList');
        if (!grid) return;
        grid.innerHTML = '';
        for (const s of this.guideSubjects) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'guide-subject-card guide-subject-card--compact';
            if (this.guideSelectedSubject?.id === s.id) btn.classList.add('is-active');
            btn.dataset.subjectId = s.id;
            const icon = this.escapeHtml(s.icon || '📚');
            const name = this.escapeHtml(s.name || 'Subject');
            btn.innerHTML = `<span class="guide-subject-icon" aria-hidden="true">${icon}</span><span class="guide-subject-name">${name}</span>`;
            grid.appendChild(btn);
        }
    }

    async loadGuideScreen() {
        this.closeGuideSubjectModal();
        this.showGuidePanel('list');
        this.guideActive = null;
        const listEl = document.getElementById('guideCatalogList');
        const header = document.getElementById('guideListHeader');
        if (listEl) listEl.innerHTML = '<p class="guide-loading">Loading…</p>';
        if (header) header.innerHTML = '';

        try {
            const res = await fetch(`${this.apiBaseUrl}/guides/subjects`, { headers: this.guideApiHeaders() });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            this.guideSubjects = await res.json();
            if (!this.guideSubjects.length) {
                if (listEl) listEl.innerHTML = '<p class="guide-hint">No subjects available.</p>';
                this.updateGuideSubjectToolbar();
                return;
            }
            const savedId = localStorage.getItem('academi_guide_subject_id');
            const preferred =
                (savedId && this.guideSubjects.find((x) => x.id === savedId)) || this.guideSubjects[0];
            await this.openGuideSubject(preferred.id, { fromPicker: false });
        } catch (e) {
            console.error(e);
            if (listEl) listEl.innerHTML = `<p class="guide-error">${this.escapeHtml(e.message || 'error')}</p>`;
            this.updateGuideSubjectToolbar();
        }
    }

    async openGuideSubject(subjectId, opts = {}) {
        const { fromPicker = true } = opts;
        if (fromPicker) this.closeGuideSubjectModal();

        const sub = this.guideSubjects.find((x) => x.id === subjectId);
        if (!sub) return;
        this.guideSelectedSubject = sub;
        localStorage.setItem('academi_guide_subject_id', subjectId);
        this.updateGuideSubjectToolbar();

        const listEl = document.getElementById('guideCatalogList');
        const header = document.getElementById('guideListHeader');
        if (header) {
            const icon = this.escapeHtml(sub.icon || '📚');
            const name = this.escapeHtml(sub.name || '');
            const desc = this.escapeHtml(sub.description || '');
            header.innerHTML = `
                <div class="guide-list-heading">
                    <span class="guide-header-icon">${icon}</span>
                    <div>
                        <h2>${name}</h2>
                        <p class="guide-header-desc">${desc}</p>
                    </div>
                </div>`;
        }
        if (listEl) listEl.innerHTML = '<p class="guide-loading">Loading guides…</p>';
        this.showGuidePanel('list');
        try {
            const res = await fetch(
                `${this.apiBaseUrl}/guides?subject_id=${encodeURIComponent(subjectId)}`,
                { headers: this.guideApiHeaders() },
            );
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            this.guideList = await res.json();
            this.renderGuideCatalog();
        } catch (e) {
            console.error(e);
            if (listEl) listEl.innerHTML = `<p class="guide-error">${this.escapeHtml(e.message || 'error')}</p>`;
        }
    }

    renderGuideCatalog() {
        const listEl = document.getElementById('guideCatalogList');
        if (!listEl) return;
        listEl.innerHTML = '';
        const uid = this.currentUser?.id;
        if (!this.guideList.length) {
            listEl.innerHTML = '<p class="guide-hint">No guides for this subject yet. Tap ＋ to create one.</p>';
            return;
        }
        for (const g of this.guideList) {
            const nSteps = (g.steps && g.steps.length) || 0;
            const row = document.createElement('div');
            row.className = 'guide-catalog-row glass';
            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.className = 'guide-catalog-open';
            openBtn.dataset.guideId = g.id;
            const title = this.escapeHtml(g.title || 'Guide');
            const desc = this.escapeHtml(g.description || '');
            const icon = this.escapeHtml(g.icon || '▸');
            openBtn.innerHTML = `
                <span class="guide-catalog-icon">${icon}</span>
                <span class="guide-catalog-body">
                    <span class="guide-catalog-title">${title}</span>
                    <span class="guide-catalog-desc">${desc}</span>
                    <span class="guide-catalog-meta">${nSteps} step${nSteps === 1 ? '' : 's'}</span>
                </span>`;
            row.appendChild(openBtn);
            const mine = g.created_by && uid && g.created_by === uid;
            if (mine) {
                const actions = document.createElement('div');
                actions.className = 'guide-catalog-actions';
                const ebtn = document.createElement('button');
                ebtn.type = 'button';
                ebtn.className = 'action-btn small guide-edit-btn';
                ebtn.dataset.guideId = g.id;
                ebtn.textContent = 'Edit';
                const dbtn = document.createElement('button');
                dbtn.type = 'button';
                dbtn.className = 'action-btn small guide-delete-btn';
                dbtn.dataset.guideId = g.id;
                dbtn.textContent = 'Delete';
                actions.appendChild(ebtn);
                actions.appendChild(dbtn);
                row.appendChild(actions);
            }
            listEl.appendChild(row);
        }
    }

    backToGuideList() {
        if (!this.guideSelectedSubject) {
            void this.loadGuideScreen();
            return;
        }
        this.guideActive = null;
        this.showGuidePanel('list');
        this.renderGuideCatalog();
    }

    async openGuideDetail(guideId) {
        let g = this.guideList.find((x) => x.id === guideId);
        if (!g) {
            try {
                const res = await fetch(`${this.apiBaseUrl}/guides/${encodeURIComponent(guideId)}`, {
                    headers: this.guideApiHeaders(),
                });
                if (!res.ok) throw new Error(await readApiErrorResponse(res));
                g = await res.json();
            } catch (e) {
                console.error(e);
                alert(e.message || 'Could not open guide');
                return;
            }
        }
        this.guideActive = g;
        this.showGuidePanel('detail');
        this.renderGuideDetail();
    }

    refreshGuideDetailProgress() {
        if (!this.guideActive) return;
        const steps = this.guideActive.steps || [];
        const done = this.getGuideDoneList(this.guideActive.id).length;
        const el = document.getElementById('guideDetailProgressText');
        if (el) el.textContent = `${done}/${steps.length}`;
    }

    renderGuideDetail() {
        const g = this.guideActive;
        const head = document.getElementById('guideDetailHeader');
        const stepsEl = document.getElementById('guideDetailSteps');
        if (!g || !head || !stepsEl) return;
        const icon = this.escapeHtml(g.icon || '▸');
        const title = this.escapeHtml(g.title || '');
        const desc = this.escapeHtml(g.description || '');
        const steps = g.steps || [];
        const doneList = this.getGuideDoneList(g.id);
        const doneCount = doneList.length;
        const rawColor = typeof g.color === 'string' ? g.color.trim() : '';
        const accent = /^#[0-9A-Fa-f]{6}$/.test(rawColor) ? rawColor : '#5b8cff';
        const uid = this.currentUser?.id;
        const mine = g.created_by && uid && g.created_by === uid;
        const ownerBar = mine
            ? `<div class="guide-detail-owner-bar">
                <button type="button" class="btn-secondary small guide-detail-edit-btn" data-guide-id="${this.escapeHtml(g.id)}">Edit</button>
                <button type="button" class="btn-secondary small btn-danger-outline guide-detail-delete-btn" data-guide-id="${this.escapeHtml(g.id)}">Delete</button>
            </div>`
            : '';
        head.innerHTML = `
            ${ownerBar}
            <div class="guide-list-heading">
                <div class="progress-ring progress-ring--static" style="border-color: ${accent}; border-top-color: ${accent}">
                    <div class="progress-text" id="guideDetailProgressText">${doneCount}/${steps.length}</div>
                </div>
                <div>
                    <h2><span class="guide-header-icon">${icon}</span> ${title}</h2>
                    <p class="guide-header-desc">${desc}</p>
                </div>
            </div>`;
        stepsEl.innerHTML = '';
        steps.forEach((step, index) => {
            const checked = doneList.includes(step.id);
            const row = document.createElement('div');
            row.className = `step${checked ? ' completed' : ''}${!checked && index === doneCount ? ' active' : ''}`;
            const num = this.escapeHtml(String(index + 1));
            const stitle = this.escapeHtml(step.title || '');
            const sbody = this.escapeHtml(step.content || '');
            row.innerHTML = `
                <div class="step-number">${num}</div>
                <div class="step-content">
                    <label class="guide-step-label">
                        <input type="checkbox" class="guide-step-check" data-step-id="${step.id}" ${checked ? 'checked' : ''} />
                        <span><h4>${stitle}</h4><p>${sbody}</p></span>
                    </label>
                </div>`;
            stepsEl.appendChild(row);
        });
    }

    closeGuideEditorModal() {
        const m = document.getElementById('guideEditorModal');
        if (m) m.hidden = true;
        this._guideEditorId = null;
    }

    populateGuideSubjectSelect() {
        const sel = document.getElementById('guideFormSubjectSelect');
        if (!sel) return;
        sel.innerHTML = '';
        for (const s of this.guideSubjects || []) {
            const opt = document.createElement('option');
            opt.value = s.id;
            const icon = s.icon ? `${s.icon} ` : '';
            opt.textContent = `${icon}${s.name || s.id}`;
            sel.appendChild(opt);
        }
        if (this.guideSelectedSubject?.id) sel.value = this.guideSelectedSubject.id;
    }

    renumberGuideFormSteps() {
        const wrap = document.getElementById('guideFormSteps');
        if (!wrap) return;
        [...wrap.querySelectorAll('.guide-form-step-row')].forEach((row, i) => {
            const lab = row.querySelector('.guide-form-step-num');
            if (lab) lab.textContent = `Step ${i + 1}`;
        });
    }

    appendGuideFormStepRow(row) {
        const wrap = document.getElementById('guideFormSteps');
        if (!wrap) return;
        const div = document.createElement('div');
        div.className = 'guide-form-step-row';
        const head = document.createElement('div');
        head.className = 'guide-form-step-head';
        const num = document.createElement('span');
        num.className = 'guide-form-step-num';
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn-secondary small guide-form-step-remove';
        rm.textContent = 'Remove';
        const titleIn = document.createElement('input');
        titleIn.type = 'text';
        titleIn.className = 'form-input guide-step-title';
        titleIn.placeholder = 'Step title';
        titleIn.value = (row && row.title) || '';
        const ta = document.createElement('textarea');
        ta.className = 'form-textarea guide-step-content';
        ta.rows = 2;
        ta.placeholder = 'What to do…';
        ta.value = (row && row.content) || '';
        rm.addEventListener('click', () => {
            if (wrap.querySelectorAll('.guide-form-step-row').length <= 1) return;
            div.remove();
            this.renumberGuideFormSteps();
        });
        head.appendChild(num);
        head.appendChild(rm);
        div.appendChild(head);
        div.appendChild(titleIn);
        div.appendChild(ta);
        wrap.appendChild(div);
        this.renumberGuideFormSteps();
    }

    renderGuideFormSteps(rows) {
        const wrap = document.getElementById('guideFormSteps');
        if (!wrap) return;
        wrap.innerHTML = '';
        const list = rows && rows.length ? rows : [{}];
        list.forEach((r) => this.appendGuideFormStepRow(r));
        if (!wrap.children.length) this.appendGuideFormStepRow({});
    }

    collectGuideFormSteps() {
        const wrap = document.getElementById('guideFormSteps');
        if (!wrap) return [];
        return [...wrap.querySelectorAll('.guide-form-step-row')].map((row) => ({
            id: 0,
            title: row.querySelector('.guide-step-title')?.value?.trim() || '',
            content: row.querySelector('.guide-step-content')?.value?.trim() || '',
        }));
    }

    renderUserSubjectsManage() {
        const wrap = document.getElementById('guideUserSubjectsList');
        if (!wrap) return;
        const uid = this.currentUser?.id;
        const mine = (this.guideSubjects || []).filter((s) => s.created_by && uid && s.created_by === uid);
        if (!mine.length) {
            wrap.innerHTML =
                '<p class="guide-hint" style="margin:0;font-size:12px">No custom subjects yet. Use “Create new subject” above.</p>';
            return;
        }
        wrap.innerHTML = mine
            .map((s) => {
                const name = this.escapeHtml(s.name || '');
                const sid = this.escapeHtml(s.id);
                return `<div class="guide-user-subject-row"><span>${name}</span><div class="guide-user-subject-actions"><button type="button" class="btn-secondary small guide-user-subject-edit" data-subject-id="${sid}">Rename</button><button type="button" class="btn-secondary small btn-danger-outline guide-user-subject-delete" data-subject-id="${sid}">Delete</button></div></div>`;
            })
            .join('');
    }

    async openGuideEditorCreate() {
        await this.ensureMockSession();
        if (!this.authToken) {
            alert('Creating guides requires signing in. Try again in a moment.');
            return;
        }
        try {
            await this.refreshGuideSubjectsFromApi();
        } catch (e) {
            alert(e.message || 'Could not load subjects');
            return;
        }
        this._guideEditorId = null;
        const t = document.getElementById('guideEditorModalTitle');
        if (t) t.textContent = 'New guide';
        const delBtn = document.getElementById('guideEditorDeleteBtn');
        if (delBtn) delBtn.hidden = true;
        const toggle = document.getElementById('guideFormNewSubjectToggle');
        if (toggle) toggle.checked = false;
        const nf = document.getElementById('guideFormNewSubjectFields');
        if (nf) nf.hidden = true;
        const sel = document.getElementById('guideFormSubjectSelect');
        if (sel) sel.disabled = false;
        this.populateGuideSubjectSelect();
        const sn = document.getElementById('guideFormSubjectName');
        if (sn) sn.value = '';
        const sd = document.getElementById('guideFormSubjectDesc');
        if (sd) sd.value = '';
        const si = document.getElementById('guideFormSubjectIcon');
        if (si) si.value = '';
        const ft = document.getElementById('guideFormTitle');
        if (ft) ft.value = '';
        const fd = document.getElementById('guideFormDescription');
        if (fd) fd.value = '';
        const fc = document.getElementById('guideFormCategory');
        if (fc) fc.value = '';
        const fi = document.getElementById('guideFormIcon');
        if (fi) fi.value = '';
        const fcol = document.getElementById('guideFormColor');
        if (fcol) fcol.value = '';
        this.renderGuideFormSteps(null);
        this.renderUserSubjectsManage();
        const m = document.getElementById('guideEditorModal');
        if (m) m.hidden = false;
        this.closeGuideSubjectModal();
    }

    async openGuideEditorEdit(guideId) {
        await this.ensureMockSession();
        if (!this.authToken) {
            alert('Session required to edit guides.');
            return;
        }
        let g = this.guideList.find((x) => x.id === guideId);
        try {
            if (!g) {
                const res = await fetch(`${this.apiBaseUrl}/guides/${encodeURIComponent(guideId)}`, {
                    headers: this.guideApiHeaders(),
                });
                if (!res.ok) throw new Error(await readApiErrorResponse(res));
                g = await res.json();
            }
        } catch (e) {
            alert(e.message || 'Could not load guide');
            return;
        }
        if (!g.created_by || g.created_by !== this.currentUser?.id) {
            alert('You can only edit guides you created.');
            return;
        }
        try {
            await this.refreshGuideSubjectsFromApi();
        } catch (e) {
            alert(e.message || 'Could not load subjects');
            return;
        }
        this._guideEditorId = g.id;
        const titleEl = document.getElementById('guideEditorModalTitle');
        if (titleEl) titleEl.textContent = 'Edit guide';
        const delBtn = document.getElementById('guideEditorDeleteBtn');
        if (delBtn) delBtn.hidden = false;
        const toggle = document.getElementById('guideFormNewSubjectToggle');
        if (toggle) toggle.checked = false;
        const nf = document.getElementById('guideFormNewSubjectFields');
        if (nf) nf.hidden = true;
        const ssel = document.getElementById('guideFormSubjectSelect');
        if (ssel) ssel.disabled = false;
        this.populateGuideSubjectSelect();
        if (ssel && g.subject_id) ssel.value = g.subject_id;
        document.getElementById('guideFormTitle').value = g.title || '';
        document.getElementById('guideFormDescription').value = g.description || '';
        document.getElementById('guideFormCategory').value = g.category || '';
        document.getElementById('guideFormIcon').value = g.icon || '';
        document.getElementById('guideFormColor').value = g.color || '';
        document.getElementById('guideFormSubjectName').value = '';
        document.getElementById('guideFormSubjectDesc').value = '';
        document.getElementById('guideFormSubjectIcon').value = '';
        this.renderGuideFormSteps(g.steps || []);
        this.renderUserSubjectsManage();
        this.closeGuideSubjectModal();
        document.getElementById('guideEditorModal').hidden = false;
    }

    async submitGuideEditor() {
        await this.ensureMockSession();
        if (!this.authToken) {
            alert('Please wait for sign-in and try again.');
            return;
        }
        let subjectId = document.getElementById('guideFormSubjectSelect')?.value || '';
        const newSubOn = document.getElementById('guideFormNewSubjectToggle')?.checked;
        if (newSubOn) {
            const name = document.getElementById('guideFormSubjectName')?.value?.trim() || '';
            if (!name) {
                alert('Enter a name for the new subject.');
                return;
            }
            const body = {
                name,
                description: document.getElementById('guideFormSubjectDesc')?.value?.trim() || '',
                icon: document.getElementById('guideFormSubjectIcon')?.value?.trim() || '',
            };
            try {
                const res = await fetch(`${this.apiBaseUrl}/guides/subjects`, {
                    method: 'POST',
                    headers: this.guideMutationHeaders(),
                    body: JSON.stringify(body),
                });
                if (!res.ok) throw new Error(await readApiErrorResponse(res));
                const sub = await res.json();
                subjectId = sub.id;
                await this.refreshGuideSubjectsFromApi();
                this.populateGuideSubjectSelect();
                this.renderUserSubjectsManage();
            } catch (e) {
                alert(e.message || 'Could not create subject');
                return;
            }
        } else if (!subjectId) {
            alert('Choose a subject.');
            return;
        }
        const title = document.getElementById('guideFormTitle')?.value?.trim() || '';
        const description = document.getElementById('guideFormDescription')?.value?.trim() || '';
        if (!title || !description) {
            alert('Title and description are required.');
            return;
        }
        const stepsRaw = this.collectGuideFormSteps();
        const payload = {
            subject_id: subjectId,
            title,
            description,
            category: document.getElementById('guideFormCategory')?.value?.trim() || '',
            icon: document.getElementById('guideFormIcon')?.value?.trim() || '',
            color: document.getElementById('guideFormColor')?.value?.trim() || '',
            steps: stepsRaw,
        };
        try {
            if (this._guideEditorId) {
                const res = await fetch(`${this.apiBaseUrl}/guides/${encodeURIComponent(this._guideEditorId)}`, {
                    method: 'PUT',
                    headers: this.guideMutationHeaders(),
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error(await readApiErrorResponse(res));
            } else {
                const res = await fetch(`${this.apiBaseUrl}/guides`, {
                    method: 'POST',
                    headers: this.guideMutationHeaders(),
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error(await readApiErrorResponse(res));
            }
            this.closeGuideEditorModal();
            await this.openGuideSubject(subjectId);
        } catch (e) {
            alert(e.message || 'Save failed');
        }
    }

    async deleteUserGuide(guideId) {
        await this.ensureMockSession();
        try {
            const res = await fetch(`${this.apiBaseUrl}/guides/${encodeURIComponent(guideId)}`, {
                method: 'DELETE',
                headers: this.guideMutationHeaders(),
            });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            if (this.guideActive?.id === guideId) {
                this.guideActive = null;
                this.showGuidePanel('list');
            }
            if (this.guideSelectedSubject) await this.openGuideSubject(this.guideSelectedSubject.id);
            else await this.loadGuideScreen();
        } catch (e) {
            alert(e.message || 'Delete failed');
        }
    }

    async deleteGuideFromEditor() {
        if (!this._guideEditorId) return;
        if (!window.confirm('Delete this guide permanently?')) return;
        const id = this._guideEditorId;
        this.closeGuideEditorModal();
        await this.deleteUserGuide(id);
    }

    async promptEditUserSubject(subjectId) {
        const sub = this.guideSubjects.find((s) => s.id === subjectId);
        if (!sub) return;
        if (!sub.created_by || sub.created_by !== this.currentUser?.id) return;
        const name = window.prompt('Subject name', sub.name || '');
        if (name === null) return;
        const nt = name.trim();
        if (!nt) return;
        const d = window.prompt('Description (optional)', sub.description || '');
        if (d === null) return;
        const ic = window.prompt('Icon emoji (optional)', sub.icon || '');
        if (ic === null) return;
        await this.ensureMockSession();
        try {
            const res = await fetch(`${this.apiBaseUrl}/guides/subjects/${encodeURIComponent(subjectId)}`, {
                method: 'PATCH',
                headers: this.guideMutationHeaders(),
                body: JSON.stringify({ name: nt, description: (d || '').trim(), icon: (ic || '').trim() }),
            });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            await this.refreshGuideSubjectsFromApi();
            this.updateGuideSubjectToolbar();
            if (this.guideSelectedSubject?.id === subjectId) {
                const found = this.guideSubjects.find((s) => s.id === subjectId);
                if (found) this.guideSelectedSubject = found;
            }
            this.populateGuideSubjectSelect();
            this.renderUserSubjectsManage();
            if (this.guideSelectedSubject) await this.openGuideSubject(this.guideSelectedSubject.id);
        } catch (e) {
            alert(e.message || 'Update failed');
        }
    }

    async deleteUserSubject(subjectId) {
        const sub = this.guideSubjects.find((s) => s.id === subjectId);
        if (!sub?.created_by || sub.created_by !== this.currentUser?.id) return;
        if (!window.confirm(`Delete subject “${sub.name}”? (Fails if any guides still use it.)`)) return;
        await this.ensureMockSession();
        try {
            const res = await fetch(`${this.apiBaseUrl}/guides/subjects/${encodeURIComponent(subjectId)}`, {
                method: 'DELETE',
                headers: this.guideMutationHeaders(),
            });
            if (!res.ok) throw new Error(await readApiErrorResponse(res));
            await this.refreshGuideSubjectsFromApi();
            if (this.guideSelectedSubject?.id === subjectId) {
                const next = this.guideSubjects[0];
                this.guideSelectedSubject = next || null;
                if (next) localStorage.setItem('academi_guide_subject_id', next.id);
            }
            this.updateGuideSubjectToolbar();
            this.renderUserSubjectsManage();
            await this.loadGuideScreen();
        } catch (e) {
            alert(e.message || 'Delete failed');
        }
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
            root.style.setProperty('--surface-glass', 'rgba(10, 15, 28, 0.06)');
            root.style.setProperty('--border-subtle', 'rgba(10, 15, 28, 0.1)');
        } else {
            root.style.setProperty('--bg-primary', '#0A0F1C');
            root.style.setProperty('--bg-secondary', '#12182A');
            root.style.setProperty('--text-primary', '#FFFFFF');
            root.style.setProperty('--text-secondary', '#A8B2D1');
            root.style.setProperty('--surface-glass', 'rgba(255, 255, 255, 0.05)');
            root.style.setProperty('--border-subtle', 'rgba(255, 255, 255, 0.08)');
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

function syncAppViewportHeight() {
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`);
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    syncAppViewportHeight();
    new AcademiApp();
});

window.addEventListener('resize', syncAppViewportHeight);
window.addEventListener('orientationchange', syncAppViewportHeight);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncAppViewportHeight);
}

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