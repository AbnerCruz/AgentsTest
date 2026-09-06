# Estúdio — simulação de equipe com projetos persistentes

Um ambiente virtual em que agentes de IA trabalham autonomamente dentro de projetos contínuos. O usuário observa a equipe, os processos e os artefatos; não precisa aceitar contratos, encomendar entregas ou ficar jogando.

## Como rodar

Qualquer servidor estático serve. No GitHub Pages basta subir a pasta inteira e apontar para a raiz. Localmente:

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.

Para ativar a equipe, entre em **Motor** e configure uma chave da Groq. A chave fica apenas no `localStorage` do navegador.

### Sem teto diário

O tier gratuito da Groq tem limite de requisições por dia; quando ele estoura, a equipe para até a janela reabrir. O tier **Developer** remove esse teto diário e aplica 25% de desconto por token. É liberado apenas cadastrando um cartão em console.groq.com, sem mínimo de gasto e sem mensalidade: você paga só os tokens consumidos. Nos modelos GPT-OSS, o consumo típico do Estúdio fica na casa de centavos por dia.

Marque o plano no campo **Plano da sua conta Groq**. Isso não muda o comportamento do motor — só ajusta a estimativa de custo mostrada no painel.

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


## Espera e retomada

Quando a Groq devolve 429, o Estúdio lê o tempo de reabertura no cabeçalho da própria resposta e espera exatamente esse tempo, em vez de chutar um intervalo fixo. O ciclo retoma sozinho assim que a janela abre, sem nenhuma ação sua.

O painel Motor mostra o custo estimado do dia (calculado sobre os tokens que a Groq contabilizou) e, quando a cota gratuita barra a equipe, o aviso sobre o tier Developer.
