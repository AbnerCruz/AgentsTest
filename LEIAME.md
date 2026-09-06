# Estúdio — v49

## index.html agora é o jogo (leia primeiro)
- A porta de entrada principal (`index.html`) é a versão tela-cheia
  horizontal, pixel art top-down. A versão antiga em painéis (mobile) virou
  `classico.html` — os dois leem o mesmo estado salvo, é a mesma empresa.
- Vai e volta entre os dois: `☰` no jogo abre o clássico; `🎮 jogo` no
  clássico volta pro jogo.
- Sem PNG definido, o elemento aparece como um quadrado colorido simples —
  personagem, mesa e móveis de decoração. Nada de desenho vetorial detalhado
  no lugar da arte que falta; é só um placeholder mesmo, até você soltar o
  PNG em `./assets/`.
- **Loop de IA corrigido.** Um agente (a gerente, mas o mesmo bug podia
  atingir qualquer um) podia ficar reinspecionando o mesmo arquivo pra
  sempre, gastando chamada a cada poucos segundos sem nunca decidir nada.
  Causa raiz e a trava: CHANGELOG-v49.md.

# Estúdio — v48.3

## Modo jogo
- Pixel art top-down, sala por departamento, HUD e dock inferior. Mesmo
  motor de agentes, mesmo estado salvo.
- Detalhes técnicos: CHANGELOG-v48.3.md.

# Estúdio — v48.2

## Correção da fundação (leia primeiro)
- A fundação da empresa agora sempre termina em ação: identidade, plano de
  negócio, primeiro produto, equipe contratada com ficha individual e a
  primeira tarefa no plano de trabalho.
- `factory.js` (camada de produção de arquivos reais) voltou ao pacote; ela é
  carregada pelo `index.html` e sem ela nenhuma entrega era possível.
- A gerente contrata, demite e planeja de verdade: essas decisões alteram o
  quadro de pessoal e o plano, em vez de morrerem na deliberação.

- Uma falha de IA na fundação espera 60s antes de tentar de novo, então não há
  mais sequência de chamadas pagas sem resultado.
- Teste sem navegador: `node teste/fundacao.test.js`.

# Estúdio — v48

## Motor de IA
- O único provedor disponível é o **OpenRouter**.
- A chave de API do OpenRouter é usada para as chamadas de produção.
- A **Management Key** consulta o saldo real da conta automaticamente, sem botão manual de sincronização.
- O limite diário em dólar é **sempre calculado automaticamente** a partir do orçamento restante do ciclo de 30 dias e dos dias restantes.
- O antigo teto diário de tokens (120.000) foi removido; continuam valendo os limites reais retornados pelo OpenRouter e o orçamento em dólar do ciclo.
- O orçamento local continua sendo uma trava de segurança independente do saldo real do provedor.

# Estúdio — simulação de equipe com produção real

## Arquitetura atual (v42)

- **Cada pessoa possui uma IA própria:** uma lane independente de pensamento e produção, com memória e contexto do funcionário.
- A configuração tem somente **IA de pensamento** e **IA de produção**. A gerente usa a mesma IA de pensamento; não existe maestro separado.
- Uma chamada em andamento de um funcionário **não torna a IA dos demais indisponível**. Apenas um limite real do provedor pode bloquear todas as lanes.
- Pensar e produzir são etapas distintas: o pensamento escolhe a abordagem e a produção precisa materializar um arquivo real.
- Se a camada de pensamento falhar, a tarefa não é transformada em “estudo”: o briefing persistente ainda pode ser enviado à IA de produção.
- Sem IA, não há produção fictícia nem logs repetitivos de “estudo”. O agente aguarda e retoma automaticamente.
- A gerente tem sua própria cadência operacional e é responsável por fazer a roda girar; não há um agente “maestro”.
- Ordens dadas na sala de reuniões não terminam na conversa: a gerente precisa convertê-las em tarefa e despachar um funcionário. Se a resposta estruturada falhar, a ordem original vira briefing diretamente, sem uma segunda chamada.
- Não existe mercado, vendas, caixa, clientes ou comissão simulados. O aplicativo produz arquivos; a interação com o mundo real e a venda desses arquivos ficam com o dono.
- Não existe nota numérica artificial de qualidade. A validação local só verifica evidências estruturais (campos essenciais, conteúdo e placeholders).
- Há um **limite local diário de tokens**, configurável, para impedir consumo indefinido da chave.
- Projetos e artefatos permanecem persistentes e novas versões podem partir explicitamente de artefatos anteriores.

## Objetivo

O Estúdio deve funcionar como uma pequena equipe autônoma: observar o projeto, pensar, decidir, executar e deixar um resultado concreto no acervo. A interface visualiza esse processo, mas não substitui a produção.

- Corrigido o diagnóstico incorreto que dizia “A Groq não devolveu texto” mesmo quando o provedor ativo era o OpenRouter.
- O GPT-OSS pode terminar uma resposta com `finish_reason=length` quando o orçamento de completion é consumido pelo raciocínio antes da resposta final. O motor agora faz **uma única recuperação automática**, reduzindo o esforço de raciocínio e aumentando o teto apenas para decisões/coordenação.
- Para OpenRouter, o request usa o parâmetro atual `reasoning: { effort, exclude }`; para Groq, mantém `reasoning_effort`. Isso evita depender de um campo de outro provedor.
- Funcionários usam raciocínio baixo para decisões rotineiras, priorizando custo e velocidade. O maestro continua podendo usar raciocínio alto.
- O contador local de uso foi versionado para evitar misturar métricas antigas de uma implementação diferente.
- Service worker atualizado para forçar a entrada da correção no cache do navegador.

# Estúdio — simulação de equipe com projetos persistentes

Um ambiente virtual em que agentes de IA trabalham autonomamente dentro de projetos contínuos. O usuário observa a equipe, os processos e os artefatos; não precisa aceitar contratos, encomendar entregas ou ficar jogando.

## Como rodar

Qualquer servidor estático serve. No GitHub Pages basta subir a pasta inteira e apontar para a raiz. Localmente:

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.

Para ativar a equipe, entre em **Motor** e configure uma chave do provedor escolhido. OpenRouter é o padrão recomendado. A chave fica apenas no `localStorage` do navegador.

### Sem teto diário

O Estúdio aceita dois provedores, um ativo por vez. Ambos falam o formato OpenAI, então trocar entre eles muda apenas endereço, chave e nomes de modelo.

- **Groq**: rápida, mas o plano gratuito tem teto diário de requisições. O upgrade para Developer, que removeria o teto, está **suspenso pela própria Groq** por alta demanda.
- **OpenRouter**: em modelos pagos não há limite de plataforma — sem teto diário e sem RPM imposto. Funciona com crédito pré-pago (mínimo US$ 5, não expira, não vira assinatura), então não fica cartão gerando cobrança recorrente. O `openai/gpt-oss-120b` sai a cerca de US$ 0,036 por 1M de entrada, contra US$ 0,15 na Groq.

Cada provedor guarda a própria chave: trocar de um para outro e voltar não exige recolar nada. Ao trocar, os modelos selecionados caem no padrão da nova lista, porque os identificadores diferem entre as plataformas.

O campo **Plano da sua conta Groq** aparece só quando a Groq está ativa, e serve apenas para ajustar a estimativa de custo.

## O que é persistente

- Projetos, objetivos e histórico de atividade.
- Tarefas e dependências entre etapas.
- Arquivos produzidos, versões, qualidade, autoria e projeto de origem.
- Handoffs entre agentes.
- A equipe consulta os artefatos anteriores antes de produzir a próxima etapa.
- Quando um novo produto é publicado, um projeto que já possui um site pode criar autonomamente uma tarefa para integrar o produto ao site.

## Trabalho em equipe

A gerente mantém o projeto e decide as próximas etapas. Agentes recebem tarefas conforme sua especialidade e podem trabalhar sobre entregas anteriores. Uma etapa pode depender de outra, e cada entrega deixa um handoff persistente para quem assumir a sequência.

## Produção

A IA delibera sobre cada etapa antes de produzir: considera o objetivo, memória e acervo persistente e escolhe uma abordagem. A montagem final ainda usa componentes determinísticos quando o formato exige validade estrutural, mas nenhum artefato é fabricado quando a IA está indisponível.

## XP

XP continua existindo apenas como uma medida de experiência acumulada do estúdio. Ele não é usado como moeda, contrato, missão ou obrigação de jogar.

## Simulação visual

O chão do estúdio é uma representação visual dos agentes: deslocamento, trabalho, pausas e conversas são simulados. A energia foi ajustada para acompanhar o tempo real, evitando exaustão instantânea.

## Arquivos

`index.html` é a versão modular recomendada. `estudio-arquivo-unico.html` é uma versão independente para uso simples.


## IA — autonomia contínua e arquitetura econômica

- **Pré-produção/coordenação:** GPT-OSS 20B por padrão.
- **Deliberação:** usa esforço de raciocínio alto antes de uma produção, preservando apenas a síntese operacional.
- **Produção:** GPT-OSS 120B por padrão, reservado para criar o produto final.
- **Revisão:** modelo econômico separado para validações curtas.
- O contexto enviado inclui projeto, tarefa, memória relevante do agente, equipe, artefatos anteriores, produtos publicados, etapas e eventos recentes.
- O contexto é limitado por caracteres para evitar crescimento infinito, mas é deliberadamente mais rico que versões anteriores.
- Movimentação, animações e interações sociais simples não usam IA.
- Não existe mais cronômetro, ritmo ou cota diária artificial no Estúdio: a IA pode ser chamada sempre que houver uma necessidade operacional real. Se o provedor ativo atingir 429 e houver outra chave configurada, o motor troca automaticamente uma vez para o outro provedor.
- O cliente não força `service_tier`: a requisição usa a capacidade padrão disponível no plano da conta, evitando falha em organizações que não têm tiers pagos habilitados.
- Os limites de requisições/tokens mostrados no Motor vêm dos headers reais devolvidos pelo provedor ativo; antes da primeira resposta, o Estúdio não inventa uma cota local.

Na Groq, atualmente o GPT-OSS 20B custa menos por token de entrada/saída do que os modelos Qwen disponíveis; o GPT-OSS 120B continua sendo a escolha forte para produção. Os modelos Qwen 3.6/3.8 ficam disponíveis como alternativas, mas são mais caros e por isso não são usados automaticamente.


## Sala de reuniões
A versão atual mantém uma sala persistente para conversa direta com a equipe. Mensagens, relatórios e ordens ficam registrados no estúdio. Ordens claras podem virar até duas tarefas no projeto ativo usando o modelo de decisão econômico. A sala envia contexto amplo do projeto e mantém a saída curta para reduzir custo.


## Governança da produção
- Artefatos em esboço, protótipo e candidato podem ser editados ou apagados dentro do estúdio.
- Produto final publicado é imutável no histórico do estúdio. Correções posteriores precisam gerar uma nova versão e passar novamente pela gerente.
- A gerente acompanha continuamente carga, dependências, energia, execução e cobertura de especialidades; quando identifica gargalo sustentado, registra recomendação de contratação.
- A aprovação de produto final exige produção com IA e qualidade aferida mínima de 82/100, além da decisão da gerente.


## Foco produtivo
- A equipe não inicia o ciclo automático com ideação ou conversa social.
- Quando a fila fica vazia, o sistema cria uma próxima entrega concreta baseada no que já existe no projeto.
- Conversas espontâneas não consomem mais chamadas automáticas; a sala de reuniões é usada para decisões reais.
- Reuniões automáticas não são usadas apenas para dependências normais; handoffs resolvem a sequência de trabalho.
- O XP é apenas experiência e não bloqueia kits de produção.
- O planejador é instruído e validado para não inventar clientes, pedidos, contratos, prazos, datas, preços, métricas ou acontecimentos.
- A aferição estrutural publica automaticamente uma entrega que já atingiu o nível de publicação, evitando uma chamada extra de revisão.
- A produção deve sempre transformar o contexto real do projeto em um artefato verificável; conversa, promessa ou cenário hipotético não conta como trabalho concluído.


## Espera e retomada

Quando a Groq devolve 429, o Estúdio lê o tempo de reabertura no cabeçalho da própria resposta e espera exatamente esse tempo, em vez de chutar um intervalo fixo. O ciclo retoma sozinho assim que a janela abre, sem nenhuma ação sua.

O painel Motor mostra o custo estimado do dia (calculado sobre os tokens que a Groq contabilizou) e, quando a cota gratuita barra a equipe, o aviso sobre o tier Developer.


## Correção de republicação (v30)

A identidade de um produto passou a ser **projeto + kit**, não o nome do arquivo. Antes, a `linhagem` era derivada do nome: bastava a IA batizar a entrega de outro jeito para o Estúdio achar que era um produto inédito e publicar como v1 de novo, indefinidamente.

Três barreiras agora, em ordem:

1. Conteúdo idêntico a qualquer produto já publicado no projeto é bloqueado, com qualquer nome ou kit.
2. Um kit que já tem versão publicada exige que o candidato aponte explicitamente para ela (`baseArquivoId`).
3. Uma nova versão precisa ter conteúdo diferente da anterior.

Acervos gravados antes desta versão continuam funcionando: como a linhagem antiga era pouco confiável, o kit passou a ser a chave usada também para os arquivos já existentes.

## Ajustes de layout no celular

- O painel de diagnóstico de erro deixou de cobrir a barra inferior: agora é um cartão flutuante acima da navegação, com botão de fechar e altura limitada.
- Campos de formulário usam 16px em telas pequenas, evitando o zoom automático do navegador ao focar.
- Rótulos longos em `select` ganharam reticência; estatísticas, chamadas e nomes de arquivo quebram linha em vez de estourar o painel.
- Botões de ação empilham em duas colunas quando não cabem lado a lado.


## Painel da gerência estava ausente (v31)

A função que desenha "Supervisão da gerente" (etapas abertas, concluídas, funcionários, foco da gerente, recomendações e alertas) procurava por um elemento `#gerenciaPanel` que **nunca existiu no HTML** — nem em `index.html`, nem em `estudio-arquivo-unico.html`. O painel silenciosamente não aparecia, em nenhum aparelho, desde a v21 original.

Corrigido nos dois arquivos: o container foi adicionado na view do Estúdio, entre a lista de equipe e o painel de XP. De quebra, o grid de 3 colunas do resumo (que nunca tinha sido testado numa tela realmente estreita) ganhou `min-width:0`, quebra de palavra e empilha em 1 coluna abaixo de 380px de largura.


## Gerente travada (v32)

Quatro defeitos no fluxo da gerente, do mais grave ao menor:

1. **`novaTarefa` descartava `baseArquivoId`.** Cinco chamadas diferentes passavam esse campo e ele nunca era gravado na tarefa. Como o portão de release exige que a tarefa aponte para o produto anterior, nenhuma entrega passava depois do primeiro produto de cada kit: a gerente segurava tudo com "já existe uma versão publicada de X". Era o motivo de a produção parecer parada.
2. **Planejamento descartado em silêncio.** Quando a IA não repetia exatamente o id da versão anterior no campo BASE, a etapa planejada era jogada fora e a gerente registrava "revisou o projeto e manteve o plano" sem produzir nada. Agora a etapa vira uma evolução explícita daquela versão.
3. **`ocupado` sem `finally`.** Uma exceção no meio de planejar ou avaliar deixava a gerente marcada como ocupada para o resto da sessão, e o ciclo nunca mais entrava no ramo de gerência.
4. **Candidato impossível de avaliar bloqueava tudo.** Enquanto existisse um artefato não avaliado, a gerente não planejava nem supervisionava. Após três tentativas sem resposta da IA, ele sai da frente com registro no log; e sem IA disponível ela passa a supervisionar em vez de não fazer nada.

As travas contra republicação da v30 continuam valendo, então liberar as evoluções não reabre aquele problema.


## Loop de correções e lixo de template (v33)

O log mostrava a mesma entrega girando: "Produzir Catálogo..." duplicado, "Corrigir catalogo-...csv" repetido cinco vezes e qualidade caindo a cada volta (63, 81, 62, 36). Quatro causas:

1. **Texto do modelo entrava cru.** Marcadores de template vazados pelos modelos pequenos (`|constrain|>`, `<|channel|>`, cercas de código, tags) viravam título de tarefa. Agora todo campo vindo da IA passa por `limpo()`, e só vira instrução se sobrar texto real depois da limpeza.
2. **Dedupe fraca.** Só comparava título exato entre tarefas **abertas**: assim que a primeira virava "feita", a idêntica nascia de novo. Agora um kit não tem duas etapas abertas no mesmo projeto, e uma etapa idêntica concluída nos últimos 20 minutos não volta.
3. **Correções sem teto.** Cada revisão da gerente gerava outra correção, indefinidamente. Agora são no máximo 2 rodadas por kit; depois disso ela encerra o ciclo, registra qual foi a melhor versão e a equipe segue para outra frente.
4. **Correção partia da versão errada.** A base era a última produzida, não a melhor — por isso a qualidade despencava a cada rodada. Agora parte da melhor versão do kit, e o briefing exige que a nova fique acima dela.

Também corrigido: a fila produtiva contava só produtos **publicados** para decidir o que falta. Enquanto o portão de release segurava tudo, ela recriava eternamente a mesma etapa. Agora candidatos e protótipos em andamento também contam.

Estas correções de fluxo estão apenas em `index.html` (versão modular). O `estudio-arquivo-unico.html` recebeu as correções estruturais até a v32, mas não este ajuste de fluxo.


## O produto que faltava (v34)

Diagnóstico: a fábrica tinha 8 kits e **todos eram material de marketing** — página de vendas, anúncios, artigo, e-mails, catálogo, marca, proposta, calendário. Nenhum produzia o produto em si. Para uma editora, isso significava que a equipe só conseguia fabricar divulgação de livros que nunca seriam escritos: daí o "catálogo de produtos" sem nenhum produto e o briefing citando um "portfólio existente" que nunca existiu.

**Novo kit `obra`** (nível 1, especialidade criação): produz a entrega central do negócio, seja ela qual for — capítulo ou conto para uma editora, aula para quem ensina, documentação para software, material entregue ao cliente para um serviço. Entre 700 e 1200 palavras, obra completa e acabada; a aferição penaliza texto curto, porque obra curta é esboço, não produto.

**Ordem corrigida em três lugares**, porque instrução no prompt não basta com modelos pequenos:

- Fila produtiva: a sequência passou a ser `obra → landing → catalogo → artigo → emails → anuncios`.
- Planejamento sem IA: obra primeiro; catálogo só entra quando existem obras publicadas, e cita nominalmente quais são.
- Planejamento com IA: o prompt declara a ordem obrigatória, e o código **recusa** qualquer kit de divulgação enquanto não houver obra no projeto, convertendo a etapa em produção da obra.

**Briefings honestos:** o texto "a partir do portfólio existente" aparecia mesmo com o projeto vazio, o que empurrava o modelo a inventar produtos para preencher. Agora o briefing só menciona acervo quando ele existe, e nesse caso lista os arquivos reais.


## v36 — agência organizacional

A simulação agora possui uma camada `agency.js` separada do corpo/runtime dos funcionários. Em vez de depender de uma sequência fixa de produção, agentes livres observam missão, projeto, acervo, tarefas, equipe, decisões e memória antes de escolher entre executar, criar trabalho, revisar, estudar, colaborar, planejar ou esperar.

A escolha é deliberativa e usa esforço de raciocínio alto quando a IA está disponível. O sistema persiste a conclusão operacional, não o raciocínio privado. Kits de produção continuam existindo como ferramentas técnicas, mas deixaram de ser o roteiro obrigatório do ciclo autônomo.

A equipe também respeita uma pausa operacional real: enquanto pausada, nenhum funcionário assume tarefa, produz ou publica. Quando a IA está indisponível, os funcionários podem estudar o acervo e preparar a retomada, sem criar artefatos fictícios.

A versão estática inclui `agency.js` no Service Worker e usa o cache `estudio-v36-organico`.


## v37 — empresa viva

- Modelo econômico produtivo: cada produto final publicado gera receita de conclusão; 25% da recompensa é distribuída como comissão entre os agentes que contribuíram de forma rastreável.
- Maestro estratégico: uma chamada robusta e de baixa frequência supervisiona a empresa; funcionários usam o modelo econômico para decisões individuais.
- Ambiente persistente em pixel art: agentes podem construir mesas, plantas, estantes, luminárias, sofás, quadros e bancadas quando houver valor real e orçamento.
- O ambiente, as construções, comissões e recompensas ficam persistidos junto da empresa.
- Prioridade de custo: decisões individuais são compactas e espaçadas; a produção continua usando o modelo configurado para qualidade, enquanto o maestro usa o modelo robusto.


## v38 — Mundo vivo

- Escritório pixel-art com zonas funcionais, mobiliário persistente e pequenas interações físicas.
- Funcionários podem construir e reorganizar o espaço como consequência de decisões próprias.
- Objetos guardam uso, autor e histórico básico; o ambiente também tem versão/planta persistente.
- A construção inclui deslocamento do agente até a área de trabalho e retorno à mesa.
- Cliques no cenário identificam pessoas e objetos.
- Modelo econômico: agentes usam o modelo de decisão econômico; o maestro estratégico usa o modelo robusto configurado.
- A prioridade continua sendo baixo custo, baixa frequência de chamadas e nenhum trabalho fictício quando a IA está indisponível.

## v41 — sem qualidade artificial
A nota numérica de qualidade foi removida do fluxo de produção, publicação e mercado. O sistema agora usa validação objetiva de entrega (completude estrutural, campos essenciais e ausência de placeholders). Receita entra somente por vendas no mercado simulado; publicar um arquivo não gera prêmio automático. O produto principal da editora é uma obra vendável completa, enquanto site, catálogo e anúncios são derivados dela.


## v43 — princípio operacional

A unidade de autonomia é o funcionário. Cada funcionário possui sua própria lane de IA e recebe duas funções: pensamento e produção. O pensamento decide; a produção executa a decisão em arquivos reais.

Não existe catálogo obrigatório de produtos, roteiro de marketing, mercado simulado ou maestro. A gerente é a autoridade final e lê o conteúdo produzido antes de decidir seu destino. Funcionários podem iniciar conversas, colaborar e convocar reuniões quando uma decisão conjunta for necessária.

Ao fundar uma empresa, a equipe realiza uma primeira reunião de planejamento assim que a IA estiver disponível. O resultado da reunião é convertido em trabalho persistente.


## v44 — orçamento de IA e site central

- Orçamento local fixado em **US$ 3,00 por 30 dias**, com margem de segurança de US$ 0,10. O orçamento é calculado pelo uso real de entrada e saída registrado nas respostas do provedor.
- O limite diário de tokens continua apenas como segundo freio de segurança; ele não é o orçamento principal. O Estúdio calcula também o ritmo médio disponível para o restante do período.
- Quando o orçamento não comporta uma nova chamada, os agentes não simulam trabalho intelectual: entram em rotina física de refeição/descanso/dormitório e aguardam a renovação do período.
- O custo é reduzido evitando chamadas redundantes: decisão autônoma espaçada, uma deliberação operacional por tarefa, produção somente quando existe uma consequência concreta e inspeção gerencial concentrada nas entregas.
- **Não existe mercado, venda, cliente, receita ou comissão simulados.** O mundo externo fica com o dono.
- Cada funcionário continua com sua própria lane de IA, usando separadamente o modelo de pensamento e o modelo de produção definidos na configuração. A gerente é a autoridade executiva; não existe maestro.
- Toda entrega cliente-visível é armazenada no **site central da empresa**. A equipe decide a arquitetura, navegação, identidade e organização do site a partir do contexto real; não há template visual ou estrutura de site pré-fabricada.
- O produto final passa por inspeção da gerente com conteúdo real, evidências, pendências e declaração explícita de prontidão. Não existe nota artificial de qualidade.

## v45 — orçamento diário em dólar
O orçamento da IA pode ser definido em dólar por ciclo de 30 dias. O limite diário pode ser automático: o sistema divide o saldo restante pelos dias restantes do ciclo e recalcula o valor no começo de cada novo dia. Também é possível desligar o automático e definir um teto diário fixo. Quando o teto diário acaba, a equipe não faz novas chamadas e continua a rotina física do ambiente; quando o ciclo inteiro acaba, aguarda a renovação.

## v45.1 — Trabalho intensivo

O modo **Trabalho intensivo** permite que a equipe ignore o teto diário em dólar e use o saldo disponível do ciclo de 30 dias. O limite mensal/ciclo continua sendo absoluto; chamadas que não couberem no saldo restante não são enviadas. O limite diário permanece como referência quando o modo normal está ativo.


## v46.1
Correção do sincronismo de limite da chave OpenRouter: `limit_remaining=null` agora é tratado como ausência de limite, não como US$ 0. HTTP 402 é tratado como falta real de créditos.

## v51: rotina sem trabalho e produção visual
Funcionários sem tarefa ficam em rotina Sims-like sem chamar IA. A fila de trabalho é verificada localmente; quando aparece uma tarefa, o agente volta ao trabalho. Conversas ociosas são raras, curtas e usam uma única chamada compartilhada.

A organização usa quatro setores (Produto & Criação, Tecnologia & Produção, Operações & Dados, Crescimento & Comercial) e a gerente só consegue contratar automaticamente quando existe sobrecarga real. A memória individual agora é estruturada e selecionada por relevância.

Tarefas visuais podem chamar um modelo dedicado do OpenRouter pela Images API. O modelo é configurável no painel do Motor. Projetos multi-arquivo podem ser produzidos em uma única entrega e cada projeto pode ser exportado como ZIP.

### v51 — vida sem custo e produção multimodal
Funcionários sem tarefa usam rotinas locais de convivência e lazer, sem chamada de IA. Conversas ociosas são raras e curtas. A equipe foi reorganizada em quatro setores, com contratação condicionada a backlog real. A memória combina histórico individual relevante e marcos organizacionais persistentes. Tarefas de arte podem usar o modelo de imagem configurado no OpenRouter. Projetos multi-arquivo são persistidos como arquivos reais e podem ser exportados em ZIP.
