/* ============================================================
   MERCADO — economia causal.
   Nenhuma venda, visita ou seguidor é sorteado nem inventado pela IA.
   Tudo sai de causas verificáveis: tempo de operação, composição real
   do portfólio publicado, qualidade aferida dos arquivos, capacidade
   da equipe e custos. Os parâmetros abaixo são hipóteses explícitas.
   ============================================================ */
(function (S) {
  'use strict';
  const { clamp } = S.util;

  const ECON = {
    capitalInicial: 8000,
    minutosPorSegundo: 1,          // 1 s real = 1 min de negócio → 1 dia = 24 min
    custoFixoHora: 2.2,
    salarioHora: { gerente: 16, criacao: 14, producao: 13, comercial: 12, dados: 14, geral: 11 },
    expediente: [8, 18],
    perfis: {
      software:  { preco: 59,  custo: 7,  capacidadeDia: 18 },
      ecommerce: { preco: 149, custo: 68, capacidadeDia: 7 },
      servico:   { preco: 380, custo: 78, capacidadeDia: 2.5 },
      conteudo:  { preco: 89,  custo: 16, capacidadeDia: 11 },
      produto:   { preco: 120, custo: 51, capacidadeDia: 8 },
      padrao:    { preco: 150, custo: 62, capacidadeDia: 5 }
    }
  };

  /* Cada tipo de entrega publicado mexe em um fator diferente do funil.
     É por isso que o portfólio importa: só páginas não vendem, só anúncios
     não convertem. A composição é lida dos arquivos, não de palavras soltas. */
  const EFEITO_KIT = {
    landing:    { alcance: 1.4, conversao: 0.30, reputacao: 0.6 },
    anuncios:   { alcance: 2.2, conversao: 0.10, reputacao: 0.2 },
    artigo:     { alcance: 1.6, conversao: 0.08, reputacao: 0.5 },
    emails:     { alcance: 0.5, conversao: 0.34, reputacao: 0.3 },
    catalogo:   { alcance: 0.4, conversao: 0.40, reputacao: 0.3 },
    marca:      { alcance: 0.6, conversao: 0.14, reputacao: 1.2 },
    proposta:   { alcance: 0.2, conversao: 0.44, reputacao: 0.4 },
    calendario: { alcance: 1.1, conversao: 0.06, reputacao: 0.2 },
    legado:     { alcance: 0.6, conversao: 0.10, reputacao: 0.2 }
  };

  function perfil(e) {
    const t = `${e && e.ramo || ''} ${e && e.missao || ''}`.toLowerCase();
    if (/software|saas|app|aplicativo|sistema|plataforma|tecnolog|automa/.test(t)) return Object.assign({ tipo: 'software' }, ECON.perfis.software);
    if (/loja|roupa|moda|comérc|comerc|e-?commerce|artesan|acess[óo]rio|joalh/.test(t)) return Object.assign({ tipo: 'ecommerce' }, ECON.perfis.ecommerce);
    if (/consult|ag[êe]ncia|marketing|design|advoc|contab|arquitet|serviç|servic|manuten/.test(t)) return Object.assign({ tipo: 'servico' }, ECON.perfis.servico);
    if (/curso|livro|conte[úu]do|m[íi]dia|newsletter|edit|jornal/.test(t)) return Object.assign({ tipo: 'conteudo' }, ECON.perfis.conteudo);
    if (/f[áa]brica|produ[çc][ãa]o|aliment|comida|cosm[ée]t|m[óo]vel|marcenaria|fundi/.test(t)) return Object.assign({ tipo: 'produto' }, ECON.perfis.produto);
    return Object.assign({ tipo: 'padrao' }, ECON.perfis.padrao);
  }

  function normalizar(e) {
    if (!e) return null;
    const p = perfil(e);
    if (!e.negocio || typeof e.negocio !== 'object') {
      e.negocio = {
        inicio: Date.now(), ultimaApuracao: Date.now(), minutos: 8 * 60,
        capitalInicial: ECON.capitalInicial, caixa: ECON.capitalInicial,
        receitaMercado: 0, receitaProdutos: 0, receitaContratos: 0, custoDireto: 0, despesaOperacional: 0,
        pedidos: 0, clientes: 0, visitas: 0, leads: 0,
        preco: p.preco, custoUnitario: p.custo, capacidadeDia: p.capacidadeDia,
        reputacao: 46, qualidade: 0, historico: []
      };
    }
    const n = e.negocio;
    const padroes = {
      inicio: Date.now(), ultimaApuracao: Date.now(), minutos: 8 * 60,
      capitalInicial: ECON.capitalInicial, caixa: ECON.capitalInicial,
      receitaMercado: 0, receitaProdutos: 0, receitaContratos: 0, custoDireto: 0, despesaOperacional: 0,
      pedidos: 0, clientes: 0, visitas: 0, leads: 0,
      preco: p.preco, custoUnitario: p.custo, capacidadeDia: p.capacidadeDia,
      reputacao: 46, qualidade: 0
    };
    Object.keys(padroes).forEach(k => { if (!Number.isFinite(n[k])) n[k] = padroes[k]; });
    if (!Array.isArray(n.historico)) n.historico = [];
    // compatibilidade com a base antiga, que só tinha "receita" e "custos"
    if (Number.isFinite(e.negocio.receita) && !n.receitaMercado) n.receitaMercado = e.negocio.receita;
    return n;
  }

  /* Presença de mercado: lida do portfólio publicado + qualidade aferida. */
  function presenca(e) {
    const publicados = (e.arquivos || []).filter(a => a.classe === 'produto');
    if (!publicados.length) return { oferta: false, alcance: 0, conversao: 0, reputacao: 0, qualidade: 0, kits: [] };
    let alcance = 0, conversao = 0, reput = 0;
    const kits = [];
    const jaContado = {};
    publicados.forEach(a => {
      const ef = EFEITO_KIT[a.kit] || EFEITO_KIT.legado;
      // O segundo arquivo do mesmo tipo rende metade; o terceiro, um quarto.
      const rep = jaContado[a.kit] = (jaContado[a.kit] || 0) + 1;
      const decaimento = 1 / rep;
      const fq = clamp(a.qualidade, 20, 100) / 100;
      alcance += ef.alcance * decaimento * fq;
      conversao += ef.conversao * decaimento * fq;
      reput += ef.reputacao * decaimento * fq;
      if (kits.indexOf(a.kit) < 0) kits.push(a.kit);
    });
    const media = publicados.reduce((s, a) => s + clamp(a.qualidade, 0, 100), 0) / publicados.length;
    return { oferta: true, alcance, conversao, reputacao: reput, qualidade: media, kits, itens: publicados.length };
  }

  function folhaPorHora(e) {
    return (e.equipe || []).reduce((soma, f) => {
      const chave = f.papel === 'gerente' ? 'gerente' : (f.especialidade || 'geral');
      return soma + (ECON.salarioHora[chave] || ECON.salarioHora.geral);
    }, 0);
  }

  /* Avança o relógio do negócio e apura o período. Retorna true se mudou algo. */
  function tick(e) {
    const n = normalizar(e); if (!n) return false;
    const agora = Date.now();
    const dt = clamp(agora - (n.ultimaApuracao || agora), 0, 5 * 60 * 1000);
    if (dt < 900) return false;
    n.ultimaApuracao = agora;

    const minutosAntes = n.minutos;
    const horasNegocio = dt / 1000 / 60;         // 60 s reais = 1 h de negócio
    n.minutos = minutosAntes + horasNegocio * 60;

    const p = presenca(e);
    n.qualidade = p.qualidade;
    let mudou = false;

    if (p.oferta) {
      const fatorReputacao = 0.7 + n.reputacao / 200;
      const visitasHora = p.alcance * 1.8 * fatorReputacao;
      const visitasNovas = Math.floor(horasNegocio * visitasHora);
      if (visitasNovas > 0) { n.visitas += visitasNovas; mudou = true; }

      const taxaLead = clamp(0.010 + p.conversao * 0.045, 0.004, 0.09);
      const leadsNovos = Math.floor(visitasNovas * taxaLead);
      n.leads += leadsNovos;

      const fechamento = clamp(0.10 + p.conversao * 0.14 + (n.qualidade / 100) * 0.08, 0.05, 0.38);
      const demanda = Math.floor(leadsNovos * fechamento);
      const capacidade = Math.floor(horasNegocio * (n.capacidadeDia / 24));
      const pedidos = Math.max(0, Math.min(capacidade, demanda));
      if (pedidos > 0) {
        n.pedidos += pedidos; n.clientes += pedidos;
        const receita = pedidos * n.preco;
        const custo = pedidos * n.custoUnitario;
        n.receitaMercado += receita; n.custoDireto += custo;
        n.caixa += receita - custo;
        n.reputacao = clamp(n.reputacao + pedidos * 0.09, 0, 92);
        S.state.registrar(`Mercado: ${pedidos} pedido(s) fechado(s) a partir de ${leadsNovos} lead(s) novo(s).`, 'ok');
        mudou = true;
      }
    }

    /* Folha e custo fixo só correm dentro do expediente simulado. */
    let horasExpediente = 0;
    const passos = Math.max(1, Math.min(720, Math.ceil(horasNegocio * 4)));
    for (let i = 0; i < passos; i++) {
      const minuto = minutosAntes + (i * horasNegocio * 60) / passos;
      const h = ((minuto / 60) % 24 + 24) % 24;
      if (h >= ECON.expediente[0] && h < ECON.expediente[1]) horasExpediente += horasNegocio / passos;
    }
    const opex = (ECON.custoFixoHora + folhaPorHora(e)) * horasExpediente;
    if (opex > 0) { n.despesaOperacional += opex; n.caixa -= opex; mudou = true; }

    /* Amostra do caixa para o gráfico — no máximo uma a cada 30 s. */
    const ultima = n.historico[n.historico.length - 1];
    if (!ultima || agora - ultima.t > 30000) {
      n.historico.push({ t: agora, caixa: Math.round(n.caixa), receita: Math.round(n.receitaMercado + n.receitaContratos) });
      if (n.historico.length > 60) n.historico.shift();
    }
    return mudou;
  }

  function relogio(e) {
    const n = normalizar(e); if (!n) return { dia: 1, hora: '08:00' };
    const min = Math.floor(n.minutos);
    return {
      dia: Math.floor(min / 1440) + 1,
      hora: String(Math.floor((min % 1440) / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'),
      expediente: (() => { const h = Math.floor((min % 1440) / 60); return h >= ECON.expediente[0] && h < ECON.expediente[1]; })()
    };
  }

  function creditar(e, valor, motivo) {
    const n = normalizar(e); if (!n) return;
    n.receitaContratos += Number(valor) || 0;
    n.caixa += Number(valor) || 0;
    S.state.registrar(`Recebido ${S.fmt.brl(valor)} — ${motivo}.`, 'ok');
    S.bus.emit('negocio');
  }
  function debitar(e, valor, motivo) {
    const n = normalizar(e); if (!n) return false;
    if (n.caixa < valor) return false;
    n.despesaOperacional += Number(valor) || 0;
    n.caixa -= Number(valor) || 0;
    S.state.registrar(`Pago ${S.fmt.brl(valor)} — ${motivo}.`, 'info');
    S.bus.emit('negocio');
    return true;
  }

  function indicadores(e) {
    const n = normalizar(e); if (!n) return null;
    const receita = n.receitaMercado + n.receitaContratos;
    const lucroBruto = receita - n.custoDireto;
    const lucroOperacional = lucroBruto - n.despesaOperacional;
    const horas = Math.max(1, (n.minutos - 8 * 60) / 60);
    const burnMes = (n.despesaOperacional / horas) * 730;
    const p = presenca(e);
    return {
      caixa: n.caixa, receita, receitaMercado: n.receitaMercado, receitaContratos: n.receitaContratos,
      custoDireto: n.custoDireto, opex: n.despesaOperacional,
      lucroBruto, lucroOperacional,
      margemBruta: receita > 0 ? (lucroBruto / receita) * 100 : 0,
      margemOperacional: receita > 0 ? (lucroOperacional / receita) * 100 : 0,
      ticket: n.pedidos > 0 ? n.receitaMercado / n.pedidos : 0,
      pedidos: Math.floor(n.pedidos), clientes: Math.floor(n.clientes),
      visitas: Math.floor(n.visitas), leads: Math.floor(n.leads),
      convVisitaLead: n.visitas > 0 ? (n.leads / n.visitas) * 100 : 0,
      convLeadPedido: n.leads > 0 ? (n.pedidos / n.leads) * 100 : 0,
      convTotal: n.visitas > 0 ? (n.pedidos / n.visitas) * 100 : 0,
      reputacao: n.reputacao, qualidade: n.qualidade,
      burnMes, runway: burnMes > 0 ? n.caixa / burnMes : Infinity,
      folhaHora: folhaPorHora(e), presenca: p,
      historico: n.historico
    };
  }

  S.market = { ECON, EFEITO_KIT, perfil, normalizar, presenca, tick, relogio, creditar, debitar, indicadores, folhaPorHora };
})(window.S);
