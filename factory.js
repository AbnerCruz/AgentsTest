/* ============================================================
   FACTORY — camada de produção real.
   O agente decide O QUE fazer (agency/studio); aqui a decisão vira
   ARQUIVO. Nada é gerado por template: o conteúdo vem da IA de produção
   e só é aceito se houver material concreto. Sem IA não há produção
   fictícia: a função falha e a tarefa volta para aberta.
   ============================================================ */
(function (S) {
  'use strict';
  const { slug } = S.util;

  /* Kits existem apenas para roteamento de especialidade e nome de arquivo.
     Não são roteiros de produto nem templates de conteúdo. */
  const KITS = [
    { id: 'autonomo',  nome: 'Trabalho autônomo',  especialidade: 'geral',     tipo: 'md'   },
    { id: 'texto',     nome: 'Texto e conteúdo',   especialidade: 'criacao',   tipo: 'md'   },
    { id: 'pagina',    nome: 'Página / interface', especialidade: 'producao',  tipo: 'html' },
    { id: 'dados',     nome: 'Dados e catálogo',   especialidade: 'dados',     tipo: 'csv'  },
    { id: 'comercial', nome: 'Material comercial', especialidade: 'comercial', tipo: 'md'   }
  ];
  const porId = id => KITS.find(k => k.id === id) || KITS[0];

  const TIPOS = ['md', 'html', 'txt', 'csv', 'json', 'js', 'css'];
  const PLACEHOLDERS = [
    /lorem ipsum/i, /\bTODO\b/, /\bTBD\b/, /\bxxx+\b/i, /\{\{[^}]*\}\}/,
    /<preencher>/i, /\[inserir[^\]]*\]/i, /coloque aqui/i, /texto de exemplo/i,
    /\[nome(?:\s+do|\s+da)?[^\]]*\]/i, /\[(?:data|assinatura|url|link|cargo|respons[aá]vel|pre[çc]o|m[eé]trica|meta|canal)(?:[^\]]*)\]/i
  ];

  function limparNome(nome, tipo) {
    let n = String(nome || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\*+/g, '').trim();
    n = n.split(/\s+/).slice(0, 8).join(' ').slice(0, 70) || 'entrega';
    const ext = '.' + tipo;
    if (!n.toLowerCase().endsWith(ext)) n = slug(n).slice(0, 60) + ext;
    return n;
  }

  function tipoValido(t, kit) {
    const v = String(t || '').toLowerCase().replace(/^\./, '').trim();
    return TIPOS.includes(v) ? v : porId(kit).tipo;
  }

  function validar(conteudo, tipo) {
    const texto = String(conteudo || '');
    const t = String(tipo || 'md').toLowerCase();
    const notas = [];
    const minimo = ['json','csv','css','js'].includes(t) ? 80 : 200;
    if (texto.trim().length < minimo) notas.push('conteúdo curto demais para uma entrega completa deste tipo');
    if (!['json','csv','css','js'].includes(t) && texto.split(/\n/).length < 4) notas.push('estrutura insuficiente: poucas linhas');
    PLACEHOLDERS.forEach(rx => { rx.lastIndex = 0; if (rx.test(texto)) notas.push('marcador de preenchimento encontrado: ' + rx.source); });
    if (t === 'json') { try { JSON.parse(texto); } catch (_) { notas.push('JSON inválido'); } }
    if (t === 'html' && !/<(?:html|body|main|section|article|div)[\s>]/i.test(texto)) notas.push('HTML sem estrutura utilizável');
    if (t === 'csv') {
      const linhas = texto.trim().split(/\n/).filter(Boolean);
      if (linhas.length < 2 || !/[;,\t]/.test(linhas[0] || '')) notas.push('CSV sem cabeçalho e linhas de dados verificáveis');
    }
    return { pronto: notas.length === 0, notas: notas.slice(0, 6), verificadoEm: Date.now(), tipo: t };
  }

  function contextoAcervo(e, baseArquivo, projectId) {
    if (!e) return 'nenhum';
    const todos = (e.arquivos || []).filter(a => (!projectId || a.projectId === projectId) && (!baseArquivo || a.id !== baseArquivo.id));
    const mesmaLinha = baseArquivo ? todos.filter(a => a.linhagem && a.linhagem === baseArquivo.linhagem) : [];
    const outros = todos.filter(a => !mesmaLinha.includes(a));
    const relacionados = mesmaLinha.concat(outros).slice(0, 4)
      .map(a => `${a.nome} [${a.classe}]: ${String(a.conteudo || '').slice(0, 700)}`);
    return relacionados.join('\n\n') || 'nenhum';
  }

  function pedeCrescimento(briefing) {
    return /\b(expandir|expans[aã]o|estender|extens[aã]o|acrescentar (?:cap[ií]tulos?|se[cç][oõ]es?)|mais cap[ií]tulos?|\d+\s*p[aá]ginas?|continuar (?:o |a )?(?:livro|texto|romance|conto|cap[ií]tulo)|aprofundar narrativa)\b/i.test(String(briefing||''));
  }
  function trechoBaseParaPrompt(base, incremental) {
    const txt=String(base&&base.conteudo||'');
    if(!incremental || txt.length<=18000) return txt;
    return txt.slice(0,3500)+`\n\n[... ${txt.length-15500} caracteres intermediários preservados no arquivo persistente ...]\n\n`+txt.slice(-12000);
  }

  /* Produz um artefato real a partir da decisão já tomada pelo agente. */
  async function produzir(op) {
    const e = S.state.atual();
    if (!e) throw new Error('Nenhuma empresa ativa para receber a produção.');
    const kit = porId(op && op.kit).id;
    const agente = (op && op.agente) || {};
    const briefing = String((op && op.briefing) || '').slice(0, 2000);
    if (!briefing) throw new Error('Sem briefing não existe produção.');
    const base = op && op.baseArquivoId ? (e.arquivos || []).find(a => a.id === op.baseArquivoId) : null;
    const projeto = (e.projetos || []).find(p => p.id === (op && op.projectId)) ||
                    (e.projetos || []).find(p => p.status === 'ativo') || (e.projetos || [])[0] || null;
    const incremental = Boolean(base && (String(base.conteudo||'').length > 12000 || pedeCrescimento(briefing)));
    const basePrompt = base ? trechoBaseParaPrompt(base, incremental) : '';

    const sistema = [
      `Você é ${agente.nome || 'um integrante'}, ${agente.cargo || 'da equipe'} da empresa ${e.nome}.`,
      `Sua tarefa agora é PRODUZIR um arquivo real e completo, pronto para uso, não descrever o que faria.`,
      ``,
      `EMPRESA: ${e.nome} | ramo: ${e.ramo} | público: ${e.publico} | tom: ${e.tom}`,
      `MISSÃO: ${e.missao}`,
      `IDENTIDADE: ${(e.fundacao && e.fundacao.identidade && e.fundacao.identidade.posicionamento) || 'n/d'}`,
      `PROJETO: ${projeto ? projeto.nome : 'principal'} | objetivo: ${projeto ? projeto.objetivo : e.missao}`,
      `BRIEFING DA TAREFA: ${briefing}`,
      (op && op.deliberacao) ? `ABORDAGEM JÁ DECIDIDA POR VOCÊ: ${String(op.deliberacao).slice(0, 700)}` : '',
      base ? `ARTEFATO BASE QUE DEVE SER EVOLUÍDO (preserve o que funciona, não recomece do zero):\n${base.nome} [${base.tipo}]\n${String(base.conteudo || '')}` : '',
      `ACERVO RELACIONADO (para continuidade, não copie):\n${contextoAcervo(e, base, projeto && projeto.id)}`,
      ``,
      `REGRAS DE PRODUÇÃO:`,
      `- Entregue o conteúdo integral do arquivo, sem resumo, sem comentários sobre o processo e sem pedir aprovação.`,
      `- Nada de texto de exemplo, lorem ipsum, TODO, colchetes para preencher ou dados inventados sobre o mundo real.`,
      `- Não invente clientes, vendas, métricas, datas ou aprovações. Hipóteses devem ser declaradas como hipóteses.`,
      `- Você só pode produzir/editar arquivos dentro deste simulador. Não prometa enviar e-mail, criar tarefa no Asana, obter assinatura, fazer upload externo ou executar qualquer ação em serviço externo.`,
      `- Se o briefing pedir uma ação externa impossível, converta-a em algo interno e verificável (ex.: checklist, minuta, campo marcado como dependência externa) sem fingir que a ação aconteceu e sem torná-la requisito para concluir o arquivo.`,
      incremental ? `- Em OPERACAO: anexar, não repita o conteúdo base; produza apenas continuação substantiva e coerente.` : `- Se estiver evoluindo o artefato base, entregue a versão nova completa, não um diff.`,
      ``,
      `RETORNE EXATAMENTE NESTE FORMATO:`,
      `ARQUIVO: <nome do arquivo com extensão>`,
      `TIPO: <md | html | txt | csv | json | js | css>`,
      `RESUMO: <uma frase sobre o que foi entregue>`,
      `OPERACAO: <substituir | anexar>`,
      `PRONTO: sim | nao`,
      `---`,
      `<conteúdo integral do arquivo a partir daqui>`
    ].filter(Boolean).join('\n');

    const r = await S.ai.chamar({
      sistema,
      pedido: incremental ? 'Evolua o arquivo agora. Se a tarefa for de crescimento, prefira OPERACAO: anexar e entregue depois de --- apenas o novo trecho que será unido ao arquivo persistente.' : 'Produza agora o arquivo completo, no formato pedido. O conteúdo depois de --- é o arquivo, exatamente como será salvo.',
      tipo: 'conteudo',
      tokens: (op && op.tokens) || 3000,
      agente: agente.nome,
      agenteId: agente.id,
      motivo: 'produção de artefato'
    });

    const texto = String((r && r.texto) || '');
    const campos = S.ai.campos(texto);
    let conteudo = S.ai.corpo(texto);
    if (!conteudo) {
      // Sem o separador, aproveitamos o que veio removendo as linhas de cabeçalho.
      conteudo = texto.split(/\n/).filter(l => !/^\s*(ARQUIVO|TIPO|RESUMO|OPERACAO|PRONTO)\s*:/i.test(l)).join('\n').trim();
    }
    conteudo = conteudo.replace(/^```[a-z]*\n?|```$/gi, '').trim();
    if (conteudo.length < 80) throw new Error('A IA de produção não devolveu conteúdo utilizável.');
    const operacao = incremental && String(campos.operacao || '').toLowerCase().trim() === 'anexar' ? 'anexar' : 'substituir';
    if (base && operacao === 'anexar') {
      const anterior=String(base.conteudo||'').trimEnd();
      const novo=conteudo.trimStart();
      // Evita anexar uma cópia integral do começo caso o modelo ignore a regra.
      const inicioAnterior=anterior.slice(0,500).replace(/\s+/g,' ').trim();
      const inicioNovo=novo.slice(0,500).replace(/\s+/g,' ').trim();
      if (inicioAnterior && inicioNovo && (inicioNovo.startsWith(inicioAnterior.slice(0,180)) || inicioAnterior.startsWith(inicioNovo.slice(0,180)))) {
        throw new Error('A IA repetiu o artefato base em modo incremental; a duplicação foi bloqueada.');
      }
      conteudo = anterior + '\n\n' + novo;
    }

    // Em uma evolução, identidade de arquivo e formato pertencem à linhagem,
    // não à resposta do modelo. Isto impede renomeações acidentais a cada revisão.
    const tipo = base ? tipoValido(base.tipo, kit) : tipoValido(campos.tipo, kit);
    const nome = base ? limparNome(base.nome, tipo) : limparNome(campos.arquivo || (op && op.titulo) || 'entrega', tipo);
    const validacao = validar(conteudo, tipo);
    validacao.prontoEstrutural = validacao.pronto;
    validacao.declaradoPronto = String(campos.pronto || '').toLowerCase() === 'sim' || campos.pronto === true;
    if (String(campos.pronto || '').toLowerCase() === 'nao' || campos.pronto === false) {
      validacao.pronto = false;
      validacao.notas = (validacao.notas || []).concat('o próprio autor declarou a entrega incompleta').slice(0, 6);
    }

    return {
      arquivos: [{ nome, tipo, conteudo }],
      resumo: String(campos.resumo || '').slice(0, 300),
      validacao,
      classe: 'candidato',
      kit,
      viaIA: true,
      linhagem: base ? base.linhagem : null,
      baseArquivoId: base ? base.id : null,
      operacao
    };
  }

  S.factory = { KITS, porId, produzir, validar };
})(window.S);
