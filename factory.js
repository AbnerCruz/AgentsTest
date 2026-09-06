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
    /<preencher>/i, /\[inserir[^\]]*\]/i, /coloque aqui/i, /texto de exemplo/i
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

  function validar(conteudo) {
    const texto = String(conteudo || '');
    const notas = [];
    if (texto.trim().length < 200) notas.push('conteúdo curto demais para ser uma entrega completa');
    if (texto.split(/\n/).length < 4) notas.push('estrutura insuficiente: poucas linhas');
    PLACEHOLDERS.forEach(rx => { if (rx.test(texto)) notas.push('marcador de preenchimento encontrado: ' + rx.source); });
    return { pronto: notas.length === 0, notas: notas.slice(0, 4), verificadoEm: Date.now() };
  }

  function contextoAcervo(e, baseArquivo, projectId) {
    if (!e) return 'nenhum';
    const relacionados = (e.arquivos || [])
      .filter(a => (!projectId || a.projectId === projectId) && (!baseArquivo || a.id !== baseArquivo.id))
      .slice(0, 4)
      .map(a => `${a.nome} [${a.classe}]: ${String(a.conteudo || '').slice(0, 700)}`);
    return relacionados.join('\n\n') || 'nenhum';
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
      base ? `ARTEFATO BASE QUE DEVE SER EVOLUÍDO (preserve o que funciona, não recomece do zero):\n${base.nome} [${base.tipo}]\n${String(base.conteudo || '').slice(0, 6000)}` : '',
      `ACERVO RELACIONADO (para continuidade, não copie):\n${contextoAcervo(e, base, projeto && projeto.id)}`,
      ``,
      `REGRAS DE PRODUÇÃO:`,
      `- Entregue o conteúdo integral do arquivo, sem resumo, sem comentários sobre o processo e sem pedir aprovação.`,
      `- Nada de texto de exemplo, lorem ipsum, TODO, colchetes para preencher ou dados inventados sobre o mundo real.`,
      `- Não invente clientes, vendas, métricas, datas ou aprovações. Hipóteses devem ser declaradas como hipóteses.`,
      `- Se estiver evoluindo o artefato base, entregue a versão nova completa, não um diff.`,
      ``,
      `RETORNE EXATAMENTE NESTE FORMATO:`,
      `ARQUIVO: <nome do arquivo com extensão>`,
      `TIPO: <md | html | txt | csv | json | js | css>`,
      `RESUMO: <uma frase sobre o que foi entregue>`,
      `PRONTO: sim | nao`,
      `---`,
      `<conteúdo integral do arquivo a partir daqui>`
    ].filter(Boolean).join('\n');

    const r = await S.ai.chamar({
      sistema,
      pedido: 'Produza agora o arquivo completo, no formato pedido. O conteúdo depois de --- é o arquivo, exatamente como será salvo.',
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
      conteudo = texto.split(/\n/).filter(l => !/^\s*(ARQUIVO|TIPO|RESUMO|PRONTO)\s*:/i.test(l)).join('\n').trim();
    }
    conteudo = conteudo.replace(/^```[a-z]*\n?|```$/gi, '').trim();
    if (conteudo.length < 80) throw new Error('A IA de produção não devolveu conteúdo utilizável.');

    const tipo = tipoValido(campos.tipo, kit);
    const nome = limparNome(campos.arquivo || (base ? base.nome : (op && op.titulo) || 'entrega'), tipo);
    const validacao = validar(conteudo);
    if (String(campos.pronto || '').toLowerCase() === 'nao' || campos.pronto === false) {
      validacao.pronto = false;
      validacao.notas = (validacao.notas || []).concat('o próprio autor declarou a entrega incompleta').slice(0, 5);
    }

    return {
      arquivos: [{ nome, tipo, conteudo }],
      resumo: String(campos.resumo || '').slice(0, 300),
      validacao,
      classe: 'candidato',
      kit,
      viaIA: true,
      linhagem: base ? base.linhagem : null,
      baseArquivoId: base ? base.id : null
    };
  }

  S.factory = { KITS, porId, produzir, validar };
})(window.S);
