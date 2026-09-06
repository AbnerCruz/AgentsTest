# CHANGELOG v42

## Arquitetura de IA por funcionário

- Cada funcionário, inclusive a gerente, possui uma lane própria de IA.
- A configuração foi simplificada para **IA de pensamento** e **IA de produção**.
- A revisão usa a IA de pensamento; não existe um terceiro modelo de revisão.
- O antigo agente maestro foi removido. A gerente é o núcleo executivo.
- Uma chamada em andamento de um funcionário não bloqueia a lane dos outros.
- Limites 429 do provedor continuam sendo globais, porque pertencem à conta/provedor, não ao funcionário.
- Falhas transitórias bloqueiam apenas a lane que falhou.
- O limite local diário de tokens impede consumo indefinido da chave.

## Cognição → execução

- A gerente possui cadência própria e não fica atrás do ciclo dos funcionários.
- Uma decisão operacional da gerente deve materializar uma tarefa e despachar um funcionário.
- Uma ordem da sala de reuniões não pode terminar somente como fala/ata.
- Se o modelo não preencher a estrutura da ordem, o sistema usa a própria ordem do dono como briefing e cria a primeira tarefa sem outra chamada.
- A camada de pensamento do funcionário pode falhar sem impedir a tentativa da IA de produção usando o briefing persistente.

## Produção

- Sem IA não existe atividade artificial, artefato falso ou repetição de "estudo".
- A produção continua baseada em projetos e artefatos persistentes.
- A fábrica não usa pontuação numérica de qualidade para decidir o que é bom.
- A validação local verifica apenas evidências estruturais.
- A primeira entrega de uma editora prioriza a obra principal, não landing pages ou materiais de divulgação.

## Removido

- `market.js` e toda a simulação de clientes, visitas, leads, pedidos, vendas, caixa e comissões.
- Métricas econômicas fictícias da interface.
- Modelo/rotina de maestro.
- Campo numérico de qualidade artificial.
