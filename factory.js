/* ============================================================
   FÁBRICA — onde nasce o produto de verdade.

   Decisão central do projeto: o modelo NÃO escreve o arquivo inteiro.
   Ele escreve só o miolo (títulos, benefícios, textos curtos) em linhas
   CHAVE: valor, e o navegador monta o arquivo final com um gabarito
   determinístico. Ganhos: 5x menos tokens, nada de resposta truncada,
   HTML/CSV sempre válidos e um padrão visual estável entre entregas.
   ============================================================ */
(function (S) {
  'use strict';
  const { esc, slug, clamp, pick } = S.util;

  /* ---------- cor: utilidades para o kit de marca ---------- */
  const CORES_NOMEADAS = {
    vermelho: '#C9412F', laranja: '#E4703E', amarelo: '#D9A441', dourado: '#C9A227',
    verde: '#5C9C74', esmeralda: '#3F8F6E', azul: '#3A6EA5', 'azul-marinho': '#25405E',
    roxo: '#7A5AA8', violeta: '#8A63B5', rosa: '#C4667F', vinho: '#7E2B3A',
    preto: '#1A1D1F', cinza: '#5C6467', bege: '#C7B299', marrom: '#7A5B44', terracota: '#B45B3E'
  };
  function corDeTexto(txt, alternativa) {
    const t = String(txt || '').toLowerCase().trim();
    const hex = t.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
    if (hex) return normalizarHex(hex[0]);
    for (const nome in CORES_NOMEADAS) if (t.indexOf(nome) >= 0) return CORES_NOMEADAS[nome];
    return alternativa || '#3A6EA5';
  }
  function normalizarHex(h) {
    let s = String(h).replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    return '#' + s.slice(0, 6).toUpperCase();
  }
  function paraHSL(hex) {
    const n = parseInt(normalizarHex(hex).slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0; const l = (max + min) / 2, d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h, s, l };
  }
  function deHSL(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    const hx = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return ('#' + hx(r) + hx(g) + hx(b)).toUpperCase();
  }
  function paleta(base) {
    const { h, s, l } = paraHSL(base);
    return {
      primaria: normalizarHex(base),
      escura: deHSL(h, Math.min(1, s * 1.05), Math.max(0.14, l - 0.24)),
      clara: deHSL(h, Math.max(0.12, s * 0.5), Math.min(0.95, l + 0.34)),
      acento: deHSL(h + 152, Math.min(1, s * 0.92), clamp(l + 0.04, 0.32, 0.62)),
      tinta: '#16191B',
      papel: deHSL(h, 0.16, 0.975)
    };
  }

  /* ---------- helpers de texto ---------- */
  const limpa = v => String(v == null ? '' : v).replace(/\s+/g, ' ').replace(/^["'\s]+|["'\s]+$/g, '').trim();
  const temPlaceholder = v => /<[^>]{2,}>|lorem ipsum|xxx+|\[.*?\]|preencher|exemplo de texto/i.test(String(v || ''));
  const linhasDe = txt => String(txt || '').split(/\n/).map(l => l.trim()).filter(l => l && !/^-{3,}$/.test(l));
  const csvCampo = v => {
    const s = String(v == null ? '' : v).replace(/"/g, '""');
    return /[",;\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = linhas => linhas.map(l => l.map(csvCampo).join(',')).join('\r\n') + '\r\n';
  const iniciais = nome => String(nome || 'E').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/)
    .filter(p => p.length > 2 || /^[A-ZÀ-Ú]/.test(p)).slice(0, 2).map(p => p[0].toUpperCase()).join('') || 'E';

  /* ============================================================
     Gabarito da página HTML — usado por landing e proposta.
     Um só lugar cuida do CSS, então toda página sai com o mesmo padrão.
     ============================================================ */
  function portfolioHTML(ctx) {
    const arquivos = ctx.projeto && Array.isArray(ctx.projeto.arquivos) ? ctx.projeto.arquivos : [];
    const produtos = arquivos.filter(a => a.classe === 'produto' || /catalogo|produto/i.test(a.nome)).slice(0, 8);
    if (!produtos.length) return '';
    return `<section class="portfolio"><h2>O que já produzimos</h2><div class="cards">
      ${produtos.map((a, i) => {
        const nome = a.nome.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        const detalhe = String(a.conteudo || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
        return `<div class="card"><span class="num">${i + 1}</span><h3>${esc(nome)}</h3><p>${esc(detalhe || 'Material desenvolvido pela equipe e mantido no projeto.')}</p></div>`;
      }).join('')}
    </div></section>`;
  }

  function paginaHTML(o) {
    const p = o.paleta;
    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.tituloAba)}</title>
<meta name="description" content="${esc(o.descricao)}">
<style>
*{box-sizing:border-box}
:root{--p:${p.primaria};--pd:${p.escura};--pl:${p.clara};--ac:${p.acento};--ink:${p.tinta};--paper:${p.papel}}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--ink);background:var(--paper);line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:940px;margin:0 auto;padding:0 22px}
header.top{padding:22px 0;display:flex;align-items:center;gap:12px}
.logo{width:38px;height:38px;border-radius:11px;background:var(--p);color:#fff;display:grid;place-items:center;
  font-weight:800;letter-spacing:-.02em;font-size:15px}
.marca{font-weight:700;letter-spacing:-.01em}
.hero{padding:56px 0 60px;border-bottom:1px solid rgba(0,0,0,.07)}
.eyebrow{display:inline-block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--pd);background:var(--pl);padding:6px 12px;border-radius:99px;font-weight:700}
h1{font-size:clamp(30px,6vw,50px);line-height:1.08;letter-spacing:-.03em;margin:20px 0 14px;max-width:16ch}
.lead{font-size:clamp(17px,2.4vw,21px);color:#4a5257;max-width:56ch;margin:0}
.cta{display:inline-block;margin-top:28px;background:var(--p);color:#fff;text-decoration:none;
  padding:15px 28px;border-radius:12px;font-weight:700;font-size:16px}
.cta:hover{background:var(--pd)}
.cta-nota{font-size:13px;color:#6b7378;margin-top:10px}
section{padding:52px 0;border-bottom:1px solid rgba(0,0,0,.07)}
h2{font-size:clamp(21px,3.4vw,29px);letter-spacing:-.02em;margin:0 0 26px}
.cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:16px;padding:22px}
.card h3{margin:0 0 8px;font-size:17px;letter-spacing:-.01em}
.card p{margin:0;color:#4a5257;font-size:15px}
.num{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;
  background:var(--pl);color:var(--pd);font-weight:800;font-size:13px;margin-bottom:12px}
.oferta{background:var(--ink);color:#fff;border-radius:20px;padding:38px 30px;text-align:center}
.oferta h2{color:#fff;margin-bottom:12px}
.oferta p{color:#c9cfd2;max-width:52ch;margin:0 auto}
.oferta .cta{background:var(--ac);color:var(--ink)}
.faq dt{font-weight:700;margin-top:22px}
.faq dd{margin:6px 0 0;color:#4a5257}
table.escopo{width:100%;border-collapse:collapse;font-size:15px}
table.escopo th,table.escopo td{text-align:left;padding:12px 10px;border-bottom:1px solid rgba(0,0,0,.08)}
table.escopo th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#6b7378}
table.escopo td.v{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
footer{padding:34px 0 56px;color:#6b7378;font-size:13px}
</style>
</head>
<body>
<div class="wrap">
  <header class="top"><div class="logo">${esc(o.iniciais)}</div><div class="marca">${esc(o.marca)}</div></header>
</div>
${o.corpo}
<div class="wrap"><footer>© ${new Date().getFullYear()} ${esc(o.marca)}. ${esc(o.rodape || '')}</footer></div>
</body>
</html>`;
  }

  /* ============================================================
     CATÁLOGO DE ENTREGAS
     ============================================================ */
  const KITS = [
    /* ---------------- página de vendas ---------------- */
    {
      id: 'landing', nome: 'Página de vendas', ext: 'html', nivel: 1, especialidade: 'criacao',
      desc: 'Página única, responsiva e pronta para subir em qualquer hospedagem.',
      vende: 'É um site completo em um arquivo. Dá para hospedar, entregar ao cliente ou vender como template.',
      tokens: 620,
      instrucao(ctx) {
        return `Você é ${ctx.autor}, ${ctx.cargo} do estúdio ${ctx.estudio}. Escreva o texto de uma página de vendas em português do Brasil.
Negócio: ${ctx.ramo}. Público: ${ctx.publico}. Tom: ${ctx.tom}.
Pedido: ${ctx.briefing}
Projeto persistente: ${ctx.projeto ? ctx.projeto.nome : 'principal'} — ${ctx.projeto ? ctx.projeto.objetivo : ''}
Artefatos já produzidos devem ser aproveitados e integrados, especialmente produtos/catálogos.
Responda SOMENTE nestas linhas, sem markdown, sem comentários, uma linha por campo:
CHAPEU: <2 a 4 palavras>
TITULO: <promessa principal, até 10 palavras>
SUBTITULO: <1 frase de até 25 palavras>
CTA: <texto do botão, até 4 palavras>
B1T: <benefício 1, até 4 palavras>
B1D: <explicação do benefício 1, até 20 palavras>
B2T: <benefício 2, até 4 palavras>
B2D: <explicação do benefício 2, até 20 palavras>
B3T: <benefício 3, até 4 palavras>
B3D: <explicação do benefício 3, até 20 palavras>
OFERTA: <frase de fechamento, até 25 palavras>
FAQ1P: <pergunta comum do cliente>
FAQ1R: <resposta, até 25 palavras>
FAQ2P: <outra pergunta comum>
FAQ2R: <resposta, até 25 palavras>
COR: <uma cor que combine com a marca, em hexadecimal>`;
      },
      obrigatorios: ['titulo', 'subtitulo', 'cta', 'b1t', 'b1d', 'b2t', 'b2d', 'b3t', 'b3d', 'oferta'],
      montar(c, ctx) {
        const pal = paleta(corDeTexto(c.cor, '#3A6EA5'));
        const benef = [1, 2, 3].map(i => ({ t: limpa(c['b' + i + 't']) || `Vantagem ${i}`, d: limpa(c['b' + i + 'd']) || '' }));
        const faqs = [1, 2].map(i => ({ p: limpa(c['faq' + i + 'p']), r: limpa(c['faq' + i + 'r']) })).filter(f => f.p && f.r);
        const corpo = `
<div class="wrap">
  <div class="hero">
    ${c.chapeu ? `<span class="eyebrow">${esc(limpa(c.chapeu))}</span>` : ''}
    <h1>${esc(limpa(c.titulo))}</h1>
    <p class="lead">${esc(limpa(c.subtitulo))}</p>
    <a class="cta" href="#contato">${esc(limpa(c.cta) || 'Quero começar')}</a>
    <p class="cta-nota">Resposta em até 1 dia útil.</p>
  </div>
  <section>
    <h2>Por que ${esc(ctx.estudio)}</h2>
    <div class="cards">
      ${benef.map((b, i) => `<div class="card"><span class="num">${i + 1}</span><h3>${esc(b.t)}</h3><p>${esc(b.d)}</p></div>`).join('\n      ')}
    </div>
  </section>
  ${portfolioHTML(ctx)}
  ${faqs.length ? `<section><h2>Perguntas frequentes</h2><dl class="faq">${faqs.map(f => `<dt>${esc(f.p)}</dt><dd>${esc(f.r)}</dd>`).join('')}</dl></section>` : ''}
  <section id="contato" style="border-bottom:0">
    <div class="oferta">
      <h2>${esc(limpa(c.chapeu) || 'Vamos conversar')}</h2>
      <p>${esc(limpa(c.oferta))}</p>
      <a class="cta" href="mailto:contato@exemplo.com">${esc(limpa(c.cta) || 'Falar agora')}</a>
    </div>
  </section>
</div>`;
        return [{
          nome: slug(limpa(c.titulo) || ctx.estudio) + '.html', tipo: 'html',
          conteudo: paginaHTML({
            tituloAba: limpa(c.titulo) || ctx.estudio, descricao: limpa(c.subtitulo),
            marca: ctx.estudio, iniciais: iniciais(ctx.estudio), paleta: pal, corpo,
            rodape: 'Página gerada pelo estúdio.'
          })
        }];
      }
    },

    /* ---------------- pacote de anúncios ---------------- */
    {
      id: 'anuncios', nome: 'Pacote de anúncios', ext: 'csv', nivel: 1, especialidade: 'comercial',
      desc: 'Seis variações de anúncio em CSV, no formato que as plataformas importam.',
      vende: 'Planilha pronta para subir em campanha ou entregar como pacote de copy.',
      tokens: 560,
      instrucao(ctx) {
        return `Você é ${ctx.autor}, ${ctx.cargo} do estúdio ${ctx.estudio}. Escreva 6 anúncios em português do Brasil.
Negócio: ${ctx.ramo}. Público: ${ctx.publico}. Tom: ${ctx.tom}.
Pedido: ${ctx.briefing}
Responda com estas duas linhas e depois a lista:
ANGULO: <ângulo principal da campanha, até 12 palavras>
PUBLICO: <segmento a mirar, até 10 palavras>
---
Depois escreva exatamente 6 linhas, uma por anúncio, no formato:
titulo | descrição de até 20 palavras | chamada do botão
Sem numeração, sem markdown, sem aspas.`;
      },
      obrigatorios: ['angulo'],
      montar(c, ctx, bruto) {
        const linhas = linhasDe(bruto).filter(l => l.indexOf('|') > 0).slice(0, 8);
        const ads = linhas.map(l => l.split('|').map(x => limpa(x)));
        while (ads.length < 3) ads.push([`${ctx.estudio} para ${ctx.publico}`, limpa(c.angulo) || ctx.missao, 'Saiba mais']);
        const cab = ['campanha', 'grupo', 'titulo', 'descricao', 'chamada', 'publico', 'observacao'];
        const corpo = ads.map((a, i) => [
          `${ctx.estudio} — ${limpa(c.angulo) || 'campanha'}`, `variação ${i + 1}`,
          a[0] || '', a[1] || '', a[2] || 'Saiba mais',
          limpa(c.publico) || ctx.publico, ''
        ]);
        return [{ nome: 'anuncios-' + slug(ctx.estudio) + '.csv', tipo: 'csv', conteudo: csv([cab].concat(corpo)) }];
      },
      checarExtra(c, arquivos) {
        const linhas = (arquivos[0].conteudo.match(/\n/g) || []).length;
        return linhas >= 6 ? 12 : linhas >= 4 ? 6 : 0;
      }
    },

    /* ---------------- artigo ---------------- */
    {
      id: 'artigo', nome: 'Artigo otimizado', ext: 'md', nivel: 1, especialidade: 'criacao',
      desc: 'Artigo em Markdown com título, resumo e seções — pronto para blog.',
      vende: 'Texto original que pode ser publicado, vendido como conteúdo ou virar newsletter.',
      tokens: 1500,
      instrucao(ctx) {
        return `Você é ${ctx.autor}, ${ctx.cargo} do estúdio ${ctx.estudio}. Escreva um artigo em português do Brasil.
Negócio: ${ctx.ramo}. Público: ${ctx.publico}. Tom: ${ctx.tom}.
Assunto pedido: ${ctx.briefing}
Comece com estas linhas:
TITULO: <título do artigo, até 12 palavras>
RESUMO: <resumo de até 30 palavras>
PALAVRA_CHAVE: <termo principal de busca>
---
Depois escreva o artigo em Markdown, com 4 a 6 subtítulos "## " e parágrafos de verdade.
Entre 450 e 700 palavras. Sem inventar dados, estatísticas ou nomes de clientes.`;
      },
      obrigatorios: ['titulo', 'resumo'],
      montar(c, ctx, bruto) {
        const texto = String(bruto || '').trim();
        const md = `---
titulo: "${limpa(c.titulo).replace(/"/g, "'")}"
resumo: "${limpa(c.resumo).replace(/"/g, "'")}"
palavra_chave: "${limpa(c.palavra_chave)}"
autor: "${ctx.autor} — ${ctx.estudio}"
data: ${new Date().toISOString().slice(0, 10)}
---

# ${limpa(c.titulo)}

_${limpa(c.resumo)}_

${texto || '## Introdução\n\nConteúdo em elaboração.'}
`;
        return [{ nome: slug(limpa(c.titulo)) + '.md', tipo: 'md', conteudo: md }];
      },
      checarExtra(c, arquivos) {
        const palavras = arquivos[0].conteudo.split(/\s+/).length;
        const titulos = (arquivos[0].conteudo.match(/^## /gm) || []).length;
        return (palavras > 380 ? 10 : palavras > 200 ? 5 : 0) + (titulos >= 3 ? 8 : titulos >= 1 ? 4 : 0);
      }
    },

    /* ---------------- sequência de e-mails ---------------- */
    {
      id: 'emails', nome: 'Sequência de e-mails', ext: 'md', nivel: 2, especialidade: 'comercial',
      desc: 'Quatro e-mails encadeados, com assunto e corpo, prontos para agendar.',
      vende: 'Pode ser colado em qualquer ferramenta de e-mail marketing e revendido como fluxo pronto.',
      tokens: 1100,
      instrucao(ctx) {
        return `Você é ${ctx.autor}, ${ctx.cargo} do estúdio ${ctx.estudio}. Escreva uma sequência de 4 e-mails em português do Brasil.
Negócio: ${ctx.ramo}. Público: ${ctx.publico}. Tom: ${ctx.tom}.
Objetivo: ${ctx.briefing}
Responda com:
OBJETIVO: <o que a sequência quer conseguir, até 15 palavras>
CADENCIA: <ex: dia 0, dia 2, dia 5, dia 9>
---
Depois 4 blocos exatamente assim, sem markdown:
ASSUNTO: <assunto do e-mail 1>
CORPO: <3 a 5 frases>
ASSUNTO: <assunto do e-mail 2>
CORPO: <3 a 5 frases>
ASSUNTO: <assunto do e-mail 3>
CORPO: <3 a 5 frases>
ASSUNTO: <assunto do e-mail 4>
CORPO: <3 a 5 frases>`;
      },
      obrigatorios: ['objetivo'],
      montar(c, ctx, bruto) {
        const ls = linhasDe(bruto);
        const emails = [];
        let atual = null;
        ls.forEach(l => {
          const a = l.match(/^ASSUNTO\s*:\s*(.+)$/i);
          const b = l.match(/^CORPO\s*:\s*(.+)$/i);
          if (a) { atual = { assunto: limpa(a[1]), corpo: '' }; emails.push(atual); }
          else if (b && atual) atual.corpo = limpa(b[1]);
          else if (atual && atual.corpo) atual.corpo += ' ' + limpa(l);
        });
        const cad = (limpa(c.cadencia) || 'dia 0, dia 2, dia 5, dia 9').split(/[,;]/).map(x => limpa(x));
        const usar = emails.length ? emails : [{ assunto: 'Um convite', corpo: limpa(c.objetivo) || ctx.missao }];
        const md = `# Sequência de e-mails — ${ctx.estudio}

**Objetivo:** ${limpa(c.objetivo)}  
**Cadência:** ${cad.join(' · ')}  
**Público:** ${ctx.publico}

${usar.map((e, i) => `---

## E-mail ${i + 1} — ${cad[i] || 'a definir'}

**Assunto:** ${e.assunto}

${String(e.corpo).replace(/\.\s+/g, '.\n\n')}
`).join('\n')}`;
        return [{ nome: 'sequencia-emails-' + slug(ctx.estudio) + '.md', tipo: 'md', conteudo: md }];
      },
      checarExtra(c, arquivos) {
        const n = (arquivos[0].conteudo.match(/## E-mail/g) || []).length;
        return n >= 4 ? 14 : n >= 2 ? 7 : 0;
      }
    },

    /* ---------------- catálogo ---------------- */
    {
      id: 'catalogo', nome: 'Catálogo de produtos', ext: 'csv', nivel: 2, especialidade: 'dados',
      desc: 'Planilha com itens, categorias, preços e descrições de venda.',
      vende: 'Importa direto em loja virtual, marketplace ou sistema de estoque.',
      tokens: 1000,
      instrucao(ctx) {
        return `Você é ${ctx.autor}, ${ctx.cargo} do estúdio ${ctx.estudio}. Monte um catálogo em português do Brasil.
Negócio: ${ctx.ramo}. Público: ${ctx.publico}.
Pedido: ${ctx.briefing}
Responda com:
COLECAO: <nome da coleção ou linha>
MOEDA: BRL
---
Depois exatamente 8 linhas, uma por item, no formato:
nome do item | categoria | preço em número | descrição de venda de até 18 palavras
Sem numeração, sem cabeçalho, sem markdown.`;
      },
      obrigatorios: ['colecao'],
      montar(c, ctx, bruto) {
        const itens = linhasDe(bruto).filter(l => l.indexOf('|') > 0).slice(0, 12)
          .map((l, i) => {
            const p = l.split('|').map(x => limpa(x));
            const preco = (String(p[2] || '').match(/[\d.,]+/) || ['0'])[0].replace(/\./g, '').replace(',', '.');
            return [
              `SKU-${String(i + 1).padStart(3, '0')}`, p[0] || `Item ${i + 1}`, p[1] || 'geral',
              (Number(preco) || 0).toFixed(2), 'BRL', p[3] || '', limpa(c.colecao) || ''
            ];
          });
        if (!itens.length) itens.push(['SKU-001', 'Item inicial', 'geral', '0.00', 'BRL', ctx.missao, limpa(c.colecao)]);
        const cab = ['sku', 'nome', 'categoria', 'preco', 'moeda', 'descricao', 'colecao'];
        return [{ nome: 'catalogo-' + slug(limpa(c.colecao) || ctx.estudio) + '.csv', tipo: 'csv', conteudo: csv([cab].concat(itens)) }];
      },
      checarExtra(c, arquivos) {
        const n = (arquivos[0].conteudo.match(/\nSKU-/g) || []).length;
        return n >= 8 ? 14 : n >= 4 ? 7 : 0;
      }
    },

    /* ---------------- kit de marca ---------------- */
    {
      id: 'marca', nome: 'Kit de marca', ext: 'svg', nivel: 2, especialidade: 'criacao',
      desc: 'Logo em SVG vetorial, paleta em CSS e guia de uso. Três arquivos.',
      vende: 'Identidade visual completa — o pacote que agências cobram caro para entregar.',
      tokens: 520,
      multiplo: true,
      instrucao(ctx) {
        return `Você é ${ctx.autor}, ${ctx.cargo} do estúdio ${ctx.estudio}. Defina a identidade da marca em português do Brasil.
Negócio: ${ctx.ramo}. Público: ${ctx.publico}. Tom: ${ctx.tom}.
Pedido: ${ctx.briefing}
Responda SOMENTE nestas linhas:
ESSENCIA: <o que a marca é, em 1 frase de até 20 palavras>
TAGLINE: <assinatura de até 6 palavras>
COR: <cor principal em hexadecimal>
ADJETIVOS: <3 adjetivos separados por vírgula>
VOZ: <como a marca fala, até 15 palavras>
EVITAR: <o que a marca nunca faz, até 15 palavras>`;
      },
      obrigatorios: ['essencia', 'tagline', 'adjetivos'],
      montar(c, ctx) {
        const pal = paleta(corDeTexto(c.cor, '#3A6EA5'));
        const ini = iniciais(ctx.estudio);
        const nomeBase = slug(ctx.estudio);
        const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" width="320" height="96" role="img" aria-label="${esc(ctx.estudio)}">
  <title>${esc(ctx.estudio)}</title>
  <rect x="8" y="16" width="64" height="64" rx="18" fill="${pal.primaria}"/>
  <text x="40" y="57" font-family="Helvetica,Arial,sans-serif" font-size="27" font-weight="700"
        fill="#FFFFFF" text-anchor="middle" letter-spacing="-1">${esc(ini)}</text>
  <text x="88" y="49" font-family="Helvetica,Arial,sans-serif" font-size="25" font-weight="700"
        fill="${pal.tinta}" letter-spacing="-0.6">${esc(ctx.estudio)}</text>
  <text x="89" y="69" font-family="Helvetica,Arial,sans-serif" font-size="12"
        fill="${pal.escura}" letter-spacing="1.6">${esc(limpa(c.tagline).toUpperCase())}</text>
</svg>`;
        const css = `/* Paleta — ${ctx.estudio} */
:root{
  --marca-primaria:${pal.primaria};
  --marca-escura:${pal.escura};
  --marca-clara:${pal.clara};
  --marca-acento:${pal.acento};
  --marca-tinta:${pal.tinta};
  --marca-papel:${pal.papel};
}
.btn-marca{background:var(--marca-primaria);color:#fff;border:0;border-radius:12px;padding:14px 24px;font-weight:700}
.btn-marca:hover{background:var(--marca-escura)}
.tag-marca{background:var(--marca-clara);color:var(--marca-escura);border-radius:99px;padding:5px 12px;font-size:13px}
`;
        const guia = `# Guia de marca — ${ctx.estudio}

## Essência
${limpa(c.essencia)}

## Assinatura
**${limpa(c.tagline)}**

## Personalidade
${limpa(c.adjetivos)}

## Como a marca fala
${limpa(c.voz) || 'Tom ' + ctx.tom + ', frases curtas, sem jargão.'}

## O que a marca nunca faz
${limpa(c.evitar) || 'Prometer resultado que não pode entregar.'}

## Cores
- Primária ${pal.primaria} — botões, links e destaques
- Escura ${pal.escura} — títulos e estados de foco
- Clara ${pal.clara} — fundos de apoio e etiquetas
- Acento ${pal.acento} — usar com parcimônia, só para chamar atenção
- Tinta ${pal.tinta} — texto corrido
- Papel ${pal.papel} — fundo das páginas

## Uso do logo
- Espaço livre mínimo ao redor: a altura da letra do monograma.
- Tamanho mínimo: 24 px de altura do símbolo.
- Nunca distorcer, girar, aplicar sombra ou trocar as cores.
- Sobre fundo escuro, usar a versão do monograma em branco.

_Gerado por ${ctx.autor} — ${new Date().toLocaleDateString('pt-BR')}._
`;
        return [
          { nome: `logo-${nomeBase}.svg`, tipo: 'svg', conteudo: logo },
          { nome: `paleta-${nomeBase}.css`, tipo: 'css', conteudo: css },
          { nome: `guia-de-marca-${nomeBase}.md`, tipo: 'md', conteudo: guia }
        ];
      }
    },

    /* ---------------- proposta comercial ---------------- */
    {
      id: 'proposta', nome: 'Proposta comercial', ext: 'html', nivel: 2, especialidade: 'comercial',
      desc: 'Uma página com escopo, prazos, valores e condições.',
      vende: 'É o documento que fecha negócio — pode ser enviado ao cliente como está.',
      tokens: 700,
      instrucao(ctx) {
        return `Você é ${ctx.autor}, ${ctx.cargo} do estúdio ${ctx.estudio}. Escreva uma proposta comercial em português do Brasil.
Negócio: ${ctx.ramo}. Cliente/público: ${ctx.publico}. Tom: ${ctx.tom}.
Pedido: ${ctx.briefing}
Responda SOMENTE nestas linhas:
CLIENTE: <para quem é a proposta>
PROBLEMA: <o problema do cliente, até 25 palavras>
SOLUCAO: <o que será feito, até 30 palavras>
ITEM1: <entregável 1> | <prazo> | <valor em reais>
ITEM2: <entregável 2> | <prazo> | <valor em reais>
ITEM3: <entregável 3> | <prazo> | <valor em reais>
CONDICOES: <forma de pagamento e validade, até 25 palavras>
COR: <cor da marca em hexadecimal>`;
      },
      obrigatorios: ['cliente', 'problema', 'solucao', 'item1'],
      montar(c, ctx) {
        const pal = paleta(corDeTexto(c.cor, '#25405E'));
        const itens = ['item1', 'item2', 'item3'].map(k => limpa(c[k])).filter(Boolean)
          .map(l => l.split('|').map(x => limpa(x)));
        const total = itens.reduce((s, i) => {
          const v = (String(i[2] || '').match(/[\d.,]+/) || ['0'])[0].replace(/\./g, '').replace(',', '.');
          return s + (Number(v) || 0);
        }, 0);
        const corpo = `
<div class="wrap">
  <div class="hero">
    <span class="eyebrow">Proposta comercial</span>
    <h1>${esc(limpa(c.cliente))}</h1>
    <p class="lead">${esc(limpa(c.problema))}</p>
  </div>
  <section>
    <h2>O que propomos</h2>
    <p class="lead">${esc(limpa(c.solucao))}</p>
  </section>
  <section>
    <h2>Escopo e investimento</h2>
    <table class="escopo">
      <tr><th>Entregável</th><th>Prazo</th><th class="v">Valor</th></tr>
      ${itens.map(i => `<tr><td>${esc(i[0] || '')}</td><td>${esc(i[1] || 'a combinar')}</td><td class="v">${esc(i[2] || '—')}</td></tr>`).join('\n      ')}
      ${total > 0 ? `<tr><td><b>Total</b></td><td></td><td class="v"><b>${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b></td></tr>` : ''}
    </table>
  </section>
  <section style="border-bottom:0">
    <div class="oferta">
      <h2>Condições</h2>
      <p>${esc(limpa(c.condicoes) || 'Pagamento em duas parcelas. Proposta válida por 15 dias.')}</p>
      <a class="cta" href="mailto:contato@exemplo.com">Aprovar proposta</a>
    </div>
  </section>
</div>`;
        return [{
          nome: 'proposta-' + slug(limpa(c.cliente) || ctx.estudio) + '.html', tipo: 'html',
          conteudo: paginaHTML({
            tituloAba: 'Proposta — ' + limpa(c.cliente), descricao: limpa(c.solucao),
            marca: ctx.estudio, iniciais: iniciais(ctx.estudio), paleta: pal, corpo,
            rodape: 'Documento comercial.'
          })
        }];
      }
    },

    /* ---------------- calendário de conteúdo ---------------- */
    {
      id: 'calendario', nome: 'Calendário de conteúdo', ext: 'csv', nivel: 3, especialidade: 'criacao',
      desc: '30 dias de pauta com data real, canal, formato e legenda.',
      vende: 'Planejamento mensal completo — entrega recorrente e fácil de vender por assinatura.',
      tokens: 1200,
      instrucao(ctx) {
        return `Você é ${ctx.autor}, ${ctx.cargo} do estúdio ${ctx.estudio}. Planeje conteúdo em português do Brasil.
Negócio: ${ctx.ramo}. Público: ${ctx.publico}. Tom: ${ctx.tom}.
Pedido: ${ctx.briefing}
Responda com:
TEMA_DO_MES: <tema central, até 8 palavras>
CANAIS: <canais separados por vírgula>
---
Depois exatamente 12 linhas, uma por pauta, no formato:
tema da pauta | formato | legenda curta de até 18 palavras
Sem numeração, sem markdown.`;
      },
      obrigatorios: ['tema_do_mes'],
      montar(c, ctx, bruto) {
        const pautas = linhasDe(bruto).filter(l => l.indexOf('|') > 0).map(l => l.split('|').map(x => limpa(x)));
        const canais = (limpa(c.canais) || 'Instagram, Blog, E-mail').split(/[,;]/).map(x => limpa(x)).filter(Boolean);
        const base = pautas.length ? pautas : [[limpa(c.tema_do_mes) || 'Apresentação', 'post', ctx.missao]];
        const hoje = new Date();
        const linhas = [];
        for (let d = 0; d < 30; d++) {
          const data = new Date(hoje.getTime() + d * 86400000);
          const diaSemana = data.getDay();
          if (diaSemana === 0) continue;                 // domingo folga
          if (d % 2 === 1 && diaSemana !== 6) continue;   // ritmo realista
          const p = base[linhas.length % base.length];
          linhas.push([
            data.toISOString().slice(0, 10),
            canais[linhas.length % canais.length] || 'Instagram',
            p[1] || 'post', p[0] || '', p[2] || '', 'a produzir'
          ]);
        }
        const cab = ['data', 'canal', 'formato', 'tema', 'legenda', 'status'];
        return [{ nome: 'calendario-' + slug(limpa(c.tema_do_mes) || ctx.estudio) + '.csv', tipo: 'csv', conteudo: csv([cab].concat(linhas)) }];
      },
      checarExtra(c, arquivos) {
        const n = (arquivos[0].conteudo.match(/\n\d{4}-/g) || []).length;
        return n >= 10 ? 14 : n >= 5 ? 7 : 0;
      }
    }
  ];

  const porId = id => KITS.find(k => k.id === id) || null;
  const disponiveis = nivel => KITS.filter(k => k.nivel <= (nivel || 1));

  /* ============================================================
     Aferição de qualidade — checagem estrutural, não opinião da IA.
     ============================================================ */
  function aferir(kit, campos, arquivos, agente) {
    let nota = 34;
    const obrig = kit.obrigatorios || [];
    if (obrig.length) {
      const presentes = obrig.filter(k => String(campos[k] || '').trim().length > 2).length;
      nota += (presentes / obrig.length) * 26;
    } else nota += 20;

    const total = arquivos.reduce((s, a) => s + a.conteudo.length, 0);
    nota += clamp(total / 220, 0, 16);

    const suspeito = obrig.some(k => temPlaceholder(campos[k]));
    if (suspeito) nota -= 16;

    if (typeof kit.checarExtra === 'function') {
      try { nota += kit.checarExtra(campos, arquivos) || 0; } catch (e) {}
    } else nota += 8;

    if (agente) {
      if (agente.especialidade === kit.especialidade) nota += 8;
      else if (agente.papel === 'gerente') nota += 2;
      else nota -= 4;
      nota += ((agente.humor || 60) - 55) / 8;
      if ((agente.energia || 80) < 25) nota -= 8;
    }
    return Math.round(clamp(nota, 8, 100));
  }

  /* ============================================================
     Produção — uma chamada de IA por entrega. Se a IA não estiver
     disponível, o gabarito ainda produz um arquivo real e utilizável,
     só que genérico; ele nasce como esboço.
     ============================================================ */
  async function produzir(op) {
    const e = S.state.atual();
    const kit = porId(op.kit); if (!e || !kit) return null;
    const agente = op.agente || null;
    const ctx = {
      estudio: e.nome, ramo: e.ramo, missao: e.missao, tom: e.tom, publico: e.publico,
      autor: agente ? agente.nome : 'a equipe',
      cargo: agente ? agente.cargo : 'produção',
      briefing: String(op.briefing || kit.desc).slice(0, 420),
      projectId: op.projectId || null,
      projeto: contextoProjeto(e, op.projectId)
    };

    let campos = null, bruto = '', viaIA = false;
    if (S.ai.pronta()) {
      try {
        const r = await S.ai.chamar({
          sistema: kit.instrucao(ctx),
          pedido: contextoDetalhado(e, op, agente, ctx.projeto),
          tipo: 'conteudo', tokens: Math.max(1500, kit.tokens || 1500),
          agente: ctx.autor, motivo: 'produzir ' + kit.nome
        });
        campos = S.ai.campos(r.texto);
        bruto = S.ai.corpo(r.texto);
        viaIA = Object.keys(campos).length > 0 || bruto.length > 40;
      } catch (err) { /* cai no gabarito local */ }
    }
    if (!campos || !Object.keys(campos).length) campos = camposDeContingencia(kit, ctx);

    let arquivos;
    try { arquivos = kit.montar(campos, ctx, bruto) || []; }
    catch (err) { console.error('Falha ao montar', kit.id, err); return null; }
    if (!arquivos.length) return null;

    /* Sem IA o arquivo é real, mas genérico: nasce como esboço e com teto
       de qualidade para deixar claro que não passou pela produção da IA. */
    const bruta = aferir(kit, campos, arquivos, agente);
    const qualidade = viaIA ? bruta : Math.min(36, bruta);
    const classe = !viaIA ? 'esboco' : qualidade >= 72 ? 'candidato' : qualidade >= 50 ? 'prototipo' : 'esboco';
    return { arquivos, qualidade, classe, viaIA, kit: kit.id, campos };
  }

  function contextoProjeto(e, projectId) {
    const projeto = (e.projetos || []).find(p => p.id === projectId) || (e.projetos || []).find(p => p.status === 'ativo') || (e.projetos || [])[0];
    if (!projeto) return { nome: 'Projeto principal', objetivo: e.missao, arquivos: [], tarefas: [] };
    const arquivos = (projeto.arquivoIds || []).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean).slice(0, 10)
      .map(a => ({ id: a.id, nome: a.nome, tipo: a.tipo, classe: a.classe, qualidade: a.qualidade, conteudo: String(a.conteudo).slice(0, 1800) }));
    const tarefas = (projeto.tarefaIds || []).map(id => e.tarefas.find(t => t.id === id)).filter(Boolean).slice(0, 10)
      .map(t => ({ id: t.id, titulo: t.titulo, status: t.status, handoff: t.handoff || '' }));
    return { id: projeto.id, nome: projeto.nome, objetivo: projeto.objetivo, arquivos, tarefas };
  }

  function contextoProjetoPrompt(projeto) {
    if (!projeto) return '';
    const arquivos = (projeto.arquivos || []).slice(0, 5).map(a =>
      `ARQUIVO ${a.nome} [${a.classe}, q${a.qualidade}]\n${String(a.conteudo || '').slice(0, 700)}`
    ).join('\n');
    const tarefas = (projeto.tarefas || []).slice(0, 5).map(t =>
      `${t.status.toUpperCase()}: ${t.titulo}${t.handoff ? ` | ${t.handoff}` : ''}`
    ).join('\n');
    return `\nPROJETO PERSISTENTE: ${projeto.nome}\nOBJETIVO: ${projeto.objetivo}\nETAPAS:\n${tarefas || 'nenhuma'}\nARTEFATOS:\n${arquivos || 'nenhum'}`;
  }

  /* Contexto detalhado, mas controlado. A entrada é deliberadamente mais rica
     que o output: na Groq o input do GPT-OSS 20B custa muito menos que a saída,
     e contexto preciso reduz retrabalho, alucinação e necessidade de novas chamadas. */
  function contextoDetalhado(e, op, agente, projeto) {
    const projetoReal = (e.projetos || []).find(p => p.id === (op.projectId || '')) ||
      (e.projetos || []).find(p => p.status === 'ativo') || (e.projetos || [])[0];
    const tarefa = (e.tarefas || []).find(t => t.id === op.taskId) || null;
    const mem = agente && Array.isArray(agente.memoria) ? agente.memoria : [];
    const memoria = mem.slice(-10).map(m => typeof m === 'string' ? m : m.texto).filter(Boolean)
      .map((x,i) => `${i + 1}. ${x}`).join('\n') || 'Nenhuma memória registrada.';
    const equipe = (e.equipe || []).map(f =>
      `${f.nome} | ${f.cargo} | especialidade=${f.especialidade} | energia=${Math.round(f.energia || 0)} | foco=${f.foco || 'disponível'} | pensamento=${f.pensamento || '—'}`
    ).join('\n');
    const arquivos = ((projeto && projeto.arquivoIds) || []).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean)
      .slice(0, 9).map(a => `### ${a.nome} | ${a.classe} | v${a.versao || 1} | qualidade=${a.qualidade || 0}\n${String(a.conteudo || '').slice(0, 1250)}`).join('\n\n') || 'Nenhum artefato anterior.';
    const tarefas = ((projeto && projeto.tarefaIds) || []).map(id => e.tarefas.find(t => t.id === id)).filter(Boolean)
      .slice(0, 12).map(t => `${t.status.toUpperCase()} | ${t.titulo} | responsável=${t.para || 'não atribuído'} | handoff=${t.handoff || 'nenhum'}`).join('\n') || 'Nenhuma etapa registrada.';
    const produtos = (e.arquivos || []).filter(a => a.classe === 'produto').slice(0, 8)
      .map(a => `${a.nome} v${a.versao || 1} | ${a.tipo} | projeto=${a.projectId || 'principal'} | qualidade=${a.qualidade || 0}`).join('\n') || 'Nenhum produto publicado.';
    const eventos = (e.log || []).slice(-8).map(l => `${new Date(l.t || Date.now()).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} — ${l.texto}`).join('\n') || 'Nenhum evento recente.';
    const objetivo = projetoReal ? projetoReal.objetivo : e.missao;
    const briefing = String(op.briefing || '').slice(0, 900);
    return `CONTEXTO OPERACIONAL COMPLETO — NÃO INVENTE FATOS\n\nESTÚDIO\nNome: ${e.nome}\nRamo: ${e.ramo}\nMissão: ${e.missao}\nPúblico: ${e.publico}\nTom: ${e.tom}\n\nPROJETO PERSISTENTE\nNome: ${projetoReal ? projetoReal.nome : 'Projeto principal'}\nObjetivo: ${objetivo}\nBriefing da etapa: ${briefing}\n\nTAREFA ATUAL\n${tarefa ? `${tarefa.titulo} | status=${tarefa.status} | handoff=${tarefa.handoff || 'nenhum'}` : 'A tarefa deve ser inferida apenas do briefing e do projeto.'}\n\nMEMÓRIA DO FUNCIONÁRIO — use para manter continuidade\n${memoria}\n\nEQUIPE E CONTEXTO SOCIAL\n${equipe}\n\nARTEFATOS EXISTENTES — evolua o que já existe quando fizer sentido\n${arquivos}\n\nPRODUTOS JÁ PUBLICADOS — produtos finais devem continuar consumíveis pelo público\n${produtos}\n\nETAPAS DO PROJETO\n${tarefas}\n\nEVENTOS RECENTES\n${eventos}\n\nCRITÉRIO CENTRAL\nO trabalho precisa contribuir explicitamente para um produto final utilizável pelo público. Preserve dados, conteúdo e decisões anteriores. Não substitua um produto existente por um rascunho sem necessidade. Se depender do trabalho de outra pessoa, incorpore esse trabalho. Entregue algo completo, não uma ideia, promessa ou placeholder.`.slice(0, 11500);
  }

  function contextoCurto(e) {
    const projeto = (e.projetos || []).find(p => p.status === 'ativo') || (e.projetos || [])[0];
    return `Projeto=${projeto ? projeto.nome : 'principal'}; objetivo=${projeto ? projeto.objetivo : e.missao}; preserve e evolua artefatos existentes.`;
  }

  function camposDeContingencia(kit, ctx) {
    const base = {
      titulo: `${ctx.estudio} — ${ctx.ramo}`,
      subtitulo: ctx.missao,
      chapeu: ctx.ramo,
      cta: 'Falar com a equipe',
      oferta: `${ctx.estudio} atende ${ctx.publico} com ${ctx.ramo}.`,
      b1t: 'Feito à mão', b1d: 'Cada entrega é montada para o seu caso, não em série.',
      b2t: 'Prazo curto', b2d: 'Você recebe a primeira versão em poucos dias.',
      b3t: 'Sem enrolação', b3d: 'Escopo claro, preço claro, entrega no formato que você usa.',
      angulo: `${ctx.ramo} para ${ctx.publico}`,
      publico: ctx.publico,
      resumo: ctx.missao,
      palavra_chave: ctx.ramo,
      objetivo: `Apresentar ${ctx.estudio} para ${ctx.publico}.`,
      cadencia: 'dia 0, dia 2, dia 5, dia 9',
      colecao: 'Linha inicial',
      essencia: ctx.missao, tagline: ctx.ramo, adjetivos: 'direta, cuidadosa, prática',
      voz: `Tom ${ctx.tom}, frases curtas.`, evitar: 'Prometer o que não pode cumprir.',
      cliente: ctx.publico, problema: `Precisa de ${ctx.ramo} sem complicação.`,
      solucao: ctx.missao, item1: 'Diagnóstico inicial | 3 dias | 480',
      condicoes: 'Metade na aprovação, metade na entrega. Válida por 15 dias.',
      tema_do_mes: ctx.ramo, canais: 'Instagram, Blog, E-mail'
    };
    void kit;
    return base;
  }

  S.factory = {
    KITS, porId, disponiveis, produzir, aferir, paleta, corDeTexto, iniciais,
    csv, paginaHTML
  };
})(window.S);
