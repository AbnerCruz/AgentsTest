# v48 — OpenRouter único e orçamento diário automático

- Removido o Groq do motor, interface e roteamento.
- OpenRouter passa a ser o único provedor.
- Removido o teto diário local de 120.000 tokens.
- Removidos os controles de limite diário manual e de ativação/desativação do cálculo automático.
- Limite diário em dólar passa a ser sempre calculado automaticamente pelo orçamento restante do ciclo.
- Removido o botão de sincronização manual do saldo.
- Management Key continua sincronizando o saldo automaticamente ao iniciar e a cada 60 segundos enquanto a página estiver visível.
- Mantida a verificação do saldo real do OpenRouter antes das chamadas pagas.
