javascript:(function(){
  if (!window.AI_ASSISTANT_LOADED) {
    const scriptUrl = 'https://raw.githubusercontent.com/GabZs77/Ia-flutuante/main/script.js';
    const script = document.createElement('script');
    
    // Adiciona um parâmetro de cache busting para garantir a versão mais recente
    script.src = scriptUrl + '?t=' + Date.now();
    
    script.onload = function() {
      console.log('Assistente IA carregado com sucesso');
    };
    
    script.onerror = function() {
      console.error('Falha ao carregar o Assistente IA');
      alert('Não foi possível carregar o Assistente IA. Verifique sua conexão ou o URL do script.');
    };
    
    document.head.appendChild(script);
    window.AI_ASSISTANT_LOADED = true;
  } else {
    alert('O Assistente IA já está carregado nesta página!');
  }
})();
