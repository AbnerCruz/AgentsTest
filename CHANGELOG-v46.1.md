# v46.1 — correção de sincronização OpenRouter

- Corrige a interpretação de `limit_remaining: null` em `GET /api/v1/key`: `null` significa que a chave não possui limite de gasto, e não saldo US$ 0.
- O motor deixa de bloquear chamadas OpenRouter quando a chave é ilimitada.
- O painel passa a distinguir `sem limite de chave` de `US$ ... no limite da chave`.
- HTTP 402 do OpenRouter passa a ser tratado como falta real de créditos.
- Mantém o orçamento local de 30 dias e o teto diário como controles independentes.

## v46.2 — saldo OpenRouter realmente sincronizado

- adicionada Management Key do OpenRouter para consultar `GET /api/v1/credits`;
- saldo real da conta passa a aparecer separadamente do limite da API key;
- o orçamento local continua funcionando como teto deste Estúdio;
- o valor efetivamente disponível para o Estúdio passa a ser o menor entre orçamento local, saldo real da conta e limite da chave, quando estes estiverem disponíveis;
- após cada chamada OpenRouter, o custo real retornado em `usage.cost` é usado na contabilidade local e o saldo da conta é sincronizado novamente;
- gasto feito fora do Estúdio no mesmo OpenRouter account passa a reduzir imediatamente a disponibilidade efetiva após a próxima sincronização;
- `limit_remaining: null` continua significando “sem limite de chave”, nunca saldo zero.
