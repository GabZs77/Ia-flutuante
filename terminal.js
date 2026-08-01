/* ===================================================================
   Internet IA Mini — Widget flutuante injetável (bookmarklet-ready)
   Script único e autocontido. Pode ser incluído via <script src="...">
   ou injetado em qualquer página (bookmarklet).
   =================================================================== */
(function () {
    // Evita injeção duplicada: se já existe, apenas alterna a visibilidade
    if (window.__internetIAMini) {
        window.__internetIAMini.toggle();
        return;
    }

    const API_CONFIG = {
        url: 'https://gen.pollinations.ai/v1/chat/completions',
        key: 'pk_bJav4nbMa2fZGkqG',
        model: 'openai'
    };

    const STORAGE_KEY = 'internet_ia_mini_history';
    const MAX_HISTORY = 20;

    // ===== ESTADO =====
    const state = {
        messages: loadHistory(),
        isOpen: false,
        isGenerating: false,
        abortController: null,
        dragging: false,
        dragOffset: { x: 0, y: 0 }
    };

    function loadHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function saveHistory() {
        try {
            const trimmed = state.messages.slice(-MAX_HISTORY);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        } catch (e) {}
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Markdown mínimo: negrito, itálico, código inline, blocos de código e quebras de linha
    function mdLite(text) {
        let t = escapeHtml(text);
        t = t.replace(/```([\s\S]*?)```/g, (m, code) => `<pre>${code.trim()}</pre>`);
        t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
        t = t.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        t = t.replace(/\*(.*?)\*/g, '<i>$1</i>');
        t = t.replace(/\n/g, '<br>');
        return t;
    }

    // ===== ESTILOS =====
    const STYLE_ID = 'internet-ia-mini-style';
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
        #iamini-bubble{position:fixed;bottom:20px;right:20px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#1a1a1a,#3a3a3a);border:1px solid rgba(255,255,255,0.15);box-shadow:0 6px 24px rgba(0,0,0,0.4);cursor:pointer;z-index:2147483000;display:flex;align-items:center;justify-content:center;transition:transform .15s ease}
        #iamini-bubble:hover{transform:scale(1.06)}
        #iamini-bubble svg{width:24px;height:24px;color:#fff}
        #iamini-win{position:fixed;bottom:84px;right:20px;width:320px;height:440px;max-height:70vh;background:#0a0a0a;border:1px solid rgba(255,255,255,0.1);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.55);z-index:2147483000;display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#fff}
        #iamini-win.open{display:flex}
        #iamini-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#111;border-bottom:1px solid rgba(255,255,255,0.08);cursor:move;user-select:none}
        #iamini-head .iamini-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;flex-shrink:0}
        #iamini-title{font-size:12.5px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .iamini-headbtn{width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.55);cursor:pointer;flex-shrink:0}
        .iamini-headbtn:hover{background:rgba(255,255,255,0.08);color:#fff}
        #iamini-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;font-size:12.5px;line-height:1.55}
        #iamini-msgs::-webkit-scrollbar{width:4px}
        #iamini-msgs::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:8px}
        .iamini-msg{max-width:88%;padding:8px 11px;border-radius:10px;word-wrap:break-word}
        .iamini-msg.user{align-self:flex-end;background:#2563eb;color:#fff;border-bottom-right-radius:3px}
        .iamini-msg.ai{align-self:flex-start;background:#161616;border:1px solid rgba(255,255,255,0.08);border-bottom-left-radius:3px}
        .iamini-msg pre{background:#000;padding:8px;border-radius:6px;overflow-x:auto;font-size:11px;margin:6px 0}
        .iamini-msg code{background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:11px}
        #iamini-empty{margin:auto;text-align:center;color:rgba(255,255,255,0.35);font-size:12px;padding:20px}
        #iamini-inputbar{display:flex;gap:6px;padding:8px;border-top:1px solid rgba(255,255,255,0.08);background:#0d0d0d}
        #iamini-input{flex:1;resize:none;background:#161616;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:12.5px;padding:8px 10px;max-height:80px;font-family:inherit;outline:none}
        #iamini-input:focus{border-color:rgba(255,255,255,0.25)}
        #iamini-send{width:32px;height:32px;border-radius:8px;background:#fff;color:#000;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:opacity .15s}
        #iamini-send:disabled{opacity:0.35;cursor:default}
        #iamini-send svg{width:15px;height:15px}
        .iamini-typing{display:flex;gap:3px;padding:8px 11px;align-self:flex-start}
        .iamini-typing span{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.4);animation:iamini-blink 1s infinite}
        .iamini-typing span:nth-child(2){animation-delay:.15s}
        .iamini-typing span:nth-child(3){animation-delay:.3s}
        @keyframes iamini-blink{0%,100%{opacity:.3}50%{opacity:1}}
        @media(max-width:420px){#iamini-win{width:92vw;right:4vw;bottom:78px}}
        `;
        document.head.appendChild(style);
    }

    // ===== ESTRUTURA HTML =====
    const bubble = document.createElement('div');
    bubble.id = 'iamini-bubble';
    bubble.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';

    const win = document.createElement('div');
    win.id = 'iamini-win';
    win.innerHTML = `
        <div id="iamini-head">
            <span class="iamini-dot"></span>
            <span id="iamini-title">Internet IA — Mini</span>
            <span class="iamini-headbtn" id="iamini-clear" title="Limpar conversa">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </span>
            <span class="iamini-headbtn" id="iamini-close" title="Fechar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </span>
        </div>
        <div id="iamini-msgs"></div>
        <div id="iamini-inputbar">
            <textarea id="iamini-input" placeholder="Pergunte algo..." rows="1"></textarea>
            <div id="iamini-send">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </div>
        </div>
    `;

    document.body.appendChild(bubble);
    document.body.appendChild(win);

    const $msgs = win.querySelector('#iamini-msgs');
    const $input = win.querySelector('#iamini-input');
    const $send = win.querySelector('#iamini-send');
    const $head = win.querySelector('#iamini-head');
    const $close = win.querySelector('#iamini-close');
    const $clear = win.querySelector('#iamini-clear');

    // ===== RENDER =====
    function render() {
        if (state.messages.length === 0) {
            $msgs.innerHTML = '<div id="iamini-empty">👋 Oi! Sou a Internet IA em versão mini.<br>Pergunte qualquer coisa.</div>';
            return;
        }
        $msgs.innerHTML = state.messages.map(m =>
            `<div class="iamini-msg ${m.role === 'user' ? 'user' : 'ai'}">${mdLite(m.content)}</div>`
        ).join('');
        $msgs.scrollTop = $msgs.scrollHeight;
    }

    function showTyping() {
        const el = document.createElement('div');
        el.className = 'iamini-typing';
        el.id = 'iamini-typing';
        el.innerHTML = '<span></span><span></span><span></span>';
        $msgs.appendChild(el);
        $msgs.scrollTop = $msgs.scrollHeight;
    }
    function hideTyping() {
        const el = document.getElementById('iamini-typing');
        if (el) el.remove();
    }

    // ===== ENVIO DE MENSAGEM =====
    async function sendMessage() {
        const text = $input.value.trim();
        if (!text || state.isGenerating) return;
        state.messages.push({ role: 'user', content: text });
        $input.value = '';
        autoGrow();
        render();
        saveHistory();

        state.isGenerating = true;
        $send.style.pointerEvents = 'none';
        showTyping();

        try {
            state.abortController = new AbortController();
            const res = await fetch(API_CONFIG.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_CONFIG.key}`
                },
                body: JSON.stringify({
                    model: API_CONFIG.model,
                    messages: [
                        { role: 'system', content: 'Você é a Internet IA, um assistente rápido, direto e útil. Responda sempre em português brasileiro, com respostas curtas e objetivas — esta é a versão mini em janela flutuante.' },
                        ...state.messages.map(m => ({ role: m.role, content: m.content }))
                    ],
                    stream: true
                }),
                signal: state.abortController.signal
            });
            if (!res.ok) throw new Error('Erro na API: ' + res.status);

            hideTyping();
            const aiMsg = { role: 'assistant', content: '' };
            state.messages.push(aiMsg);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const payload = trimmed.slice(5).trim();
                    if (payload === '[DONE]') continue;
                    try {
                        const json = JSON.parse(payload);
                        const delta = json.choices?.[0]?.delta?.content;
                        if (delta) {
                            aiMsg.content += delta;
                            render();
                        }
                    } catch (e) {}
                }
            }
            saveHistory();
        } catch (e) {
            hideTyping();
            if (e.name !== 'AbortError') {
                state.messages.push({ role: 'assistant', content: '⚠️ Erro ao gerar resposta. Tente novamente.' });
                render();
            }
        } finally {
            state.isGenerating = false;
            $send.style.pointerEvents = '';
        }
    }

    function autoGrow() {
        $input.style.height = 'auto';
        $input.style.height = Math.min($input.scrollHeight, 80) + 'px';
    }

    // ===== EVENTOS =====
    $input.addEventListener('input', autoGrow);
    $input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    $send.addEventListener('click', sendMessage);
    $close.addEventListener('click', () => api.toggle(false));
    $clear.addEventListener('click', () => {
        if (confirm('Limpar a conversa mini?')) {
            state.messages = [];
            saveHistory();
            render();
        }
    });
    bubble.addEventListener('click', () => api.toggle());

    // Arrastar a janela pelo cabeçalho
    $head.addEventListener('mousedown', (e) => {
        if (e.target.closest('.iamini-headbtn')) return;
        state.dragging = true;
        const rect = win.getBoundingClientRect();
        state.dragOffset.x = e.clientX - rect.left;
        state.dragOffset.y = e.clientY - rect.top;
        win.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
        if (!state.dragging) return;
        const x = e.clientX - state.dragOffset.x;
        const y = e.clientY - state.dragOffset.y;
        win.style.left = Math.max(4, Math.min(window.innerWidth - win.offsetWidth - 4, x)) + 'px';
        win.style.top = Math.max(4, Math.min(window.innerHeight - win.offsetHeight - 4, y)) + 'px';
        win.style.right = 'auto';
        win.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { state.dragging = false; });

    // ===== API PÚBLICA =====
    const api = {
        toggle(force) {
            state.isOpen = typeof force === 'boolean' ? force : !state.isOpen;
            win.classList.toggle('open', state.isOpen);
            if (state.isOpen) $input.focus();
        },
        destroy() {
            bubble.remove();
            win.remove();
            const styleEl = document.getElementById(STYLE_ID);
            if (styleEl) styleEl.remove();
            delete window.__internetIAMini;
        }
    };
    window.__internetIAMini = api;

    render();
})();
