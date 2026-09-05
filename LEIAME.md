# Estúdio — simulador de empresa com entregas reais

Jogo de gerenciamento em que a equipe é de IA e o que ela produz **não é cenário**:
são arquivos de verdade (HTML, CSV, SVG, Markdown) que você baixa, usa e vende.

---

## Como rodar

Qualquer servidor estático serve. No GitHub Pages basta subir a pasta inteira e
apontar para a raiz. Localmente:

```
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`. Abrir o `index.html` direto pelo `file://`
também funciona, mas o service worker e a instalação como app ficam desativados.

Para ativar a equipe, entre em **Motor** e cole uma chave gratuita da Groq
(`console.groq.com`). A chave fica só no `localStorage` do aparelho — nunca
coloque uma chave dentro do repositório.

---

## O que é real e o que é simulado

Essa fronteira é explícita na interface, com etiquetas `REAL` e `SIMULADO`.

**Real:** os arquivos produzidos, a qualidade aferida por checagem estrutural,
o consumo de tokens, os limites devolvidos pelos cabeçalhos da Groq, o tempo de
cada chamada.

**Simulado:** caixa, receita, clientes, visitas, reputação, contratos e nível.
É o placar do jogo — nenhum desses números vem de venda de verdade.

Nada disso é sorteado. O funil só gira porque existe material publicado, e cada
tipo de material mexe num fator diferente: anúncio traz gente, catálogo e e-mail
convertem, marca sustenta reputação. Sem nada publicado, não há visita nem venda.

---

## Estrutura

```
index.html                  estrutura das telas
manifest.webmanifest        instalação como app
sw.js                       cache do shell (rede primeiro)
app.css                     sistema visual inteiro
core.js                     utilidades, estado, persistência, escritor de ZIP
ai.js                       única porta de saída para a Groq + cota real
market.js                   economia causal: funil, caixa, folha, indicadores
factory.js                  catálogo de entregas e montagem dos arquivos
studio.js                   equipe, canvas, autonomia, contratos
ui.js                       renderização e eventos
```

Os scripts são clássicos e carregados em ordem, pendurados em `window.S`. Não são
módulos ES de propósito: assim o app também funciona aberto por `file://`.

---

## Decisões que mudaram o comportamento

**O modelo não escreve o arquivo inteiro.** Ele escreve só o miolo — títulos,
benefícios, textos curtos — em linhas `CHAVE: valor`, e o navegador monta o
arquivo final com um gabarito. Isso corta o consumo de tokens em cerca de cinco
vezes, elimina resposta truncada no meio do HTML e garante que todo CSV tenha
colunas consistentes e todo HTML feche as tags.

**Qualidade é aferida, não opinada.** A nota de 0 a 100 sai de checagem
estrutural: campos obrigatórios presentes, tamanho do conteúdo, ausência de
texto de preenchimento, número de linhas/seções do formato, mais um ajuste por
especialidade e humor de quem produziu. A IA nunca dá nota para si mesma.

**Sem IA o app continua produzindo.** O gabarito local gera um arquivo real, só
que genérico. Ele nasce como esboço e com teto de qualidade 36, para não pagar
contrato cheio por material vazio.

**Uma chamada de IA por ciclo.** Um único motor decide quem age, e a autonomia é
limitada pelo ritmo escolhido (10, 5 ou 2 minutos). Pedidos feitos por você furam
a fila e acontecem na hora.

**Produto final é imutável.** Publicar congela uma versão. Correção não reescreve:
gera a versão seguinte, e o histórico fica.

**A base antiga é importada.** Estúdios da versão anterior (`empresas-all`) são
migrados na primeira abertura, junto com arquivos, equipe e caixa.

---

## Tipos de entrega

Nível 1:

- Página de vendas — `.html`
- Pacote de anúncios — `.csv`
- Artigo otimizado — `.md`

Nível 2:

- Sequência de e-mails — `.md`
- Catálogo de produtos — `.csv`
- Kit de marca — `.svg` + `.css` + `.md`
- Proposta comercial — `.html`

Nível 3:

- Calendário de conteúdo — `.csv`

O botão **Exportar .zip** na aba Entregas monta o pacote inteiro, organizado por
estágio, com um `LEIA-ME.md` listando cada arquivo e a qualidade aferida.
