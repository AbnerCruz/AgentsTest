# v48.2 — a fundação vira ação

Correção do sintoma relatado: a gerente repetia "fundação estratégica" a cada
poucos segundos, com chamadas marcadas como OK, mas nada mudava — sem equipe,
sem plano, sem tarefas.

## Causa raiz

1. **`contratarPerfil()` não existia.** A função era chamada no fim da fundação,
   mas não estava definida em nenhum arquivo. O erro estourava depois de gravar
   a identidade e antes de contratar a equipe, criar o projeto e marcar a
   fundação como concluída. O `catch` devolvia a empresa para `aguardando_IA` e
   o motor (ciclo de 6s) refazia a chamada paga indefinidamente.
2. **`rtById()` não existia.** Quebrava as ordens da sala de reunião e a
   colaboração entre colegas antes de virarem tarefa.
3. **`factory.js` não estava no pacote**, embora `index.html` e `sw.js` a
   carreguem. É a camada que transforma a decisão em arquivo real
   (`S.factory.produzir`). Sem ela nenhuma tarefa geraria entrega.
4. **`contratar`, `demitir` e `planejar`** eram ações permitidas no prompt da
   gerente, mas `materializarDecisaoAgente` não as tratava: a decisão era
   tomada e descartada.
5. **Campos poluídos por markdown e pelo corpo da resposta.** O nome ficava
   `**Eldoria Press**`, e uma linha `Nome: ...` dentro do plano de negócio
   sobrescrevia o `NOME:` do cabeçalho.
6. **Teto de tokens errado na fundação.** Usava a IA de pensamento com teto de
   900 tokens para um documento longo; a resposta truncava antes do plano.

## O que mudou

- Criadas `contratarPerfil()`, `rtById()`, `parseFicha()` e limpeza de texto em
  `studio.js`. A ficha individual decidida pela IA é aplicada na contratação;
  campos ausentes caem para a personalidade-base do cargo.
- `factory.js` reescrita: produção real de arquivo a partir do briefing e da
  deliberação, evolução do artefato base quando existe, validação estrutural
  (tamanho, estrutura, placeholders) sem nota numérica artificial. Sem IA não
  há produção fictícia — a função falha e a tarefa volta para aberta.
- Fundação reestruturada em duas etapas independentes: chamada de IA e
  materialização. Uma resposta recebida **sempre** conclui a fundação; se a
  materialização falhar, a empresa segue com equipe mínima de recuperação e o
  erro fica registrado. O loop de chamadas não pode mais acontecer.
- A fundação passou a usar a IA de produção com teto de 3000 tokens.
- Espera de 60s entre tentativas de fundação (`ESPERA_FUNDACAO_MS`), para que
  uma falha real de IA não vire uma chamada paga a cada ciclo de 6s. A criação
  pela interface continua imediata (`processarFundacaoAtual(true)`).
- `contratar` / `demitir` / `planejar` da gerente agora alteram o quadro de
  pessoal e o plano de trabalho de verdade, com registro na ata.
- `campos()` lê somente o cabeçalho, antes do separador `---`, e remove
  markdown decorativo dos valores.
- `normalizarEstudio()` limpa nomes já salvos com `**` na carga, então a
  empresa existente se corrige sozinha ao abrir.
- `materializarDecisaoAgente` e `contratarPerfil` exportados em `S.studio`.
- Service worker: cache `estudio-v48.2-fundacao-acao`, para o navegador pegar
  os arquivos novos.
- Removidos do pacote `patch.py` (script de migração já aplicado) e
  `estudio-arquivo-unico.html` (cópia desatualizada e incompleta, sem a camada
  de produção; a versão que roda é a modular).

## Teste

`teste/fundacao.test.js` roda sem navegador e sem rede, com a IA simulada:

```bash
node teste/fundacao.test.js
```

Verifica: fundação concluída e operacional, nome sem markdown, equipe
contratada com ficha individual, plano e primeiro produto persistidos, tarefa
inicial criada, arquivo produzido e validado pela factory, decisões de quadro
aplicadas e ausência de chamada extra durante a espera.
