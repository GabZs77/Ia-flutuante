let loadedPlugins = [];

/* Element(s?) */
const floatWindow = document.createElement('floatWindow');

/* Misc Styles */
document.head.appendChild(Object.assign(document.createElement("style"), {
    innerHTML: "@font-face{font-family:'MuseoSans';src:url('https://corsproxy.io/?url=https://r2.e-z.host/4d0a0bea-60f8-44d6-9e74-3032a64a9f32/ynddewua.ttf')format('truetype')}"
}));

document.head.appendChild(Object.assign(document.createElement("style"), {
    innerHTML: "::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: #f1f1f1; } ::-webkit-scrollbar-thumb { background: #888; border-radius: 10px; } ::-webkit-scrollbar-thumb:hover { background: #555; }"
}));

/* Toggle UI Styles */
document.head.appendChild(Object.assign(document.createElement("style"), {
    innerHTML: `
    #ki-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #1e1e2e;
        color: #cdd6f4;
        padding: 15px;
        border-radius: 12px;
        z-index: 999999;
        font-family: 'MuseoSans', sans-serif;
        box-shadow: 0 8px 16px rgba(0,0,0,0.4);
        width: 260px;
        cursor: move;
        border: 1px solid #313244;
        user-select: none;
    }
    #ki-panel .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        font-weight: 600;
        font-size: 14px;
        color: #89b4fa;
    }
    #ki-panel .switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
    }
    #ki-panel .switch input { opacity: 0; width: 0; height: 0; }
    #ki-panel .slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: #45475a;
        transition: .4s;
        border-radius: 24px;
    }
    #ki-panel .slider:before {
        position: absolute;
        content: "";
        height: 16px;
        width: 16px;
        left: 4px;
        bottom: 4px;
        background-color: #cdd6f4;
        transition: .4s;
        border-radius: 50%;
    }
    #ki-panel input:checked + .slider { background-color: #a6e3a1; }
    #ki-panel input:checked + .slider:before { transform: translateX(20px); background-color: #1e1e2e; }
    #ki-panel .control-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 13px;
    }
    #ki-panel #statusText {
        font-size: 11px;
        margin-top: 12px;
        color: #6c7086;
        text-align: center;
        border-top: 1px solid #313244;
        padding-top: 8px;
    }
    `
}));

document.querySelector("link[rel~='icon']").href = 'https://r2.e-z.host/4d0a0bea-60f8-44d6-9e74-3032a64a9f32/ukh0rq22.png';

/* Emmiter */
class EventEmitter {
    constructor() { this.events = {} }
    on(t, e) { "string" == typeof t && (t = [t]), t.forEach(t => { this.events[t] || (this.events[t] = []), this.events[t].push(e) }) }
    off(t, e) { "string" == typeof t && (t = [t]), t.forEach(t => { this.events[t] && (this.events[t] = this.events[t].filter(t => t !== e)) }) }
    emit(t, ...e) { this.events[t] && this.events[t].forEach(t => { t(...e) }) }
    once(t, e) { "string" == typeof t && (t = [t]); let s = (...i) => { e(...i), this.off(t, s) }; this.on(t, s) }
};

const plppdo = new EventEmitter();

new MutationObserver((mutationsList) => {
    for (let mutation of mutationsList)
        if (mutation.type === 'childList')
            plppdo.emit('domChanged');
}).observe(document.body, { childList: true, subtree: true });

/* Misc Functions */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const playAudio = url => {
    const audio = new Audio(url);
    audio.play();
};

const findAndClickBySelector = selector => {
    const element = document.querySelector(selector);
    if (element) { element.click(); }
};

function sendToast(text, duration = 5000, gravity = 'bottom') {
    Toastify({
        text: text,
        duration: duration,
        gravity: gravity,
        position: "center",
        stopOnFocus: true,
        style: { background: "#000000" }
    }).showToast();
};

/* Floating Window Logic */
function showFloatingWindow() {
    floatWindow.innerHTML = `
    <div id="ki-panel">
        <div class="header">
            <span>KhanInnovate.SPACE</span>
        </div>
        <div class="control-row">
            <label for="autoToggle" style="cursor:pointer;">Resposta Automática</label>
            <label class="switch">
                <input type="checkbox" id="autoToggle">
                <span class="slider"></span>
            </label>
        </div>
        <div id="statusText">Desativado.</div>
    </div>`;
    document.body.appendChild(floatWindow);

    const panel = document.getElementById('ki-panel');
    let isDragging = false, offsetX, offsetY;

    panel.addEventListener('mousedown', function(e) {
        if (e.target.tagName === 'INPUT') return;
        isDragging = true;
        offsetX = e.clientX - panel.getBoundingClientRect().left;
        offsetY = e.clientY - panel.getBoundingClientRect().top;
        panel.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function(e) {
        if (isDragging) {
            panel.style.left = (e.clientX - offsetX) + 'px';
            panel.style.top = (e.clientY - offsetY) + 'px';
            panel.style.right = 'auto';
        }
    });

    document.addEventListener('mouseup', function() {
        isDragging = false;
        panel.style.cursor = 'move';
    });

    const toggle = document.getElementById('autoToggle');
    const status = document.getElementById('statusText');

    toggle.onchange = function() {
        if (this.checked) {
            status.innerText = 'Ativado. Procurando questões...';
            window.__autoAnswerInterval = setInterval(runAnswerCycle, 1000);
        } else {
            status.innerText = 'Desativado.';
            clearInterval(window.__autoAnswerInterval);
            window.__autoAnswerInterval = null;
        }
    };
}

async function hideFloatingWindow() {
    if (floatWindow && floatWindow.parentNode) {
        floatWindow.remove();
    }
}

async function loadScript(url, label) {
    return fetch(url)
        .then(response => response.text())
        .then(script => {
            loadedPlugins.push(label);
            eval(script);
        });
}

async function loadCss(url) {
    return new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = url;
        link.onload = () => resolve();
        document.head.appendChild(link);
    });
}

/* Main Functions */
function setupMain() {
    /* QuestionSpoof (Mantido intacto como no original) */
    (function () {
        const phrases = [
            "Get good, get [**KhanInnovate**](https://github.com/ScxttZarek/KhanInnovate/)!",
            "Made by [**ScxttZarek**](https://e-z.bio/sounix).",
            "By [**ScxttZarek/KhanInnovate**](https://github.com/ScxttZarek/KhanInnovate/).",
            "Star the project on [GitHub](https://github.com/ScxttZarek/KhanInnovate/)!"
        ];

        const originalFetch = window.fetch;
        const correctAnswers = new Map();

        const toFraction = (d) => {
            if (d === 0 || d === 1) return String(d);
            const decimals = (String(d).split('.')[1] || '').length;
            let num = Math.round(d * Math.pow(10, decimals)),
                den = Math.pow(10, decimals);
            const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
            const div = gcd(Math.abs(num), Math.abs(den));
            return den / div === 1 ? String(num / div) : `${num / div}/${den / div}`;
        };

        const createEmptyResponse = (bodyObj) => {
            const emptyBody = JSON.parse(JSON.stringify(bodyObj));
            emptyBody.variables.input.attemptContent = "[[]]";
            emptyBody.variables.input.userInput = "{}";
            return emptyBody;
        };

        const isWidgetUsed = (widgetKey, questionContent, hints) => {
            const widgetPattern = `☃ ${widgetKey.replace(/\s+/g, ' ')}`;
            if (questionContent.includes(widgetPattern)) return true;
            if (hints && Array.isArray(hints)) {
                for (const hint of hints) {
                    if (hint.content && hint.content.includes(widgetPattern)) return true;
                    if (hint.widgets) {
                        for (const hintWidget of Object.values(hint.widgets)) {
                            if (hintWidget.options?.content?.includes(widgetPattern)) return true;
                        }
                    }
                }
            }
            return false;
        };

        const modifyItemData = (itemData) => {
            if (itemData.question.content?.[0] === itemData.question.content[0].toUpperCase()) {
                itemData.answerArea = { calculator: false, chi2Table: false, periodicTable: false, tTable: false, zTable: false };
                itemData.question.content = phrases[Math.floor(Math.random() * phrases.length)] + "\n\n**Is KhanInnovate's stealth mode active?**" + `[[☃ radio 1]]`;
                itemData.question.widgets = {
                    "radio 1": {
                        type: "radio", alignment: "default", static: false, graded: true,
                        options: {
                            choices: [
                                { content: "**2**.", correct: true, id: "correct-choice" },
                                { content: "**Martin Luther King Jr.**.", correct: false, id: "incorrect-choice" }
                            ],
                            randomize: false, multipleSelect: false, displayCount: null, deselectEnabled: false
                        },
                        version: { major: 1, minor: 0 }
                    }
                };
                return true;
            }
            return false;
        };
    })();
}

/* Auto Answer Cycle Logic */
let isProcessing = false;
let lastUrl = window.location.href;

function findVerifyButton() {
    const buttons = document.querySelectorAll('button');
    for (let btn of buttons) {
        if ((btn.textContent.includes('Verificar') || btn.textContent.includes('Verify') || btn.textContent.includes('Check')) && !btn.disabled) {
            return btn;
        }
    }
    return null;
}

function findAndApplyAnswer() {
    const status = document.getElementById('statusText');
    // 1. Procura por inputs de texto/número (como o da sua primeira imagem)
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"], textarea');
    if (inputs.length > 0) {
        // A Khan Academy usa React, então precisamos setar o valor usando o setter nativo para o React reconhecer a mudança
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        
        // Tenta encontrar a resposta correta no DOM (em widgets escondidos do KA)
        const hiddenAnswer = document.querySelector('[data-answer], .hidden-answer, input[type="hidden"][value]');
        if (hiddenAnswer) {
            const val = hiddenAnswer.value || hiddenAnswer.dataset.answer;
            if (val) {
                nativeInputValueSetter.call(inputs[0], val);
                inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
                if(status) status.innerText = 'Preenchendo resposta...';
                return true;
            }
        }
    }

    // 2. Procura por opções de múltipla escolha (radio buttons - como na sua segunda imagem)
    const options = document.querySelectorAll('[role="radio"], input[type="radio"], .radio-option, .choice');
    if (options.length > 0) {
        for (let opt of options) {
            if (opt.dataset.correct === 'true' || opt.classList.contains('correct') || opt.getAttribute('aria-checked') === 'true') {
                opt.click();
                if(status) status.innerText = 'Selecionando alternativa...';
                return true;
            }
        }
        // Alternativa: Caso a resposta correta esteja marcada no DOM pai
        const correctOpt = document.querySelector('[data-correct="true"], .correct');
        if (correctOpt) {
            correctOpt.click();
            if(status) status.innerText = 'Selecionando alternativa...';
            return true;
        }
    }

    return false;
}

function runAnswerCycle() {
    const status = document.getElementById('statusText');
    if (isProcessing) return;

    // Reseta o estado se a URL mudou (nova questão carregada)
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        isProcessing = false;
        if(status) status.innerText = 'Nova questão detectada...';
    }

    const verifyBtn = findVerifyButton();
    
    if (verifyBtn && !isProcessing) {
        isProcessing = true;
        if(status) status.innerText = 'Procurando resposta...';
        
        const answered = findAndApplyAnswer();
        
        if (answered) {
            if(status) status.innerText = 'Respondendo e verificando...';
            setTimeout(() => {
                verifyBtn.click();
                if(status) status.innerText = 'Verificado! Aguardando próxima...';
                setTimeout(() => { isProcessing = false; }, 2000); // Aguarda 2s antes de procurar de novo
            }, 500); // Pequeno atraso para o React processar a resposta preenchida
        } else {
            if(status) status.innerText = 'Resposta não encontrada no DOM.';
            isProcessing = false; // Libera para tentar de novo no próximo ciclo
        }
    }
}

/* Inject */
if (!/^https?:\/\/([a-z0-9-]+\.)?khanacademy\.org/.test(window.location.href)) {
    alert(
        "❌ InnovationKhan Failed to Injected!\n\nVocê precisa executar o KhanInnovate no site do Khan Academy! (https://pt.khanacademy.org/)"
    );
    window.location.href = "https://pt.khanacademy.org/";
}

showFloatingWindow();

loadScript(
    'https://cdn.jsdelivr.net/npm/darkreader@4.9.92/darkreader.min.js',
    'darkReaderPlugin'
).then(() => {
    DarkReader.setFetchMethod(window.fetch);
    DarkReader.enable();
});

loadCss('https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css', 'toastifyCss');

loadScript('https://cdn.jsdelivr.net/npm/toastify-js', 'toastifyPlugin')
.then(async () => {
    sendToast("🪶 InnovationKhan Minimal injetado com sucesso!");
    playAudio('https://r2.e-z.host/4d0a0bea-60f8-44d6-9e74-3032a64a9f32/gcelzszy.wav');
    await delay(500);
    setupMain();
    console.clear();
});
