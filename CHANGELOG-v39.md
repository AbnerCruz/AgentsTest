# Estúdio v39 — correção do motor de IA

## Problema observado
No OpenRouter com `openai/gpt-oss-20b`, algumas deliberações terminavam em `finish_reason=length` sem `message.content`. A interface mostrava uma mensagem incorreta mencionando Groq.

## Correção
- diagnóstico agora usa o provedor ativo;
- OpenRouter recebe `reasoning: { effort, exclude }`;
- GPT-OSS recebe recuperação única para decisões/maestro quando termina por limite;
- agentes econômicos usam `low` por padrão para reduzir custo/latência;
- contador de uso recebe uma nova chave de armazenamento;
- service worker recebe novo nome de cache.


## v39.1 — agentes realmente entram em produção
- Corrigido o loop em que uma decisão de `estudar`/`revisar` chamava o modo de contingência mesmo com a IA funcionando.
- A agência agora recebe as capacidades de produção disponíveis e, quando não há trabalho aberto em projeto ativo, é orientada a criar uma entrega concreta.
- Revisão/estudo escolhidos pela IA, quando houver contexto concreto, podem virar uma tarefa de evolução vinculada ao artefato-base.
- Fallback de criação usa uma capacidade compatível apenas como segurança; não define uma sequência fixa de produção.
- `estudio-arquivo-unico.html` sincronizado novamente com `agency.js` e `studio.js`.


## v39.1 — ponte decisão → execução
- A gerente agora não encerra uma decisão operacional apenas no pensamento/ata: decisões executáveis são materializadas em tarefa, responsável e execução real.
- Ordens dadas na sala de reuniões são encaminhadas imediatamente para produção quando houver capacidade.
- Se a resposta estruturada da gerente vier sem campos de tarefa, uma segunda chamada curta converte a ordem em uma primeira entrega executável.
- A gerente delega a consequência operacional em vez de apenas registrar uma recomendação.


## v40 — execução obrigatória da gerência
- Corrigido o ciclo executivo: `executar_tarefa` agora é efetivamente despachado pela gerente.
- A gerente não pode encerrar o ciclo apenas pensando/esperando/planejando; decisões não executáveis são convertidas em tarefa concreta.
- O fallback de especialidade não escolhe mais `landing` como primeiro kit quando ainda não existe produto principal; a primeira entrega passa a ser `obra`.
- Funcionários também respeitam essa proteção quando criam trabalho autonomamente.
- Primeira obra principal com qualidade estrutural alta pode passar pelo release sem ficar presa em aprovação textual repetitiva.
