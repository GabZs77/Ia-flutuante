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

    // API Config
    const API_CONFIG = {
        url: 'https://gen.pollinations.ai/v1/chat/completions',
        key: 'pk_bJav4nbMa2fZGkqG',
        model: 'openai',
    };

    // Detectar se é um dispositivo móvel
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Estado global do script
    const STATE = {
        isActive: true,
        capturedLoginData: null,
        isToastifyLoaded: false,
        logMessages: [],
        logModal: null,
        notificationContainer: null,
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
            sounds: false,
            autoPanel: true,
            autoRefresh: true
        },
        notifications: [],
        apiMonitor: {
            status: 'online',
            lastCheck: Date.now(),
            changes: []
        },
        progress: {
            current: 0,
            total: 0,
            message: '',
            visible: false
        }
    };

    // Carregar configurações do LocalStorage
    function loadSettings() {
        try {
            const saved = localStorage.getItem('hck_tarefas_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                STATE.settings = { ...STATE.settings, ...parsed };
            }
        } catch (e) {
            console.warn('[HCK TAREFAS] Erro ao carregar configurações:', e);
        }
    }

    // Salvar configurações no LocalStorage
    function saveSettings() {
        try {
            localStorage.setItem('hck_tarefas_settings', JSON.stringify(STATE.settings));
        } catch (e) {
            console.warn('[HCK TAREFAS] Erro ao salvar configurações:', e);
        }
    }

    // Carregar histórico do LocalStorage
    function loadHistory() {
        try {
            const saved = localStorage.getItem('hck_tarefas_history');
            if (saved) {
                const parsed = JSON.parse(saved);
                STATE.activityHistory = parsed.activityHistory || [];
                STATE.correctedTasks = parsed.correctedTasks || [];
                STATE.stats = { ...STATE.stats, ...parsed.stats };
                STATE.notifications = parsed.notifications || [];
            }
        } catch (e) {
            console.warn('[HCK TAREFAS] Erro ao carregar histórico:', e);
        }
    }

    // Salvar histórico no LocalStorage
    function saveHistory() {
        try {
            localStorage.setItem('hck_tarefas_history', JSON.stringify({
                activityHistory: STATE.activityHistory,
                correctedTasks: STATE.correctedTasks,
                stats: STATE.stats,
                notifications: STATE.notifications
            }));
        } catch (e) {
            console.warn('[HCK TAREFAS] Erro ao salvar histórico:', e);
        }
    }

    // Adicionar notificação
    function addNotification(type, title, message, data = null) {
        const notification = {
            id: Date.now(),
            type, // 'info', 'success', 'warning', 'error'
            title,
            message,
            data,
            timestamp: new Date().toISOString(),
            read: false
        };
        STATE.notifications.unshift(notification);
        if (STATE.notifications.length > 100) {
            STATE.notifications.pop();
        }
        saveHistory();
        updateNotificationsUI();
        return notification;
    }

    // Funções de progresso
    function updateProgress(current, total, message) {
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

    function injectToastStyles() {
        const styleId = 'hck-tarefas-toast-styles';
        if (document.getElementById(styleId)) return;

        const css = `
          @keyframes toastProgress {
            from { width: 100%; }
            to { width: 0%; }
          }
          .hck-tarefas-toast-with-progress {
            position: relative;
            overflow: hidden;
          }
          .hck-tarefas-toast-with-progress::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            width: 100%;
            background: ${TOAST_TEXT_COLOR};
            opacity: 0.8;
            animation: toastProgress linear forwards;
            animation-duration: var(--toast-duration, 3000ms);
          }
        `;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
    }

    function sendToast(text, duration = 3000, gravity = 'bottom') {
        if (!STATE.settings.notifications) return;
        
        try {
            const toastStyle = {
                background: TOAST_BACKGROUND_COLOR,
                fontSize: isMobile ? '12px' : '13.5px',
                fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
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
                gravity: gravity,
                position: "center",
                stopOnFocus: true,
                style: toastStyle,
            });

            if (toastInstance.toastElement) {
                toastInstance.toastElement.classList.add('hck-tarefas-toast-with-progress');
                toastInstance.toastElement.style.setProperty('--toast-duration', `${duration}ms`);
            }

            toastInstance.showToast();

        } catch (e) {
            console.error("Toastify Error:", e);
            alert(text);
        }
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = url;
            script.type = 'text/javascript';
            script.onload = resolve;
            script.onerror = () => {
                console.error(`Erro ao carregar script: ${url}`);
                reject(new Error(`Falha ao carregar ${url}`));
            };
            document.head.appendChild(script);
        });
    }

    async function loadCss(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`link[href="${url}"]`)) {
                resolve();
                return;
            }
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = url;
            link.onload = resolve;
            link.onerror = () => {
                console.error(`Erro ao carregar CSS: ${url}`);
                reject(new Error(`Falha ao carregar ${url}`));
            };
            document.head.appendChild(link);
        });
    }

    function logMessage(level, ...args) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const message = args.map(arg => { try { return typeof arg === 'object' ? JSON.stringify(arg) : String(arg); } catch { return '[Object]'; } }).join(' ');
        STATE.logMessages.push({ timestamp, level, message });
        if (STATE.logMessages.length > 300) { STATE.logMessages.shift(); }
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

        let novoJson = {
            accessed_on: jsonOriginal.accessed_on,
            executed_on: jsonOriginal.executed_on,
            answers: {}
        };

        for (let questionId in jsonOriginal.answers) {
            let questionData = jsonOriginal.answers[questionId];
            let taskQuestion = jsonOriginal.task.questions.find(q => q.id === parseInt(questionId));

            if (!taskQuestion) {
                continue;
            }

            let answerPayload = {
                question_id: questionData.question_id,
                question_type: taskQuestion.type,
                answer: null
            };

            try {
                switch (taskQuestion.type) {
                    case "order-sentences":
                        if (taskQuestion.options && taskQuestion.options.sentences && Array.isArray(taskQuestion.options.sentences)) {
                            answerPayload.answer = taskQuestion.options.sentences.map(sentence => sentence.value);
                        }
                        break;
                    case "fill-words":
                        if (taskQuestion.options && taskQuestion.options.phrase && Array.isArray(taskQuestion.options.phrase)) {
                            answerPayload.answer = taskQuestion.options.phrase
                                .map(item => item.value)
                                .filter((_, index) => index % 2 !== 0);
                        }
                        break;
                    case "text_ai":
                        let cleanedAnswer = removeHtmlTags(taskQuestion.comment || '');
                        answerPayload.answer = { "0": cleanedAnswer };
                        break;
                    case "fill-letters":
                        if (taskQuestion.options && taskQuestion.options.answer !== undefined) {
                            answerPayload.answer = taskQuestion.options.answer;
                        }
                        break;
                    case "cloud":
                        if (taskQuestion.options && taskQuestion.options.ids && Array.isArray(taskQuestion.options.ids)) {
                            answerPayload.answer = taskQuestion.options.ids;
                        }
                        break;
                    default:
                        if (taskQuestion.options && typeof taskQuestion.options === 'object') {
                            answerPayload.answer = Object.fromEntries(
                                Object.keys(taskQuestion.options).map(optionId => {
                                    const optionData = taskQuestion.options[optionId];
                                    const answerValue = (optionData && optionData.answer !== undefined) ? optionData.answer : false;
                                    return [optionId, answerValue];
                                })
                            );
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
            const response = await fetch(url, { method: "GET", headers: headers });
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

            const response = await fetch(url, {
                method: "PUT",
                headers: headers,
                body: JSON.stringify(novasRespostasPayload)
            });

            if (!response.ok) {
                let errorBody = await response.text();
                console.error(`[HCK TAREFAS] Erro ${response.status} no PUT. URL: ${url}. Response Body:`, errorBody);
                try { errorBody = JSON.parse(errorBody); } catch (e) {}
                throw new Error(`Erro ${response.status} ao enviar respostas.`);
            }

            sendToast("Tarefa corrigida com sucesso!", 5000);
            STATE.stats.totalCorrected++;
            STATE.stats.totalProcessed++;
            
            STATE.correctedTasks.push({
                taskId,
                answerId,
                timestamp: new Date().toISOString(),
                status: 'success'
            });
            
            saveHistory();
            updateStatsDisplay();
            updateCorrectedTasksList();

            const oldTitle = document.title;
            document.title = `${SCRIPT_NAME} Fez a Boa!`;
            setTimeout(() => { document.title = oldTitle; }, 3000);

        } catch (error) {
            console.error("[HCK TAREFAS] Falha detalhada ao transformar ou enviar respostas corrigidas:", error);
            sendToast(`Erro na correção: ${error.message}`, 5000);
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
            updateStatsDisplay();
            updateCorrectedTasksList();
        }
    }

    // Função para buscar informações da atividade atual
    async function fetchCurrentActivity() {
        if (!STATE.capturedLoginData || !STATE.capturedLoginData.auth_token) {
            return null;
        }

        try {
            const headers = {
                "x-api-realm": "edusp",
                "x-api-platform": "webclient",
                "x-api-key": STATE.capturedLoginData.auth_token,
                "content-type": "application/json"
            };

            // Buscar atividades recentes
            const response = await fetch('https://edusp-api.ip.tv/tms/student/activities?limit=5', {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`Erro ${response.status} ao buscar atividades`);
            }

            const data = await response.json();
            if (data && data.items && data.items.length > 0) {
                const activity = data.items[0];
                STATE.currentActivity = {
                    id: activity.id,
                    title: activity.title,
                    discipline: activity.discipline_name || 'Não informada',
                    status: activity.status || 'unknown',
                    progress: activity.progress || 0,
                    questionsCount: activity.total_questions || 0,
                    questionsTypes: activity.questions_types || [],
                    estimatedTime: activity.estimated_time || 0,
                    dueDate: activity.due_date || null,
                    lastUpdated: new Date().toISOString()
                };

                // Atualizar histórico
                STATE.activityHistory.unshift({
                    ...STATE.currentActivity,
                    accessedAt: new Date().toISOString()
                });
                if (STATE.activityHistory.length > 50) {
                    STATE.activityHistory.pop();
                }
                saveHistory();
                updateActivityPanel();
                return STATE.currentActivity;
            }
            return null;
        } catch (error) {
            logMessage('ERROR', 'Erro ao buscar atividade atual:', error);
            return null;
        }
    }

    // Função para chat com IA
    async function askAI(prompt, context = null) {
        if (!STATE.settings.aiEnabled) {
            return "A IA está desativada nas configurações.";
        }

        try {
            const messages = [
                {
                    role: 'system',
                    content: `Você é um assistente educacional especializado em análise de atividades acadêmicas. 
                    Você recebe informações sobre atividades, questões, respostas e dados educacionais.
                    Seu objetivo é ajudar o usuário a entender melhor o conteúdo, explicar respostas, 
                    resumir matérias, identificar padrões e fornecer insights educacionais.
                    Seja claro, conciso e educativo em suas respostas.
                    Contexto atual: ${context || 'Nenhum contexto específico fornecido'}`
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

            if (!response.ok) {
                throw new Error(`Erro ${response.status} na API`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            logMessage('ERROR', 'Erro ao chamar IA:', error);
            return `Erro ao processar sua pergunta: ${error.message}`;
        }
    }

    // Função de diagnóstico
    function runDiagnostic() {
        const results = {
            token: !!STATE.capturedLoginData && !!STATE.capturedLoginData.auth_token,
            api: false,
            intercept: STATE.interceptEnabled,
            dependencies: STATE.isToastifyLoaded,
            ui: !!document.getElementById('hck-tarefas-ui-bookmarklet'),
            errors: []
        };

        // Verificar API
        if (STATE.capturedLoginData) {
            fetch('https://edusp-api.ip.tv/tms/student/activities?limit=1', {
                headers: {
                    "x-api-realm": "edusp",
                    "x-api-platform": "webclient",
                    "x-api-key": STATE.capturedLoginData.auth_token
                }
            }).then(res => {
                results.api = res.ok;
                if (!results.api) {
                    results.errors.push('API não respondeu corretamente');
                }
            }).catch(() => {
                results.api = false;
                results.errors.push('Falha na conexão com a API');
            });
        }

        // Verificar localStorage
        try {
            localStorage.setItem('hck_test', 'test');
            localStorage.removeItem('hck_test');
        } catch (e) {
            results.errors.push('LocalStorage indisponível');
        }

        // Verificar dependências
        if (typeof Toastify === 'undefined') {
            results.errors.push('Toastify não carregado');
        }

        return results;
    }

    // Monitoramento da API
    async function monitorAPI() {
        if (!STATE.capturedLoginData) return;

        try {
            const startTime = Date.now();
            const response = await fetch('https://edusp-api.ip.tv/tms/student/activities?limit=1', {
                headers: {
                    "x-api-realm": "edusp",
                    "x-api-platform": "webclient",
                    "x-api-key": STATE.capturedLoginData.auth_token
                }
            });
            const responseTime = Date.now() - startTime;

            const newStatus = response.ok ? 'online' : 'offline';
            if (newStatus !== STATE.apiMonitor.status) {
                STATE.apiMonitor.status = newStatus;
                STATE.apiMonitor.changes.push({
                    from: STATE.apiMonitor.status,
                    to: newStatus,
                    timestamp: new Date().toISOString()
                });
                if (STATE.apiMonitor.changes.length > 20) {
                    STATE.apiMonitor.changes.shift();
                }
                
                if (newStatus === 'offline') {
                    addNotification('error', 'API Offline', 'A API está indisponível. Verifique sua conexão.');
                } else {
                    addNotification('info', 'API Online', 'A API está funcionando normalmente.');
                }
            }

            STATE.apiMonitor.lastCheck = Date.now();
            STATE.apiMonitor.responseTime = responseTime;

            // Alertar se API estiver lenta
            if (responseTime > 3000) {
                addNotification('warning', 'API Lenta', `Tempo de resposta: ${responseTime}ms`);
            }

            // Verificar mudanças na estrutura
            if (response.ok) {
                const data = await response.json();
                const currentStructure = JSON.stringify(Object.keys(data));
                if (STATE.apiMonitor.lastStructure && STATE.apiMonitor.lastStructure !== currentStructure) {
                    addNotification('warning', 'Mudança na API', 'A estrutura da API foi alterada. Algumas funções podem ser afetadas.');
                }
                STATE.apiMonitor.lastStructure = currentStructure;
            }
        } catch (error) {
            logMessage('ERROR', 'Erro no monitoramento da API:', error);
        }
    }

    // Função para exportar logs
    function exportLogs() {
        let content = `=== ${SCRIPT_NAME} - Relatório de Logs ===\n`;
        content += `Versão: ${SCRIPT_VERSION}\n`;
        content += `Data: ${new Date().toISOString()}\n`;
        content += `Sessão iniciada em: ${new Date(STATE.stats.sessionStart).toISOString()}\n`;
        content += `\n=== Estatísticas ===\n`;
        content += `Total processadas: ${STATE.stats.totalProcessed}\n`;
        content += `Total corrigidas: ${STATE.stats.totalCorrected}\n`;
        content += `Total falhas: ${STATE.stats.totalFailed}\n`;
        content += `Tempo médio de processamento: ${STATE.stats.avgProcessingTime || 0}ms\n`;
        content += `\n=== Configurações ===\n`;
        content += JSON.stringify(STATE.settings, null, 2);
        content += `\n\n=== Logs ===\n`;
        STATE.logMessages.forEach(log => {
            content += `[${log.timestamp} ${log.level}] ${log.message}\n`;
        });
        content += `\n=== Histórico de Atividades ===\n`;
        STATE.activityHistory.slice(0, 20).forEach(activity => {
            content += `${activity.title} - ${activity.discipline} - ${activity.status}\n`;
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hck_tarefas_logs_${new Date().toISOString().slice(0,10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        sendToast('Logs exportados com sucesso!');
        addNotification('success', 'Logs Exportados', 'Arquivo de logs gerado com sucesso.');
    }

    // Configurar UI - Versão aprimorada com todas as novas funcionalidades
    function setupUI() {
        logMessage('INFO','Configurando UI para HCK TAREFAS...');
        try {
            const fontLink = document.createElement('link'); 
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'; 
            fontLink.rel = 'stylesheet'; 
            document.head.appendChild(fontLink);
        } catch (e) {
            logMessage('WARN', 'Falha ao injetar Google Font (CSP?). Usando fontes do sistema.');
        }
        
        const estilo = { 
            cores: { 
                fundo: '#1C1C1E', 
                fundoSecundario: '#2C2C2E', 
                fundoTerciario: '#3A3A3C', 
                texto: '#F5F5F7', 
                textoSecundario: '#8A8A8E', 
                accent: '#FFFFFF', 
                accentBg: '#007AFF', 
                secondaryAccent: '#E5E5EA', 
                secondaryAccentBg: '#3A3A3C', 
                erro: '#FF453A', 
                sucesso: '#32D74B', 
                warn: '#FFD60A', 
                info: '#0A84FF', 
                logDebug: '#636366', 
                borda: '#38383A', 
                notificationBg: 'rgba(44, 44, 46, 0.85)', 
                copyBtnBg: '#555555' 
            }, 
            sombras: { 
                menu: '0 10px 35px rgba(0, 0, 0, 0.3)', 
                botao: '0 2px 4px rgba(0, 0, 0, 0.2)', 
                notification: '0 5px 20px rgba(0, 0, 0, 0.3)' 
            }, 
            radius: '14px', 
            radiusSmall: '8px' 
        };
        
        const getResponsiveSize = () => ({ 
            menuWidth: isMobile ? '92vw' : (window.innerWidth < 768 ? '320px' : '380px'), 
            fontSize: isMobile ? '12px' : (window.innerWidth < 768 ? '13px' : '14px'), 
            buttonPadding: isMobile ? '8px 10px' : '9px 10px', 
            titleSize: isMobile ? '15px' : '16px' 
        });
        
        const container = document.createElement('div'); 
        container.id = 'hck-tarefas-ui-bookmarklet';
        container.style.cssText = `position: fixed; bottom: ${isMobile ? '60px' : '12px'}; right: ${isMobile ? '5px' : '12px'}; z-index: 10000; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; line-height: 1.4;`;
        
        const toggleBtn = document.createElement('button'); 
        toggleBtn.id = 'hck-tarefas-toggle-btn'; 
        toggleBtn.textContent = '📚 TAREFAS'; 
        toggleBtn.style.cssText = `background: ${estilo.cores.fundoSecundario}; color: ${estilo.cores.textoSecundario}; padding: ${isMobile ? '6px 12px' : '8px 18px'}; border: 1px solid ${estilo.cores.borda}; border-radius: 22px; cursor: pointer; font-weight: 600; font-size: ${isMobile ? '12px' : '15px'}; box-shadow: ${estilo.sombras.botao}; display: block; transition: all 0.35s ease-out; width: auto; min-width: ${isMobile ? '60px' : '70px'}; text-align: center;`;
        
        const sizes = getResponsiveSize();
        const menu = document.createElement('div'); 
        menu.id = 'hck-tarefas-menu'; 
        menu.style.cssText = `background: ${estilo.cores.fundo}; width: ${sizes.menuWidth}; padding: 10px; border-radius: ${estilo.radius}; box-shadow: ${estilo.sombras.menu}; display: none; flex-direction: column; gap: 8px; border: 1px solid ${estilo.cores.borda}; opacity: 0; transform: translateY(15px) scale(0.95); transition: opacity 0.35s ease-out, transform 0.35s ease-out; position: fixed; bottom: ${isMobile ? '70px' : '70px'}; right: ${isMobile ? '5px' : '12px'}; max-height: ${isMobile ? '85vh' : '85vh'}; overflow-y: auto; scrollbar-width: none;`;
        
        // Adicionando estilo para scrollbar do menu
        const style = document.createElement('style');
        style.textContent = `#hck-tarefas-menu::-webkit-scrollbar { display: none; }`;
        document.head.appendChild(style);
        
        const header = document.createElement('div'); 
        header.style.cssText = `display: flex; align-items: center; justify-content: center; position: relative; width: 100%; margin-bottom: 4px;`;
        
        const title = document.createElement('div'); 
        title.textContent = `${SCRIPT_NAME} v${SCRIPT_VERSION}`; 
        title.style.cssText = `font-size: ${sizes.titleSize}; font-weight: 600; text-align: center; flex-grow: 1; color: ${estilo.cores.texto};`;
        
        const closeBtn = document.createElement('button'); 
        closeBtn.innerHTML = '×'; 
        closeBtn.setAttribute('aria-label', 'Fechar Menu'); 
        closeBtn.style.cssText = `position: absolute; top: -4px; right: -4px; background: ${estilo.cores.fundoSecundario}; border: none; color: ${estilo.cores.textoSecundario}; font-size: 18px; font-weight: 600; cursor: pointer; padding: 0; line-height: 1; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;`;
        
        header.append(title, closeBtn);
        
        // Tabs
        const tabsContainer = document.createElement('div');
        tabsContainer.style.cssText = `display: flex; gap: 4px; margin-bottom: 8px; border-bottom: 1px solid ${estilo.cores.borda}; padding-bottom: 4px;`;
        
        const tabs = ['📊 Painel', '🤖 IA', '⚙️ Config', '📈 Stats', '🔔 Notif'];
        let activeTab = '📊 Painel';
        
        const tabButtons = tabs.map(tabText => {
            const btn = document.createElement('button');
            btn.textContent = tabText;
            btn.style.cssText = `flex: 1; padding: 4px 0; background: ${tabText === activeTab ? estilo.cores.accentBg : 'transparent'}; color: ${tabText === activeTab ? estilo.cores.accent : estilo.cores.textoSecundario}; border: none; border-radius: ${estilo.radiusSmall}; font-size: ${isMobile ? '10px' : '11px'}; font-weight: 500; cursor: pointer; transition: all 0.2s ease;`;
            btn.dataset.tab = tabText;
            return btn;
        });
        
        tabButtons.forEach(btn => tabsContainer.appendChild(btn));
        
        // Tab content container
        const tabContent = document.createElement('div');
        tabContent.id = 'hck-tab-content';
        tabContent.style.cssText = `flex: 1; overflow-y: auto; max-height: ${isMobile ? '400px' : '450px'};`;
        
        // Painel de Atividade
        const activityPanel = document.createElement('div');
        activityPanel.id = 'hck-activity-panel';
        activityPanel.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; margin-bottom: 8px;`;
        activityPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-size: 11px; font-weight: 600; color: ${estilo.cores.textoSecundario};">📚 Atividade Atual</span>
                <span id="activity-status" style="font-size: 10px; padding: 2px 8px; border-radius: 10px; background: ${estilo.cores.fundoTerciario}; color: ${estilo.cores.textoSecundario};">Aguardando...</span>
            </div>
            <div id="activity-content" style="font-size: 12px; color: ${estilo.cores.texto};">
                <div style="margin-bottom: 2px;"><strong id="activity-title">Nenhuma atividade detectada</strong></div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 11px; color: ${estilo.cores.textoSecundario};">
                    <span id="activity-discipline">-</span>
                    <span id="activity-questions">0 questões</span>
                    <span id="activity-progress">Progresso: 0%</span>
                </div>
                <div id="activity-types" style="margin-top: 4px; font-size: 10px; color: ${estilo.cores.textoSecundario};"></div>
            </div>
        `;
        
        // IA Chat
        const chatPanel = document.createElement('div');
        chatPanel.id = 'hck-chat-panel';
        chatPanel.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; display: none; flex-direction: column; gap: 6px; max-height: 350px;`;
        chatPanel.innerHTML = `
            <div id="chat-messages" style="flex: 1; overflow-y: auto; max-height: 280px; font-size: 12px; color: ${estilo.cores.texto}; padding: 4px; background: ${estilo.cores.fundo}; border-radius: ${estilo.radiusSmall}; min-height: 100px;">
                <div style="text-align: center; color: ${estilo.cores.textoSecundario}; padding: 20px 0;">Pergunte algo sobre a atividade atual</div>
            </div>
            <div style="display: flex; gap: 4px;">
                <input id="chat-input" type="text" placeholder="Digite sua pergunta..." style="flex: 1; padding: 6px 8px; border-radius: ${estilo.radiusSmall}; border: 1px solid ${estilo.cores.borda}; background: ${estilo.cores.fundo}; color: ${estilo.cores.texto}; font-size: 12px;">
                <button id="chat-send" style="padding: 6px 12px; background: ${estilo.cores.accentBg}; color: ${estilo.cores.accent}; border: none; border-radius: ${estilo.radiusSmall}; cursor: pointer; font-size: 12px;">Enviar</button>
            </div>
        `;
        
        // Configurações
        const settingsPanel = document.createElement('div');
        settingsPanel.id = 'hck-settings-panel';
        settingsPanel.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; display: none;`;
        
        const settingsList = [
            { id: 'notifications', label: '🔔 Notificações', default: true },
            { id: 'aiEnabled', label: '🤖 IA Integrada', default: true },
            { id: 'autoCorrect', label: '🔄 Correção Automática', default: true },
            { id: 'sounds', label: '🔊 Sons', default: false },
            { id: 'autoPanel', label: '📋 Painel Automático', default: true },
            { id: 'autoRefresh', label: '🔄 Atualização Automática', default: true }
        ];
        
        let settingsHTML = '<div style="font-size: 12px; font-weight: 600; color: ${estilo.cores.textoSecundario}; margin-bottom: 6px;">⚙️ Configurações</div>';
        settingsList.forEach(setting => {
            const isChecked = STATE.settings[setting.id] !== undefined ? STATE.settings[setting.id] : setting.default;
            settingsHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid ${estilo.cores.borda};">
                    <span style="font-size: 12px; color: ${estilo.cores.texto};">${setting.label}</span>
                    <label style="position: relative; display: inline-block; width: 40px; height: 22px;">
                        <input type="checkbox" id="setting-${setting.id}" ${isChecked ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
                        <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: ${isChecked ? estilo.cores.accentBg : estilo.cores.fundoTerciario}; transition: .3s; border-radius: 22px;"></span>
                        <span style="position: absolute; content: ''; height: 16px; width: 16px; left: 3px; bottom: 3px; background: ${estilo.cores.accent}; transition: .3s; border-radius: 50%; transform: ${isChecked ? 'translateX(18px)' : 'none'};"></span>
                    </label>
                </div>
            `;
        });
        settingsPanel.innerHTML = settingsHTML;
        
        // Stats avançados
        const statsPanel = document.createElement('div');
        statsPanel.id = 'hck-stats-panel';
        statsPanel.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; display: none;`;
        statsPanel.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
                <div><span style="color: ${estilo.cores.textoSecundario};">Processadas:</span> <span id="stat-total">0</span></div>
                <div><span style="color: ${estilo.cores.textoSecundario};">Corrigidas:</span> <span id="stat-corrected" style="color: ${estilo.cores.sucesso};">0</span></div>
                <div><span style="color: ${estilo.cores.textoSecundario};">Falhas:</span> <span id="stat-failed" style="color: ${estilo.cores.erro};">0</span></div>
                <div><span style="color: ${estilo.cores.textoSecundario};">Tempo médio:</span> <span id="stat-avgtime">0ms</span></div>
                <div><span style="color: ${estilo.cores.textoSecundario};">Sessão:</span> <span id="stat-session">0m</span></div>
                <div><span style="color: ${estilo.cores.textoSecundario};">Atividades:</span> <span id="stat-activities">0</span></div>
            </div>
            <div style="margin-top: 4px; font-size: 10px; color: ${estilo.cores.textoSecundario};">
                <strong>Últimas atividades:</strong>
                <div id="recent-activities" style="margin-top: 2px;"></div>
            </div>
        `;
        
        // Notificações
        const notificationsPanel = document.createElement('div');
        notificationsPanel.id = 'hck-notifications-panel';
        notificationsPanel.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; display: none; max-height: 300px; overflow-y: auto;`;
        notificationsPanel.innerHTML = `
            <div style="font-size: 12px; font-weight: 600; color: ${estilo.cores.textoSecundario}; margin-bottom: 6px;">🔔 Histórico de Notificações</div>
            <div id="notifications-list" style="font-size: 11px; color: ${estilo.cores.texto};"></div>
        `;
        
        // Adicionar painéis ao tabContent
        tabContent.appendChild(activityPanel);
        tabContent.appendChild(chatPanel);
        tabContent.appendChild(settingsPanel);
        tabContent.appendChild(statsPanel);
        tabContent.appendChild(notificationsPanel);
        
        // Barra de Progresso
        const progressContainer = document.createElement('div');
        progressContainer.id = 'hck-progress-container';
        progressContainer.style.cssText = `display: none; background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 6px 8px; margin-bottom: 6px;`;
        progressContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: ${estilo.cores.textoSecundario}; margin-bottom: 2px;">
                <span id="progress-message">Processando...</span>
                <span id="progress-percent">0%</span>
            </div>
            <div style="width: 100%; height: 4px; background: ${estilo.cores.fundoTerciario}; border-radius: 2px; overflow: hidden;">
                <div id="progress-bar" style="height: 100%; width: 0%; background: ${estilo.cores.accentBg}; transition: width 0.3s ease;"></div>
            </div>
        `;
        
        // Status Section
        const statusSection = document.createElement('div');
        statusSection.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; margin-bottom: 8px;`;
        
        const statusTitle = document.createElement('div');
        statusTitle.textContent = 'Status';
        statusTitle.style.cssText = `font-size: 11px; font-weight: 600; color: ${estilo.cores.textoSecundario}; margin-bottom: 4px;`;
        
        const statusContent = document.createElement('div');
        statusContent.id = 'status-content';
        statusContent.style.cssText = `font-size: ${sizes.fontSize}; color: ${estilo.cores.texto};`;
        statusContent.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Script:</span><span id="script-status" style="color: ${STATE.isActive ? estilo.cores.sucesso : estilo.cores.erro};">${STATE.isActive ? '✅ Ativo' : '❌ Inativo'}</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Interceptação:</span><span id="intercept-status" style="color: ${STATE.interceptEnabled ? estilo.cores.sucesso : estilo.cores.erro};">${STATE.interceptEnabled ? '✅ Ativa' : '❌ Inativa'}</span></div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Token:</span><span id="token-status" style="color: ${STATE.capturedLoginData ? estilo.cores.sucesso : estilo.cores.warn};">${STATE.capturedLoginData ? '✅ Capturado' : '⏳ Aguardando'}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>API:</span><span id="api-status" style="color: ${estilo.cores.sucesso};">✅ Online</span></div>
        `;
        
        statusSection.append(statusTitle, statusContent);
        
        // Buttons
        const buttonBaseStyle = `width: 100%; padding: ${sizes.buttonPadding}; border: none; border-radius: ${estilo.radiusSmall}; cursor: pointer; font-size: ${sizes.fontSize}; font-weight: 500; margin-bottom: 0; display: flex; align-items: center; justify-content: center; gap: 6px; transition: opacity 0.2s ease, background-color 0.2s ease, color 0.2s ease;`;
        const buttonPrimaryStyle = `${buttonBaseStyle} background: ${estilo.cores.accentBg}; color: ${estilo.cores.accent};`;
        const buttonSecondaryStyle = `${buttonBaseStyle} background: ${estilo.cores.secondaryAccentBg}; color: ${estilo.cores.secondaryAccent}; border: 1px solid ${estilo.cores.borda};`;
        const buttonDangerStyle = `${buttonBaseStyle} background: ${estilo.cores.erro}; color: ${estilo.cores.accent};`;
        
        // Adicionando estilos
        const style4 = document.createElement('style');
        style4.textContent = `
            .hck-tarefas-btn-primary:hover { opacity: 0.85; }
            .hck-tarefas-btn-primary:disabled { background-color: ${estilo.cores.fundoSecundario}; color: ${estilo.cores.textoSecundario}; opacity: 0.6; cursor: not-allowed; }
            .hck-tarefas-btn-secondary:hover { background: ${estilo.cores.fundoTerciario}; opacity: 1; }
            .hck-tarefas-btn-danger:hover { opacity: 0.85; }
        `;
        document.head.appendChild(style4);
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `display: grid; grid-template-columns: 1fr 1fr; gap: 4px;`;
        
        const toggleInterceptBtn = document.createElement('button'); 
        toggleInterceptBtn.textContent = `${STATE.interceptEnabled ? '⏸️ Desativar' : '▶️ Ativar'} Interceptação`; 
        toggleInterceptBtn.className = 'hck-tarefas-btn-primary';
        toggleInterceptBtn.style.cssText = buttonPrimaryStyle;
        
        const clearDataBtn = document.createElement('button'); 
        clearDataBtn.textContent = '🧹 Limpar Dados'; 
        clearDataBtn.className = 'hck-tarefas-btn-secondary';
        clearDataBtn.style.cssText = buttonSecondaryStyle;
        
        const diagnosticBtn = document.createElement('button'); 
        diagnosticBtn.textContent = '🩺 Diagnóstico'; 
        diagnosticBtn.className = 'hck-tarefas-btn-secondary';
        diagnosticBtn.style.cssText = buttonSecondaryStyle;
        
        const exportLogsBtn = document.createElement('button'); 
        exportLogsBtn.textContent = '📤 Exportar Logs'; 
        exportLogsBtn.className = 'hck-tarefas-btn-secondary';
        exportLogsBtn.style.cssText = buttonSecondaryStyle;
        
        const refreshBtn = document.createElement('button'); 
        refreshBtn.textContent = '🔄 Atualizar'; 
        refreshBtn.className = 'hck-tarefas-btn-primary';
        refreshBtn.style.cssText = buttonPrimaryStyle;
        
        buttonContainer.append(toggleInterceptBtn, clearDataBtn, diagnosticBtn, exportLogsBtn, refreshBtn);
        
        // Credits
        const credits = document.createElement('div');
        credits.innerHTML = `<span style="font-weight: 600; letter-spacing: 0.5px;">v${SCRIPT_VERSION}</span> <span style="margin: 0 4px;">|</span> <span style="opacity: 0.7;">by Hackermoon</span>`;
        credits.style.cssText = `text-align: center; font-size: 10px; font-weight: 500; color: ${estilo.cores.textoSecundario}; margin-top: 6px; padding-top: 6px; border-top: 1px solid ${estilo.cores.borda}; opacity: 0.9;`;
        
        const notificationContainer = document.createElement('div'); 
        notificationContainer.id = 'hck-tarefas-notifications'; 
        notificationContainer.style.cssText = `position: fixed; bottom: ${isMobile ? '10px' : '15px'}; left: 50%; transform: translateX(-50%); z-index: 10002; display: flex; flex-direction: column; align-items: center; gap: 10px; width: auto; max-width: 90%;`;
        
        STATE.notificationContainer = notificationContainer;
        menu.append(header, tabsContainer, tabContent, progressContainer, statusSection, buttonContainer, credits);
        container.append(menu, toggleBtn);
        document.body.appendChild(container); 
        document.body.appendChild(notificationContainer);
        logMessage('INFO', 'Elementos da UI adicionados à página.');

        // Funções para atualizar a UI
        function updateStatusDisplay() {
            const scriptStatus = document.getElementById('script-status');
            const interceptStatus = document.getElementById('intercept-status');
            const tokenStatus = document.getElementById('token-status');
            const apiStatus = document.getElementById('api-status');
            
            if (scriptStatus) {
                scriptStatus.textContent = STATE.isActive ? '✅ Ativo' : '❌ Inativo';
                scriptStatus.style.color = STATE.isActive ? estilo.cores.sucesso : estilo.cores.erro;
            }
            
            if (interceptStatus) {
                interceptStatus.textContent = STATE.interceptEnabled ? '✅ Ativa' : '❌ Inativa';
                interceptStatus.style.color = STATE.interceptEnabled ? estilo.cores.sucesso : estilo.cores.erro;
            }
            
            if (tokenStatus) {
                tokenStatus.textContent = STATE.capturedLoginData ? '✅ Capturado' : '⏳ Aguardando';
                tokenStatus.style.color = STATE.capturedLoginData ? estilo.cores.sucesso : estilo.cores.warn;
            }
            
            if (apiStatus) {
                apiStatus.textContent = STATE.apiMonitor.status === 'online' ? '✅ Online' : '❌ Offline';
                apiStatus.style.color = STATE.apiMonitor.status === 'online' ? estilo.cores.sucesso : estilo.cores.erro;
            }
        }
        
        function updateStatsDisplay() {
            const totalEl = document.getElementById('stat-total');
            const correctedEl = document.getElementById('stat-corrected');
            const failedEl = document.getElementById('stat-failed');
            const avgTimeEl = document.getElementById('stat-avgtime');
            const sessionEl = document.getElementById('stat-session');
            const activitiesEl = document.getElementById('stat-activities');
            
            if (totalEl) totalEl.textContent = STATE.stats.totalProcessed || 0;
            if (correctedEl) correctedEl.textContent = STATE.stats.totalCorrected || 0;
            if (failedEl) failedEl.textContent = STATE.stats.totalFailed || 0;
            if (avgTimeEl) avgTimeEl.textContent = STATE.stats.avgProcessingTime ? `${STATE.stats.avgProcessingTime}ms` : '0ms';
            
            if (sessionEl) {
                const elapsed = Math.floor((Date.now() - STATE.stats.sessionStart) / 60000);
                sessionEl.textContent = elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed / 60)}h${elapsed % 60}m`;
            }
            
            if (activitiesEl) activitiesEl.textContent = STATE.activityHistory.length;
            
            // Atualizar atividades recentes
            const recentEl = document.getElementById('recent-activities');
            if (recentEl) {
                recentEl.innerHTML = STATE.activityHistory.slice(0, 3).map(a => 
                    `<div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 10px;">
                        <span>${a.title || 'Sem título'}</span>
                        <span style="color: ${estilo.cores.textoSecundario};">${a.status || 'unknown'}</span>
                    </div>`
                ).join('');
            }
            
            // Atualizar estatísticas do painel principal
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
                const statusText = task.status === 'success' ? '✅ Sucesso' : '❌ Falha';
                return `<div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;"><span>Tarefa ${task.taskId}</span><span style="color: ${statusColor};">${statusText} (${time})</span></div>`;
            }).join('');
        }
        
        function updateNotificationsUI() {
            const list = document.getElementById('notifications-list');
            if (!list) return;
            
            if (STATE.notifications.length === 0) {
                list.innerHTML = '<div style="text-align: center; color: ${estilo.cores.textoSecundario}; padding: 10px;">Nenhuma notificação</div>';
                return;
            }
            
            list.innerHTML = STATE.notifications.slice(0, 20).map(n => {
                const colors = {
                    info: estilo.cores.info,
                    success: estilo.cores.sucesso,
                    warning: estilo.cores.warn,
                    error: estilo.cores.erro
                };
                const color = colors[n.type] || estilo.cores.textoSecundario;
                const time = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `<div style="padding: 4px 0; border-bottom: 1px solid ${estilo.cores.borda};">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: ${color}; font-weight: 500;">${n.title}</span>
                        <span style="color: ${estilo.cores.textoSecundario}; font-size: 10px;">${time}</span>
                    </div>
                    <div style="font-size: 11px; color: ${estilo.cores.textoSecundario};">${n.message}</div>
                </div>`;
            }).join('');
        }
        
        function updateActivityPanel(activity) {
            const titleEl = document.getElementById('activity-title');
            const disciplineEl = document.getElementById('activity-discipline');
            const questionsEl = document.getElementById('activity-questions');
            const progressEl = document.getElementById('activity-progress');
            const statusEl = document.getElementById('activity-status');
            const typesEl = document.getElementById('activity-types');
            
            if (!activity) {
                if (titleEl) titleEl.textContent = 'Nenhuma atividade detectada';
                if (disciplineEl) disciplineEl.textContent = '-';
                if (questionsEl) questionsEl.textContent = '0 questões';
                if (progressEl) progressEl.textContent = 'Progresso: 0%';
                if (statusEl) {
                    statusEl.textContent = '⏳ Aguardando';
                    statusEl.style.background = estilo.cores.fundoTerciario;
                }
                if (typesEl) typesEl.textContent = '';
                return;
            }
            
            if (titleEl) titleEl.textContent = activity.title || 'Atividade sem título';
            if (disciplineEl) disciplineEl.textContent = activity.discipline || 'Disciplina não informada';
            if (questionsEl) questionsEl.textContent = `${activity.questionsCount || 0} questões`;
            if (progressEl) progressEl.textContent = `Progresso: ${activity.progress || 0}%`;
            
            if (statusEl) {
                const statusMap = {
                    'pending': '⏳ Pendente',
                    'in_progress': '🔄 Em andamento',
                    'completed': '✅ Concluída',
                    'expired': '⏰ Expirada',
                    'unknown': '📌 Status desconhecido'
                };
                statusEl.textContent = statusMap[activity.status] || activity.status || '📌 Desconhecido';
                statusEl.style.background = activity.status === 'completed' ? estilo.cores.sucesso : 
                                           activity.status === 'in_progress' ? estilo.cores.info : 
                                           estilo.cores.fundoTerciario;
                statusEl.style.color = activity.status === 'completed' ? estilo.cores.fundo : 
                                      activity.status === 'in_progress' ? estilo.cores.fundo : 
                                      estilo.cores.texto;
            }
            
            if (typesEl) {
                if (activity.questionsTypes && activity.questionsTypes.length > 0) {
                    typesEl.textContent = `📝 ${activity.questionsTypes.join(' • ')}`;
                } else {
                    typesEl.textContent = 'Tipos não especificados';
                }
            }
        }
        
        function updateProgressUI() {
            const container = document.getElementById('hck-progress-container');
            const bar = document.getElementById('progress-bar');
            const message = document.getElementById('progress-message');
            const percent = document.getElementById('progress-percent');
            
            if (!container) return;
            
            if (STATE.progress.visible) {
                container.style.display = 'block';
                const pct = STATE.progress.total > 0 ? Math.round((STATE.progress.current / STATE.progress.total) * 100) : 0;
                if (bar) bar.style.width = `${pct}%`;
                if (message) message.textContent = STATE.progress.message || 'Processando...';
                if (percent) percent.textContent = `${pct}%`;
            } else {
                container.style.display = 'none';
                if (bar) bar.style.width = '0%';
            }
        }
        
        // Expondo funções globalmente
        window.updateStatusDisplay = updateStatusDisplay;
        window.updateStatsDisplay = updateStatsDisplay;
        window.updateCorrectedTasksList = updateCorrectedTasksList;
        window.updateActivityPanel = updateActivityPanel;
        window.updateNotificationsUI = updateNotificationsUI;
        window.updateProgressUI = updateProgressUI;

        // Menu toggle
        const toggleMenu = (show) => { 
            const duration = 350; 
            if (show) { 
                logMessage('DEBUG', 'Mostrando menu...'); 
                menu.style.display = 'flex'; 
                toggleBtn.style.opacity = '0'; 
                toggleBtn.style.transform = 'scale(0.8) translateY(10px)'; 
                setTimeout(() => { 
                    menu.style.opacity = '1'; 
                    menu.style.transform = 'translateY(0) scale(1)'; 
                    toggleBtn.style.display = 'none'; 
                }, 10); 
            } else { 
                logMessage('DEBUG', 'Escondendo menu...'); 
                menu.style.opacity = '0'; 
                menu.style.transform = 'translateY(15px) scale(0.95)'; 
                setTimeout(() => { 
                    menu.style.display = 'none'; 
                    toggleBtn.style.display = 'block'; 
                    requestAnimationFrame(() => { 
                        toggleBtn.style.opacity = '1'; 
                        toggleBtn.style.transform = 'scale(1) translateY(0)'; 
                    }); 
                }, duration); 
            } 
        };
        
        // Adicionar eventos de toque para dispositivos móveis
        const addTouchEvent = (element, callback) => {
            element.addEventListener('click', callback);
            if (isMobile) {
                element.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    callback();
                });
            }
        };
        
        addTouchEvent(toggleBtn, () => toggleMenu(true)); 
        addTouchEvent(closeBtn, () => toggleMenu(false));
        
        // Logs modal (mantido para compatibilidade)
        const hideLogs = () => { 
            if (STATE.logModal) { 
                STATE.logModal.style.display = 'none'; 
                logMessage('DEBUG', 'Escondendo logs.'); 
            } 
        };
        
        document.addEventListener('keydown', (e) => { 
            if (e.key === 'Escape') { 
                if (menu.style.display === 'flex') toggleMenu(false); 
                if (STATE.logModal?.style.display !== 'none') hideLogs(); 
            } 
        });
        
        window.addEventListener('resize', () => { 
            const s = getResponsiveSize(); 
            menu.style.width = s.menuWidth; 
            [toggleInterceptBtn, clearDataBtn, diagnosticBtn, exportLogsBtn, refreshBtn].forEach(b => { 
                if (b) {
                    b.style.fontSize = s.fontSize; 
                    b.style.padding = s.buttonPadding; 
                }
            }); 
            title.style.fontSize = s.titleSize; 
        });

        // Eventos dos botões
        addTouchEvent(toggleInterceptBtn, () => {
            STATE.interceptEnabled = !STATE.interceptEnabled;
            toggleInterceptBtn.textContent = STATE.interceptEnabled ? '⏸️ Desativar Interceptação' : '▶️ Ativar Interceptação';
            updateStatusDisplay();
            sendToast(`Interceptação ${STATE.interceptEnabled ? 'ativada' : 'desativada'}`, 3000);
            addNotification('info', 'Interceptação', `Interceptação ${STATE.interceptEnabled ? 'ativada' : 'desativada'}`);
        });
        
        addTouchEvent(clearDataBtn, () => {
            if (confirm('Tem certeza que deseja limpar todos os dados?')) {
                STATE.correctedTasks = [];
                STATE.activityHistory = [];
                STATE.notifications = [];
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
                updateStatsDisplay();
                updateCorrectedTasksList();
                updateNotificationsUI();
                sendToast('Dados limpos com sucesso', 3000);
                addNotification('success', 'Dados Limpos', 'Todos os dados foram limpos.');
            }
        });
        
        addTouchEvent(diagnosticBtn, async () => {
            sendToast('Executando diagnóstico...', 2000);
            const results = runDiagnostic();
            let message = '🔍 Diagnóstico:\n';
            message += `Token: ${results.token ? '✅' : '❌'}\n`;
            message += `API: ${results.api ? '✅' : '❌'}\n`;
            message += `Interceptação: ${results.intercept ? '✅' : '❌'}\n`;
            message += `Dependências: ${results.dependencies ? '✅' : '❌'}\n`;
            message += `UI: ${results.ui ? '✅' : '❌'}\n`;
            if (results.errors.length > 0) {
                message += `\n⚠️ Erros encontrados:\n${results.errors.map(e => `- ${e}`).join('\n')}`;
            }
            alert(message);
            addNotification('info', 'Diagnóstico', `Diagnóstico concluído. ${results.errors.length > 0 ? `${results.errors.length} problemas encontrados.` : 'Tudo funcionando!'}`);
        });
        
        addTouchEvent(exportLogsBtn, exportLogs);
        
        addTouchEvent(refreshBtn, async () => {
            sendToast('Atualizando informações...', 2000);
            updateProgress(0, 1, 'Atualizando atividade...');
            await fetchCurrentActivity();
            updateProgress(1, 1, 'Atualizado!');
            setTimeout(hideProgress, 500);
            sendToast('Informações atualizadas!', 2000);
            addNotification('info', 'Atualizado', 'Painel atualizado com sucesso.');
        });

        // Tabs
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                activeTab = tabName;
                
                tabButtons.forEach(b => {
                    b.style.background = b === btn ? estilo.cores.accentBg : 'transparent';
                    b.style.color = b === btn ? estilo.cores.accent : estilo.cores.textoSecundario;
                });
                
                const panels = {
                    '📊 Painel': activityPanel,
                    '🤖 IA': chatPanel,
                    '⚙️ Config': settingsPanel,
                    '📈 Stats': statsPanel,
                    '🔔 Notif': notificationsPanel
                };
                
                Object.values(panels).forEach(p => {
                    if (p) p.style.display = 'none';
                });
                
                const target = panels[tabName];
                if (target) {
                    target.style.display = 'flex';
                    if (tabName === '📈 Stats') updateStatsDisplay();
                    if (tabName === '🔔 Notif') updateNotificationsUI();
                }
            });
        });

        // Chat IA
        const chatInput = document.getElementById('chat-input');
        const chatSend = document.getElementById('chat-send');
        const chatMessages = document.getElementById('chat-messages');
        
        async function sendChatMessage() {
            if (!chatInput) return;
            const question = chatInput.value.trim();
            if (!question) return;
            
            chatInput.value = '';
            chatMessages.innerHTML += `<div style="margin: 4px 0; text-align: right;"><span style="background: ${estilo.cores.accentBg}; color: ${estilo.cores.accent}; padding: 4px 8px; border-radius: 8px; display: inline-block; max-width: 80%;">${question}</span></div>`;
            chatMessages.innerHTML += `<div style="margin: 4px 0; text-align: left; color: ${estilo.cores.textoSecundario};">🤖 Pensando...</div>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            try {
                const context = STATE.currentActivity ? 
                    `Atividade: ${STATE.currentActivity.title}\nDisciplina: ${STATE.currentActivity.discipline}\nStatus: ${STATE.currentActivity.status}\nProgresso: ${STATE.currentActivity.progress}%\nQuestões: ${STATE.currentActivity.questionsCount}\nTipos: ${STATE.currentActivity.questionsTypes?.join(', ') || 'Não especificados'}` : 
                    'Nenhuma atividade carregada';
                
                const response = await askAI(question, context);
                
                // Remover "Pensando..."
                chatMessages.removeChild(chatMessages.lastChild);
                chatMessages.innerHTML += `<div style="margin: 4px 0; text-align: left; background: ${estilo.cores.fundo}; padding: 4px 8px; border-radius: 8px; display: inline-block; max-width: 85%; color: ${estilo.cores.texto}; white-space: pre-wrap;">🤖 ${response}</div>`;
            } catch (error) {
                chatMessages.removeChild(chatMessages.lastChild);
                chatMessages.innerHTML += `<div style="margin: 4px 0; text-align: left; color: ${estilo.cores.erro};">❌ Erro: ${error.message}</div>`;
            }
            
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        if (chatSend) chatSend.addEventListener('click', sendChatMessage);
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') sendChatMessage();
            });
        }

        // Configurações
        settingsList.forEach(setting => {
            const checkbox = document.getElementById(`setting-${setting.id}`);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    STATE.settings[setting.id] = e.target.checked;
                    saveSettings();
                    sendToast(`Configuração "${setting.label}" ${e.target.checked ? 'ativada' : 'desativada'}`, 2000);
                    addNotification('info', 'Configuração', `"${setting.label}" ${e.target.checked ? 'ativada' : 'desativada'}`);
                    
                    // Se desativar autoRefresh, parar o monitoramento
                    if (setting.id === 'autoRefresh' && !e.target.checked) {
                        // Parar monitoramento
                    }
                });
                
                // Atualizar estilo do toggle
                const toggleSpan = checkbox.parentElement.querySelector('span:last-child');
                if (toggleSpan) {
                    checkbox.addEventListener('change', () => {
                        const isChecked = checkbox.checked;
                        const parentSpan = checkbox.parentElement.querySelector('span:first-child');
                        if (parentSpan) {
                            parentSpan.style.background = isChecked ? estilo.cores.accentBg : estilo.cores.fundoTerciario;
                        }
                        if (toggleSpan) {
                            toggleSpan.style.transform = isChecked ? 'translateX(18px)' : 'none';
                        }
                    });
                }
            }
        });

        // Inicializar painéis
        if (STATE.settings.autoPanel) {
            setTimeout(() => {
                fetchCurrentActivity();
            }, 1000);
        }
        
        // Iniciar monitoramento automático
        if (STATE.settings.autoRefresh) {
            setInterval(() => {
                monitorAPI();
                if (STATE.settings.autoPanel) {
                    fetchCurrentActivity();
                }
            }, 30000);
        }

        return { 
            helpers: { 
                toggleMenu, 
                showLogs: () => {}, 
                hideLogs,
                updateStatusDisplay,
                updateStatsDisplay,
                updateCorrectedTasksList,
                updateActivityPanel,
                updateNotificationsUI,
                updateProgressUI,
                fetchCurrentActivity,
                askAI,
                runDiagnostic,
                exportLogs
            } 
        };
    }

    async function init() {
        logMessage('INFO',`----- ${SCRIPT_NAME} Inicializando (v${SCRIPT_VERSION}) -----`);
        
        try {
            // Carregar configurações e histórico
            loadSettings();
            loadHistory();
            
            // Carrega fontes primeiro (opcional, pode ser em paralelo)
            await loadCss('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
            // Carrega dependências do Toastify
            await loadCss('https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css');
            await loadScript('https://cdn.jsdelivr.net/npm/toastify-js');
            STATE.isToastifyLoaded = true;
            injectToastStyles();
            
            const ui = setupUI();
            if (!ui) throw new Error("Falha crítica na configuração da UI.");
            logMessage('INFO','Configuração da UI completa.');

            sendToast(`>> ${SCRIPT_NAME} Injetado! Aguardando login...`, 3000);
            sendToast("Créditos: inacallep, miitch, crackingnlearn, hackermoon", 5000);
            
            addNotification('info', 'Script Iniciado', `${SCRIPT_NAME} v${SCRIPT_VERSION} carregado com sucesso.`);

            // Interceptador de fetch aprimorado
            const originalFetch = window.fetch;
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
                                sendToast("✅ Entrada feita com sucesso!", 3000);
                                addNotification('success', 'Login Detectado', 'Token capturado com sucesso.');

                                const fullUserName = data?.name;
                                let firstName = '';
                                if (fullUserName && typeof fullUserName === 'string') {
                                    const nameParts = fullUserName.trim().split(' ');
                                    firstName = nameParts[0] || '';
                                    if (firstName) {
                                        firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
                                    }
                                }

                                if (firstName) {
                                    setTimeout(() => {
                                        sendToast(`Seja bem-vindo(a), ${firstName}!`, 3500);
                                    }, 250);
                                }
                            }
                            
                            // Atualiza a UI
                            if (window.updateStatusDisplay) {
                                window.updateStatusDisplay();
                            }
                            
                            // Buscar atividade inicial
                            if (STATE.settings.autoPanel) {
                                setTimeout(() => {
                                    fetchCurrentActivity();
                                }, 1000);
                            }
                        }
                        return response;
                    } catch (error) {
                        console.error('[HCK TAREFAS] Erro CRÍTICO ao processar resposta do token:', error);
                        if (STATE.isToastifyLoaded) {
                            sendToast("Erro CRÍTICO ao capturar token. Ver console.", 5000);
                            addNotification('error', 'Erro no Token', 'Falha ao capturar token de autenticação.');
                        }
                        return originalFetch.apply(this, arguments);
                    }
                }

                const response = await originalFetch.apply(this, arguments);

                const answerSubmitRegex = /^https:\/\/edusp-api\.ip\.tv\/tms\/task\/\d+\/answer$/;
                if (answerSubmitRegex.test(url) && init && init.method === 'POST' && STATE.interceptEnabled && STATE.settings.autoCorrect) {
                    if (!STATE.capturedLoginData || !STATE.capturedLoginData.auth_token) {
                        if (STATE.isToastifyLoaded) {
                            sendToast("Ops! Token não encontrado. Envie novamente após login.", 4000);
                            addNotification('warning', 'Token Ausente', 'Token não encontrado para correção automática.');
                        }
                        return response;
                    }

                    try {
                        const clonedResponse = response.clone();
                        const submittedData = await clonedResponse.json();
                        STATE.stats.totalIntercepted++;
                        
                        if (window.updateStatsDisplay) {
                            window.updateStatsDisplay();
                        }

                        if (submittedData && submittedData.status !== "draft" && submittedData.id && submittedData.task_id) {
                            sendToast("📤 Envio detectado! Iniciando correção...", 2000);
                            addNotification('info', 'Correção Iniciada', `Tarefa ${submittedData.task_id} detectada. Corrigindo...`);
                            
                            updateProgress(0, 3, 'Buscando respostas corretas...');

                            const headers_template = {
                                "x-api-realm": "edusp",
                                "x-api-platform": "webclient",
                                "x-api-key": STATE.capturedLoginData.auth_token,
                                "content-type": "application/json"
                            };

                            setTimeout(async () => {
                                try {
                                    updateProgress(1, 3, 'Processando respostas...');
                                    const startTime = Date.now();
                                    const respostasOriginaisComGabarito = await pegarRespostasCorretas(submittedData.task_id, submittedData.id, headers_template);
                                    
                                    updateProgress(2, 3, 'Enviando respostas corrigidas...');
                                    await enviarRespostasCorrigidas(respostasOriginaisComGabarito, submittedData.task_id, submittedData.id, headers_template);
                                    
                                    const processingTime = Date.now() - startTime;
                                    STATE.stats.totalProcessingTime += processingTime;
                                    STATE.stats.avgProcessingTime = Math.round(STATE.stats.totalProcessingTime / STATE.stats.totalProcessed);
                                    saveHistory();
                                    updateStatsDisplay();
                                    
                                    updateProgress(3, 3, '✅ Concluído!');
                                    setTimeout(hideProgress, 1000);
                                    
                                    addNotification('success', 'Correção Concluída', `Tarefa ${submittedData.task_id} corrigida em ${processingTime}ms.`);
                                } catch (correctionError) {
                                    logMessage('ERROR', 'Erro durante o processo de correção automática:', correctionError);
                                    hideProgress();
                                    addNotification('error', 'Erro na Correção', correctionError.message);
                                }
                            }, 500);
                        }
                    } catch (err) {
                        console.error('[HCK TAREFAS] Erro ao processar a resposta JSON do envio de tarefa POST:', err);
                        if (STATE.isToastifyLoaded) {
                            sendToast("Erro ao processar envio. Ver console.", 5000);
                            addNotification('error', 'Erro no Processamento', err.message);
                        }
                    }
                }

                return response;
            };

            logMessage('INFO',`----- ${SCRIPT_NAME} Inicializado (v${SCRIPT_VERSION}) -----`);
            
            // Mostrar menu automaticamente
            setTimeout(() => {
                if (ui && ui.helpers && ui.helpers.toggleMenu) {
                    ui.helpers.toggleMenu(true);
                }
            }, 500);

        } catch (error) {
            logMessage('ERROR', '!!! ERRO CRÍTICO NA INICIALIZAÇÃO DO BOOKMARKLET !!!', error);
            console.error(`[${SCRIPT_NAME} Init Fail]: ${error.message}. Script pode não funcionar. Verifique o Console.`);
            sendToast(`Erro na inicialização: ${error.message}`, 5000);
            addNotification('error', 'Erro de Inicialização', error.message);
        }
    }

    // Inicializa o bookmarklet
    await init();

})();
