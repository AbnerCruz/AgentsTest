# Estúdio v45

## Orçamento diário configurável + mensal automático
- Orçamento local configurável para um ciclo de 30 dias.
- Limite diário em dólar configurável.
- Modo automático: o limite de cada novo dia é calculado como o saldo restante do ciclo dividido pelos dias restantes.
- Se o dia economiza, os próximos dias ganham margem; se o dia gasta mais, os próximos limites encolhem.
- O limite diário e o limite do ciclo são verificados antes de cada chamada, usando uma estimativa conservadora do custo máximo da chamada.
- O limite de tokens por dia permanece como segundo freio de segurança.
- Ao esgotar o limite diário, novas chamadas são bloqueadas até o próximo dia; ao esgotar o ciclo, ficam bloqueadas até a renovação dos 30 dias.
- A rotina física continua sem IA: alimentação, televisão, descanso e dormitório.
- Configuração não força mais US$ 3,00 silenciosamente a cada carregamento; o valor salvo pelo usuário é preservado.
