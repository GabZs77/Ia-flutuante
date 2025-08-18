// Assistente IA Flutuante - Versão 2.0
// Código corrigido e testado

// Configurações principais
const AI_CONFIG = {
  API_KEY: "AIzaSyDSIy5m7mTXlMMR_OOdCu2Af_EwoCd124w", // Substitua pela sua chave real
  MODEL: "gemini-pro",
  API_URL: "https://generativelanguage.googleapis.com/v1beta/models",
  INITIAL_MESSAGE: "Olá! Sou seu assistente de IA. Como posso ajudar hoje?",
  THEME: {
    primary: "#4361ee",
    secondary: "#3f37c9",
    background: "#ffffff",
    text: "#333333"
  }
};

// Verifica se o assistente já foi carregado
if (window.AI_ASSISTANT_LOADED) {
  console.log("Assistente IA já está carregado");
} else {
  window.AI_ASSISTANT_LOADED = true;
  
  // Inicializa o assistente
  function initAssistant() {
    // Cria os estilos
    const style = document.createElement('style');
    style.id = 'ai-assistant-styles';
    style.textContent = `
      #floating-ai-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 350px;
        height: 500px;
        background: ${AI_CONFIG.THEME.background};
        border-radius: 15px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        display: flex;
        flex-direction: column;
        z-index: 99999;
        transition: all 0.3s ease;
        overflow: hidden;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        border: 1px solid #e0e0e0;
      }
      
      #floating-ai-container.minimized {
        height: 50px;
        width: 50px;
        overflow: hidden;
      }
      
      .ai-header {
        background: linear-gradient(135deg, ${AI_CONFIG.THEME.primary}, ${AI_CONFIG.THEME.secondary});
        color: white;
        padding: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      }
      
      .ai-title {
        font-weight: bold;
        font-size: 16px;
      }
      
      .ai-toggle {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.2s;
      }
      
      .ai-toggle:hover {
        background: rgba(255,255,255,0.2);
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
        scroll-behavior: smooth;
      }
      
      .message {
        max-width: 85%;
        padding: 10px 15px;
        border-radius: 18px;
        margin-bottom: 10px;
        line-height: 1.4;
        font-size: 14px;
        word-wrap: break-word;
        animation: fadeIn 0.3s ease;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .user-message {
        background: linear-gradient(135deg, ${AI_CONFIG.THEME.primary}, ${AI_CONFIG.THEME.secondary});
        color: white;
        align-self: flex-end;
        border-bottom-right-radius: 5px;
      }
      
      .bot-message {
        background: #f1f3f5;
        color: ${AI_CONFIG.THEME.text};
        align-self: flex-start;
        border-bottom-left-radius: 5px;
      }
      
      .ai-input-container {
        display: flex;
        gap: 10px;
        padding-top: 10px;
        border-top: 1px solid #eee;
      }
      
      #ai-user-input {
        flex: 1;
        padding: 10px 15px;
        border: 1px solid #ddd;
        border-radius: 20px;
        outline: none;
        font-size: 14px;
        transition: border 0.2s;
      }
      
      #ai-user-input:focus {
        border-color: ${AI_CONFIG.THEME.primary};
      }
      
      .ai-send-btn {
        background: linear-gradient(135deg, ${AI_CONFIG.THEME.primary}, ${AI_CONFIG.THEME.secondary});
        color: white;
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s;
      }
      
      .ai-send-btn:hover {
        transform: scale(1.05);
      }
      
      .ai-send-btn:active {
        transform: scale(0.95);
      }
      
      .typing-indicator {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      
      .typing-indicator span {
        height: 8px;
        width: 8px;
        background-color: #666;
        border-radius: 50%;
        display: inline-block;
        animation: typing 1.4s infinite ease-in-out;
      }
      
      @keyframes typing {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
        30% { transform: translateY(-4px); opacity: 1; }
      }
      
      .ai-minimized {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        background: linear-gradient(135deg, ${AI_CONFIG.THEME.primary}, ${AI_CONFIG.THEME.secondary});
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 99999;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        font-weight: bold;
        font-size: 16px;
        user-select: none;
      }
    `;
    document.head.appendChild(style);

    // Cria a estrutura HTML
    const container = document.createElement('div');
    container.id = 'floating-ai-container';
    container.innerHTML = `
      <div class="ai-header" id="ai-header">
        <div class="ai-title">Assistente IA</div>
        <button class="ai-toggle" id="ai-toggle-btn">−</button>
      </div>
      <div class="ai-content">
        <div class="ai-messages" id="ai-messages">
          <div class="message bot-message">${AI_CONFIG.INITIAL_MESSAGE}</div>
        </div>
        <div class="ai-input-container">
          <input type="text" id="ai-user-input" placeholder="Digite sua mensagem..." autocomplete="off">
          <button class="ai-send-btn" id="ai-send-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13"></path>
              <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
            </svg>
          </button>
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
      header: document.getElementById('ai-header'),
      toggleBtn: document.getElementById('ai-toggle-btn'),
      messages: document.getElementById('ai-messages'),
      input: document.getElementById('ai-user-input'),
      sendBtn: document.getElementById('ai-send-btn')
    };

    // Estado do assistente
    const state = {
      isMinimized: false,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      offsetX: 0,
      offsetY: 0
    };

    // Funções auxiliares
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
      },
      
      hideTyping: (typingElement) => {
        if (typingElement && typingElement.parentNode) {
          typingElement.remove();
        }
      }
    };

    // Comunicação com a API Gemini
    const api = {
      sendMessage: async (message) => {
        try {
          const response = await fetch(
            `${AI_CONFIG.API_URL}/${AI_CONFIG.MODEL}:generateContent?key=${AI_CONFIG.API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{ text: message }]
                }]
              })
            }
          );
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const data = await response.json();
          return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Não entendi sua pergunta. Pode reformular?";
        } catch (error) {
          console.error("Erro na API Gemini:", error);
          return "Desculpe, estou tendo problemas para me conectar. Tente novamente mais tarde.";
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
        if (e.target !== elements.header && e.target !== elements.toggleBtn) return;
        
        state.isDragging = true;
        const rect = elements.container.getBoundingClientRect();
        state.offsetX = e.clientX - rect.left;
        state.offsetY = e.clientY - rect.top;
        elements.container.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      },
      
      handleDrag: (e) => {
        if (!state.isDragging) return;
        
        elements.container.style.left = `${e.clientX - state.offsetX}px`;
        elements.container.style.top = `${e.clientY - state.offsetY}px`;
        elements.container.style.right = 'auto';
        elements.container.style.bottom = 'auto';
      },
      
      endDrag: () => {
        state.isDragging = false;
        elements.container.style.cursor = 'grab';
        document.body.style.userSelect = '';
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
        helpers.hideTyping(typing);
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
      if (e.key === 'Enter') {
        controls.handleSend();
      }
    });
  }

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initAssistant, 1);
  } else {
    document.addEventListener('DOMContentLoaded', initAssistant);
  }
}
