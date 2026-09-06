# v51 — vida ociosa, memória ampliada, equipe enxuta e produção multimodal

## Vida Sims-like sem queimar tokens
- Funcionários sem tarefa executável não chamam mais a Agency para inventar trabalho.
- A busca por tarefas abertas/sem responsável acontece localmente, sem IA.
- Sem trabalho, o agente entra em tempo livre: celular, leitura, caminhada, TV ou café.
- Quando surge uma tarefa compatível, ele abandona a rotina ociosa e volta ao posto.
- Conversas espontâneas entre dois ociosos usam no máximo uma chamada curta compartilhada e têm cooldown de 6 minutos.
- Não há diálogo fictício quando a IA está indisponível.

## Memória
- Memória individual passou de 24 eventos simples para até 80 memórias estruturadas.
- Memórias carregam tipo, importância, referências e timestamp.
- Entregas e decisões relevantes ganham peso maior.
- A Agency seleciona memórias por relevância ao projeto/tarefa atual em vez de simplesmente mandar as últimas mensagens.
- Marcos importantes são condensados localmente, sem uma chamada extra de IA.
- Corrigido bug em que decisões autônomas eram gravadas apenas no objeto runtime e não na ficha persistente do funcionário.

## Estrutura organizacional
A empresa agora opera com somente quatro setores:
1. Produto & Criação (`criacao`)
2. Tecnologia & Produção (`producao`)
3. Operações & Dados (`operacoes`)
4. Crescimento & Comercial (`comercial`)

- Empresas antigas migram `dados -> operacoes` e `geral -> producao`.
- Fundação cria apenas 1–3 funcionários além da gerente e não exige uma pessoa por setor.
- Recuperação de fundação usa apenas dois funcionários quando necessário.
- Contratação autônoma exige backlog real: pelo menos uma sobrecarga mensurável no setor.
- Há cooldown de 30 minutos entre contratações e teto enxuto de cinco funcionários além da gerente.
- A gerente é instruída e também bloqueada localmente de contratar só para preencher organograma.

## Imagens
- Novo modelo configurável de imagem no OpenRouter.
- Padrão econômico: `google/gemini-2.5-flash-image`.
- Alternativa de alta fidelidade: `openai/gpt-image-2`.
- Tarefas que realmente pedem capa, ilustração, logo, banner, sprite, mockup etc. são roteadas diretamente para `/api/v1/images`.
- O resultado base64 vira um artefato real PNG/JPG/WebP, com prévia e download.
- Imagens grandes são compactadas localmente para WebP quando necessário para reduzir pressão no armazenamento do navegador.
- O custo informado pelo OpenRouter entra no orçamento mensal/diário e no histórico de chamadas.
- A gerente não manda base64 para um modelo de texto: ativos visuais válidos são validados estruturalmente e liberados sem uma segunda chamada inútil.

## Mais formatos e projetos completos
- Texto/código: md, markdown, html, htm, txt, csv, tsv, json, jsonl, js, mjs, cjs, ts, tsx, jsx, css, scss, xml, yaml, yml, svg, py, sql, sh e webmanifest.
- Imagens: png, jpg/jpeg e webp.
- A Factory entende tarefas de “projeto completo/site completo/pacote zipado” e pode retornar até 10 arquivos integrados em uma única chamada usando blocos multi-arquivo.
- Cada projeto agora pode ser baixado como ZIP próprio.
- O escritor ZIP interno passou a aceitar data URLs base64, portanto imagens entram como binário real no pacote em vez de texto base64.

## Correções adicionais
- O contexto de artefatos não injeta bytes base64 de imagens nos prompts.
- Corrigida a amostragem de artefato-base longo na Factory: a variável resumida existia na v50, mas o prompt ainda usava o conteúdo integral.
- Service Worker usa nova chave de cache para evitar JS antigo após deploy.

## Ajustes finais de robustez da v51
- Tarefas visuais recebem o kit `visual` automaticamente e são priorizadas por Produto & Criação; isso permite que ilustradores/designers assumam geração visual sem criar um quinto setor.
- A gerente não consulta IA a cada minuto quando não há entrega para revisar: a varredura estratégica cai para 3–4 minutos, reduzindo custo de ociosidade sem impedir criação/delegação de nova demanda.
- Memória organizacional compartilhada: decisões/entregas de alta importância entram em um índice persistente de até 120 marcos; cada agente recebe somente os marcos relevantes ao trabalho atual.
- Corrigido o protocolo de `bundle`: projetos multi-arquivo agora são de fato separados em arquivos persistentes (em vez de poderem cair em um `.md` com nome de ZIP) e são exportados como ZIP real pela interface.
