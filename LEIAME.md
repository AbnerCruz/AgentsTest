# Estúdio — simulação de equipe com projetos persistentes

Um ambiente virtual em que agentes de IA trabalham autonomamente dentro de projetos contínuos. O usuário observa a equipe, os processos e os artefatos; não precisa aceitar contratos, encomendar entregas ou ficar jogando.

## Como rodar

Qualquer servidor estático serve. No GitHub Pages basta subir a pasta inteira e apontar para a raiz. Localmente:

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.

O Estúdio nasce funcionando **sem internet, sem chave e sem cota**. A nuvem é um acelerador opcional.

Em **Motor** existem duas escolhas independentes:

**1. Motor principal — sempre disponível**
- **Neste aparelho · WebLLM** (padrão): o modelo roda na GPU do navegador via WebGPU. Baixe uma vez (0,9 a 2,4 GB conforme o modelo), no Wi-Fi e com a tela aberta; depois disso trabalha offline.
- **Servidor da rede · Ollama**: um PC responde pelo Estúdio, bem mais forte. Suba com `OLLAMA_ORIGINS=* ollama serve`. Se o Estúdio estiver em HTTPS e o servidor em outro aparelho por HTTP, o navegador bloqueia — abra o Estúdio pelo endereço local do próprio PC.

**2. Acelerador na nuvem — opcional**
- **Não usar**: 100% no aparelho.
- **Só no produto final** (padrão): o aparelho coordena, decide e revisa; a cota da Groq é gasta apenas na entrega final. Rende muito mais que gastar a cota em coordenação.
- **Sempre que houver cota**: a nuvem assume enquanto houver rede e cota.

Quando a nuvem falha — cota estourada, chave recusada, servidor fora ou internet caída — o **mesmo pedido é refeito no motor local na hora**. Nenhuma tarefa se perde. O Estúdio anota quando a janela reabre e volta a usar a nuvem sozinho.

A chave da Groq fica apenas no `localStorage` deste aparelho.

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

A IA escreve o conteúdo estruturado; o navegador monta os arquivos finais com gabaritos determinísticos. Isso mantém HTML, CSV, SVG e Markdown válidos e reduz o consumo de tokens.

## XP

XP continua existindo apenas como uma medida de experiência acumulada do estúdio. Ele não é usado como moeda, contrato, missão ou obrigação de jogar.

## Simulação visual

O chão do estúdio é uma representação visual dos agentes: deslocamento, trabalho, pausas e conversas são simulados. A energia foi ajustada para acompanhar o tempo real, evitando exaustão instantânea.

## Arquivos

`index.html` é a versão modular recomendada. `estudio-arquivo-unico.html` é uma versão independente para uso simples.


## IA — autonomia contínua e arquitetura econômica

- **Pré-produção/coordenação:** GPT-OSS 20B por padrão, com contexto detalhado e saída curta.
- **Produção:** GPT-OSS 120B por padrão, reservado para criar o produto final.
- **Revisão:** modelo econômico separado para validações curtas.
- O contexto enviado inclui projeto, tarefa, memória relevante do agente, equipe, artefatos anteriores, produtos publicados, etapas e eventos recentes.
- O contexto é limitado por caracteres para evitar crescimento infinito, mas é deliberadamente mais rico que versões anteriores.
- Movimentação, animações e interações sociais simples não usam IA.
- Não existe mais cronômetro, ritmo ou cota diária artificial no Estúdio: a IA pode ser chamada sempre que houver uma necessidade operacional real.
- O cliente não força `service_tier`: a requisição usa a capacidade padrão disponível no plano da conta, evitando falha em organizações que não têm tiers pagos habilitados.
- Os limites de requisições/tokens mostrados no Motor vêm dos headers reais devolvidos pela Groq; antes da primeira resposta, o Estúdio não inventa uma cota local.

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


## Motor local (v22)

Quando o provedor não é a Groq, o Estúdio ignora chave, cabeçalhos de cota e bloqueio por 429. Uma falha local gera espera curta, não castigo de minutos.

Modelos pequenos não aguentam o mesmo contexto da nuvem, então no motor local o Estúdio aperta o contexto (2200 caracteres por bloco) e baixa o teto de saída (900 tokens na produção, 260 na decisão). Isso mantém o formato `CHAVE: valor` funcionando e evita respostas de vários minutos no celular.

Recomendação prática: Qwen 2.5 1.5B em celular; Qwen 2.5 3B ou Ollama no PC quando o objetivo for produto final.

`estudio-arquivo-unico.html` continua sendo a versão antiga, só com Groq.


## Reserva local (queda automática)

O padrão continua sendo a Groq. No painel **Motor → Reserva local**:

1. Escolha o modelo da reserva (Qwen 2.5 1.5B para celular).
2. Toque em **Preparar reserva** no Wi-Fi, com a tela aberta. Baixa uma vez e fica guardado no navegador.
3. Deixe a caixa de queda automática marcada.

A partir daí, quando a Groq devolve 429 ou 503, o Estúdio lê o tempo de espera na própria resposta, refaz o mesmo pedido no modelo do aparelho e segue trabalhando. Passada a janela, ele volta para a nuvem e descarrega o modelo da memória.

A queda **só acontece se o modelo já estiver baixado**. Sem isso o Estúdio prefere esperar a cota voltar a disparar mais de 1 GB de download em rede móvel.


## Offline de verdade

A biblioteca do WebLLM é buscada em `./vendor/web-llm.js` (se você colocar o arquivo lá) e, na falta dele, em esm.run/esm.sh. O service worker guarda esses arquivos no primeiro carregamento, então depois disso o Estúdio abre e produz sem rede nenhuma. Os pesos do modelo já ficam guardados pelo próprio WebLLM.
