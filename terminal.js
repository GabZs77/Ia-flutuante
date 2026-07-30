/**
 * Terminal AI Painel - Sala do Futuro
 * Painel interativo para gerenciar tarefas com assistente IA
 * 
 * Uso: javascript:fetch("https://raw.githubusercontent.com/GabZs77/Ia-flutuante/main/terminal.js").then(r=>r.text()).then(eval);
 */

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────
  const CONFIG = {
    // API IA
    AI_URL: 'https://gen.pollinations.ai/v1/chat/completions',
    AI_KEY: 'pk_bJav4nbMa2fZGkqG',
    AI_MODEL: 'openai',

    // API Sala do Futuro
    LOGIN_URL: 'https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/credenciais/api/LoginCompletoToken',
    OCP_KEY: 'd701a2043aa24d7ebb37e9adf60d043b',
    EDUSP_TOKEN_URL: 'https://edusp-api.ip.tv/registration/edusp/token',

    // API Bypass CORS
    PROXY_URL: 'https://corsproxy.io/?',
    TURNSTILE_SECRET: '0x4AAAAAADf8FX1DAuHNy6M-3rohj2wvMvw'
  };

  // ── Estado global ──────────────────────────────────────────────────────────
  let state = {
    user: null,
    token: null,
    captcha: null,
    cf: null,
    tasks: { pending: [], expired: [] },
    currentTask: null,
    currentAnswers: null,
    selectedTab: 'dashboard',
    loading: false,
    aiHistory: []
  };

  // ── DOM refs ──────────────────────────────────────────────────────────────
  let root, win, content, tabsContainer, tabContent;
  let dashboardTab, tasksTab, assistantTab;
  let terminalOutput, inputArea, inputLine, sendBtn;

  // ── Utility ──────────────────────────────────────────────────────────────
  const Utils = {
    escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    formatTime(date = new Date()) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },
    formatDate(date) {
      const d = new Date(date);
      return d.toLocaleDateString('pt-BR');
    },
    debounce(fn, ms) {
      let t;
      return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    },
    uid() {
      return Math.random().toString(36).slice(2, 11);
    },
    sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }
  };

  // ── API Client ────────────────────────────────────────────────────────────
  class APIClient {
    // Login via Sala do Futuro
    async login(ra, senha, turnstileToken) {
      const body = { ra, senha, turnstile_token: turnstileToken };
      
      try {
        const response = await fetch(CONFIG.LOGIN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': CONFIG.OCP_KEY
          },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Falha no login');
        }

        const data = await response.json();
        console.log('Login response:', data);

        // Extrair dados do usuário
        const userData = {
          nome: data.nome || data.userName || data.name || 'Usuário',
          ra: data.ra || data.userId || data.ra || ra,
          token: data.token || data.accessToken || data.access_token,
          email: data.email || data.userEmail || '',
          escola: data.escola || data.schoolName || '',
          turma: data.turma || data.className || ''
        };

        if (!userData.token) {
          throw new Error('Token não encontrado na resposta');
        }

        return userData;
      } catch (error) {
        console.error('Login error:', error);
        throw new Error(error.message || 'Erro ao fazer login');
      }
    }

    // Obter token EDUSP
    async getEduspToken(token, captcha) {
      try {
        const response = await fetch(CONFIG.EDUSP_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ captcha })
        });

        if (!response.ok) {
          throw new Error('Falha ao obter token EDUSP');
        }

        const data = await response.json();
        return data.token || data.access_token || data;
      } catch (error) {
        console.error('EDUSP token error:', error);
        throw error;
      }
    }

    // Buscar tarefas
    async getTasks(token, captcha, cf = null) {
      const cookies = document.cookie;
      const targets = [];

      // Buscar targets (salas)
      try {
        const roomsResp = await fetch('https://edusp-api.ip.tv/room/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Captcha': captcha,
            'Cookie': cookies
          }
        });

        if (roomsResp.ok) {
          const roomsData = await roomsResp.json();
          for (const room of (roomsData.rooms || [])) {
            if (room.name) targets.push(String(room.name));
            for (const gc of (room.group_categories || [])) {
              if (gc.id) targets.push(String(gc.id));
            }
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar targets:', e);
      }

      // Buscar tarefas pendentes e expiradas
      const fetchTasks = async (expired) => {
        const baseUrl = `https://edusp-api.ip.tv/tms/task/todo?expired_only=${String(expired).toLowerCase()}&limit=100&offset=0&filter_expired=${String(!expired).toLowerCase()}&is_exam=false&with_answer=true&is_essay=false&answer_statuses=draft&answer_statuses=pending&with_apply_moment=true`;
        
        let url = baseUrl;
        for (const t of targets) {
          url += `&publication_target=${t}`;
        }

        try {
          const resp = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Captcha': captcha,
              'Cookie': cookies
            }
          });

          if (!resp.ok) return [];
          const data = await resp.json();
          
          if (Array.isArray(data)) return data;
          return data.results || data.tasks || [];
        } catch (e) {
          console.warn('Erro ao buscar tarefas:', e);
          return [];
        }
      };

      const pending = await fetchTasks(false);
      const expired = await fetchTasks(true);

      const formatTasks = (tasks, tipo) => {
        return tasks.map(t => ({
          id: t.id,
          title: t.title || `#${t.id}`,
          expire_at: t.expire_at ? Utils.formatDate(t.expire_at) : '-',
          publication_target: t.publication_target || '',
          tipo: tipo,
          description: t.description || '',
          questions: t.questions || []
        }));
      };

      return {
        pending: formatTasks(pending, 'pendente'),
        expired: formatTasks(expired, 'expirada'),
        captcha
      };
    }

    // Completar tarefa
    async completeTask(token, captcha, taskId, publicationTarget, waitSec = 90, cf = null, draft = false) {
      const cookies = document.cookie;
      
      try {
        // Aplicar tarefa
        const applyUrl = `https://edusp-api.ip.tv/tms/task/${taskId}/apply/?preview_mode=false&room_code=${publicationTarget}`;
        const applyResp = await fetch(applyUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Captcha': captcha,
            'Cookie': cookies
          }
        });

        if (!applyResp.ok) {
          const error = await applyResp.json();
          throw new Error(`Falha ao aplicar tarefa: ${error.message || applyResp.status}`);
        }

        const lesson = await applyResp.json();
        const wait = Math.max(lesson.min_execution_time || 60, waitSec);
        
        // Aguardar tempo mínimo
        await Utils.sleep(wait * 1000);

        // Completar tarefa
        const completeResp = await fetch('https://corsproxy.io/?https://edusp-api.ip.tv/api/complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'Accept-Language': 'pt-BR,pt;q=0.7',
            'Origin': 'https://edusp-api.ip.tv',
            'Referer': 'https://edusp-api.ip.tv/',
            'User-Agent': navigator.userAgent
          },
          body: JSON.stringify({
            x_auth_key: token,
            room_code: publicationTarget,
            lesson_id: taskId,
            draft: draft,
            lesson_info: lesson,
            time_spent: wait,
            answer_id: lesson.answer_id || 0,
            target_score: 100,
            captchaToken: captcha
          })
        });

        if (!completeResp.ok) {
          const error = await completeResp.json();
          throw new Error(`Falha ao completar tarefa: ${error.message || error.error || completeResp.status}`);
        }

        const result = await completeResp.json();
        return { success: true, wait, draft };
      } catch (error) {
        console.error('Complete task error:', error);
        throw error;
      }
    }

    // Buscar respostas da tarefa
    async getTaskAnswers(token, taskId, publicationTarget) {
      try {
        const url = `https://edusp-api.ip.tv/tms/task/${taskId}/answers?room_code=${publicationTarget}`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cookie': document.cookie
          }
        });

        if (!response.ok) {
          throw new Error('Falha ao buscar respostas');
        }

        const data = await response.json();
        return data.answers || data.results || data;
      } catch (error) {
        console.error('Get answers error:', error);
        return null;
      }
    }

    // Chat com IA
    async chat(messages, onChunk) {
      try {
        const response = await fetch(CONFIG.AI_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.AI_KEY}`
          },
          body: JSON.stringify({
            model: CONFIG.AI_MODEL,
            messages: messages,
            stream: true
          })
        });

        if (!response.ok) {
          throw new Error(`Erro na API: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const chunk = JSON.parse(data);
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) onChunk(content);
            } catch (e) {
              // Ignorar chunks malformados
            }
          }
        }
      } catch (error) {
        console.error('Chat error:', error);
        throw error;
      }
    }

    // Verificar Turnstile
    async verifyTurnstile(token) {
      if (!token) return false;
      try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: CONFIG.TURNSTILE_SECRET,
            response: token
          })
        });
        const result = await response.json();
        return result.success || false;
      } catch (e) {
        console.error('Turnstile verification error:', e);
        return false;
      }
    }
  }

  const api = new APIClient();

  // ── Interface do Terminal ──────────────────────────────────────────────────
  const terminalStyles = `
    #terminal-root {
      --term-bg: #0a0a0a;
      --term-surface: #111111;
      --term-surface2: #1a1a1a;
      --term-border: #2a2a2a;
      --term-text: #e0e0e0;
      --term-text2: #888888;
      --term-accent: #00d4ff;
      --term-accent2: #00ff88;
      --term-success: #00ff88;
      --term-warning: #ffd700;
      --term-error: #ff4444;
      --term-purple: #b388ff;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: var(--term-bg);
      color: var(--term-text);
      font-family: 'Courier New', 'Fira Code', monospace;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      pointer-events: all;
      animation: terminalFadeIn 0.3s ease;
    }

    @keyframes terminalFadeIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }

    #terminal-root * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* Header */
    .term-header {
      display: flex;
      align-items: center;
      padding: 8px 16px;
      background: var(--term-surface);
      border-bottom: 1px solid var(--term-border);
      flex-shrink: 0;
      min-height: 44px;
      user-select: none;
    }

    .term-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }

    .term-dots {
      display: flex;
      gap: 6px;
    }

    .term-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .term-dot:hover { opacity: 0.7; }
    .term-dot-red { background: #ff5f56; }
    .term-dot-yellow { background: #ffbd2e; }
    .term-dot-green { background: #27c93f; }

    .term-title {
      color: var(--term-text2);
      font-size: 12px;
      letter-spacing: 0.5px;
      margin-left: 8px;
    }

    .term-header-actions {
      display: flex;
      gap: 6px;
    }

    .term-hbtn {
      background: transparent;
      border: 1px solid var(--term-border);
      color: var(--term-text2);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .term-hbtn:hover {
      background: var(--term-surface2);
      color: var(--term-text);
      border-color: var(--term-text2);
    }

    /* Tabs */
    .term-tabs {
      display: flex;
      background: var(--term-surface);
      border-bottom: 1px solid var(--term-border);
      flex-shrink: 0;
      overflow-x: auto;
      padding: 0 8px;
    }

    .term-tab {
      padding: 8px 16px;
      color: var(--term-text2);
      cursor: pointer;
      font-size: 12px;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
      white-space: nowrap;
      background: transparent;
      border-top: none;
      border-left: none;
      border-right: none;
      font-family: inherit;
    }

    .term-tab:hover {
      color: var(--term-text);
      background: var(--term-surface2);
    }

    .term-tab.active {
      color: var(--term-accent);
      border-bottom-color: var(--term-accent);
    }

    .term-tab-badge {
      display: inline-block;
      background: var(--term-accent);
      color: #000;
      font-size: 10px;
      padding: 0 6px;
      border-radius: 10px;
      margin-left: 4px;
      font-weight: bold;
    }

    /* Content */
    .term-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: var(--term-bg);
    }

    .term-tab-content {
      display: none;
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
      flex-direction: column;
      gap: 8px;
    }

    .term-tab-content.active {
      display: flex;
    }

    .term-tab-content::-webkit-scrollbar {
      width: 6px;
    }

    .term-tab-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .term-tab-content::-webkit-scrollbar-thumb {
      background: var(--term-border);
      border-radius: 3px;
    }

    /* Terminal output */
    .term-output {
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
      padding: 8px 4px;
      flex: 1;
      overflow-y: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .term-output .line {
      margin: 2px 0;
    }

    .term-output .prompt {
      color: var(--term-accent2);
    }

    .term-output .info {
      color: var(--term-accent);
    }

    .term-output .warn {
      color: var(--term-warning);
    }

    .term-output .error {
      color: var(--term-error);
    }

    .term-output .success {
      color: var(--term-success);
    }

    .term-output .dim {
      color: var(--term-text2);
    }

    .term-output .highlight {
      color: var(--term-purple);
      font-weight: bold;
    }

    .term-output .cursor {
      animation: blink 1s step-end infinite;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    /* Status bar */
    .term-status {
      padding: 4px 16px;
      background: var(--term-surface);
      border-top: 1px solid var(--term-border);
      font-size: 11px;
      color: var(--term-text2);
      flex-shrink: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      min-height: 28px;
    }

    .term-status .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
    }

    .term-status .status-dot.online { background: var(--term-success); }
    .term-status .status-dot.busy { background: var(--term-warning); animation: pulse 1s ease-in-out infinite; }
    .term-status .status-dot.offline { background: var(--term-error); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    /* Task cards */
    .task-card {
      background: var(--term-surface);
      border: 1px solid var(--term-border);
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 8px;
      transition: all 0.2s;
    }

    .task-card:hover {
      border-color: var(--term-text2);
      background: var(--term-surface2);
    }

    .task-card .task-title {
      color: var(--term-text);
      font-weight: bold;
      font-size: 14px;
    }

    .task-card .task-meta {
      color: var(--term-text2);
      font-size: 12px;
      margin: 4px 0 8px 0;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .task-card .task-meta span {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .task-card .task-status {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
    }

    .task-card .task-status.pending {
      background: #1a3a2a;
      color: var(--term-success);
    }

    .task-card .task-status.expired {
      background: #3a1a1a;
      color: var(--term-error);
    }

    .task-card .task-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }

    .task-card .task-actions button {
      padding: 4px 14px;
      background: transparent;
      border: 1px solid var(--term-border);
      color: var(--term-text2);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
      font-family: inherit;
    }

    .task-card .task-actions button:hover {
      background: var(--term-surface2);
      color: var(--term-text);
      border-color: var(--term-text2);
    }

    .task-card .task-actions button.primary {
      border-color: var(--term-accent);
      color: var(--term-accent);
    }

    .task-card .task-actions button.primary:hover {
      background: var(--term-accent);
      color: #000;
    }

    .task-card .task-actions button.danger {
      border-color: var(--term-error);
      color: var(--term-error);
    }

    .task-card .task-actions button.danger:hover {
      background: var(--term-error);
      color: #000;
    }

    /* Loading spinner */
    .term-spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--term-border);
      border-top-color: var(--term-accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Input area */
    .term-input-area {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--term-surface);
      border-top: 1px solid var(--term-border);
      flex-shrink: 0;
    }

    .term-input-area .prompt-symbol {
      color: var(--term-accent2);
      font-weight: bold;
      font-size: 14px;
    }

    .term-input-area input {
      flex: 1;
      background: var(--term-bg);
      border: 1px solid var(--term-border);
      color: var(--term-text);
      padding: 6px 12px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }

    .term-input-area input:focus {
      border-color: var(--term-accent);
    }

    .term-input-area input::placeholder {
      color: var(--term-text2);
    }

    .term-input-area button {
      padding: 6px 16px;
      background: var(--term-accent);
      color: #000;
      border: none;
      border-radius: 4px;
      font-weight: bold;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
      font-family: inherit;
    }

    .term-input-area button:hover {
      opacity: 0.8;
      transform: scale(1.02);
    }

    .term-input-area button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      transform: none;
    }

    /* AI Chat messages */
    .ai-message {
      padding: 8px 12px;
      border-radius: 6px;
      margin: 4px 0;
      max-width: 90%;
      word-wrap: break-word;
    }

    .ai-message.user {
      background: var(--term-surface);
      border-left: 3px solid var(--term-accent);
      align-self: flex-end;
    }

    .ai-message.assistant {
      background: var(--term-surface2);
      border-left: 3px solid var(--term-purple);
      align-self: flex-start;
    }

    .ai-message .msg-role {
      font-size: 10px;
      color: var(--term-text2);
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .ai-message .msg-content {
      white-space: pre-wrap;
      line-height: 1.6;
    }

    .ai-message .msg-content code {
      background: var(--term-bg);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
    }

    .ai-chat-container {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }

    .ai-messages-area {
      flex: 1;
      overflow-y: auto;
      padding: 4px 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .ai-messages-area::-webkit-scrollbar {
      width: 4px;
    }

    .ai-messages-area::-webkit-scrollbar-thumb {
      background: var(--term-border);
      border-radius: 2px;
    }

    .ai-messages-area .typing-indicator {
      color: var(--term-text2);
      font-size: 12px;
      padding: 4px 8px;
    }

    .ai-messages-area .typing-indicator .dot {
      display: inline-block;
      animation: typingDot 1.4s infinite;
    }

    .ai-messages-area .typing-indicator .dot:nth-child(2) { animation-delay: 0.2s; }
    .ai-messages-area .typing-indicator .dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typingDot {
      0%, 60%, 100% { opacity: 0.3; }
      30% { opacity: 1; }
    }

    /* Animações de entrada */
    .fade-in {
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .slide-in {
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-8px); }
      to { opacity: 1; transform: translateX(0); }
    }

    /* Responsivo */
    @media (max-width: 768px) {
      #terminal-root {
        font-size: 12px;
      }
      .term-tab {
        padding: 6px 12px;
        font-size: 11px;
      }
      .term-header {
        padding: 4px 12px;
        min-height: 36px;
      }
      .term-tab-content {
        padding: 8px 12px;
      }
      .task-card .task-meta {
        flex-direction: column;
        gap: 4px;
      }
    }

    /* Scrollbar global */
    #terminal-root ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }

    #terminal-root ::-webkit-scrollbar-track {
      background: transparent;
    }

    #terminal-root ::-webkit-scrollbar-thumb {
      background: var(--term-border);
      border-radius: 3px;
    }

    #terminal-root ::-webkit-scrollbar-thumb:hover {
      background: var(--term-text2);
    }
  `;

  // ── Terminal UI ────────────────────────────────────────────────────────────
  class TerminalUI {
    constructor() {
      this._buildUI();
      this._bindEvents();
      this._showWelcome();
      this._startStatusLoop();
    }

    _buildUI() {
      // Root
      this.root = document.createElement('div');
      this.root.id = 'terminal-root';

      // Styles
      const style = document.createElement('style');
      style.textContent = terminalStyles;
      this.root.appendChild(style);

      // Header
      const header = document.createElement('div');
      header.className = 'term-header';
      header.innerHTML = `
        <div class="term-header-left">
          <div class="term-dots">
            <span class="term-dot term-dot-red" title="Fechar"></span>
            <span class="term-dot term-dot-yellow" title="Minimizar"></span>
            <span class="term-dot term-dot-green" title="Maximizar"></span>
          </div>
          <span class="term-title">⟫ TERMINAL — SALA DO FUTURO</span>
        </div>
        <div class="term-header-actions">
          <button class="term-hbtn" id="term-refresh">⟳ Atualizar</button>
          <button class="term-hbtn" id="term-close">✕ Fechar</button>
        </div>
      `;
      this.root.appendChild(header);

      // Tabs
      const tabs = document.createElement('div');
      tabs.className = 'term-tabs';
      tabs.innerHTML = `
        <button class="term-tab active" data-tab="dashboard">📊 Dashboard</button>
        <button class="term-tab" data-tab="tasks">📋 Tarefas <span class="term-tab-badge" id="task-badge">0</span></button>
        <button class="term-tab" data-tab="assistant">🤖 Assistente</button>
      `;
      this.root.appendChild(tabs);

      // Content
      const content = document.createElement('div');
      content.className = 'term-content';

      // Dashboard
      const dashboard = document.createElement('div');
      dashboard.className = 'term-tab-content active';
      dashboard.id = 'tab-dashboard';
      dashboard.innerHTML = `
        <div class="term-output" id="dashboard-output">
          <div class="line dim">⏳ Aguardando inicialização...</div>
        </div>
      `;
      content.appendChild(dashboard);

      // Tasks
      const tasks = document.createElement('div');
      tasks.className = 'term-tab-content';
      tasks.id = 'tab-tasks';
      tasks.innerHTML = `
        <div class="term-output" id="tasks-output">
          <div class="line dim">📭 Nenhuma tarefa carregada</div>
        </div>
      `;
      content.appendChild(tasks);

      // Assistant
      const assistant = document.createElement('div');
      assistant.className = 'term-tab-content';
      assistant.id = 'tab-assistant';
      assistant.innerHTML = `
        <div class="ai-chat-container">
          <div class="ai-messages-area" id="ai-messages"></div>
          <div class="term-input-area">
            <span class="prompt-symbol">❯</span>
            <input type="text" id="ai-input" placeholder="Pergunte sobre a atividade...">
            <button id="ai-send">Enviar</button>
          </div>
        </div>
      `;
      content.appendChild(assistant);

      this.root.appendChild(content);

      // Status bar
      const status = document.createElement('div');
      status.className = 'term-status';
      status.innerHTML = `
        <div>
          <span class="status-dot offline" id="status-dot"></span>
          <span id="status-text">Desconectado</span>
        </div>
        <div>
          <span id="status-user" class="dim">👤 Não autenticado</span>
          <span class="dim" style="margin-left:16px" id="status-time">${Utils.formatTime()}</span>
        </div>
      `;
      this.root.appendChild(status);

      document.body.appendChild(this.root);

      // Cache refs
      this.tabs = tabs;
      this.tabContent = content;
      this.dashboardOutput = document.getElementById('dashboard-output');
      this.tasksOutput = document.getElementById('tasks-output');
      this.aiMessages = document.getElementById('ai-messages');
      this.aiInput = document.getElementById('ai-input');
      this.aiSend = document.getElementById('ai-send');
      this.statusDot = document.getElementById('status-dot');
      this.statusText = document.getElementById('status-text');
      this.statusUser = document.getElementById('status-user');
      this.statusTime = document.getElementById('status-time');
      this.taskBadge = document.getElementById('task-badge');
    }

    _bindEvents() {
      // Tabs
      this.tabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.term-tab');
        if (!tab) return;

        // Update active tab
        this.tabs.querySelectorAll('.term-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update content
        const tabId = tab.dataset.tab;
        this.tabContent.querySelectorAll('.term-tab-content').forEach(c => c.classList.remove('active'));
        const target = document.getElementById(`tab-${tabId}`);
        if (target) target.classList.add('active');

        // Refresh data if needed
        if (tabId === 'tasks' && state.token) {
          this._loadTasks();
        }
      });

      // Close button
      document.getElementById('term-close').addEventListener('click', () => {
        this.root.style.display = 'none';
      });

      // Refresh button
      document.getElementById('term-refresh').addEventListener('click', () => {
        if (state.token) {
          this._loadTasks();
          this._appendToDashboard('🔄 Atualizando dados...', 'info');
        }
      });

      // AI Chat
      this.aiSend.addEventListener('click', () => this._sendAI());
      this.aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._sendAI();
        }
      });

      // Dot buttons
      const dotRed = this.root.querySelector('.term-dot-red');
      dotRed.addEventListener('click', () => {
        if (confirm('Fechar terminal?')) {
          this.root.style.display = 'none';
        }
      });

      const dotYellow = this.root.querySelector('.term-dot-yellow');
      dotYellow.addEventListener('click', () => {
        this.root.style.display = this.root.style.display === 'none' ? '' : 'none';
      });

      const dotGreen = this.root.querySelector('.term-dot-green');
      dotGreen.addEventListener('click', () => {
        if (this.root.requestFullscreen) {
          this.root.requestFullscreen().catch(() => {});
        }
      });
    }

    // ── Dashboard ────────────────────────────────────────────────────────────

    _showWelcome() {
      this._appendToDashboard(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗ █████╗ ██╗      ║
║   ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗██║      ║
║      ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║███████║██║      ║
║      ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║      ║
║      ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗ ║
║      ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝ ║
║                                                           ║
║   ───────────────────────────────────────────────────────   ║
║   🔐 Aguardando autenticação...                           ║
║   📋 Faça login no site para iniciar                      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `, 'dim');
    }

    _appendToDashboard(text, type = '') {
      const lines = text.split('\n');
      lines.forEach(line => {
        const div = document.createElement('div');
        div.className = `line ${type}`;
        div.innerHTML = line;
        this.dashboardOutput.appendChild(div);
      });
      this.dashboardOutput.scrollTop = this.dashboardOutput.scrollHeight;
    }

    // ── Tasks ───────────────────────────────────────────────────────────────

    async _loadTasks() {
      if (!state.token) {
        this._appendToTasks('❌ Não autenticado. Faça login primeiro.', 'error');
        return;
      }

      state.loading = true;
      this._setStatus('Carregando tarefas...', 'busy');

      try {
        const tasks = await api.getTasks(state.token, state.captcha, state.cf);
        state.tasks = tasks;
        
        this._renderTasks(tasks);
        this._updateBadge(tasks.pending.length);
        this._appendToDashboard(`📋 ${tasks.pending.length} tarefas pendentes, ${tasks.expired.length} expiradas`, 'info');
        this._setStatus(`Pronto (${tasks.pending.length} pendentes)`, 'online');

        // Verificar se há tarefa atual selecionada
        if (state.currentTask) {
          const task = tasks.pending.find(t => t.id === state.currentTask.id) ||
                       tasks.expired.find(t => t.id === state.currentTask.id);
          if (task) {
            state.currentTask = task;
            this._showTaskDetails(task);
          }
        }
      } catch (error) {
        this._appendToTasks(`❌ Erro: ${error.message}`, 'error');
        this._setStatus('Erro ao carregar tarefas', 'offline');
      }

      state.loading = false;
    }

    _renderTasks(tasks) {
      const output = this.tasksOutput;
      output.innerHTML = '';

      if (!tasks.pending.length && !tasks.expired.length) {
        output.innerHTML = `<div class="line dim">🎉 Nenhuma tarefa pendente ou expirada!</div>`;
        return;
      }

      // Tarefas pendentes
      if (tasks.pending.length) {
        output.appendChild(this._createTaskSection('📌 Pendentes', tasks.pending, 'pending'));
      }

      // Tarefas expiradas
      if (tasks.expired.length) {
        output.appendChild(this._createTaskSection('⏰ Expiradas', tasks.expired, 'expired'));
      }
    }

    _createTaskSection(title, tasks, status) {
      const section = document.createElement('div');
      section.className = 'fade-in';

      const header = document.createElement('div');
      header.className = 'line highlight';
      header.textContent = `\n${title} (${tasks.length})`;
      section.appendChild(header);

      tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card slide-in';
        card.innerHTML = `
          <div class="task-title">${Utils.escapeHtml(task.title)}</div>
          <div class="task-meta">
            <span>🆔 #${task.id}</span>
            <span>📅 Expira: ${task.expire_at}</span>
            <span>📍 ${task.publication_target || 'N/A'}</span>
            <span class="task-status ${status}">${status === 'pending' ? '🟢 Pendente' : '🔴 Expirada'}</span>
          </div>
          ${task.description ? `<div class="line dim" style="font-size:12px;margin:4px 0">${Utils.escapeHtml(task.description)}</div>` : ''}
          <div class="task-actions">
            <button class="primary" data-action="view" data-id="${task.id}" data-target="${task.publication_target}">👁️ Visualizar Respostas</button>
            ${status === 'pending' ? `<button class="primary" data-action="complete" data-id="${task.id}" data-target="${task.publication_target}">✅ Realizar Tarefa</button>` : ''}
            <button data-action="details" data-id="${task.id}" data-target="${task.publication_target}">📖 Detalhes</button>
          </div>
        `;
        section.appendChild(card);

        // Bind actions
        card.querySelectorAll('[data-action]').forEach(btn => {
          btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const id = parseInt(btn.dataset.id);
            const target = btn.dataset.target;
            this._handleTaskAction(action, id, target);
          });
        });
      });

      return section;
    }

    _appendToTasks(text, type = '') {
      const div = document.createElement('div');
      div.className = `line ${type}`;
      div.textContent = text;
      this.tasksOutput.appendChild(div);
      this.tasksOutput.scrollTop = this.tasksOutput.scrollHeight;
    }

    _updateBadge(count) {
      this.taskBadge.textContent = count;
      this.taskBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    // ── Task Actions ────────────────────────────────────────────────────────

    async _handleTaskAction(action, taskId, target) {
      if (state.loading) return;

      try {
        switch (action) {
          case 'view':
            await this._viewAnswers(taskId, target);
            break;
          case 'complete':
            await this._completeTask(taskId, target);
            break;
          case 'details':
            await this._showTaskDetailsById(taskId, target);
            break;
        }
      } catch (error) {
        this._appendToTasks(`❌ Erro: ${error.message}`, 'error');
        this._setStatus('Erro', 'offline');
      }
    }

    async _viewAnswers(taskId, target) {
      this._setStatus('Buscando respostas...', 'busy');
      this._appendToTasks(`\n🔍 Buscando respostas da tarefa #${taskId}...`, 'info');

      const answers = await api.getTaskAnswers(state.token, taskId, target);
      
      if (!answers || (Array.isArray(answers) && !answers.length)) {
        this._appendToTasks('📭 Nenhuma resposta encontrada para esta tarefa.', 'dim');
        return;
      }

      this._appendToTasks(`📝 Encontradas ${answers.length} respostas:`, 'success');
      
      if (Array.isArray(answers)) {
        answers.forEach((ans, i) => {
          this._appendToTasks(`\n  ${i+1}. ${ans.question || 'Questão'}:`, 'info');
          this._appendToTasks(`     Resposta: ${ans.answer || 'N/A'}`, 'dim');
          if (ans.correct) {
            this._appendToTasks(`     ✅ Correta`, 'success');
          }
        });
      } else {
        this._appendToTasks(JSON.stringify(answers, null, 2), 'dim');
      }

      this._setStatus('Respostas carregadas', 'online');
    }

    async _completeTask(taskId, target) {
      if (!confirm(`Realizar tarefa #${taskId}? Isso pode levar alguns minutos.`)) return;

      this._setStatus('Realizando tarefa... Aguarde', 'busy');
      this._appendToTasks(`\n⏳ Realizando tarefa #${taskId}...`, 'warn');

      try {
        const result = await api.completeTask(
          state.token,
          state.captcha,
          taskId,
          target,
          90,
          state.cf,
          false
        );

        if (result.success) {
          this._appendToTasks(`✅ Tarefa #${taskId} realizada com sucesso! (${result.wait}s)`, 'success');
          this._setStatus('Tarefa concluída!', 'online');
          
          // Recarregar tarefas
          setTimeout(() => this._loadTasks(), 2000);
        }
      } catch (error) {
        this._appendToTasks(`❌ Falha ao realizar tarefa: ${error.message}`, 'error');
        this._setStatus('Erro na tarefa', 'offline');
      }
    }

    async _showTaskDetailsById(taskId, target) {
      this._setStatus('Carregando detalhes...', 'busy');
      this._appendToTasks(`\n📖 Detalhes da tarefa #${taskId}`, 'info');

      try {
        // Buscar detalhes da tarefa
        const allTasks = [...state.tasks.pending, ...state.tasks.expired];
        const task = allTasks.find(t => t.id === taskId);
        
        if (task) {
          this._showTaskDetails(task);
        } else {
          // Tentar buscar via API
          const tasks = await api.getTasks(state.token, state.captcha, state.cf);
          const found = [...tasks.pending, ...tasks.expired].find(t => t.id === taskId);
          if (found) {
            this._showTaskDetails(found);
          } else {
            this._appendToTasks('❌ Tarefa não encontrada.', 'error');
          }
        }
      } catch (error) {
        this._appendToTasks(`❌ Erro: ${error.message}`, 'error');
      }

      this._setStatus('Pronto', 'online');
    }

    _showTaskDetails(task) {
      state.currentTask = task;
      
      this._appendToTasks(`\n┌─────────────────────────────────────────────`);
      this._appendToTasks(`│ 📋 ${Utils.escapeHtml(task.title)}`, 'highlight');
      this._appendToTasks(`├─────────────────────────────────────────────`);
      this._appendToTasks(`│ 🆔 ID: ${task.id}`);
      this._appendToTasks(`│ 📅 Expira: ${task.expire_at}`);
      this._appendToTasks(`│ 📍 Local: ${task.publication_target || 'N/A'}`);
      this._appendToTasks(`│ 📌 Status: ${task.tipo}`);
      this._appendToTasks(`├─────────────────────────────────────────────`);
      
      if (task.description) {
        this._appendToTasks(`│ 📝 ${Utils.escapeHtml(task.description)}`);
        this._appendToTasks(`├─────────────────────────────────────────────`);
      }

      if (task.questions && task.questions.length) {
        this._appendToTasks(`│ 📝 Questões (${task.questions.length}):`);
        task.questions.forEach((q, i) => {
          this._appendToTasks(`│   ${i+1}. ${Utils.escapeHtml(q.text || q.question || 'Questão')}`);
        });
      }

      this._appendToTasks(`└─────────────────────────────────────────────`);
      this._appendToTasks(`\n💡 Use "Visualizar Respostas" para ver as respostas já enviadas.`);
    }

    // ── AI Assistant ────────────────────────────────────────────────────────

    async _sendAI() {
      const text = this.aiInput.value.trim();
      if (!text || state.loading) return;

      this.aiInput.value = '';
      this.aiInput.disabled = true;
      this.aiSend.disabled = true;

      // Adicionar mensagem do usuário
      this._addAIMessage('user', text);

      // Adicionar contexto da tarefa atual se houver
      let contextMessage = text;
      if (state.currentTask) {
        contextMessage = `Contexto: Tarefa "${state.currentTask.title}" (ID: ${state.currentTask.id})\nPergunta: ${text}`;
      }

      // Histórico para a IA
      const messages = [
        { role: 'system', content: 'Você é um assistente educacional especializado em ajudar alunos com atividades da Sala do Futuro. Responda de forma clara, didática e em português.' },
        ...state.aiHistory,
        { role: 'user', content: contextMessage }
      ];

      try {
        // Mostrar indicador de digitação
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.innerHTML = '🤖 Pensando<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>';
        this.aiMessages.appendChild(typingDiv);
        this.aiMessages.scrollTop = this.aiMessages.scrollHeight;

        let fullResponse = '';
        const msgDiv = document.createElement('div');
        msgDiv.className = 'ai-message assistant fade-in';
        msgDiv.innerHTML = `
          <div class="msg-role">Assistente</div>
          <div class="msg-content"></div>
        `;
        this.aiMessages.appendChild(msgDiv);

        await api.chat(messages, (chunk) => {
          fullResponse += chunk;
          const contentEl = msgDiv.querySelector('.msg-content');
          contentEl.textContent = fullResponse;
          this.aiMessages.scrollTop = this.aiMessages.scrollHeight;
        });

        // Remover indicador de digitação
        typingDiv.remove();

        // Adicionar ao histórico
        state.aiHistory.push({ role: 'user', content: text });
        state.aiHistory.push({ role: 'assistant', content: fullResponse });

        // Manter histórico limitado
        if (state.aiHistory.length > 20) {
          state.aiHistory = state.aiHistory.slice(-20);
        }

      } catch (error) {
        this._appendToDashboard(`❌ Erro no assistente: ${error.message}`, 'error');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'ai-message assistant fade-in';
        errorDiv.innerHTML = `
          <div class="msg-role">Erro</div>
          <div class="msg-content" style="color:var(--term-error)">⚠️ ${Utils.escapeHtml(error.message)}</div>
        `;
        this.aiMessages.appendChild(errorDiv);
      }

      this.aiInput.disabled = false;
      this.aiSend.disabled = false;
      this.aiInput.focus();
      this.aiMessages.scrollTop = this.aiMessages.scrollHeight;
    }

    _addAIMessage(role, content) {
      const div = document.createElement('div');
      div.className = `ai-message ${role} fade-in`;
      div.innerHTML = `
        <div class="msg-role">${role === 'user' ? '👤 Você' : '🤖 Assistente'}</div>
        <div class="msg-content">${Utils.escapeHtml(content)}</div>
      `;
      this.aiMessages.appendChild(div);
      this.aiMessages.scrollTop = this.aiMessages.scrollHeight;
    }

    // ── Status ──────────────────────────────────────────────────────────────

    _setStatus(text, state2 = 'online') {
      this.statusText.textContent = text;
      this.statusDot.className = `status-dot ${state2}`;
    }

    _startStatusLoop() {
      setInterval(() => {
        this.statusTime.textContent = Utils.formatTime();
      }, 1000);
    }

    // ── User Update ─────────────────────────────────────────────────────────

    updateUser(userData) {
      state.user = userData;
      state.token = userData.token;
      
      this.statusUser.textContent = `👤 ${userData.nome} (${userData.ra})`;
      this._setStatus('Autenticado', 'online');
      
      this._appendToDashboard(`\n✅ Autenticado como ${userData.nome}`, 'success');
      this._appendToDashboard(`📧 ${userData.email || 'Sem email'}`, 'dim');
      this._appendToDashboard(`🏫 ${userData.escola || 'Escola não informada'}`, 'dim');
      this._appendToDashboard(`\n🔄 Carregando tarefas...`, 'info');

      // Carregar tarefas
      this._loadTasks();
    }

    // ── Expor métodos para o app ────────────────────────────────────────────

    appendToDashboard(text, type = '') {
      this._appendToDashboard(text, type);
    }

    appendToTasks(text, type = '') {
      this._appendToTasks(text, type);
    }

    setStatus(text, state2 = 'online') {
      this._setStatus(text, state2);
    }

    getTaskBadge() {
      return this.taskBadge;
    }
  }

  // ── Main App ──────────────────────────────────────────────────────────────

  class App {
    constructor() {
      // Verificar se já existe
      if (window.__terminalInstance) {
        window.__terminalInstance.root.style.display = '';
        return;
      }

      this.ui = new TerminalUI();
      this._setupLoginDetection();
      
      window.__terminalInstance = this;
    }

    _setupLoginDetection() {
      // Detectar login via interceptação de requisições
      this._interceptFetch();

      // Verificar localStorage por token
      this._checkStoredToken();

      // Observar mudanças no DOM
      this._observeDOM();

      // Tentar capturar dados do login
      this._tryCaptureLogin();

      this.ui.appendToDashboard('🔍 Monitorando login...', 'dim');
      this.ui.appendToDashboard('💡 Faça login no site para conectar automaticamente.', 'dim');
    }

    _interceptFetch() {
      const originalFetch = window.fetch;
      const self = this;

      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string') {
          // Interceptar login
          if (url.includes('/LoginCompletoToken') || url.includes('/login')) {
            return originalFetch.apply(this, args).then(async (response) => {
              const clone = response.clone();
              try {
                const data = await clone.json();
                if (data.token || data.accessToken || data.access_token) {
                  self._handleLoginData(data);
                }
              } catch (e) {}
              return response;
            });
          }

          // Interceptar token EDUSP
          if (url.includes('/registration/edusp/token')) {
            return originalFetch.apply(this, args).then(async (response) => {
              const clone = response.clone();
              try {
                const data = await clone.json();
                if (data.token || data.access_token) {
                  // Atualizar token se necessário
                }
              } catch (e) {}
              return response;
            });
          }
        }
        return originalFetch.apply(this, args);
      };
    }

    _checkStoredToken() {
      // Verificar localStorage
      const stored = localStorage.getItem('userData');
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data.token) {
            this._handleLoginData(data);
          }
        } catch (e) {}
      }

      // Verificar sessionStorage
      const session = sessionStorage.getItem('userData');
      if (session) {
        try {
          const data = JSON.parse(session);
          if (data.token) {
            this._handleLoginData(data);
          }
        } catch (e) {}
      }
    }

    _observeDOM() {
      const observer = new MutationObserver(() => {
        this._tryCaptureLogin();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-user', 'data-token', 'data-ra']
      });
    }

    _tryCaptureLogin() {
      // Tentar capturar dados de elementos da página
      const elements = document.querySelectorAll('[data-user], [data-token], [data-ra]');
      for (const el of elements) {
        const user = el.dataset.user || el.dataset.ra;
        const token = el.dataset.token;
        if (user && token) {
          this._handleLoginData({ nome: user, ra: user, token });
          return;
        }
      }

      // Tentar extrair de scripts
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';
        const tokenMatch = content.match(/["'](?:token|accessToken|access_token)["']\s*:\s*["']([^"']+)["']/);
        const userMatch = content.match(/["'](?:nome|userName|name)["']\s*:\s*["']([^"']+)["']/);
        const raMatch = content.match(/["'](?:ra|userId)["']\s*:\s*["']([^"']+)["']/);
        
        if (tokenMatch) {
          const data = { token: tokenMatch[1] };
          if (userMatch) data.nome = userMatch[1];
          if (raMatch) data.ra = raMatch[1];
          this._handleLoginData(data);
          return;
        }
      }
    }

    _handleLoginData(data) {
      // Evitar processamento duplicado
      if (state.token && state.token === data.token) return;
      if (!data.token) return;

      // Extrair informações do usuário
      const userData = {
        nome: data.nome || data.userName || data.name || data.usuario || 'Usuário',
        ra: data.ra || data.userId || data.ra || data.username || 'N/A',
        token: data.token || data.accessToken || data.access_token,
        email: data.email || data.userEmail || '',
        escola: data.escola || data.schoolName || data.school || '',
        turma: data.turma || data.className || data.class || ''
      };

      // Salvar para persistência
      localStorage.setItem('userData', JSON.stringify(userData));
      sessionStorage.setItem('userData', JSON.stringify(userData));

      // Extrair captcha e cf se disponíveis
      state.captcha = data.captcha || data.captchaToken || '';
      state.cf = data.cf || data.cloudflare || '';

      this.ui.updateUser(userData);
      this.ui.appendToDashboard(`\n📡 Captcha: ${state.captcha ? '✅' : '⚠️ Não capturado'}`, state.captcha ? 'success' : 'warn');
      
      // Mostrar info da escola
      if (userData.escola) {
        this.ui.appendToDashboard(`🏫 Escola: ${userData.escola}`, 'dim');
      }
      if (userData.turma) {
        this.ui.appendToDashboard(`📚 Turma: ${userData.turma}`, 'dim');
      }
    }

    // Método para login manual (via console)
    async manualLogin(ra, senha, turnstileToken) {
      try {
        const userData = await api.login(ra, senha, turnstileToken);
        this._handleLoginData(userData);
        return userData;
      } catch (error) {
        this.ui.appendToDashboard(`❌ Erro no login: ${error.message}`, 'error');
        throw error;
      }
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  // Evitar múltiplas instâncias
  if (!window.__terminalApp) {
    window.__terminalApp = new App();
  }

  console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00d4ff');
  console.log('%c║   TERMINAL — SALA DO FUTURO                            ║', 'color: #00d4ff');
  console.log('%c║   Use terminalApp.manualLogin(ra, senha, token)       ║', 'color: #888888');
  console.log('%c║   para login manual se necessário                      ║', 'color: #888888');
  console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00d4ff');

})();
