# v46.3 — Management Key no cliente + saldo sincronizado

- Management Key do OpenRouter pode ser colada diretamente no cliente.
- A chave é armazenada apenas no `localStorage` do navegador deste dispositivo.
- O cliente consulta `GET https://openrouter.ai/api/v1/credits` diretamente no OpenRouter.
- O saldo real da conta é calculado a partir de `total_credits - total_usage`.
- Sincronização automática a cada 60 segundos enquanto a página estiver visível.
- Nova chamada de sincronização após uma chamada paga do OpenRouter.
- O limite opcional da API key continua separado do saldo da conta.
- `limit_remaining: null` continua significando ausência de limite específico da chave.
- O painel do Motor mostra: saldo real da conta, disponível para o Estúdio e limite da chave.
- A Management Key não é incluída em nenhum arquivo do projeto nem enviada para outro servidor; é usada pelo navegador apenas para autenticar a consulta ao OpenRouter.

## Importante

Este projeto é estático/GitHub Pages. Portanto, uma Management Key colocada no cliente **não é um segredo criptograficamente protegido**: alguém com acesso ao navegador, DevTools ou ao perfil local do navegador pode potencialmente obtê-la. Use esta versão somente para uma instalação pessoal/controlada e revogue a Management Key se houver suspeita de exposição.
