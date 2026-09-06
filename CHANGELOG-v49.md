# v49 — index.html vira o jogo, quadrado como placeholder, loop de IA corrigido

## 1. `index.html` agora é o jogo

- O que era `game.html` virou `index.html` (porta de entrada principal).
- O que era `index.html` (painéis mobile) virou `classico.html`.
- Mesmo `localStorage`, mesma empresa nos dois — só muda a interface.
- `☰` no jogo abre `classico.html`; um link `🎮 jogo` no topo do clássico
  volta pro jogo.
- `sw.js`: cache renomeado (`estudio-v49-index-jogo`) e a lista de arquivos
  do shell atualizada para os novos nomes.

## 2. Sem PNG = quadrado colorido (não mais desenho vetorial)

Antes, sem sprite, o app desenhava por código um personagem detalhado
(cabeça, cabelo, braços, pernas, olhos, notebook) e móveis com ícones
próprios (folhas da planta, almofadas do sofá etc.). Isso escondia visualmente
que a arte ainda não tinha chegado, e era um monte de código só pra um
placeholder. Agora:

- **Personagem** sem `char_base.png`: quadrado 24×24 na cor do agente.
- **Mesa** sem `mesa.png`: retângulo simples.
- **Móveis de decoração** (planta, sofá, estante, quadro, luminária,
  bancada) sem sprite: quadrado colorido do tamanho do objeto, uma cor fixa
  por tipo pra dar pra diferenciar.
- Continua tudo plugado: assim que o PNG certo aparece em `./assets/`, o
  sprite substitui o quadrado sozinho, sem mudar nada de código.
- Isso só vale para `index.html` (o jogo). `classico.html` manteve o
  desenho antigo — é uma tela pequena embutida num painel, não pixel art
  de verdade, então o detalhe vetorial ainda faz sentido lá.

## 3. Loop de IA — causa raiz e correção

**O que causava:** `ai.js` truncava todo prompt em 4500 caracteres, cortando
do **início**. Em telas com contexto grande (ex: a gerente inspecionando o
conteúdo completo de um arquivo entregue), a instrução `RETORNE SOMENTE:
DECISAO: ...` — que ficava no **final** do prompt — era cortada fora. A IA
respondia texto livre sem nenhum campo reconhecível, o parser não achava
`DECISAO`, e o código tratava isso como "sem decisão", jogando o candidato
de volta pra fila. Como a inspeção não tinha limite de tentativas nem
intervalo mínimo, o motor tentava de novo a cada ciclo (6s), pra sempre —
exatamente o "Íris: inspecionou X: ." repetido que apareceu no print.

**Correção na raiz (`ai.js`): o prompt vai inteiro, sem nenhum truncamento.**
A primeira tentativa de correção preservava a cauda do prompt ao cortar (pra
não perder as instruções de formato). Mas cortar conteúdo — mesmo no meio —
ainda tira contexto real que a IA precisa pra decidir direito, especialmente
em telas como a inspeção da gerente, onde o conteúdo completo do arquivo é o
próprio objeto da análise. A decisão final foi remover o corte por completo:
`sistema` e `pedido` vão sempre inteiros pro modelo, não importa o tamanho.
O limite de custo continua existindo, só que do jeito certo: antes de cada
chamada o app estima o custo real (tokens de entrada × preço do modelo) e
recusa a chamada se estourar o orçamento em dólar do ciclo — não é mais um
corte arbitrário de caracteres que arrisca truncar informação no meio do
caminho. `factory.js` também deixou de cortar o artefato base em 6000
caracteres ao evoluir um arquivo existente, pelo mesmo motivo.
Isso protege **qualquer chamada de qualquer agente** que monte um prompt
grande, não só a inspeção — a mesma classe de bug podia atingir a fundação,
a produção de arquivo ou uma deliberação com muito contexto.

**Trava anti-loop (`studio.js`, defesa em profundidade):**
- `avaliar()` (inspeção da gerente): no máximo 3 tentativas por candidato,
  com cooldown de 2 minutos entre elas. Na 3ª tentativa sem decisão válida,
  fecha o candidato (`avaliado = true`) e abre uma tarefa de "revisão
  manual" em vez de ficar tentando pra sempre.
- `executar()` (qualquer funcionário executando qualquer tarefa): backoff
  exponencial a cada falha (20s, 40s, 80s...) e, depois de 4 falhas
  seguidas, a tarefa para de ser pega automaticamente (`bloqueada = true`).
  Continua visível no plano de trabalho, só não entra mais sozinha no
  ciclo — precisa de uma decisão nova de algum agente (corrigir/continuar
  criam uma tarefa nova, que não herda o bloqueio).
- Removido um `executar()` duplicado e morto (a segunda definição já
  sobrescrevia a primeira em JS; ficou só como código morto confuso).

## Teste

`node teste/loop-avaliacao.test.js` reproduz o sintoma exato do print
(a IA nunca devolve `DECISAO` reconhecível) e comprova: no máximo 3
chamadas de IA são gastas com o mesmo arquivo, o candidato é fechado, uma
tarefa de revisão manual é aberta, e nenhum ciclo seguinte volta a mexer
nele.

`node teste/fundacao.test.js` e `node teste/layout-jogo.test.js` continuam
passando sem alteração de comportamento esperado.
