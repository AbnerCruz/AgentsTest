/* ============================================================
   IA — única porta de saída para a Groq.
   Princípio do projeto: economia de tokens. Toda chamada tem teto,
   contexto enxuto e formato de resposta fixo em linhas CHAVE: valor,
   que modelos pequenos acertam muito mais que JSON.
   ============================================================ */
(function (S) {
  'use strict';
  const { clamp, sleep } = S.util;

  /* Dois provedores possíveis, um ativo por vez. Ambos falam o formato
     OpenAI, então o corpo da requisição é idêntico: muda o endereço, a
     chave e os identificadores de modelo.

     A Groq suspendeu os upgrades para o tier Developer, e no tier
     gratuito existe teto diário de requisições. O OpenRouter não impõe
     limite de plataforma em modelos pagos e funciona com crédito
     pré-pago, sem cartão recorrente — é o caminho para rodar sem teto. */
  const PROVEDORES = {
    groq: {
      nome: 'Groq',
      rotulo: 'da Groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      prefixo: 'gsk_',
      regex: /^gsk_[A-Za-z0-9_-]{10,}$/,
      console: 'console.groq.com',
      nota: 'Rápida. No tier gratuito há teto diário de requisições, e os upgrades para Developer estão suspensos pela própria Groq.'
    },
    openrouter: {
      nome: 'OpenRouter',
      rotulo: 'do OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      prefixo: 'sk-or-',
      regex: /^sk-or-[A-Za-z0-9_-]{10,}$/,
      console: 'openrouter.ai/keys',
      nota: 'Sem teto diário e sem limite de plataforma nos modelos pagos. Crédito pré-pago a partir de US$ 5, que não expira e não vira assinatura.'
    }
  };
  const K_CHAVE = 'groq-api-key';        // mantém a chave da versão anterior
  const K_CHAVE_OR = 'openrouter-api-key';
  const K_CFG = 'estudio-ia-cfg';
  const K_USO = 'groq-usage-v1';

  const MODELOS_GROQ = [
    { id: 'openai/gpt-oss-20b', nome: 'GPT-OSS 20B · econômico', nota: '$0,075 entrada / $0,30 saída por 1M. 1000 t/s. Melhor escolha para planejamento, coordenação e revisão simples.' },
    { id: 'openai/gpt-oss-120b', nome: 'GPT-OSS 120B · produção', nota: '$0,15 entrada / $0,60 saída por 1M. 500 t/s. Melhor escolha para criar produtos finais complexos.' },
    { id: 'qwen/qwen3.8-27b', nome: 'Qwen 3.8 27B · raciocínio', nota: '$0,80 entrada / $4,00 saída por 1M. Mais caro; útil como alternativa de raciocínio/revisão.' },
    { id: 'qwen/qwen3.6-27b', nome: 'Qwen 3.6 27B · raciocínio', nota: '$0,60 entrada / $3,00 saída por 1M. Alternativa de raciocínio, não recomendada para chamadas frequentes.' },
    { id: 'openai/gpt-oss-safeguard-20b', nome: 'GPT-OSS Safeguard 20B · segurança', nota: '$0,075 entrada / $0,30 saída por 1M. Especializado em classificação de segurança; não é a escolha principal para produção.' }
  ];

  /* No OpenRouter os mesmos modelos abertos saem mais baratos, porque o
     preço é repassado do provedor de origem sem markup. */
  const MODELOS_OPENROUTER = [
    { id: 'openai/gpt-oss-20b', nome: 'GPT-OSS 20B · econômico', nota: '~$0,03 entrada / $0,15 saída por 1M. Melhor escolha para planejamento, coordenação e revisão.' },
    { id: 'openai/gpt-oss-120b', nome: 'GPT-OSS 120B · produção', nota: '~$0,036 entrada / $0,18 saída por 1M. Bem mais barato que na Groq; use para o produto final.' },
    { id: 'deepseek/deepseek-chat', nome: 'DeepSeek Chat · alternativa', nota: 'Barato e forte em texto longo. Alternativa de produção.' },
    { id: 'qwen/qwen3-32b', nome: 'Qwen3 32B · raciocínio', nota: 'Alternativa de raciocínio e revisão.' },
    { id: 'meta-llama/llama-3.3-70b-instruct', nome: 'Llama 3.3 70B · geral', nota: 'Modelo geral robusto, preço médio.' }
  ];

  /* Preço por 1M de tokens, em dólar, na tabela on-demand. No tier
     Developer a Groq aplica 25% de desconto sobre esses valores. */
  const PRECOS_POR_PROVEDOR = {
    groq: {
      'openai/gpt-oss-20b': { entrada: 0.075, saida: 0.30 },
      'openai/gpt-oss-120b': { entrada: 0.15, saida: 0.60 },
      'qwen/qwen3.8-27b': { entrada: 0.80, saida: 4.00 },
      'qwen/qwen3.6-27b': { entrada: 0.60, saida: 3.00 },
      'openai/gpt-oss-safeguard-20b': { entrada: 0.075, saida: 0.30 }
    },
    openrouter: {
      'openai/gpt-oss-20b': { entrada: 0.03, saida: 0.15 },
      'openai/gpt-oss-120b': { entrada: 0.036, saida: 0.18 },
      'deepseek/deepseek-chat': { entrada: 0.14, saida: 0.28 },
      'qwen/qwen3-32b': { entrada: 0.10, saida: 0.30 },
      'meta-llama/llama-3.3-70b-instruct': { entrada: 0.12, saida: 0.30 }
    }
  };
  const DESCONTO_DEV = 0.75;

  /* A Groq decomissionou os antigos Llama (llama-3.1-8b-instant e
     llama-3.3-70b-versatile) em 16/08/2026 para conta gratuita/dev.
     Quem tinha um desses salvos no aparelho é migrado automaticamente
     para o substituto recomendado pela própria Groq. */
  const MODELOS_MIGRADOS = {
    'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
    'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
    'llama3-70b-8192': 'openai/gpt-oss-120b',
    'gemma2-9b-it': 'openai/gpt-oss-20b',
    'qwen/qwen3-32b': 'openai/gpt-oss-120b',
    'meta-llama/llama-4-scout-17b-16e-instruct': 'qwen/qwen3.6-27b',
    'meta-llama/llama-4-maverick-17b-128e-instruct': 'openai/gpt-oss-120b',
    'mistral-saba-24b': 'qwen/qwen3.6-27b',
    'qwen-qwq-32b': 'qwen/qwen3.6-27b'
  };
  const MODELOS_DE = p => (p === 'openrouter' ? MODELOS_OPENROUTER : MODELOS_GROQ);

  /* A migração de modelo depende da lista do provedor, então a lista e a
     configuração precisam existir antes de qualquer chamada a
     migrarModelo — daí a ordem: MODELOS_DE, cfg, migração. */
  const cfg = Object.assign(
    { provedor: 'groq', tier: 'free', decisao: 'openai/gpt-oss-20b', producao: 'openai/gpt-oss-120b', revisao: 'openai/gpt-oss-20b' },
    S.local.json(K_CFG, {})
  );
  if (!PROVEDORES[cfg.provedor]) cfg.provedor = 'groq';

  function migrarModelo(id) {
    const lista = MODELOS_DE(cfg.provedor);
    if (lista.some(m => m.id === id)) return id;
    return MODELOS_MIGRADOS[id] || lista[0].id;
  }

  cfg.decisao = migrarModelo(cfg.decisao);
  cfg.producao = migrarModelo(cfg.producao);
  cfg.revisao = migrarModelo(cfg.revisao);
  S.local.setJson(K_CFG, cfg);

  /* Cada provedor guarda a própria chave: trocar de um para outro e
     voltar não faz o usuário recolar nada. */
  const chaves = {
    groq: S.local.get(K_CHAVE, '') || '',
    openrouter: S.local.get(K_CHAVE_OR, '') || ''
  };
  const prov = () => PROVEDORES[cfg.provedor];


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
    ultimo429: 0,
    esperaAtual: 0,
    ultimaAutonoma: 0,
    chamadas: []          // histórico curto para a aba Motor
  };

  function situar(situacao, mensagem, detalhe) {
    estado.situacao = situacao;
    estado.mensagem = mensagem;
    if (detalhe !== undefined) estado.detalhe = detalhe;
    S.bus.emit('ia');
  }

  const chave = () => chaves[cfg.provedor];
  function pronta() { return Boolean(chave()) && !estado.pausado; }
  function disponivel() {
    return pronta() && Date.now() >= estado.bloqueadaAte && estado.emVoo === 0;
  }
  /* A autonomia não possui um cronômetro artificial.
     A equipe pode agir sempre que houver uma decisão ou trabalho real.
     O próprio estado emVoo impede chamadas simultâneas; o ciclo operacional
     continua sendo o responsável por não duplicar trabalho. */
  function reservarAutonomia() {
    if (!disponivel()) return false;
    estado.ultimaAutonoma = Date.now();
    return true;
  }
  function faltaParaAutonomia() { return 0; }

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

  /* Quanto falta até a Groq aceitar de novo, lido da própria resposta.
     Esperar o tempo certo é o que diferencia "a equipe retoma sozinha"
     de "a equipe fica batendo na porta e tomando 429". */
  function esperaDaGroq(resp, dados) {
    const h = n => { try { return resp.headers.get(n); } catch (e) { return null; } };
    const cands = [h('retry-after'), h('x-ratelimit-reset-tokens'), h('x-ratelimit-reset-requests')]
      .map(v => msDeHeader(v)).filter(v => Number.isFinite(v) && v > 0);
    if (cands.length) return Math.min(6 * 36e5, Math.max(5e3, Math.max.apply(null, cands)));
    const txt = String((dados && dados.error && dados.error.message) || '');
    const m = txt.match(/(\d+(?:\.\d+)?)\s*(ms|s|m|h)\b/i);
    const ms = m ? msDeHeader(m[0]) : null;
    return Number.isFinite(ms) && ms > 0 ? Math.max(5e3, ms) : 60e3;
  }

  /* ---------- chamada ---------- */
  async function chamar(op) {
    const { sistema, pedido, agente, motivo } = op;
    const tipo = op.tipo === 'conteudo' ? 'conteudo' : 'decisao';
    if (!chave()) throw new Error(`Nenhuma chave ${prov().rotulo} configurada.`);
    if (estado.pausado && !op.forcar) throw new Error('A equipe está pausada.');
    if (Date.now() < estado.bloqueadaAte && !op.forcar) {
      throw new Error(`Motor em espera por ${Math.ceil((estado.bloqueadaAte - Date.now()) / 1000)}s após uma falha.`);
    }
    const q = usoHoje();
    const modelo = tipo === 'conteudo' ? cfg.producao : (tipo === 'revisao' ? cfg.revisao : cfg.decisao);
    const teto = clamp(op.tokens || (tipo === 'conteudo' ? 1700 : tipo === 'revisao' ? 420 : 360), 120, tipo === 'conteudo' ? 3600 : 1000);
    // GPT-OSS na Groq responde melhor com tudo no papel "user".
    const mensagens = [{ role: 'user', content: String(sistema || '').slice(0, 4500) + '\n\n' + String(pedido || '').slice(0, 4500) }];

    estado.emVoo++;
    situar('ocupada', 'IA trabalhando', `${modelo} · ${motivo || 'chamada'}`);
    const inicio = Date.now();
    try {
      const resp = await fetch(prov().url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + chave() },
        body: JSON.stringify({
          model: modelo, messages: mensagens,
          max_completion_tokens: teto, temperature: tipo === 'conteudo' ? 0.55 : 0.2,
          stream: false, reasoning_effort: tipo === 'conteudo' ? 'medium' : 'low'
        })
      });
      let dados = null;
      try { dados = await resp.json(); } catch (e) {}
      lerHeaders(resp);
      const ms = Date.now() - inicio;
      // Só contabiliza o que a Groq realmente processou e devolveu como uso —
      // uma resposta de erro não deve inflar o total gasto.
      if (resp.ok && dados && dados.usage) contabilizar(modelo, dados, ms);

      if (!resp.ok) {
        const msg = (dados && dados.error && dados.error.message) || `${prov().nome} respondeu HTTP ${resp.status}.`;
        if (resp.status === 401) throw new Error(`Chave ${prov().rotulo} inválida ou expirada.`);
        if (resp.status === 429) {
          // A espera vem do cabeçalho da resposta, não de um chute. O ciclo
          // do estúdio volta sozinho quando a janela reabre.
          const espera = esperaDaGroq(resp, dados);
          estado.bloqueadaAte = Date.now() + espera;
          estado.ultimo429 = Date.now();
          estado.esperaAtual = espera;
          const e429 = new Error(`Limite ${prov().rotulo} atingido. A equipe retoma em ${Math.ceil(espera / 1000)}s.`);
          e429.cota = true;
          throw e429;
        }
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
      if (err && err.cota) {
        // bloqueadaAte já foi definido com o tempo real devolvido pela Groq.
      } else {
        estado.bloqueadaAte = Date.now() + (/401|inválida/i.test(msg) ? 90000 : Math.min(40000, 6000 * estado.falhas));
      }
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
    if (!chave()) throw new Error('Informe a chave antes de testar.');
    const r = await chamar({
      sistema: 'Responda exatamente com a linha abaixo, sem mais nada.',
      pedido: 'STATUS: ok', tokens: 60, motivo: 'teste de conexão', forcar: true, agente: 'você'
    });
    return r.texto.slice(0, 80);
  }

  /* novaChave === undefined significa "mantenha a que já está salva".
     String vazia significa "remova". Sem essa distinção, salvar só para
     trocar o ritmo apagaria a chave do usuário. */
  function salvarCfg(novaChave, decisao, producao, ritmo, revisao) {
    if (novaChave !== undefined) {
      const k = String(novaChave).trim();
      if (k && !prov().regex.test(k)) throw new Error(`A chave ${prov().rotulo} começa com ${prov().prefixo} e é bem mais longa. Confira o que foi colado.`);
      chaves[cfg.provedor] = k;
    }
    const lista = MODELOS_DE(cfg.provedor);
    if (lista.some(m => m.id === decisao)) cfg.decisao = decisao;
    if (lista.some(m => m.id === producao)) cfg.producao = producao;
    if (lista.some(m => m.id === revisao)) cfg.revisao = revisao;
    const kk = cfg.provedor === 'openrouter' ? K_CHAVE_OR : K_CHAVE;
    if (chave()) S.local.set(kk, chave()); else S.local.del(kk);
    S.local.setJson(K_CFG, cfg);
    estado.bloqueadaAte = 0; estado.falhas = 0;
    situar(chave() ? 'pronta' : 'off', chave() ? 'IA pronta' : 'IA desligada', chave() ? `configuração salva · ${prov().nome}` : 'sem chave');
  }

  /* Custo do dia em dólar, calculado sobre o que a Groq contabilizou.
     É estimativa de acompanhamento, não fatura. */
  function custoDoDia() {
    const q = usoHoje();
    let total = 0, temPreco = false;
    Object.keys(q.porModelo || {}).forEach(id => {
      const p = (PRECOS_POR_PROVEDOR[cfg.provedor] || {})[id];
      if (!p) return;
      temPreco = true;
      const m = q.porModelo[id];
      // Sem separação por modelo de entrada/saída, usa a proporção do dia.
      const prop = q.tokens > 0 ? q.entrada / q.tokens : 0.7;
      const ent = (m.tokens || 0) * prop, sai = (m.tokens || 0) * (1 - prop);
      total += (ent / 1e6) * p.entrada + (sai / 1e6) * p.saida;
    });
    if (!temPreco) return null;
    return (cfg.provedor === 'groq' && cfg.tier === 'dev') ? total * DESCONTO_DEV : total;
  }

  function orcamento() {
    const q = usoHoje();
    const h = q.headers;
    const temTok = h && Number.isFinite(h.limiteTok) && h.limiteTok > 0;
    const temReq = h && Number.isFinite(h.limiteReq) && h.limiteReq > 0;
    // Nunca inventa uma cota local. Antes da primeira resposta, ainda não
    // sabemos a janela real da organização; depois dela, usamos os headers da Groq.
    const pctTokens = temTok ? clamp(((h.limiteTok - (Number.isFinite(h.restaTok) ? h.restaTok : h.limiteTok)) / h.limiteTok) * 100, 0, 100) : null;
    const pctReq = temReq ? clamp(((h.limiteReq - (Number.isFinite(h.restaReq) ? h.restaReq : h.limiteReq)) / h.limiteReq) * 100, 0, 100) : null;
    return {
      requisicoes: q.requisicoes, tokens: q.tokens, entrada: q.entrada, saida: q.saida,
      pctTokens, pctReq, fonte: (temTok || temReq) ? 'groq' : 'aguardando headers', provedor: cfg.provedor,
      ref: null, headers: h, porModelo: q.porModelo,
      custo: custoDoDia(), tier: cfg.tier
    };
  }

  S.ai = {
    get MODELOS() { return MODELOS_DE(cfg.provedor); },
    PROVEDORES,
    definirProvedor(p) {
      if (!PROVEDORES[p] || p === cfg.provedor) return;
      cfg.provedor = p;
      // Modelos são identificados de forma diferente em cada provedor:
      // ao trocar, cai no padrão da nova lista em vez de mandar um id inválido.
      const lista = MODELOS_DE(p);
      cfg.decisao = lista[0].id;
      cfg.producao = (lista[1] || lista[0]).id;
      cfg.revisao = lista[0].id;
      S.local.setJson(K_CFG, cfg);
      estado.bloqueadaAte = 0; estado.falhas = 0; estado.ultimo429 = 0;
      situar(chave() ? 'pronta' : 'off', chave() ? 'IA pronta' : 'IA desligada',
        chave() ? `usando ${PROVEDORES[p].nome}` : `informe a chave ${PROVEDORES[p].rotulo}`);
    },
    provedorAtual: () => cfg.provedor, cfg, estado, chamar, perguntar, campos, corpo, testar, salvarCfg,
    orcamento, pronta, disponivel, PRECOS_POR_PROVEDOR,
    definirTier(v) {
      cfg.tier = v === 'dev' ? 'dev' : 'free';
      S.local.setJson(K_CFG, cfg);
      S.bus.emit('ia');
    }, reservarAutonomia, faltaParaAutonomia, msDeHeader,
    temChave: () => Boolean(chave()),
    chaveMascarada: () => (chave() ? chave().slice(0, 7) + '••••••' + chave().slice(-4) : ''),
    pausar(v) { estado.pausado = Boolean(v); situar(estado.pausado ? 'off' : (chave() ? 'pronta' : 'off'), estado.pausado ? 'Equipe pausada' : (chave() ? 'IA pronta' : 'IA desligada')); },
    iniciar() { if (chave()) situar('pronta', 'IA pronta', `chave ${prov().rotulo} carregada deste aparelho`); }
  };
  void sleep;
})(window.S);
