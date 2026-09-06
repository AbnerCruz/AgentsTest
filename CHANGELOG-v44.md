# Estúdio v44

## Orçamento e autonomia de custo
- US$ 3,00 por período de 30 dias, com margem local de segurança de US$ 0,10.
- Contabilização por provedor/modelo usando prompt/completion tokens e preços configurados.
- Bloqueio preventivo antes de iniciar uma chamada que ultrapassaria o orçamento.
- Teto diário de tokens permanece apenas como proteção secundária.
- Quando o orçamento termina ou deixa de comportar a próxima chamada, agentes entram em rotina física de refeição/sono sem fabricar produção.

## Produção
- Contexto de produção mais enxuto e orientado ao material relevante.
- Site central como destino de toda entrega cliente-visível.
- Nenhum template de produto ou layout de site é escolhido pelo código.
- A gerente exige análise, evidências, pendências e `PRONTO: sim` para liberar uma entrega.

## Arquitetura
- Cada funcionário mantém lane própria de IA.
- Não existe maestro.
- Mercado simulado permanece removido.
- Rotinas físicas de descanso são determinísticas e não consomem IA.
