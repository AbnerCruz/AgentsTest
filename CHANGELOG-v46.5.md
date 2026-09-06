# v46.5

- Corrigida a fundação para contratar automaticamente 2–3 funcionários além da gerente, usando a equipe escolhida pela IA e uma composição mínima coerente como fallback.
- Empresas já existentes que ficaram somente com a gerente são recuperadas automaticamente no próximo ciclo, sem apagar projetos, plano ou artefatos.
- Corrigido um bloco de configuração que havia sido inserido acidentalmente dentro da rotina de fundação.
- Tarefas de coordenação (designar/atribuir/delegar responsável) não são mais executadas por funcionários como se fossem tarefas de produção; a gerente recupera a coordenação.
- Produção ganhou uma segunda tentativa somente para respostas em formato inválido e recuperação conservadora quando o modelo omite o separador `---`.
