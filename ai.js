/* ============================================================
   IA — única porta de saída para a Groq.
   Princípio do projeto: economia de tokens. Toda chamada tem teto,
   contexto enxuto e formato de resposta fixo em linhas CHAVE: valor,
   que modelos pequenos acertam muito mais que JSON.
   ============================================================ */
(function (S) {
  'use strict';
  const { clamp, sleep } = S.util;

  const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
  const K_CHAVE = 'groq-api-key';        // mantém a chave da versão anterior
  const K_CFG = 'estudio-ia-cfg';
  const K_USO = 'groq-usage-v1';

  const MODELOS = [
    { id: 'llama-3.1-8b-instant', nome: 'Llama 3.1 8B · instantâneo', nota: 'O mais barato. Bom para decisões curtas.' },
    { id: 'openai/gpt-oss-20b', nome: 'GPT-OSS 20B · rápido', nota: 'Equilíbrio entre custo e texto decente.' },
    { id: 'llama-3.3-70b-versatile', nome: 'Llama 3.3 70B · versátil', nota: 'Escreve bem, custa mais por chamada.' },
    { id: 'openai/gpt-oss-120b', nome: 'GPT-OSS 120B · forte', nota: 'Melhor redação. Reserve para produção.' }
  ];

  const RITMOS = {
    economico: { intervalo: 10 * 60 * 1000, rotulo: 'econômico' },
    normal:    { intervalo: 5 * 60 * 1000,  rotulo: 'normal' },
    intenso:   { intervalo: 2 * 60 * 1000,  rotulo: 'intenso' }
  };

  const REF_DIARIA = { requisicoes: 1000, tokens: 200000 };

  const cfg = Object.assign(
    { decisao: 'llama-3.1-8b-instant', producao: 'openai/gpt-oss-20b', ritmo: 'normal' },
    S.local.json(K_CFG, {})
  );
  let chave = S.local.get(K_CHAVE, '') || '';

  let uso = Object.assign(
    { dia: '', requisicoes: 0, entrada: 0, saida: 0, tokens: 0, headers: null, porModelo: {} },
    S.local.json(K_USO, {})
  );
  function usoHoje() {
    const d = new Date().toISOString().slice(0, 10);
    if (uso.dia !== d) {
      uso = { dia: d, requisicoes: 0, entrada: 0, saida: 0, tokens: 0, headers: null, porModelo: {} };
      salvarUso();
    }
    return uso;
  }
  function salvarUso() { S.local.setJson(K_USO, uso); }

  /* ---------- estado do motor ---------- */
  const estado = {
    situacao: 'off',      // off | pronta | ocupada | erro
    mensagem: 'IA desligada',
    detalhe: '',
    pausado: false,
    emVoo: 0,
    bloqueadaAte: 0,
    falhas: 0,
    ultimaAutonoma: 0,
    chamadas: []          // histórico curto para a aba Motor
  };

  function situar(situacao, mensagem, detalhe) {
    estado.situacao = situacao;
    estado.mensagem = mensagem;
    if (detalhe !== undefined) estado.detalhe = detalhe;
    S.bus.emit('ia');
  }

  function pronta() { return Boolean(chave) && !estado.pausado; }
  function disponivel() {
    return pronta() && Date.now() >= estado.bloqueadaAte && estado.emVoo === 0;
  }
  /* A autonomia da equipe é limitada pelo ritmo escolhido. Pedidos feitos
     pelo usuário não passam por aqui — eles têm prioridade. */
  function reservarAutonomia() {
    const intervalo = (RITMOS[cfg.ritmo] || RITMOS.normal).intervalo;
    if (Date.now() - estado.ultimaAutonoma < intervalo) return false;
    estado.ultimaAutonoma = Date.now();
    return true;
  }
  function faltaParaAutonomia() {
    const intervalo = (RITMOS[cfg.ritmo] || RITMOS.normal).intervalo;
    return Math.max(0, intervalo - (Date.now() - estado.ultimaAutonoma));
  }

  /* ---------- cota real, lida dos headers da resposta ---------- */
  function msDeHeader(v) {
    const s = String(v || '').trim(); if (!s) return null;
    let total = 0, achou = false;
    const re = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/gi; let m;
    while ((m = re.exec(s))) {
      achou = true;
      const n = Number(m[1]), u = m[2].toLowerCase();
      total += u === 'ms' ? n : u === 's' ? n * 1e3 : u === 'm' ? n * 6e4 : u === 'h' ? n * 36e5 : n * 864e5;
    }
    if (achou) return Math.max(0, total);
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  function lerHeaders(resp) {
    const h = n => resp.headers.get(n);
    const q = usoHoje();
    q.headers = {
      limiteReq: Number(h('x-ratelimit-limit-requests')) || null,
      restaReq: Number(h('x-ratelimit-remaining-requests')),
      resetReq: msDeHeader(h('x-ratelimit-reset-requests')),
      limiteTok: Number(h('x-ratelimit-limit-tokens')) || null,
      restaTok: Number(h('x-ratelimit-remaining-tokens')),
      resetTok: msDeHeader(h('x-ratelimit-reset-tokens')),
      retryAfter: h('retry-after') || null,
      em: Date.now()
    };
    if (!Number.isFinite(q.headers.restaReq)) q.headers.restaReq = null;
    if (!Number.isFinite(q.headers.restaTok)) q.headers.restaTok = null;
    salvarUso();
  }
  function contabilizar(modelo, dados, ms) {
    const q = usoHoje();
    const u = (dados && dados.usage) || {};
    q.requisicoes += 1;
    q.entrada += Number(u.prompt_tokens || 0);
    q.saida += Number(u.completion_tokens || 0);
    q.tokens += Number(u.total_tokens || (u.prompt_tokens || 0) + (u.completion_tokens || 0));
    const m = q.porModelo[modelo] = q.porModelo[modelo] || { requisicoes: 0, tokens: 0 };
    m.requisicoes += 1; m.tokens += Number(u.total_tokens || 0);
    q.ultimoModelo = modelo;
    salvarUso();

    const e = S.state.atual();
    if (e) {
      e.uso.chamadas += 1;
      e.uso.ms += ms || 0;
      e.uso.tokens += Number(u.total_tokens || 0);
      e.uso.entrada += Number(u.prompt_tokens || 0);
      e.uso.saida += Number(u.completion_tokens || 0);
      S.state.gravar();
    }
  }

  function registrarChamada(reg) {
    estado.chamadas.unshift(reg);
    if (estado.chamadas.length > 24) estado.chamadas.pop();
    S.bus.emit('ia');
  }

  /* ---------- chamada ---------- */
  async function chamar(op) {
    const { sistema, pedido, agente, motivo } = op;
    const tipo = op.tipo === 'conteudo' ? 'conteudo' : 'decisao';
    if (!chave) throw new Error('Nenhuma chave da Groq configurada.');
    if (estado.pausado && !op.forcar) throw new Error('A equipe está pausada.');
    if (Date.now() < estado.bloqueadaAte && !op.forcar) {
      throw new Error(`Motor em espera por ${Math.ceil((estado.bloqueadaAte - Date.now()) / 1000)}s após uma falha.`);
    }
    const q = usoHoje();
    if (q.requisicoes >= REF_DIARIA.requisicoes) throw new Error('Referência diária local de requisições atingida.');

    const modelo = tipo === 'conteudo' ? cfg.producao : cfg.decisao;
    const teto = clamp(op.tokens || (tipo === 'conteudo' ? 1400 : 320), 120, tipo === 'conteudo' ? 3000 : 900);
    // GPT-OSS na Groq responde melhor com tudo no papel "user".
    const mensagens = [{ role: 'user', content: String(sistema || '').slice(0, 4500) + '\n\n' + String(pedido || '').slice(0, 4500) }];

    estado.emVoo++;
    situar('ocupada', 'IA trabalhando', `${modelo} · ${motivo || 'chamada'}`);
    const inicio = Date.now();
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + chave },
        body: JSON.stringify({
          model: modelo, messages: mensagens,
          max_completion_tokens: teto, temperature: tipo === 'conteudo' ? 0.6 : 0.3,
          stream: false, reasoning_effort: 'low'
        })
      });
      let dados = null;
      try { dados = await resp.json(); } catch (e) {}
      lerHeaders(resp);
      const ms = Date.now() - inicio;
      if (dados && dados.usage) contabilizar(modelo, dados, ms);

      if (!resp.ok) {
        const msg = (dados && dados.error && dados.error.message) || `A Groq respondeu HTTP ${resp.status}.`;
        if (resp.status === 401) throw new Error('Chave da Groq inválida ou expirada.');
        if (resp.status === 429) throw new Error('Limite da Groq atingido. Aguarde alguns instantes.');
        throw new Error(msg);
      }
      const escolha = (dados.choices || [])[0] || {};
      const texto = String((escolha.message && escolha.message.content) || escolha.text || '').trim();
      if (!texto) throw new Error(`A Groq não devolveu texto (finish_reason=${escolha.finish_reason || '?'}).`);

      estado.falhas = 0; estado.bloqueadaAte = 0;
      registrarChamada({ quem: agente || 'estúdio', motivo: motivo || tipo, modelo, ms, ok: true, tokens: (dados.usage || {}).total_tokens || 0, em: Date.now() });
      situar('pronta', 'IA pronta', `respondeu em ${(ms / 1000).toFixed(1)}s`);
      return { texto, usage: dados.usage || {}, ms, modelo };
    } catch (err) {
      const msg = String(err && err.message || err);
      estado.falhas++;
      estado.bloqueadaAte = Date.now() + (/429|Limite/i.test(msg) ? 45000 : /401|inválida/i.test(msg) ? 90000 : Math.min(40000, 6000 * estado.falhas));
      registrarChamada({ quem: agente || 'estúdio', motivo: motivo || tipo, modelo, ms: Date.now() - inicio, ok: false, erro: msg, em: Date.now() });
      situar('erro', 'Falha na IA', msg);
      throw err;
    } finally {
      estado.emVoo = Math.max(0, estado.emVoo - 1);
      S.bus.emit('ia');
    }
  }

  /* ---------- leitura de resposta em linhas CHAVE: valor ---------- */
  function campos(texto) {
    const saida = {};
    String(texto || '').replace(/```[a-z]*|```/gi, '').split(/\n+/).forEach(linha => {
      const m = linha.match(/^\s*[-*]?\s*([A-Za-zÀ-ú0-9_ ]{2,28}?)\s*[:=]\s*([\s\S]+)$/);
      if (!m) return;
      const k = m[1].trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
      let v = m[2].trim().replace(/^["'<]+|["'>]+$/g, '').trim();
      const b = v.toLowerCase();
      if (b === 'sim' || b === 'true') v = true;
      else if (b === 'nao' || b === 'não' || b === 'false') v = false;
      saida[k] = v;
    });
    return saida;
  }
  /* Conteúdo longo não vem em campos: vem depois de uma linha "---". */
  function corpo(texto) {
    const t = String(texto || '').replace(/```[a-z]*|```/gi, '');
    const corte = t.indexOf('\n---');
    return corte >= 0 ? t.slice(corte + 4).replace(/^\n+/, '').trim() : '';
  }

  async function perguntar(op) {
    try {
      const r = await chamar(op);
      return { campos: campos(r.texto), corpo: corpo(r.texto), texto: r.texto };
    } catch (e) {
      return null;
    }
  }

  async function testar() {
    if (!chave) throw new Error('Informe a chave antes de testar.');
    const r = await chamar({
      sistema: 'Responda exatamente com a linha abaixo, sem mais nada.',
      pedido: 'STATUS: ok', tokens: 60, motivo: 'teste de conexão', forcar: true, agente: 'você'
    });
    return r.texto.slice(0, 80);
  }

  /* novaChave === undefined significa "mantenha a que já está salva".
     String vazia significa "remova". Sem essa distinção, salvar só para
     trocar o ritmo apagaria a chave do usuário. */
  function salvarCfg(novaChave, decisao, producao, ritmo) {
    if (novaChave !== undefined) {
      const k = String(novaChave).trim();
      if (k && !/^gsk_[A-Za-z0-9_-]{10,}$/.test(k)) throw new Error('A chave da Groq começa com gsk_ e é bem mais longa. Confira o que foi colado.');
      chave = k;
    }
    if (MODELOS.some(m => m.id === decisao)) cfg.decisao = decisao;
    if (MODELOS.some(m => m.id === producao)) cfg.producao = producao;
    if (RITMOS[ritmo]) cfg.ritmo = ritmo;
    if (chave) S.local.set(K_CHAVE, chave); else S.local.del(K_CHAVE);
    S.local.setJson(K_CFG, cfg);
    estado.bloqueadaAte = 0; estado.falhas = 0;
    situar(chave ? 'pronta' : 'off', chave ? 'IA pronta' : 'IA desligada', chave ? 'configuração salva' : 'sem chave');
  }

  function orcamento() {
    const q = usoHoje();
    return {
      requisicoes: q.requisicoes, tokens: q.tokens, entrada: q.entrada, saida: q.saida,
      pctTokens: clamp((q.tokens / REF_DIARIA.tokens) * 100, 0, 100),
      pctReq: clamp((q.requisicoes / REF_DIARIA.requisicoes) * 100, 0, 100),
      ref: REF_DIARIA, headers: q.headers, porModelo: q.porModelo
    };
  }

  S.ai = {
    MODELOS, RITMOS, cfg, estado, chamar, perguntar, campos, corpo, testar, salvarCfg,
    orcamento, pronta, disponivel, reservarAutonomia, faltaParaAutonomia, msDeHeader,
    temChave: () => Boolean(chave),
    chaveMascarada: () => (chave ? chave.slice(0, 7) + '••••••' + chave.slice(-4) : ''),
    pausar(v) { estado.pausado = Boolean(v); situar(estado.pausado ? 'off' : (chave ? 'pronta' : 'off'), estado.pausado ? 'Equipe pausada' : (chave ? 'IA pronta' : 'IA desligada')); },
    iniciar() { if (chave) situar('pronta', 'IA pronta', 'chave carregada deste aparelho'); }
  };
  void sleep;
})(window.S);
