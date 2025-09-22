javascript:(() => {
  const GEMINI_API_KEY = "SUA_CHAVE_GEMINI_AQUI"; // <-- coloque sua chave aqui
  const GEMINI_MODEL_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const hasApiKey = !!GEMINI_API_KEY && GEMINI_API_KEY !== "SUA_CHAVE_GEMINI_AQUI";

  if (window.__miniGeminiChatbotOpen) {
    const existing = document.querySelector("#mini-gemini-chatbot-wrapper");
    if (existing) {
      existing.style.display = "block";
      existing.querySelector(".mgcb-input").focus();
    }
    return;
  }
  window.__miniGeminiChatbotOpen = true;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const create = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    for (const k in attrs) {
      if (k === "style") Object.assign(el.style, attrs[k]);
      else if (k.startsWith("on") && typeof attrs[k] === "function") el.addEventListener(k.slice(2), attrs[k]);
      else if (k === "html") el.innerHTML = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (typeof c === "string") el.appendChild(document.createTextNode(c));
      else if (c) el.appendChild(c);
    });
    return el;
  };

  const styleId = "mini-gemini-chatbot-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #mini-gemini-chatbot-wrapper{position:fixed;right:18px;bottom:18px;width:420px;max-width:calc(100% - 36px);z-index:2147483647;font-family:Poppins,system-ui;}
      .mgcb-window{background:#101623;color:#edf3ff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5);overflow:hidden;border:1px solid rgba(255,255,255,.04);display:flex;flex-direction:column;}
      .mgcb-header{display:flex;align-items:center;gap:8px;padding:12px;background:linear-gradient(90deg,#0f1720,#0b1220);cursor:move;user-select:none;}
      .mgcb-title{flex:1;font-weight:600;font-size:16px;background:linear-gradient(to right,#1d7efd,#8f6fff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
      .mgcb-controls{display:flex;gap:6px;}
      .mgcb-btn{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;background:transparent;color:inherit;}
      .mgcb-body{padding:12px;display:flex;flex-direction:column;gap:10px;max-height:340px;overflow:auto;}
      .mgcb-message{display:flex;gap:10px;align-items:flex-start;}
      .mgcb-message.user{justify-content:flex-end;}
      .mgcb-avatar{width:36px;height:36px;border-radius:50%;background:#283045;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;flex-shrink:0;}
      .mgcb-text{max-width:75%;padding:10px 12px;border-radius:10px;line-height:1.4;white-space:pre-wrap;word-break:break-word;font-size:14px;}
      .mgcb-text.bot{background:#0f1624;border:1px solid rgba(255,255,255,.03);}
      .mgcb-text.user{background:#283045;border:1px solid rgba(255,255,255,.03);}
      .mgcb-footer{display:flex;gap:8px;align-items:center;padding:10px;border-top:1px solid rgba(255,255,255,.02);}
      .mgcb-input{flex:1;height:40px;border-radius:999px;padding:8px 14px;border:1px solid rgba(255,255,255,.04);background:transparent;color:inherit;font-size:14px;}
      .mgcb-send{width:44px;height:40px;border-radius:999px;background:#1d7efd;color:white;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;}
      .mgcb-minimized{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#1d7efd;color:#fff;box-shadow:0 10px 20px rgba(29,126,253,.18);cursor:pointer;}
      .mgcb-small-note{font-size:12px;color:#97a7ca;text-align:center;}
    `;
    document.head.appendChild(style);
  }

  const wrapper = create("div", { id: "mini-gemini-chatbot-wrapper" });
  wrapper.innerHTML = `
    <div class="mgcb-window">
      <div class="mgcb-header">
        <div class="mgcb-title">Gemini Chat (mini)</div>
        <div class="mgcb-controls">
          <button class="mgcb-btn" id="mgcb-min-btn">—</button>
          <button class="mgcb-btn" id="mgcb-close-btn">✕</button>
        </div>
      </div>
      <div class="mgcb-body" id="mgcb-body">
        <div class="mgcb-small-note">${hasApiKey ? "Conectado ao Gemini" : "⚠️ Cole sua chave na variável GEMINI_API_KEY"}</div>
      </div>
      <div class="mgcb-footer">
        <input class="mgcb-input" id="mgcb-input" placeholder="Digite..." />
        <button class="mgcb-send" id="mgcb-send">▶</button>
      </div>
    </div>`;
  document.body.appendChild(wrapper);

  const mgcbBody = $("#mgcb-body", wrapper);
  const inputEl = $("#mgcb-input", wrapper);
  const sendBtn = $("#mgcb-send", wrapper);
  const minBtn = $("#mgcb-min-btn", wrapper);
  const closeBtn = $("#mgcb-close-btn", wrapper);

  let minimized = false;
  minBtn.addEventListener("click", () => {
    if (!minimized) {
      wrapper.querySelector(".mgcb-window").style.display = "none";
      const miniBtn = create("div", { class: "mgcb-minimized", id: "mgcb-floating-min" }, ["💬"]);
      document.body.appendChild(miniBtn);
      miniBtn.addEventListener("click", () => {
        miniBtn.remove();
        wrapper.querySelector(".mgcb-window").style.display = "flex";
        inputEl.focus();
      });
      minimized = true;
    }
  });
  closeBtn.addEventListener("click", () => {
    wrapper.remove();
    const floating = document.getElementById("mgcb-floating-min");
    if (floating) floating.remove();
    window.__miniGeminiChatbotOpen = false;
  });

  const addMessage = (text, who = "bot") => {
    const msgWrap = create("div", { class: `mgcb-message ${who === "user" ? "user" : ""}` });
    const avatar = create("div", { class: "mgcb-avatar" }, [ who === "user" ? "🧑" : "🤖" ]);
    const textEl = create("div", { class: `mgcb-text ${who}`, html: text });
    msgWrap.appendChild(who === "user" ? textEl : avatar);
    msgWrap.appendChild(who === "user" ? avatar : textEl);
    mgcbBody.appendChild(msgWrap);
    mgcbBody.scrollTop = mgcbBody.scrollHeight;
  };

  async function generateGeminiResponse(prompt) {
    if (!hasApiKey) return `⚠️ Sem chave API.\nVocê perguntou: ${prompt}`;
    try {
      const res = await fetch(GEMINI_MODEL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ Sem resposta.";
    } catch (err) {
      return "Erro: " + err.message;
    }
  }

  let isResponding = false;
  const sendPrompt = async () => {
    if (isResponding) return;
    const text = inputEl.value.trim();
    if (!text) return;
    isResponding = true;
    addMessage(text, "user");
    inputEl.value = "";
    const placeholder = create("div", { class: "mgcb-message" }, [
      create("div", { class: "mgcb-avatar" }, ["🤖"]),
      create("div", { class: "mgcb-text bot" }, ["Digitando..."])
    ]);
    mgcbBody.appendChild(placeholder);
    mgcbBody.scrollTop = mgcbBody.scrollHeight;
    const resp = await generateGeminiResponse(text);
    placeholder.querySelector(".mgcb-text").textContent = resp;
    isResponding = false;
  };

  sendBtn.addEventListener("click", sendPrompt);
  inputEl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); sendPrompt(); } });

  if (!hasApiKey) addMessage("⚠️ Configure sua chave Gemini em GEMINI_API_KEY.", "bot");
  else addMessage("✅ Pronto! Faça sua pergunta.", "bot");
})();
