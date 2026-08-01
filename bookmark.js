(function(){
    // Função para remover bloqueios de copiar e colar
    function removeCopyPasteBlock() {
        let blocked = false;
        
        // Intercepta eventos em fase de captura
        document.addEventListener('copy', e => e.stopImmediatePropagation(), true);
        document.addEventListener('cut', e => e.stopImmediatePropagation(), true);
        document.addEventListener('paste', e => e.stopImmediatePropagation(), true);
        document.addEventListener('contextmenu', e => e.stopImmediatePropagation(), true);
        document.addEventListener('selectstart', e => e.stopImmediatePropagation(), true);
        document.addEventListener('dragstart', e => e.stopImmediatePropagation(), true);
        document.addEventListener('mousedown', e => {
            if (e.button === 2) {
                e.stopImmediatePropagation();
            }
        });
        
        // Restaura estilos de seleção
        document.body.style.userSelect = 'auto';
        document.body.style.webkitUserSelect = 'auto';
        document.body.style.mozUserSelect = 'auto';
        document.body.style.msUserSelect = 'auto';
        
        // Remove bloqueios de todos os elementos
        document.querySelectorAll('*').forEach(el => {
            el.style.userSelect = 'auto';
            el.style.webkitUserSelect = 'auto';
            el.style.mozUserSelect = 'auto';
            el.style.msUserSelect = 'auto';
            
            if (el.oncopy) el.oncopy = null;
            if (el.oncut) el.oncut = null;
            if (el.onpaste) el.onpaste = null;
            if (el.oncontextmenu) el.oncontextmenu = null;
            if (el.onselectstart) el.onselectstart = null;
        });
        
        // Remove handlers do documento
        if (document.oncopy) document.oncopy = null;
        if (document.oncut) document.oncut = null;
        if (document.onpaste) document.onpaste = null;
        if (document.oncontextmenu) document.oncontextmenu = null;
        if (document.onselectstart) document.onselectstart = null;
        
        // Remove handlers do body
        if (document.body.oncopy) document.body.oncopy = null;
        if (document.body.oncut) document.body.oncut = null;
        if (document.body.onpaste) document.body.onpaste = null;
        if (document.body.oncontextmenu) document.body.oncontextmenu = null;
        if (document.body.onselectstart) document.body.onselectstart = null;
        
        // Cria notificação
        let notification = document.createElement('div');
        notification.textContent = '🔓 Bloqueio removido!';
        notification.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#4CAF50;color:white;padding:12px 24px;border-radius:25px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;z-index:9999999;box-shadow:0 4px 15px rgba(0,0,0,0.3);animation:slideDown 0.3s ease-out;pointer-events:none;';
        
        // Adiciona animação
        let style = document.createElement('style');
        style.textContent = '@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-20px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}';
        document.head.appendChild(style);
        document.body.appendChild(notification);
        
        // Remove notificação após 2 segundos
        setTimeout(() => {
            notification.style.transition = 'opacity 0.3s, transform 0.3s';
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
        
        return true;
    }
    
    // Executa a remoção de bloqueios
    removeCopyPasteBlock();
    
    // Verifica se a janela já existe
    if (document.getElementById('ia-floating-window')) {
        var win = document.getElementById('ia-floating-window');
        var iframe = document.getElementById('ia-iframe');
        var toggleBtn = document.getElementById('ia-toggle-btn');
        
        if (win.style.display === 'none') {
            win.style.display = 'flex';
            iframe.style.display = 'block';
            toggleBtn.textContent = '−';
            win.style.height = '500px';
        } else {
            win.style.display = 'none';
        }
        return;
    }
    
    // Cria o container principal
    var container = document.createElement('div');
    container.id = 'ia-floating-window';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;width:400px;height:500px;z-index:999999;box-shadow:0 5px 25px rgba(0,0,0,0.3);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;background:#fff;transition:opacity 0.2s;';
    
    // Cria o cabeçalho
    var header = document.createElement('div');
    header.id = 'ia-header';
    header.style.cssText = 'background:#1a1a2e;color:white;padding:10px 15px;display:flex;justify-content:space-between;align-items:center;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;cursor:move;touch-action:none;user-select:none;-webkit-user-select:none;';
    header.innerHTML = '<span>🤖 Assistente IA</span>';
    
    // Container dos botões
    var btnContainer = document.createElement('div');
    
    // Botão Toggle
    var toggleBtn = document.createElement('button');
    toggleBtn.id = 'ia-toggle-btn';
    toggleBtn.textContent = '−';
    toggleBtn.style.cssText = 'background:#e94560;color:white;border:none;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:18px;font-weight:bold;display:flex;align-items:center;justify-content:center;margin-right:5px;transition:all 0.2s;';
    
    toggleBtn.onmouseover = function() { this.style.background = '#c73652'; };
    toggleBtn.onmouseout = function() { this.style.background = '#e94560'; };
    toggleBtn.onclick = function(e) {
        e.stopPropagation();
        var iframe = document.getElementById('ia-iframe');
        if (iframe.style.display === 'none') {
            iframe.style.display = 'block';
            this.textContent = '−';
            container.style.height = '500px';
        } else {
            iframe.style.display = 'none';
            this.textContent = '+';
            container.style.height = 'auto';
        }
    };
    
    // Botão Fechar
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:#e94560;color:white;border:none;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;font-weight:bold;display:flex;align-items:center;justify-content:center;transition:all 0.2s;';
    
    closeBtn.onmouseover = function() { this.style.background = '#c73652'; };
    closeBtn.onmouseout = function() { this.style.background = '#e94560'; };
    closeBtn.onclick = function(e) {
        e.stopPropagation();
        container.remove();
        document.removeEventListener('keydown', keyHandler);
    };
    
    // Monta os botões
    btnContainer.appendChild(toggleBtn);
    btnContainer.appendChild(closeBtn);
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '5px';
    header.appendChild(btnContainer);
    
    // Cria o iframe
    var iframe = document.createElement('iframe');
    iframe.id = 'ia-iframe';
    iframe.src = 'https://internet-gg.vercel.app';
    iframe.style.cssText = 'flex:1;border:none;width:100%;height:100%;';
    
    // Monta a janela
    container.appendChild(header);
    container.appendChild(iframe);
    document.body.appendChild(container);
    
    // Sistema de arraste
    var isDragging = false;
    var startX, startY, initialLeft, initialTop;
    
    function getClientPos(e) {
        if (e.touches) {
            return {
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY
            };
        }
        return {
            clientX: e.clientX,
            clientY: e.clientY
        };
    }
    
    function onStart(e) {
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        isDragging = true;
        var pos = getClientPos(e);
        startX = pos.clientX;
        startY = pos.clientY;
        var rect = container.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        container.style.transition = 'none';
        container.style.cursor = 'grabbing';
    }
    
    function onMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        var pos = getClientPos(e);
        var dx = pos.clientX - startX;
        var dy = pos.clientY - startY;
        var newLeft = initialLeft + dx;
        var newTop = initialTop + dy;
        var maxX = window.innerWidth - container.offsetWidth;
        var maxY = window.innerHeight - container.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxX));
        newTop = Math.max(0, Math.min(newTop, maxY));
        container.style.left = newLeft + 'px';
        container.style.top = newTop + 'px';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
    }
    
    function onEnd() {
        if (!isDragging) return;
        isDragging = false;
        container.style.cursor = '';
        container.style.transition = '';
    }
    
    // Eventos de mouse e touch
    header.addEventListener('mousedown', onStart);
    header.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
    
    // KeyBind F10
    function keyHandler(e) {
        if (e.key === 'F10') {
            e.preventDefault();
            var win = document.getElementById('ia-floating-window');
            var iframe = document.getElementById('ia-iframe');
            var btn = document.getElementById('ia-toggle-btn');
            if (!win) return;
            
            if (win.style.display === 'none') {
                win.style.display = 'flex';
                iframe.style.display = 'block';
                btn.textContent = '−';
                win.style.height = '500px';
            } else {
                win.style.display = 'none';
            }
        }
    }
    
    document.addEventListener('keydown', keyHandler);
})();
