(function() {
    'use strict';

    // Prevent duplicate instances
    const ROOT_ID = 'pollinations-ai-chat-root';
    if (document.getElementById(ROOT_ID)) {
        document.getElementById(ROOT_ID).remove();
        return;
    }

    // --- Configuration ---
    const CONFIG = {
        API_URL: 'https://text.pollinations.ai/openai',
        API_KEY: 'pk_bJav4nbMa2fZGkqG',
        MODEL: 'openai',
        MAX_RETRIES: 3,
        TIMEOUT_MS: 60000,
        STORAGE_KEYS: {
            HISTORY: 'pollinations_chat_history',
            UI_STATE: 'pollinations_chat_ui_state'
        }
    };

    // --- Utility Helpers ---
    const Utils = {
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },
        debounce(fn, delay) {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), delay);
            };
        },
        generateId: () => 'id-' + Math.random().toString(36).substr(2, 9),
        getTimeString: () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // --- Custom Markdown Parser & Syntax Highlighter ---
    class MarkdownParser {
        static parse(md) {
            if (!md) return '';
            // 1. Extract and protect code blocks
            const codeBlocks = [];
            md = md.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
                const id = Utils.generateId();
                codeBlocks.push({ id, lang: lang || 'text', code: Utils.escapeHtml(code.trim()) });
                return `%%CODEBLOCK_${id}%%`;
            });

            // 2. Extract and protect inline code
            const inlineCodes = [];
            md = md.replace(/`([^`]+)`/g, (match, code) => {
                const id = Utils.generateId();
                inlineCodes.push({ id, code: Utils.escapeHtml(code) });
                return `%%INLINE_${id}%%`;
            });

            // 3. Escape HTML
            md = Utils.escapeHtml(md);

            // 4. LaTeX (MathJax)
            md = md.replace(/\\\((.*?)\\\)/g, '<span class="math-inline">\\($1\\)</span>');
            md = md.replace(/\\\[(.*?)\\\]/gs, '<div class="math-block">\\[$1\\]</div>');

            // 5. Block Elements
            // Tables
            md = md.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (match, header, separator, body) => {
                const ths = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
                const rows = body.trim().split('\n').map(row => {
                    const tds = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
                    return `<tr>${tds}</tr>`;
                }).join('');
                return `<div class="md-table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table></div>`;
            });

            // Headers
            md = md.replace(/^### (.+)$/gm, '<h3>$1</h3>');
            md = md.replace(/^## (.+)$/gm, '<h2>$1</h2>');
            md = md.replace(/^# (.+)$/gm, '<h1>$1</h1>');

            // Lists (Unordered and Ordered)
            md = md.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
            md = md.replace(/(?:<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
            md = md.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
            // Simple fix for ordered lists context if needed, but ul wrapper is fine for generic markdown

            // Bold and Italic
            md = md.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
            md = md.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            md = md.replace(/\*(.*?)\*/g, '<em>$1</em>');

            // Links
            md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

            // Paragraphs (convert double newlines)
            md = md.replace(/\n\n/g, '</p><p>');
            md = `<p>${md}</p>`;
            md = md.replace(/<p><(h[1-6]|ul|ol|div|table)/g, '<$1');
            md = md.replace(/<\/(h[1-6]|ul|ol|div|table)><\/p>/g, '</$1>');
            md = md.replace(/<p><\/p>/g, '');

            // 6. Restore inline code
            inlineCodes.forEach(({ id, code }) => {
                md = md.replace(`%%INLINE_${id}%%`, `<code class="md-inline-code">${code}</code>`);
            });

            // 7. Restore code blocks with syntax highlighting
            codeBlocks.forEach(({ id, lang, code }) => {
                const highlighted = MarkdownParser.highlightSyntax(code, lang);
                const copyBtn = `<button class="md-copy-btn" onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent); this.textContent='Copiado!'; setTimeout(()=>this.textContent='Copiar', 2000)">Copiar</button>`;
                md = md.replace(`%%CODEBLOCK_${id}%%`, `<div class="md-code-block">${copyBtn}<pre><code class="language-${lang}">${highlighted}</code></pre></div>`);
            });

            return md;
        },

        static highlightSyntax(html, lang) {
            if (lang === 'text') return html;
            // Basic Regex Highlighter to avoid external dependencies
            const keywords = {
                javascript: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|try|catch|finally|throw|async|await|yield)\b/g,
                python: /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|with|lambda|yield|async|await|pass|break|continue|in|not|and|or|is)\b/g,
                css: /\b(body|div|span|class|id|margin|padding|color|background|border|display|position|flex|grid|font|text|align|justify|width|height|top|left|right|bottom|z-index|overflow)\b/g
            };
            const regex = keywords[lang] || keywords.javascript;
            
            return html
                .replace(/(\/\/.*$)/gm, '<span class="md-comment">$1</span>') // Comments
                .replace(/((".*?")|('.*?')|(`.*?`))/g, '<span class="md-string">$1</span>') // Strings
                .replace(regex, '<span class="md-keyword">$1</span>') // Keywords
                .replace(/\b(\d+\.?\d*)\b/g, '<span class="md-number">$1</span>'); // Numbers
        }
    };

    // --- API Manager ---
    class APIManager {
        constructor() {
            this.abortController = null;
        }

        async streamChat(messages, onChunk, onDone, onError) {
            this.abortController = new AbortController();
            let retryCount = 0;
            const attemptFetch = async () => {
                try {
                    const timeoutId = setTimeout(() => this.abortController.abort(), CONFIG.TIMEOUT_MS);
                    
                    const res = await fetch(CONFIG.API_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${CONFIG.API_KEY}`
                        },
                        body: JSON.stringify({
                            model: CONFIG.MODEL,
                            messages: messages,
                            stream: true
                        }),
                        signal: this.abortController.signal
                    });

                    clearTimeout(timeoutId);

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.error?.message || `HTTP Error ${res.status}`);
                    }

                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop(); // keep incomplete line in buffer

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || !trimmed.startsWith('data: ')) continue;
                            const data = trimmed.slice(6);
                            if (data === '[DONE]') {
                                onDone();
                                return;
                            }
                            try {
                                const json = JSON.parse(data);
                                const content = json.choices?.[0]?.delta?.content;
                                if (content) onChunk(content);
                            } catch (e) { /* Ignore malformed JSON chunks */ }
                        }
                    }
                    onDone();
                } catch (error) {
                    if (error.name === 'AbortError') {
                        onDone('cancelled');
                        return;
                    }
                    if (retryCount < CONFIG.MAX_RETRIES) {
                        retryCount++;
                        attemptFetch();
                    } else {
                        onError(error);
                    }
                }
            };
            attemptFetch();
        }

        cancel() {
            if (this.abortController) this.abortController.abort();
        }
    }

    // --- Upload Manager ---
    class UploadManager {
        constructor(uiManager) {
            this.ui = uiManager;
            this.files = [];
            this.init();
        }

        init() {
            const { input, previewContainer, attachBtn, chatWindow } = this.ui.elements;

            attachBtn.addEventListener('click', () => input.click());
            
            input.addEventListener('change', (e) => {
                this.addFiles(Array.from(e.target.files));
                input.value = '';
            });

            // Paste logic
            chatWindow.addEventListener('paste', (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of items) {
                    if (item.type.indexOf('image') !== -1) {
                        e.preventDefault();
                        this.addFiles([item.getAsFile()]);
                        break;
                    }
                }
            });

            // Drag and Drop
            chatWindow.addEventListener('dragover', (e) => { e.preventDefault(); chatWindow.classList.add('drag-over'); });
            chatWindow.addEventListener('dragleave', () => chatWindow.classList.remove('drag-over'));
            chatWindow.addEventListener('drop', (e) => {
                e.preventDefault();
                chatWindow.classList.remove('drag-over');
                if (e.dataTransfer.files.length) this.addFiles(Array.from(e.dataTransfer.files));
            });
        }

        addFiles(newFiles) {
            const allowedTypes = ['image/', 'application/pdf', 'text/plain', 'text/csv', 'application/json', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            
            for (const file of newFiles) {
                const isValid = allowedTypes.some(t => file.type.startsWith(t)) || file.name.endsWith('.pdf') || file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.json') || file.name.endsWith('.docx');
                if (!isValid) {
                    alert(`Tipo de arquivo não suportado: ${file.name}`);
                    continue;
                }
                this.files.push(file);
            }
            this.renderPreviews();
        }

        renderPreviews() {
            const container = this.ui.elements.previewContainer;
            container.innerHTML = '';
            
            this.files.forEach((file, index) => {
                const item = document.createElement('div');
                item.className = 'preview-item';

                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        item.innerHTML = `<img src="${e.target.result}" alt="preview"><div class="preview-remove" data-index="${index}">&times;</div>`;
                        item.querySelector('.preview-remove').addEventListener('click', () => this.removeFile(index));
                    };
                    reader.readAsDataURL(file);
                } else {
                    const icon = file.name.endsWith('.pdf') ? '📕' : file.name.endsWith('.json') ? '📋' : '📄';
                    item.innerHTML = `<span class="preview-doc-icon">${icon}</span><span class="preview-doc-name">${file.name}</span><div class="preview-remove" data-index="${index}">&times;</div>`;
                    item.querySelector('.preview-remove').addEventListener('click', () => this.removeFile(index));
                }
                container.appendChild(item);
            });

            container.style.display = this.files.length > 0 ? 'flex' : 'none';
        }

        removeFile(index) {
            this.files.splice(index, 1);
            this.renderPreviews();
        }

        async processFilesForAPI() {
            const contents = [];
            for (const file of this.files) {
                if (file.type.startsWith('image/')) {
                    const base64 = await this.fileToBase64(file);
                    contents.push({ type: 'image_url', image_url: { url: base64 } });
                } else {
                    const text = await fileToText(file);
                    contents.push({ type: 'text', text: `[Conteúdo do arquivo ${file.name}]:\n${text}` });
                }
            }
            return contents;
        }

        fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        clear() {
            this.files = [];
            this.renderPreviews();
        }
    }

    // Helper for text files
    function fileToText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    // --- Chat Manager ---
    class ChatManager {
        constructor(uiManager, apiManager, uploadManager) {
            this.ui = uiManager;
            this.api = apiManager;
            this.uploader = uploadManager;
            this.history = [];
            this.state = 'IDLE'; // IDLE, STREAMING
            this.currentStreamText = '';
            
            this.loadHistory();
            this.renderHistory();
            
            // Inject MathJax dynamically if not present
            if (!window.MathJax) {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
                script.async = true;
                document.head.appendChild(script);
                window.MathJax = { tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']] }, options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre'] } };
            }
        }

        loadHistory() {
            try {
                const data = localStorage.getItem(CONFIG.STORAGE_KEYS.HISTORY);
                this.history = data ? JSON.parse(data) : [];
            } catch (e) { this.history = []; }
        }

        saveHistory() {
            try {
                // Save without base64 images to prevent localStorage overflow
                const safeHistory = JSON.parse(JSON.stringify(this.history, (key, value) => {
                    if (key === 'image_url' && typeof value === 'string' && value.startsWith('data:')) return '[Imagem]';
                    return value;
                }));
                localStorage.setItem(CONFIG.STORAGE_KEYS.HISTORY, JSON.stringify(safeHistory));
            } catch (e) { console.warn('Falha ao salvar histórico:', e); }
        }

        clearHistory() {
            this.history = [];
            localStorage.removeItem(CONFIG.STORAGE_KEYS.HISTORY);
            this.ui.elements.chatArea.innerHTML = '';
            this.ui.showWelcome();
        }

        newChat() {
            this.clearHistory();
        }

        renderHistory() {
            if (this.history.length === 0) {
                this.ui.showWelcome();
                return;
            }
            this.ui.hideWelcome();
            const frag = document.createDocumentFragment();
            this.history.forEach(msg => {
                frag.appendChild(this.ui.createMessageElement(msg.role, msg.content, false));
            });
            this.ui.elements.chatArea.appendChild(frag);
            this.scrollToBottom();
        }

        async sendMessage(text) {
            if (this.state !== 'IDLE' || !text.trim()) return;

            this.ui.hideWelcome();
            const userContent = [{ type: 'text', text: text }];
            
            // Handle uploads
            const fileContents = await this.uploader.processFilesForAPI();
            if (fileContents.length > 0) {
                userContent.push(...fileContents);
            }
            this.uploader.clear();

            // Add to UI and History
            this.ui.createMessageElement('user', userContent, true);
            this.history.push({ role: 'user', content: userContent });

            // Setup AI response UI
            const aiMsgId = Utils.generateId();
            this.ui.createMessageElement('assistant', '', true, aiMsgId);
            this.history.push({ role: 'assistant', content: '' });
            
            this.state = 'STREAMING';
            this.currentStreamText = '';
            this.ui.setLoadingState(aiMsgId, true);
            this.ui.toggleStreamingUI(true);

            // Prepare API Messages (Pollinations format)
            const apiMessages = this.history.map(m => {
                if (typeof m.content === 'string') return { role: m.role, content: m.content };
                // Handle array content (vision)
                return { role: m.role, content: m.content };
            });

            await this.api.streamChat(
                apiMessages,
                (chunk) => {
                    this.currentStreamText += chunk;
                    this.ui.updateMessageContent(aiMsgId, this.currentStreamText);
                    this.scrollToBottom();
                },
                (status) => {
                    this.history[this.history.length - 1].content = this.currentStreamText;
                    this.saveHistory();
                    this.state = 'IDLE';
                    this.ui.setLoadingState(aiMsgId, false);
                    this.ui.toggleStreamingUI(false);
                    this.ui.addMessageActions(aiMsgId, this.currentStreamText);
                    this.renderMath(aiMsgId);
                    this.scrollToBottom();
                },
                (error) => {
                    this.ui.updateMessageContent(aiMsgId, `Erro: ${error.message}. Tente novamente.`);
                    this.history.pop(); // Remove failed assistant message
                    this.state = 'IDLE';
                    this.ui.setLoadingState(aiMsgId, false);
                    this.ui.toggleStreamingUI(false);
                }
            );
        }

        cancelGeneration() {
            if (this.state === 'STREAMING') {
                this.api.cancel();
            }
        }

        continueGeneration(msgId) {
            const msgIndex = this.history.findIndex(m => m.id === msgId); // Simplified: find last assistant
            const lastAiMsg = this.history.filter(m => m.role === 'assistant').pop();
            if (!lastAiMsg) return;
            
            // Trick the API by adding a user prompt to continue
            this.history.push({ role: 'user', content: 'Continue exatamente de onde você parou.' });
            this.sendMessage('Continue exatamente de onde você parou.');
        }

        regenerateLastResponse(msgId) {
            if (this.state !== 'IDLE') return;
            // Remove last AI message from history and UI
            if (this.history.length > 0 && this.history[this.history.length - 1].role === 'assistant') {
                this.history.pop();
                this.saveHistory();
            }
            const msgEl = document.getElementById(msgId);
            if (msgEl) msgEl.remove();
            
            // Resend last user message
            const lastUserMsg = this.history.filter(m => m.role === 'user').pop();
            if (lastUserMsg) {
                // Remove it from history to be re-added cleanly by sendMessage
                this.history.pop();
                const text = lastUserMsg.content.find(c => c.type === 'text')?.text || '';
                // Re-add files if they were text based (images are lost for security/memory reasons)
                this.sendMessage(text);
            }
        }

        editMessage(msgId, newtext) {
            if (this.state !== 'IDLE' || !newtext.trim()) return;
            
            // Find index of this message
            const idx = this.history.findIndex(m => m.id === msgId);
            if (idx === -1) return;

            // Truncate history from this point
            this.history = this.history.slice(0, idx);
            
            // Clear UI messages after this point
            let el = document.getElementById(msgId).nextElementSibling;
            while(el) {
                const next = el.nextElementSibling;
                el.remove();
                el = next;
            }

            // Update the text of the existing user bubble
            document.getElementById(msgId).querySelector('.msg-text').innerHTML = Utils.escapeHtml(newtext);
            
            // Send new message
            this.sendMessage(newtext);
        }

        scrollToBottom() {
            const area = this.ui.elements.chatArea;
            // Smooth scroll only if user is near bottom
            const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 150;
            if (isNearBottom || this.state === 'STREAMING') {
                area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
            }
        }

        renderMath(containerId) {
            if (!window.MathJax || !window.MathJax.typesetPromise) return;
            const el = document.getElementById(containerId);
            if (el) {
                MathJax.typesetPromise([el]).catch(e => console.warn('MathJax error', e));
            }
        }
    }

    // --- UI Manager ---
    class UIManager {
        constructor() {
            this.elements = {};
            this.isMaximized = false;
            this.isMinimized = false;
            this.prevBounds = {};
            this.injectStyles();
            this.createDOM();
            this.setupWindowControls();
            this.loadUIState();
        }

        injectStyles() {
            const style = document.createElement('style');
            style.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
                
                #${ROOT_ID} {
                    --md-primary: #8ab4f8;
                    --md-on-primary: #003566;
                    --md-surface: #1e1e2e;
                    --md-surface-container: #252536;
                    --md-surface-container-high: #2d2d42;
                    --md-on-surface: #e2e1f0;
                    --md-on-surface-var: #a1a1b5;
                    --md-outline: #46465a;
                    --md-error: #f28b82;
                    --radius-l: 28px;
                    --radius-m: 16px;
                    --radius-s: 8px;
                    font-family: 'Inter', sans-serif;
                    position: fixed;
                    width: 420px;
                    height: 600px;
                    background: rgba(30, 30, 46, 0.85);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: var(--radius-l);
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset;
                    z-index: 999999;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    color: var(--md-on-surface);
                    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.3s;
                }
                #${ROOT_ID}.maximized { width: 100vw !important; height: 100vh !important; top: 0 !important; left: 0 !important; border-radius: 0; }
                #${ROOT_ID}.minimized { height: 56px !important; overflow: hidden; border-radius: var(--radius-l); }
                #${ROOT_ID}.minimized .chat-body,
                #${ROOT_ID}.minimized .chat-input-area { display: none; }
                
                /* Header */
                .chat-header {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 12px 16px; background: transparent; flex-shrink: 0;
                    cursor: default; user-select: none; border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .chat-header-left { display: flex; align-items: center; gap: 12px; }
                .chat-avatar-ai { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #8ab4f8, #b69df8); display: flex; align-items: center; justify-content: center; font-size: 18px; }
                .chat-title { font-weight: 600; font-size: 1.1rem; }
                .chat-header-actions { display: flex; gap: 4px; }
                .hdr-btn { background: none; border: none; color: var(--md-on-surface-var); cursor: pointer; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; transition: background 0.2s; }
                .hdr-btn:hover { background: rgba(255,255,255,0.1); }

                /* Body */
                .chat-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; scroll-behavior: smooth; }
                .chat-body::-webkit-scrollbar { width: 6px; }
                .chat-body::-webkit-scrollbar-track { background: transparent; }
                .chat-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }

                /* Welcome */
                .welcome-screen { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 24px; opacity: 0.8; }
                .welcome-screen h2 { font-size: 1.5rem; font-weight: 500; background: linear-gradient(to right, #8ab4f8, #b69df8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                .welcome-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; padding: 0 16px; }
                .chip { background: var(--md-surface-container); border: 1px solid var(--md-outline); color: var(--md-on-surface); padding: 12px; border-radius: var(--radius-m); font-size: 0.85rem; cursor: pointer; transition: all 0.2s; text-align: left; }
                .chip:hover { background: var(--md-surface-container-high); border-color: var(--md-primary); }

                /* Messages */
                .msg-wrapper { display: flex; gap: 12px; animation: fadeIn 0.3s ease; }
                .msg-wrapper.user { flex-direction: row-reverse; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .msg-avatar { width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; margin-top: 4px; }
                .msg-avatar.ai { background: linear-gradient(135deg, #8ab4f8, #b69df8); }
                .msg-avatar.user { background: var(--md-surface-container-high); }
                .msg-content { max-width: 85%; display: flex; flex-direction: column; gap: 4px; }
                .msg-bubble { padding: 12px 16px; border-radius: var(--radius-m); line-height: 1.6; font-size: 0.9rem; position: relative; word-wrap: break-word; }
                .msg-wrapper.assistant .msg-bubble { background: var(--md-surface-container); border-bottom-left-radius: 4px; }
                .msg-wrapper.user .msg-bubble { background: var(--md-primary); color: var(--md-on-primary); border-bottom-right-radius: 4px; }
                .msg-meta { display: flex; align-items: center; gap: 8px; font-size: 0.7rem; color: var(--md-on-surface-var); padding: 0 4px; }
                .msg-wrapper.user .msg-meta { flex-direction: row-reverse; }
                .msg-img-preview { max-width: 200px; border-radius: var(--radius-s); margin-top: 8px; display: block; }
                
                /* Streaming & Loading */
                .typing-indicator span { display: inline-block; width: 6px; height: 6px; background: var(--md-on-surface-var); border-radius: 50%; margin: 0 2px; animation: bounce 1.4s infinite ease-in-out both; }
                .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
                .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
                @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

                /* Message Actions */
                .msg-actions { display: flex; gap: 4px; margin-top: 4px; opacity: 0; transition: opacity 0.2s; }
                .msg-wrapper:hover .msg-actions { opacity: 1; }
                .msg-act-btn { background: none; border: none; color: var(--md-on-surface-var); cursor: pointer; font-size: 0.75rem; padding: 4px 8px; border-radius: 12px; display: flex; align-items: center; gap: 4px; }
                .msg-act-btn:hover { background: rgba(255,255,255,0.1); }

                /* Markdown Specifics */
                .msg-bubble h1, .msg-bubble h2, .msg-bubble h3 { margin: 16px 0 8px 0; font-weight: 600; }
                .msg-bubble p { margin: 0 0 8px 0; }
                .msg-bubble p:last-child { margin-bottom: 0; }
                .msg-bubble ul, .msg-bubble ol { margin: 8px 0; padding-left: 24px; }
                .msg-bubble li { margin-bottom: 4px; }
                .msg-bubble a { color: var(--md-primary); text-decoration: none; }
                .msg-bubble a:hover { text-decoration: underline; }
                .md-inline-code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Fira Code', monospace; font-size: 0.85em; }
                .md-code-block { position: relative; margin: 12px 0; border-radius: var(--radius-s); overflow: hidden; background: #1a1a2e; border: 1px solid var(--md-outline); }
                .md-code-block pre { margin: 0; padding: 16px; overflow-x: auto; font-size: 0.85rem; }
                .md-code-block code { font-family: 'Fira Code', monospace; }
                .md-copy-btn { position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.1); border: none; color: #fff; padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; cursor: pointer; transition: background 0.2s; }
                .md-copy-btn:hover { background: rgba(255,255,255,0.2); }
                .md-keyword { color: #c792ea; }
                .md-string { color: #c3e88d; }
                .md-comment { color: #546e7a; font-style: italic; }
                .md-number { color: #f78c6c; }
                .md-table-wrap { overflow-x: auto; margin: 12px 0; }
                .md-table-wrap table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
                .md-table-wrap th, .md-table-wrap td { border: 1px solid var(--md-outline); padding: 8px 12px; text-align: left; }
                .md-table-wrap th { background: rgba(255,255,255,0.05); }

                /* Input Area */
                .chat-input-area { padding: 12px 16px 16px 16px; background: transparent; border-top: 1px solid rgba(255,255,255,0.05); }
                .preview-container { display: none; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
                .preview-item { position: relative; width: 60px; height: 60px; border-radius: var(--radius-s); overflow: hidden; background: var(--md-surface-container); display: flex; align-items: center; justify-content: center; }
                .preview-item img { width: 100%; height: 100%; object-fit: cover; }
                .preview-doc-icon { font-size: 24px; }
                .preview-doc-name { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); font-size: 0.6rem; padding: 2px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .preview-remove { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; line-height: 1; }
                
                .input-wrapper { display: flex; align-items: flex-end; background: var(--md-surface-container); border: 1px solid var(--md-outline); border-radius: 24px; padding: 4px 8px; transition: border-color 0.2s; }
                .input-wrapper:focus-within { border-color: var(--md-primary); }
                .input-actions { display: flex; align-items: center; gap: 4px; padding-bottom: 4px; }
                .input-btn { background: none; border: none; color: var(--md-on-surface-var); cursor: pointer; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
                .input-btn:hover { background: rgba(255,255,255,0.1); color: var(--md-on-surface); }
                .input-btn.send { color: var(--md-primary); }
                .input-btn.stop { color: var(--md-error); }
                
                #chat-textarea { flex: 1; background: none; border: none; color: var(--md-on-surface); resize: none; outline: none; font-family: inherit; font-size: 0.9rem; padding: 8px; max-height: 150px; line-height: 1.4; }
                #chat-textarea::placeholder { color: var(--md-on-surface-var); }

                /* Resize Handle */
                .resize-handle { position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; cursor: nwse-resize; opacity: 0.5; }
                .resize-handle::after { content: ''; position: absolute; bottom: 4px; right: 4px; width: 10px; height: 10px; border-right: 2px solid var(--md-on-surface-var); border-bottom: 2px solid var(--md-on-surface-var); }

                /* Drag over state */
                .drag-over { border-color: var(--md-primary) !important; }
                .drag-over .chat-body { background: rgba(138, 180, 248, 0.05); }
            `;
            document.head.appendChild(style);
        }

        createDOM() {
            const root = document.createElement('div');
            root.id = ROOT_ID;
            root.innerHTML = `
                <div class="chat-header">
                    <div class="chat-header-left">
                        <div class="chat-avatar-ai">✦</div>
                        <div class="chat-title">Pollinations AI</div>
                    </div>
                    <div class="chat-header-actions">
                        <button class="hdr-btn" id="btn-new-chat" title="Nova conversa">✎</button>
                        <button class="hdr-btn" id="btn-clear-hist" title="Limpar histórico">🗑</button>
                        <button class="hdr-btn" id="btn-minimize" title="Minimizar">─</button>
                        <button class="hdr-btn" id="btn-maximize" title="Maximizar">☐</button>
                        <button class="hdr-btn" id="btn-close" title="Fechar">✕</button>
                    </div>
                </div>
                <div class="chat-body" id="chat-body">
                    <div class="welcome-screen" id="welcome-screen">
                        <div class="chat-avatar-ai" style="width: 48px; height: 48px; font-size: 24px;">✦</div>
                        <h2>Como posso ajudar você?</h2>
                        <div class="welcome-chips">
                            <div class="chip" data-prompt="Explique computação quântica de forma simples">Explique computação quântica</div>
                            <div class="chip" data-prompt="Me dê ideias de projetos para aprender React">Ideias de projetos React</div>
                            <div class="chip" data-prompt="Escreva um script Python para organizar arquivos">Script Python para organizar</div>
                            <div class="chip" data-prompt="Crie uma dieta balanceada para ganho de massa muscular">Dieta para massa muscular</div>
                        </div>
                    </div>
                </div>
                <div class="chat-input-area">
                    <div class="preview-container" id="preview-container"></div>
                    <div class="input-wrapper">
                        <div class="input-actions">
                            <input type="file" id="file-input" hidden multiple accept="image/*,.pdf,.txt,.csv,.json,.docx">
                            <button class="input-btn" id="btn-attach" title="Anexar arquivo">+</button>
                        </div>
                        <textarea id="chat-textarea" rows="1" placeholder="Digite sua mensagem aqui..."></textarea>
                        <div class="input-actions">
                            <button class="input-btn send" id="btn-send" title="Enviar">➤</button>
                            <button class="input-btn stop" id="btn-stop" title="Parar geração" style="display:none;">■</button>
                        </div>
                    </div>
                </div>
                <div class="resize-handle" id="resize-handle"></div>
            `;
            document.body.appendChild(root);

            // Cache elements
            this.elements = {
                root,
                chatArea: root.querySelector('#chat-body'),
                welcomeScreen: root.querySelector('#welcome-screen'),
                textarea: root.querySelector('#chat-textarea'),
                fileInput: root.querySelector('#file-input'),
                previewContainer: root.querySelector('#preview-container'),
                btnSend: root.querySelector('#btn-send'),
                btnStop: root.querySelector('#btn-stop'),
                btnAttach: root.querySelector('#btn-attach'),
                btnMinimize: root.querySelector('#btn-minimize'),
                btnMaximize: root.querySelector('#btn-maximize'),
                btnClose: root.querySelector('#btn-close'),
                btnNewChat: root.querySelector('#btn-new-chat'),
                btnClearHist: root.querySelector('#btn-clear-hist'),
                resizeHandle: root.querySelector('#resize-handle'),
                header: root.querySelector('.chat-header')
            };

            this.setupTextareaAutoResize();
            this.setupChipClicks();
        }

        setupTextareaAutoResize() {
            const ta = this.elements.textarea;
            ta.addEventListener('input', () => {
                ta.style.height = 'auto';
                ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
            });
        }

        setupChipClicks() {
            this.elements.welcomeScreen.querySelectorAll('.chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    this.elements.textarea.value = chip.dataset.prompt;
                    this.elements.btnSend.click();
                });
            });
        }

        setupWindowControls(chatManager) {
            const { root, header, resizeHandle, btnMinimize, btnMaximize, btnClose, btnNewChat, btnClearHist } = this.elements;

            // Drag
            let isDragging = false, startX, startY, startLeft, startTop;
            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('.chat-header-actions')) return;
                if (this.isMaximized) return;
                isDragging = true;
                startX = e.clientX; startY = e.clientY;
                const rect = root.getBoundingClientRect();
                startLeft = rect.left; startTop = rect.top;
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                root.style.left = (startLeft + e.clientX - startX) + 'px';
                root.style.top = (startTop + e.clientY - startY) + 'px';
                root.style.right = 'auto';
            });
            document.addEventListener('mouseup', () => { isDragging = false; this.saveUIState(); });

            // Resize
            let isResizing = false, startW, startH, startMX, startMY;
            resizeHandle.addEventListener('mousedown', (e) => {
                if (this.isMaximized) return;
                isResizing = true;
                startW = root.offsetWidth; startH = root.offsetHeight;
                startMX = e.clientX; startMY = e.clientY;
                e.preventDefault(); e.stopPropagation();
            });
            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                root.style.width = Math.max(300, startW + e.clientX - startMX) + 'px';
                root.style.height = Math.max(400, startH + e.clientY - startMY) + 'px';
            });
            document.addEventListener('mouseup', () => { isResizing = false; this.saveUIState(); });

            // Window States
            btnMinimize.addEventListener('click', () => {
                this.isMinimized = !this.isMinimized;
                root.classList.toggle('minimized', this.isMinimized);
            });
            btnMaximize.addEventListener('click', () => {
                this.isMaximized = !this.isMaximized;
                if (this.isMaximized) {
                    this.prevBounds = { left: root.style.left, top: root.style.top, width: root.style.width, height: root.style.height };
                    root.classList.add('maximized');
                } else {
                    root.classList.remove('maximized');
                    Object.assign(root.style, this.prevBounds);
                }
            });
            btnClose.addEventListener('click', () => root.remove());
            btnNewChat.addEventListener('click', () => chatManager.newChat());
            btnClearHist.addEventListener('click', () => chatManager.clearHistory());

            // F10 Toggle
            this._f10Handler = (e) => {
                if (e.key === 'F10') {
                    e.preventDefault();
                    if (root.style.display === 'none') root.style.display = 'flex';
                    else root.style.display = 'none';
                }
            };
            document.addEventListener('keydown', this._f10Handler);
        }

        showWelcome() { this.elements.welcomeScreen.style.display = 'flex'; }
        hideWelcome() { this.elements.welcomeScreen.style.display = 'none'; }

        toggleStreamingUI(isStreaming) {
            this.elements.btnSend.style.display = isStreaming ? 'none' : 'flex';
            this.elements.btnStop.style.display = isStreaming ? 'flex' : 'none';
        }

        setLoadingState(msgId, isLoading) {
            const el = document.getElementById(msgId);
            if (!el) return;
            const textEl = el.querySelector('.msg-text');
            if (isLoading && !textEl.innerHTML) {
                textEl.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
            }
        }

        createMessageElement(role, content, appendToDOM, id = null) {
            const msgId = id || Utils.generateId();
            const wrapper = document.createElement('div');
            wrapper.className = `msg-wrapper ${role}`;
            wrapper.id = msgId;

            const avatarChar = role === 'user' ? '👤' : '✦';
            
            let contentHtml = '';
            if (typeof content === 'string') {
                contentHtml = role === 'user' ? Utils.escapeHtml(content) : MarkdownParser.parse(content);
            } else if (Array.isArray(content)) {
                // Array format (Vision/Files)
                content.forEach(c => {
                    if (c.type === 'text') contentHtml += Utils.escapeHtml(c.text);
                    if (c.type === 'image_url' && c.image_url?.url) {
                        contentHtml += `<img src="${c.image_url.url}" class="msg-img-preview" alt="Upload">`;
                    }
                });
            }

            wrapper.innerHTML = `
                <div class="msg-avatar ${role}">${avatarChar}</div>
                <div class="msg-content">
                    <div class="msg-bubble"><div class="msg-text">${contentHtml}</div></div>
                    <div class="msg-meta">
                        <span>${Utils.getTimeString()}</span>
                        <div class="msg-actions"></div>
                    </div>
                </div>
            `;

            if (role === 'user') {
                const actionsDiv = wrapper.querySelector('.msg-actions');
                actionsDiv.innerHTML = `<button class="msg-act-btn" data-action="edit">✏️ Editar</button><button class="msg-act-btn" data-action="copy">📋 Copiar</button>`;
                actionsDiv.addEventListener('click', (e) => {
                    const action = e.target.dataset.action;
                    if (action === 'copy') {
                        const text = content.find(c => c.type === 'text')?.text || '';
                        navigator.clipboard.writeText(text);
                        e.target.textContent = '✅ Copiado';
                        setTimeout(() => e.target.textContent = '📋 Copiar', 2000);
                    }
                    // Edit handled by chatManager delegation
                });
            }

            if (appendToDOM) this.elements.chatArea.appendChild(wrapper);
            return wrapper;
        }

        addMessageActions(msgId, text) {
            const wrapper = document.getElementById(msgId);
            if (!wrapper) return;
            const actionsDiv = wrapper.querySelector('.msg-actions');
            if (!actionsDiv) return;
            
            actionsDiv.innerHTML = `
                <button class="msg-act-btn" data-action="copy">📋 Copiar</button>
                <button class="msg-act-btn" data-action="continue">▶ Continuar</button>
                <button class="msg-act-btn" data-action="regen">🔄 Regenerar</button>
            `;

            actionsDiv.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action === 'copy') {
                    navigator.clipboard.writeText(text);
                    e.target.textContent = '✅ Copiado';
                    setTimeout(() => e.target.textContent = '📋 Copiar', 2000);
                }
                // Dispatch custom events for ChatManager to handle complex state logic
                wrapper.dispatchEvent(new CustomEvent('msgAction', { detail: { action, msgId, text } }));
            });
        }

        updateMessageContent(msgId, text) {
            const el = document.getElementById(msgId);
            if (!el) return;
            const textEl = el.querySelector('.msg-text');
            // Debounce parsing to prevent lag during fast streaming
            if (this._parseTimeout) clearTimeout(this._parseTimeout);
            textEl.textContent = text; // Fast text update
            this._parseTimeout = setTimeout(() => {
                textEl.innerHTML = MarkdownParser.parse(text); // Heavy HTML update
            }, 100);
        }

        saveUIState() {
            const rect = this.elements.root.getBoundingClientRect();
            try {
                localStorage.setItem(CONFIG.STORAGE_KEYS.UI_STATE, JSON.stringify({
                    left: rect.left, top: rect.top, width: rect.width, height: rect.height
                }));
            } catch (e) {}
        }

        loadUIState() {
            try {
                const state = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.UI_STATE));
                if (state && state.width > 0) {
                    Object.assign(this.elements.root.style, {
                        left: state.left + 'px', top: state.top + 'px',
                        width: state.width + 'px', height: state.height + 'px',
                        right: 'auto'
                    });
                }
            } catch (e) {}
        }

        destroy() {
            document.removeEventListener('keydown', this._f10Handler);
            this.elements.root.remove();
        }
    }

    // --- Main Application Controller ---
    class GeminiClone {
        constructor() {
            this.ui = new UIManager();
            this.api = new APIManager();
            this.uploader = new UploadManager(this.ui);
            this.chat = new ChatManager(this.ui, this.api, this.uploader);
            
            this.bindEvents();
            this.ui.setupWindowControls(this.chat);
        }

        bindEvents() {
            const { textarea, btnSend, btnStop } = this.ui.elements;

            const handleSend = () => {
                const text = textarea.value.trim();
                if (text) {
                    textarea.value = '';
                    textarea.style.height = 'auto';
                    this.chat.sendMessage(text);
                }
            };

            btnSend.addEventListener('click', handleSend);
            btnStop.addEventListener('click', () => this.chat.cancelGeneration());

            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                }
            });

            // Delegate Message Actions (Edit, Continue, Regen)
            this.ui.elements.chatArea.addEventListener('msgAction', (e) => {
                const { action, msgId, text } = e.detail;
                if (action === 'continue') this.chat.continueGeneration(msgId);
                if (action === 'regen') this.chat.regenerateLastResponse(msgId);
                if (action === 'edit') this.promptEdit(msgId);
            });

            // Handle User Edit Action click
            this.ui.elements.chatArea.addEventListener('click', (e) => {
                if (e.target.dataset.action === 'edit' && e.target.closest('.msg-wrapper.user')) {
                    const msgId = e.target.closest('.msg-wrapper').id;
                    this.promptEdit(msgId);
                }
            });
        }

        promptEdit(msgId) {
            const msgEl = document.getElementById(msgId);
            const textEl = msgEl.querySelector('.msg-text');
            const currentText = textEl.textContent;
            
            const input = document.createElement('textarea');
            input.value = currentText;
            input.className = 'edit-textarea';
            input.style.cssText = 'width: 100%; background: rgba(0,0,0,0.2); border: 1px solid var(--md-primary); color: var(--md-on-surface); border-radius: 8px; padding: 8px; resize: none; font-family: inherit; outline:none;';
            
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; gap:8px; margin-top:8px; justify-content:flex-end;';
            actions.innerHTML = `
                <button class="msg-act-btn" id="edit-cancel">Cancelar</button>
                <button class="msg-act-btn" style="background:var(--md-primary); color:var(--md-on-primary);" id="edit-save">Salvar & Enviar</button>
            `;

            textEl.style.display = 'none';
            textEl.parentNode.appendChild(input);
            textEl.parentNode.appendChild(actions);
            input.focus();

            actions.querySelector('#edit-cancel').addEventListener('click', () => {
                input.remove(); actions.remove(); textEl.style.display = 'block';
            });
            actions.querySelector('#edit-save').addEventListener('click', () => {
                const newText = input.value.trim();
                input.remove(); actions.remove(); textEl.style.display = 'block';
                if (newText && newText !== currentText) {
                    this.chat.editMessage(msgId, newText);
                }
            });
        }
    }

    // Initialize
    new GeminiClone();

})();
