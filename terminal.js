/**
 * Terminal AI Painel - Sala do Futuro
 * Painel interativo para gerenciar tarefas com assistente IA
 * 
 * Uso: javascript:void(function(){var s=document.createElement('script');s.src='https://raw.githubusercontent.com/GabZs77/Ia-flutuante/main/terminal.js';document.head.appendChild(s);})()
 * Ou inline: javascript:void((function(){"https://raw.githubusercontent.com/GabZs77/Ia-flutuante/main/terminal.js"})())
 */

(function () {
  'use strict';

  // Verificar se já existe uma instância
  if (window.__terminalInstance) {
    const existing = window.__terminalInstance;
    if (existing.ui && existing.ui.root) {
      existing.ui.root.style.display = existing.ui.root.style.display === 'none' ? '' : 'none';
      return;
    }
  }

  // ── Config ──────────────────────────────────────────────────────────────────
  const CONFIG = {
    AI_URL: 'https://gen.pollinations.ai/v1/chat/completions',
    AI_KEY: 'pk_bJav4nbMa2fZGkqG',
    AI_MODEL: 'openai',
    LOGIN_URL: 'https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/credenciais/api/LoginCompletoToken',
    OCP_KEY: 'd701a2043aa24d7ebb37e9adf60d043b',
    EDUSP_TOKEN_URL: 'https://edusp-api.ip.tv/registration/edusp/token',
    PROXY_URL: 'https://corsproxy.io/?',
    TURNSTILE_SECRET: '0x4AAAAAADf8FX1DAuHNy6M-3rohj2wvMvw'
  };

  // ── Estado global ──────────────────────────────────────────────────────────
  const state = {
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

  // ── Utility ──────────────────────────────────────────────────────────────
  const Utils = {
    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    },
    formatTime(date) {
      date = date || new Date();
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },
    formatDate(date) {
      if (!date) return '-';
      const d = new Date(date);
      return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
    },
    debounce(fn, ms) {
      let t;
      return function() {
        const args = arguments;
        const ctx = this;
        clearTimeout(t);
        t = setTimeout(function() { fn.apply(ctx, args); }, ms);
      };
    },
    uid() {
      return Math.random().toString(36).slice(2, 11);
    },
    sleep(ms) {
      return new Promise(function(r) { setTimeout(r, ms); });
    }
  };

  // ── API Client ────────────────────────────────────────────────────────────
  function APIClient() {}

  APIClient.prototype.login = async function(ra, senha, turnstileToken) {
    var body = { ra: ra, senha: senha, turnstile_token: turnstileToken };
    
    try {
      var response = await fetch(CONFIG.LOGIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': CONFIG.OCP_KEY
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        var error = await response.json().catch(function() { return { message: 'Falha no login' }; });
        throw new Error(error.message || 'Falha no login');
      }

      var data = await response.json();
      console.log('[Terminal] Login response:', data);

      var userData = {
        nome: data.nome || data.userName || data.name || 'Usuário',
        ra: data.ra || data.userId || ra,
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
      console.error('[Terminal] Login error:', error);
      throw new Error(error.message || 'Erro ao fazer login');
    }
  };

  APIClient.prototype.getEduspToken = async function(token, captcha) {
    try {
      var response = await fetch(CONFIG.EDUSP_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ captcha: captcha })
      });

      if (!response.ok) {
        throw new Error('Falha ao obter token EDUSP');
      }

      var data = await response.json();
      return data.token || data.access_token || data;
    } catch (error) {
      console.error('[Terminal] EDUSP token error:', error);
      throw error;
    }
  };

  APIClient.prototype.getTasks = async function(token, captcha, cf) {
    var cookies = document.cookie;
    var targets = [];

    try {
      var roomsResp = await fetch('https://edusp-api.ip.tv/room/user', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'X-Captcha': captcha,
          'Cookie': cookies
        }
      });

      if (roomsResp.ok) {
        var roomsData = await roomsResp.json();
        var rooms = roomsData.rooms || [];
        for (var i = 0; i < rooms.length; i++) {
          var room = rooms[i];
          if (room.name) targets.push(String(room.name));
          var gcList = room.group_categories || [];
          for (var j = 0; j < gcList.length; j++) {
            if (gcList[j].id) targets.push(String(gcList[j].id));
          }
        }
      }
    } catch (e) {
      console.warn('[Terminal] Erro ao buscar targets:', e);
    }

    var self = this;
    
    async function fetchTasks(expired) {
      var baseUrl = 'https://edusp-api.ip.tv/tms/task/todo?expired_only=' + String(expired).toLowerCase() + '&limit=100&offset=0&filter_expired=' + String(!expired).toLowerCase() + '&is_exam=false&with_answer=true&is_essay=false&answer_statuses=draft&answer_statuses=pending&with_apply_moment=true';
      
      var url = baseUrl;
      for (var k = 0; k < targets.length; k++) {
        url += '&publication_target=' + encodeURIComponent(targets[k]);
      }

      try {
        var resp = await fetch(url, {
          headers: {
            'Authorization': 'Bearer ' + token,
            'X-Captcha': captcha,
            'Cookie': cookies
          }
        });

        if (!resp.ok) return [];
        var data = await resp.json();
        
        if (Array.isArray(data)) return data;
        return data.results || data.tasks || [];
      } catch (e) {
        console.warn('[Terminal] Erro ao buscar tarefas:', e);
        return [];
      }
    }

    function formatTasks(tasks, tipo) {
      return tasks.map(function(t) {
        return {
          id: t.id,
          title: t.title || '#' + t.id,
          expire_at: Utils.formatDate(t.expire_at),
          publication_target: t.publication_target || '',
          tipo: tipo,
          description: t.description || '',
          questions: t.questions || []
        };
      });
    }

    var pending = await fetchTasks(false);
    var expired = await fetchTasks(true);

    return {
      pending: formatTasks(pending, 'pendente'),
      expired: formatTasks(expired, 'expirada'),
      captcha: captcha
    };
  };

  APIClient.prototype.completeTask = async function(token, captcha, taskId, publicationTarget, waitSec, cf, draft) {
    var cookies = document.cookie;
    waitSec = waitSec || 90;
    draft = draft || false;
    
    try {
      var applyUrl = 'https://edusp-api.ip.tv/tms/task/' + taskId + '/apply/?preview_mode=false&room_code=' + encodeURIComponent(publicationTarget);
      var applyResp = await fetch(applyUrl, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'X-Captcha': captcha,
          'Cookie': cookies
        }
      });

      if (!applyResp.ok) {
        var error = await applyResp.json().catch(function() { return { message: 'Falha ao aplicar tarefa' }; });
        throw new Error('Falha ao aplicar tarefa: ' + (error.message || applyResp.status));
      }

      var lesson = await applyResp.json();
      var wait = Math.max(lesson.min_execution_time || 60, waitSec);
      
      // Mostrar progresso
      if (window.__terminalInstance && window.__terminalInstance.ui) {
        var ui = window.__terminalInstance.ui;
        for (var i = 0; i < wait; i++) {
          await Utils.sleep(1000);
          if (i % 10 === 0) {
            ui._appendToTasks('⏳ Aguardando... ' + (wait - i) + 's restantes', 'dim');
          }
        }
      } else {
        await Utils.sleep(wait * 1000);
      }

      var completeResp = await fetch(CONFIG.PROXY_URL + 'https://edusp-api.ip.tv/api/complete', {
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
        var err2 = await completeResp.json().catch(function() { return { message: 'Falha ao completar' }; });
        throw new Error('Falha ao completar tarefa: ' + (err2.message || err2.error || completeResp.status));
      }

      var result = await completeResp.json();
      return { success: true, wait: wait, draft: draft };
    } catch (error) {
      console.error('[Terminal] Complete task error:', error);
      throw error;
    }
  };

  APIClient.prototype.getTaskAnswers = async function(token, taskId, publicationTarget) {
    try {
      var url = 'https://edusp-api.ip.tv/tms/task/' + taskId + '/answers?room_code=' + encodeURIComponent(publicationTarget);
      var response = await fetch(url, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Cookie': document.cookie
        }
      });

      if (!response.ok) {
        throw new Error('Falha ao buscar respostas');
      }

      var data = await response.json();
      return data.answers || data.results || data;
    } catch (error) {
      console.error('[Terminal] Get answers error:', error);
      return null;
    }
  };

  APIClient.prototype.chat = async function(messages, onChunk) {
    try {
      var response = await fetch(CONFIG.AI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + CONFIG.AI_KEY
        },
        body: JSON.stringify({
          model: CONFIG.AI_MODEL,
          messages: messages,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error('Erro na API: ' + response.status);
      }

      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      while (true) {
        var result = await reader.read();
        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line.indexOf('data: ') !== 0) continue;
          var data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            var chunk = JSON.parse(data);
            var content = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
            if (content) onChunk(content);
          } catch (e) {
            // Ignorar chunks malformados
          }
        }
      }
    } catch (error) {
      console.error('[Terminal] Chat error:', error);
      throw error;
    }
  };

  APIClient.prototype.verifyTurnstile = async function(token) {
    if (!token) return false;
    try {
      var response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: CONFIG.TURNSTILE_SECRET,
          response: token
        })
      });
      var result = await response.json();
      return result.success || false;
    } catch (e) {
      console.error('[Terminal] Turnstile verification error:', e);
      return false;
    }
  };

  var api = new APIClient();

  // ── Estilos do Terminal ──────────────────────────────────────────────────
  var terminalStyles = '#terminal-root{--term-bg:#0a0a0a;--term-surface:#111111;--term-surface2:#1a1a1a;--term-border:#2a2a2a;--term-text:#e0e0e0;--term-text2:#888888;--term-accent:#00d4ff;--term-accent2:#00ff88;--term-success:#00ff88;--term-warning:#ffd700;--term-error:#ff4444;--term-purple:#b388ff;position:fixed;inset:0;z-index:2147483647;background:var(--term-bg);color:var(--term-text);font-family:"Courier New","Fira Code",monospace;font-size:13px;display:flex;flex-direction:column;pointer-events:all;animation:terminalFadeIn 0.3s ease}@keyframes terminalFadeIn{from{opacity:0;transform:scale(0.98)}to{opacity:1;transform:scale(1)}}#terminal-root *{box-sizing:border-box;margin:0;padding:0}.term-header{display:flex;align-items:center;padding:8px 16px;background:var(--term-surface);border-bottom:1px solid var(--term-border);flex-shrink:0;min-height:44px;user-select:none}.term-header-left{display:flex;align-items:center;gap:12px;flex:1}.term-dots{display:flex;gap:6px}.term-dot{width:12px;height:12px;border-radius:50%;cursor:pointer;transition:opacity 0.2s}.term-dot:hover{opacity:0.7}.term-dot-red{background:#ff5f56}.term-dot-yellow{background:#ffbd2e}.term-dot-green{background:#27c93f}.term-title{color:var(--term-text2);font-size:12px;letter-spacing:0.5px;margin-left:8px}.term-header-actions{display:flex;gap:6px}.term-hbtn{background:transparent;border:1px solid var(--term-border);color:var(--term-text2);padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer;transition:all 0.2s;font-family:inherit}.term-hbtn:hover{background:var(--term-surface2);color:var(--term-text);border-color:var(--term-text2)}.term-tabs{display:flex;background:var(--term-surface);border-bottom:1px solid var(--term-border);flex-shrink:0;overflow-x:auto;padding:0 8px}.term-tab{padding:8px 16px;color:var(--term-text2);cursor:pointer;font-size:12px;border-bottom:2px solid transparent;transition:all 0.2s;white-space:nowrap;background:transparent;border-top:none;border-left:none;border-right:none;font-family:inherit}.term-tab:hover{color:var(--term-text);background:var(--term-surface2)}.term-tab.active{color:var(--term-accent);border-bottom-color:var(--term-accent)}.term-tab-badge{display:inline-block;background:var(--term-accent);color:#000;font-size:10px;padding:0 6px;border-radius:10px;margin-left:4px;font-weight:bold}.term-content{flex:1;overflow:hidden;display:flex;flex-direction:column;background:var(--term-bg)}.term-tab-content{display:none;flex:1;overflow-y:auto;padding:12px 16px;flex-direction:column;gap:8px}.term-tab-content.active{display:flex}.term-tab-content::-webkit-scrollbar{width:6px}.term-tab-content::-webkit-scrollbar-track{background:transparent}.term-tab-content::-webkit-scrollbar-thumb{background:var(--term-border);border-radius:3px}.term-output{font-family:"Courier New",monospace;font-size:13px;line-height:1.6;padding:8px 4px;flex:1;overflow-y:auto;white-space:pre-wrap;word-wrap:break-word}.term-output .line{margin:2px 0}.term-output .prompt{color:var(--term-accent2)}.term-output .info{color:var(--term-accent)}.term-output .warn{color:var(--term-warning)}.term-output .error{color:var(--term-error)}.term-output .success{color:var(--term-success)}.term-output .dim{color:var(--term-text2)}.term-output .highlight{color:var(--term-purple);font-weight:bold}.term-status{padding:4px 16px;background:var(--term-surface);border-top:1px solid var(--term-border);font-size:11px;color:var(--term-text2);flex-shrink:0;display:flex;justify-content:space-between;align-items:center;min-height:28px}.term-status .status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}.term-status .status-dot.online{background:var(--term-success)}.term-status .status-dot.busy{background:var(--term-warning);animation:pulse 1s ease-in-out infinite}.term-status .status-dot.offline{background:var(--term-error)}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}.task-card{background:var(--term-surface);border:1px solid var(--term-border);border-radius:6px;padding:12px 16px;margin-bottom:8px;transition:all 0.2s}.task-card:hover{border-color:var(--term-text2);background:var(--term-surface2)}.task-card .task-title{color:var(--term-text);font-weight:bold;font-size:14px}.task-card .task-meta{color:var(--term-text2);font-size:12px;margin:4px 0 8px 0;display:flex;gap:16px;flex-wrap:wrap}.task-card .task-meta span{display:flex;align-items:center;gap:4px}.task-card .task-status{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:bold}.task-card .task-status.pending{background:#1a3a2a;color:var(--term-success)}.task-card .task-status.expired{background:#3a1a1a;color:var(--term-error)}.task-card .task-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}.task-card .task-actions button{padding:4px 14px;background:transparent;border:1px solid var(--term-border);color:var(--term-text2);border-radius:4px;cursor:pointer;font-size:12px;transition:all 0.2s;font-family:inherit}.task-card .task-actions button:hover{background:var(--term-surface2);color:var(--term-text);border-color:var(--term-text2)}.task-card .task-actions button.primary{border-color:var(--term-accent);color:var(--term-accent)}.task-card .task-actions button.primary:hover{background:var(--term-accent);color:#000}.term-spinner{display:inline-block;width:16px;height:16px;border:2px solid var(--term-border);border-top-color:var(--term-accent);border-radius:50%;animation:spin 0.8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.term-input-area{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--term-surface);border-top:1px solid var(--term-border);flex-shrink:0}.term-input-area .prompt-symbol{color:var(--term-accent2);font-weight:bold;font-size:14px}.term-input-area input{flex:1;background:var(--term-bg);border:1px solid var(--term-border);color:var(--term-text);padding:6px 12px;border-radius:4px;font-family:"Courier New",monospace;font-size:13px;outline:none;transition:border-color 0.2s}.term-input-area input:focus{border-color:var(--term-accent)}.term-input-area input::placeholder{color:var(--term-text2)}.term-input-area button{padding:6px 16px;background:var(--term-accent);color:#000;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;transition:all 0.2s;font-family:inherit}.term-input-area button:hover{opacity:0.8;transform:scale(1.02)}.term-input-area button:disabled{opacity:0.4;cursor:not-allowed;transform:none}.ai-message{padding:8px 12px;border-radius:6px;margin:4px 0;max-width:90%;word-wrap:break-word}.ai-message.user{background:var(--term-surface);border-left:3px solid var(--term-accent);align-self:flex-end}.ai-message.assistant{background:var(--term-surface2);border-left:3px solid var(--term-purple);align-self:flex-start}.ai-message .msg-role{font-size:10px;color:var(--term-text2);margin-bottom:2px;text-transform:uppercase;letter-spacing:0.5px}.ai-message .msg-content{white-space:pre-wrap;line-height:1.6}.ai-chat-container{display:flex;flex-direction:column;flex:1;overflow:hidden}.ai-messages-area{flex:1;overflow-y:auto;padding:4px 8px;display:flex;flex-direction:column;gap:4px}.ai-messages-area::-webkit-scrollbar{width:4px}.ai-messages-area::-webkit-scrollbar-thumb{background:var(--term-border);border-radius:2px}.ai-messages-area .typing-indicator{color:var(--term-text2);font-size:12px;padding:4px 8px}.ai-messages-area .typing-indicator .dot{display:inline-block;animation:typingDot 1.4s infinite}.ai-messages-area .typing-indicator .dot:nth-child(2){animation-delay:0.2s}.ai-messages-area .typing-indicator .dot:nth-child(3){animation-delay:0.4s}@keyframes typingDot{0%,60%,100%{opacity:0.3}30%{opacity:1}}.fade-in{animation:fadeIn 0.3s ease}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.slide-in{animation:slideIn 0.3s ease}@keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}#terminal-root ::-webkit-scrollbar{width:6px;height:6px}#terminal-root ::-webkit-scrollbar-track{background:transparent}#terminal-root ::-webkit-scrollbar-thumb{background:var(--term-border);border-radius:3px}#terminal-root ::-webkit-scrollbar-thumb:hover{background:var(--term-text2)}@media(max-width:768px){#terminal-root{font-size:12px}.term-tab{padding:6px 12px;font-size:11px}.term-header{padding:4px 12px;min-height:36px}.term-tab-content{padding:8px 12px}.task-card .task-meta{flex-direction:column;gap:4px}}';

  // ── Terminal UI ────────────────────────────────────────────────────────────
  function TerminalUI() {
    this._buildUI();
    this._bindEvents();
    this._showWelcome();
    this._startStatusLoop();
  }

  TerminalUI.prototype._buildUI = function() {
    // Root
    this.root = document.createElement('div');
    this.root.id = 'terminal-root';

    // Styles
    var style = document.createElement('style');
    style.textContent = terminalStyles;
    this.root.appendChild(style);

    // Header
    var header = document.createElement('div');
    header.className = 'term-header';
    header.innerHTML = '<div class="term-header-left"><div class="term-dots"><span class="term-dot term-dot-red" title="Fechar"></span><span class="term-dot term-dot-yellow" title="Minimizar"></span><span class="term-dot term-dot-green" title="Maximizar"></span></div><span class="term-title">\u27EB TERMINAL \u2014 SALA DO FUTURO</span></div><div class="term-header-actions"><button class="term-hbtn" id="term-refresh">\u27F3 Atualizar</button><button class="term-hbtn" id="term-close">\u2715 Fechar</button></div>';
    this.root.appendChild(header);

    // Tabs
    var tabs = document.createElement('div');
    tabs.className = 'term-tabs';
    tabs.innerHTML = '<button class="term-tab active" data-tab="dashboard">\uD83D\uDCCA Dashboard</button><button class="term-tab" data-tab="tasks">\uD83D\uDCCB Tarefas <span class="term-tab-badge" id="task-badge">0</span></button><button class="term-tab" data-tab="assistant">\uD83E\uDD16 Assistente</button>';
    this.root.appendChild(tabs);

    // Content
    var content = document.createElement('div');
    content.className = 'term-content';

    // Dashboard
    var dashboard = document.createElement('div');
    dashboard.className = 'term-tab-content active';
    dashboard.id = 'tab-dashboard';
    dashboard.innerHTML = '<div class="term-output" id="dashboard-output"><div class="line dim">\u23F3 Aguardando inicializa\u00E7\u00E3o...</div></div>';
    content.appendChild(dashboard);

    // Tasks
    var tasks = document.createElement('div');
    tasks.className = 'term-tab-content';
    tasks.id = 'tab-tasks';
    tasks.innerHTML = '<div class="term-output" id="tasks-output"><div class="line dim">\uD83D\uDCED Nenhuma tarefa carregada</div></div>';
    content.appendChild(tasks);

    // Assistant
    var assistant = document.createElement('div');
    assistant.className = 'term-tab-content';
    assistant.id = 'tab-assistant';
    assistant.innerHTML = '<div class="ai-chat-container"><div class="ai-messages-area" id="ai-messages"></div><div class="term-input-area"><span class="prompt-symbol">\u276F</span><input type="text" id="ai-input" placeholder="Pergunte sobre a atividade..."><button id="ai-send">Enviar</button></div></div>';
    content.appendChild(assistant);

    this.root.appendChild(content);

    // Status bar
    var status = document.createElement('div');
    status.className = 'term-status';
    status.innerHTML = '<div><span class="status-dot offline" id="status-dot"></span><span id="status-text">Desconectado</span></div><div><span id="status-user" class="dim">\uD83D\uDC64 N\u00E3o autenticado</span><span class="dim" style="margin-left:16px" id="status-time">' + Utils.formatTime() + '</span></div>';
    this.root.appendChild(status);

    // Adicionar ao body
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
  };

  TerminalUI.prototype._bindEvents = function() {
    var self = this;

    // Tabs
    this.tabs.addEventListener('click', function(e) {
      var tab = e.target.closest('.term-tab');
      if (!tab) return;

      self.tabs.querySelectorAll('.term-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');

      var tabId = tab.dataset.tab;
      self.tabContent.querySelectorAll('.term-tab-content').forEach(function(c) { c.classList.remove('active'); });
      var target = document.getElementById('tab-' + tabId);
      if (target) target.classList.add('active');

      if (tabId === 'tasks' && state.token) {
        self._loadTasks();
      }
    });

    // Close button
    document.getElementById('term-close').addEventListener('click', function() {
      self.root.style.display = 'none';
    });

    // Refresh button
    document.getElementById('term-refresh').addEventListener('click', function() {
      if (state.token) {
        self._loadTasks();
        self._appendToDashboard('\uD83D\uDD04 Atualizando dados...', 'info');
      }
    });

    // AI Chat
    this.aiSend.addEventListener('click', function() { self._sendAI(); });
    this.aiInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        self._sendAI();
      }
    });

    // Dot buttons
    var dotRed = this.root.querySelector('.term-dot-red');
    dotRed.addEventListener('click', function() { self.root.style.display = 'none'; });

    var dotYellow = this.root.querySelector('.term-dot-yellow');
    dotYellow.addEventListener('click', function() {
      self.root.style.display = self.root.style.display === 'none' ? '' : 'none';
    });

    var dotGreen = this.root.querySelector('.term-dot-green');
    dotGreen.addEventListener('click', function() {
      if (self.root.requestFullscreen) {
        self.root.requestFullscreen().catch(function() {});
      }
    });

    // Prevenir propagação de eventos
    this.root.addEventListener('click', function(e) {
      e.stopPropagation();
    });
    this.root.addEventListener('keydown', function(e) {
      e.stopPropagation();
    });
  };

  TerminalUI.prototype._showWelcome = function() {
    this._appendToDashboard('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557', 'dim');
    this._appendToDashboard('\u2551                                                           \u2551', 'dim');
    this._appendToDashboard('\u2551   TERMINAL AI - SALA DO FUTURO                           \u2551', 'highlight');
    this._appendToDashboard('\u2551                                                           \u2551', 'dim');
    this._appendToDashboard('\u2551   \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500   \u2551', 'dim');
    this._appendToDashboard('\u2551   \uD83D\uDD12 Aguardando autentica\u00E7\u00E3o...                           \u2551', 'dim');
    this._appendToDashboard('\u2551   \uD83D\uDCCB Fa\u00E7a login no site para iniciar                      \u2551', 'dim');
    this._appendToDashboard('\u2551                                                           \u2551', 'dim');
    this._appendToDashboard('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D', 'dim');
  };

  TerminalUI.prototype._appendToDashboard = function(text, type) {
    type = type || '';
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var div = document.createElement('div');
      div.className = 'line ' + type;
      div.textContent = lines[i];
      this.dashboardOutput.appendChild(div);
    }
    this.dashboardOutput.scrollTop = this.dashboardOutput.scrollHeight;
  };

  TerminalUI.prototype._appendToTasks = function(text, type) {
    type = type || '';
    var div = document.createElement('div');
    div.className = 'line ' + type;
    div.textContent = text;
    this.tasksOutput.appendChild(div);
    this.tasksOutput.scrollTop = this.tasksOutput.scrollHeight;
  };

  TerminalUI.prototype._loadTasks = async function() {
    if (!state.token) {
      this._appendToTasks('\u274C N\u00E3o autenticado. Fa\u00E7a login primeiro.', 'error');
      return;
    }

    state.loading = true;
    this._setStatus('Carregando tarefas...', 'busy');

    try {
      var tasks = await api.getTasks(state.token, state.captcha, state.cf);
      state.tasks = tasks;
      
      this._renderTasks(tasks);
      this._updateBadge(tasks.pending.length);
      this._appendToDashboard('\uD83D\uDCCB ' + tasks.pending.length + ' tarefas pendentes, ' + tasks.expired.length + ' expiradas', 'info');
      this._setStatus('Pronto (' + tasks.pending.length + ' pendentes)', 'online');
    } catch (error) {
      this._appendToTasks('\u274C Erro: ' + error.message, 'error');
      this._setStatus('Erro ao carregar tarefas', 'offline');
    }

    state.loading = false;
  };

  TerminalUI.prototype._renderTasks = function(tasks) {
    var output = this.tasksOutput;
    output.innerHTML = '';

    if (!tasks.pending.length && !tasks.expired.length) {
      output.innerHTML = '<div class="line dim">\uD83C\uDF89 Nenhuma tarefa pendente ou expirada!</div>';
      return;
    }

    if (tasks.pending.length) {
      output.appendChild(this._createTaskSection('\uD83D\uDCCC Pendentes', tasks.pending, 'pending'));
    }

    if (tasks.expired.length) {
      output.appendChild(this._createTaskSection('\u23F0 Expiradas', tasks.expired, 'expired'));
    }
  };

  TerminalUI.prototype._createTaskSection = function(title, tasks, status) {
    var self = this;
    var section = document.createElement('div');
    section.className = 'fade-in';

    var header = document.createElement('div');
    header.className = 'line highlight';
    header.textContent = '\n' + title + ' (' + tasks.length + ')';
    section.appendChild(header);

    for (var i = 0; i < tasks.length; i++) {
      (function(task) {
        var card = document.createElement('div');
        card.className = 'task-card slide-in';
        
        var actionsHtml = '<button class="primary" data-action="view" data-id="' + task.id + '" data-target="' + Utils.escapeHtml(task.publication_target) + '">\uD83D\uDC41\uFE0F Ver Respostas</button>';
        if (status === 'pending') {
          actionsHtml += ' <button class="primary" data-action="complete" data-id="' + task.id + '" data-target="' + Utils.escapeHtml(task.publication_target) + '">\u2705 Realizar</button>';
        }
        actionsHtml += ' <button data-action="details" data-id="' + task.id + '" data-target="' + Utils.escapeHtml(task.publication_target) + '">\uD83D\uDCD6 Detalhes</button>';

        card.innerHTML = '<div class="task-title">' + Utils.escapeHtml(task.title) + '</div><div class="task-meta"><span>\uD83C\uDD94 #' + task.id + '</span><span>\uD83D\uDCC5 Expira: ' + task.expire_at + '</span><span>\uD83D\uDCCD ' + Utils.escapeHtml(task.publication_target || 'N/A') + '</span><span class="task-status ' + status + '">' + (status === 'pending' ? '\uD83D\uDFE2 Pendente' : '\uD83D\uDD34 Expirada') + '</span></div><div class="task-actions">' + actionsHtml + '</div>';
        
        section.appendChild(card);

        card.querySelectorAll('[data-action]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var action = btn.dataset.action;
            var id = parseInt(btn.dataset.id);
            var target = btn.dataset.target;
            self._handleTaskAction(action, id, target);
          });
        });
      })(tasks[i]);
    }

    return section;
  };

  TerminalUI.prototype._updateBadge = function(count) {
    this.taskBadge.textContent = count;
    this.taskBadge.style.display = count > 0 ? 'inline-block' : 'none';
  };

  TerminalUI.prototype._handleTaskAction = async function(action, taskId, target) {
    if (state.loading) return;

    try {
      if (action === 'view') {
        await this._viewAnswers(taskId, target);
      } else if (action === 'complete') {
        await this._completeTask(taskId, target);
      } else if (action === 'details') {
        await this._showTaskDetailsById(taskId, target);
      }
    } catch (error) {
      this._appendToTasks('\u274C Erro: ' + error.message, 'error');
      this._setStatus('Erro', 'offline');
    }
  };

  TerminalUI.prototype._viewAnswers = async function(taskId, target) {
    this._setStatus('Buscando respostas...', 'busy');
    this._appendToTasks('\n\uD83D\uDD0D Buscando respostas da tarefa #' + taskId + '...', 'info');

    var answers = await api.getTaskAnswers(state.token, taskId, target);
    
    if (!answers || (Array.isArray(answers) && !answers.length)) {
      this._appendToTasks('\uD83D\uDCED Nenhuma resposta encontrada.', 'dim');
      return;
    }

    this._appendToTasks('\uD83D\uDCDD Respostas encontradas:', 'success');
    
    if (Array.isArray(answers)) {
      for (var i = 0; i < answers.length; i++) {
        var ans = answers[i];
        this._appendToTasks('  ' + (i+1) + '. ' + (ans.question || 'Quest\u00E3o') + ':', 'info');
        this._appendToTasks('     Resposta: ' + (ans.answer || 'N/A'), 'dim');
      }
    } else {
      this._appendToTasks(JSON.stringify(answers, null, 2), 'dim');
    }

    this._setStatus('Respostas carregadas', 'online');
  };

  TerminalUI.prototype._completeTask = async function(taskId, target) {
    this._setStatus('Realizando tarefa... Aguarde', 'busy');
    this._appendToTasks('\n\u23F3 Realizando tarefa #' + taskId + '...', 'warn');

    try {
      var result = await api.completeTask(state.token, state.captcha, taskId, target, 90, state.cf, false);

      if (result.success) {
        this._appendToTasks('\u2705 Tarefa #' + taskId + ' realizada com sucesso! (' + result.wait + 's)', 'success');
        this._setStatus('Tarefa conclu\u00EDda!', 'online');
        setTimeout(this._loadTasks.bind(this), 2000);
      }
    } catch (error) {
      this._appendToTasks('\u274C Falha ao realizar tarefa: ' + error.message, 'error');
      this._setStatus('Erro na tarefa', 'offline');
    }
  };

  TerminalUI.prototype._showTaskDetailsById = async function(taskId, target) {
    this._setStatus('Carregando detalhes...', 'busy');
    this._appendToTasks('\n\uD83D\uDCD6 Detalhes da tarefa #' + taskId, 'info');

    var allTasks = state.tasks.pending.concat(state.tasks.expired);
    var task = null;
    for (var i = 0; i < allTasks.length; i++) {
      if (allTasks[i].id === taskId) {
        task = allTasks[i];
        break;
      }
    }
    
    if (task) {
      this._showTaskDetails(task);
    } else {
      this._appendToTasks('\u274C Tarefa n\u00E3o encontrada.', 'error');
    }

    this._setStatus('Pronto', 'online');
  };

  TerminalUI.prototype._showTaskDetails = function(task) {
    state.currentTask = task;
    
    this._appendToTasks('\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    this._appendToTasks('\u2502 \uD83D\uDCCB ' + Utils.escapeHtml(task.title), 'highlight');
    this._appendToTasks('\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    this._appendToTasks('\u2502 \uD83C\uDD94 ID: ' + task.id);
    this._appendToTasks('\u2502 \uD83D\uDCC5 Expira: ' + task.expire_at);
    this._appendToTasks('\u2502 \uD83D\uDCCD Local: ' + (task.publication_target || 'N/A'));
    this._appendToTasks('\u2502 \uD83D\uDCCC Status: ' + task.tipo);
    this._appendToTasks('\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    
    if (task.questions && task.questions.length) {
      this._appendToTasks('\u2502 \uD83D\uDCDD Quest\u00F5es (' + task.questions.length + '):');
      for (var i = 0; i < task.questions.length; i++) {
        var q = task.questions[i];
        this._appendToTasks('\u2502   ' + (i+1) + '. ' + Utils.escapeHtml(q.text || q.question || 'Quest\u00E3o'));
      }
    }

    this._appendToTasks('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  };

  TerminalUI.prototype._sendAI = async function() {
    var text = this.aiInput.value.trim();
    if (!text || state.loading) return;

    this.aiInput.value = '';
    this.aiInput.disabled = true;
    this.aiSend.disabled = true;

    this._addAIMessage('user', text);

    var contextMessage = text;
    if (state.currentTask) {
      contextMessage = 'Contexto: Tarefa "' + state.currentTask.title + '" (ID: ' + state.currentTask.id + ')\nPergunta: ' + text;
    }

    var messages = [
      { role: 'system', content: 'Voc\u00EA \u00E9 um assistente educacional especializado em ajudar alunos com atividades da Sala do Futuro. Responda de forma clara, did\u00E1tica e em portugu\u00EAs.' }
    ];
    
    for (var i = 0; i < state.aiHistory.length; i++) {
      messages.push(state.aiHistory[i]);
    }
    messages.push({ role: 'user', content: contextMessage });

    try {
      var typingDiv = document.createElement('div');
      typingDiv.className = 'typing-indicator';
      typingDiv.innerHTML = '\uD83E\uDD16 Pensando<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>';
      this.aiMessages.appendChild(typingDiv);
      this.aiMessages.scrollTop = this.aiMessages.scrollHeight;

      var fullResponse = '';
      var self = this;
      var msgDiv = document.createElement('div');
      msgDiv.className = 'ai-message assistant fade-in';
      msgDiv.innerHTML = '<div class="msg-role">Assistente</div><div class="msg-content"></div>';
      this.aiMessages.appendChild(msgDiv);

      await api.chat(messages, function(chunk) {
        fullResponse += chunk;
        var contentEl = msgDiv.querySelector('.msg-content');
        contentEl.textContent = fullResponse;
        self.aiMessages.scrollTop = self.aiMessages.scrollHeight;
      });

      typingDiv.remove();

      state.aiHistory.push({ role: 'user', content: text });
      state.aiHistory.push({ role: 'assistant', content: fullResponse });

      if (state.aiHistory.length > 20) {
        state.aiHistory = state.aiHistory.slice(-20);
      }

    } catch (error) {
      this._appendToDashboard('\u274C Erro no assistente: ' + error.message, 'error');
      var errorDiv = document.createElement('div');
      errorDiv.className = 'ai-message assistant fade-in';
      errorDiv.innerHTML = '<div class="msg-role">Erro</div><div class="msg-content" style="color:var(--term-error)">\u26A0\uFE0F ' + Utils.escapeHtml(error.message) + '</div>';
      this.aiMessages.appendChild(errorDiv);
    }

    this.aiInput.disabled = false;
    this.aiSend.disabled = false;
    this.aiInput.focus();
    this.aiMessages.scrollTop = this.aiMessages.scrollHeight;
  };

  TerminalUI.prototype._addAIMessage = function(role, content) {
    var div = document.createElement('div');
    div.className = 'ai-message ' + role + ' fade-in';
    div.innerHTML = '<div class="msg-role">' + (role === 'user' ? '\uD83D\uDC64 Voc\u00EA' : '\uD83E\uDD16 Assistente') + '</div><div class="msg-content">' + Utils.escapeHtml(content) + '</div>';
    this.aiMessages.appendChild(div);
    this.aiMessages.scrollTop = this.aiMessages.scrollHeight;
  };

  TerminalUI.prototype._setStatus = function(text, statusState) {
    statusState = statusState || 'online';
    this.statusText.textContent = text;
    this.statusDot.className = 'status-dot ' + statusState;
  };

  TerminalUI.prototype._startStatusLoop = function() {
    var self = this;
    setInterval(function() {
      self.statusTime.textContent = Utils.formatTime();
    }, 1000);
  };

  TerminalUI.prototype.updateUser = function(userData) {
    state.user = userData;
    state.token = userData.token;
    
    this.statusUser.textContent = '\uD83D\uDC64 ' + userData.nome + ' (' + userData.ra + ')';
    this._setStatus('Autenticado', 'online');
    
    this._appendToDashboard('\n\u2705 Autenticado como ' + userData.nome, 'success');
    this._appendToDashboard('\uD83D\uDCE7 ' + (userData.email || 'Sem email'), 'dim');
    this._appendToDashboard('\uD83C\uDFEB ' + (userData.escola || 'Escola n\u00E3o informada'), 'dim');
    this._appendToDashboard('\n\uD83D\uDD04 Carregando tarefas...', 'info');

    this._loadTasks();
  };

  // ── Main App ──────────────────────────────────────────────────────────────

  function App() {
    this.ui = new TerminalUI();
    this._setupLoginDetection();
    
    window.__terminalInstance = this;
  }

  App.prototype._setupLoginDetection = function() {
    this._interceptFetch();
    this._checkStoredToken();
    this._observeDOM();
    this._tryCaptureLogin();

    this.ui._appendToDashboard('\uD83D\uDD0D Monitorando login...', 'dim');
    this.ui._appendToDashboard('\uD83D\uDCA1 Fa\u00E7a login no site para conectar automaticamente.', 'dim');
  };

  App.prototype._interceptFetch = function() {
    var originalFetch = window.fetch;
    var self = this;

    window.fetch = function() {
      var args = arguments;
      var url = args[0];
      if (typeof url === 'string') {
        if (url.indexOf('LoginCompletoToken') !== -1 || url.indexOf('/login') !== -1) {
          return originalFetch.apply(this, args).then(function(response) {
            var clone = response.clone();
            clone.json().then(function(data) {
              if (data.token || data.accessToken || data.access_token) {
                self._handleLoginData(data);
              }
            }).catch(function() {});
            return response;
          }).catch(function(err) {
            return Promise.reject(err);
          });
        }

        if (url.indexOf('/registration/edusp/token') !== -1) {
          return originalFetch.apply(this, args).then(function(response) {
            var clone = response.clone();
            clone.json().then(function(data) {
              if (data.token || data.access_token) {
                state.token = data.token || data.access_token;
                state.captcha = data.captcha;
                console.log('[Terminal] Token EDUSP capturado');
              }
            }).catch(function() {});
            return response;
          }).catch(function(err) {
            return Promise.reject(err);
          });
        }
      }
      return originalFetch.apply(this, args);
    };
  };

  App.prototype._checkStoredToken = function() {
    // Verificar localStorage
    var keys = ['userData', 'user', 'token', 'auth', 'loginData', 'salaDoFuturo'];
    for (var i = 0; i < keys.length; i++) {
      try {
        var stored = localStorage.getItem(keys[i]);
        if (stored) {
          var data = JSON.parse(stored);
          if (data && (data.token || data.accessToken || data.access_token)) {
            this._handleLoginData(data);
            return;
          }
        }
      } catch (e) {}
    }

    // Verificar sessionStorage
    for (var j = 0; j < keys.length; j++) {
      try {
        var session = sessionStorage.getItem(keys[j]);
        if (session) {
          var data2 = JSON.parse(session);
          if (data2 && (data2.token || data2.accessToken || data2.access_token)) {
            this._handleLoginData(data2);
            return;
          }
        }
      } catch (e) {}
    }
  };

  App.prototype._observeDOM = function() {
    var self = this;
    
    // Observer para mudanças no DOM
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === 'childList') {
          for (var j = 0; j < mutation.addedNodes.length; j++) {
            var node = mutation.addedNodes[j];
            if (node.nodeType === 1) {
              // Verificar se contém informações de login
              self._checkNodeForLoginData(node);
            }
          }
        }
      }
    });

    // Observar body inteiro
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  };

  App.prototype._checkNodeForLoginData = function(node) {
    // Verificar por elementos com dados de usuário
    if (node.dataset && node.dataset.token) {
      this._handleLoginData({ token: node.dataset.token });
    }

    // Verificar por inputs hidden com tokens
    var inputs = node.querySelectorAll ? node.querySelectorAll('input[type="hidden"]') : [];
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      if (input.name && (input.name.indexOf('token') !== -1 || input.name.indexOf('Token') !== -1) && input.value) {
        this._handleLoginData({ token: input.value });
        return;
      }
    }
  };

  App.prototype._tryCaptureLogin = function() {
    var self = this;
    
    // Verificar se já existe token em cookies
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.indexOf('token=') === 0 || cookie.indexOf('Token=') === 0 || cookie.indexOf('auth=') === 0) {
        var value = cookie.split('=')[1];
        if (value && value.length > 10) {
          console.log('[Terminal] Token encontrado em cookies');
          this._handleLoginData({ token: value, nome: 'Usu\u00E1rio (via cookie)', ra: 'N/A' });
          return;
        }
      }
    }

    // Verificar variáveis globais comuns
    var globalVars = ['userData', 'userToken', 'authToken', 'appState', '__NEXT_DATA__', '__NUXT__'];
    for (var j = 0; j < globalVars.length; j++) {
      try {
        var globalData = window[globalVars[j]];
        if (globalData) {
          var parsed = typeof globalData === 'string' ? JSON.parse(globalData) : globalData;
          var token = this._findTokenInObject(parsed);
          if (token) {
            console.log('[Terminal] Token encontrado em window.' + globalVars[j]);
            this._handleLoginData({ token: token });
            return;
          }
        }
      } catch (e) {}
    }

    // Verificar se já está logado via verificação de API
    this._checkExistingSession();
  };

  App.prototype._findTokenInObject = function(obj, depth) {
    depth = depth || 0;
    if (depth > 5 || !obj || typeof obj !== 'object') return null;

    if (obj.token && typeof obj.token === 'string' && obj.token.length > 10) return obj.token;
    if (obj.accessToken && typeof obj.accessToken === 'string') return obj.accessToken;
    if (obj.access_token && typeof obj.access_token === 'string') return obj.access_token;

    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      try {
        var result = this._findTokenInObject(obj[keys[i]], depth + 1);
        if (result) return result;
      } catch (e) {}
    }
    return null;
  };

  App.prototype._checkExistingSession = function() {
    var self = this;
    
    // Tentar acessar endpoint de usuário para verificar se já está logado
    fetch('https://edusp-api.ip.tv/room/user', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    }).then(function(resp) {
      if (resp.ok) {
        return resp.json().then(function(data) {
          console.log('[Terminal] Sess\u00E3o existente encontrada:', data);
          // Extrair token do Authorization header se possível
          self.ui._appendToDashboard('\uD83D\uDD04 Sess\u00E3o existente detectada, tentando extrair token...', 'info');
        });
      }
    }).catch(function(e) {
      // Silencioso - não está logado
    });
  };

  App.prototype._handleLoginData = function(data) {
    if (state.token && state.token === (data.token || data.accessToken || data.access_token)) {
      return; // Já está autenticado com este token
    }

    var token = data.token || data.accessToken || data.access_token;
    if (!token) return;

    var userData = {
      nome: data.nome || data.userName || data.name || data.user_name || 'Usu\u00E1rio',
      ra: data.ra || data.userId || data.user_id || data.ra || 'N/A',
      token: token,
      email: data.email || data.userEmail || data.user_email || '',
      escola: data.escola || data.schoolName || data.school_name || '',
      turma: data.turma || data.className || data.class_name || ''
    };

    // Salvar para referência futura
    try {
      localStorage.setItem('terminalUserData', JSON.stringify(userData));
    } catch (e) {}

    this.ui.updateUser(userData);
  };

  // ── Inicializar ──────────────────────────────────────────────────────────
  try {
    new App();
    console.log('[Terminal] Inicializado com sucesso');
  } catch (error) {
    console.error('[Terminal] Erro ao inicializar:', error);
    // Tentar criar UI mínima para mostrar erro
    var errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0a0a0a;color:#ff4444;font-family:monospace;padding:20px;display:flex;align-items:center;justify-content:center;';
    errorDiv.textContent = 'Erro ao inicializar terminal: ' + error.message;
    document.body.appendChild(errorDiv);
  }

})();
