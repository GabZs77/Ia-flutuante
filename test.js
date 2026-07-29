(function () {
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

    // API Config
    const API_CONFIG = {
        url: 'https://gen.pollinations.ai/v1/chat/completions',
        key: 'pk_bJav4nbMa2fZGkqG',
        model: 'openai',
    };

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Estado global
    const STATE = {
        isActive: true,
        capturedLoginData: null,
        isToastifyLoaded: false,
        logMessages: [],
        interceptEnabled: true,
        correctedTasks: [],
        stats: {
            totalIntercepted: 0,
            totalCorrected: 0,
            totalFailed: 0,
            totalProcessed: 0,
            avgProcessingTime: 0,
            totalProcessingTime: 0,
            sessionStart: Date.now()
        },
        currentActivity: null,
        activityHistory: [],
        settings: {
            notifications: true,
            aiEnabled: true,
            autoCorrect: true,
            autoPanel: true
        },
        notifications: [],
        apiMonitor: {
            status: 'online',
            lastCheck: Date.now()
        },
        progress: {
            current: 0,
            total: 0,
            message: '',
            visible: false
        },
        chatHistory: []
    };

    // ==================== UTILITÁRIOS ====================
    
    function loadSettings() {
        try {
            const saved = localStorage.getItem('hck_tarefas_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                STATE.settings = { ...STATE.settings, ...parsed };
            }
        } catch (e) { console.warn('[HCK TAREFAS] Erro ao carregar configurações:', e); }
    }

    function saveSettings() {
        try {
            localStorage.setItem('hck_tarefas_settings', JSON.stringify(STATE.settings));
        } catch (e) { console.warn('[HCK TAREFAS] Erro ao salvar configurações:', e); }
    }

    function loadHistory() {
        try {
            const saved = localStorage.getItem('hck_tarefas_history');
            if (saved) {
                const parsed = JSON.parse(saved);
                STATE.activityHistory = parsed.activityHistory || [];
                STATE.correctedTasks = parsed.correctedTasks || [];
                STATE.stats = { ...STATE.stats, ...parsed.stats };
                STATE.notifications = parsed.notifications || [];
                STATE.chatHistory = parsed.chatHistory || [];
            }
        } catch (e) { console.warn('[HCK TAREFAS] Erro ao carregar histórico:', e); }
    }

    function saveHistory() {
        try {
            localStorage.setItem('hck_tarefas_history', JSON.stringify({
                activityHistory: STATE.activityHistory,
                correctedTasks: STATE.correctedTasks,
                stats: STATE.stats,
                notifications: STATE.notifications,
                chatHistory: STATE.chatHistory
            }));
        } catch (e) { console.warn('[HCK TAREFAS] Erro ao salvar histórico:', e); }
    }

    function logMessage(level, ...args) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const message = args.map(arg => { try { return typeof arg === 'object' ? JSON.stringify(arg) : String(arg); } catch { return '[Object]'; } }).join(' ');
        STATE.logMessages.push({ timestamp, level, message });
        if (STATE.logMessages.length > 300) STATE.logMessages.shift();
        const consoleArgs = [`[HCK TAREFAS ${timestamp}]`, ...args];
        switch(level) {
            case 'ERROR': console.error(...consoleArgs); break;
            case 'WARN': console.warn(...consoleArgs); break;
            case 'INFO': console.info(...consoleArgs); break;
            default: console.log(...consoleArgs);
        }
    }

    function addNotification(type, title, message) {
        STATE.notifications.unshift({
            id: Date.now(),
            type,
            title,
            message,
            timestamp: new Date().toISOString(),
            read: false
        });
        if (STATE.notifications.length > 100) STATE.notifications.pop();
        saveHistory();
        return STATE.notifications[0];
    }

    function sendToast(text, duration = 3000) {
        if (!STATE.settings.notifications) return;
        try {
            const toastStyle = {
                background: TOAST_BACKGROUND_COLOR,
                fontSize: isMobile ? '12px' : '13.5px',
                fontFamily: "'Inter', system-ui, sans-serif",
                color: TOAST_TEXT_COLOR,
                padding: isMobile ? '10px 14px' : '12px 18px',
                paddingBottom: isMobile ? '15px' : '17px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(8px)',
                maxWidth: isMobile ? '90vw' : '320px',
                wordBreak: 'break-word'
            };
            const toastInstance = Toastify({
                text: text,
                duration: duration,
                gravity: 'bottom',
                position: "center",
                stopOnFocus: true,
                style: toastStyle,
            });
            toastInstance.showToast();
        } catch (e) {
            console.error("Toastify Error:", e);
            alert(text);
        }
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
            const script = document.createElement('script');
            script.src = url;
            script.type = 'text/javascript';
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Falha ao carregar ${url}`));
            document.head.appendChild(script);
        });
    }

    function loadCss(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`link[href="${url}"]`)) { resolve(); return; }
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = url;
            link.onload = resolve;
            link.onerror = () => reject(new Error(`Falha ao carregar ${url}`));
            document.head.appendChild(link);
        });
    }

    function removeHtmlTags(htmlString) {
        const div = document.createElement('div');
        div.innerHTML = htmlString || '';
        return div.textContent || div.innerText || '';
    }

    // ==================== FUNÇÕES CORE ====================

    function transformJson(jsonOriginal) {
        if (!jsonOriginal || !jsonOriginal.task || !jsonOriginal.task.questions) {
            throw new Error("Estrutura de dados inválida para transformação.");
        }

        let novoJson = {
            accessed_on: jsonOriginal.accessed_on,
            executed_on: jsonOriginal.executed_on,
            answers: {}
        };

        for (let questionId in jsonOriginal.answers) {
            let questionData = jsonOriginal.answers[questionId];
            let taskQuestion = jsonOriginal.task.questions.find(q => q.id === parseInt(questionId));
            if (!taskQuestion) continue;

            let answerPayload = {
                question_id: questionData.question_id,
                question_type: taskQuestion.type,
                answer: null
            };

            try {
                switch (taskQuestion.type) {
                    case "order-sentences":
                        if (taskQuestion.options?.sentences) {
                            answerPayload.answer = taskQuestion.options.sentences.map(s => s.value);
                        }
                        break;
                    case "fill-words":
                        if (taskQuestion.options?.phrase) {
                            answerPayload.answer = taskQuestion.options.phrase
                                .map(item => item.value)
                                .filter((_, i) => i % 2 !== 0);
                        }
                        break;
                    case "text_ai":
                        answerPayload.answer = { "0": removeHtmlTags(taskQuestion.comment || '') };
                        break;
                    case "fill-letters":
                        if (taskQuestion.options?.answer !== undefined) {
                            answerPayload.answer = taskQuestion.options.answer;
                        }
                        break;
                    case "cloud":
                        if (taskQuestion.options?.ids) {
                            answerPayload.answer = taskQuestion.options.ids;
                        }
                        break;
                    default:
                        if (taskQuestion.options && typeof taskQuestion.options === 'object') {
                            answerPayload.answer = Object.fromEntries(
                                Object.keys(taskQuestion.options).map(optionId => {
                                    const optionData = taskQuestion.options[optionId];
                                    return [optionId, optionData?.answer ?? false];
                                })
                            );
                        }
                        break;
                }
                novoJson.answers[questionId] = answerPayload;
            } catch (err) {
                logMessage('ERROR', `Erro ao processar questão ${questionId}:`, err);
                continue;
            }
        }
        return novoJson;
    }

    async function pegarRespostasCorretas(taskId, answerId, headers) {
        const url = `https://edusp-api.ip.tv/tms/task/${taskId}/answer/${answerId}?with_task=true&with_genre=true&with_questions=true&with_assessed_skills=true`;
        try {
            const response = await fetch(url, { method: "GET", headers });
            if (!response.ok) throw new Error(`Erro ${response.status} ao buscar respostas.`);
            return await response.json();
        } catch (error) {
            logMessage('ERROR', 'Erro ao buscar respostas corretas:', error);
            throw error;
        }
    }

    async function enviarRespostasCorrigidas(respostasAnteriores, taskId, answerId, headers) {
        const url = `https://edusp-api.ip.tv/tms/task/${taskId}/answer/${answerId}`;
        try {
            const novasRespostasPayload = transformJson(respostasAnteriores);
            const response = await fetch(url, {
                method: "PUT",
                headers,
                body: JSON.stringify(novasRespostasPayload)
            });
            if (!response.ok) throw new Error(`Erro ${response.status} ao enviar respostas.`);
            
            STATE.stats.totalCorrected++;
            STATE.stats.totalProcessed++;
            STATE.correctedTasks.push({
                taskId,
                answerId,
                timestamp: new Date().toISOString(),
                status: 'success'
            });
            saveHistory();
            
            sendToast("✅ Tarefa corrigida com sucesso!", 5000);
            addNotification('success', 'Correção Concluída', `Tarefa ${taskId} corrigida.`);
            
            document.title = `${SCRIPT_NAME} Fez a Boa!`;
            setTimeout(() => { document.title = 'EDUSP'; }, 3000);
            
        } catch (error) {
            STATE.stats.totalFailed++;
            STATE.stats.totalProcessed++;
            STATE.correctedTasks.push({
                taskId,
                answerId,
                timestamp: new Date().toISOString(),
                status: 'failed',
                error: error.message
            });
            saveHistory();
            sendToast(`❌ Erro na correção: ${error.message}`, 5000);
            addNotification('error', 'Falha na Correção', error.message);
            throw error;
        }
    }

    async function fetchCurrentActivity() {
        if (!STATE.capturedLoginData?.auth_token) return null;
        
        try {
            const headers = {
                "x-api-realm": "edusp",
                "x-api-platform": "webclient",
                "x-api-key": STATE.capturedLoginData.auth_token,
                "content-type": "application/json"
            };

            const response = await fetch('https://edusp-api.ip.tv/tms/student/activities?limit=5', {
                method: 'GET',
                headers
            });

            if (!response.ok) throw new Error(`Erro ${response.status} ao buscar atividades`);

            const data = await response.json();
            if (data?.items?.length > 0) {
                const activity = data.items[0];
                STATE.currentActivity = {
                    id: activity.id,
                    title: activity.title || 'Sem título',
                    discipline: activity.discipline_name || 'Não informada',
                    status: activity.status || 'unknown',
                    progress: activity.progress || 0,
                    questionsCount: activity.total_questions || 0,
                    questionsTypes: activity.questions_types || [],
                    estimatedTime: activity.estimated_time || 0,
                    dueDate: activity.due_date || null,
                    lastUpdated: new Date().toISOString()
                };

                STATE.activityHistory.unshift({
                    ...STATE.currentActivity,
                    accessedAt: new Date().toISOString()
                });
                if (STATE.activityHistory.length > 50) STATE.activityHistory.pop();
                saveHistory();
                
                return STATE.currentActivity;
            }
            return null;
        } catch (error) {
            logMessage('ERROR', 'Erro ao buscar atividade:', error);
            return null;
        }
    }

    async function askAI(prompt) {
        if (!STATE.settings.aiEnabled) return "A IA está desativada nas configurações.";

        try {
            const context = STATE.currentActivity ? 
                `Atividade: ${STATE.currentActivity.title}\nDisciplina: ${STATE.currentActivity.discipline}\nStatus: ${STATE.currentActivity.status}\nProgresso: ${STATE.currentActivity.progress}%\nQuestões: ${STATE.currentActivity.questionsCount}\nTipos: ${STATE.currentActivity.questionsTypes?.join(', ') || 'N/A'}` : 
                'Nenhuma atividade carregada.';

            const messages = [
                {
                    role: 'system',
                    content: `Você é um assistente educacional especializado em análise de atividades acadêmicas. 
                    Contexto atual: ${context}
                    Seja claro, conciso e educativo em suas respostas.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ];

            const response = await fetch(API_CONFIG.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_CONFIG.key}`
                },
                body: JSON.stringify({
                    model: API_CONFIG.model,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 1000
                })
            });

            if (!response.ok) throw new Error(`Erro ${response.status} na API`);
            
            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content || 'Não foi possível gerar uma resposta.';
            
            STATE.chatHistory.push({ role: 'user', content: prompt, timestamp: Date.now() });
            STATE.chatHistory.push({ role: 'assistant', content: reply, timestamp: Date.now() });
            if (STATE.chatHistory.length > 100) STATE.chatHistory.splice(0, 20);
            saveHistory();
            
            return reply;
        } catch (error) {
            logMessage('ERROR', 'Erro na IA:', error);
            return `❌ Erro: ${error.message}`;
        }
    }

    function runDiagnostic() {
        return {
            token: !!STATE.capturedLoginData?.auth_token,
            api: STATE.apiMonitor.status === 'online',
            intercept: STATE.interceptEnabled,
            dependencies: STATE.isToastifyLoaded,
            ui: !!document.getElementById('hck-tarefas-ui-bookmarklet'),
            errors: []
        };
    }

    function exportLogs() {
        let content = `=== ${SCRIPT_NAME} v${SCRIPT_VERSION} - Relatório ===\n`;
        content += `Data: ${new Date().toISOString()}\n`;
        content += `Sessão iniciada: ${new Date(STATE.stats.sessionStart).toISOString()}\n\n`;
        content += `=== Estatísticas ===\n`;
        content += `Processadas: ${STATE.stats.totalProcessed}\n`;
        content += `Corrigidas: ${STATE.stats.totalCorrected}\n`;
        content += `Falhas: ${STATE.stats.totalFailed}\n`;
        content += `Tempo médio: ${STATE.stats.avgProcessingTime || 0}ms\n\n`;
        content += `=== Configurações ===\n${JSON.stringify(STATE.settings, null, 2)}\n\n`;
        content += `=== Logs (últimos 100) ===\n`;
        STATE.logMessages.slice(-100).forEach(log => {
            content += `[${log.timestamp} ${log.level}] ${log.message}\n`;
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hck_logs_${new Date().toISOString().slice(0,10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        sendToast('📤 Logs exportados!');
    }

    // ==================== PAINEL UI ====================

    function buildUI() {
        logMessage('INFO', 'Construindo painel...');

        const cores = {
            bg: '#0D0D0D',
            bgSec: '#1A1A1A',
            bgTer: '#2A2A2A',
            texto: '#F0F0F0',
            textoSec: '#888888',
            accent: '#00D4FF',
            accentBg: '#007AFF',
            sucesso: '#00E676',
            erro: '#FF1744',
            warn: '#FFEA00',
            borda: '#333333'
        };

        // Container principal
        const container = document.createElement('div');
        container.id = 'hck-tarefas-ui-bookmarklet';
        container.style.cssText = `
            position: fixed;
            bottom: ${isMobile ? '70px' : '20px'};
            right: ${isMobile ? '10px' : '20px'};
            z-index: 99999;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.5;
        `;

        // Botão toggle flutuante
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'hck-toggle-btn';
        toggleBtn.innerHTML = '📚';
        toggleBtn.style.cssText = `
            width: ${isMobile ? '56px' : '48px'};
            height: ${isMobile ? '56px' : '48px'};
            border-radius: 50%;
            background: ${cores.bgSec};
            color: ${cores.texto};
            border: 2px solid ${cores.borda};
            font-size: ${isMobile ? '24px' : '20px'};
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(0,0,0,0.6);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        toggleBtn.title = 'HCK TAREFAS';

        // Painel principal
        const panel = document.createElement('div');
        panel.id = 'hck-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: ${isMobile ? '130px' : '80px'};
            right: ${isMobile ? '10px' : '20px'};
            width: ${isMobile ? '92vw' : '420px'};
            max-width: ${isMobile ? '400px' : '420px'};
            max-height: ${isMobile ? '80vh' : '75vh'};
            background: ${cores.bg};
            border-radius: 16px;
            border: 1px solid ${cores.borda};
            box-shadow: 0 20px 60px rgba(0,0,0,0.8);
            display: none;
            flex-direction: column;
            overflow: hidden;
            transition: all 0.3s ease;
            font-size: 13px;
        `;

        // ============ CABEÇALHO ============
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background: ${cores.bgSec};
            border-bottom: 1px solid ${cores.borda};
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        `;

        const title = document.createElement('span');
        title.innerHTML = `📚 ${SCRIPT_NAME} <span style="color:${cores.textoSec};font-size:10px;">v${SCRIPT_VERSION}</span>`;
        title.style.cssText = `font-weight: 600; color: ${cores.texto}; font-size: 14px;`;

        const headerActions = document.createElement('div');
        headerActions.style.cssText = 'display: flex; gap: 6px;';

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: ${cores.textoSec};
            font-size: 16px;
            cursor: pointer;
            padding: 0 4px;
            transition: color 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.color = cores.erro;
        closeBtn.onmouseout = () => closeBtn.style.color = cores.textoSec;

        headerActions.appendChild(closeBtn);
        header.append(title, headerActions);

        // ============ CORPO ============
        const body = document.createElement('div');
        body.style.cssText = `
            padding: 12px 16px;
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 10px;
            scrollbar-width: thin;
            scrollbar-color: ${cores.borda} transparent;
        `;
        body.id = 'hck-panel-body';

        // ============ SEÇÃO: STATUS ============
        const statusSection = createSection('📊 Status');
        statusSection.innerHTML += `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 12px;">
                <div><span style="color:${cores.textoSec};">Script:</span> <span id="hck-status-script" style="color:${cores.sucesso};">✅ Ativo</span></div>
                <div><span style="color:${cores.textoSec};">Interceptação:</span> <span id="hck-status-intercept" style="color:${cores.sucesso};">✅ Ativa</span></div>
                <div><span style="color:${cores.textoSec};">Token:</span> <span id="hck-status-token" style="color:${cores.warn};">⏳ Aguardando</span></div>
                <div><span style="color:${cores.textoSec};">API:</span> <span id="hck-status-api" style="color:${cores.sucesso};">✅ Online</span></div>
            </div>
        `;
        body.appendChild(statusSection);

        // ============ SEÇÃO: ATIVIDADE ============
        const activitySection = createSection('📖 Atividade Atual');
        activitySection.id = 'hck-activity-section';
        activitySection.innerHTML += `
            <div id="hck-activity-content" style="font-size: 12px; color: ${cores.textoSec}; text-align: center; padding: 8px 0;">
                ⏳ Aguardando atividade...
            </div>
        `;
        body.appendChild(activitySection);

        // ============ SEÇÃO: PROGRESSO ============
        const progressSection = createSection('⏳ Progresso');
        progressSection.id = 'hck-progress-section';
        progressSection.style.display = 'none';
        progressSection.innerHTML += `
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: ${cores.textoSec}; margin-bottom: 3px;">
                <span id="hck-progress-msg">Processando...</span>
                <span id="hck-progress-pct">0%</span>
            </div>
            <div style="width:100%; height:4px; background:${cores.bgTer}; border-radius:4px; overflow:hidden;">
                <div id="hck-progress-bar" style="height:100%; width:0%; background:${cores.accentBg}; transition:width 0.4s ease;"></div>
            </div>
        `;
        body.appendChild(progressSection);

        // ============ SEÇÃO: ESTATÍSTICAS ============
        const statsSection = createSection('📈 Estatísticas');
        statsSection.innerHTML += `
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; text-align: center; font-size: 12px;">
                <div><span style="color:${cores.textoSec};">Processadas</span><br><span id="hck-stat-total" style="font-weight:600;color:${cores.texto};">0</span></div>
                <div><span style="color:${cores.textoSec};">Sucesso</span><br><span id="hck-stat-ok" style="font-weight:600;color:${cores.sucesso};">0</span></div>
                <div><span style="color:${cores.textoSec};">Falhas</span><br><span id="hck-stat-fail" style="font-weight:600;color:${cores.erro};">0</span></div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:11px; color:${cores.textoSec}; margin-top:4px;">
                <span>Tempo médio: <span id="hck-stat-avg" style="color:${cores.texto};">0ms</span></span>
                <span>Sessão: <span id="hck-stat-session" style="color:${cores.texto};">0m</span></span>
            </div>
        `;
        body.appendChild(statsSection);

        // ============ SEÇÃO: CHAT IA ============
        const chatSection = createSection('🤖 Assistente IA');
        chatSection.style.display = 'none';
        chatSection.id = 'hck-chat-section';
        chatSection.innerHTML += `
            <div id="hck-chat-messages" style="
                background: ${cores.bgSec};
                border-radius: 8px;
                padding: 8px 10px;
                max-height: 150px;
                overflow-y: auto;
                font-size: 12px;
                color: ${cores.texto};
                min-height: 50px;
                scrollbar-width: thin;
                scrollbar-color: ${cores.borda} transparent;
            ">
                <div style="color:${cores.textoSec}; text-align:center; padding:10px 0;">Pergunte sobre a atividade atual</div>
            </div>
            <div style="display:flex; gap:6px; margin-top:6px;">
                <input id="hck-chat-input" type="text" placeholder="Digite sua pergunta..." style="
                    flex:1;
                    padding:6px 10px;
                    border-radius:8px;
                    border:1px solid ${cores.borda};
                    background:${cores.bgSec};
                    color:${cores.texto};
                    font-size:12px;
                    outline:none;
                ">
                <button id="hck-chat-send" style="
                    padding:6px 14px;
                    border-radius:8px;
                    border:none;
                    background:${cores.accentBg};
                    color:#fff;
                    font-weight:600;
                    font-size:12px;
                    cursor:pointer;
                ">Enviar</button>
            </div>
        `;
        body.appendChild(chatSection);

        // ============ SEÇÃO: CONFIGURAÇÕES ============
        const settingsSection = createSection('⚙️ Configurações');
        settingsSection.style.display = 'none';
        settingsSection.id = 'hck-settings-section';
        const settingsHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; font-size:12px;">
                <label style="display:flex; align-items:center; gap:6px; color:${cores.texto}; cursor:pointer;">
                    <input type="checkbox" id="hck-set-notif" ${STATE.settings.notifications ? 'checked' : ''}>
                    Notificações
                </label>
                <label style="display:flex; align-items:center; gap:6px; color:${cores.texto}; cursor:pointer;">
                    <input type="checkbox" id="hck-set-ai" ${STATE.settings.aiEnabled ? 'checked' : ''}>
                    IA Integrada
                </label>
                <label style="display:flex; align-items:center; gap:6px; color:${cores.texto}; cursor:pointer;">
                    <input type="checkbox" id="hck-set-autocorrect" ${STATE.settings.autoCorrect ? 'checked' : ''}>
                    Correção Automática
                </label>
                <label style="display:flex; align-items:center; gap:6px; color:${cores.texto}; cursor:pointer;">
                    <input type="checkbox" id="hck-set-autopanel" ${STATE.settings.autoPanel ? 'checked' : ''}>
                    Painel Automático
                </label>
            </div>
        `;
        settingsSection.innerHTML += settingsHTML;
        body.appendChild(settingsSection);

        // ============ SEÇÃO: AÇÕES ============
        const actionsSection = createSection('🔧 Ações');
        actionsSection.innerHTML += `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                <button id="hck-btn-intercept" style="
                    padding:6px 10px;
                    border-radius:8px;
                    border:1px solid ${cores.borda};
                    background:${cores.bgSec};
                    color:${cores.texto};
                    font-size:12px;
                    cursor:pointer;
                    transition:all 0.2s;
                ">⏸️ Desativar Intercept</button>
                <button id="hck-btn-refresh" style="
                    padding:6px 10px;
                    border-radius:8px;
                    border:1px solid ${cores.borda};
                    background:${cores.bgSec};
                    color:${cores.texto};
                    font-size:12px;
                    cursor:pointer;
                    transition:all 0.2s;
                ">🔄 Atualizar</button>
                <button id="hck-btn-diagnostic" style="
                    padding:6px 10px;
                    border-radius:8px;
                    border:1px solid ${cores.borda};
                    background:${cores.bgSec};
                    color:${cores.texto};
                    font-size:12px;
                    cursor:pointer;
                    transition:all 0.2s;
                ">🩺 Diagnóstico</button>
                <button id="hck-btn-export" style="
                    padding:6px 10px;
                    border-radius:8px;
                    border:1px solid ${cores.borda};
                    background:${cores.bgSec};
                    color:${cores.texto};
                    font-size:12px;
                    cursor:pointer;
                    transition:all 0.2s;
                ">📤 Exportar Logs</button>
                <button id="hck-btn-clear" style="
                    padding:6px 10px;
                    border-radius:8px;
                    border:1px solid ${cores.erro};
                    background:transparent;
                    color:${cores.erro};
                    font-size:12px;
                    cursor:pointer;
                    transition:all 0.2s;
                ">🧹 Limpar Dados</button>
            </div>
        `;
        body.appendChild(actionsSection);

        // ============ FOOTER ============
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 8px 16px;
            background: ${cores.bgSec};
            border-top: 1px solid ${cores.borda};
            text-align: center;
            font-size: 10px;
            color: ${cores.textoSec};
            flex-shrink: 0;
        `;
        footer.textContent = `by Hackermoon • ${SCRIPT_VERSION}`;

        // ============ MONTAGEM ============
        panel.append(header, body, footer);
        container.append(toggleBtn, panel);
        document.body.appendChild(container);

        // ============ CONTROLES ============
        let isPanelOpen = false;

        function togglePanel(show) {
            isPanelOpen = show !== undefined ? show : !isPanelOpen;
            panel.style.display = isPanelOpen ? 'flex' : 'none';
            toggleBtn.style.transform = isPanelOpen ? 'scale(0.9)' : 'scale(1)';
            if (isPanelOpen) {
                updateAll();
                if (STATE.settings.autoPanel) fetchCurrentActivity().then(updateActivityUI);
            }
        }

        toggleBtn.addEventListener('click', () => togglePanel());
        closeBtn.addEventListener('click', () => togglePanel(false));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isPanelOpen) togglePanel(false);
        });

        // ============ HELPERS UI ============
        function createSection(title) {
            const section = document.createElement('div');
            section.style.cssText = `
                background: ${cores.bgSec};
                border-radius: 10px;
                padding: 10px 12px;
                border: 1px solid ${cores.borda};
            `;
            const titleEl = document.createElement('div');
            titleEl.textContent = title;
            titleEl.style.cssText = `
                font-size: 11px;
                font-weight: 600;
                color: ${cores.textoSec};
                margin-bottom: 6px;
                letter-spacing: 0.3px;
            `;
            section.appendChild(titleEl);
            return section;
        }

        function updateStatusUI() {
            const scriptEl = document.getElementById('hck-status-script');
            const interceptEl = document.getElementById('hck-status-intercept');
            const tokenEl = document.getElementById('hck-status-token');
            const apiEl = document.getElementById('hck-status-api');
            
            if (scriptEl) {
                scriptEl.textContent = STATE.isActive ? '✅ Ativo' : '❌ Inativo';
                scriptEl.style.color = STATE.isActive ? cores.sucesso : cores.erro;
            }
            if (interceptEl) {
                interceptEl.textContent = STATE.interceptEnabled ? '✅ Ativa' : '❌ Inativa';
                interceptEl.style.color = STATE.interceptEnabled ? cores.sucesso : cores.erro;
            }
            if (tokenEl) {
                tokenEl.textContent = STATE.capturedLoginData ? '✅ Capturado' : '⏳ Aguardando';
                tokenEl.style.color = STATE.capturedLoginData ? cores.sucesso : cores.warn;
            }
            if (apiEl) {
                apiEl.textContent = STATE.apiMonitor.status === 'online' ? '✅ Online' : '❌ Offline';
                apiEl.style.color = STATE.apiMonitor.status === 'online' ? cores.sucesso : cores.erro;
            }
        }

        function updateActivityUI(activity) {
            const content = document.getElementById('hck-activity-content');
            if (!content) return;

            if (!activity) {
                content.innerHTML = `<div style="text-align:center;color:${cores.textoSec};padding:8px 0;">⏳ Nenhuma atividade detectada</div>`;
                return;
            }

            const statusMap = {
                'pending': '⏳ Pendente',
                'in_progress': '🔄 Em andamento',
                'completed': '✅ Concluída',
                'expired': '⏰ Expirada'
            };
            const statusColor = {
                'pending': cores.warn,
                'in_progress': cores.accent,
                'completed': cores.sucesso,
                'expired': cores.erro
            };

            content.innerHTML = `
                <div style="font-weight:500;color:${cores.texto};margin-bottom:2px;">${activity.title}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:${cores.textoSec};">
                    <span>📖 ${activity.discipline}</span>
                    <span>📝 ${activity.questionsCount || 0} questões</span>
                    <span style="color:${statusColor[activity.status] || cores.textoSec};">${statusMap[activity.status] || activity.status}</span>
                    <span>📊 ${activity.progress || 0}%</span>
                </div>
                ${activity.questionsTypes?.length ? `<div style="font-size:10px;color:${cores.textoSec};margin-top:2px;">📌 ${activity.questionsTypes.join(' • ')}</div>` : ''}
            `;
        }

        function updateStatsUI() {
            const total = document.getElementById('hck-stat-total');
            const ok = document.getElementById('hck-stat-ok');
            const fail = document.getElementById('hck-stat-fail');
            const avg = document.getElementById('hck-stat-avg');
            const session = document.getElementById('hck-stat-session');

            if (total) total.textContent = STATE.stats.totalProcessed || 0;
            if (ok) ok.textContent = STATE.stats.totalCorrected || 0;
            if (fail) fail.textContent = STATE.stats.totalFailed || 0;
            if (avg) avg.textContent = STATE.stats.avgProcessingTime ? `${STATE.stats.avgProcessingTime}ms` : '0ms';
            
            if (session) {
                const elapsed = Math.floor((Date.now() - STATE.stats.sessionStart) / 60000);
                session.textContent = elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed/60)}h${elapsed%60}m`;
            }
        }

        function updateProgressUI() {
            const section = document.getElementById('hck-progress-section');
            const bar = document.getElementById('hck-progress-bar');
            const msg = document.getElementById('hck-progress-msg');
            const pct = document.getElementById('hck-progress-pct');

            if (!section) return;

            if (STATE.progress.visible) {
                section.style.display = 'block';
                const percent = STATE.progress.total > 0 ? Math.round((STATE.progress.current / STATE.progress.total) * 100) : 0;
                if (bar) bar.style.width = `${Math.min(percent, 100)}%`;
                if (msg) msg.textContent = STATE.progress.message || 'Processando...';
                if (pct) pct.textContent = `${Math.min(percent, 100)}%`;
            } else {
                section.style.display = 'none';
                if (bar) bar.style.width = '0%';
            }
        }

        function updateAll() {
            updateStatusUI();
            updateStatsUI();
            updateProgressUI();
        }

        function showProgress(current, total, message) {
            STATE.progress.current = current;
            STATE.progress.total = total;
            STATE.progress.message = message;
            STATE.progress.visible = true;
            updateProgressUI();
        }

        function hideProgress() {
            STATE.progress.visible = false;
            updateProgressUI();
        }

        // ============ EVENTOS DOS BOTÕES ============
        document.getElementById('hck-btn-intercept')?.addEventListener('click', () => {
            STATE.interceptEnabled = !STATE.interceptEnabled;
            const btn = document.getElementById('hck-btn-intercept');
            if (btn) btn.textContent = STATE.interceptEnabled ? '⏸️ Desativar Intercept' : '▶️ Ativar Intercept';
            updateStatusUI();
            sendToast(`Interceptação ${STATE.interceptEnabled ? 'ativada' : 'desativada'}`);
            addNotification('info', 'Interceptação', `${STATE.interceptEnabled ? 'Ativada' : 'Desativada'}`);
        });

        document.getElementById('hck-btn-refresh')?.addEventListener('click', async () => {
            sendToast('🔄 Atualizando...');
            showProgress(0, 1, 'Buscando atividade...');
            await fetchCurrentActivity().then(updateActivityUI);
            showProgress(1, 1, 'Atualizado!');
            setTimeout(hideProgress, 500);
            updateStatsUI();
            sendToast('✅ Atualizado!');
        });

        document.getElementById('hck-btn-diagnostic')?.addEventListener('click', () => {
            const result = runDiagnostic();
            let msg = '🔍 DIAGNÓSTICO\n\n';
            msg += `Token: ${result.token ? '✅' : '❌'}\n`;
            msg += `API: ${result.api ? '✅' : '❌'}\n`;
            msg += `Interceptação: ${result.intercept ? '✅' : '❌'}\n`;
            msg += `Dependências: ${result.dependencies ? '✅' : '❌'}\n`;
            msg += `UI: ${result.ui ? '✅' : '❌'}\n`;
            if (result.errors.length) msg += `\n⚠️ ${result.errors.join('\n')}`;
            alert(msg);
            addNotification('info', 'Diagnóstico', result.errors.length ? `${result.errors.length} problemas encontrados` : 'Tudo funcionando!');
        });

        document.getElementById('hck-btn-export')?.addEventListener('click', exportLogs);

        document.getElementById('hck-btn-clear')?.addEventListener('click', () => {
            if (!confirm('Limpar todos os dados?')) return;
            STATE.correctedTasks = [];
            STATE.activityHistory = [];
            STATE.notifications = [];
            STATE.chatHistory = [];
            STATE.stats = {
                totalIntercepted: 0,
                totalCorrected: 0,
                totalFailed: 0,
                totalProcessed: 0,
                avgProcessingTime: 0,
                totalProcessingTime: 0,
                sessionStart: Date.now()
            };
            saveHistory();
            updateStatsUI();
            sendToast('🧹 Dados limpos!');
            addNotification('info', 'Dados Limpos', 'Todos os dados foram removidos.');
        });

        // ============ CHAT IA ============
        const chatInput = document.getElementById('hck-chat-input');
        const chatSend = document.getElementById('hck-chat-send');
        const chatMessages = document.getElementById('hck-chat-messages');

        async function sendChatMessage() {
            const question = chatInput?.value.trim();
            if (!question) return;
            if (chatInput) chatInput.value = '';

            chatMessages.innerHTML += `<div style="margin:4px 0;text-align:right;"><span style="background:${cores.accentBg};color:#fff;padding:4px 10px;border-radius:12px;display:inline-block;max-width:80%;">${question}</span></div>`;
            chatMessages.innerHTML += `<div style="margin:4px 0;color:${cores.textoSec};">🤖 Pensando...</div>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;

            try {
                const response = await askAI(question);
                chatMessages.removeChild(chatMessages.lastChild);
                chatMessages.innerHTML += `<div style="margin:4px 0;background:${cores.bgTer};padding:6px 10px;border-radius:12px;display:inline-block;max-width:85%;color:${cores.texto};white-space:pre-wrap;">🤖 ${response}</div>`;
            } catch (error) {
                chatMessages.removeChild(chatMessages.lastChild);
                chatMessages.innerHTML += `<div style="margin:4px 0;color:${cores.erro};">❌ ${error.message}</div>`;
            }
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        chatSend?.addEventListener('click', sendChatMessage);
        chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

        // ============ CONFIGURAÇÕES ============
        document.getElementById('hck-set-notif')?.addEventListener('change', (e) => {
            STATE.settings.notifications = e.target.checked;
            saveSettings();
        });
        document.getElementById('hck-set-ai')?.addEventListener('change', (e) => {
            STATE.settings.aiEnabled = e.target.checked;
            saveSettings();
            const section = document.getElementById('hck-chat-section');
            if (section) section.style.display = e.target.checked ? 'block' : 'none';
        });
        document.getElementById('hck-set-autocorrect')?.addEventListener('change', (e) => {
            STATE.settings.autoCorrect = e.target.checked;
            saveSettings();
        });
        document.getElementById('hck-set-autopanel')?.addEventListener('change', (e) => {
            STATE.settings.autoPanel = e.target.checked;
            saveSettings();
        });

        // ============ NAVEGAÇÃO POR TABS ============
        // Criar navegação por abas no cabeçalho
        const nav = document.createElement('div');
        nav.style.cssText = `
            display: flex;
            gap: 2px;
            padding: 0 16px 8px 16px;
            background: ${cores.bg};
            border-bottom: 1px solid ${cores.borda};
            flex-shrink: 0;
        `;

        const tabs = [
            { id: 'tab-main', label: '📊 Painel', sections: ['hck-activity-section', 'hck-progress-section', 'hck-status-section'] },
            { id: 'tab-stats', label: '📈 Stats', sections: ['hck-stats-section'] },
            { id: 'tab-chat', label: '🤖 IA', sections: ['hck-chat-section'] },
            { id: 'tab-settings', label: '⚙️ Config', sections: ['hck-settings-section'] }
        ];

        // Mover seções para dentro do body e identificar
        const sections = body.querySelectorAll('div[style*="background:"]');
        sections.forEach(s => {
            const title = s.querySelector('div:first-child')?.textContent || '';
            if (title.includes('Status')) s.id = 'hck-status-section';
            else if (title.includes('Atividade')) s.id = 'hck-activity-section';
            else if (title.includes('Progresso')) s.id = 'hck-progress-section';
            else if (title.includes('Estatísticas')) s.id = 'hck-stats-section';
            else if (title.includes('Assistente')) s.id = 'hck-chat-section';
            else if (title.includes('Configurações')) s.id = 'hck-settings-section';
        });

        let activeTab = 'tab-main';

        tabs.forEach(tab => {
            const btn = document.createElement('button');
            btn.textContent = tab.label;
            btn.dataset.tab = tab.id;
            btn.style.cssText = `
                padding: 4px 10px;
                border: none;
                border-radius: 6px;
                background: ${tab.id === activeTab ? cores.accentBg : 'transparent'};
                color: ${tab.id === activeTab ? '#fff' : cores.textoSec};
                font-size: 11px;
                font-weight: ${tab.id === activeTab ? '600' : '400'};
                cursor: pointer;
                transition: all 0.2s;
            `;
            btn.addEventListener('click', () => {
                activeTab = tab.id;
                // Atualizar botões
                nav.querySelectorAll('button').forEach(b => {
                    b.style.background = b.dataset.tab === activeTab ? cores.accentBg : 'transparent';
                    b.style.color = b.dataset.tab === activeTab ? '#fff' : cores.textoSec;
                    b.style.fontWeight = b.dataset.tab === activeTab ? '600' : '400';
                });
                // Mostrar/ocultar seções
                const allSections = body.querySelectorAll('div[style*="background:"]');
                allSections.forEach(s => {
                    const shouldShow = tab.sections.includes(s.id);
                    s.style.display = shouldShow ? 'block' : 'none';
                });
                // Mostrar ações sempre
                const actionsSection = body.querySelector('div:last-child');
                if (actionsSection) actionsSection.style.display = 'block';
            });
            nav.appendChild(btn);
        });

        // Inserir nav após o header
        panel.insertBefore(nav, body);

        // Mostrar apenas a aba inicial
        const initialSections = tabs.find(t => t.id === activeTab)?.sections || [];
        body.querySelectorAll('div[style*="background:"]').forEach(s => {
            s.style.display = initialSections.includes(s.id) ? 'block' : 'none';
        });

        // ============ EXPOR API ============
        window.__HCK = {
            state: STATE,
            fetchCurrentActivity,
            askAI,
            runDiagnostic,
            exportLogs,
            updateAll,
            togglePanel,
            showProgress,
            hideProgress
        };

        logMessage('INFO', 'Painel construído com sucesso.');
        return { togglePanel, updateAll, updateActivityUI, showProgress, hideProgress };
    }

    // ==================== INICIALIZAÇÃO ====================

    async function init() {
        logMessage('INFO', `----- ${SCRIPT_NAME} v${SCRIPT_VERSION} Iniciando -----`);

        try {
            loadSettings();
            loadHistory();

            await loadCss('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
            await loadCss('https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css');
            await loadScript('https://cdn.jsdelivr.net/npm/toastify-js');
            STATE.isToastifyLoaded = true;

            const ui = buildUI();
            if (!ui) throw new Error('Falha ao construir UI');

            sendToast(`✅ ${SCRIPT_NAME} injetado!`, 3000);
            addNotification('info', 'Script Iniciado', `${SCRIPT_NAME} v${SCRIPT_VERSION} carregado.`);

            // Interceptador de fetch
            const originalFetch = window.fetch;
            window.fetch = async function(input, init) {
                const url = typeof input === 'string' ? input : input.url;
                const method = init?.method || 'GET';

                // Capturar token
                if (url === 'https://edusp-api.ip.tv/registration/edusp/token' && !STATE.capturedLoginData) {
                    try {
                        const response = await originalFetch.apply(this, arguments);
                        const cloned = response.clone();
                        const data = await cloned.json();

                        if (data?.auth_token) {
                            STATE.capturedLoginData = data;
                            logMessage('INFO', 'Token capturado');
                            sendToast('✅ Login detectado!', 3000);
                            addNotification('success', 'Login', 'Token capturado com sucesso.');
                            ui.updateAll();
                            if (STATE.settings.autoPanel) {
                                const activity = await fetchCurrentActivity();
                                ui.updateActivityUI(activity);
                            }
                        }
                        return response;
                    } catch (error) {
                        logMessage('ERROR', 'Erro ao capturar token:', error);
                        return originalFetch.apply(this, arguments);
                    }
                }

                const response = await originalFetch.apply(this, arguments);

                // Interceptar envio de tarefa
                const answerRegex = /^https:\/\/edusp-api\.ip\.tv\/tms\/task\/\d+\/answer$/;
                if (answerRegex.test(url) && method === 'POST' && STATE.interceptEnabled && STATE.settings.autoCorrect) {
                    if (!STATE.capturedLoginData?.auth_token) {
                        sendToast('⚠️ Token não encontrado. Faça login primeiro.', 4000);
                        return response;
                    }

                    try {
                        const cloned = response.clone();
                        const submittedData = await cloned.json();
                        STATE.stats.totalIntercepted++;
                        ui.updateStatsUI();
                        saveHistory();

                        if (submittedData?.id && submittedData?.task_id && submittedData.status !== 'draft') {
                            sendToast('📤 Envio detectado! Corrigindo...', 2000);
                            addNotification('info', 'Correção', `Tarefa ${submittedData.task_id} detectada.`);
                            
                            ui.showProgress(0, 3, 'Buscando respostas...');

                            const headers = {
                                "x-api-realm": "edusp",
                                "x-api-platform": "webclient",
                                "x-api-key": STATE.capturedLoginData.auth_token,
                                "content-type": "application/json"
                            };

                            setTimeout(async () => {
                                try {
                                    ui.showProgress(1, 3, 'Processando...');
                                    const gabarito = await pegarRespostasCorretas(submittedData.task_id, submittedData.id, headers);
                                    
                                    ui.showProgress(2, 3, 'Enviando correção...');
                                    await enviarRespostasCorrigidas(gabarito, submittedData.task_id, submittedData.id, headers);
                                    
                                    ui.showProgress(3, 3, '✅ Concluído!');
                                    setTimeout(ui.hideProgress, 1000);
                                    ui.updateStatsUI();
                                    
                                } catch (err) {
                                    logMessage('ERROR', 'Erro na correção:', err);
                                    ui.hideProgress();
                                    addNotification('error', 'Erro na Correção', err.message);
                                }
                            }, 500);
                        }
                    } catch (err) {
                        logMessage('ERROR', 'Erro ao processar envio:', err);
                    }
                }

                return response;
            };

            // Abrir painel automaticamente
            setTimeout(() => ui.togglePanel(true), 800);

            // Monitoramento periódico
            setInterval(async () => {
                if (STATE.settings.autoPanel) {
                    const activity = await fetchCurrentActivity();
                    ui.updateActivityUI(activity);
                }
                ui.updateAll();
            }, 30000);

            logMessage('INFO', `----- ${SCRIPT_NAME} Inicializado -----`);

        } catch (error) {
            logMessage('ERROR', 'Erro crítico na inicialização:', error);
            console.error(error);
            alert(`Erro ao iniciar ${SCRIPT_NAME}: ${error.message}`);
        }
    }

    await init();

})();
