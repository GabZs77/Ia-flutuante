(function(){
    if(document.getElementById('edu-terminal')){document.getElementById('edu-terminal').remove();return;}

    var API_AI='https://gen.pollinations.ai/v1/chat/completions';
    var API_KEY='pk_bJav4nbMa2fZGkqG';

    function getToken(){try{var m=document.cookie.match(/token=([^;]+)/);return m?m[1]:localStorage.getItem('token')||'';}catch(e){return '';}}
    function getCaptcha(){try{return localStorage.getItem('captcha')||'';}catch(e){return '';}}

    var css='#edu-terminal{position:fixed;top:20px;right:20px;width:420px;height:580px;background:#0d1117;border:1px solid #30363d;border-radius:12px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.5)}#edu-header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#161b22;border-bottom:1px solid #30363d;border-radius:12px 12px 0 0;cursor:move}#edu-header h3{margin:0;color:#58a6ff;font-size:14px}#edu-btns button{width:12px;height:12px;border-radius:50%;border:none;margin-left:6px;cursor:pointer}.btn-r{background:#f85149}.btn-m{background:#d29922}.btn-f{background:#3fb950}#edu-tabs{display:flex;background:#161b22;border-bottom:1px solid #30363d}#edu-tabs button{flex:1;padding:10px;background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:13px;transition:all .2s}#edu-tabs button.active{color:#58a6ff;background:#21262d;border-bottom:2px solid #58a6ff}#edu-body{flex:1;overflow-y:auto;padding:16px;color:#c9d1d9;font-size:13px;line-height:1.6}#edu-body::-webkit-scrollbar{width:6px}#edu-body::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}.task-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:10px;cursor:pointer;transition:all .2s}.task-card:hover{border-color:#58a6ff;transform:translateX(4px)}.task-title{font-weight:600;color:#fff;margin-bottom:6px}.task-meta{font-size:11px;color:#8b949e}.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-right:6px}.badge-pend{color:#3fb950;background:rgba(63,185,80,.15)}.badge-exp{color:#f85149;background:rgba(248,81,73,.15)}.answers-box{margin-top:10px;padding:10px;background:#0d1117;border-radius:6px;border:1px solid #30363d;display:none}.answers-box.show{display:block}.ans-item{padding:8px;margin:4px 0;background:#161b22;border-radius:4px;border-left:2px solid #58a6ff;font-size:12px}#chat-area{height:340px;overflow-y:auto;margin-bottom:12px}#chat-area::-webkit-scrollbar{width:6px}#chat-area::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}.msg{margin-bottom:12px;display:flex}.msg.user{justify-content:flex-end}.msg.bot{justify-content:flex-start}.bubble{max-width:85%;padding:10px 14px;border-radius:12px;line-height:1.5;word-wrap:break-word}.msg.user .bubble{background:#238636;color:#fff;border-bottom-right-radius:4px}.msg.bot .bubble{background:#161b22;color:#c9d1d9;border-bottom-left-radius:4px;border:1px solid #30363d}.input-row{display:flex;gap:8px}#chat-input{flex:1;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:10px 12px;color:#fff;font-size:13px;outline:none}#chat-input:focus{border-color:#58a6ff}#send-btn{background:#238636;border:none;border-radius:8px;padding:10px 16px;color:#fff;font-weight:600;cursor:pointer;transition:all .2s}#send-btn:hover{background:#2ea043}.loading{text-align:center;padding:40px;color:#8b949e}.spinner{display:inline-block;width:20px;height:20px;border:2px solid #30363d;border-top-color:#58a6ff;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}#status-bar{padding:8px 16px;background:#161b22;border-top:1px solid #30363d;font-size:11px;color:#8b949e;display:flex;justify-content:space-between}.dot{width:6px;height:6px;border-radius:50%;background:#3fb950;display:inline-block;margin-right:4px}';

    var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);

    var d=document.createElement('div');d.id='edu-terminal';
    d.innerHTML='<div id="edu-header"><h3>🎓 Edu Terminal</h3><div id="edu-btns"><button class="btn-f" onclick="eduRefresh()" title="Atualizar"></button><button class="btn-m" onclick="eduMinimize()" title="Minimizar"></button><button class="btn-r" onclick="eduClose()" title="Fechar"></button></div></div><div id="edu-tabs"><button class="active" onclick="eduTab(\'tasks\')">📋 Atividades</button><button onclick="eduTab(\'chat\')">🤖 Assistente</button></div><div id="edu-body"><div id="tab-tasks"><div class="loading"><div class="spinner"></div><p>Carregando...</p></div></div><div id="tab-chat" style="display:none"><div id="chat-area"><div class="msg bot"><div class="bubble">Olá! 👋 Sou seu assistente. Posso ver suas atividades e ajudar com dúvidas!</div></div></div><div class="input-row"><input type="text" id="chat-input" placeholder="Digite sua mensagem..." onkeypress="if(event.key==\'Enter\')eduSend()"><button id="send-btn" onclick="eduSend()">Enviar</button></div></div></div><div id="status-bar"><span><span class="dot"></span>Online</span><span id="edu-time">--:--</span></div>';
    document.body.appendChild(d);

    window.eduTasks={pend:[],exp:[]};
    window.eduChat=[];
    var min=false;

    // Drag
    (function(){var h=document.getElementById('edu-header'),el=d,p1=0,p2=0,p3=0,p4=0;h.onmousedown=function(e){e.preventDefault();p3=e.clientX;p4=e.clientY;document.onmouseup=function(){document.onmouseup=null;document.onmousemove=null};document.onmousemove=function(e){e.preventDefault();p1=p3-e.clientX;p2=p4-e.clientY;p3=e.clientX;p4=e.clientY;el.style.top=(el.offsetTop-p2)+'px';el.style.left=(el.offsetLeft-p1)+'px';el.style.right='auto'}}})();

    window.eduClose=function(){d.remove()};
    window.eduMinimize=function(){var b=document.getElementById('edu-body'),sb=document.getElementById('status-bar');if(min){b.style.display='block';sb.style.display='flex';min=false}else{b.style.display='none';sb.style.display='none';min=true}};
    window.eduTab=function(t){document.querySelectorAll('#edu-tabs button').forEach(function(b){b.classList.remove('active')});event.target.classList.add('active');document.getElementById('tab-tasks').style.display=t==='tasks'?'block':'none';document.getElementById('tab-chat').style.display=t==='chat'?'block':'none'};

    window.eduRefresh=function(){loadTasks()};

    async function loadTasks(){
        var token=getToken(),cap=getCaptcha();
        if(!token){document.getElementById('tab-tasks').innerHTML='<div class="loading"><p>⚠️ Token não encontrado</p><small>Faça login primeiro</small></div>';return;}
        document.getElementById('tab-tasks').innerHTML='<div class="loading"><div class="spinner"></div><p>Carregando...</p></div>';

        try{
            var cookies=document.cookie;
            var roomsRes=await fetch('https://edusp-api.ip.tv/room/user',{headers:{'Authorization':'Bearer '+token,'X-Captcha':cap,'Cookie':cookies}});
            var roomsData=await roomsRes.json();
            var targets=[];
            (roomsData.rooms||[]).forEach(function(r){if(r.name)targets.push(String(r.name));(r.group_categories||[]).forEach(function(g){if(g.id)targets.push(String(g.id))})});

            async function getT(exp){
                var u='https://edusp-api.ip.tv/tms/task/todo?expired_only='+exp+'&limit=100&offset=0&filter_expired='+(!exp)+'&is_exam=false&with_answer=true&is_essay=false&answer_statuses=draft&answer_statuses=pending&with_apply_moment=true';
                targets.forEach(function(t){u+='&publication_target='+encodeURIComponent(t)});
                var r=await fetch(u,{headers:{'Authorization':'Bearer '+token,'X-Captcha':cap,'Cookie':cookies}});
                var d=await r.json();
                return Array.isArray(d)?d:(d.results||d.tasks||[]);
            }

            var [pendData,expData]=await Promise.all([getT(false),getT(true)]);
            
            window.eduTasks.pend=pendData.map(function(t){return{id:t.id,title:t.title||'#'+t.id,date:t.expire_at?new Date(t.expire_at).toLocaleString('pt-BR'):'',target:t.publication_target||'',desc:t.description||'',qs:t.questions||[]}});
            window.eduTasks.exp=expData.map(function(t){return{id:t.id,title:t.title||'#'+t.id,date:t.expire_at?new Date(t.expire_at).toLocaleString('pt-BR'):'',target:t.publication_target||'',desc:t.description||'',qs:t.questions||[]}});

            renderTasks();
            document.getElementById('edu-time').textContent=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
        }catch(e){document.getElementById('tab-tasks').innerHTML='<div class="loading"><p>❌ Erro ao carregar</p><small>'+e.message+'</small></div>';}
    }

    function renderTasks(){
        var h='';
        if(window.eduTasks.pend.length===0&&window.eduTasks.exp.length===0){h='<div class="loading"><p>✅ Nenhuma atividade</p></div>'}
        else{
            if(window.eduTasks.pend.length>0){h+='<p style="color:#3fb950;margin-bottom:8px;">● Pendentes ('+window.eduTasks.pend.length+')</p>';window.eduTasks.pend.forEach(function(t){h+=taskCard(t,false)})}
            if(window.eduTasks.exp.length>0){h+='<p style="color:#f85149;margin:16px 0 8px;">● Expiradas ('+window.eduTasks.exp.length+')</p>';window.eduTasks.exp.forEach(function(t){h+=taskCard(t,true)})}
        }
        document.getElementById('tab-tasks').innerHTML=h;
    }

    function taskCard(t,expired){
        return '<div class="task-card" onclick="eduAnswers(\''+t.id+'\',\''+(t.target||'')+'\')"><div class="task-title">'+t.title+'</div><div class="task-meta"><span class="badge '+(expired?'badge-exp':'badge-pend')+'">'+(expired?'EXPIRADA':'PENDENTE')+'</span>📅 '+t.date+'</div><div class="answers-box" id="ans-'+t.id+'"></div></div>'
    }

    window.eduAnswers=function(id,target){
        var box=document.getElementById('ans-'+id);
        if(box.classList.contains('show')){box.classList.remove('show');box.innerHTML='';return}
        box.classList.add('show');
        box.innerHTML='<div class="loading"><div class="spinner"></div></div>';

        fetch('https://edusp-api.ip.tv/tms/task/'+id+'/answers?room_code='+encodeURIComponent(target),{headers:{'Authorization':'Bearer '+getToken(),'Cookie':document.cookie}})
        .then(function(r){return r.json()})
        .then(function(d){
            var ans=d.answers||d.results||d;
            if(!ans||ans.length===0){box.innerHTML='<p style="color:#8b949e;text-align:center">Sem respostas</p>';return}
            var h='';ans.forEach(function(a,i){h+='<div class="ans-item"><strong>Q'+(i+1)+': </strong>'+((typeof a==='object')?(a.answer_text||JSON.stringify(a)):a)+'</div>'});
            box.innerHTML=h;
        })
        .catch(function(e){box.innerHTML='<p style="color:#f85149">Erro: '+e.message+'</p>'})
    };

    // Chat
    window.eduSend=async function(){
        var input=document.getElementById('chat-input');
        var msg=input.value.trim();
        if(!msg)return;

        addMsg(msg,'user');
        input.value='';

        var typing=document.createElement('div');
        typing.className='msg bot';
        typing.id='typing';
        typing.innerHTML='<div class="bubble"><div class="spinner" style="display:inline-block;vertical-align:middle;margin-right:8px"></div>Digitando...</div>';
        document.getElementById('chat-area').appendChild(typing);
        scrollChat();

        try{
            var ctx='Tarefas:\nPENDENTES:\n'+window.eduTasks.pend.map(function(t){return '- ['+t.id+'] '+t.title}).join('\n')+'\n\nEXPIRADAS:\n'+window.eduTasks.exp.map(function(t){return '- ['+t.id+'] '+t.title}).join('\n');

            var res=await fetch(API_AI,{
                method:'POST',
                headers:{'Content-Type':'application/json','Authorization':'Bearer '+API_KEY},
                body:JSON.stringify({
                    model:'openai',
                    messages:[
                        {role:'system',content:'Você é assistente educacional. Use estas tarefas para ajudar:\n'+ctx+'\nResponda em pt-BR, seja útil e conciso.'},
                        ...window.eduChat.slice(-8),
                        {role:'user',content:msg}
                    ],
                    temperature:0.7,
                    max_tokens:1500
                })
            });

            var data=await res.json();
            var reply=data.choices[0].message.content;
            addMsg(reply,'bot');
            window.eduChat.push({role:'user',content:msg},{role:'assistant',content:reply});
        }catch(e){addMsg('Erro: '+e.message,'bot')}
        
        var t=document.getElementById('typing');if(t)t.remove();
    };

    function addMsg(text,role){
        var div=document.createElement('div');
        div.className='msg '+role;
        div.innerHTML='<div class="bubble">'+text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>')+'</div>';
        document.getElementById('chat-area').appendChild(div);
        scrollChat();
    }
    
    function scrollChat(){var a=document.getElementById('chat-area');a.scrollTop=a.scrollHeight}

    // Auto refresh
    var lastURL=location.href;
    setInterval(function(){if(location.href!==lastURL){lastURL=location.href;loadTasks()}},5000);

    loadTasks();
})();
