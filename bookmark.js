(async () => {
  const SCRIPT_NAME = "Gemini Chat";
  console.log(`Iniciando ${SCRIPT_NAME}...`);

  const TOAST_BACKGROUND_COLOR = 'rgba(20, 20, 20, 0.9)';
  const TOAST_TEXT_COLOR = '#f0f0f0';

  function injectToastStyles() {
    const styleId = 'hck-toast-styles';
    if (document.getElementById(styleId)) return;

    const css = `
      @keyframes toastProgress {
        from { width: 100%; }
        to { width: 0%; }
      }
      .hck-toast-with-progress {
        position: relative;
        overflow: hidden;
      }
      .hck-toast-with-progress::after {
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
        fontSize: '13.5px',
        fontFamily: "'Inter', system-ui, sans-serif",
        color: TOAST_TEXT_COLOR,
        padding: '12px 18px',
        paddingBottom: '17px',
        borderRadius: '8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(8px)',
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
        toastInstance.toastElement.classList.add('hck-toast-with-progress');
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
      script.onerror = () => reject(new Error(`Falha ao carregar ${url}`));
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
      link.onerror = () => reject(new Error(`Falha ao carregar ${url}`));
      document.head.appendChild(link);
    });
  }

  function createChatbotWindow() {
    if (document.getElementById('gc')) {
      // apenas alterna visibilidade
      const c = document.getElementById('gc');
      c.style.display = c.style.display === 'none' ? 'flex' : 'none';
      return;
    }

    const d = document;
    const b = d.body;
    const c = d.createElement('div');
    c.id = 'gc';
    c.style = 'position:fixed;top:10px;right:10px;width:350px;height:500px;background:#101623;color:#edf3ff;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:9999;overflow:hidden;font-family:Poppins,sans-serif;display:flex;flex-direction:column;';
    
    c.innerHTML = `
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        .h{font-size:1.2rem;background:linear-gradient(to right,#1d7efd,#8f6fff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
        .sh{color:#97a7ca;font-size:1rem;}
        .cc{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;}
        .ci{cursor:pointer;padding:8px;width:calc(50% - 4px);border-radius:8px;background:#283045;font-size:0.8rem;}
        .ci:hover{background:#333e58;}
        #mc{flex:1;overflow-y:auto;padding:10px;}
        .m{display:flex;gap:8px;margin:5px 0;}
        .ma{width:25px;height:25px;border-radius:50%;background:#283045;display:flex;align-items:center;justify-content:center;}
        .mu{flex-direction:row-reverse;}
        .mu .msgc{background:#283045;border-radius:10px 10px 2px 10px;padding:8px;max-width:80%;}
        .mb .msgc{background:#1a1f2e;border-radius:10px 2px 10px 10px;padding:8px;}
        .pc{padding:10px;background:#101623;border-top:1px solid #283045;}
        .pf{display:flex;background:#283045;border-radius:20px;padding:0 10px;}
        .pi{flex:1;border:none;background:none;color:#edf3ff;outline:none;padding:8px;}
        .pb{background:none;border:none;color:#edf3ff;cursor:pointer;}
        .pr{display:none;position:relative;margin-top:5px;}
        .pri{max-width:60px;max-height:60px;border-radius:8px;object-fit:cover;}
        .prc{position:absolute;top:-5px;right:-5px;background:#d62939;color:white;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:0.7rem;}
      </style>
      <div style="padding:15px;">
        <h2 class="h">Gemini Chat</h2>
        <p class="sh">Como posso ajudar?</p>
      </div>
      <div class="cc">
        <div class="ci">Setup home office</div>
        <div class="ci">Evoluir em dev</div>
        <div class="ci">Debugar JS</div>
        <div class="ci">Componente React</div>
      </div>
      <div id="mc"></div>
      <div class="pc">
        <div class="pr" id="pr">
          <div class="prc" id="prc">×</div>
        </div>
        <form class="pf" id="pf">
          <input type="file" id="fi" style="display:none" accept="image/*">
          <button type="button" class="pb" id="ab">📎</button>
          <input type="text" placeholder="Pergunte" class="pi" id="pi" required>
          <button type="submit" class="pb">➤</button>
        </form>
      </div>
    `;
    
    b.appendChild(c);
    initChatbot();
    sendToast("Gemini Chat pronto! Pressione F10 para mostrar/esconder", 3000);
  }

  function initChatbot() {
    const mc = document.getElementById('mc');
    const pf = document.getElementById('pf');
    const pi = document.getElementById('pi');
    const fi = document.getElementById('fi');
    const ab = document.getElementById('ab');
    const pr = document.getElementById('pr');
    const API_KEY = "AIzaSyBDdSZkgQphf5BORTDLcEUbJWcIAIo0Yr8";
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
    let ch = [];
    let fd = null;

    ab.onclick = () => fi.click();

    fi.onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = e => {
        fd = { type: f.type, data: e.target.result.split(',')[1] };
        pr.innerHTML = `<img src="${e.target.result}" class="pri"><div class="prc">×</div>`;
        pr.style.display = 'block';
      };
      r.readAsDataURL(f);
    };

    pr.onclick = e => {
      if (e.target.classList.contains('prc')) {
        fd = null;
        pr.style.display = 'none';
        fi.value = '';
      }
    };

    pf.onsubmit = async e => {
      e.preventDefault();
      const q = pi.value.trim();
      if (!q) return;
      pi.value = '';

      const mu = document.createElement('div');
      mu.className = 'm mu';
      let umc = `<div class="msgc">${q}</div>`;
      if (fd) {
        umc += `<img src="data:${fd.type};base64,${fd.data}" class="pri">`;
      }
      mu.innerHTML = '<div class="ma">👤</div>' + umc;
      mc.appendChild(mu);

      const mb = document.createElement('div');
      mb.className = 'm mb';
      mb.innerHTML = '<div class="ma">🤖</div><div class="msgc">Digitando...</div>';
      mc.appendChild(mb);
      mc.scrollTop = mc.scrollHeight;

      const parts = [{ text: q }];
      if (fd) parts.push({ inline_data: { mime_type: fd.type, data: fd.data } });
      ch.push({ role: "user", parts });
      fd = null;
      pr.style.display = 'none';
      fi.value = '';

      try {
        sendToast("Processando pergunta...", 2000);
        const r = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: ch })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error.message);
        let rt = data.candidates[0].content.parts[0].text;
        rt = rt.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        mb.querySelector('.msgc').innerHTML = rt;
        ch.push({ role: "model", parts: [{ text: rt }] });
        sendToast("Resposta recebida!", 2000);
      } catch (e) {
        mb.querySelector('.msgc').textContent = 'Erro: ' + e.message;
        sendToast("Erro ao processar", 3000);
      }
      mc.scrollTop = mc.scrollHeight;
    };

    document.querySelectorAll('.ci').forEach(i => {
      i.onclick = () => {
        pi.value = i.textContent;
        pf.dispatchEvent(new Event('submit'));
      };
    });
  }

  try {
    await loadCss('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap');
    await loadCss('https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css');
    await loadScript('https://cdn.jsdelivr.net/npm/toastify-js');
    injectToastStyles();

    sendToast(`>> ${SCRIPT_NAME} Injetado!`, 3000);
    sendToast("Pressione F10 para abrir o chatbot", 3000);

    const btn = document.createElement('button');
    btn.textContent = '💬';
    btn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #1d7efd;
      color: white;
      border: none;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 9998;
    `;
    btn.onclick = createChatbotWindow;
    document.body.appendChild(btn);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'F10') {
        e.preventDefault();
        createChatbotWindow();
      }
    });

  } catch (error) {
    console.error("[GEMINI CHAT] Falha ao carregar dependências:", error);
    alert(`${SCRIPT_NAME}: Erro ao carregar dependências.`);
  }
})();
