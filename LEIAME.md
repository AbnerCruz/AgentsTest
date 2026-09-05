# Estúdio — simulação autônoma de equipe com memória e projetos persistentes

Um ambiente virtual em que agentes trabalham autonomamente dentro de projetos contínuos. O usuário observa a equipe, os processos e os produtos; não precisa aceitar contratos, encomendar entregas ou ficar clicando para jogar.

## Memória dos funcionários

Cada funcionário mantém uma memória local em camadas:
- **memória episódica**: acontecimentos e handoffs relevantes;
- **memória por projeto**: experiências ligadas ao projeto em que trabalhou;
- **foco atual**: resumo operacional do que está tentando realizar;
- **importância**: lembranças mais úteis recebem prioridade.

A memória é limitada e compacta. Em vez de enviar todo o histórico para a IA, o simulador seleciona poucos registros relevantes, mantendo custo e latência baixos.

A interface do funcionário mostra o **foco operacional atual** e sua memória. Ela não expõe raciocínio interno privado; mostra apenas o estado mental operacional que é seguro e útil para observação.

## Princípios de trabalho

Os agentes são orientados a verificar continuamente duas coisas:
1. esta etapa contribui para o produto final?
2. esta etapa deixa algo útil para a equipe continuar?

O sistema evita começar do zero quando já existe um artefato utilizável.

## Produtos

Uma produção aprovada pela validação estrutural vira **produto final utilizável**, e não um rascunho público. O arquivo deve ser completo, sem placeholders e pronto para consumo/publicação.

Quando um produto novo entra em um projeto que já possui site, o site recebe automaticamente uma etapa de atualização para incorporar o novo produto.

## Trabalho em equipe

As tarefas possuem projeto, dependências e handoffs persistentes. Os agentes:
- reutilizam arquivos e versões anteriores;
- recebem contexto das etapas anteriores;
- registram handoffs;
- podem conversar sobre a continuidade do trabalho;
- não duplicam deliberadamente trabalho já feito.

As conversas sociais são locais e determinísticas, sem chamadas de IA, para evitar gasto desnecessário.

## Economia

Há no máximo uma chamada autônoma de IA por ciclo. A memória enviada à IA é compacta, a decisão usa modelo barato e a produção usa o modelo configurado para conteúdo.

O simulador não usa IA para cada movimento, conversa visual ou animação. Isso mantém a experiência fluida e barata.

## Persistência

Projetos, tarefas, dependências, arquivos, versões, handoffs, memória dos funcionários, foco atual, XP e histórico ficam no `localStorage` do navegador.

## XP

XP continua existindo como experiência acumulada do estúdio. Não é moeda, missão, contrato ou obrigação de jogar.

## Execução

Qualquer servidor estático serve. No GitHub Pages basta subir a pasta inteira e apontar para a raiz. Localmente:

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.

Para ativar a equipe, entre em **Motor** e configure uma chave da Groq. A chave fica apenas no `localStorage` do navegador.

## Arquivos

- `index.html` — versão modular recomendada.
- `estudio-arquivo-unico.html` — versão independente, com CSS e JavaScript embutidos.
