// Assistente IA Flutuante - Versão Final
// Configuração com sua API Key

(function() {
  // Configurações principais
  const CONFIG = {
    API_KEY: "AIzaSyDSIy5m7mTXlMMR_OOdCu2Af_EwoCd124w",
    API_URL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    INITIAL_MESSAGE: "Olá! Sou seu assistente IA. Como posso ajudar?",
    THEME: {
      primary: "#4361ee",
      secondary: "#3f37c9",
      background: "#ffffff",
      text: "#333333"
    }
  };

  // Verifica se já existe
  if (document.getElementById('floating-ai-container')) return;

  // Cria os estilos
  const style = document.createElement('style');
  style.textContent = `
    #floating-ai-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 350px;
      height: 500px;
      background: ${CONFIG.THEME.background};
      border-radius: 15px;
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
      display: flex;
      flex-direction: column;
      z-index: 9999;
      overflow: hidden;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .ai-header {
      background: linear-gradient(135deg, ${CONFIG.THEME.primary}, ${CONFIG.THEME.secondary});
      color: white;
      padding: 12px 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
    }
    .ai-title {
      font-weight: 600;
      font-size: 15px;
    }
    .ai-toggle {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
    }
    .ai-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 15px;
      overflow: hidden;
    }
    .ai-messages {
      flex: 1;
      overflow-y: auto;
      margin-bottom: 15px;
    }
    .message {
      max-width: 85%;
      padding: 10px 15px;
      border-radius: 18px;
      margin-bottom: 10px;
      line-height: 1.4;
      font-size: 14px;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .user-message {
      background: linear-gradient(135deg, ${CONFIG.THEME.primary}, ${CONFIG.THEME.secondary});
      color: white;
      align-self: flex-end;
    }
    .bot-message {
      background: #f5f7fa;
      color: ${CONFIG.THEME.text};
      align-self: flex-start;
    }
    .ai-input-container {
      display: flex;
      gap: 10px;
    }
    #ai-user-input {
      flex: 1;
      padding: 10px 15px;
      border: 1px solid #e0e0e0;
      border-radius: 20px;
      outline: none;
    }
    .ai-send-btn {
      background: linear-gradient(135deg, ${CONFIG.THEME.primary}, ${CONFIG.THEME.secondary});
      color: white;
      border: none;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .typing-indicator {
      display: inline-flex;
      gap: 5px;
    }
    .typing-indicator span {
      width: 8px;
      height: 8px;
      background: #666;
      border-radius: 50%;
      animation: typing 1s infinite;
    }
    @keyframes typing {
      0%, 100% { transform: translateY(0); opacity: 0.6; }
      50% { transform: translateY(-3px); opacity: 1; }
    }
    #floating-ai-container.minimized {
      height: 40px;
      width: 40px;
      overflow: hidden;
    }
    .ai-minimized {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, ${CONFIG.THEME.primary}, ${CONFIG.THEME.secondary});
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      font-weight: bold;
    }
  `;
  document.head.appendChild(style);

  // Cria a estrutura HTML
  const container = document.createElement('div');
  container.id = 'floating-ai-container';
  container.innerHTML = `
    <div class="ai-header">
      <div class="ai-title">Assistente IA</div>
      <button class="ai-toggle" id="ai-toggle-btn">−</button>
    </div>
    <div class="ai-content">
      <div class="ai-messages" id="ai-messages">
        <div class="message bot-message">${CONFIG.INITIAL_MESSAGE}</div>
      </div>
      <div class="ai-input-container">
        <input type="text" id="ai-user-input" placeholder="Digite sua mensagem...">
        <button class="ai-send-btn" id="ai-send-btn">→</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // Cria o ícone minimizado
  const minimizedIcon = document.createElement('div');
  minimizedIcon.className = 'ai-minimized';
  minimizedIcon.innerHTML = 'IA';
  minimizedIcon.style.display = 'none';
  document.body.appendChild(minimizedIcon);

  // Elementos da interface
  const elements = {
    container,
    minimizedIcon,
    header: container.querySelector('.ai-header'),
    toggleBtn: container.querySelector('#ai-toggle-btn'),
    messages: container.querySelector('#ai-messages'),
    input: container.querySelector('#ai-user-input'),
    sendBtn: container.querySelector('#ai-send-btn')
  };

  // Estado do assistente
  const state = {
    isMinimized: false,
    isDragging: false,
    dragStart: { x: 0, y: 0 }
  };

  // Funções principais
  const helpers = {
    scrollToBottom: () => {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    },
    
    addMessage: (text, isUser = false) => {
      const message = document.createElement('div');
      message.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
      message.textContent = text;
      elements.messages.appendChild(message);
      helpers.scrollToBottom();
    },
    
    showTyping: () => {
      const typing = document.createElement('div');
      typing.className = 'message bot-message';
      typing.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
      elements.messages.appendChild(typing);
      helpers.scrollToBottom();
      return typing;
    }
  };

  // Comunicação com a API
  const api = {
    sendMessage: async (message) => {
      try {
        const response = await fetch(`${CONFIG.API_URL}?key=${CONFIG.API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: message }]
            }]
          })
        });
        
        const data = await response.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Não consegui gerar uma resposta.";
      } catch (error) {
        console.error("Erro na API:", error);
        return "Erro ao conectar com a IA. Tente novamente.";
      }
    }
  };

  // Controles da interface
  const controls = {
    toggleMinimize: () => {
      state.isMinimized = !state.isMinimized;
      elements.container.classList.toggle('minimized', state.isMinimized);
      elements.minimizedIcon.style.display = state.isMinimized ? 'flex' : 'none';
      elements.toggleBtn.textContent = state.isMinimized ? '+' : '−';
    },
    
    startDrag: (e) => {
      state.isDragging = true;
      const rect = elements.container.getBoundingClientRect();
      state.dragStart = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      elements.container.style.cursor = 'grabbing';
    },
    
    handleDrag: (e) => {
      if (!state.isDragging) return;
      elements.container.style.left = `${e.clientX - state.dragStart.x}px`;
      elements.container.style.top = `${e.clientY - state.dragStart.y}px`;
    },
    
    endDrag: () => {
      state.isDragging = false;
      elements.container.style.cursor = 'grab';
    },
    
    handleSend: async () => {
      const message = elements.input.value.trim();
      if (!message) return;
      
      // Adiciona mensagem do usuário
      helpers.addMessage(message, true);
      elements.input.value = '';
      
      // Mostra indicador de digitação
      const typing = helpers.showTyping();
      
      // Obtém resposta da IA
      const response = await api.sendMessage(message);
      typing.remove();
      helpers.addMessage(response);
    }
  };

  // Event listeners
  elements.toggleBtn.addEventListener('click', controls.toggleMinimize);
  elements.minimizedIcon.addEventListener('click', controls.toggleMinimize);
  
  elements.header.addEventListener('mousedown', controls.startDrag);
  document.addEventListener('mousemove', controls.handleDrag);
  document.addEventListener('mouseup', controls.endDrag);
  
  elements.sendBtn.addEventListener('click', controls.handleSend);
  elements.input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') controls.handleSend();
  });
})();
