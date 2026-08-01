# IA Flutuante

Interface de chat de IA flutuante (bookmarklet). Basta arrastar/colar como favorito e clicar — ou apertar **F10** para abrir/fechar.

```html
javascript:fetch("https://raw.githubusercontent.com/GabZs77/Ia-flutuante/refs/heads/main/bookmark.js").then(t=>t.text()).then(eval);
```

## Já funciona sem configurar nada

O chat vem com uma chave de API **embutida** (OpenRouter, modelo gratuito), então
funciona direto ao abrir — ninguém precisa colar chave.

> A antiga API gratuita do **Pollinations** passou a exigir créditos pagos ("pollen"),
> o que causava o erro *"Oh no, there's nothing here."* (HTTP 402). Por isso o padrão
> agora é o OpenRouter.

## ⚠️ Aviso de segurança sobre a chave embutida

Este arquivo é **público** (servido cru pelo GitHub), então a chave embutida também é
pública. Consequências:

- Bots que varrem o GitHub podem encontrá-la, e a OpenRouter pode **revogá-la
  automaticamente**.
- Qualquer pessoa pode gastar os limites dessa chave.

Por isso, use apenas uma chave **descartável, sem créditos pagos** (só modelos `:free`).
Se ela parar de funcionar, gere outra em https://openrouter.ai/keys e atualize o
`BUILTIN_KEYS` no topo do `bookmark.js`.

## Usar sua própria chave / outro provedor (opcional)

Abra **⚙ Configurações** (engrenagem no topo) e escolha:

| Provedor | Custo | Chave |
|----------|-------|-------|
| **OpenRouter** (padrão, chave embutida) | Grátis (`:free`) | https://openrouter.ai/keys |
| **Groq** | Grátis | https://console.groq.com/keys |
| **Pollinations** | Requer créditos/token | https://auth.pollinations.ai |
| **Personalizado** | Endpoint OpenAI-compatível | — |

Uma chave colada nas Configurações **substitui** a embutida e fica salva apenas no seu
navegador (`localStorage`).
