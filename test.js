(async () => {
    'use strict';

    if (document.getElementById('hck-tarefas-ui-bookmarklet')) {
        console.warn('[HCK TAREFAS] Já está em execução.');
        try {
            document.getElementById('hck-tarefas-toggle-btn')?.focus();
        } catch(e) {}
        return;
    }

    console.log('[HCK TAREFAS] Iniciando...');

    const SCRIPT_NAME = "HCK TAREFAS";
    const SCRIPT_VERSION = '2.0.0';
    const TOAST_BACKGROUND_COLOR = 'rgba(20, 20, 20, 0.9)';
    const TOAST_TEXT_COLOR = '#f0f0f0';

    const API_CONFIG = {
        url: 'https://gen.pollinations.ai/v1/chat/completions',
        key: 'pk_bJav4nbMa2fZGkqG',
        model: 'openai'
    };

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const DEFAULT_SETTINGS = {
        notifications: true,
        sounds: true,
        autoCorrection: true,
        autoPanel: true,
        aiEnabled: true,
        apiMonitor: true,
        autoDetectActivity: true
    };

    function loadSettings() {
        try {
            const saved = localStorage.getItem('hck_tarefas_settings');
            if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        } catch(e) {}
        return { ...DEFAULT_SETTINGS };
    }

    function saveSettings(s) {
        try { localStorage.setItem('hck_tarefas_settings', JSON.stringify(s)); } catch(e) {}
    }

    function loadHistory() {
        try {
            const saved = localStorage.getItem('hck_tarefas_history');
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        return { correctedTasks: [], notifications: [], stats: { totalIntercepted: 0, totalCorrected: 0, totalFailed: 0, totalTimeMs: 0, sessionStart: Date.now() }, apiMonitor: { lastCheck: null, status: 'unknown', responseTime: null, errors: [] } };
    }

    function saveHistory() {
        try { localStorage.setItem('hck_tarefas_history', JSON.stringify(STATE.persistent)); } catch(e) {}
    }

    const savedHistory = loadHistory();
    const currentSettings = loadSettings();

    const STATE = {
        isActive: true,
        capturedLoginData: null,
        isToastifyLoaded: false,
        logMessages: [],
        logModal: null,
        notificationContainer: null,
        interceptEnabled: true,
        correctedTasks: savedHistory.correctedTasks,
        stats: { ...savedHistory.stats, sessionStart: savedHistory.stats.sessionStart || Date.now() },
        settings: currentSettings,
        persistent: savedHistory,
        currentActivity: null,
        currentRawData: null,
        progressSteps: [],
        currentStep: -1,
        apiMonitor: savedHistory.apiMonitor || { lastCheck: null, status: 'unknown', responseTime: null, errors: [] },
        chatMessages: [],
        chatWaiting: false,
        diagnosticResults: [],
        sessionStartTime: Date.now(),
        activeTab: 'main'
    };

    function playBeep(freq = 800, dur = 80, vol = 0.08) {
        if (!STATE.settings.sounds) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            gain.gain.value = vol;
            osc.start();
            osc.stop(ctx.currentTime + dur / 1000);
        } catch(e) {}
    }

    function addNotification(text, type = 'info') {
        const notif = { text, type, timestamp: new Date().toISOString() };
        STATE.persistent.notifications.push(notif);
        if (STATE.persistent.notifications.length > 200) STATE.persistent.notifications.shift();
        saveHistory();
        if (STATE.settings.notifications) {
            sendToast(text, 3500);
            playBeep(type === 'error' ? 400 : type === 'success' ? 1000 : 700, 100);
        }
        renderNotificationsTab();
    }

    function setProgress(steps) {
        STATE.progressSteps = steps;
        STATE.currentStep = -1;
        renderProgressBar();
    }

    function advanceStep(stepName) {
        STATE.currentStep = STATE.progressSteps.indexOf(stepName);
        if (STATE.currentStep === -1) STATE.currentStep = STATE.progressSteps.length - 1;
        renderProgressBar();
    }

    function renderProgressBar() {
        const el = document.getElementById('hck-progress-bar');
        if (!el) return;
        const total = STATE.progressSteps.length;
        const current = STATE.currentStep + 1;
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        let stepsHtml = STATE.progressSteps.map((s, i) => {
            let color = STATE.estilo?.cores?.textoSecundario || '#8A8A8E';
            let icon = '⬜';
            if (i < STATE.currentStep) { color = STATE.estilo?.cores?.sucesso || '#32D74B'; icon = '✅'; }
            else if (i === STATE.currentStep) { color = STATE.estilo?.cores?.info || '#0A84FF'; icon = '🔄'; }
            return `<span style="font-size:10px;color:${color};white-space:nowrap;" title="${s}">${icon} ${s}</span>`;
        }).join('<span style="color:#555;">›</span>');
        el.innerHTML = `
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;overflow-x:auto;scrollbar-width:none;">${stepsHtml}</div>
            <div style="background:#2C2C2E;border-radius:4px;height:4px;overflow:hidden;">
                <div style="background:linear-gradient(90deg,#007AFF,#32D74B);height:100%;width:${pct}%;transition:width 0.4s ease;border-radius:4px;"></div>
            </div>
            <div style="text-align:right;font-size:10px;color:#8A8A8E;margin-top:2px;">${pct}%</div>
        `;
    }

    function injectToastStyles() {
        const styleId = 'hck-tarefas-toast-styles';
        if (document.getElementById(styleId)) return;
        const css = `
          @keyframes toastProgress { from { width: 100%; } to { width: 0%; } }
          .hck-tarefas-toast-with-progress { position: relative; overflow: hidden; }
          .hck-tarefas-toast-with-progress::after { content: ''; position: absolute; bottom: 0; left: 0; height: 3px; width: 100%; background: ${TOAST_TEXT_COLOR}; opacity: 0.8; animation: toastProgress linear forwards; animation-duration: var(--toast-duration, 3000ms); }
        `;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
    }

    function sendToast(text, duration = 3000, gravity = 'bottom') {
        try {
            const toastStyle = {
                background: TOAST_BACKGROUND_COLOR, fontSize: isMobile ? '12px' : '13.5px',
                fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
                color: TOAST_TEXT_COLOR, padding: isMobile ? '10px 14px' : '12px 18px',
                paddingBottom: isMobile ? '15px' : '17px', borderRadius: '8px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(8px)', maxWidth: isMobile ? '90vw' : '320px', wordBreak: 'break-word'
            };
            const toastInstance = Toastify({ text, duration, gravity, position: "center", stopOnFocus: true, style: toastStyle });
            if (toastInstance.toastElement) {
                toastInstance.toastElement.classList.add('hck-tarefas-toast-with-progress');
                toastInstance.toastElement.style.setProperty('--toast-duration', `${duration}ms`);
            }
            toastInstance.showToast();
        } catch (e) { console.error("Toastify Error:", e); alert(text); }
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
            const script = document.createElement('script');
            script.src = url; script.type = 'text/javascript';
            script.onload = resolve;
            script.onerror = () => { console.error(`Erro ao carregar script: ${url}`); reject(new Error(`Falha ao carregar ${url}`)); };
            document.head.appendChild(script);
        });
    }

    async function loadCss(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`link[href="${url}"]`)) { resolve(); return; }
            const link = document.createElement('link');
            link.rel = 'stylesheet'; link.type = 'text/css'; link.href = url;
            link.onload = resolve;
            link.onerror = () => { console.error(`Erro ao carregar CSS: ${url}`); reject(new Error(`Falha ao carregar ${url}`)); };
            document.head.appendChild(link);
        });
    }

    function logMessage(level, ...args) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const message = args.map(arg => { try { return typeof arg === 'object' ? JSON.stringify(arg) : String(arg); } catch { return '[Object]'; } }).join(' ');
        STATE.logMessages.push({ timestamp, level, message });
        if (STATE.logMessages.length > 500) STATE.logMessages.shift();
        const consoleArgs = [`[HCK TAREFAS ${timestamp}]`, ...args];
        switch(level) {
            case 'ERROR': console.error(...consoleArgs); break;
            case 'WARN': console.warn(...consoleArgs); break;
            case 'INFO': console.info(...consoleArgs); break;
            default: console.log(...consoleArgs);
        }
    }

    function removeHtmlTags(htmlString) {
        const div = document.createElement('div');
        div.innerHTML = htmlString || '';
        return div.textContent || div.innerText || '';
    }

    function transformJson(jsonOriginal) {
        if (!jsonOriginal || !jsonOriginal.task || !jsonOriginal.task.questions) {
            console.error("[HCK TAREFAS] Estrutura do JSON original inválida para transformação:", jsonOriginal);
            throw new Error("Estrutura de dados inválida para transformação.");
        }
        let novoJson = { accessed_on: jsonOriginal.accessed_on, executed_on: jsonOriginal.executed_on, answers: {} };
        for (let questionId in jsonOriginal.answers) {
            let questionData = jsonOriginal.answers[questionId];
            let taskQuestion = jsonOriginal.task.questions.find(q => q.id === parseInt(questionId));
            if (!taskQuestion) continue;
            let answerPayload = { question_id: questionData.question_id, question_type: taskQuestion.type, answer: null };
            try {
                switch (taskQuestion.type) {
                    case "order-sentences":
                        if (taskQuestion.options && taskQuestion.options.sentences && Array.isArray(taskQuestion.options.sentences)) {
                            answerPayload.answer = taskQuestion.options.sentences.map(sentence => sentence.value);
                        }
                        break;
                    case "fill-words":
                        if (taskQuestion.options && taskQuestion.options.phrase && Array.isArray(taskQuestion.options.phrase)) {
                            answerPayload.answer = taskQuestion.options.phrase.map(item => item.value).filter((_, index) => index % 2 !== 0);
                        }
                        break;
                    case "text_ai":
                        let cleanedAnswer = removeHtmlTags(taskQuestion.comment || '');
                        answerPayload.answer = { "0": cleanedAnswer };
                        break;
                    case "fill-letters":
                        if (taskQuestion.options && taskQuestion.options.answer !== undefined) { answerPayload.answer = taskQuestion.options.answer; }
                        break;
                    case "cloud":
                        if (taskQuestion.options && taskQuestion.options.ids && Array.isArray(taskQuestion.options.ids)) { answerPayload.answer = taskQuestion.options.ids; }
                        break;
                    default:
                        if (taskQuestion.options && typeof taskQuestion.options === 'object') {
                            answerPayload.answer = Object.fromEntries(Object.keys(taskQuestion.options).map(optionId => {
                                const optionData = taskQuestion.options[optionId];
                                const answerValue = (optionData && optionData.answer !== undefined) ? optionData.answer : false;
                                return [optionId, answerValue];
                            }));
                        }
                        break;
                }
                novoJson.answers[questionId] = answerPayload;
            } catch (err) {
                console.error(`[HCK TAREFAS] Erro ao processar questão ID ${questionId}, tipo ${taskQuestion.type}:`, err);
                sendToast(`Erro processando questão ${questionId}. Ver console.`, 5000);
                continue;
            }
        }
        return novoJson;
    }

    async function pegarRespostasCorretas(taskId, answerId, headers) {
        const url = `https://edusp-api.ip.tv/tms/task/${taskId}/answer/${answerId}?with_task=true&with_genre=true&with_questions=true&with_assessed_skills=true`;
        sendToast("Buscando respostas corretas...", 2000);
        try {
            const response = await fetch(url, { method: "GET", headers });
            if (!response.ok) {
                console.error(`[HCK TAREFAS] Erro ${response.status} ao buscar respostas. URL: ${url}`);
                throw new Error(`Erro ${response.status} ao buscar respostas.`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("[HCK TAREFAS] Falha detalhada ao buscar respostas corretas:", error);
            sendToast(`Erro ao buscar respostas: ${error.message}`, 5000);
            throw error;
        }
    }

    async function enviarRespostasCorrigidas(respostasAnteriores, taskId, answerId, headers) {
        const url = `https://edusp-api.ip.tv/tms/task/${taskId}/answer/${answerId}`;
        try {
            const novasRespostasPayload = transformJson(respostasAnteriores);
            sendToast("Enviando respostas corrigidas...", 2000);
            const response = await fetch(url, { method: "PUT", headers, body: JSON.stringify(novasRespostasPayload) });
            if (!response.ok) {
                let errorBody = await response.text();
                console.error(`[HCK TAREFAS] Erro ${response.status} no PUT. URL: ${url}. Response Body:`, errorBody);
                try { errorBody = JSON.parse(errorBody); } catch (e) {}
                throw new Error(`Erro ${response.status} ao enviar respostas.`);
            }
            sendToast("Tarefa corrigida com sucesso!", 5000);
            STATE.stats.totalCorrected++;
            STATE.correctedTasks.push({ taskId, answerId, timestamp: new Date().toISOString(), status: 'success' });
            STATE.persistent.correctedTasks = STATE.correctedTasks;
            STATE.persistent.stats = STATE.stats;
            saveHistory();
            updateStatsDisplay();
            updateCorrectedTasksList();
            addNotification(`Tarefa ${taskId} corrigida com sucesso`, 'success');
            const oldTitle = document.title;
            document.title = `${SCRIPT_NAME} Fez a Boa!`;
            setTimeout(() => { document.title = oldTitle; }, 3000);
        } catch (error) {
            console.error("[HCK TAREFAS] Falha detalhada ao transformar ou enviar respostas corrigidas:", error);
            sendToast(`Erro na correção: ${error.message}`, 5000);
            STATE.stats.totalFailed++;
            STATE.correctedTasks.push({ taskId, answerId, timestamp: new Date().toISOString(), status: 'failed', error: error.message });
            STATE.persistent.correctedTasks = STATE.correctedTasks;
            STATE.persistent.stats = STATE.stats;
            saveHistory();
            updateStatsDisplay();
            updateCorrectedTasksList();
            addNotification(`Falha na tarefa ${taskId}: ${error.message}`, 'error');
        }
    }

    // ===== NOVAS FUNCIONALIDADES =====

    async function fetchActivityData() {
        if (!STATE.capturedLoginData || !STATE.capturedLoginData.auth_token) return null;
        const headers = {
            "x-api-realm": "edusp",
            "x-api-platform": "webclient",
            "x-api-key": STATE.capturedLoginData.auth_token,
            "content-type": "application/json"
        };
        try {
            const paths = ['/tms/tasks/current', '/tms/tasks/active', '/tms/task/current'];
            for (const path of paths) {
                try {
                    const r = await fetch(`https://edusp-api.ip.tv${path}`, { method: 'GET', headers });
                    if (r.ok) { const d = await r.json(); if (d && (d.id || d.task_id || (d.tasks && d.tasks.length))) return d; }
                } catch(e) {}
            }
            const urlMatch = window.location.href.match(/\/task\/(\d+)/);
            if (urlMatch) {
                const r = await fetch(`https://edusp-api.ip.tv/tms/task/${urlMatch[1]}?with_task=true&with_genre=true&with_questions=true&with_assessed_skills=true`, { method: 'GET', headers });
                if (r.ok) return await r.json();
            }
            const answerMatch = window.location.href.match(/\/answer\/(\d+)/);
            if (answerMatch) {
                const r = await fetch(`https://edusp-api.ip.tv/tms/task/0/answer/${answerMatch[1]}?with_task=true&with_genre=true&with_questions=true`, { method: 'GET', headers });
                if (r.ok) return await r.json();
            }
        } catch(e) { logMessage('ERROR', 'Erro ao buscar atividade:', e); }
        return null;
    }

    function parseActivityData(raw) {
        if (!raw) return null;
        const task = raw.task || raw;
        const questions = task.questions || [];
        const typeCounts = {};
        questions.forEach(q => { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; });
        const answeredCount = Object.keys(raw.answers || {}).length;
        return {
            id: task.id || raw.task_id || 'N/A',
            title: task.title || task.name || 'Sem título',
            discipline: (task.genre && (task.genre.name || task.genre.title)) || (task.discipline && task.discipline.name) || 'N/A',
            subject: task.subject?.name || task.subject?.title || '',
            totalQuestions: questions.length,
            answeredQuestions: answeredCount,
            questionTypes: typeCounts,
            status: raw.status || task.status || 'Desconhecido',
            progress: questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0,
            estimatedTime: task.estimated_time || null,
            difficulty: task.difficulty || null,
            raw: raw
        };
    }

    async function detectActivityChange() {
        if (!STATE.settings.autoDetectActivity || !STATE.capturedLoginData) return;
        const data = await fetchActivityData();
        if (data) {
            const parsed = parseActivityData(data);
            if (parsed && (!STATE.currentActivity || STATE.currentActivity.id !== parsed.id)) {
                STATE.currentActivity = parsed;
                STATE.currentRawData = data;
                logMessage('INFO', `Atividade detectada: ${parsed.title} (${parsed.id})`);
                addNotification(`Atividade detectada: ${parsed.title}`, 'info');
                renderActivityPanel();
                if (STATE.settings.autoPanel) {
                    const toggleBtn = document.getElementById('hck-tarefas-toggle-btn');
                    const menu = document.getElementById('hck-tarefas-menu');
                    if (toggleBtn && toggleBtn.style.display !== 'none' && window._toggleMenu) window._toggleMenu(true);
                }
            }
        }
    }

    async function runDiagnostics() {
        STATE.diagnosticResults = [];
        const diag = (name, ok, msg) => STATE.diagnosticResults.push({ name, ok, msg });
        diag('Script', true, `v${SCRIPT_VERSION} em execução`);
        diag('Toastify', typeof Toastify !== 'undefined', typeof Toastify !== 'undefined' ? 'Carregado' : 'NÃO carregado');
        diag('Token', !!STATE.capturedLoginData?.auth_token, STATE.capturedLoginData?.auth_token ? `Capturado (${STATE.capturedLoginData.name || 'sem nome'})` : 'NÃO capturado');
        diag('Interceptação', STATE.interceptEnabled, STATE.interceptEnabled ? 'Ativa' : 'Desativada pelo usuário');
        diag('Fetch Hook', window.fetch.toString().includes('hck-tarefas') || window._hckFetchPatched, 'Hook instalado no window.fetch');
        diag('Configurações', !!STATE.settings, 'Carregadas do LocalStorage');
        diag('LocalStorage', (() => { try { localStorage.setItem('_hck_test', '1'); localStorage.removeItem('_hck_test'); return true; } catch(e) { return false; } })(), 'Acesso disponível');
        diag('Histórico', !!STATE.persistent, `${STATE.persistent.correctedTasks?.length || 0} tarefas salvas`);

        if (STATE.capturedLoginData?.auth_token) {
            try {
                const t0 = performance.now();
                const r = await fetch('https://edusp-api.ip.tv/tms/tasks/current', {
                    method: 'GET',
                    headers: { "x-api-realm": "edusp", "x-api-platform": "webclient", "x-api-key": STATE.capturedLoginData.auth_token }
                });
                const dt = Math.round(performance.now() - t0);
                diag('API Conexão', r.ok, r.ok ? `Online (${r.status}, ${dt}ms)` : `Erro ${r.status}`);
            } catch(e) { diag('API Conexão', false, `Falha: ${e.message}`); }
        } else {
            diag('API Conexão', false, 'Sem token para testar');
        }

        if (STATE.settings.aiEnabled) {
            try {
                const t0 = performance.now();
                const r = await fetch(API_CONFIG.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_CONFIG.key}` },
                    body: JSON.stringify({ model: API_CONFIG.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 })
                });
                const dt = Math.round(performance.now() - t0);
                diag('IA (Pollinations)', r.ok, r.ok ? `Online (${dt}ms)` : `Erro ${r.status}`);
            } catch(e) { diag('IA (Pollinations)', false, `Falha: ${e.message}`); }
        } else {
            diag('IA (Pollinations)', null, 'Desativada nas configurações');
        }

        renderDiagnosticsTab();
        return STATE.diagnosticResults;
    }

    async function checkApiHealth() {
        if (!STATE.settings.apiMonitor || !STATE.capturedLoginData?.auth_token) return;
        try {
            const t0 = performance.now();
            const r = await fetch('https://edusp-api.ip.tv/tms/tasks/current', {
                method: 'GET',
                headers: { "x-api-realm": "edusp", "x-api-platform": "webclient", "x-api-key": STATE.capturedLoginData.auth_token }
            });
            const dt = Math.round(performance.now() - t0);
            const prevStatus = STATE.apiMonitor.status;
            STATE.apiMonitor.lastCheck = new Date().toISOString();
            STATE.apiMonitor.responseTime = dt;
            STATE.apiMonitor.status = r.ok ? (dt > 3000 ? 'slow' : 'online') : 'offline';
            STATE.persistent.apiMonitor = STATE.apiMonitor;
            saveHistory();

            if (prevStatus === 'online' && STATE.apiMonitor.status === 'offline') {
                addNotification('API ficou offline!', 'error');
            } else if (prevStatus === 'offline' && STATE.apiMonitor.status === 'online') {
                addNotification('API voltou online', 'success');
            } else if (STATE.apiMonitor.status === 'slow') {
                addNotification(`API lenta: ${dt}ms`, 'warn');
            }
            renderApiMonitorTab();
        } catch(e) {
            STATE.apiMonitor.status = 'offline';
            STATE.apiMonitor.lastCheck = new Date().toISOString();
            STATE.persistent.apiMonitor = STATE.apiMonitor;
            saveHistory();
        }
    }

    async function sendToAI(userMessage) {
        if (!STATE.settings.aiEnabled) return 'IA desativada nas configurações.';
        STATE.chatWaiting = true;
        renderChatTab();

        const systemPrompt = `Você é o assistente integrado do HCK TAREFAS, um script educacional. 
Contexto atual:
- Token capturado: ${STATE.capturedLoginData ? 'Sim (' + (STATE.capturedLoginData.name || 'sem nome') + ')' : 'Não'}
- Interceptação: ${STATE.interceptEnabled ? 'Ativa' : 'Inativa'}
- Atividade atual: ${STATE.currentActivity ? JSON.stringify(STATE.currentActivity, null, 2) : 'Nenhuma detectada'}
- Dados brutos da API: ${STATE.currentRawData ? JSON.stringify(STATE.currentRawData).substring(0, 4000) : 'Nenhum'}
- Estatísticas: ${JSON.stringify(STATE.stats)}
- Últimas tarefas: ${JSON.stringify(STATE.correctedTasks.slice(-5))}
- Monitor da API: ${JSON.stringify(STATE.apiMonitor)}
- Diagnósticos: ${JSON.stringify(STATE.diagnosticResults)}
- URL da página: ${window.location.href}
- Título da página: ${document.title}

Responda em português de forma clara e útil. Analise os dados fornecidos para ajudar o usuário.`;

        STATE.chatMessages.push({ role: 'user', content: userMessage });

        try {
            const r = await fetch(API_CONFIG.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_CONFIG.key}` },
                body: JSON.stringify({
                    model: API_CONFIG.model,
                    messages: [{ role: 'system', content: systemPrompt }, ...STATE.chatMessages.slice(-10)],
                    max_tokens: 1500,
                    temperature: 0.7
                })
            });
            const data = await r.json();
            const reply = data.choices?.[0]?.message?.content || 'Sem resposta da IA.';
            STATE.chatMessages.push({ role: 'assistant', content: reply });
        } catch(e) {
            STATE.chatMessages.push({ role: 'assistant', content: `Erro ao contatar IA: ${e.message}` });
        }
        STATE.chatWaiting = false;
        renderChatTab();
    }

    function exportLogs() {
        const lines = [
            `=== HCK TAREFAS - Log Export ===`,
            `Data: ${new Date().toLocaleString()}`,
            `Versão: ${SCRIPT_VERSION}`,
            `URL: ${window.location.href}`,
            `User Agent: ${navigator.userAgent}`,
            ``,
            `=== ESTATÍSTICAS ===`,
            `Interceptadas: ${STATE.stats.totalIntercepted}`,
            `Corrigidas: ${STATE.stats.totalCorrected}`,
            `Falhas: ${STATE.stats.totalFailed}`,
            `Tempo de sessão: ${Math.round((Date.now() - STATE.sessionStartTime) / 60000)}min`,
            ``,
            `=== CONFIGURAÇÕES ===`,
            JSON.stringify(STATE.settings, null, 2),
            ``,
            `=== ATIVIDADE ATUAL ===`,
            JSON.stringify(STATE.currentActivity, null, 2),
            ``,
            `=== MONITOR DA API ===`,
            JSON.stringify(STATE.apiMonitor, null, 2),
            ``,
            `=== DIAGNÓSTICOS ===`,
            STATE.diagnosticResults.map(d => `[${d.ok ? 'OK' : 'FALHA'}] ${d.name}: ${d.msg}`).join('\n'),
            ``,
            `=== TAREFAS PROCESSADAS (${STATE.correctedTasks.length}) ===`,
            STATE.correctedTasks.map(t => `[${t.status}] ${t.taskId} - ${t.timestamp}${t.error ? ' - ' + t.error : ''}`).join('\n'),
            ``,
            `=== NOTIFICAÇÕES (${STATE.persistent.notifications.length}) ===`,
            STATE.persistent.notifications.slice(-50).map(n => `[${n.type}] ${new Date(n.timestamp).toLocaleString()} - ${n.text}`).join('\n'),
            ``,
            `=== LOGS (${STATE.logMessages.length}) ===`,
            STATE.logMessages.map(l => `[${l.timestamp} ${l.level}] ${l.message}`).join('\n')
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hck_tarefas_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        addNotification('Logs exportados com sucesso', 'success');
    }

    function getSessionTime() {
        const ms = Date.now() - STATE.sessionStartTime;
        const min = Math.floor(ms / 60000);
        const sec = Math.floor((ms % 60000) / 1000);
        return `${min}m ${sec}s`;
    }

    function getTotalTime() {
        const saved = STATE.persistent.stats.totalTimeMs || 0;
        const current = Date.now() - STATE.sessionStartTime;
        const total = saved + current;
        const h = Math.floor(total / 3600000);
        const m = Math.floor((total % 3600000) / 60000);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    // ===== RENDER FUNCTIONS =====

    function renderActivityPanel() {
        const el = document.getElementById('hck-activity-panel');
        if (!el) return;
        const a = STATE.currentActivity;
        if (!a) {
            el.innerHTML = `<div style="text-align:center;color:#8A8A8E;font-size:12px;padding:10px;">Nenhuma atividade detectada.<br>Abrirá automaticamente ao navegar.</div>`;
            return;
        }
        const typesHtml = Object.entries(a.questionTypes || {}).map(([t, c]) => `<span style="background:#3A3A3C;padding:2px 6px;border-radius:4px;font-size:10px;margin:1px;">${t}: ${c}</span>`).join(' ');
        const statusColor = a.status === 'corrected' || a.status === 'completed' ? '#32D74B' : a.status === 'draft' ? '#FFD60A' : '#0A84FF';
        el.innerHTML = `
            <div style="margin-bottom:6px;">
                <div style="font-size:13px;font-weight:600;color:#F5F5F7;margin-bottom:2px;word-break:break-word;">${a.title}</div>
                <div style="font-size:11px;color:#8A8A8E;">Disciplina: <span style="color:#F5F5F7;">${a.discipline}</span>${a.subject ? ` › ${a.subject}` : ''}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;margin-bottom:6px;">
                <div style="background:#2C2C2E;padding:5px 8px;border-radius:6px;"><span style="color:#8A8A8E;">Questões:</span> <span style="color:#F5F5F7;font-weight:600;">${a.answeredQuestions}/${a.totalQuestions}</span></div>
                <div style="background:#2C2C2E;padding:5px 8px;border-radius:6px;"><span style="color:#8A8A8E;">Status:</span> <span style="color:${statusColor};font-weight:600;">${a.status}</span></div>
                <div style="background:#2C2C2E;padding:5px 8px;border-radius:6px;"><span style="color:#8A8A8E;">ID:</span> <span style="color:#F5F5F7;">${a.id}</span></div>
                ${a.estimatedTime ? `<div style="background:#2C2C2E;padding:5px 8px;border-radius:6px;"><span style="color:#8A8A8E;">Tempo:</span> <span style="color:#F5F5F7;">${a.estimatedTime}min</span></div>` : ''}
            </div>
            <div style="margin-bottom:4px;"><span style="font-size:10px;color:#8A8A8E;">Tipos:</span><div style="margin-top:2px;display:flex;flex-wrap:wrap;gap:2px;">${typesHtml || '<span style="color:#555;font-size:10px;">N/A</span>'}</div></div>
            <div style="background:#2C2C2E;border-radius:4px;height:6px;overflow:hidden;margin-top:4px;">
                <div style="background:linear-gradient(90deg,#007AFF,#32D74B);height:100%;width:${a.progress}%;border-radius:4px;transition:width 0.5s ease;"></div>
            </div>
            <div style="text-align:right;font-size:10px;color:#8A8A8E;margin-top:2px;">Progresso: ${a.progress}%</div>
        `;
    }

    function renderStatsTab() {
        const el = document.getElementById('hck-stats-tab');
        if (!el) return;
        const s = STATE.stats;
        const recent = STATE.correctedTasks.slice(-8).reverse();
        const recentHtml = recent.length > 0 ? recent.map(t => {
            const c = t.status === 'success' ? '#32D74B' : '#FF453A';
            const time = new Date(t.timestamp).toLocaleString();
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #2C2C2E;font-size:11px;">
                <span style="color:#F5F5F7;">#${t.taskId}</span>
                <span style="color:${c};font-weight:500;">${t.status === 'success' ? '✅' : '❌'} ${time}</span>
            </div>`;
        }).join('') : '<div style="text-align:center;color:#555;font-size:11px;">Nenhuma atividade</div>';

        const successRate = s.totalIntercepted > 0 ? Math.round((s.totalCorrected / s.totalIntercepted) * 100) : 0;

        el.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
                <div style="background:#2C2C2E;padding:10px;border-radius:8px;text-align:center;">
                    <div style="font-size:22px;font-weight:700;color:#0A84FF;">${s.totalIntercepted}</div>
                    <div style="font-size:10px;color:#8A8A8E;">Interceptadas</div>
                </div>
                <div style="background:#2C2C2E;padding:10px;border-radius:8px;text-align:center;">
                    <div style="font-size:22px;font-weight:700;color:#32D74B;">${s.totalCorrected}</div>
                    <div style="font-size:10px;color:#8A8A8E;">Corrigidas</div>
                </div>
                <div style="background:#2C2C2E;padding:10px;border-radius:8px;text-align:center;">
                    <div style="font-size:22px;font-weight:700;color:#FF453A;">${s.totalFailed}</div>
                    <div style="font-size:10px;color:#8A8A8E;">Falhas</div>
                </div>
                <div style="background:#2C2C2E;padding:10px;border-radius:8px;text-align:center;">
                    <div style="font-size:22px;font-weight:700;color:#FFD60A;">${successRate}%</div>
                    <div style="font-size:10px;color:#8A8A8E;">Taxa Sucesso</div>
                </div>
            </div>
            <div style="font-size:11px;color:#8A8A8E;margin-bottom:6px;display:flex;justify-content:space-between;">
                <span>Sessão: ${getSessionTime()}</span><span>Total: ${getTotalTime()}</span>
            </div>
            <div style="font-size:11px;color:#8A8A8E;margin-bottom:10px;padding:6px 8px;background:#2C2C2E;border-radius:6px;">
                Total permanente: ${STATE.persistent.correctedTasks.length} atividades
            </div>
            <div style="font-size:12px;font-weight:600;color:#F5F5F7;margin-bottom:6px;">Últimas Atividades</div>
            <div style="max-height:180px;overflow-y:auto;">${recentHtml}</div>
        `;
    }

    function renderChatTab() {
        const el = document.getElementById('hck-chat-tab');
        if (!el) return;
        const msgsHtml = STATE.chatMessages.map(m => {
            const isUser = m.role === 'user';
            return `<div style="display:flex;justify-content:${isUser ? 'flex-end' : 'flex-start'};margin-bottom:8px;">
                <div style="max-width:85%;padding:8px 10px;border-radius:${isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px'};background:${isUser ? '#007AFF' : '#2C2C2E'};color:#F5F5F7;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>`;
        }).join('');
        el.innerHTML = `
            <div id="hck-chat-messages" style="flex:1;overflow-y:auto;padding:6px;min-height:120px;max-height:300px;">${msgsHtml || '<div style="text-align:center;color:#555;font-size:11px;padding:20px;">A IA recebe automaticamente todos os dados do script como contexto. Pergunte sobre a atividade, respostas, estatísticas ou qualquer dúvida.</div>'}</div>
            ${STATE.settings.aiEnabled ? `
            <div style="display:flex;gap:6px;padding:6px;border-top:1px solid #38383A;">
                <input id="hck-chat-input" type="text" placeholder="Pergunte algo..." style="flex:1;background:#2C2C2E;border:1px solid #38383A;border-radius:8px;padding:8px 10px;color:#F5F5F7;font-size:12px;outline:none;font-family:inherit;" ${STATE.chatWaiting ? 'disabled' : ''}>
                <button id="hck-chat-send" style="background:#007AFF;color:#fff;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;" ${STATE.chatWaiting ? 'disabled' : ''}>${STATE.chatWaiting ? '⏳' : '➤'}</button>
            </div>` : '<div style="text-align:center;color:#FF453A;font-size:11px;padding:10px;">IA desativada nas configurações</div>'}
        `;
        const msgContainer = document.getElementById('hck-chat-messages');
        if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
        const input = document.getElementById('hck-chat-input');
        const sendBtn = document.getElementById('hck-chat-send');
        if (input && sendBtn) {
            const doSend = () => {
                const val = input.value.trim();
                if (!val || STATE.chatWaiting) return;
                input.value = '';
                sendToAI(val);
            };
            sendBtn.onclick = doSend;
            input.onkeydown = (e) => { if (e.key === 'Enter') doSend(); };
            if (!STATE.chatWaiting) input.focus();
        }
    }

    function renderNotificationsTab() {
        const el = document.getElementById('hck-notifs-tab');
        if (!el) return;
        const notifs = STATE.persistent.notifications.slice(-50).reverse();
        if (notifs.length === 0) {
            el.innerHTML = '<div style="text-align:center;color:#555;font-size:11px;padding:20px;">Nenhuma notificação</div>';
            return;
        }
        const typeIcon = { info: '🔵', success: '🟢', error: '🔴', warn: '🟡' };
        const typeColor = { info: '#0A84FF', success: '#32D74B', error: '#FF453A', warn: '#FFD60A' };
        el.innerHTML = `<div style="max-height:350px;overflow-y:auto;">${notifs.map(n => `
            <div style="padding:6px 8px;border-bottom:1px solid #2C2C2E;font-size:11px;">
                <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
                    <span>${typeIcon[n.type] || '⚪'}</span>
                    <span style="color:${typeColor[n.type] || '#8A8A8E'};font-weight:600;font-size:9px;text-transform:uppercase;">${n.type}</span>
                    <span style="color:#555;font-size:9px;margin-left:auto;">${new Date(n.timestamp).toLocaleTimeString()}</span>
                </div>
                <div style="color:#F5F5F7;line-height:1.4;">${n.text.replace(/</g, '&lt;')}</div>
            </div>
        `).join('')}</div>`;
    }

    function renderSettingsTab() {
        const el = document.getElementById('hck-settings-tab');
        if (!el) return;
        const s = STATE.settings;
        const mkToggle = (key, label) => {
            const on = s[key];
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #2C2C2E;">
                <span style="font-size:12px;color:#F5F5F7;">${label}</span>
                <div class="hck-toggle" data-key="${key}" style="width:42px;height:24px;background:${on ? '#007AFF' : '#3A3A3C'};border-radius:12px;cursor:pointer;position:relative;transition:background 0.3s ease;">
                    <div style="width:20px;height:20px;background:#fff;border-radius:50%;position:absolute;top:2px;left:${on ? '20px' : '2px'};transition:left 0.3s ease;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>
                </div>
            </div>`;
        };
        el.innerHTML = `
            <div style="margin-bottom:10px;">${mkToggle('notifications', '🔔 Notificações')}${mkToggle('sounds', '🔊 Sons')}${mkToggle('autoCorrection', '✅ Correção Automática')}${mkToggle('autoPanel', '📋 Painel Automático')}${mkToggle('aiEnabled', '🤖 IA Integrada')}${mkToggle('apiMonitor', '🌐 Monitor da API')}${mkToggle('autoDetectActivity', '🔄 Detecção Automática')}</div>
            <div style="font-size:10px;color:#555;text-align:center;">As configurações são salvas automaticamente</div>
        `;
        el.querySelectorAll('.hck-toggle').forEach(toggle => {
            toggle.onclick = () => {
                const key = toggle.dataset.key;
                STATE.settings[key] = !STATE.settings[key];
                saveSettings(STATE.settings);
                renderSettingsTab();
                if (key === 'interceptEnabled') {
                    STATE.interceptEnabled = STATE.settings.autoCorrection;
                    if (window.updateStatusDisplay) window.updateStatusDisplay();
                }
                addNotification(`${key}: ${STATE.settings[key] ? 'Ativado' : 'Desativado'}`, 'info');
            };
        });
    }

    function renderDiagnosticsTab() {
        const el = document.getElementById('hck-diag-tab');
        if (!el) return;
        if (STATE.diagnosticResults.length === 0) {
            el.innerHTML = '<div style="text-align:center;padding:10px;"><div style="color:#555;font-size:11px;margin-bottom:10px;">Clique para executar o diagnóstico</div><button id="hck-run-diag" style="background:#007AFF;color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:12px;font-weight:600;">▶ Executar Diagnóstico</button></div>';
            document.getElementById('hck-run-diag')?.addEventListener('click', runDiagnostics);
            return;
        }
        el.innerHTML = `
            <div style="margin-bottom:8px;"><button id="hck-rerun-diag" style="background:#3A3A3C;color:#F5F5F7;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;">🔄 Reexecutar</button></div>
            <div>${STATE.diagnosticResults.map(d => `
                <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #2C2C2E;font-size:11px;">
                    <span style="color:${d.ok === true ? '#32D74B' : d.ok === false ? '#FF453A' : '#8A8A8E'};font-size:14px;">${d.ok === true ? '✅' : d.ok === false ? '❌' : '⬜'}</span>
                    <span style="color:#F5F5F7;font-weight:500;min-width:90px;">${d.name}</span>
                    <span style="color:#8A8A8E;word-break:break-word;">${d.msg}</span>
                </div>
            `).join('')}</div>
        `;
        document.getElementById('hck-rerun-diag')?.addEventListener('click', runDiagnostics);
    }

    function renderApiMonitorTab() {
        const el = document.getElementById('hck-apimon-tab');
        if (!el) return;
        const m = STATE.apiMonitor;
        const statusMap = { online: { color: '#32D74B', text: 'Online' }, offline: { color: '#FF453A', text: 'Offline' }, slow: { color: '#FFD60A', text: 'Lenta' }, unknown: { color: '#8A8A8E', text: 'Desconhecido' } };
        const st = statusMap[m.status] || statusMap.unknown;
        const errorsHtml = (m.errors || []).slice(-5).reverse().map(e => `<div style="font-size:10px;color:#FF453A;padding:2px 0;">• ${e}</div>`).join('');
        el.innerHTML = `
            <div style="text-align:center;padding:12px;margin-bottom:8px;background:#2C2C2E;border-radius:8px;">
                <div style="font-size:28px;font-weight:700;color:${st.color};">${st.text}</div>
                <div style="font-size:11px;color:#8A8A8E;margin-top:4px;">Última verificação: ${m.lastCheck ? new Date(m.lastCheck).toLocaleTimeString() : 'Nunca'}</div>
                ${m.responseTime ? `<div style="font-size:11px;color:#8A8A8E;">Tempo de resposta: <span style="color:#F5F5F7;">${m.responseTime}ms</span></div>` : ''}
            </div>
            <div style="font-size:11px;color:#8A8A8E;margin-bottom:4px;">Funções que dependem da API:</div>
            <div style="font-size:10px;color:#F5F5F7;padding:4px 8px;background:#2C2C2E;border-radius:6px;margin-bottom:8px;line-height:1.6;">
                • Captura de token<br>• Busca de respostas corretas<br>• Envio de correções<br>• Detecção automática de atividade<br>• Monitoramento de saúde
            </div>
            ${errorsHtml ? `<div style="font-size:11px;color:#FF453A;font-weight:600;margin-bottom:4px;">Erros Recentes:</div>${errorsHtml}` : ''}
            ${STATE.settings.apiMonitor ? '<div style="text-align:center;font-size:10px;color:#555;margin-top:6px;">Monitoramento automático ativo (a cada 30s)</div>' : ''}
        `;
    }

    function switchTab(tabName) {
        STATE.activeTab = tabName;
        const tabs = ['main', 'stats', 'chat', 'notifs', 'settings', 'diag', 'apimon'];
        tabs.forEach(t => {
            const content = document.getElementById(`hck-${t}-tab`);
            const btn = document.getElementById(`hck-tab-btn-${t}`);
            if (content) content.style.display = t === tabName ? 'flex' : 'none';
            if (btn) {
                btn.style.color = t === tabName ? '#007AFF' : '#8A8A8E';
                btn.style.borderBottom = t === tabName ? '2px solid #007AFF' : '2px solid transparent';
            }
        });
        if (tabName === 'stats') renderStatsTab();
        if (tabName === 'chat') renderChatTab();
        if (tabName === 'notifs') renderNotificationsTab();
        if (tabName === 'settings') renderSettingsTab();
        if (tabName === 'diag') renderDiagnosticsTab();
        if (tabName === 'apimon') renderApiMonitorTab();
        if (tabName === 'main') renderActivityPanel();
    }

    // ===== UI SETUP =====

    function setupUI() {
        logMessage('INFO','Configurando UI para HCK TAREFAS...');
        try {
            const fontLink = document.createElement('link');
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
            fontLink.rel = 'stylesheet';
            document.head.appendChild(fontLink);
        } catch (e) { logMessage('WARN', 'Falha ao injetar Google Font.'); }

        const estilo = {
            cores: {
                fundo: '#1C1C1E', fundoSecundario: '#2C2C2E', fundoTerciario: '#3A3A3C',
                texto: '#F5F5F7', textoSecundario: '#8A8A8E', accent: '#FFFFFF',
                accentBg: '#007AFF', secondaryAccent: '#E5E5EA', secondaryAccentBg: '#3A3A3C',
                erro: '#FF453A', sucesso: '#32D74B', warn: '#FFD60A', info: '#0A84FF',
                logDebug: '#636366', borda: '#38383A', notificationBg: 'rgba(44, 44, 46, 0.85)',
                copyBtnBg: '#555555'
            },
            sombras: { menu: '0 10px 35px rgba(0, 0, 0, 0.3)', botao: '0 2px 4px rgba(0, 0, 0, 0.2)', notification: '0 5px 20px rgba(0, 0, 0, 0.3)' },
            radius: '14px', radiusSmall: '8px'
        };
        STATE.estilo = estilo;

        const getResponsiveSize = () => ({
            menuWidth: isMobile ? '92vw' : (window.innerWidth < 768 ? '340px' : '400px'),
            fontSize: isMobile ? '12px' : (window.innerWidth < 768 ? '13px' : '13px'),
            buttonPadding: isMobile ? '8px 10px' : '9px 10px',
            titleSize: isMobile ? '15px' : '16px'
        });

        const container = document.createElement('div');
        container.id = 'hck-tarefas-ui-bookmarklet';
        container.style.cssText = `position: fixed; bottom: ${isMobile ? '60px' : '12px'}; right: ${isMobile ? '5px' : '12px'}; z-index: 10000; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; line-height: 1.4;`;

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'hck-tarefas-toggle-btn';
        toggleBtn.textContent = 'TAREFAS';
        toggleBtn.style.cssText = `background: ${estilo.cores.fundoSecundario}; color: ${estilo.cores.textoSecundario}; padding: ${isMobile ? '6px 12px' : '8px 18px'}; border: 1px solid ${estilo.cores.borda}; border-radius: 22px; cursor: pointer; font-weight: 600; font-size: ${isMobile ? '12px' : '15px'}; box-shadow: ${estilo.sombras.botao}; display: block; transition: all 0.35s ease-out; width: auto; min-width: ${isMobile ? '60px' : '70px'}; text-align: center;`;

        const sizes = getResponsiveSize();
        const menu = document.createElement('div');
        menu.id = 'hck-tarefas-menu';
        menu.style.cssText = `background: ${estilo.cores.fundo}; width: ${sizes.menuWidth}; padding: 0; border-radius: ${estilo.radius}; box-shadow: ${estilo.sombras.menu}; display: none; flex-direction: column; border: 1px solid ${estilo.cores.borda}; opacity: 0; transform: translateY(15px) scale(0.95); transition: opacity 0.35s ease-out, transform 0.35s ease-out; position: fixed; bottom: ${isMobile ? '70px' : '70px'}; right: ${isMobile ? '5px' : '12px'}; max-height: ${isMobile ? '78vh' : '82vh'}; overflow: hidden;`;

        const style = document.createElement('style');
        style.textContent = `#hck-tarefas-menu::-webkit-scrollbar{display:none;} .hck-tab-content{display:none;flex-direction:column;flex:1;overflow:hidden;} .hck-tab-content.active{display:flex;} .hck-scroll-area{overflow-y:auto;scrollbar-width:none;} .hck-scroll-area::-webkit-scrollbar{display:none;}`;
        document.head.appendChild(style);

        // Header
        const header = document.createElement('div');
        header.style.cssText = `display: flex; align-items: center; justify-content: center; position: relative; width: 100%; padding: 10px 12px 6px; flex-shrink: 0;`;
        const title = document.createElement('div');
        title.textContent = SCRIPT_NAME;
        title.style.cssText = `font-size: ${sizes.titleSize}; font-weight: 700; text-align: center; flex-grow: 1; color: ${estilo.cores.texto}; letter-spacing: 0.5px;`;
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.setAttribute('aria-label', 'Fechar Menu');
        closeBtn.style.cssText = `position: absolute; top: -2px; right: -2px; background: ${estilo.cores.fundoSecundario}; border: none; color: ${estilo.cores.textoSecundario}; font-size: 18px; font-weight: 600; cursor: pointer; padding: 0; line-height: 1; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;`;
        closeBtn.onmouseover = () => { closeBtn.style.backgroundColor = estilo.cores.fundoTerciario; closeBtn.style.color = estilo.cores.texto; };
        closeBtn.onmouseout = () => { closeBtn.style.backgroundColor = estilo.cores.fundoSecundario; closeBtn.style.color = estilo.cores.textoSecundario; };
        header.append(title, closeBtn);

        // Tab Bar
        const tabBar = document.createElement('div');
        tabBar.style.cssText = `display:flex;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid ${estilo.cores.borda};flex-shrink:0;padding:0 4px;`;
        tabBar.id = 'hck-tab-bar';
        const tabDefs = [
            { id: 'main', label: '📋', title: 'Atividade' },
            { id: 'stats', label: '📊', title: 'Estatísticas' },
            { id: 'chat', label: '🤖', title: 'IA' },
            { id: 'notifs', label: '🔔', title: 'Notificações' },
            { id: 'settings', label: '⚙️', title: 'Configurações' },
            { id: 'diag', label: '🩺', title: 'Diagnóstico' },
            { id: 'apimon', label: '🌐', title: 'API' }
        ];
        tabDefs.forEach(td => {
            const btn = document.createElement('button');
            btn.id = `hck-tab-btn-${td.id}`;
            btn.textContent = td.label;
            btn.title = td.title;
            btn.style.cssText = `background:none;border:none;color:#8A8A8E;font-size:${isMobile ? '14px' : '15px'};cursor:pointer;padding:8px 10px;border-bottom:2px solid transparent;transition:color 0.2s ease;flex-shrink:0;`;
            btn.onmouseover = () => { if (STATE.activeTab !== td.id) btn.style.color = '#F5F5F7'; };
            btn.onmouseout = () => { if (STATE.activeTab !== td.id) btn.style.color = '#8A8A8E'; };
            btn.onclick = () => switchTab(td.id);
            tabBar.appendChild(btn);
        });

        // Content Area
        const contentArea = document.createElement('div');
        contentArea.style.cssText = `flex:1;overflow:hidden;display:flex;flex-direction:column;`;

        // Main Tab
        const mainTab = document.createElement('div');
        mainTab.id = 'hck-main-tab';
        mainTab.className = 'hck-tab-content active';
        mainTab.style.cssText = `padding:8px 10px;gap:6px;overflow-y:auto;`;

        const progressContainer = document.createElement('div');
        progressContainer.id = 'hck-progress-bar';
        progressContainer.style.cssText = `display:none;margin-bottom:6px;padding:6px 8px;background:${estilo.cores.fundoSecundario};border-radius:${estilo.radiusSmall};`;
        mainTab.appendChild(progressContainer);

        const activityPanel = document.createElement('div');
        activityPanel.id = 'hck-activity-panel';
        activityPanel.style.cssText = `background:${estilo.cores.fundoSecundario};border-radius:${estilo.radiusSmall};padding:8px 10px;margin-bottom:6px;`;
        activityPanel.innerHTML = `<div style="text-align:center;color:#8A8A8E;font-size:12px;padding:10px;">Nenhuma atividade detectada.<br>Abrirá automaticamente ao navegar.</div>`;
        mainTab.appendChild(activityPanel);

        // Status Section (original)
        const statusSection = document.createElement('div');
        statusSection.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; margin-bottom: 6px;`;
        const statusTitle = document.createElement('div');
        statusTitle.textContent = 'Status';
        statusTitle.style.cssText = `font-size: 11px; font-weight: 600; color: ${estilo.cores.textoSecundario}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;`;
        const statusContent = document.createElement('div');
        statusContent.id = 'status-content';
        statusContent.style.cssText = `font-size: ${sizes.fontSize}; color: ${estilo.cores.texto};`;
        statusContent.innerHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;"><span>Script:</span><span id="script-status" style="color: ${STATE.isActive ? estilo.cores.sucesso : estilo.cores.erro};">${STATE.isActive ? 'Ativo' : 'Inativo'}</span></div><div style="display: flex; justify-content: space-between; margin-bottom: 3px;"><span>Interceptação:</span><span id="intercept-status" style="color: ${STATE.interceptEnabled ? estilo.cores.sucesso : estilo.cores.erro};">${STATE.interceptEnabled ? 'Ativa' : 'Inativa'}</span></div><div style="display: flex; justify-content: space-between; margin-bottom: 3px;"><span>Token:</span><span id="token-status" style="color: ${STATE.capturedLoginData ? estilo.cores.sucesso : estilo.cores.warn};">${STATE.capturedLoginData ? 'Capturado' : 'Não capturado'}</span></div><div style="display: flex; justify-content: space-between;"><span>Sessão:</span><span id="session-time-status" style="color: ${estilo.cores.textoSecundario};">${getSessionTime()}</span></div>`;
        statusSection.append(statusTitle, statusContent);
        mainTab.appendChild(statusSection);

        // Stats Section (original)
        const statsSection = document.createElement('div');
        statsSection.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; margin-bottom: 6px;`;
        const statsTitle = document.createElement('div');
        statsTitle.textContent = 'Estatísticas';
        statsTitle.style.cssText = `font-size: 11px; font-weight: 600; color: ${estilo.cores.textoSecundario}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;`;
        const statsContent = document.createElement('div');
        statsContent.id = 'stats-content';
        statsContent.style.cssText = `font-size: ${sizes.fontSize}; color: ${estilo.cores.texto};`;
        statsContent.innerHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;"><span>Interceptadas:</span><span id="total-intercepted">${STATE.stats.totalIntercepted}</span></div><div style="display: flex; justify-content: space-between; margin-bottom: 3px;"><span>Corrigidas:</span><span id="total-corrected" style="color: ${estilo.cores.sucesso};">${STATE.stats.totalCorrected}</span></div><div style="display: flex; justify-content: space-between;"><span>Falhas:</span><span id="total-failed" style="color: ${estilo.cores.erro};">${STATE.stats.totalFailed}</span></div>`;
        statsSection.append(statsTitle, statsContent);
        mainTab.appendChild(statsSection);

        // Tasks List (original)
        const tasksSection = document.createElement('div');
        tasksSection.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; margin-bottom: 6px; max-height: ${isMobile ? '100px' : '120px'}; overflow-y: auto;`;
        const tasksTitle = document.createElement('div');
        tasksTitle.textContent = 'Tarefas Recentes';
        tasksTitle.style.cssText = `font-size: 11px; font-weight: 600; color: ${estilo.cores.textoSecundario}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;`;
        const tasksContent = document.createElement('div');
        tasksContent.id = 'tasks-content';
        tasksContent.style.cssText = `font-size: ${sizes.fontSize}; color: ${estilo.cores.texto};`;
        tasksContent.innerHTML = `<div style="text-align: center; color: ${estilo.cores.textoSecundario}; font-size: 12px;">Nenhuma tarefa processada ainda</div>`;
        tasksSection.append(tasksTitle, tasksContent);
        mainTab.appendChild(tasksSection);

        // Buttons (original)
        const buttonBaseStyle = `width: 100%; padding: ${sizes.buttonPadding}; border: none; border-radius: ${estilo.radiusSmall}; cursor: pointer; font-size: ${sizes.fontSize}; font-weight: 500; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 6px; transition: opacity 0.2s ease, background-color 0.2s ease;`;
        const style4 = document.createElement('style');
        style4.textContent = `.hck-tarefas-btn-primary:hover{opacity:0.85;} .hck-tarefas-btn-primary:disabled{background-color:${estilo.cores.fundoSecundario};color:${estilo.cores.textoSecundario};opacity:0.6;cursor:not-allowed;} .hck-tarefas-btn-secondary:hover{background:${estilo.cores.fundoTerciario};opacity:1;}`;
        document.head.appendChild(style4);

        const toggleInterceptBtn = document.createElement('button');
        toggleInterceptBtn.textContent = `${STATE.interceptEnabled ? 'Desativar' : 'Ativar'} Interceptação`;
        toggleInterceptBtn.className = 'hck-tarefas-btn-primary';
        toggleInterceptBtn.style.cssText = `${buttonBaseStyle} background: ${estilo.cores.accentBg}; color: ${estilo.cores.accent};`;

        const clearDataBtn = document.createElement('button');
        clearDataBtn.textContent = 'Limpar Dados';
        clearDataBtn.className = 'hck-tarefas-btn-secondary';
        clearDataBtn.style.cssText = `${buttonBaseStyle} background: ${estilo.cores.secondaryAccentBg}; color: ${estilo.cores.secondaryAccent}; border: 1px solid ${estilo.cores.borda};`;

        const logsBtn = document.createElement('button');
        logsBtn.textContent = 'Ver Logs';
        logsBtn.className = 'hck-tarefas-btn-secondary';
        logsBtn.style.cssText = `${buttonBaseStyle} background: ${estilo.cores.secondaryAccentBg}; color: ${estilo.cores.secondaryAccent}; border: 1px solid ${estilo.cores.borda};`;

        const exportBtn = document.createElement('button');
        exportBtn.textContent = '📤 Exportar Logs (.txt)';
        exportBtn.className = 'hck-tarefas-btn-secondary';
        exportBtn.style.cssText = `${buttonBaseStyle} background: ${estilo.cores.secondaryAccentBg}; color: ${estilo.cores.secondaryAccent}; border: 1px solid ${estilo.cores.borda};`;

        mainTab.append(toggleInterceptBtn, clearDataBtn, logsBtn, exportBtn);

        // Credits
        const credits = document.createElement('div');
        credits.innerHTML = `<span style="font-weight: 600; letter-spacing: 0.5px;">v${SCRIPT_VERSION}</span> <span style="margin: 0 4px;">|</span> <span style="opacity: 0.7;">by Hackermoon</span>`;
        credits.style.cssText = `text-align: center; font-size: 10px; font-weight: 500; color: ${estilo.cores.textoSecundario}; margin-top: 4px; padding-top: 6px; border-top: 1px solid ${estilo.cores.borda}; opacity: 0.9; flex-shrink: 0;`;
        mainTab.appendChild(credits);

        // Stats Tab
        const statsTab = document.createElement('div');
        statsTab.id = 'hck-stats-tab';
        statsTab.className = 'hck-tab-content hck-scroll-area';
        statsTab.style.cssText = `padding:10px;`;

        // Chat Tab
        const chatTab = document.createElement('div');
        chatTab.id = 'hck-chat-tab';
        chatTab.className = 'hck-tab-content';
        chatTab.style.cssText = `padding:0;display:none;flex-direction:column;`;

        // Notifications Tab
        const notifsTab = document.createElement('div');
        notifsTab.id = 'hck-notifs-tab';
        notifsTab.className = 'hck-tab-content hck-scroll-area';
        notifsTab.style.cssText = `padding:10px;`;

        // Settings Tab
        const settingsTab = document.createElement('div');
        settingsTab.id = 'hck-settings-tab';
        settingsTab.className = 'hck-tab-content hck-scroll-area';
        settingsTab.style.cssText = `padding:10px;`;

        // Diagnostics Tab
        const diagTab = document.createElement('div');
        diagTab.id = 'hck-diag-tab';
        diagTab.className = 'hck-tab-content hck-scroll-area';
        diagTab.style.cssText = `padding:10px;`;

        // API Monitor Tab
        const apimonTab = document.createElement('div');
        apimonTab.id = 'hck-apimon-tab';
        apimonTab.className = 'hck-tab-content hck-scroll-area';
        apimonTab.style.cssText = `padding:10px;`;

        contentArea.append(mainTab, statsTab, chatTab, notifsTab, settingsTab, diagTab, apimonTab);
        menu.append(header, tabBar, contentArea);

        const notificationContainer = document.createElement('div');
        notificationContainer.id = 'hck-tarefas-notifications';
        notificationContainer.style.cssText = `position: fixed; bottom: ${isMobile ? '10px' : '15px'}; left: 50%; transform: translateX(-50%); z-index: 10002; display: flex; flex-direction: column; align-items: center; gap: 10px; width: auto; max-width: 90%;`;

        STATE.notificationContainer = notificationContainer;
        container.append(menu, toggleBtn);
        document.body.appendChild(container);
        document.body.appendChild(notificationContainer);
        logMessage('INFO', 'Elementos da UI adicionados à página.');

        // UI Update Functions (preserved exactly)
        function updateStatusDisplay() {
            const scriptStatus = document.getElementById('script-status');
            const interceptStatus = document.getElementById('intercept-status');
            const tokenStatus = document.getElementById('token-status');
            const sessionTime = document.getElementById('session-time-status');
            if (scriptStatus) { scriptStatus.textContent = STATE.isActive ? 'Ativo' : 'Inativo'; scriptStatus.style.color = STATE.isActive ? estilo.cores.sucesso : estilo.cores.erro; }
            if (interceptStatus) { interceptStatus.textContent = STATE.interceptEnabled ? 'Ativa' : 'Inativa'; interceptStatus.style.color = STATE.interceptEnabled ? estilo.cores.sucesso : estilo.cores.erro; }
            if (tokenStatus) { tokenStatus.textContent = STATE.capturedLoginData ? 'Capturado' : 'Não capturado'; tokenStatus.style.color = STATE.capturedLoginData ? estilo.cores.sucesso : estilo.cores.warn; }
            if (sessionTime) sessionTime.textContent = getSessionTime();
        }

        function updateStatsDisplay() {
            const totalIntercepted = document.getElementById('total-intercepted');
            const totalCorrected = document.getElementById('total-corrected');
            const totalFailed = document.getElementById('total-failed');
            if (totalIntercepted) totalIntercepted.textContent = STATE.stats.totalIntercepted;
            if (totalCorrected) totalCorrected.textContent = STATE.stats.totalCorrected;
            if (totalFailed) totalFailed.textContent = STATE.stats.totalFailed;
        }

        function updateCorrectedTasksList() {
            const tasksContent = document.getElementById('tasks-content');
            if (!tasksContent) return;
            if (STATE.correctedTasks.length === 0) {
                tasksContent.innerHTML = `<div style="text-align: center; color: ${estilo.cores.textoSecundario}; font-size: 12px;">Nenhuma tarefa processada ainda</div>`;
                return;
            }
            const recentTasks = STATE.correctedTasks.slice(-5).reverse();
            tasksContent.innerHTML = recentTasks.map(task => {
                const time = new Date(task.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const statusColor = task.status === 'success' ? estilo.cores.sucesso : estilo.cores.erro;
                const statusText = task.status === 'success' ? 'Sucesso' : 'Falha';
                return `<div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;"><span>Tarefa ${task.taskId}</span><span style="color: ${statusColor};">${statusText} (${time})</span></div>`;
            }).join('');
        }

        window.updateStatusDisplay = updateStatusDisplay;
        window.updateStatsDisplay = updateStatsDisplay;
        window.updateCorrectedTasksList = updateCorrectedTasksList;

        // Menu Toggle (preserved)
        const toggleMenu = (show) => {
            const duration = 350;
            if (show) {
                logMessage('DEBUG', 'Mostrando menu...');
                menu.style.display = 'flex';
                toggleBtn.style.opacity = '0';
                toggleBtn.style.transform = 'scale(0.8) translateY(10px)';
                setTimeout(() => { menu.style.opacity = '1'; menu.style.transform = 'translateY(0) scale(1)'; toggleBtn.style.display = 'none'; }, 10);
            } else {
                logMessage('DEBUG', 'Escondendo menu...');
                menu.style.opacity = '0';
                menu.style.transform = 'translateY(15px) scale(0.95)';
                setTimeout(() => {
                    menu.style.display = 'none';
                    toggleBtn.style.display = 'block';
                    requestAnimationFrame(() => { toggleBtn.style.opacity = '1'; toggleBtn.style.transform = 'scale(1) translateY(0)'; });
                }, duration);
            }
        };
        window._toggleMenu = toggleMenu;

        const addTouchEvent = (element, callback) => {
            element.addEventListener('click', callback);
            if (isMobile) element.addEventListener('touchstart', (e) => { e.preventDefault(); callback(); });
        };

        addTouchEvent(toggleBtn, () => toggleMenu(true));
        addTouchEvent(closeBtn, () => toggleMenu(false));

        const hideLogs = () => { if (STATE.logModal) { STATE.logModal.style.display = 'none'; logMessage('DEBUG', 'Escondendo logs.'); } };

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (menu.style.display === 'flex') toggleMenu(false);
                if (STATE.logModal?.style.display !== 'none') hideLogs();
            }
        });

        window.addEventListener('resize', () => {
            const s = getResponsiveSize();
            menu.style.width = s.menuWidth;
            [toggleInterceptBtn, clearDataBtn, logsBtn, exportBtn].forEach(b => { b.style.fontSize = s.fontSize; b.style.padding = s.buttonPadding; });
            title.style.fontSize = s.titleSize;
        });

        // Original button events (preserved exactly)
        addTouchEvent(toggleInterceptBtn, () => {
            STATE.interceptEnabled = !STATE.interceptEnabled;
            toggleInterceptBtn.textContent = STATE.interceptEnabled ? 'Desativar Interceptação' : 'Ativar Interceptação';
            updateStatusDisplay();
            sendToast(`Interceptação ${STATE.interceptEnabled ? 'ativada' : 'desativada'}`, 3000);
        });

        addTouchEvent(clearDataBtn, () => {
            STATE.correctedTasks = [];
            STATE.stats = { totalIntercepted: 0, totalCorrected: 0, totalFailed: 0, totalTimeMs: 0, sessionStart: Date.now() };
            STATE.persistent.correctedTasks = [];
            STATE.persistent.stats = STATE.stats;
            saveHistory();
            updateStatsDisplay();
            updateCorrectedTasksList();
            sendToast('Dados limpos com sucesso', 3000);
        });

        addTouchEvent(exportBtn, exportLogs);

        // Log Modal (preserved exactly)
        const createLogModal = () => {
            if (STATE.logModal) return;
            logMessage('DEBUG', 'Criando modal de logs.');
            const modal = document.createElement('div');
            modal.id = 'hck-tarefas-log-modal';
            modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.75); display: none; align-items: center; justify-content: center; z-index: 10001; font-family: 'Inter', sans-serif; backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);`;
            const modalContent = document.createElement('div');
            modalContent.style.cssText = `background-color: ${estilo.cores.fundoSecundario}; color: ${estilo.cores.texto}; padding: 15px 20px; border-radius: ${estilo.radius}; border: 1px solid ${estilo.cores.borda}; width: ${isMobile ? '95%' : '85%'}; max-width: 800px; height: ${isMobile ? '80%' : '75%'}; max-height: 650px; display: flex; flex-direction: column; box-shadow: ${estilo.sombras.menu};`;
            const modalHeader = document.createElement('div');
            modalHeader.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid ${estilo.cores.borda}; padding-bottom: 8px; gap: 10px;`;
            const modalTitle = document.createElement('h3');
            modalTitle.textContent = 'Logs Detalhados (HCK TAREFAS)';
            modalTitle.style.cssText = `margin: 0; color: ${estilo.cores.texto}; font-weight: 600; font-size: 16px; flex-grow: 1;`;
            const copyLogBtn = document.createElement('button');
            copyLogBtn.textContent = 'Copiar Logs';
            copyLogBtn.style.cssText = `background: ${estilo.cores.copyBtnBg}; color: ${estilo.cores.secondaryAccent}; border: none; font-size: 11px; font-weight: 500; padding: 4px 8px; border-radius: ${estilo.radiusSmall}; cursor: pointer; transition: background-color 0.2s ease; flex-shrink: 0;`;
            copyLogBtn.onmouseover = () => copyLogBtn.style.backgroundColor = estilo.cores.borda;
            copyLogBtn.onmouseout = () => copyLogBtn.style.backgroundColor = estilo.cores.copyBtnBg;
            copyLogBtn.onclick = () => {
                const textToCopy = STATE.logMessages.map(log => `[${log.timestamp} ${log.level}] ${log.message}`).join('\n');
                navigator.clipboard.writeText(textToCopy).then(() => { copyLogBtn.textContent = 'Copiado!'; setTimeout(() => { copyLogBtn.textContent = 'Copiar Logs'; }, 2000); logMessage('INFO', 'Logs copiados.'); }).catch(err => { logMessage('ERROR', 'Falha ao copiar logs:', err); copyLogBtn.textContent = 'Erro!'; setTimeout(() => { copyLogBtn.textContent = 'Copiar Logs'; }, 2000); });
            };
            const closeLogBtn = document.createElement('button');
            closeLogBtn.innerHTML = '×';
            closeLogBtn.setAttribute('aria-label', 'Fechar Logs');
            closeLogBtn.style.cssText = `background: ${estilo.cores.fundoTerciario}; border: none; color: ${estilo.cores.textoSecundario}; font-size: 18px; font-weight: bold; cursor: pointer; padding: 0; line-height: 1; border-radius: 50%; width: 24px; height: 24px; display:flex; align-items:center; justify-content:center; transition: all 0.2s ease; flex-shrink: 0;`;
            closeLogBtn.onmouseover = () => { closeLogBtn.style.backgroundColor = estilo.cores.borda; closeLogBtn.style.color = estilo.cores.texto; };
            closeLogBtn.onmouseout = () => { closeLogBtn.style.backgroundColor = estilo.cores.fundoTerciario; closeLogBtn.style.color = estilo.cores.textoSecundario; };
            closeLogBtn.onclick = hideLogs;
            modalHeader.append(modalTitle, copyLogBtn, closeLogBtn);
            const logArea = document.createElement('div');
            logArea.id = 'hck-tarefas-log-area';
            logArea.style.cssText = `flex-grow: 1; overflow-y: auto; font-size: 11px; line-height: 1.6; background-color: ${estilo.cores.fundo}; border-radius: ${estilo.radiusSmall}; padding: 10px; border: 1px solid ${estilo.cores.borda}; white-space: pre-wrap; word-wrap: break-word; scrollbar-width: thin; scrollbar-color: ${estilo.cores.fundoTerciario} ${estilo.cores.fundo}; font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;`;
            modalContent.append(modalHeader, logArea);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
            STATE.logModal = modal;
        };

        const showLogs = () => {
            logMessage('DEBUG', 'showLogs chamado.');
            if (!STATE.logModal) createLogModal();
            const logArea = STATE.logModal?.querySelector('#hck-tarefas-log-area');
            if (!logArea) { logMessage('ERROR', 'Área de log não encontrada no modal.'); return; }
            logMessage('INFO', `Exibindo ${STATE.logMessages.length} logs.`);
            const logColors = { ERROR: estilo.cores.erro, WARN: estilo.cores.warn, INFO: estilo.cores.info, DEBUG: estilo.cores.logDebug, DEFAULT: estilo.cores.textoSecundario };
            const sanitize = (str) => { const temp = document.createElement('div'); temp.textContent = str; return temp.innerHTML; };
            logArea.innerHTML = STATE.logMessages.map(log => {
                const color = logColors[log.level] || logColors.DEFAULT;
                return `<span style="color: ${color}; font-weight: bold;">[${log.timestamp} ${log.level}]</span> <span style="color:${estilo.cores.texto};">${sanitize(log.message)}</span>`;
            }).join('\n');
            if (STATE.logModal) STATE.logModal.style.display = 'flex';
            logArea.scrollTop = logArea.scrollHeight;
        };

        addTouchEvent(logsBtn, showLogs);

        // Initialize first tab render
        switchTab('main');

        return {
            helpers: { toggleMenu, showLogs, hideLogs, updateStatusDisplay, updateStatsDisplay, updateCorrectedTasksList }
        };
    }

    async function init() {
        logMessage('INFO', `----- ${SCRIPT_NAME} Inicializando (v${SCRIPT_VERSION}) -----`);

        try {
            await loadCss('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            await loadCss('https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css');
            await loadScript('https://cdn.jsdelivr.net/npm/toastify-js');
            STATE.isToastifyLoaded = true;
            injectToastStyles();

            const ui = setupUI();
            if (!ui) throw new Error("Falha crítica na configuração da UI.");
            logMessage('INFO', 'Configuração da UI completa.');

            sendToast(`>> ${SCRIPT_NAME} Injetado! Aguardando login...`, 3000);
            sendToast("Créditos: inacialep, miitch, crackingnlearn, hackermoon", 5000);
            addNotification('Script inicializado com sucesso', 'success');

            // Session time updater
            setInterval(() => {
                if (window.updateStatusDisplay) window.updateStatusDisplay();
            }, 10000);

            // Auto-detect activity interval
            setInterval(() => { detectActivityChange(); }, 8000);

            // API health check interval
            setInterval(() => { checkApiHealth(); }, 30000);

            // Initial detection attempt
            setTimeout(() => { detectActivityChange(); }, 3000);

            // Interceptador de fetch (ORIGINAL PRESERVED)
            const originalFetch = window.fetch;
            window._hckFetchPatched = true;
            window.fetch = async function(input, init) {
                const url = typeof input === 'string' ? input : input.url;
                const method = init ? init.method : 'GET';

                if (url === 'https://edusp-api.ip.tv/registration/edusp/token' && !STATE.capturedLoginData) {
                    try {
                        const response = await originalFetch.apply(this, arguments);
                        const clonedResponse = response.clone();
                        const data = await clonedResponse.json();
                        if (data && data.auth_token) {
                            STATE.capturedLoginData = data;
                            logMessage('INFO', 'Token capturado com sucesso');
                            if (STATE.isToastifyLoaded) {
                                sendToast("Entrada feita com sucesso!", 3000);
                                const fullUserName = data?.name;
                                let firstName = '';
                                if (fullUserName && typeof fullUserName === 'string') {
                                    const nameParts = fullUserName.trim().split(' ');
                                    firstName = nameParts[0] || '';
                                    if (firstName) firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
                                }
                                if (firstName) { setTimeout(() => { sendToast(`Seja bem-vindo(a), ${firstName}!`, 3500); }, 250); }
                            }
                            if (window.updateStatusDisplay) window.updateStatusDisplay();
                            addNotification(`Token capturado: ${data.name || 'sem nome'}`, 'success');
                            // Trigger activity detection after login
                            setTimeout(() => { detectActivityChange(); checkApiHealth(); }, 1000);
                        }
                        return response;
                    } catch (error) {
                        console.error('[HCK TAREFAS] Erro CRÍTICO ao processar resposta do token:', error);
                        if (STATE.isToastifyLoaded) sendToast("Erro CRÍTICO ao capturar token. Ver console.", 5000);
                        return originalFetch.apply(this, arguments);
                    }
                }

                const response = await originalFetch.apply(this, arguments);

                const answerSubmitRegex = /^https:\/\/edusp-api\.ip\.tv\/tms\/task\/\d+\/answer$/;
                if (answerSubmitRegex.test(url) && init && init.method === 'POST' && STATE.interceptEnabled && STATE.settings.autoCorrection) {
                    if (!STATE.capturedLoginData || !STATE.capturedLoginData.auth_token) {
                        if (STATE.isToastifyLoaded) sendToast("Ops! Token não encontrado. Envie novamente após login.", 4000);
                        return response;
                    }
                    try {
                        const clonedResponse = response.clone();
                        const submittedData = await clonedResponse.json();
                        STATE.stats.totalIntercepted++;
                        STATE.persistent.stats = STATE.stats;
                        saveHistory();
                        if (window.updateStatsDisplay) window.updateStatsDisplay();

                        if (submittedData && submittedData.status !== "draft" && submittedData.id && submittedData.task_id) {
                            addNotification(`Envio detectado! Tarefa ${submittedData.task_id}`, 'info');
                            sendToast("Envio detectado! Iniciando correção...", 2000);

                            const headers_template = {
                                "x-api-realm": "edusp",
                                "x-api-platform": "webclient",
                                "x-api-key": STATE.capturedLoginData.auth_token,
                                "content-type": "application/json"
                            };

                            setProgress(['Detectado', 'Buscando gabarito', 'Processando', 'Transformando', 'Enviando', 'Concluído']);
                            advanceStep('Detectado');

                            setTimeout(async () => {
                                try {
                                    advanceStep('Buscando gabarito');
                                    const respostasOriginaisComGabarito = await pegarRespostasCorretas(submittedData.task_id, submittedData.id, headers_template);
                                    STATE.currentRawData = respostasOriginaisComGabarito;
                                    STATE.currentActivity = parseActivityData(respostasOriginaisComGabarito);
                                    renderActivityPanel();
                                    advanceStep('Processando');
                                    advanceStep('Transformando');
                                    await enviarRespostasCorrigidas(respostasOriginaisComGabarito, submittedData.task_id, submittedData.id, headers_template);
                                    advanceStep('Concluído');
                                    setTimeout(() => {
                                        const pb = document.getElementById('hck-progress-bar');
                                        if (pb) pb.style.display = 'none';
                                    }, 4000);
                                } catch (correctionError) {
                                    logMessage('ERROR', 'Erro durante o processo de correção automática:', correctionError);
                                    addNotification(`Erro na correção: ${correctionError.message}`, 'error');
                                }
                            }, 500);
                        }
                    } catch (err) {
                        console.error('[HCK TAREFAS] Erro ao processar a resposta JSON do envio de tarefa POST:', err);
                        if (STATE.isToastifyLoaded) sendToast("Erro ao processar envio. Ver console.", 5000);
                    }
                }

                // Auto-detect activity from GET requests to task/answer endpoints
                const taskGetRegex = /^https:\/\/edusp-api\.ip\.tv\/tms\/task\/\d+\/answer\/\d+/;
                if (taskGetRegex.test(url) && (!init || init.method === 'GET' || !init.method)) {
                    try {
                        const cloned = response.clone();
                        const data = await cloned.json();
                        if (data && data.task) {
                            STATE.currentRawData = data;
                            STATE.currentActivity = parseActivityData(data);
                            renderActivityPanel();
                            logMessage('INFO', `Atividade capturada via GET: ${STATE.currentActivity.title}`);
                        }
                    } catch(e) {}
                }

                return response;
            };

            logMessage('INFO', `----- ${SCRIPT_NAME} Inicializado (v${SCRIPT_VERSION}) -----`);
            ui.helpers.toggleMenu(true);

        } catch (error) {
            logMessage('ERROR', '!!! ERRO CRÍTICO NA INICIALIZAÇÃO DO BOOKMARKLET !!!', error);
            console.error(`[${SCRIPT_NAME} Init Fail]: ${error.message}. Script pode não funcionar. Verifique o Console.`);
            sendToast(`Erro na inicialização: ${error.message}`, 5000);
            addNotification(`Erro crítico: ${error.message}`, 'error');
        }
    }

    await init();
})();
