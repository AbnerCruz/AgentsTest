# v43 — agentes realmente autônomos

- Removida a fábrica baseada em templates/gabaritos de conteúdo. A produção agora recebe a decisão do agente e cria/atualiza/exclui um arquivo real.
- A gerente inspeciona o conteúdo do artefato antes de decidir: publicar, corrigir, continuar ou descartar.
- Decisão de funcionário vira tarefa persistente e execução; pensamento não conta como produção.
- Funcionários podem escolher colaborar ou convocar reunião; conversas são registradas e aparecem em balões no escritório.
- Nova empresa inicia uma reunião de planejamento do primeiro produto quando a IA está configurada.
- Reuniões internas terminam com decisão da gerente e, quando aplicável, tarefa executável.
- Sala de reuniões interpreta ordens pelo conteúdo, não por uma lista de palavras-chave, e a gerente transforma a orientação em trabalho.
- Cada funcionário continua usando sua própria lane de IA; não existe maestro.
- Removidos geradores locais de sequência de produtos e heurísticas que escolhiam landing/obra/catalogo.
- Removida dependência operacional do mercado simulado. O Estúdio produz arquivos; comercialização externa fica fora da simulação.
- XP permanece apenas como histórico de experiência, sem desbloquear templates.
