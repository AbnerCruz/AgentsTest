# Estúdio v41 — sem qualidade artificial

- Removida a nota numérica de qualidade como gate de publicação e motor de mercado.
- Produção agora retorna validação objetiva: campos essenciais, placeholders, conteúdo e prontidão estrutural.
- Receita de produto não depende de uma nota inventada.
- Mercado não multiplica alcance/conversão por uma nota artificial.
- Sem IA não há produção genérica/fictícia.
- O produto principal continua sendo a obra; site, catálogo e anúncios são derivados dela.


## v41.1 — correção de inicialização
- Restaurado o contrato interno `S.factory.aferir` como alias da validação objetiva, sem nota artificial.
- Corrigido o `S.factory` não inicializar, que causava `S.factory.KITS` indefinido no `ui.js`.
- HTML de arquivo único regenerado a partir dos módulos atuais.
- Cache do Service Worker incrementado.
