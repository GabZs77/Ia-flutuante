/**
 * AI Chat Bookmarklet
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating AI chat interface powered by Pollinations AI (text.pollinations.ai)
 * Design: Material Design 3 · Dark theme · Gemini-like UI · Glassmorphism
 *
 * Usage:
 *   javascript:fetch("https://raw.githubusercontent.com/GabZs77/Ia-flutuante/main/bookmark.js").then(r=>r.text()).then(eval);
 *
 * Toggle: F10 (or run the bookmarklet again)
 */
(function () {
  'use strict';

  // ── Prevent double-load ───────────────────────────────────────────────────
  if (window.__aiChatInstance) {
    window.__aiChatInstance.toggle();
    return;
  }

  // ── Constants ─────────────────────────────────────────────────────────────
  const API_URL       = 'https://text.pollinations.ai/openai';
  const API_MODEL     = 'openai';
  const API_MAX_RETRY = 2;
  const API_TIMEOUT   = 60000;

  const STORAGE = {
    HISTORY:  'aichat_v2_history',
    POSITION: 'aichat_v2_position',
    SIZE:     'aichat_v2_size',
  };

  const CDN = {
    HLJS_CSS: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css',
    HLJS_JS:  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
    MATHJAX:  'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js',
  };

  const SYSTEM_PROMPT = {
    role: 'system',
    content: 'Você é um assistente de IA inteligente e prestativo. Responda sempre em português do Brasil, a menos que o usuário escreva em outro idioma. Seja preciso, claro e conciso.',
  };

  // ── Utility ───────────────────────────────────────────────────────────────
  const Utils = {
    escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    formatTime(date = new Date()) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    },
    debounce(fn, ms) {
      let t;
      return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    },
    uid() {
      return Math.random().toString(36).slice(2, 11);
    },
  };

  // ── Dependency Loader ─────────────────────────────────────────────────────
  class DependencyLoader {
    static _loaded = new Set();

    static css(url) {
      if (this._loaded.has(url)) return Promise.resolve();
      return new Promise(res => {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = url;
        l.onload = () => { this._loaded.add(url); res(); };
        l.onerror = res;
        document.head.appendChild(l);
      });
    }

    static script(url, globalKey) {
      if (this._loaded.has(url)) return Promise.resolve(window[globalKey]);
      if (window[globalKey]) { this._loaded.add(url); return Promise.resolve(window[globalKey]); }
      return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = url; s.async = true;
        s.onload = () => { this._loaded.add(url); res(window[globalKey]); };
        s.onerror = () => rej(new Error('Failed to load: ' + url));
        document.head.appendChild(s);
      });
    }

    static async hljs() {
      await this.css(CDN.HLJS_CSS);
      return this.script(CDN.HLJS_JS, 'hljs').catch(() => null);
    }

    static mathjax() {
      if (window.MathJax?.typesetPromise) return Promise.resolve(window.MathJax);
      window.MathJax = {
        tex: {
          inlineMath: [['$', '$'], ['\\(', '\\)']],
          displayMath: [['$$', '$$'], ['\\[', '\\]']],
        },
        startup: { typeset: false },
      };
      return this.script(CDN.MATHJAX, 'MathJax').catch(() => null);
    }
  }

  // ── Storage ───────────────────────────────────────────────────────────────
  class StorageManager {
    static get(key, fallback = null) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch { return fallback; }
    }
    static set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota */ }
    }
    static remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
  }

  // ── Markdown Parser ───────────────────────────────────────────────────────
  class MarkdownParser {
    static _blocks = [];

    /**
     * Convert markdown text to sanitized HTML.
     * Processes: headings, bold/italic, lists, tables, links, code blocks,
     * inline code, blockquotes, horizontal rules.
     */
    static parse(raw) {
      this._blocks = [];
      let s = raw;

      // 1. Extract fenced code blocks to placeholders
      s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const id = this._blocks.length;
        this._blocks.push({ lang: (lang || 'plaintext').toLowerCase(), code: code.replace(/\n$/, '') });
        return `\x00CODEBLOCK${id}\x00`;
      });

      // 2. Inline code
      s = s.replace(/`([^`\n]+)`/g, (_, c) =>
        `<code class="aichat-inline-code">${Utils.escapeHtml(c)}</code>`
      );

      // 3. Headings
      s = s.replace(/^#{1,6} (.+)$/gm, (m, text) => {
        const level = m.match(/^(#+)/)[1].length;
        return `<h${level} class="aichat-h">${text}</h${level}>`;
      });

      // 4. Bold + italic (order matters: *** before ** before *)
      s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
      s = s.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
      s = s.replace(/_([^_\n]+?)_/g, '<em>$1</em>');

      // 5. Strikethrough
      s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');

      // 6. Tables
      s = this._parseTables(s);

      // 7. Blockquotes
      s = s.replace(/^(>[ \t]*.+\n?)+/gm, match => {
        const inner = match.replace(/^>[ \t]?/gm, '').trim();
        return `<blockquote class="aichat-quote">${inner}</blockquote>\n`;
      });

      // 8. Unordered lists
      s = this._parseList(s, /^([ \t]*[-*+][ \t]+.+\n?)+/gm, false);

      // 9. Ordered lists
      s = this._parseList(s, /^([ \t]*\d+\.[ \t]+.+\n?)+/gm, true);

      // 10. Horizontal rule
      s = s.replace(/^(\s*[-_*]){3,}\s*$/gm, '<hr class="aichat-hr">');

      // 11. Links & images
      s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
        (_, alt, src) => `<img src="${src}" alt="${Utils.escapeHtml(alt)}" class="aichat-img" loading="lazy">`
      );
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        (_, text, href) => `<a href="${Utils.escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="aichat-link">${text}</a>`
      );

      // 12. Wrap in paragraphs (split on blank lines)
      s = s.split(/\n{2,}/).map(block => {
        block = block.trim();
        if (!block) return '';
        // Don't wrap block-level elements
        if (/^<(h[1-6]|ul|ol|li|blockquote|table|pre|hr|img)/.test(block)) return block;
        if (/^\x00CODEBLOCK/.test(block)) return block;
        return `<p class="aichat-p">${block.replace(/\n/g, '<br>')}</p>`;
      }).join('\n');

      // 13. Restore code blocks
      s = s.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, i) => {
        const { lang, code } = this._blocks[+i];
        return this._renderCodeBlock(lang, code);
      });

      return s;
    }

    static _parseTables(s) {
      return s.replace(/(\|[^\n]+\|\n)([ \t]*\|[ \t]*[-:]+[-| \t:]*\|\n)(\|[^\n]+\|\n)*/g, match => {
        const rows = match.trim().split('\n');
        if (rows.length < 2) return match;
        const headers = rows[0].split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(h => h.trim());
        const aligns = rows[1].split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(a => {
          a = a.trim();
          if (a.startsWith(':') && a.endsWith(':')) return 'center';
          if (a.endsWith(':')) return 'right';
          return 'left';
        });
        let html = '<div class="aichat-table-wrap"><table class="aichat-table"><thead><tr>';
        headers.forEach((h, i) => {
          html += `<th style="text-align:${aligns[i] || 'left'}">${h}</th>`;
        });
        html += '</tr></thead><tbody>';
        rows.slice(2).forEach(row => {
          const cells = row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim());
          if (!cells.length) return;
          html += '<tr>';
          cells.forEach((c, i) => { html += `<td style="text-align:${aligns[i] || 'left'}">${c}</td>`; });
          html += '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
      });
    }

    static _parseList(s, re, ordered) {
      return s.replace(re, match => {
        const items = match.trim().split('\n')
          .map(l => l.replace(ordered ? /^[ \t]*\d+\.[ \t]+/ : /^[ \t]*[-*+][ \t]+/, '').trim())
          .filter(Boolean);
        const tag = ordered ? 'ol' : 'ul';
        return `<${tag} class="aichat-list">${items.map(i => `<li>${i}</li>`).join('')}</${tag}>\n`;
      });
    }

    static _renderCodeBlock(lang, code) {
      const id = Utils.uid();
      let highlighted = Utils.escapeHtml(code);
      if (window.hljs) {
        try {
          const l = window.hljs.getLanguage(lang) ? lang : 'plaintext';
          highlighted = window.hljs.highlight(code, { language: l }).value;
        } catch { /* hljs not ready yet */ }
      }
      return `
<div class="aichat-code-block" data-block-id="${id}">
  <div class="aichat-code-header">
    <span class="aichat-code-lang">${Utils.escapeHtml(lang)}</span>
    <button class="aichat-copy-code-btn" onclick="window.__aiChatInstance && window.__aiChatInstance._copyCode('${id}')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      Copiar
    </button>
  </div>
  <pre class="aichat-code-pre"><code class="hljs lang-${Utils.escapeHtml(lang)}" data-raw="${encodeURIComponent(code)}">${highlighted}</code></pre>
</div>`;
    }

    static rehighlight(el) {
      if (!window.hljs) return;
      el.querySelectorAll('code[data-raw]:not(.hljs-done)').forEach(block => {
        try {
          const lang = [...block.classList].find(c => c.startsWith('lang-'))?.slice(5) || 'plaintext';
          const raw = decodeURIComponent(block.dataset.raw || '');
          const l = window.hljs.getLanguage(lang) ? lang : 'plaintext';
          block.innerHTML = window.hljs.highlight(raw, { language: l }).value;
          block.classList.add('hljs-done');
        } catch { /* ignore */ }
      });
    }

    static typeset(el) {
      if (!window.MathJax?.typesetPromise) return Promise.resolve();
      return window.MathJax.typesetPromise([el]).catch(() => {});
    }
  }

  // ── API Client ────────────────────────────────────────────────────────────
  class APIClient {
    _ctrl = null;

    abort() {
      this._ctrl?.abort();
      this._ctrl = null;
    }

    async stream(messages, onChunk, onDone, onError) {
      this.abort();
      this._ctrl = new AbortController();
      const { signal } = this._ctrl;
      const timeout = setTimeout(() => this._ctrl?.abort(), API_TIMEOUT);

      for (let attempt = 0; attempt <= API_MAX_RETRY; attempt++) {
        try {
          const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              model: API_MODEL,
              messages: [SYSTEM_PROMPT, ...messages],
              stream: true,
            }),
          });

          if (!resp.ok) {
            throw new Error(this._httpError(resp.status));
          }

          await this._readSSE(resp.body, onChunk, signal);
          clearTimeout(timeout);
          onDone(false);
          return;

        } catch (err) {
          if (err.name === 'AbortError') {
            clearTimeout(timeout);
            onDone(true);
            return;
          }
          if (attempt >= API_MAX_RETRY) {
            clearTimeout(timeout);
            onError(err.message || 'Erro desconhecido na API.');
            return;
          }
          // Exponential backoff before retry
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }

    async _readSSE(body, onChunk, signal) {
      const reader = body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) break;

        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;
          try {
            const chunk = JSON.parse(data);
            const text = chunk?.choices?.[0]?.delta?.content;
            if (text) onChunk(text);
          } catch { /* malformed chunk */ }
        }
      }
    }

    _httpError(code) {
      const map = {
        400: 'Requisição inválida (400). Verifique o conteúdo enviado.',
        401: 'Não autorizado (401).',
        403: 'Acesso negado (403).',
        404: 'Endpoint não encontrado (404).',
        429: 'Limite de requisições atingido (429). Aguarde um momento.',
        500: 'Erro interno do servidor (500). Tente novamente.',
        503: 'Serviço temporariamente indisponível (503).',
      };
      return map[code] || `Erro HTTP ${code}. Tente novamente.`;
    }
  }

  // ── File Handler ──────────────────────────────────────────────────────────
  class FileHandler {
    static MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    static ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.csv,.json,.doc,.docx';

    static validate(file) {
      if (!file) return 'Nenhum arquivo selecionado.';
      if (file.size > this.MAX_BYTES) return 'Arquivo muito grande (máx. 10 MB).';
      return null;
    }

    static async read(file) {
      const err = this.validate(file);
      if (err) throw new Error(err);

      const mime = file.type.toLowerCase();
      const name = file.name.toLowerCase();

      // Image → base64 data URL
      if (mime.startsWith('image/')) {
        const dataUrl = await this._asDataURL(file);
        return { kind: 'image', name: file.name, mime, dataUrl, base64: dataUrl.split(',')[1] };
      }

      // Text formats → raw text
      if (
        mime === 'text/plain' || mime === 'text/csv' || mime === 'application/json' ||
        name.endsWith('.txt') || name.endsWith('.csv') || name.endsWith('.json')
      ) {
        const text = await this._asText(file);
        return { kind: 'text', name: file.name, content: text.slice(0, 60000) };
      }

      // PDF → base64 (note for the AI)
      if (mime === 'application/pdf' || name.endsWith('.pdf')) {
        const dataUrl = await this._asDataURL(file);
        return {
          kind: 'binary',
          name: file.name,
          note: `[Arquivo PDF enviado: ${file.name} — ${Math.round(file.size / 1024)} KB. Analise-o se possível.]`,
          dataUrl,
          base64: dataUrl.split(',')[1],
          mime,
        };
      }

      // Word / other → try as text
      try {
        const text = await this._asText(file);
        return { kind: 'text', name: file.name, content: text.slice(0, 60000) };
      } catch {
        return { kind: 'unknown', name: file.name, note: `[Arquivo: ${file.name}]` };
      }
    }

    /** Build the message content array / string for the API. */
    static toApiContent(userText, fileData) {
      if (!fileData) return userText || '';

      if (fileData.kind === 'image') {
        return [
          { type: 'text', text: userText || 'O que você vê nesta imagem?' },
          { type: 'image_url', image_url: { url: fileData.dataUrl } },
        ];
      }

      if (fileData.kind === 'text') {
        return `${userText}\n\n[Conteúdo do arquivo "${fileData.name}"]:\n\`\`\`\n${fileData.content}\n\`\`\``;
      }

      return `${userText}\n\n${fileData.note}`;
    }

    static _asDataURL(file) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
    }

    static _asText(file) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = rej;
        r.readAsText(file);
      });
    }
  }

  // ── Icons (inline SVG) ────────────────────────────────────────────────────
  const I = {
    logo:     `<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M12 2L9.5 9.5H2L8 14l-2 7 6-4.5L18 21l-2-7 6-4.5h-7.5z" fill="url(#g1)"/><defs><linearGradient id="g1" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stop-color="#4285f4"/><stop offset="100%" stop-color="#ea4335"/></linearGradient></defs></svg>`,
    close:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    min:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    max:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`,
    restore:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="7" width="14" height="14" rx="1.5"/><path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/></svg>`,
    attach:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
    send:     `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
    stop:     `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`,
    plus:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    trash:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
    copy:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    edit:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    regen:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    more:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg>`,
    file:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    resize:   `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10"><line x1="9" y1="1" x2="1" y2="9"/><line x1="9" y1="5" x2="5" y2="9"/></svg>`,
    check:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>`,
  };

  // ── CSS ───────────────────────────────────────────────────────────────────
  const CSS = `
#aichat-root{
  --c-bg:          #131318;
  --c-surface:     #1e1e26;
  --c-surface2:    #27273a;
  --c-surface3:    #32324a;
  --c-outline:     #3a3a52;
  --c-outline2:    #4a4a62;
  --c-primary:     #a8c7fa;
  --c-primary-dim: #2d4870;
  --c-on-primary:  #04131f;
  --c-text:        #e4e2f0;
  --c-text2:       #aba8c0;
  --c-text3:       #6e6b88;
  --c-error:       #f2b8b8;
  --c-error-bg:    #4a1010;
  --c-success:     #7ce38b;
  --c-warning:     #f4c97a;
  --r-sm:  8px;
  --r-md:  14px;
  --r-lg:  22px;
  --r-xl:  28px;
  --shadow: 0 16px 56px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04);
  all:initial;
  font-family:'Google Sans','Segoe UI',Roboto,system-ui,sans-serif;
  font-size:14px;
  position:fixed;
  inset:0;
  z-index:2147483647;
  pointer-events:none;
}
#aichat-root *{box-sizing:border-box;line-height:1.5;}
#aichat-root button{font-family:inherit;cursor:pointer;}

/* ── Window ─────────────────────────────────────────────── */
#aichat-win{
  position:absolute;
  display:flex;
  flex-direction:column;
  background:var(--c-bg);
  border:1px solid var(--c-outline);
  border-radius:var(--r-xl);
  box-shadow:var(--shadow);
  overflow:hidden;
  pointer-events:all;
  min-width:320px;
  min-height:420px;
  backdrop-filter:blur(24px);
  -webkit-backdrop-filter:blur(24px);
  transition:transform .18s ease, opacity .18s ease;
}
#aichat-win.aichat-anim-in{animation:aichat-popin .22s cubic-bezier(.34,1.56,.64,1);}
@keyframes aichat-popin{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:none}}
#aichat-win.aichat-minimized{height:56px!important;min-height:56px;overflow:hidden;}
#aichat-win.aichat-maximized{top:0!important;left:0!important;width:100vw!important;height:100vh!important;border-radius:0!important;}

/* ── Header ─────────────────────────────────────────────── */
.aichat-header{
  display:flex;align-items:center;gap:10px;
  padding:12px 14px;
  background:linear-gradient(135deg,#0f0f1a 0%,#151528 100%);
  border-bottom:1px solid var(--c-outline);
  cursor:grab;user-select:none;flex-shrink:0;
}
.aichat-header:active{cursor:grabbing;}
.aichat-logo-wrap{
  width:30px;height:30px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#1a2a4a,#1a1a3a);
  border:1px solid var(--c-outline);
  border-radius:50%;
}
.aichat-header-text{flex:1;overflow:hidden;}
.aichat-title{font-size:15px;font-weight:600;color:var(--c-text);letter-spacing:.2px;}
.aichat-subtitle{font-size:11px;color:var(--c-text3);}
.aichat-header-btns{display:flex;gap:2px;flex-shrink:0;}
.aichat-hbtn{
  width:28px;height:28px;border:none;background:transparent;
  color:var(--c-text2);border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  transition:background .15s,color .15s;padding:0;
}
.aichat-hbtn:hover{background:var(--c-surface2);color:var(--c-text);}
.aichat-hbtn.danger:hover{background:var(--c-error-bg);color:var(--c-error);}

/* ── Toolbar ────────────────────────────────────────────── */
.aichat-toolbar{
  display:flex;align-items:center;gap:4px;
  padding:4px 10px;
  border-bottom:1px solid var(--c-outline);
  background:var(--c-bg);
  flex-shrink:0;
}
.aichat-tbtn{
  display:flex;align-items:center;gap:5px;
  background:none;border:none;color:var(--c-text2);
  padding:4px 9px;border-radius:var(--r-sm);font-size:12px;
  transition:background .15s,color .15s;
}
.aichat-tbtn:hover{background:var(--c-surface2);color:var(--c-text);}
.aichat-spacer{flex:1;}
.aichat-status{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--c-text3);}
.aichat-sdot{
  width:6px;height:6px;border-radius:50%;
  background:var(--c-success);
  animation:aichat-pulse 2s ease infinite;
}
.aichat-sdot.busy{background:var(--c-warning);}
@keyframes aichat-pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* ── Messages ────────────────────────────────────────────── */
.aichat-msgs{
  flex:1;overflow-y:auto;
  padding:16px 14px;
  display:flex;flex-direction:column;gap:18px;
  scroll-behavior:smooth;
}
.aichat-msgs::-webkit-scrollbar{width:4px;}
.aichat-msgs::-webkit-scrollbar-track{background:transparent;}
.aichat-msgs::-webkit-scrollbar-thumb{background:var(--c-outline);border-radius:4px;}

/* ── Welcome ─────────────────────────────────────────────── */
.aichat-welcome{
  display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:28px 20px;gap:10px;text-align:center;
  flex:1;
}
.aichat-wlogo{
  width:60px;height:60px;border-radius:50%;
  background:linear-gradient(135deg,#1a2a4a,#2a1a4a);
  border:2px solid var(--c-outline);
  display:flex;align-items:center;justify-content:center;
  font-size:26px;margin-bottom:6px;
}
.aichat-wh{font-size:20px;font-weight:500;color:var(--c-text);margin:0;}
.aichat-wsub{font-size:13px;color:var(--c-text2);margin:0;}
.aichat-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:6px;}
.aichat-chip{
  background:var(--c-surface2);border:1px solid var(--c-outline);
  color:var(--c-primary);border-radius:20px;
  padding:7px 13px;font-size:12px;
  transition:background .15s,border-color .15s;
  pointer-events:all;
}
.aichat-chip:hover{background:var(--c-primary-dim);border-color:var(--c-primary);}

/* ── Message rows ────────────────────────────────────────── */
.aichat-row{
  display:flex;gap:10px;align-items:flex-start;
  animation:aichat-fadein .22s ease;
}
@keyframes aichat-fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.aichat-row.user{flex-direction:row-reverse;}
.aichat-avatar{
  width:32px;height:32px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:700;
}
.aichat-avatar.user{
  background:linear-gradient(135deg,#1e3a6e,#2d6a3f);
  color:#a8c7fa;border:1px solid var(--c-outline);
}
.aichat-avatar.ai{
  background:linear-gradient(135deg,#1a1a2e,#2a1a3e);
  border:1px solid var(--c-outline);
}
.aichat-msg-body{max-width:82%;display:flex;flex-direction:column;gap:4px;}
.aichat-bubble{
  padding:10px 14px;border-radius:var(--r-md);
  word-break:break-word;position:relative;
}
.user .aichat-bubble{
  background:var(--c-primary-dim);color:var(--c-text);
  border-bottom-right-radius:4px;
}
.ai .aichat-bubble{
  background:var(--c-surface2);color:var(--c-text);
  border-bottom-left-radius:4px;
}
.aichat-msg-meta{
  display:flex;align-items:center;gap:6px;
  font-size:11px;color:var(--c-text3);
}
.user .aichat-msg-meta{flex-direction:row-reverse;}
.aichat-msg-actions{display:flex;gap:2px;opacity:0;transition:opacity .15s;}
.aichat-row:hover .aichat-msg-actions{opacity:1;}
.aichat-mabtn{
  background:none;border:none;color:var(--c-text3);
  padding:3px 7px;border-radius:6px;font-size:11px;
  display:flex;align-items:center;gap:3px;
  transition:background .15s,color .15s;
}
.aichat-mabtn:hover{background:var(--c-surface3);color:var(--c-text);}
.aichat-mabtn.ok{color:var(--c-success);}

/* ── File in message ──────────────────────────────────────── */
.aichat-msg-img{
  max-width:220px;max-height:220px;
  border-radius:var(--r-sm);display:block;
  object-fit:cover;margin-top:6px;
  border:1px solid var(--c-outline);
}
.aichat-msg-file-badge{
  display:inline-flex;align-items:center;gap:6px;
  background:var(--c-surface3);padding:6px 10px;
  border-radius:var(--r-sm);font-size:12px;
  color:var(--c-text2);margin-top:6px;
  border:1px solid var(--c-outline);
}

/* ── Typing indicator ────────────────────────────────────── */
.aichat-typing{display:flex;align-items:center;gap:4px;padding:6px 2px;}
.aichat-typing span{
  width:6px;height:6px;background:var(--c-primary);
  border-radius:50%;animation:aichat-bounce 1.2s ease infinite;
}
.aichat-typing span:nth-child(2){animation-delay:.2s;}
.aichat-typing span:nth-child(3){animation-delay:.4s;}
@keyframes aichat-bounce{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}

/* ── Attachment preview strip ────────────────────────────── */
.aichat-attach-strip{
  display:none;padding:6px 12px;
  border-top:1px solid var(--c-outline);
  background:var(--c-bg);flex-shrink:0;
}
.aichat-attach-strip.visible{display:flex;}
.aichat-attach-card{
  display:flex;align-items:center;gap:8px;
  background:var(--c-surface2);border:1px solid var(--c-outline);
  border-radius:var(--r-sm);padding:6px 10px;max-width:280px;
}
.aichat-attach-thumb{
  width:36px;height:36px;object-fit:cover;
  border-radius:4px;flex-shrink:0;
}
.aichat-attach-name{flex:1;font-size:12px;color:var(--c-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aichat-attach-rm{
  width:20px;height:20px;background:var(--c-error-bg);
  color:var(--c-error);border:none;border-radius:50%;
  font-size:14px;display:flex;align-items:center;justify-content:center;
  flex-shrink:0;line-height:1;
}

/* ── Drop overlay ─────────────────────────────────────────── */
.aichat-drop{
  display:none;position:absolute;inset:0;
  background:rgba(168,199,250,.07);
  border:2px dashed var(--c-primary);
  border-radius:var(--r-xl);z-index:20;
  align-items:center;justify-content:center;
  gap:10px;font-size:15px;color:var(--c-primary);
  backdrop-filter:blur(6px);pointer-events:all;
}
.aichat-drop.on{display:flex;}

/* ── Input area ───────────────────────────────────────────── */
.aichat-input-area{
  padding:10px 12px 12px;
  background:var(--c-bg);
  border-top:1px solid var(--c-outline);
  flex-shrink:0;
}
.aichat-input-wrap{
  display:flex;align-items:flex-end;gap:6px;
  background:var(--c-surface);
  border:1.5px solid var(--c-outline);
  border-radius:var(--r-lg);
  padding:8px 8px 8px 14px;
  transition:border-color .2s;
}
.aichat-input-wrap:focus-within{border-color:var(--c-primary);}
.aichat-ta{
  flex:1;background:none;border:none;outline:none;
  color:var(--c-text);font-size:14px;font-family:inherit;
  resize:none;max-height:160px;min-height:22px;
  line-height:1.55;overflow-y:auto;
}
.aichat-ta::placeholder{color:var(--c-text3);}
.aichat-ta::-webkit-scrollbar{width:3px;}
.aichat-ta::-webkit-scrollbar-thumb{background:var(--c-outline);}
.aichat-ia{display:flex;align-items:center;gap:4px;}
.aichat-send{
  width:36px;height:36px;border:none;
  background:var(--c-primary);border-radius:50%;
  color:var(--c-on-primary);
  display:flex;align-items:center;justify-content:center;
  transition:background .15s,transform .12s;flex-shrink:0;
}
.aichat-send:hover{background:#c0d8ff;transform:scale(1.06);}
.aichat-send:disabled{background:var(--c-outline2);cursor:not-allowed;transform:none;}
.aichat-stop{
  width:36px;height:36px;border:none;
  background:var(--c-error-bg);border-radius:50%;
  color:var(--c-error);
  display:flex;align-items:center;justify-content:center;
  display:none;
}
.aichat-stop:hover{filter:brightness(1.2);}
.aichat-ibtn{
  width:32px;height:32px;border:none;background:transparent;
  color:var(--c-text2);border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  transition:background .15s,color .15s;
}
.aichat-ibtn:hover{background:var(--c-surface2);color:var(--c-text);}

/* ── Resize handle ────────────────────────────────────────── */
.aichat-resize{
  position:absolute;bottom:0;right:0;
  width:18px;height:18px;cursor:se-resize;
  display:flex;align-items:flex-end;justify-content:flex-end;
  padding:4px;z-index:5;
}
.aichat-resize svg{opacity:.35;transition:opacity .15s;}
.aichat-resize:hover svg{opacity:.75;}

/* ── Toast ────────────────────────────────────────────────── */
.aichat-toast{
  position:absolute;bottom:76px;left:50%;
  transform:translateX(-50%) translateY(6px);
  background:var(--c-surface3);color:var(--c-text);
  padding:7px 16px;border-radius:20px;font-size:12px;
  border:1px solid var(--c-outline);
  opacity:0;pointer-events:none;white-space:nowrap;z-index:30;
  transition:opacity .2s,transform .2s;
}
.aichat-toast.on{opacity:1;transform:translateX(-50%) translateY(0);}

/* ── Markdown content ─────────────────────────────────────── */
.aichat-md{color:var(--c-text);}
.aichat-md .aichat-p{margin:6px 0;}
.aichat-md .aichat-p:first-child{margin-top:0;}
.aichat-md .aichat-p:last-child{margin-bottom:0;}
.aichat-md .aichat-h{margin:14px 0 6px;font-weight:600;color:var(--c-text);line-height:1.3;}
.aichat-md h1.aichat-h{font-size:18px;}
.aichat-md h2.aichat-h{font-size:16px;}
.aichat-md h3.aichat-h{font-size:15px;}
.aichat-md h4.aichat-h,.aichat-md h5.aichat-h,.aichat-md h6.aichat-h{font-size:14px;}
.aichat-md .aichat-hr{border:none;border-top:1px solid var(--c-outline);margin:10px 0;}
.aichat-md .aichat-list{padding-left:22px;margin:6px 0;}
.aichat-md .aichat-list li{margin:3px 0;}
.aichat-md .aichat-link{color:var(--c-primary);text-decoration:none;}
.aichat-md .aichat-link:hover{text-decoration:underline;}
.aichat-md .aichat-img{max-width:100%;border-radius:var(--r-sm);margin:6px 0;}
.aichat-md .aichat-quote{
  border-left:3px solid var(--c-primary-dim);
  padding:6px 12px;margin:8px 0;
  color:var(--c-text2);font-style:italic;
  background:rgba(168,199,250,.04);
  border-radius:0 var(--r-sm) var(--r-sm) 0;
}
.aichat-md strong{font-weight:700;}
.aichat-md em{font-style:italic;}
.aichat-md del{text-decoration:line-through;opacity:.7;}

/* Tables */
.aichat-table-wrap{overflow-x:auto;margin:8px 0;}
.aichat-table{border-collapse:collapse;width:100%;font-size:13px;}
.aichat-table th,.aichat-table td{border:1px solid var(--c-outline);padding:6px 10px;text-align:left;}
.aichat-table th{background:var(--c-surface3);font-weight:600;color:var(--c-text);}
.aichat-table tr:nth-child(even) td{background:rgba(255,255,255,.02);}

/* Inline code */
.aichat-inline-code{
  background:var(--c-surface3);padding:2px 6px;
  border-radius:4px;font-size:12.5px;
  font-family:'JetBrains Mono','Fira Code',Consolas,monospace;
  color:#ea9a97;
}

/* Code blocks */
.aichat-code-block{
  background:#0d1117;border:1px solid var(--c-outline);
  border-radius:var(--r-sm);overflow:hidden;margin:8px 0;
}
.aichat-code-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:5px 12px;background:#161b22;
  border-bottom:1px solid var(--c-outline);
}
.aichat-code-lang{
  font-size:10px;color:var(--c-text3);
  font-family:'JetBrains Mono',monospace;
  text-transform:uppercase;letter-spacing:.5px;
}
.aichat-copy-code-btn{
  display:flex;align-items:center;gap:4px;
  background:none;border:1px solid var(--c-outline);
  color:var(--c-text2);padding:2px 8px;border-radius:4px;
  font-size:11px;transition:all .15s;font-family:inherit;
}
.aichat-copy-code-btn:hover{background:var(--c-surface2);color:var(--c-text);}
.aichat-copy-code-btn.ok{color:var(--c-success);border-color:var(--c-success);}
.aichat-code-pre{
  margin:0;padding:12px 14px;overflow-x:auto;
  font-family:'JetBrains Mono','Fira Code',Consolas,monospace;
  font-size:12.5px;line-height:1.65;
}
.aichat-code-pre::-webkit-scrollbar{height:4px;}
.aichat-code-pre::-webkit-scrollbar-thumb{background:var(--c-outline);}
.aichat-code-pre code{background:none;padding:0;color:inherit;}
`;

  // ── ChatApp ───────────────────────────────────────────────────────────────
  class ChatApp {
    // DOM refs
    _root = null;
    _win  = null;
    _msgs = null;
    _ta   = null;
    _send = null;
    _stopEl = null;
    _strip  = null;
    _drop   = null;
    _sdot   = null;
    _stxt   = null;
    _toastEl = null;

    // State
    _history    = [];   // { id, role, content, timeIso, fileData? }
    _apiHistory = [];   // { role, content } — pruned for API
    _pendingFile = null;
    _api         = new APIClient();
    _streaming   = false;
    _maxed       = false;
    _mined       = false;
    _dragSt      = null;
    _resSt       = null;
    _autoScroll  = true;
    _editingId   = null;
    _toastTimer  = null;

    constructor() {
      this._buildUI();
      this._bind();
      this._restoreWin();
      this._loadHistory();
      DependencyLoader.hljs().then(() => this._rehighlightAll());
      DependencyLoader.mathjax().then(() => this._retypesetAll());
    }

    toggle() {
      this._root.style.display = this._root.style.display === 'none' ? '' : 'none';
    }

    // ── UI Construction ─────────────────────────────────────────────────────

    _buildUI() {
      this._root = document.createElement('div');
      this._root.id = 'aichat-root';

      const style = document.createElement('style');
      style.textContent = CSS;
      this._root.appendChild(style);

      this._win = document.createElement('div');
      this._win.id = 'aichat-win';
      this._win.classList.add('aichat-anim-in');
      this._win.style.cssText = 'width:430px;height:620px;';
      this._win.innerHTML = this._winHTML();
      this._root.appendChild(this._win);

      document.body.appendChild(this._root);

      // Cache refs
      this._msgs   = this._$('#aichat-msgs');
      this._ta     = this._$('#aichat-ta');
      this._send   = this._$('#aichat-send');
      this._stopEl = this._$('#aichat-stop');
      this._strip  = this._$('#aichat-strip');
      this._drop   = this._$('#aichat-drop');
      this._sdot   = this._$('.aichat-sdot');
      this._stxt   = this._$('#aichat-stxt');
      this._toastEl = this._$('#aichat-toast');
    }

    _winHTML() {
      const chips = [
        'Explique como funciona a IA', 'Escreva um script Python',
        'Resuma este texto para mim', 'Me ajude com JavaScript',
      ];
      return `
<div class="aichat-header" id="aichat-drag">
  <div class="aichat-logo-wrap">${I.logo}</div>
  <div class="aichat-header-text">
    <div class="aichat-title">AI Chat</div>
    <div class="aichat-subtitle">Pollinations AI</div>
  </div>
  <div class="aichat-header-btns">
    <button class="aichat-hbtn" id="aichat-new" title="Nova conversa">${I.plus}</button>
    <button class="aichat-hbtn" id="aichat-min" title="Minimizar (F10)">${I.min}</button>
    <button class="aichat-hbtn" id="aichat-max" title="Maximizar">${I.max}</button>
    <button class="aichat-hbtn danger" id="aichat-close" title="Fechar">${I.close}</button>
  </div>
</div>

<div class="aichat-toolbar">
  <button class="aichat-tbtn" id="aichat-clear">${I.trash} Limpar histórico</button>
  <div class="aichat-spacer"></div>
  <div class="aichat-status">
    <div class="aichat-sdot"></div>
    <span id="aichat-stxt">Pronto</span>
  </div>
</div>

<div class="aichat-msgs" id="aichat-msgs">
  <div class="aichat-welcome" id="aichat-welcome">
    <div class="aichat-wlogo">✦</div>
    <h2 class="aichat-wh">Olá! Como posso ajudar?</h2>
    <p class="aichat-wsub">Faça uma pergunta, envie um arquivo ou escolha uma sugestão</p>
    <div class="aichat-chips">
      ${chips.map(c => `<button class="aichat-chip" data-chip="${Utils.escapeHtml(c)}">${Utils.escapeHtml(c)}</button>`).join('')}
    </div>
  </div>
</div>

<div class="aichat-attach-strip" id="aichat-strip"></div>

<div class="aichat-input-area">
  <div class="aichat-input-wrap">
    <textarea class="aichat-ta" id="aichat-ta" placeholder="Pergunte algo..." rows="1"></textarea>
    <div class="aichat-ia">
      <input type="file" id="aichat-fi" style="display:none" accept="${FileHandler.ACCEPT}">
      <button class="aichat-ibtn" id="aichat-attach" title="Anexar arquivo">${I.attach}</button>
      <button class="aichat-send" id="aichat-send" title="Enviar (Enter)">${I.send}</button>
      <button class="aichat-stop" id="aichat-stop" title="Parar geração">${I.stop}</button>
    </div>
  </div>
</div>

<div class="aichat-drop" id="aichat-drop">${I.attach} Solte o arquivo aqui</div>
<div class="aichat-resize" id="aichat-resize">${I.resize}</div>
<div class="aichat-toast" id="aichat-toast"></div>
`;
    }

    // ── Event Binding ───────────────────────────────────────────────────────

    _bind() {
      // Header controls
      this._$('#aichat-close').addEventListener('click', () => this.toggle());
      this._$('#aichat-min').addEventListener('click',   () => this._toggleMin());
      this._$('#aichat-max').addEventListener('click',   () => this._toggleMax());
      this._$('#aichat-new').addEventListener('click',   () => this._newConv());
      this._$('#aichat-clear').addEventListener('click', () => this._clearHist());

      // Input
      this._ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._submit(); }
      });
      this._ta.addEventListener('input', () => this._resizeTa());

      this._send.addEventListener('click',   () => this._submit());
      this._stopEl.addEventListener('click', () => this._api.abort());

      // File input
      const fi = this._$('#aichat-fi');
      this._$('#aichat-attach').addEventListener('click', () => fi.click());
      fi.addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) this._handleFile(f);
        fi.value = '';
      });

      // Paste image
      this._ta.addEventListener('paste', e => {
        const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
        if (item) { e.preventDefault(); this._handleFile(item.getAsFile()); }
      });

      // Drag-and-drop into window
      this._win.addEventListener('dragenter', e => { e.preventDefault(); this._drop.classList.add('on'); });
      this._drop.addEventListener('dragleave', e => { e.preventDefault(); this._drop.classList.remove('on'); });
      this._drop.addEventListener('dragover',  e => e.preventDefault());
      this._drop.addEventListener('drop', e => {
        e.preventDefault();
        this._drop.classList.remove('on');
        const f = e.dataTransfer.files[0];
        if (f) this._handleFile(f);
      });

      // Chips
      this._msgs.addEventListener('click', e => {
        const chip = e.target.closest('[data-chip]');
        if (chip) { this._ta.value = chip.dataset.chip; this._submit(); }
      });

      // Scroll tracking
      this._msgs.addEventListener('scroll', Utils.debounce(() => {
        const { scrollTop, scrollHeight, clientHeight } = this._msgs;
        this._autoScroll = scrollTop + clientHeight >= scrollHeight - 40;
      }, 80));

      // Drag window
      this._$('#aichat-drag').addEventListener('mousedown', e => this._startDrag(e));

      // Resize window
      this._$('#aichat-resize').addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        this._resSt = {
          x: e.clientX, y: e.clientY,
          w: this._win.offsetWidth, h: this._win.offsetHeight,
        };
      });

      // Global mouse events
      document.addEventListener('mousemove', e => {
        if (this._dragSt) {
          const dx = e.clientX - this._dragSt.x;
          const dy = e.clientY - this._dragSt.y;
          const left = Math.max(0, Math.min(this._dragSt.l + dx, window.innerWidth  - 80));
          const top  = Math.max(0, Math.min(this._dragSt.t + dy, window.innerHeight - 50));
          this._win.style.left = left + 'px';
          this._win.style.top  = top  + 'px';
        }
        if (this._resSt) {
          const w = Math.max(320, this._resSt.w + e.clientX - this._resSt.x);
          const h = Math.max(420, this._resSt.h + e.clientY - this._resSt.y);
          this._win.style.width  = w + 'px';
          this._win.style.height = h + 'px';
        }
      });

      document.addEventListener('mouseup', () => {
        if (this._dragSt) {
          StorageManager.set(STORAGE.POSITION, { l: this._win.style.left, t: this._win.style.top });
          this._dragSt = null;
        }
        if (this._resSt) {
          StorageManager.set(STORAGE.SIZE, { w: this._win.style.width, h: this._win.style.height });
          this._resSt = null;
        }
      });

      // F10 global toggle
      this._f10 = e => { if (e.key === 'F10') { e.preventDefault(); this.toggle(); } };
      document.addEventListener('keydown', this._f10);
    }

    // ── Textarea ────────────────────────────────────────────────────────────

    _resizeTa() {
      this._ta.style.height = 'auto';
      this._ta.style.height = Math.min(this._ta.scrollHeight, 160) + 'px';
    }

    // ── File handling ───────────────────────────────────────────────────────

    async _handleFile(file) {
      const err = FileHandler.validate(file);
      if (err) { this._toast(err); return; }
      try {
        const fd = await FileHandler.read(file);
        this._pendingFile = fd;
        this._showStrip(fd, file.name);
      } catch (e) {
        this._toast(e.message);
      }
    }

    _showStrip(fd, name) {
      this._strip.innerHTML = `
<div class="aichat-attach-card">
  ${fd.kind === 'image'
    ? `<img src="${fd.dataUrl}" class="aichat-attach-thumb" alt="">`
    : `<span style="color:var(--c-text2)">${I.file}</span>`}
  <span class="aichat-attach-name">${Utils.escapeHtml(name)}</span>
  <button class="aichat-attach-rm" id="aichat-atrm" title="Remover">×</button>
</div>`;
      this._strip.classList.add('visible');
      this._$('#aichat-atrm').addEventListener('click', () => {
        this._pendingFile = null;
        this._strip.classList.remove('visible');
        this._strip.innerHTML = '';
      });
    }

    // ── Submit ──────────────────────────────────────────────────────────────

    async _submit() {
      if (this._streaming) return;

      const text = this._ta.value.trim();
      if (!text && !this._pendingFile) return;

      if (this._editingId) {
        this._applyEdit(text);
        return;
      }

      const fd   = this._pendingFile;
      this._pendingFile = null;
      this._strip.classList.remove('visible');
      this._strip.innerHTML = '';
      this._ta.value = '';
      this._resizeTa();

      await this._send_(text, fd);
    }

    async _send_(text, fd = null) {
      const id   = Utils.uid();
      const time = new Date();

      const apiContent = FileHandler.toApiContent(text, fd);

      this._history.push({ id, role: 'user', content: text, timeIso: time.toISOString(), fileData: fd });
      this._apiHistory.push({ role: 'user', content: apiContent });

      this._removeWelcome();
      this._appendUserMsg(text, fd, time, id);
      await this._doStream();
    }

    // ── Streaming ───────────────────────────────────────────────────────────

    async _doStream() {
      this._streaming = true;
      this._setStreamUI(true);
      this._autoScroll = true;

      const aiId  = Utils.uid();
      const aiRow = this._mkAiRow(aiId);
      this._msgs.appendChild(aiRow);
      this._scrollBottom();

      const typingEl  = aiRow.querySelector('.aichat-typing');
      const contentEl = aiRow.querySelector('.aichat-md');
      const timeEl    = aiRow.querySelector('.aichat-msg-time');

      let full = '';
      const t0 = Date.now();

      await this._api.stream(
        this._apiHistory,

        // onChunk
        chunk => {
          if (typingEl.parentNode) typingEl.remove();
          full += chunk;
          contentEl.innerHTML = MarkdownParser.parse(full);
          if (this._autoScroll) this._scrollBottom();
        },

        // onDone
        async (aborted) => {
          this._streaming = false;
          this._setStreamUI(false);

          const sec = ((Date.now() - t0) / 1000).toFixed(1);
          this._setStatus(aborted ? 'Interrompido' : `Concluído (${sec}s)`, false);
          setTimeout(() => this._setStatus('Pronto', false), 3500);

          if (full) {
            // Re-highlight now that hljs may have loaded
            MarkdownParser.rehighlight(contentEl);
            MarkdownParser.typeset(contentEl).then(() => {});

            // Bind action buttons
            const actBar = aiRow.querySelector('.aichat-msg-actions');
            if (actBar) {
              actBar.innerHTML = this._aiActions(aiId);
              this._bindAiActions(actBar, aiId);
            }

            this._history.push({ id: aiId, role: 'assistant', content: full, timeIso: new Date().toISOString() });
            this._apiHistory.push({ role: 'assistant', content: full });
            StorageManager.set(STORAGE.HISTORY, this._history);
          }
        },

        // onError
        msg => {
          this._streaming = false;
          this._setStreamUI(false);
          if (typingEl.parentNode) typingEl.remove();
          contentEl.innerHTML = `<span style="color:var(--c-error)">⚠ ${Utils.escapeHtml(msg)}</span>`;
          this._setStatus('Erro', false);
          setTimeout(() => this._setStatus('Pronto', false), 4000);
        }
      );
    }

    // ── Render helpers ──────────────────────────────────────────────────────

    _removeWelcome() {
      this._$('#aichat-welcome')?.remove();
    }

    _appendUserMsg(text, fd, time, id) {
      const row = document.createElement('div');
      row.className = 'aichat-row user';
      row.dataset.id = id;

      let fileHTML = '';
      if (fd) {
        if (fd.kind === 'image' && fd.dataUrl) {
          fileHTML = `<img class="aichat-msg-img" src="${fd.dataUrl}" alt="${Utils.escapeHtml(fd.name)}">`;
        } else {
          fileHTML = `<div class="aichat-msg-file-badge">${I.file} ${Utils.escapeHtml(fd.name)}</div>`;
        }
      }

      row.innerHTML = `
<div class="aichat-avatar user">U</div>
<div class="aichat-msg-body">
  ${text ? `<div class="aichat-bubble">${Utils.escapeHtml(text)}</div>` : ''}
  ${fileHTML}
  <div class="aichat-msg-meta">
    <span class="aichat-msg-time">${Utils.formatTime(time)}</span>
    <div class="aichat-msg-actions">
      <button class="aichat-mabtn" data-act="copy">${I.copy} Copiar</button>
      <button class="aichat-mabtn" data-act="edit">${I.edit} Editar</button>
    </div>
  </div>
</div>`;

      row.querySelector('[data-act="copy"]').addEventListener('click', e => {
        this._copyText(text, e.currentTarget);
      });
      row.querySelector('[data-act="edit"]').addEventListener('click', () => {
        this._startEdit(id, text);
      });

      this._msgs.appendChild(row);
      this._scrollBottom();
    }

    _mkAiRow(id) {
      const row = document.createElement('div');
      row.className = 'aichat-row ai';
      row.dataset.id = id;
      row.innerHTML = `
<div class="aichat-avatar ai">✦</div>
<div class="aichat-msg-body" style="max-width:88%">
  <div class="aichat-bubble">
    <div class="aichat-typing"><span></span><span></span><span></span></div>
    <div class="aichat-md"></div>
  </div>
  <div class="aichat-msg-meta">
    <span class="aichat-msg-time">${Utils.formatTime()}</span>
    <div class="aichat-msg-actions"></div>
  </div>
</div>`;
      return row;
    }

    _aiActions(id) {
      return `
<button class="aichat-mabtn" data-act="copy">${I.copy} Copiar</button>
<button class="aichat-mabtn" data-act="regen">${I.regen} Regenerar</button>
<button class="aichat-mabtn" data-act="cont">${I.more} Continuar</button>`;
    }

    _bindAiActions(bar, id) {
      bar.querySelector('[data-act="copy"]')?.addEventListener('click', e => {
        const h = this._history.find(x => x.id === id);
        if (h) this._copyText(h.content, e.currentTarget);
      });
      bar.querySelector('[data-act="regen"]')?.addEventListener('click', () => this._regen(id));
      bar.querySelector('[data-act="cont"]')?.addEventListener('click',  () => this._cont(id));
    }

    // ── Message actions ─────────────────────────────────────────────────────

    _startEdit(id, text) {
      if (this._streaming) return;
      this._editingId = id;
      this._ta.value = text;
      this._ta.focus();
      this._resizeTa();
      this._toast('Edite a mensagem e pressione Enter para reenviar');
    }

    _applyEdit(text) {
      const idx = this._history.findIndex(h => h.id === this._editingId);
      if (idx === -1) { this._editingId = null; return; }

      this._history.splice(idx);
      this._apiHistory.splice(idx);

      // Remove rendered rows from idx onward
      [...this._msgs.querySelectorAll('.aichat-row')].slice(idx).forEach(r => r.remove());

      this._editingId = null;
      this._ta.value = '';
      this._resizeTa();

      this._send_(text, null);
    }

    _regen(aiId) {
      if (this._streaming) return;
      const idx = this._history.findIndex(h => h.id === aiId);
      if (idx === -1) return;
      this._history.splice(idx);
      this._apiHistory.splice(idx);
      this._msgs.querySelector(`[data-id="${aiId}"]`)?.remove();
      this._doStream();
    }

    _cont(aiId) {
      if (this._streaming) return;
      const contMsg = 'Continue a resposta de onde parou.';
      this._history.push({ id: Utils.uid(), role: 'user', content: contMsg, timeIso: new Date().toISOString() });
      this._apiHistory.push({ role: 'user', content: contMsg });
      this._doStream();
    }

    // ── History ─────────────────────────────────────────────────────────────

    _loadHistory() {
      const saved = StorageManager.get(STORAGE.HISTORY, []);
      if (!saved.length) return;

      this._history    = saved;
      this._apiHistory = saved.map(h => ({ role: h.role, content: h.content }));

      this._removeWelcome();
      saved.forEach(entry => {
        if (entry.role === 'user') {
          this._appendUserMsg(
            entry.content,
            entry.fileData || null,
            new Date(entry.timeIso),
            entry.id
          );
        } else {
          const row = this._mkAiRow(entry.id);
          this._msgs.appendChild(row);
          row.querySelector('.aichat-typing').remove();
          const md = row.querySelector('.aichat-md');
          md.innerHTML = MarkdownParser.parse(entry.content);
          const actBar = row.querySelector('.aichat-msg-actions');
          if (actBar) { actBar.innerHTML = this._aiActions(entry.id); this._bindAiActions(actBar, entry.id); }
        }
      });
      this._scrollBottom();
    }

    _newConv() {
      if (this._streaming) this._api.abort();
      this._history = [];
      this._apiHistory = [];
      StorageManager.remove(STORAGE.HISTORY);
      this._msgs.innerHTML = `
<div class="aichat-welcome" id="aichat-welcome">
  <div class="aichat-wlogo">✦</div>
  <h2 class="aichat-wh">Nova conversa iniciada</h2>
  <p class="aichat-wsub">Como posso ajudar?</p>
</div>`;
    }

    _clearHist() {
      if (!confirm('Limpar todo o histórico de conversas?')) return;
      this._newConv();
      this._toast('Histórico apagado');
    }

    // ── Window controls ──────────────────────────────────────────────────────

    _toggleMin() {
      this._mined = !this._mined;
      this._win.classList.toggle('aichat-minimized', this._mined);
    }

    _toggleMax() {
      this._maxed = !this._maxed;
      this._win.classList.toggle('aichat-maximized', this._maxed);
      this._$('#aichat-max').innerHTML = this._maxed ? I.restore : I.max;
    }

    _startDrag(e) {
      if (this._maxed) return;
      if (e.target.closest('button')) return;
      e.preventDefault();
      const rect = this._win.getBoundingClientRect();
      this._dragSt = { x: e.clientX, y: e.clientY, l: rect.left, t: rect.top };
      this._win.style.right = 'auto'; // switch to left/top
    }

    _restoreWin() {
      const pos  = StorageManager.get(STORAGE.POSITION, null);
      const size = StorageManager.get(STORAGE.SIZE, null);

      if (size) { this._win.style.width = size.w; this._win.style.height = size.h; }

      if (pos) {
        this._win.style.left = pos.l;
        this._win.style.top  = pos.t;
        this._win.style.right = 'auto';
      } else {
        // Default: top-right
        const vw = window.innerWidth;
        const startLeft = Math.max(0, vw - 450);
        this._win.style.left = startLeft + 'px';
        this._win.style.top  = '20px';
      }
    }

    // ── UI helpers ───────────────────────────────────────────────────────────

    _setStreamUI(on) {
      this._send.style.display    = on ? 'none' : '';
      this._stopEl.style.display  = on ? ''     : 'none';
      this._send.disabled         = on;
      this._sdot.classList.toggle('busy', on);
    }

    _scrollBottom() {
      requestAnimationFrame(() => {
        this._msgs.scrollTop = this._msgs.scrollHeight;
      });
    }

    _setStatus(text) {
      if (this._stxt) this._stxt.textContent = text;
    }

    _toast(msg) {
      if (!this._toastEl) return;
      clearTimeout(this._toastTimer);
      this._toastEl.textContent = msg;
      this._toastEl.classList.add('on');
      this._toastTimer = setTimeout(() => this._toastEl.classList.remove('on'), 3200);
    }

    // ── Clipboard ─────────────────────────────────────────────────────────────

    async _copyText(text, btn) {
      try {
        await navigator.clipboard.writeText(text);
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = `${I.check} Copiado`;
          btn.classList.add('ok');
          setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('ok'); }, 2000);
        }
      } catch {
        this._toast('Falha ao copiar');
      }
    }

    /** Called from inline onclick in code block copy buttons */
    _copyCode(blockId) {
      const codeEl = this._win.querySelector(`.aichat-code-block[data-block-id="${blockId}"] code`);
      const btnEl  = this._win.querySelector(`.aichat-code-block[data-block-id="${blockId}"] .aichat-copy-code-btn`);
      if (!codeEl) return;

      const text = decodeURIComponent(codeEl.dataset.raw || '');
      navigator.clipboard.writeText(text)
        .then(() => {
          if (btnEl) {
            const orig = btnEl.innerHTML;
            btnEl.innerHTML = `${I.check} Copiado!`;
            btnEl.classList.add('ok');
            setTimeout(() => { btnEl.innerHTML = orig; btnEl.classList.remove('ok'); }, 2000);
          }
        })
        .catch(() => this._toast('Falha ao copiar código'));
    }

    // ── Post-load re-processing ───────────────────────────────────────────────

    _rehighlightAll() {
      this._win.querySelectorAll('.aichat-md').forEach(el => MarkdownParser.rehighlight(el));
    }

    _retypesetAll() {
      this._win.querySelectorAll('.aichat-md').forEach(el => MarkdownParser.typeset(el));
    }

    // ── Query helper ─────────────────────────────────────────────────────────
    _$(sel) { return this._win.querySelector(sel); }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  window.__aiChatInstance = new ChatApp();
})();
