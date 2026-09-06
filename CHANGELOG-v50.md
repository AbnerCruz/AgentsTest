# v50 — revisão por linhagem, capacidades reais e acervo consolidado

- Correções herdam nome e tipo do artefato base; o modelo só nomeia arquivos realmente novos.
- `validar()` agora detecta placeholders como `[Nome do Diretor]`, valida JSON/CSV/HTML e sua saída é persistida no candidato e enviada à gerente.
- A trava anti-loop passou de `id` para `linhagem`, com limite de correções persistente.
- A antiga “revisão manual” automática foi removida: ao atingir o limite, o protótipo sai de verdade da fila automática sem criar outra tarefa circular.
- A fila consolida versões anteriores da mesma linhagem e quase-duplicados (>97% de sobreposição lexical) antes de gastar IA.
- Tarefas de revisão com o mesmo nome podem existir em rodadas sucessivas quando a base mudou; duplicatas da mesma base continuam bloqueadas.
- A publicação aceita uma cadeia de correções descendente da última versão publicada, não apenas um `baseArquivoId` direto.
- Prompts de produção, agência e auditoria receberam um contrato explícito de capacidades: agentes não fingem e-mail, Asana, assinatura, upload ou outras ações externas.
- Pendências puramente externas deixam de ser gate de release quando a validação local do arquivo está limpa.
- Cache do service worker atualizado para `estudio-v50-revisao-linhagem`.
