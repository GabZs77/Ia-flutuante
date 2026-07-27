(function(){
    if(document.getElementById('gc')){document.getElementById('gc').remove();return;}
    const d=document;
    const b=d.body;
    const c=d.createElement('div');
    c.id='gc';
    c.style='position:fixed;top:10px;right:10px;width:350px;height:500px;background:#101623;color:#edf3ff;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:9999;overflow:hidden;font-family:Poppins,sans-serif;';
    c.innerHTML='<style>*{margin:0;padding:0;box-sizing:border-box;}.h{font-size:1.2rem;background:linear-gradient(to right,#1d7efd,#8f6fff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}.sh{color:#97a7ca;font-size:1rem;}.cc{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;}.ci{cursor:pointer;padding:8px;width:calc(50% - 4px);border-radius:8px;background:#283045;font-size:0.8rem;}.ci:hover{background:#333e58;}.mc{height:300px;overflow-y:auto;padding:10px;}.m{display:flex;gap:8px;margin:5px 0;}.ma{width:25px;height:25px;border-radius:50%;background:#283045;display:flex;align-items:center;justify-content:center;}.mu{flex-direction:row-reverse;}.mu .mtc{background:#283045;border-radius:10px 10px 2px 10px;padding:8px;max-width:80%;}.mb .mtc{background:#1a1f2e;border-radius:10px 2px 10px 10px;padding:8px;}.pc{position:absolute;bottom:0;width:100%;padding:10px;background:#101623;}.pf{display:flex;background:#283045;border-radius:20px;padding:0 10px;}.pi{flex:1;border:none;background:none;color:#edf3ff;outline:none;padding:8px;}.pb{background:none;border:none;color:#edf3ff;cursor:pointer;}.pr{display:none;position:relative;margin-top:5px;}.pri{max-width:60px;max-height:60px;border-radius:8px;object-fit:cover;}.prf{display:flex;align-items:center;gap:5px;padding:5px;background:#1a1f2e;border-radius:8px;font-size:0.8rem;}.prc{position:absolute;top:-5px;right:-5px;background:#d62939;color:white;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:0.7rem;}</style><div style="padding:15px;"><h2 class="h">Gemini Chat</h2><p class="sh">Como posso ajudar?</p></div><div class="cc"><div class="ci">Setup home office barato</div><div class="ci">Evoluir em dev web</div><div class="ci">Debugar JavaScript</div><div class="ci">Componente React</div></div><div class="mc" id="mc"></div><div class="pc"><div class="pr" id="pr"><div class="prc" id="prc">×</div></div><form class="pf" id="pf"><input type="file" id="fi" style="display:none" accept="image/*,.pdf,.txt,.csv"><button type="button" class="pb" id="ab">📎</button><input type="text" placeholder="Pergunte ao Gemini" class="pi" id="pi" required><button type="submit" class="pb">➤</button></form></div>';
    b.appendChild(c);
    const mc=d.getElementById('mc');
    const pf=d.getElementById('pf');
    const pi=d.getElementById('pi');
    const fi=d.getElementById('fi');
    const ab=d.getElementById('ab');
    const pr=d.getElementById('pr');
    const prc=d.getElementById('prc');
    const API_KEY="pk_bJav4nbMa2fZGkqG";
    const API_URL="https://gen.pollinations.ai/v1";
    let ch=[];
    let fd=null;
    ab.addEventListener('click',()=>fi.click());
    fi.addEventListener('change',(e)=>{
        const f=e.target.files[0];
        if(!f)return;
        const r=new FileReader();
        r.onload=(e)=>{
            fd={name:f.name,type:f.type,data:e.target.result.split(',')[1]};
            if(f.type.startsWith('image/')){pr.innerHTML=`<img src="${e.target.result}" class="pri"><div class="prc">×</div>`;}
            else{pr.innerHTML=`<div class="prf">📄 ${f.name}<div class="prc">×</div></div>`;}
            pr.style.display='block';
        };
        r.readAsDataURL(f);
    });
    pr.addEventListener('click',(e)=>{if(e.target.classList.contains('prc')){fd=null;pr.style.display='none';fi.value='';}});
    pf.addEventListener('submit',async(e)=>{
        e.preventDefault();
        const q=pi.value.trim();
        if(!q)return;
        pi.value='';
        const mu=d.createElement('div');
        mu.className='m mu';
        let umc=`<div class="mtc">${q}</div>`;
        if(fd){if(fd.type.startsWith('image/')){umc+=`<img src="data:${fd.type};base64,${fd.data}" class="pri">`;}else{umc+=`<div class="prf">📄 ${fd.name}</div>`;}}
        mu.innerHTML='<div class="ma">👤</div>'+umc;
        mc.appendChild(mu);
        const mb=d.createElement('div');
        mb.className='m mb';
        mb.innerHTML='<div class="ma">🤖</div><div class="mtc">Digitando...</div>';
        mc.appendChild(mb);
        mc.scrollTop=mc.scrollHeight;
        let content=[{type:"text",text:q}];
        if(fd)content.push({type:"image_url",image_url:{url:`data:${fd.type};base64,${fd.data}`}});
        ch.push({role:"user",content});
        fd=null;pr.style.display='none';fi.value='';
        try{
            const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${API_KEY}`},body:JSON.stringify({model:"openai",messages:ch})});
            const data=await r.json();
            if(!r.ok)throw new Error(data.error?.message || 'Erro na requisição');
            let rt=data.choices[0].message.content;
            rt=rt.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
            mb.querySelector('.mtc').innerHTML=rt;
            ch.push({role:"assistant",content:[{type:"text",text:rt}]});
        }catch(e){mb.querySelector('.mtc').textContent='Erro: '+e.message;}
        mc.scrollTop=mc.scrollHeight;
    });
    d.querySelectorAll('.ci').forEach(i=>{i.addEventListener('click',()=>{pi.value=i.textContent;pf.dispatchEvent(new Event('submit'));});});
    d.addEventListener('keydown',e=>{if(e.key==='F10'){e.preventDefault();c.style.display=c.style.display==='none'?'block':'none';}});
})();
