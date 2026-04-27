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

        this.init();
    }

    init() {
        // Initialize screen visibility
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });
        const chatScreen = document.getElementById('chatScreen');
        if (chatScreen) {
            chatScreen.style.display = 'block';
        }

        this.bindEvents();
        this.renderMessages();
        this.updateUI();
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

        // Quick actions
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const query = e.currentTarget.dataset.query;
                this.sendMessage(query);
            });
        });

        // Topic tags
        document.querySelectorAll('.tag-chip[data-topic]').forEach(tag => {
            tag.addEventListener('click', (e) => {
                const topic = e.currentTarget.dataset.topic;
                this.sendMessage(`Tell me about ${topic}`);
            });
        });

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
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

        // Update active screen - hide all screens first
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
            screen.classList.remove('active');
        });

        // Show the selected screen
        const activeScreen = document.getElementById(`${screenName}Screen`);
        if (activeScreen) {
            activeScreen.style.display = 'block';
            activeScreen.classList.add('active');
        }

        this.currentScreen = screenName;
        this.updateUI();
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

    async sendMessage(text = null) {
        const messageInput = document.getElementById('messageInput');
        const messageText = text || messageInput.value.trim();

        if (!messageText) return;

        // Hide suggestions
        document.getElementById('suggestions').style.display = 'none';

        // Add user message
        this.addMessage(messageText, true);
        messageInput.value = '';
        this.updateSendButton();
        this.adjustTextareaHeight();

        // Show typing indicator
        this.showTyping(true);

        // Simulate AI response
        setTimeout(() => {
            const aiResponse = this.generateAIResponse(messageText);
            this.addMessage(aiResponse, false);
            this.showTyping(false);
        }, 1500 + Math.random() * 1000);
    }

    addMessage(text, isUser) {
        this.messageId++;
        const message = {
            id: this.messageId,
            text: text,
            isUser: isUser,
            hasSource: !isUser && Math.random() > 0.5,
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
            if (message.hasSource) {
                sourcesHtml = `
                    <div class="message-sources">
                        <div class="source-item">
                            <span class="source-icon">⟲</span>
                            <span>Wikipedia - Quantum Physics</span>
                        </div>
                        <div class="source-item">
                            <span class="source-icon">⧉</span>
                            <span>Research Paper - 2023</span>
                        </div>
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

        // Scroll to bottom
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    }

    formatMessage(text) {
        // Simple formatting for bullet points
        return text.replace(/•/g, '•');
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