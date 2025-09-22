(async () => {
  const SCRIPT_NAME = "HCK TAREFAS";
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
        fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
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

      const oldTitle = document.title;
      document.title = `${SCRIPT_NAME} Fez a Boa!`;
      setTimeout(() => { document.title = oldTitle; }, 3000);

    } catch (error) {
      console.error("[HCK TAREFAS] Falha detalhada ao transformar ou enviar respostas corrigidas:", error);
      sendToast(`Erro na correção: ${error.message}`, 5000);
    }
  }

  let capturedLoginData = null;
  let isToastifyLoaded = false;
  const originalFetch = window.fetch;

  try {
    await loadCss('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap');
    await loadCss('https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css');
    await loadScript('https://cdn.jsdelivr.net/npm/toastify-js');
    isToastifyLoaded = true;
    injectToastStyles();

    sendToast(`>> ${SCRIPT_NAME} Injetado! Aguardando login...`, 3000);
    sendToast("Créditos: inacallep, miitch, crackingnlearn, hackermoon", 5000);

  } catch (error) {
    console.error("[HCK TAREFAS] Falha ao carregar dependências (Toastify ou Fonte):", error);
    alert(`${SCRIPT_NAME}: Erro ao carregar dependências. Notificações podem falhar.`);
  }

  // Criar janela flutuante de IA
  const createAIWindow = () => {
    if (document.getElementById('gemini-chat-window')) {
      document.getElementById('gemini-chat-window').remove();
      return;
    }

    const d = document;
    const b = d.body;
    const c = d.createElement('div');
    c.id = 'gemini-chat-window';
    c.style = 'position:fixed;top:10px;right:10px;width:350px;height:500px;background:#101623;color:#edf3ff;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:9999;overflow:hidden;font-family:Poppins,sans-serif;display:flex;flex-direction:column;';
    
    c.innerHTML = `
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        .h{font-size:1.2rem;background:linear-gradient(to right,#1d7efd,#8f6fff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
        .sh{color:#97a7ca;font-size:1rem;}
        .cc{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;}
        .ci{cursor:pointer;padding:8px;width:calc(50% - 4px);border-radius:8px;background:#283045;font-size:0.8rem;}
        .ci:hover{background:#333e58;}
        .mc{flex:1;overflow-y:auto;padding:10px;}
        .m{display:flex;gap:8px;margin:5px 0;}
        .ma{width:25px;height:25px;border-radius:50%;background:#283045;display:flex;align-items:center;justify-content:center;}
        .mu{flex-direction:row-reverse;}
        .mu .mc{background:#283045;border-radius:10px 10px 2px 10px;padding:8px;max-width:80%;}
        .mb .mc{background:#1a1f2e;border-radius:10px 2px 10px 10px;padding:8px;}
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
      <div class="mc" id="mc"></div>
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
    
    // Inicializar funcionalidades do chatbot
    const mc = d.getElementById('mc');
    const pf = d.getElementById('pf');
    const pi = d.getElementById('pi');
    const fi = d.getElementById('fi');
    const ab = d.getElementById('ab');
    const pr = d.getElementById('pr');
    const prc = d.getElementById('prc');
    const API_KEY = "AIzaSyDSIy5m7mTXlMMR_OOdCu2Af_EwoCd124w";
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
    let ch = [];
    let fd = null;

    ab.onclick = () => fi.click();
    
    fi.onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = e => {
        fd = {
          type: f.type,
          data: e.target.result.split(',')[1]
        };
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
      
      const mu = d.createElement('div');
      mu.className = 'm mu';
      let umc = `<div class="mc">${q}</div>`;
      if (fd) {
        umc += `<img src="data:${fd.type};base64,${fd.data}" class="pri">`;
      }
      mu.innerHTML = '<div class="ma">👤</div>' + umc;
      mc.appendChild(mu);
      
      const mb = d.createElement('div');
      mb.className = 'm mb';
      mb.innerHTML = '<div class="ma">🤖</div><div class="mc">Digitando...</div>';
      mc.appendChild(mb);
      mc.scrollTop = mc.scrollHeight;
      
      const parts = [{text: q}];
      if (fd) parts.push({inline_data: {mime_type: fd.type, data: fd.data}});
      ch.push({role: "user", parts});
      fd = null;
      pr.style.display = 'none';
      fi.value = '';
      
      try {
        sendToast("Processando pergunta...", 2000);
        const r = await fetch(API_URL, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({contents: ch})
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error.message);
        let rt = data.candidates[0].content.parts[0].text;
        rt = rt.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        mb.querySelector('.mc').innerHTML = rt;
        ch.push({role: "model", parts: [{text: rt}]});
        sendToast("Resposta recebida!", 2000);
      } catch (e) {
        mb.querySelector('.mc').textContent = 'Erro: ' + e.message;
        sendToast("Erro ao processar", 3000);
      }
      mc.scrollTop = mc.scrollHeight;
    };
    
    d.querySelectorAll('.ci').forEach(i => {
      i.onclick = () => {
        pi.value = i.textContent;
        pf.dispatchEvent(new Event('submit'));
      };
    });
    
    d.addEventListener('keydown', function(e) {
      if (e.key === 'F10') {
        e.preventDefault();
        c.style.display = c.style.display === 'none' ? 'block' : 'none';
      }
    });
    
    sendToast("Gemini Chat pronto! Pressione F10 para mostrar/esconder", 3000);
  };

  // Criar botão para abrir a janela de IA
  const aiButton = document.createElement('button');
  aiButton.textContent = '🤖';
  aiButton.style.cssText = `
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
  aiButton.addEventListener('click', createAIWindow);
  document.body.appendChild(aiButton);

  // Adicionar evento de teclado F10 para abrir a janela de IA
  document.addEventListener('keydown', function(e) {
    if (e.key === 'F10') {
      e.preventDefault();
      createAIWindow();
    }
  });

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const method = init ? init.method : 'GET';

    if (url === 'https://edusp-api.ip.tv/registration/edusp/token' && !capturedLoginData) {
      try {
        const response = await originalFetch.apply(this, arguments);
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();

        if (data && data.auth_token) {
          capturedLoginData = data;

          if (isToastifyLoaded) {
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
          } else {
            alert(`${SCRIPT_NAME}: Token capturado!`);
          }
        } else {
           console.warn("[HCK TAREFAS] Resposta do token recebida, mas 'auth_token' não encontrado na estrutura esperada:", data);
           if (isToastifyLoaded) {
               sendToast("Erro: Formato de resposta do token inesperado. Ver console.", 5000);
           }
        }
        return response;
      } catch (error) {
        console.error('[HCK TAREFAS] Erro CRÍTICO ao processar resposta do token:', error);
        if (isToastifyLoaded) {
          sendToast("Erro CRÍTICO ao capturar token. Ver console.", 5000);
        } else {
          alert(`${SCRIPT_NAME}: Erro CRÍTICO ao capturar token.`);
        }
        return originalFetch.apply(this, arguments);
      }
    }

    const response = await originalFetch.apply(this, arguments);

    const answerSubmitRegex = /^https:\/\/edusp-api\.ip\.tv\/tms\/task\/\d+\/answer$/;
    if (answerSubmitRegex.test(url) && init && init.method === 'POST') {
      if (!capturedLoginData || !capturedLoginData.auth_token) {
        if (isToastifyLoaded) {
          sendToast("Ops! Token não encontrado. Envie novamente após login.", 4000);
        }
        return response;
      }

      try {
        const clonedResponse = response.clone();
        const submittedData = await clonedResponse.json();

        if (submittedData && submittedData.status !== "draft" && submittedData.id && submittedData.task_id) {
           sendToast("Envio detectado! Iniciando correção...", 2000);

          const headers_template = {
            "x-api-realm": "edusp",
            "x-api-platform": "webclient",
            "x-api-key": capturedLoginData.auth_token,
            "content-type": "application/json"
          };

          setTimeout(async () => {
            try {
              const respostasOriginaisComGabarito = await pegarRespostasCorretas(submittedData.task_id, submittedData.id, headers_template);
              await enviarRespostasCorrigidas(respostasOriginaisComGabarito, submittedData.task_id, submittedData.id, headers_template);
            } catch (correctionError) {
              // Erros já são logados dentro das funções pegar/enviar
            }
          }, 500);
        }
      } catch (err) {
        console.error('[HCK TAREFAS] Erro ao processar a resposta JSON do envio de tarefa POST:', err);
        if (isToastifyLoaded) {
            sendToast("Erro ao processar envio. Ver console.", 5000);
        }
      }
    }

    return response;
  };

  console.log(`[HCK TAREFAS] ${SCRIPT_NAME}: Interceptador de fetch ativo.`);

})();
