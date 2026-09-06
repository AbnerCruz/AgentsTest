# v45.1 — Trabalho intensivo

- Adicionado modo **Trabalho intensivo** na configuração de IA.
- O modo intensivo ignora exclusivamente o limite diário em dólar.
- O teto do ciclo de 30 dias continua absoluto e é verificado antes de cada chamada.
- Ao alternar para intensivo depois de um bloqueio diário, o bloqueio preventivo diário é liberado.
- O limite diário continua sendo mostrado como referência, mas marcado como ignorado no modo intensivo.
- Atualizado o HTML standalone e o cache do Service Worker.

## v45.2 — Groq grátis → OpenRouter sincronizado
- Novo roteamento automático: tenta Groq primeiro e só usa OpenRouter quando a cota real da Groq estiver indisponível.
- Cota da Groq lida dos cabeçalhos reais (`x-ratelimit-*` / `retry-after`) e respeitada antes de novas chamadas.
- Chamadas gratuitas da Groq não consomem o orçamento financeiro local; uso pago no OpenRouter continua consumindo o orçamento de 30 dias/diário.
- OpenRouter sincroniza `limit_remaining`, `usage`, `usage_daily` e `usage_monthly` pelo endpoint da própria chave antes de chamadas pagas.
- A chamada é bloqueada se o limite real restante do OpenRouter não comportar o custo estimado.
- O painel do Motor mostra o estado separado de Groq e OpenRouter e o modo de roteamento.
- Chaves podem ser configuradas juntas no modo automático.
