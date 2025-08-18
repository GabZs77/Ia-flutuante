// script.js para bookmarklet
(function() {
    // Verificar se a janela já existe
    if (document.getElementById('ia-chat-window')) {
        const chatWindow = document.getElementById('ia-chat-window');
        chatWindow.style.display = chatWindow.style.display === 'none' ? 'flex' : 'none';
        return;
    }

    // Estilos CSS para a janela flutuante
    const styles = `
        :root {
            --primary: #4361ee;
            --primary-dark: #3a56d4;
            --secondary: #3f37c9;
            --accent: #4cc9f0;
            --light: #f8f9fa;
            --dark: #212529;
            --gray: #6c757d;
            --success: #06ffa5;
            --danger: #ff006e;
            --shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            --transition: all 0.3s ease;
        }
        
        #ia-chat-window {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 400px;
            height: 600px;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            z-index: 9999;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            transition: var(--transition);
        }
        
        #ia-chat-window.minimized {
            height: 60px;
        }
        
        .chat-header {
            background: linear-gradient(90deg, var(--primary), var(--secondary));
            color: white;
            padding: 15px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .chat-header h2 {
            margin: 0;
            font-size: 1.2rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .chat-controls {
            display: flex;
            gap: 8px;
        }
        
        .control-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: var(--transition);
        }
        
        .control-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        #chatBox {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .message {
            max-width: 80%;
            padding: 12px;
            border-radius: 18px;
            line-height: 1.4;
            animation: fadeIn 0.3s ease;
            word-wrap: break-word;
            font-size: 0.9rem;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .message.user {
            align-self: flex-end;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
            border-bottom-right-radius: 5px;
        }
        
        .message.bot {
            align-self: flex-start;
            background-color: #f1f3f5;
            color: var(--dark);
            border-bottom-left-radius: 5px;
        }
        
        .message.bot pre {
            background-color: #282c34;
            color: #abb2bf;
            padding: 10px;
            border-radius: 8px;
            overflow-x: auto;
            margin-top: 8px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 0.8rem;
        }
        
        .message.bot code {
            font-family: 'Consolas', 'Monaco', monospace;
            background-color: rgba(0, 0, 0, 0.05);
            padding: 2px 4px;
            border-radius: 4px;
        }
        
        .input-container {
            padding: 15px;
            background-color: #f8f9fa;
            border-top: 1px solid #e9ecef;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        #userInput {
            flex: 1;
            padding: 10px 15px;
            border: 1px solid #ced4da;
            border-radius: 20px;
            font-size: 0.9rem;
            outline: none;
            transition: var(--transition);
            background-color: white;
            color: var(--dark);
        }
        
        #userInput:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.2);
        }
        
        .btn {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: none;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1rem;
            transition: var(--transition);
        }
        
        .btn:hover {
            transform: scale(1.05);
        }
        
        .typing-indicator {
            display: inline-flex;
            align-items: center;
        }
        
        .typing-indicator span {
            height: 6px;
            width: 6px;
            background-color: var(--gray);
            border-radius: 50%;
            display: inline-block;
            margin: 0 2px;
            animation: typing 1.4s infinite;
        }
        
        .typing-indicator span:nth-child(2) {
            animation-delay: 0.2s;
        }
        
        .typing-indicator span:nth-child(3) {
            animation-delay: 0.4s;
        }
        
        @keyframes typing {
            0%, 60%, 100% {
                transform: translateY(0);
                opacity: 0.7;
            }
            30% {
                transform: translateY(-10px);
                opacity: 1;
            }
        }
        
        #minimizeBtn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            box-shadow: var(--shadow);
            z-index: 9998;
            transition: var(--transition);
        }
        
        #minimizeBtn:hover {
            transform: scale(1.1);
        }
        
        .file-preview {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 8px;
            background-color: rgba(255, 255, 255, 0.7);
            border-radius: 8px;
            margin-bottom: 8px;
            max-height: 120px;
            overflow-y: auto;
        }
        
        .file-item {
            position: relative;
            width: 70px;
            height: 70px;
            border-radius: 6px;
            overflow: hidden;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }
        
        .file-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .file-item .file-info {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0, 0, 0, 0.6);
            color: white;
            padding: 3px;
            font-size: 0.6rem;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .file-item .remove-file {
            position: absolute;
            top: 3px;
            right: 3px;
            background: rgba(255, 0, 0, 0.7);
            color: white;
            border: none;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 0.6rem;
        }
    `;

    // Adicionar estilos ao documento
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);

    // Criar a janela de chat
    const chatWindow = document.createElement('div');
    chatWindow.id = 'ia-chat-window';
    chatWindow.innerHTML = `
        <div class="chat-header" id="chatHeader">
            <h2><i class="fas fa-robot"></i> Assistente IA</h2>
            <div class="chat-controls">
                <button class="control-btn" id="minimizeChatBtn" title="Minimizar">
                    <i class="fas fa-minus"></i>
                </button>
                <button class="control-btn" id="closeChatBtn" title="Fechar">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
        <div id="chatBox">
            <div class="message bot">
                Olá! Sou seu assistente de IA. Como posso ajudar você hoje?
            </div>
        </div>
        <div id="filePreview" class="file-preview" style="display: none;"></div>
        <div class="input-container">
            <input type="text" id="userInput" placeholder="Digite sua mensagem..." onkeypress="handleKeyPress(event)">
            <button class="btn" onclick="sendMessage()" title="Enviar mensagem">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>
    `;
    document.body.appendChild(chatWindow);

    // Adicionar Font Awesome para os ícones
    const fontAwesome = document.createElement('link');
    fontAwesome.rel = 'stylesheet';
    fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(fontAwesome);

    // Botão de minimizar/maximizar
    const minimizeBtn = document.createElement('button');
    minimizeBtn.id = 'minimizeBtn';
    minimizeBtn.innerHTML = '<i class="fas fa-comments"></i>';
    minimizeBtn.style.display = 'none';
    document.body.appendChild(minimizeBtn);

    // Variáveis globais
    const API_KEY = "AIzaSyDSIy5m7mTXlMMR_OOdCu2Af_EwoCd124w"; // Replace with your Gemini API Key
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
    let selectedFiles = [];
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    // Funções de arrastar
    const chatHeader = document.getElementById('chatHeader');
    
    chatHeader.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        if (e.target.closest('.control-btn')) return;
        
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (e.target === chatHeader || e.target.parentElement === chatHeader) {
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            chatWindow.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }

    // Funções de controle da janela
    document.getElementById('minimizeChatBtn').addEventListener('click', function() {
        chatWindow.classList.add('minimized');
        minimizeBtn.style.display = 'flex';
    });

    minimizeBtn.addEventListener('click', function() {
        chatWindow.classList.remove('minimized');
        minimizeBtn.style.display = 'none';
    });

    document.getElementById('closeChatBtn').addEventListener('click', function() {
        chatWindow.style.display = 'none';
        minimizeBtn.style.display = 'flex';
    });

    // Funções do chat
    window.handleKeyPress = function(event) {
        if (event.key === "Enter") {
            sendMessage();
        }
    };

    window.sendMessage = function() {
        const input = document.getElementById("userInput");
        const userText = input.value.trim();
        
        if (!userText) return;
        
        addMessage("user", userText);
        input.value = "";
        getBotResponse(userText);
    };

    function addMessage(sender, text) {
        const msg = document.createElement("div");
        msg.className = `message ${sender}`;
        if (sender === "bot" && text.includes("`")) {
            const parsed = parseCode(text);
            msg.innerHTML = parsed;
        } else {
            msg.innerText = text;
        }
        document.getElementById("chatBox").appendChild(msg);
        document.getElementById("chatBox").scrollTop = document.getElementById("chatBox").scrollHeight;
    }

    function parseCode(text) {
        return text.replace(/`(\w+)?([\s\S]*?)`/g, (_, lang, code) => {
            return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
        });
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    async function getBotResponse(prompt) {
        const thinking = document.createElement("div");
        thinking.className = "message bot";
        thinking.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        document.getElementById("chatBox").appendChild(thinking);
        document.getElementById("chatBox").scrollTop = document.getElementById("chatBox").scrollHeight;
        
        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await res.json();
            const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ No response.";
            thinking.remove();
            addMessage("bot", aiText);
        } catch (err) {
            thinking.remove();
            addMessage("bot", "⚠️ Error getting response.");
        }
    }
})();
