(function() {
    // Verifica se já existe a janela
    if (document.getElementById('edu-terminal-panel')) {
        document.getElementById('edu-terminal-panel').remove();
        return;
    }

    const API_CONFIG = {
        url: 'https://gen.pollinations.ai/v1/chat/completions',
        key: 'pk_bJav4nbMa2fZGkqG',
        model: 'openai'
    };

    const Utils = {
        formatDate: function(dateStr) {
            if (!dateStr) return '';
            var d = new Date(dateStr);
            return d.toLocaleString('pt-BR');
        },
        
        getToken: function() {
            try {
                var match = document.cookie.match(/token=([^;]+)/);
                return match ? match[1] : localStorage.getItem('token') || '';
            } catch(e) { return ''; }
        },
        
        getCaptcha: function() {
            try {
                return localStorage.getItem('captcha') || '';
            } catch(e) { return ''; }
        }
    };

    // Funções de API
    const TaskAPI = {
        getTasks: function(token, captcha) {
            var cookies = document.cookie;
            var targets = [];

            return fetch('https://edusp-api.ip.tv/room/user', {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'X-Captcha': captcha,
                    'Cookie': cookies
                }
            }).then(function(r) {
                if (!r.ok) return { rooms: [] };
                return r.json();
            }).then(function(roomsData) {
                var rooms = roomsData.rooms || [];
                rooms.forEach(function(room) {
                    if (room.name) targets.push(String(room.name));
                    (room.group_categories || []).forEach(function(gc) {
                        if (gc.id) targets.push(String(gc.id));
                    });
                });

                function fetchTasks(expired) {
                    var url = 'https://edusp-api.ip.tv/tms/task/todo?expired_only=' + expired + '&limit=100&offset=0&filter_expired=' + (!expired) + '&is_exam=false&with_answer=true&is_essay=false&answer_statuses=draft&answer_statuses=pending&with_apply_moment=true';
                    targets.forEach(function(t) { url += '&publication_target=' + encodeURIComponent(t); });

                    return fetch(url, {
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'X-Captcha': captcha,
                            'Cookie': cookies
                        }
                    }).then(function(r) {
                        if (!r.ok) return [];
                        return r.json();
                    }).then(function(d) {
                        return Array.isArray(d) ? d : (d.results || d.tasks || []);
                    }).catch(function() { return []; });
                }

                return Promise.all([fetchTasks(false), fetchTasks(true)]).then(function(results) {
                    function formatTasks(tasks, tipo) {
                        return tasks.map(function(t) {
                            return {
                                id: t.id,
                                title: t.title || '#' + t.id,
                                expire_at: Utils.formatDate(t.expire_at),
                                publication_target: t.publication_target || '',
                                tipo: tipo,
                                is_essay: t.is_essay || false,
                                description: t.description || '',
                                questions: t.questions || []
                            };
                        });
                    }
                    return {
                        pending: formatTasks(results[0], 'pendente'),
                        expired: formatTasks(results[1], 'expirada')
                    };
                });
            });
        },

        getTaskAnswers: function(token, taskId, target) {
            var url = 'https://edusp-api.ip.tv/tms/task/' + taskId + '/answers?room_code=' + encodeURIComponent(target);
            return fetch(url, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Cookie': document.cookie
                }
            }).then(function(r) {
                if (!r.ok) throw new Error('Falha ao buscar respostas');
                return r.json();
            }).then(function(d) { return d.answers || d.results || d; });
        }
    };

    // Criar estilo CSS
    var style = document.createElement('style');
    style.textContent = `
        #edu-terminal-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 450px;
            max-height: 600px;
            background: #1a1a2e;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            font-family: 'Consolas', 'Monaco', monospace;
            z-index: 999999;
            overflow: hidden;
            border: 1px solid #16213e;
        }
        
        #edu-header {
            background: linear-gradient(135deg, #0f3460 0%, #16213e 100%);
            padding: 12px 16px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #0f3460;
        }
        
        #edu-title {
            color: #00fff5;
            font-size: 14px;
            font-weight: bold;
            text-shadow: 0 0 10px rgba(0,255,245,0.5);
        }
        
        #edu-controls {
            display: flex;
            gap: 8px;
        }
        
        .edu-btn-control {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .edu-btn-close { background: #ff6b6b; }
        .edu-btn-minimize { background: #ffd93d; }
        .edu-btn-refresh { background: #6bcb77; }
        
        .edu-btn-control:hover { transform: scale(1.2); opacity: 0.8; }
        
        #edu-tabs {
            display: flex;
            background: #0f3460;
            padding: 0;
        }
        
        .edu-tab {
            flex: 1;
            padding: 12px;
            background: transparent;
            border: none;
            color: #888;
            cursor: pointer;
            font-family: inherit;
            font-size: 13px;
            transition: all 0.3s;
            border-bottom: 2px solid transparent;
        }
        
        .edu-tab.active {
            color: #00fff5;
            background: rgba(0,255,245,0.1);
            border-bottom-color: #00fff5;
        }
        
        .edu-tab:hover:not(.active) {
            color: #fff;
            background: rgba(255,255,255,0.05);
        }
        
        #edu-content {
            height: 450px;
            overflow-y: auto;
            padding: 16px;
            color: #e0e0e0;
            font-size: 13px;
            line-height: 1.6;
        }
        
        #edu-content::-webkit-scrollbar {
            width: 8px;
        }
        
        #edu-content::-webkit-scrollbar-track {
            background: #1a1a2e;
        }
        
        #edu-content::-webkit-scrollbar-thumb {
            background: #0f3460;
            border-radius: 4px;
        }
        
        .edu-task-item {
            background: rgba(15,52,96,0.5);
            padding: 12px;
            margin-bottom: 10px;
            border-radius: 8px;
            border-left: 3px solid #00fff5;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .edu-task-item:hover {
            background: rgba(15,52,96,0.8);
            transform: translateX(5px);
        }
        
        .edu-task-item.expired {
            border-left-color: #ff6b6b;
        }
        
        .edu-task-title {
            color: #fff;
            font-weight: bold;
            margin-bottom: 6px;
        }
        
        .edu-task-meta {
            color: #888;
            font-size: 11px;
        }
        
        .edu-task-type {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 10px;
            margin-right: 8px;
        }
        
        .edu-task-type.pendente {
            background: rgba(107,203,119,0.2);
            color: #6bcb77;
        }
        
        .edu-task-type.expirada {
            background: rgba(255,107,107,0.2);
            color: #ff6b6b;
        }
        
        .edu-answers-container {
            margin-top: 10px;
            padding: 10px;
            background: rgba(0,0,0,0.3);
            border-radius: 6px;
            display: none;
        }
        
        .edu-answer-item {
            padding: 8px;
            margin: 5px 0;
            background: rgba(0,255,245,0.05);
            border-radius: 4px;
            border-left: 2px solid #00fff5;
        }
        
        /* Chat Styles */
        #edu-chat-messages {
            height: 320px;
            overflow-y: auto;
            margin-bottom: 12px;
            padding-right: 8px;
        }
        
        .edu-chat-msg {
            margin-bottom: 12px;
            display: flex;
            flex-direction: column;
        }
        
        .edu-chat-msg.user {
            align-items: flex-end;
        }
        
        .edu-chat-bubble {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 12px;
            word-wrap: break-word;
            line-height: 1.5;
        }
        
        .edu-chat-msg.user .edu-chat-bubble {
            background: linear-gradient(135deg, #0f3460, #16213e);
            color: #fff;
            border-bottom-right-radius: 4px;
        }
        
        .edu-chat-msg.assistant .edu-chat-bubble {
            background: rgba(0,255,245,0.1);
            color: #e0e0e0;
            border-bottom-left-radius: 4px;
            border: 1px solid rgba(0,255,245,0.2);
        }
        
        .edu-chat-input-container {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        
        #edu-chat-input {
            flex: 1;
            background: rgba(15,52,96,0.5);
            border: 1px solid #0f3460;
            border-radius: 8px;
            padding: 10px 14px;
            color: #fff;
            font-family: inherit;
            font-size: 13px;
            outline: none;
            transition: all 0.3s;
        }
        
        #edu-chat-input:focus {
            border-color: #00fff5;
            box-shadow: 0 0 10px rgba(0,255,245,0.2);
        }
        
        #edu-chat-send {
            background: linear-gradient(135deg, #00fff5, #0f3460);
            border: none;
            border-radius: 8px;
            padding: 10px 16px;
            color: #000;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        #edu-chat-send:hover {
            transform: scale(1.05);
            box-shadow: 0 0 15px rgba(0,255,245,0.4);
        }
        
        .edu-loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid rgba(0,255,245,0.3);
            border-radius: 50%;
            border-top-color: #00fff5;
            animation: edu-spin 1s ease-in-out infinite;
        }
        
        @keyframes edu-spin {
            to { transform: rotate(360deg); }
        }
        
        .edu-status-bar {
            padding: 8px 16px;
            background: #0f3460;
            font-size: 11px;
            color: #888;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .edu-status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #6bcb77;
            animation: edu-pulse 2s infinite;
        }
        
        @keyframes edu-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .edu-empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #666;
        }
        
        .edu-empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }
    `;
    document.head.appendChild(style);

    // Criar elemento principal
    var panel = document.createElement('div');
    panel.id = 'edu-terminal-panel';
    panel.innerHTML = `
        <div id="edu-header">
            <span id="edu-title">🎓 Edu Terminal</span>
            <div id="edu-controls">
                <button class="edu-btn-control edu-btn-refresh" onclick="refreshTasks()" title="Atualizar"></button>
                <button class="edu-btn-control edu-btn-minimize" onclick="minimizePanel()" title="Minimizar"></button>
                <button class="edu-btn-control edu-btn-close" onclick="closePanel()" title="Fechar"></button>
            </div>
        </div>
        <div id="edu-tabs">
            <button class="edu-tab active" data-tab="atividade" onclick="switchTab('atividade')">📋 Atividade</button>
            <button class="edu-tab" data-tab="assistente" onclick="switchTab('assistente')">🤖 Assistente</button>
        </div>
        <div id="edu-content">
            <div id="tab-atividade" class="tab-content">
                <div class="edu-loading-container" style="text-align:center;padding:40px;">
                    <div class="edu-loading"></div>
                    <p style="color:#888;margin-top:10px;">Carregando atividades...</p>
                </div>
            </div>
            <div id="tab-assistente" class="tab-content" style="display:none;">
                <div id="edu-chat-messages">
                    <div class="edu-chat-msg assistant">
                        <div class="edu-chat-bubble">
                            Olá! 👋 Sou seu assistente educacional. Posso ajudar você com suas atividades, ver respostas ou tirar dúvidas. Como posso ajudar?
                        </div>
                    </div>
                </div>
                <div class="edu-chat-input-container">
                    <input type="text" id="edu-chat-input" placeholder="Digite sua mensagem..." onkeypress="handleChatKeypress(event)">
                    <button id="edu-chat-send" onclick="sendMessage()">Enviar</button>
                </div>
            </div>
        </div>
        <div class="edu-status-bar">
            <span><span class="edu-status-dot"></span> Conectado</span>
            <span id="edu-last-update">--:--:--</span>
        </div>
    `;
    document.body.appendChild(panel);

    // Variáveis globais
    window.eduTasks = { pending: [], expired: [] };
    window.eduChatHistory = [];
    let isMinimized = false;

    // Drag functionality
    makeDraggable(panel);

    function makeDraggable(element) {
        var header = element.querySelector('#edu-header');
        var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        header.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.right = "auto";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // Funções de controle
    window.closePanel = function() {
        panel.remove();
    };

    window.minimizePanel = function() {
        var content = document.getElementById('edu-content');
        var statusBar = document.querySelector('.edu-status-bar');
        if (isMinimized) {
            content.style.display = 'block';
            statusBar.style.display = 'flex';
            panel.style.maxHeight = '600px';
            isMinimized = false;
        } else {
            content.style.display = 'none';
            statusBar.style.display = 'none';
            panel.style.maxHeight = 'auto';
            isMinimized = true;
        }
    };

    window.switchTab = function(tabName) {
        document.querySelectorAll('.edu-tab').forEach(function(tab) {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(function(content) {
            content.style.display = 'none';
        });
        
        document.querySelector('.edu-tab[data-tab="' + tabName + '"]').classList.add('active');
        document.getElementById('tab-' + tabName).style.display = 'block';
    };

    // Carregar tarefas
    window.refreshTasks = function() {
        var token = Utils.getToken();
        var captcha = Utils.getCaptcha();
        
        if (!token) {
            showNoTokenMessage();
            return;
        }

        var container = document.getElementById('tab-atividade');
        container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="edu-loading"></div><p style="color:#888;margin-top:10px;">Carregando...</p></div>';

        TaskAPI.getTasks(token, captcha).then(function(data) {
            window.eduTasks = data;
            renderTasks(data);
            updateLastUpdate();
            
            // Auto-detectar mudanças na página
            setupAutoRefresh();
        }).catch(function(err) {
            container.innerHTML = '<div class="edu-empty-state"><div class="edu-empty-icon">⚠️</div><p>Erro ao carregar atividades</p><small>' + err.message + '</small></div>';
        });
    };

    function showNoTokenMessage() {
        var container = document.getElementById('tab-atividade');
        container.innerHTML = '<div class="edu-empty-state"><div class="edu-empty-icon">🔑</div><p>Token não encontrado</p><small>Faça login no sistema primeiro</small></div>';
    }

    function renderTasks(data) {
        var container = document.getElementById('tab-atividade');
        var html = '';

        if (data.pending.length === 0 && data.expired.length === 0) {
            html = '<div class="edu-empty-state"><div class="edu-empty-icon">✅</div><p>Nenhuma atividade encontrada</p><small>Você está em dia!</small></div>';
        } else {
            if (data.pending.length > 0) {
                html += '<h3 style="color:#6bcb77;margin-bottom:10px;">📌 Pendentes (' + data.pending.length + ')</h3>';
                data.pending.forEach(function(task) {
                    html += createTaskHTML(task);
                });
            }

            if (data.expired.length > 0) {
                html += '<h3 style="color:#ff6b6b;margin:20px 0 10px;">⏰ Expiradas (' + data.expired.length + ')</h3>';
                data.expired.forEach(function(task) {
                    html += createTaskHTML(task);
                });
            }
        }

        container.innerHTML = html;
    }

    function createTaskHTML(task) {
        var expiredClass = task.tipo === 'expirada' ? 'expired' : '';
        return '<div class="edu-task-item ' + expiredClass + '" onclick="toggleAnswers(\'' + task.id + '\', \'' + (task.publication_target || '') + '\')">' +
            '<div class="edu-task-title">' + task.title + '</div>' +
            '<div class="edu-task-meta">' +
                '<span class="edu-task-type ' + task.tipo + '">' + task.tipo.toUpperCase() + '</span>' +
                '<span>📅 ' + task.expire_at + '</span>' +
            '</div>' +
            '<div class="edu-answers-container" id="answers-' + task.id + '">' +
                '<div style="text-align:center;"><div class="edu-loading"></div></div>' +
            '</div>' +
        '</div>';
    }

    window.toggleAnswers = function(taskId, target) {
        var answersContainer = document.getElementById('answers-' + taskId);
        
        if (answersContainer.style.display === 'block') {
            answersContainer.style.display = 'none';
            return;
        }

        answersContainer.style.display = 'block';
        answersContainer.innerHTML = '<div style="text-align:center;padding:10px;"><div class="edu-loading"></div><p style="color:#888;">Carregando respostas...</p></div>';

        var token = Utils.getToken();
        TaskAPI.getTaskAnswers(token, taskId, target).then(function(answers) {
            if (!answers || answers.length === 0) {
                answersContainer.innerHTML = '<p style="color:#888;text-align:center;">Nenhuma resposta encontrada</p>';
                return;
            }

            var html = '<h4 style="color:#00fff5;margin-bottom:10px;">💡 Respostas:</h4>';
            answers.forEach(function(answer, idx) {
                html += '<div class="edu-answer-item">';
                html += '<strong>Questão ' + (idx + 1) + ':</strong> ';
                
                if (typeof answer === 'object' && answer.answer_text) {
                    html += answer.answer_text;
                } else if (typeof answer === 'string') {
                    html += answer;
                } else {
                    html += JSON.stringify(answer);
                }
                
                html += '</div>';
            });
            
            answersContainer.innerHTML = html;
        }).catch(function(err) {
            answersContainer.innerHTML = '<p style="color:#ff6b6b;text-align:center;">Erro: ' + err.message + '</p>';
        });
    };

    function updateLastUpdate() {
        var now = new Date();
        document.getElementById('edu-last-update').textContent = now.toLocaleTimeString('pt-BR');
    }

    // Chat functions
    window.handleChatKeypress = function(event) {
        if (event.key === 'Enter') {
            sendMessage();
        }
    };

    window.sendMessage = async function() {
        var input = document.getElementById('edu-chat-input');
        var message = input.value.trim();
        
        if (!message) return;

        addChatMessage(message, 'user');
        input.value = '';

        // Mostrar loading
        showTypingIndicator();

        try {
            // Preparar contexto das tarefas para a IA
            var tasksContext = prepareTasksContext();
            
            var response = await callAI(message, tasksContext);
            removeTypingIndicator();
            addChatMessage(response, 'assistant');
        } catch (error) {
            removeTypingIndicator();
            addChatMessage('Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.', 'assistant');
        }
    };

    function addChatMessage(content, role) {
        var messagesContainer = document.getElementById('edu-chat-messages');
        var msgDiv = document.createElement('div');
        msgDiv.className = 'edu-chat-msg ' + role;
        msgDiv.innerHTML = '<div class="edu-chat-bubble">' + formatMessage(content) + '</div>';
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        window.eduChatHistory.push({ role: role, content: content });
    }

    function formatMessage(content) {
        // Formatar markdown básico
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    function showTypingIndicator() {
        var messagesContainer = document.getElementById('edu-chat-messages');
        var typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'edu-chat-msg assistant';
        typingDiv.innerHTML = '<div class="edu-chat-bubble"><div class="edu-loading"></div> <span style="color:#888">Digitando...</span></div>';
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function removeTypingIndicator() {
        var indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    function prepareTasksContext() {
        var context = 'Tarefas atuais do usuário:\n\n';
        
        if (window.eduTasks.pending && window.eduTasks.pending.length > 0) {
            context += 'PENDENTES:\n';
            window.eduTasks.pending.forEach(function(t) {
                context += '- ID: ' + t.id + ' | ' + t.title + ' | Vence: ' + t.expire_at + '\n';
            });
            context += '\n';
        }
        
        if (window.eduTasks.expired && window.eduTasks.expired.length > 0) {
            context += 'EXPIRADAS:\n';
            window.eduTasks.expired.forEach(function(t) {
                context += '- ID: ' + t.id + ' | ' + t.title + ' | Venceu em: ' + t.expire_at + '\n';
            });
        }
        
        return context;
    }

    async function callAI(userMessage, tasksContext) {
        var systemPrompt = `Você é um assistente educacional especializado. Você tem acesso às informações de tarefas do usuário.

 ${tasksContext}

Instruções:
- Ajude o usuário com suas atividades acadêmicas
- Quando perguntado sobre tarefas, use as informações disponíveis acima
- Seja claro e objetivo nas respostas
- Use português brasileiro
- Você pode sugerir estratégias de estudo ou ajudar a organizar as tarefas`;

        var messages = [
            { role: 'system', content: systemPrompt },
            ...window.eduChatHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage }
        ];

        var response = await fetch(API_CONFIG.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + API_CONFIG.key
            },
            body: JSON.stringify({
                model: API_CONFIG.model,
                messages: messages,
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) throw new Error('Erro na API');

        var data = await response.json();
        return data.choices[0].message.content;
    }

    // Auto-refresh quando detectar mudança de página/atividade
    function setupAutoRefresh() {
        var lastUrl = location.href;
        
        setInterval(function() {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                refreshTasks();
            }
        }, 3000);

        // Observer para mudanças no DOM que possam indicar nova atividade
        var observer = new MutationObserver(function(mutations) {
            var shouldRefresh = mutations.some(function(mutation) {
                return mutation.addedNodes.length > 0 && 
                       mutation.target.classList && 
                       (mutation.target.classList.contains('task') || 
                        mutation.target.classList.contains('activity') ||
                        mutation.target.classList.contains('question'));
            });
            
            if (shouldRefresh) {
                clearTimeout(window.eduRefreshTimeout);
                window.eduRefreshTimeout = setTimeout(refreshTasks, 1500);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Inicialização
    setTimeout(refreshTasks, 500);

})();
