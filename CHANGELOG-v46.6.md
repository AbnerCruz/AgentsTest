# v46.6 — sincronização visível do saldo OpenRouter

- Corrige o fluxo da versão modular: a Management Key agora é realmente salva ao clicar em “Salvar e ativar”/“Testar”.
- Adiciona botão explícito “Sincronizar saldo” no painel Motor.
- Exibe o saldo real da conta OpenRouter e erros de sincronização imediatamente abaixo da Management Key.
- `GET /api/v1/credits` agora dispara atualização visual (`ia`) tanto em sucesso quanto em erro.
- O saldo sincronizado continua sendo `total_credits - total_usage`.
- `limit_remaining: null` continua significando ausência de limite específico da API key, não saldo zero.
- Mantém o projeto 100% cliente/GitHub Pages.
