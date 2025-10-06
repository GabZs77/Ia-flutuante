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
    const SCRIPT_VERSION = '1.0.1';
    const TOAST_BACKGROUND_COLOR = 'rgba(20, 20, 20, 0.9)';
    const TOAST_TEXT_COLOR = '#f0f0f0';

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
            totalFailed: 0
        }
    };

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
            
            // Adiciona à lista de tarefas corrigidas
            STATE.correctedTasks.push({
                taskId,
                answerId,
                timestamp: new Date().toISOString(),
                status: 'success'
            });
            
            // Atualiza a UI se estiver visível
            updateStatsDisplay();
            updateCorrectedTasksList();

            const oldTitle = document.title;
            document.title = `${SCRIPT_NAME} Fez a Boa!`;
            setTimeout(() => { document.title = oldTitle; }, 3000);

        } catch (error) {
            console.error("[HCK TAREFAS] Falha detalhada ao transformar ou enviar respostas corrigidas:", error);
            sendToast(`Erro na correção: ${error.message}`, 5000);
            STATE.stats.totalFailed++;
            
            // Adiciona à lista de tarefas com falha
            STATE.correctedTasks.push({
                taskId,
                answerId,
                timestamp: new Date().toISOString(),
                status: 'failed',
                error: error.message
            });
            
            // Atualiza a UI se estiver visível
            updateStatsDisplay();
            updateCorrectedTasksList();
        }
    }

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
            menuWidth: isMobile ? '90vw' : (window.innerWidth < 768 ? '280px' : '320px'), 
            fontSize: isMobile ? '12px' : (window.innerWidth < 768 ? '13px' : '14px'), 
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
        menu.style.cssText = `background: ${estilo.cores.fundo}; width: ${sizes.menuWidth}; padding: 10px; border-radius: ${estilo.radius}; box-shadow: ${estilo.sombras.menu}; display: none; flex-direction: column; gap: 8px; border: 1px solid ${estilo.cores.borda}; opacity: 0; transform: translateY(15px) scale(0.95); transition: opacity 0.35s ease-out, transform 0.35s ease-out; position: fixed; bottom: ${isMobile ? '70px' : '70px'}; right: ${isMobile ? '5px' : '12px'}; max-height: ${isMobile ? '70vh' : '75vh'}; overflow-y: auto; scrollbar-width: none;`;
        
        // Adicionando estilo para scrollbar do menu
        const style = document.createElement('style');
        style.textContent = `#hck-tarefas-menu::-webkit-scrollbar { display: none; }`;
        document.head.appendChild(style);
        
        const header = document.createElement('div'); 
        header.style.cssText = `display: flex; align-items: center; justify-content: center; position: relative; width: 100%; margin-bottom: 4px;`;
        
        const title = document.createElement('div'); 
        title.textContent = SCRIPT_NAME; 
        title.style.cssText = `font-size: ${sizes.titleSize}; font-weight: 600; text-align: center; flex-grow: 1; color: ${estilo.cores.texto};`;
        
        const closeBtn = document.createElement('button'); 
        closeBtn.innerHTML = '×'; 
        closeBtn.setAttribute('aria-label', 'Fechar Menu'); 
        closeBtn.style.cssText = `position: absolute; top: -4px; right: -4px; background: ${estilo.cores.fundoSecundario}; border: none; color: ${estilo.cores.textoSecundario}; font-size: 18px; font-weight: 600; cursor: pointer; padding: 0; line-height: 1; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;`;
        
        header.append(title, closeBtn);
        
        // Status Section
        const statusSection = document.createElement('div');
        statusSection.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; margin-bottom: 8px;`;
        
        const statusTitle = document.createElement('div');
        statusTitle.textContent = 'Status';
        statusTitle.style.cssText = `font-size: 12px; font-weight: 600; color: ${estilo.cores.textoSecundario}; margin-bottom: 4px;`;
        
        const statusContent = document.createElement('div');
        statusContent.id = 'status-content';
        statusContent.style.cssText = `font-size: ${sizes.fontSize}; color: ${estilo.cores.texto};`;
        statusContent.innerHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Script:</span><span id="script-status" style="color: ${STATE.isActive ? estilo.cores.sucesso : estilo.cores.erro};">${STATE.isActive ? 'Ativo' : 'Inativo'}</span></div><div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Interceptação:</span><span id="intercept-status" style="color: ${STATE.interceptEnabled ? estilo.cores.sucesso : estilo.cores.erro};">${STATE.interceptEnabled ? 'Ativa' : 'Inativa'}</span></div><div style="display: flex; justify-content: space-between;"><span>Token:</span><span id="token-status" style="color: ${STATE.capturedLoginData ? estilo.cores.sucesso : estilo.cores.warn};">${STATE.capturedLoginData ? 'Capturado' : 'Não capturado'}</span></div>`;
        
        statusSection.append(statusTitle, statusContent);
        
        // Stats Section
        const statsSection = document.createElement('div');
        statsSection.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; margin-bottom: 8px;`;
        
        const statsTitle = document.createElement('div');
        statsTitle.textContent = 'Estatísticas';
        statsTitle.style.cssText = `font-size: 12px; font-weight: 600; color: ${estilo.cores.textoSecundario}; margin-bottom: 4px;`;
        
        const statsContent = document.createElement('div');
        statsContent.id = 'stats-content';
        statsContent.style.cssText = `font-size: ${sizes.fontSize}; color: ${estilo.cores.texto};`;
        statsContent.innerHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Interceptadas:</span><span id="total-intercepted">0</span></div><div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Corrigidas:</span><span id="total-corrected" style="color: ${estilo.cores.sucesso};">0</span></div><div style="display: flex; justify-content: space-between;"><span>Falhas:</span><span id="total-failed" style="color: ${estilo.cores.erro};">0</span></div>`;
        
        statsSection.append(statsTitle, statsContent);
        
        // Tasks List Section
        const tasksSection = document.createElement('div');
        tasksSection.style.cssText = `background: ${estilo.cores.fundoSecundario}; border-radius: ${estilo.radiusSmall}; padding: 8px; margin-bottom: 8px; max-height: ${isMobile ? '120px' : '150px'}; overflow-y: auto;`;
        
        const tasksTitle = document.createElement('div');
        tasksTitle.textContent = 'Tarefas Recentes';
        tasksTitle.style.cssText = `font-size: 12px; font-weight: 600; color: ${estilo.cores.textoSecundario}; margin-bottom: 4px;`;
        
        const tasksContent = document.createElement('div');
        tasksContent.id = 'tasks-content';
        tasksContent.style.cssText = `font-size: ${sizes.fontSize}; color: ${estilo.cores.texto};`;
        tasksContent.innerHTML = `<div style="text-align: center; color: ${estilo.cores.textoSecundario}; font-size: 12px;">Nenhuma tarefa processada ainda</div>`;
        
        tasksSection.append(tasksTitle, tasksContent);
        
        // Buttons
        const buttonBaseStyle = `width: 100%; padding: ${sizes.buttonPadding}; border: none; border-radius: ${estilo.radiusSmall}; cursor: pointer; font-size: ${sizes.fontSize}; font-weight: 500; margin-bottom: 0; display: flex; align-items: center; justify-content: center; gap: 6px; transition: opacity 0.2s ease, background-color 0.2s ease, color 0.2s ease;`;
        const buttonPrimaryStyle = `${buttonBaseStyle} background: ${estilo.cores.accentBg}; color: ${estilo.cores.accent};`;
        const buttonSecondaryStyle = `${buttonBaseStyle} background: ${estilo.cores.secondaryAccentBg}; color: ${estilo.cores.secondaryAccent}; border: 1px solid ${estilo.cores.borda};`;
        
        // Adicionando estilos para hover e disabled
        const style4 = document.createElement('style');
        style4.textContent = `
            .hck-tarefas-btn-primary:hover { opacity: 0.85; }
            .hck-tarefas-btn-primary:disabled { background-color: ${estilo.cores.fundoSecundario}; color: ${estilo.cores.textoSecundario}; opacity: 0.6; cursor: not-allowed; }
            .hck-tarefas-btn-secondary:hover { background: ${estilo.cores.fundoTerciario}; opacity: 1; }
        `;
        document.head.appendChild(style4);
        
        const toggleInterceptBtn = document.createElement('button'); 
        toggleInterceptBtn.textContent = `${STATE.interceptEnabled ? 'Desativar' : 'Ativar'} Interceptação`; 
        toggleInterceptBtn.className = 'hck-tarefas-btn-primary';
        toggleInterceptBtn.style.cssText = buttonPrimaryStyle;
        
        const clearDataBtn = document.createElement('button'); 
        clearDataBtn.textContent = 'Limpar Dados'; 
        clearDataBtn.className = 'hck-tarefas-btn-secondary';
        clearDataBtn.style.cssText = buttonSecondaryStyle;
        
        const logsBtn = document.createElement('button'); 
        logsBtn.textContent = 'Ver Logs'; 
        logsBtn.className = 'hck-tarefas-btn-secondary';
        logsBtn.style.cssText = buttonSecondaryStyle;
        
        // Credits
        const credits = document.createElement('div');
        credits.innerHTML = `<span style="font-weight: 600; letter-spacing: 0.5px;">v${SCRIPT_VERSION}</span> <span style="margin: 0 4px;">|</span> <span style="opacity: 0.7;">by Hackermoon</span>`;
        credits.style.cssText = `text-align: center; font-size: 10px; font-weight: 500; color: ${estilo.cores.textoSecundario}; margin-top: 8px; padding-top: 6px; border-top: 1px solid ${estilo.cores.borda}; opacity: 0.9;`;
        
        const notificationContainer = document.createElement('div'); 
        notificationContainer.id = 'hck-tarefas-notifications'; 
        notificationContainer.style.cssText = `position: fixed; bottom: ${isMobile ? '10px' : '15px'}; left: 50%; transform: translateX(-50%); z-index: 10002; display: flex; flex-direction: column; align-items: center; gap: 10px; width: auto; max-width: 90%;`;
        
        STATE.notificationContainer = notificationContainer;
        menu.append(header, statusSection, statsSection, tasksSection, toggleInterceptBtn, clearDataBtn, logsBtn, credits);
        container.append(menu, toggleBtn);
        document.body.appendChild(container); 
        document.body.appendChild(notificationContainer);
        logMessage('INFO', 'Elementos da UI adicionados à página.');

        // Funções para atualizar a UI
        function updateStatusDisplay() {
            const scriptStatus = document.getElementById('script-status');
            const interceptStatus = document.getElementById('intercept-status');
            const tokenStatus = document.getElementById('token-status');
            
            if (scriptStatus) {
                scriptStatus.textContent = STATE.isActive ? 'Ativo' : 'Inativo';
                scriptStatus.style.color = STATE.isActive ? estilo.cores.sucesso : estilo.cores.erro;
            }
            
            if (interceptStatus) {
                interceptStatus.textContent = STATE.interceptEnabled ? 'Ativa' : 'Inativa';
                interceptStatus.style.color = STATE.interceptEnabled ? estilo.cores.sucesso : estilo.cores.erro;
            }
            
            if (tokenStatus) {
                tokenStatus.textContent = STATE.capturedLoginData ? 'Capturado' : 'Não capturado';
                tokenStatus.style.color = STATE.capturedLoginData ? estilo.cores.sucesso : estilo.cores.warn;
            }
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
            
            // Mostra apenas as 5 tarefas mais recentes
            const recentTasks = STATE.correctedTasks.slice(-5).reverse();
            tasksContent.innerHTML = recentTasks.map(task => {
                const time = new Date(task.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const statusColor = task.status === 'success' ? estilo.cores.sucesso : estilo.cores.erro;
                const statusText = task.status === 'success' ? 'Sucesso' : 'Falha';
                return `<div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;"><span>Tarefa ${task.taskId}</span><span style="color: ${statusColor};">${statusText} (${time})</span></div>`;
            }).join('');
        }
        
        // Expondo as funções globalmente para uso em outras partes do código
        window.updateStatusDisplay = updateStatusDisplay;
        window.updateStatsDisplay = updateStatsDisplay;
        window.updateCorrectedTasksList = updateCorrectedTasksList;

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
        
        // Logs modal
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
            [toggleInterceptBtn, clearDataBtn, logsBtn].forEach(b => { 
                b.style.fontSize = s.fontSize; 
                b.style.padding = s.buttonPadding; 
            }); 
            title.style.fontSize = s.titleSize; 
        });

        // Botão de ativar/desativar interceptação
        addTouchEvent(toggleInterceptBtn, () => {
            STATE.interceptEnabled = !STATE.interceptEnabled;
            toggleInterceptBtn.textContent = STATE.interceptEnabled ? 'Desativar Interceptação' : 'Ativar Interceptação';
            updateStatusDisplay();
            sendToast(`Interceptação ${STATE.interceptEnabled ? 'ativada' : 'desativada'}`, 3000);
        });
        
        // Botão de limpar dados
        addTouchEvent(clearDataBtn, () => {
            STATE.correctedTasks = [];
            STATE.stats = {
                totalIntercepted: 0,
                totalCorrected: 0,
                totalFailed: 0
            };
            updateStatsDisplay();
            updateCorrectedTasksList();
            sendToast('Dados limpos com sucesso', 3000);
        });
        
        // Logs modal
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
                navigator.clipboard.writeText(textToCopy).then(() => { 
                    copyLogBtn.textContent = 'Copiado!'; 
                    setTimeout(() => { 
                        copyLogBtn.textContent = 'Copiar Logs'; 
                    }, 2000); 
                    logMessage('INFO', 'Logs copiados.'); 
                }).catch(err => { 
                    logMessage('ERROR', 'Falha ao copiar logs:', err); 
                    copyLogBtn.textContent = 'Erro!'; 
                    setTimeout(() => { 
                        copyLogBtn.textContent = 'Copiar Logs'; 
                    }, 2000); 
                }); 
            }; 
            
            const closeLogBtn = document.createElement('button'); 
            closeLogBtn.innerHTML = '×'; 
            closeLogBtn.setAttribute('aria-label', 'Fechar Logs'); 
            closeLogBtn.style.cssText = `background: ${estilo.cores.fundoTerciario}; border: none; color: ${estilo.cores.textoSecundario}; font-size: 18px; font-weight: bold; cursor: pointer; padding: 0; line-height: 1; border-radius: 50%; width: 24px; height: 24px; display:flex; align-items:center; justify-content:center; transition: all 0.2s ease; flex-shrink: 0;`;
            
            closeLogBtn.onmouseover = () => {
                closeLogBtn.style.backgroundColor = estilo.cores.borda;
                closeLogBtn.style.color = estilo.cores.texto;
            };
            closeLogBtn.onmouseout = () => {
                closeLogBtn.style.backgroundColor = estilo.cores.fundoTerciario;
                closeLogBtn.style.color = estilo.cores.textoSecundario;
            };
            
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
            if (!logArea) { 
                logMessage('ERROR', 'Área de log não encontrada no modal.'); 
                return;
            } 
            logMessage('INFO', `Exibindo ${STATE.logMessages.length} logs.`); 
            const logColors = { 
                ERROR: estilo.cores.erro, 
                WARN: estilo.cores.warn, 
                INFO: estilo.cores.info, 
                DEBUG: estilo.cores.logDebug, 
                DEFAULT: estilo.cores.textoSecundario 
            }; 
            
            const sanitize = (str) => { 
                const temp = document.createElement('div'); 
                temp.textContent = str; 
                return temp.innerHTML; 
            }; 
            
            logArea.innerHTML = STATE.logMessages.map(log => { 
                const color = logColors[log.level] || logColors.DEFAULT; 
                return `<span style="color: ${color}; font-weight: bold;">[${log.timestamp} ${log.level}]</span> <span style="color:${estilo.cores.texto};">${sanitize(log.message)}</span>`; 
            }).join('\n'); 
            
            if(STATE.logModal) STATE.logModal.style.display = 'flex'; 
            logArea.scrollTop = logArea.scrollHeight; 
        };
        
        addTouchEvent(logsBtn, showLogs);

        return { 
            helpers: { 
                toggleMenu, 
                showLogs, 
                hideLogs,
                updateStatusDisplay,
                updateStatsDisplay,
                updateCorrectedTasksList
            } 
        };
    }

    async function init() {
        logMessage('INFO',`----- ${SCRIPT_NAME} Inicializando (v${SCRIPT_VERSION}) -----`);
        
        try {
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

            // Interceptador de fetch
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
                                sendToast("Entrada feita com sucesso!", 3000);

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
                            
                            // Atualiza a UI se estiver visível
                            if (window.updateStatusDisplay) {
                                window.updateStatusDisplay();
                            }
                        }
                        return response;
                    } catch (error) {
                        console.error('[HCK TAREFAS] Erro CRÍTICO ao processar resposta do token:', error);
                        if (STATE.isToastifyLoaded) {
                            sendToast("Erro CRÍTICO ao capturar token. Ver console.", 5000);
                        }
                        return originalFetch.apply(this, arguments);
                    }
                }

                const response = await originalFetch.apply(this, arguments);

                const answerSubmitRegex = /^https:\/\/edusp-api\.ip\.tv\/tms\/task\/\d+\/answer$/;
                if (answerSubmitRegex.test(url) && init && init.method === 'POST' && STATE.interceptEnabled) {
                    if (!STATE.capturedLoginData || !STATE.capturedLoginData.auth_token) {
                        if (STATE.isToastifyLoaded) {
                            sendToast("Ops! Token não encontrado. Envie novamente após login.", 4000);
                        }
                        return response;
                    }

                    try {
                        const clonedResponse = response.clone();
                        const submittedData = await clonedResponse.json();
                        STATE.stats.totalIntercepted++;
                        
                        // Atualiza a UI se estiver visível
                        if (window.updateStatsDisplay) {
                            window.updateStatsDisplay();
                        }

                        if (submittedData && submittedData.status !== "draft" && submittedData.id && submittedData.task_id) {
                            sendToast("Envio detectado! Iniciando correção...", 2000);

                            const headers_template = {
                                "x-api-realm": "edusp",
                                "x-api-platform": "webclient",
                                "x-api-key": STATE.capturedLoginData.auth_token,
                                "content-type": "application/json"
                            };

                            setTimeout(async () => {
                                try {
                                    const respostasOriginaisComGabarito = await pegarRespostasCorretas(submittedData.task_id, submittedData.id, headers_template);
                                    await enviarRespostasCorrigidas(respostasOriginaisComGabarito, submittedData.task_id, submittedData.id, headers_template);
                                } catch (correctionError) {
                                    logMessage('ERROR', 'Erro durante o processo de correção automática:', correctionError);
                                }
                            }, 500);
                        }
                    } catch (err) {
                        console.error('[HCK TAREFAS] Erro ao processar a resposta JSON do envio de tarefa POST:', err);
                        if (STATE.isToastifyLoaded) {
                            sendToast("Erro ao processar envio. Ver console.", 5000);
                        }
                    }
                }

                return response;
            };

            logMessage('INFO',`----- ${SCRIPT_NAME} Inicializado (v${SCRIPT_VERSION}) -----`);
            ui.helpers.toggleMenu(true);

        } catch (error) {
            logMessage('ERROR', '!!! ERRO CRÍTICO NA INICIALIZAÇÃO DO BOOKMARKLET !!!', error);
            console.error(`[${SCRIPT_NAME} Init Fail]: ${error.message}. Script pode não funcionar. Verifique o Console.`);
            sendToast(`Erro na inicialização: ${error.message}`, 5000);
        }
    }

    // Inicializa o bookmarklet
    await init();

})();
