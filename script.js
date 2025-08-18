javascript:(function(){
    const style = document.createElement('style');
    style.textContent = `
        #floating-ai-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 350px;
            height: 500px;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            z-index: 9999;
            transition: all 0.3s ease;
            overflow: hidden;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        #floating-ai-container.minimized {
            height: 50px;
            width: 50px;
            overflow: hidden;
        }
        .ai-header {
            background: linear-gradient(135deg, #4361ee, #3f37c9);
            color: white;
            padding: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
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
        }
        .ai-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 15px;
            overflow-y: auto;
        }
        .ai-messages {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 15px;
        }
        .message {
            max-width: 80%;
            padding: 10px 15px;
            border-radius: 18px;
            margin-bottom: 10px;
            line-height: 1.4;
            font-size: 14px;
        }
        .user-message {
            background: linear-gradient(135deg, #4361ee, #3f37c9);
            color: white;
            align-self: flex-end;
            border-bottom-right-radius: 5px;
        }
        .bot-message {
            background: #f1f3f5;
            color: #333;
            align-self: flex-start;
            border-bottom-left-radius: 5px;
        }
        .ai-input-container {
            display: flex;
            gap: 10px;
        }
        #ai-user-input {
            flex: 1;
            padding: 10px 15px;
            border: 1px solid #ddd;
            border-radius: 20px;
            outline: none;
        }
        .ai-send-btn {
            background: linear-gradient(135deg, #4361ee, #3f37c9);
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
            align-items: center;
        }
        .typing-indicator span {
            height: 6px;
            width: 6px;
            background-color: #666;
            border-radius: 50%;
            display: inline-block;
            margin: 0 2px;
            animation: typing 1.4s infinite;
        }
        @keyframes typing {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.7; }
            30% { transform: translateY(-5px); opacity: 1; }
        }
        .ai-minimized {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #4361ee, #3f37c9);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 9999;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'floating-ai-container';
    container.innerHTML = `
        <div class="ai-header" id="ai-toggle-header">
            <div class="ai-title">Assistente IA</div>
            <button class="ai-toggle" id="ai-toggle-btn">−</button>
        </div>
        <div class="ai-content">
            <div class="ai-messages" id="ai-messages">
                <div class="message bot-message">Olá! Como posso ajudar você hoje?</div>
            </div>
            <div class="ai-input-container">
                <input type="text" id="ai-user-input" placeholder="Digite sua mensagem...">
                <button class="ai-send-btn" id="ai-send-btn">→</button>
            </div>
        </div>
    `;
    document.body.appendChild(container);

    const minimizedIcon = document.createElement('div');
    minimizedIcon.className = 'ai-minimized';
    minimizedIcon.innerHTML = 'IA';
    minimizedIcon.style.display = 'none';
    document.body.appendChild(minimizedIcon);

    // Element references
    const toggleBtn = document.getElementById('ai-toggle-btn');
    const toggleHeader = document.getElementById('ai-toggle-header');
    const messagesContainer = document.getElementById('ai-messages');
    const userInput = document.getElementById('ai-user-input');
    const sendBtn = document.getElementById('ai-send-btn');

    // Toggle minimize/maximize
    let isMinimized = false;
    function toggleMinimize() {
        isMinimized = !isMinimized;
        if (isMinimized) {
            container.classList.add('minimized');
            minimizedIcon.style.display = 'flex';
        } else {
            container.classList.remove('minimized');
            minimizedIcon.style.display = 'none';
        }
        toggleBtn.textContent = isMinimized ? '+' : '−';
    }

    toggleHeader.addEventListener('click', toggleMinimize);
    minimizedIcon.addEventListener('click', toggleMinimize);

    // Send message function
    function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        // Add user message
        const userMessage = document.createElement('div');
        userMessage.className = 'message user-message';
        userMessage.textContent = message;
        messagesContainer.appendChild(userMessage);

        userInput.value = '';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Show typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'message bot-message';
        typingIndicator.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        messagesContainer.appendChild(typingIndicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Simulate AI response (replace with actual API call)
        setTimeout(() => {
            typingIndicator.remove();
            
            const botMessage = document.createElement('div');
            botMessage.className = 'message bot-message';
            
            // Replace with actual API response
            const responses = [
                "Entendi sua mensagem sobre: " + message,
                "Posso ajudar com isso. Você quer mais informações sobre: " + message + "?",
                "Ótima pergunta! Sobre " + message + ", posso dizer que...",
                "Vou pesquisar sobre " + message + " para te ajudar melhor."
            ];
            
            botMessage.textContent = responses[Math.floor(Math.random() * responses.length)];
            messagesContainer.appendChild(botMessage);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 1500);
    }

    // Event listeners
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Make draggable
    let isDragging = false;
    let offsetX, offsetY;

    toggleHeader.addEventListener('mousedown', (e) => {
        if (e.target === toggleHeader || e.target === toggleBtn) return;
        
        isDragging = true;
        offsetX = e.clientX - container.getBoundingClientRect().left;
        offsetY = e.clientY - container.getBoundingClientRect().top;
        container.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        container.style.left = (e.clientX - offsetX) + 'px';
        container.style.top = (e.clientY - offsetY) + 'px';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        container.style.cursor = 'pointer';
    });
})();
