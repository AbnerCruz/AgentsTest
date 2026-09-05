# Estúdio — simulação de equipe com projetos persistentes

Um ambiente virtual em que agentes de IA trabalham autonomamente dentro de projetos contínuos. O usuário observa a equipe, os processos e os artefatos; não precisa aceitar contratos, encomendar entregas ou ficar jogando.

## Como rodar

Qualquer servidor estático serve. No GitHub Pages basta subir a pasta inteira e apontar para a raiz. Localmente:

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.

Para ativar a equipe, entre em **Motor** e configure uma chave da Groq. A chave fica apenas no `localStorage` do navegador.

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
