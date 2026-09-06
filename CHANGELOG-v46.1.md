# v46.1 — correção de sincronização OpenRouter

- Corrige a interpretação de `limit_remaining: null` em `GET /api/v1/key`: `null` significa que a chave não possui limite de gasto, e não saldo US$ 0.
- O motor deixa de bloquear chamadas OpenRouter quando a chave é ilimitada.
- O painel passa a distinguir `sem limite de chave` de `US$ ... no limite da chave`.
- HTTP 402 do OpenRouter passa a ser tratado como falta real de créditos.
- Mantém o orçamento local de 30 dias e o teto diário como controles independentes.
