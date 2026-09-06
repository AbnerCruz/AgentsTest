/* ============================================================
   IA — porta única para o provedor configurado.
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
  const K_OR_MGMT = 'openrouter-management-key';
  const K_CFG = 'estudio-ia-cfg';
  const K_USO = 'estudio-ia-usage-v3';
  const K_ORCAMENTO = 'estudio-ia-budget-v1';

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
    { provedor: 'groq', roteamento: 'automatico', tier: 'free', providerSelecionadoEm: 0,
      pensamento: 'openai/gpt-oss-20b', producao: 'openai/gpt-oss-120b', limiteTokensDia: 120000,
      orcamentoUSD: 3, periodoDias: 30, limiteDiarioUSD: 0.10, diarioAutomatico: true, modoOrcamento: 'normal', margemSegurancaUSD: 0 },
    S.local.json(K_CFG, {})
  );
  if (!PROVEDORES[cfg.provedor]) cfg.provedor = 'groq';
  cfg.roteamento = cfg.roteamento === 'manual' ? 'manual' : 'automatico';

  function migrarModelo(id) {
    const lista = MODELOS_DE(cfg.provedor);
    if (lista.some(m => m.id === id)) return id;
    return MODELOS_MIGRADOS[id] || lista[0].id;
  }
  cfg.pensamento = migrarModelo(cfg.pensamento || cfg.decisao || cfg.revisao);
  cfg.producao = migrarModelo(cfg.producao);
  cfg.limiteTokensDia = Math.max(30000, Math.min(500000, Number(cfg.limiteTokensDia) || 120000));
  cfg.orcamentoUSD = Math.max(0.10, Math.min(1000, Number(cfg.orcamentoUSD) || 3));
  cfg.periodoDias = 30;
  cfg.limiteDiarioUSD = Math.max(0.01, Math.min(100, Number(cfg.limiteDiarioUSD) || cfg.orcamentoUSD / 30));
  cfg.diarioAutomatico = cfg.diarioAutomatico !== false;
  cfg.modoOrcamento = cfg.modoOrcamento === 'intensivo' ? 'intensivo' : 'normal';
  cfg.margemSegurancaUSD = 0;
  delete cfg.decisao; delete cfg.revisao; delete cfg.maestro;
  S.local.setJson(K_CFG, cfg);

  /* Cada provedor guarda a própria chave: trocar de um para outro e
     voltar não faz o usuário recolar nada. */
  const chaves = {
    groq: S.local.get(K_CHAVE, '') || '',
    openrouter: S.local.get(K_CHAVE_OR, '') || ''
  };
  let openRouterManagementKey = S.local.get(K_OR_MGMT, '') || '';
  let openRouterCreditsTimer = null;
  const prov = () => PROVEDORES[cfg.provedor];


  let uso = Object.assign(
    { dia: '', requisicoes: 0, entrada: 0, saida: 0, tokens: 0, headers: null, porModelo: {}, limiteUSD: 0 },
    S.local.json(K_USO, {})
  );
  let periodo = Object.assign(
    { inicio: Date.now(), dias: 30, limiteUSD: cfg.orcamentoUSD, margemUSD: 0, gastoUSD: 0, requisicoes: 0, tokens: 0, porModelo: {} },
    S.local.json(K_ORCAMENTO, {})
  );
  function salvarPeriodo(){ S.local.setJson(K_ORCAMENTO, periodo); }
  function renovarPeriodoSeNecessario(){
    const inicio = Number(periodo.inicio) || 0;
    const dias = Number(periodo.dias) || 30;
    if (!inicio || Date.now() - inicio >= dias * 86400000) {
      periodo = { inicio: Date.now(), dias: 30, limiteUSD: cfg.orcamentoUSD, margemUSD: 0, gastoUSD: 0, requisicoes: 0, tokens: 0, porModelo: {} };
      salvarPeriodo();
      uso.dia = '';
    } else {
      const novoLimite = Math.max(0.10, Number(cfg.orcamentoUSD) || Number(periodo.limiteUSD) || 3);
      if (periodo.dias !== 30 || periodo.limiteUSD !== novoLimite || Number(periodo.margemUSD||0) !== 0) {
        periodo.dias = 30; periodo.limiteUSD = novoLimite; periodo.margemUSD = 0; salvarPeriodo();
      }
    }
    return periodo;
  }
  renovarPeriodoSeNecessario();
  function preco(modelo, provedor){
    return ((PRECOS_POR_PROVEDOR[provedor || cfg.provedor] || {})[modelo]) || null;
  }
  function estimarCusto(provedor, modelo, promptTokens, completionTokens){
    if (provedor==='groq' && cfg.tier==='free') return 0;
    const p=preco(modelo, provedor); if(!p) return 0;
    const base=(Number(promptTokens)||0)/1e6*p.entrada + (Number(completionTokens)||0)/1e6*p.saida;
    return (provedor==='groq' && cfg.tier==='dev') ? base*DESCONTO_DEV : base;
  }
  function custoPeriodo(){ renovarPeriodoSeNecessario(); return Number(periodo.gastoUSD)||0; }
  function restanteUSD(){ renovarPeriodoSeNecessario(); return Math.max(0, Number(periodo.limiteUSD)-Number(periodo.gastoUSD||0)); }
  function diasRestantesPeriodo(){ renovarPeriodoSeNecessario(); return Math.max(1, Math.ceil((periodo.inicio + periodo.dias*86400000 - Date.now()) / 86400000)); }
  function limiteDiarioCalculado(){
    const manual=Math.max(0.01, Math.min(100, Number(cfg.limiteDiarioUSD)||0.01));
    if(!cfg.diarioAutomatico) return manual;
    return Math.max(0, restanteUSD()/diasRestantesPeriodo());
  }
  function usoHoje() {
    renovarPeriodoSeNecessario();
    const d = new Date().toISOString().slice(0, 10);
    if (uso.dia !== d) {
      uso = { dia: d, requisicoes: 0, entrada: 0, saida: 0, tokens: 0, headers: null, porModelo: {}, limiteUSD: limiteDiarioCalculado() };
      salvarUso();
    } else if (!Number.isFinite(Number(uso.limiteUSD)) || Number(uso.limiteUSD) <= 0) {
      uso.limiteUSD = limiteDiarioCalculado(); salvarUso();
    }
    return uso;
  }
  function custoDoDia(){ const q=usoHoje(); return Object.values(q.porModelo||{}).reduce((n,m)=>n+Number(m.custo||0),0) || 0; }
  function restanteDiaUSD(){ return Math.max(0, Number(usoHoje().limiteUSD||0) - custoDoDia()); }
  function orcamentoDiarioEsgotado(){ return custoDoDia() >= Number(usoHoje().limiteUSD||0); }
  function orcamentoEsgotado(){ renovarPeriodoSeNecessario(); return Number(periodo.gastoUSD||0) >= Number(periodo.limiteUSD||3); }
  function orcamentoIndisponivel(){
    const rota=provedorAtualDeRota();
    const gratuito=(rota==='groq' && cfg.tier==='free');
    if(gratuito) return false;
    return orcamentoEsgotado() || (cfg.modoOrcamento !== 'intensivo' && (orcamentoDiarioEsgotado() || estado.orcamentoPreventivo));
  }
  function salvarUso() { S.local.setJson(K_USO, uso); }

  /* ---------- estado do motor ---------- */
  const estado = {
    orcamentoPreventivo: false,
    situacao: 'off',
    mensagem: 'IA desligada',
    detalhe: '',
    pausado: false,
    emVoo: 0,
    bloqueadaAte: 0,       // bloqueio do provedor; vale para todos os agentes
    falhas: 0,
    ultimo429: 0,
    esperaAtual: 0,
    ultimaAutonoma: 0,
    chamadas: [],
    agentes: Object.create(null),
    provedores: { groq: { bloqueadaAte: 0, ultimo429: 0, headers: null, status: 'aguardando' }, openrouter: { bloqueadaAte: 0, ultimoSync: 0, ultimoSyncCreditos: 0, status: 'aguardando', limiteRestante: null, uso: null, usoDiario: null, usoMensal: null, saldoConta: null, totalCreditos: null, totalUsoConta: null, erroCreditos: null } }
  };
  function lane(id) {
    const k = String(id || 'estudio');
    return estado.agentes[k] || (estado.agentes[k] = { emVoo: 0, falhas: 0, bloqueadaAte: 0, ultima: 0 });
  }

  function situar(situacao, mensagem, detalhe) {
    estado.situacao = situacao;
    estado.mensagem = mensagem;
    if (detalhe !== undefined) estado.detalhe = detalhe;
    S.bus.emit('ia');
  }

  const chave = () => chaves[cfg.provedor];
  function pronta() { return Boolean(cfg.roteamento === 'automatico' ? (chaves.groq || chaves.openrouter) : chaves[cfg.provedor]) && !estado.pausado; }
  function disponivel(agenteId) {
    const l = lane(agenteId);
    const p = provedorAtualDeRota(); const sp = stateProvedor(p);
    return pronta() && Date.now() >= Number(sp.bloqueadaAte||0) && Date.now() >= l.bloqueadaAte && l.emVoo === 0 && !atingiuLimite() && !orcamentoIndisponivel();
  }
  function reservarAutonomia(agenteId) {
    return disponivel(agenteId);
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
  function lerHeaders(resp, provedorUsado) {
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
  function provedorAtualDeRota() {
    if (cfg.roteamento !== 'automatico') return cfg.provedor;
    const g = stateProvedor('groq');
    if (chaves.groq && Date.now() >= Number(g.bloqueadaAte || 0)) return 'groq';
    if (chaves.openrouter) return 'openrouter';
    return 'groq';
  }
  function stateProvedor(p) { return estado.provedores[p] || (estado.provedores[p] = { bloqueadaAte:0, ultimo429:0, headers:null, status:'aguardando' }); }
  function sincronizarGroqHeaders(resp) {
    const g=stateProvedor('groq');
    const h=n=>resp.headers.get(n);
    g.headers={ limiteReq:Number(h('x-ratelimit-limit-requests'))||null, restaReq:Number(h('x-ratelimit-remaining-requests')), resetReq:msDeHeader(h('x-ratelimit-reset-requests')), limiteTok:Number(h('x-ratelimit-limit-tokens'))||null, restaTok:Number(h('x-ratelimit-remaining-tokens')), resetTok:msDeHeader(h('x-ratelimit-reset-tokens')), retryAfter:h('retry-after')||null, em:Date.now() };
    if(!Number.isFinite(g.headers.restaReq)) g.headers.restaReq=null; if(!Number.isFinite(g.headers.restaTok)) g.headers.restaTok=null;
    g.status=(g.headers.restaReq===0 || g.headers.restaTok===0)?'esgotado':'disponivel';
    return g.headers;
  }
  /* OpenRouter separa o saldo da conta do limite opcional da chave.
     Em GET /api/v1/key, limit_remaining=null significa "sem limite de
     chave". Nunca use Number(null), pois isso vira 0 e faria a aplicação
     acreditar que uma conta com saldo está esgotada. */
  function numeroOpcional(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  async function sincronizarOpenRouterCreditos() {
    const o=stateProvedor('openrouter');
    if(!openRouterManagementKey) return null;
    try {
      const r=await fetch('https://openrouter.ai/api/v1/credits',{headers:{Authorization:'Bearer '+openRouterManagementKey}});
      const d=await r.json().catch(()=>null);
      if(!r.ok) throw new Error((d&&d.error&&d.error.message)||('HTTP '+r.status));
      const x=d&&d.data||d||{};
      const total=numeroOpcional(x.total_credits);
      const usado=numeroOpcional(x.total_usage);
      o.totalCreditos=total;
      o.totalUsoConta=usado;
      o.saldoConta=(total!==null && usado!==null) ? Math.max(0,total-usado) : null;
      o.ultimoSyncCreditos=Date.now();
      o.erroCreditos=null;
      if(o.saldoConta!==null && o.saldoConta<=0) o.status='esgotado';
      else if(o.saldoConta!==null) o.status='disponivel';
      S.bus.emit('ia');
      return x;
    } catch(e) {
      o.erroCreditos=String(e.message||e);
      S.bus.emit('ia');
      return null;
    }
  }
  async function sincronizarOpenRouter() {
    if(!chaves.openrouter) return null;
    const o=stateProvedor('openrouter');
    try {
      const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:'Bearer '+chaves.openrouter}});
      const d=await r.json().catch(()=>null);
      if(!r.ok) throw new Error((d&&d.error&&d.error.message)||('HTTP '+r.status));
      const x=d&&d.data||d||{};
      const limite=numeroOpcional(x.limit);
      const restante=numeroOpcional(x.limit_remaining);
      o.ultimoSync=Date.now();
      o.status='disponivel';
      o.limite=limite;
      o.limiteRestante=(limite !== null) ? restante : null;
      o.temLimiteChave=(limite !== null);
      o.uso=numeroOpcional(x.usage);
      o.usoDiario=numeroOpcional(x.usage_daily);
      o.usoMensal=numeroOpcional(x.usage_monthly);
      if(limite !== null && restante !== null && restante <= 0) o.status='esgotado';
      await sincronizarOpenRouterCreditos();
      return x;
    } catch(e) {
      o.status='indisponivel';
      o.erro=String(e.message||e);
      return null;
    }
  }
  function saldoOpenRouterDisponivel() {
    const o=stateProvedor('openrouter');
    const a=numeroOpcional(o.saldoConta);
    const k=o.temLimiteChave===true ? numeroOpcional(o.limiteRestante) : null;
    if(a===null && k===null) return null;
    if(a===null) return k;
    if(k===null) return a;
    return Math.min(a,k);
  }

  function contabilizar(modelo, dados, ms, provedorUsado) {
    const q = usoHoje();
    const u = (dados && dados.usage) || {};
    const pin=Number(u.prompt_tokens || 0), pout=Number(u.completion_tokens || 0), total=Number(u.total_tokens || pin+pout);
    const pvr=provedorUsado || cfg.provedor;
    const custoInformado = (pvr==='openrouter') ? numeroOpcional(u.cost) : null;
    const custo=(custoInformado!==null) ? custoInformado : estimarCusto(pvr,modelo,pin,pout);
    q.requisicoes += 1; q.entrada += pin; q.saida += pout; q.tokens += total;
    const m = q.porModelo[modelo] = q.porModelo[modelo] || { requisicoes: 0, tokens: 0, entrada:0, saida:0, custo:0 };
    m.requisicoes += 1; m.tokens += total; m.entrada += pin; m.saida += pout; m.custo += custo;
    q.ultimoModelo = modelo; salvarUso();
    renovarPeriodoSeNecessario();
    periodo.requisicoes += 1; periodo.tokens += total; periodo.gastoUSD += custo;
    const pmKey=pvr+':'+modelo;
    const pm=periodo.porModelo[pmKey]=periodo.porModelo[pmKey]||{provedor:pvr,modelo,requisicoes:0,tokens:0,entrada:0,saida:0,custo:0};
    pm.requisicoes += 1; pm.tokens += total; pm.entrada += pin; pm.saida += pout; pm.custo += custo;
    salvarPeriodo();

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

  /* Quanto falta até o provedor aceitar de novo, lido da própria resposta.
     Esperar o tempo certo é o que diferencia "a equipe retoma sozinha"
     de "a equipe fica batendo na porta e tomando 429". */
  function esperaDoProvedor(resp, dados) {
    const h = n => { try { return resp.headers.get(n); } catch (e) { return null; } };
    const cands = [h('retry-after'), h('x-ratelimit-reset-tokens'), h('x-ratelimit-reset-requests')]
      .map(v => msDeHeader(v)).filter(v => Number.isFinite(v) && v > 0);
    if (cands.length) return Math.min(6 * 36e5, Math.max(5e3, Math.max.apply(null, cands)));
    const txt = String((dados && dados.error && dados.error.message) || '');
    const m = txt.match(/(\d+(?:\.\d+)?)\s*(ms|s|m|h)\b/i);
    const ms = m ? msDeHeader(m[0]) : null;
    return Number.isFinite(ms) && ms > 0 ? Math.max(5e3, ms) : 60e3;
  }

  /* Se o provedor ativo falhar por cota, tenta uma única vez o outro
     provedor configurado. A troca é persistida: a sessão não fica presa no
     provedor esgotado. Erros de chave inválida não fazem failover silencioso. */
  function provedorAlternativo() {
    const outro = cfg.provedor === 'openrouter' ? 'groq' : 'openrouter';
    return PROVEDORES[outro] && chaves[outro] ? outro : null;
  }

  function ativarProvedor(p) {
    if (!PROVEDORES[p] || !chaves[p]) return false;
    cfg.provedor = p;
    const lista = MODELOS_DE(p);
    cfg.pensamento = lista.some(m => m.id === cfg.pensamento) ? cfg.pensamento : lista[0].id;
    cfg.producao = lista.some(m => m.id === cfg.producao) ? cfg.producao : (lista[1] || lista[0]).id;
    S.local.setJson(K_CFG, cfg);
    estado.bloqueadaAte = 0; estado.falhas = 0; estado.ultimo429 = 0; estado.esperaAtual = 0;
    return true;
  }


  function atingiuLimite(reserva=0) {
    return usoHoje().tokens + Math.max(0, Number(reserva)||0) >= cfg.limiteTokensDia;
  }
  function limiteTokensDia() { return cfg.limiteTokensDia; }

  /* Cada funcionário possui uma lane própria. Uma chamada em andamento não
     torna a IA dos demais "indisponível". O único bloqueio compartilhado é um
     limite real devolvido pelo provedor. */
  async function chamar(op) {
    const { sistema, pedido, agente, motivo } = op;
    const agenteId = String(op.agenteId || op.idAgente || agente || 'estudio');
    const l = lane(agenteId);
    const permitirFailover = op._failover !== false;
    const tipo = op.tipo === 'conteudo' ? 'conteudo' : 'pensamento';
    const modelo = tipo === 'conteudo' ? cfg.producao : cfg.pensamento;
    const teto = clamp(op.tokens || (tipo === 'conteudo' ? 1700 : 420), 120, tipo === 'conteudo' ? 3600 : 900);
    const provedorUsado = op._provedor || provedorAtualDeRota();
    const provInfo = PROVEDORES[provedorUsado];
    const chaveUsada = chaves[provedorUsado];
    const sp = stateProvedor(provedorUsado);

    if (!chaveUsada) {
      const alt = cfg.roteamento === 'automatico' && permitirFailover ? (provedorUsado === 'groq' ? 'openrouter' : 'groq') : null;
      if (alt && chaves[alt]) return chamar(Object.assign({},op,{_failover:false,_provedor:alt,forcar:false}));
      throw new Error(`Nenhuma chave ${provInfo.rotulo} configurada.`);
    }
    if (estado.pausado && !op.forcar) throw new Error('A equipe está pausada.');
    if (Date.now() < Number(sp.bloqueadaAte||0) && !op.forcar) {
      const alt = cfg.roteamento === 'automatico' && permitirFailover ? (provedorUsado === 'groq' ? 'openrouter' : 'groq') : null;
      if (alt && chaves[alt] && Date.now() >= Number(stateProvedor(alt).bloqueadaAte||0)) return chamar(Object.assign({},op,{_failover:false,_provedor:alt,forcar:false}));
      throw new Error(`Provedor em espera por ${Math.ceil((sp.bloqueadaAte-Date.now())/1000)}s após um limite.`);
    }
    if (provedorUsado === 'openrouter' && !op._failover) await sincronizarOpenRouter();
    const orStatus = stateProvedor('openrouter');
    if (provedorUsado === 'openrouter' && orStatus.temLimiteChave === true && Number.isFinite(Number(orStatus.limiteRestante)) && Number(orStatus.limiteRestante) <= 0) {
      const er=new Error('Limite real da chave OpenRouter esgotado. A equipe não fará novas chamadas pagas até a renovação ou aumento do limite.'); er.cota=true; throw er;
    }
    if (Date.now() < l.bloqueadaAte && !op.forcar) {
      throw new Error(`IA de ${agente || agenteId} em recuperação após uma falha temporária.`);
    }
    if (l.emVoo > 0 && !op.forcar && !op._recuperacao && !op._failover) {
      throw new Error(`A IA própria de ${agente || agenteId} já está trabalhando.`);
    }

    const q = usoHoje();
    renovarPeriodoSeNecessario();
    const mensagens = [{ role:'user', content:String(sistema||'').slice(0,4500)+'\n\n'+String(pedido||'').slice(0,4500) }];
    const estimativa = Math.min(10000, Math.ceil((String(sistema||'').length + String(pedido||'').length)/4) + teto);
    const custoEstimado = estimarCusto(provedorUsado, modelo, Math.ceil((String(sistema||'').length + String(pedido||'').length)/4), teto);
    if (provedorUsado === 'openrouter' && orStatus.temLimiteChave === true && Number.isFinite(Number(orStatus.limiteRestante)) && Number(orStatus.limiteRestante) < custoEstimado) {
      const er=new Error(`Saldo/limite real do OpenRouter insuficiente para esta chamada (restante ~US$ ${Number(orStatus.limiteRestante).toFixed(4)}).`); er.cota=true; throw er;
    }
    if (provedorUsado === 'openrouter') {
      const saldoConta=numeroOpcional(orStatus.saldoConta);
      if (saldoConta !== null && saldoConta <= 0) {
        const er=new Error('Créditos da conta OpenRouter esgotados. Recarregue a conta para continuar.'); er.cota=true; throw er;
      }
      if (saldoConta !== null && custoEstimado > saldoConta) {
        const er=new Error(`Crédito real da conta OpenRouter insuficiente para esta chamada (saldo ~US$ ${saldoConta.toFixed(4)}).`); er.cota=true; throw er;
      }
    }
    if (custoEstimado > 0 && (custoPeriodo() + custoEstimado) > (Number(periodo.limiteUSD)-Number(periodo.margemUSD||0))) {
      estado.orcamentoPreventivo=true;
      const er = new Error(`Orçamento de IA do período de 30 dias quase esgotado; chamada não iniciada para preservar o limite.`);
      er.limiteLocal = true; throw er;
    }
    if (custoEstimado > 0 && cfg.modoOrcamento !== 'intensivo' && (custoDoDia() + custoEstimado) > Number(usoHoje().limiteUSD||0)) {
      estado.orcamentoPreventivo=true;
      const er = new Error(`Limite diário de IA atingido (US$ ${Number(usoHoje().limiteUSD||0).toFixed(4)}). A equipe entra em rotina Sims-like até o próximo dia. Ative Trabalho intensivo para usar o saldo mensal sem o teto diário.`);
      er.limiteLocal = true; er.diario = true; throw er;
    }

    estado.emVoo++; l.emVoo++;
    situar('ocupada','IA trabalhando',`${agente || agenteId} · ${modelo} · ${motivo || 'chamada'}`);
    const inicio=Date.now();
    try {
      const resp=await fetch(provInfo.url,{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+chaveUsada},
        body:JSON.stringify({
          model:modelo,messages:mensagens,max_completion_tokens:teto,
          temperature:tipo==='conteudo'?0.55:0.2,stream:false,
          ...(provedorUsado==='openrouter'
            ? {reasoning:{effort:op.reasoning_effort || (tipo==='conteudo'?'medium':'low'),exclude:true}}
            : {reasoning_effort:op.reasoning_effort || (tipo==='conteudo'?'medium':'low')})
        })
      });
      let dados=null; try{dados=await resp.json();}catch(_){}
      lerHeaders(resp, provedorUsado);
      const ms=Date.now()-inicio;
      if(resp.ok && dados && dados.usage) {
        contabilizar(modelo,dados,ms,provedorUsado);
        if(provedorUsado==='openrouter') void sincronizarOpenRouterCreditos();
      }

      if(!resp.ok){
        const msg=(dados&&dados.error&&dados.error.message)||`${provInfo.nome} respondeu HTTP ${resp.status}.`;
        if(resp.status===401) throw new Error(`Chave ${provInfo.rotulo} inválida ou expirada.`);
        if(resp.status===429 || (provedorUsado==='openrouter' && resp.status===402)){
          if (provedorUsado==='openrouter' && resp.status===402) {
            sp.status='esgotado';
            const er=new Error('Créditos do OpenRouter insuficientes. O provedor recusou a chamada paga (HTTP 402).');
            er.cota=true;
            throw er;
          }
          const espera=esperaDoProvedor(resp,dados);
          sp.bloqueadaAte=Date.now()+espera;
          sp.ultimo429=Date.now(); sp.status='esgotado';
          if(provedorUsado==='groq') { estado.bloqueadaAte=sp.bloqueadaAte; estado.ultimo429=Date.now(); estado.esperaAtual=espera; }
          const outro=(cfg.roteamento==='automatico' && permitirFailover) ? (provedorUsado==='groq'?'openrouter':'groq') : (permitirFailover?provedorAlternativo():null);
          if(outro && chaves[outro] && Date.now() >= Number(stateProvedor(outro).bloqueadaAte||0)){
            S.state && S.state.registrar && S.state.registrar(`Cota de ${PROVEDORES[provedorUsado].nome} atingida. Motor mudou automaticamente para ${PROVEDORES[outro].nome}.`,'alerta');
            return chamar(Object.assign({},op,{_failover:false,_provedor:outro,forcar:false}));
          }
          const er=new Error(`Limite ${provInfo.rotulo} atingido. A equipe aguarda a janela do provedor.`);
          er.cota=true; throw er;
        }
        throw new Error(msg);
      }

      const escolha=(dados.choices||[])[0]||{};
      const mensagem=escolha.message||{};
      const texto=String(mensagem.content||escolha.text||'').trim();

      if(!texto && escolha.finish_reason==='length' && !op._recuperacao && tipo==='pensamento'){
        return chamar(Object.assign({},op,{_recuperacao:true,reasoning_effort:'low',tokens:Math.max(Number(op.tokens||0)+180,560)}));
      }
      if(!texto){
        const motivoVazio=escolha.finish_reason?`finish_reason=${escolha.finish_reason}`:'resposta vazia';
        throw new Error(`${provInfo.nome} não devolveu texto utilizável (${motivoVazio}).`);
      }

      estado.falhas=0; estado.orcamentoPreventivo=false; l.falhas=0; l.bloqueadaAte=0; sp.status='disponivel';
      registrarChamada({quem:agente||agenteId,motivo:motivo||tipo,modelo,provedor:provedorUsado,ms,ok:true,tokens:(dados.usage||{}).total_tokens||0,em:Date.now()});
      situar('pronta','IA pronta',`última resposta em ${(ms/1000).toFixed(1)}s`);
      return {texto,usage:dados.usage||{},ms,modelo};
    }catch(err){
      const msg=String(err&&err.message||err);
      estado.falhas++; l.falhas++;
      if(err&&err.cota){
        // bloqueio global já foi definido pelo cabeçalho do provedor.
      }else if(err&&err.orcamento){
        // orçamento local é um freio planejado, não uma falha do modelo.
      }else if(!err.limiteLocal){
        l.bloqueadaAte=Date.now() + (/401|inválida/i.test(msg)?90000:Math.min(30000,5000*l.falhas));
      }
      registrarChamada({quem:agente||agenteId,motivo:motivo||tipo,modelo,provedor:provedorUsado,ms:Date.now()-inicio,ok:false,erro:msg,em:Date.now()});
      situar((err.limiteLocal||err.orcamento)?'pronta':'erro',(err.orcamento?'Orçamento do período atingido':err.diario?'Limite diário atingido':err.limiteLocal?'Limite local atingido':'Falha na IA'),msg);
      throw err;
    }finally{
      estado.emVoo=Math.max(0,estado.emVoo-1);
      l.emVoo=Math.max(0,l.emVoo-1);
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

  /* Deliberação autônoma: não pede ao modelo para obedecer uma árvore de
     opções. Ele recebe o estado real e produz apenas uma síntese de decisão
     para a própria pessoa usar no trabalho. O raciocínio profundo permanece
     interno ao modelo; o que persiste é a conclusão operacional. */
  async function deliberar(op) {
    const r = await chamar({
      sistema: String(op.sistema || '') + `\n\nVocê tem liberdade para escolher a melhor abordagem. Não siga uma árvore fixa de decisões. Analise o contexto, compare alternativas, identifique o que já existe e escolha uma direção coerente com o objetivo do projeto. Não revele seu raciocínio interno passo a passo. Retorne somente uma síntese operacional curta: DECISAO: <o que fará>\nABORDAGEM: <como pretende fazer>\nRISCOS: <o que precisa evitar>\nUSAR: <materiais existentes que devem ser preservados ou reutilizados>`,
      pedido: op.pedido, tipo: 'pensamento', tokens: op.tokens || 420, reasoning_effort: 'low', agente: op.agente, agenteId: op.agenteId, motivo: op.motivo || 'deliberação autônoma'
    });
    const c = campos(r.texto);
    return { texto: r.texto, campos: c, resumo: [c.decisao,c.abordagem,c.riscos,c.usar].filter(Boolean).join(' ') };
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
  function salvarChaves(groq, openrouter) {
    for (const [p,k0] of [['groq',groq],['openrouter',openrouter]]) {
      if (k0 === undefined) continue;
      const k=String(k0||'').trim();
      if (k && !PROVEDORES[p].regex.test(k)) throw new Error(`A chave ${PROVEDORES[p].rotulo} parece inválida.`);
      chaves[p]=k; const kk=p==='openrouter'?K_CHAVE_OR:K_CHAVE; if(k) S.local.set(kk,k); else S.local.del(kk);
    }
    if (cfg.roteamento==='automatico') cfg.provedor = chaves.groq ? 'groq' : (chaves.openrouter ? 'openrouter' : 'groq');
    S.local.setJson(K_CFG,cfg);
    estado.bloqueadaAte=0; estado.falhas=0;
    situar(pronta()?'pronta':'off', pronta()?'IA pronta':'IA desligada', pronta()?'roteamento automático · Groq grátis → OpenRouter':'configure Groq e/ou OpenRouter');
  }

  function salvarChaveGerenciamentoOpenRouter(chaveMgmt) {
    const k=String(chaveMgmt||'').trim();
    if(k && k.length < 20) throw new Error('A Management Key parece curta demais. Cole a chave completa do OpenRouter.');
    openRouterManagementKey=k;
    if(k) S.local.set(K_OR_MGMT,k); else S.local.del(K_OR_MGMT);
    if(openRouterCreditsTimer) { clearInterval(openRouterCreditsTimer); openRouterCreditsTimer=null; }
    if(k) openRouterCreditsTimer=setInterval(() => { if(document.visibilityState === 'visible') void sincronizarOpenRouterCreditos(); }, 60000);
    const o=stateProvedor('openrouter');
    o.saldoConta=null; o.totalCreditos=null; o.totalUsoConta=null; o.erroCreditos=null;
    return sincronizarOpenRouterCreditos();
  }

  function salvarCfg(novaChave, pensamento, producao, limiteTokensDia, orcamentoUSD, limiteDiarioUSD, diarioAutomatico, modoOrcamento, roteamento) {
    if (novaChave !== undefined) {
      const k = String(novaChave).trim();
      if (k && !prov().regex.test(k)) throw new Error(`A chave ${prov().rotulo} começa com ${prov().prefixo} e é bem mais longa. Confira o que foi colado.`);
      chaves[cfg.provedor] = k;
    }
    const lista = MODELOS_DE(cfg.provedor);
    if (lista.some(m => m.id === pensamento)) cfg.pensamento = pensamento;
    if (lista.some(m => m.id === producao)) cfg.producao = producao;
    if (limiteTokensDia !== undefined) cfg.limiteTokensDia = Math.max(10000, Math.min(500000, Number(limiteTokensDia) || cfg.limiteTokensDia));
    if (orcamentoUSD !== undefined) cfg.orcamentoUSD = Math.max(0.10, Math.min(1000, Number(orcamentoUSD) || cfg.orcamentoUSD));
    if (limiteDiarioUSD !== undefined) cfg.limiteDiarioUSD = Math.max(0.01, Math.min(100, Number(limiteDiarioUSD) || cfg.limiteDiarioUSD));
    if (diarioAutomatico !== undefined) cfg.diarioAutomatico = Boolean(diarioAutomatico);
    if (modoOrcamento !== undefined) cfg.modoOrcamento = modoOrcamento === 'intensivo' ? 'intensivo' : 'normal';
    if (roteamento !== undefined) cfg.roteamento = roteamento === 'manual' ? 'manual' : 'automatico';
    if (cfg.modoOrcamento === 'intensivo') estado.orcamentoPreventivo = false;
    periodo.limiteUSD = cfg.orcamentoUSD; periodo.margemUSD = 0;
    const hoje = usoHoje();
    hoje.limiteUSD = limiteDiarioCalculado();
    salvarPeriodo(); salvarUso();
    const kk = cfg.provedor === 'openrouter' ? K_CHAVE_OR : K_CHAVE;
    if (chave()) S.local.set(kk, chave()); else S.local.del(kk);
    S.local.setJson(K_CFG, cfg);
    estado.bloqueadaAte = 0; estado.falhas = 0;
    situar(chave() ? 'pronta' : 'off', chave() ? 'IA pronta' : 'IA desligada', chave() ? `configuração salva · ${prov().nome}` : 'sem chave');
  }

  function orcamento() {
    renovarPeriodoSeNecessario();
    const q=usoHoje(), h=q.headers;
    const temTok=h && Number.isFinite(h.limiteTok) && h.limiteTok>0;
    const temReq=h && Number.isFinite(h.limiteReq) && h.limiteReq>0;
    const pctTokens=temTok?clamp(((h.limiteTok-(Number.isFinite(h.restaTok)?h.restaTok:h.limiteTok))/h.limiteTok)*100,0,100):null;
    const pctReq=temReq?clamp(((h.limiteReq-(Number.isFinite(h.restaReq)?h.restaReq:h.limiteReq))/h.limiteReq)*100,0,100):null;
    const diasPassados=Math.max(0,(Date.now()-periodo.inicio)/86400000);
    const diasRestantes=Math.max(0,periodo.dias-diasPassados);
    const restante=restanteUSD();
    const ritmo=diasRestantes>0?restante/diasRestantes:0;
    const diario=Number(q.limiteUSD||limiteDiarioCalculado());
    const gastoDia=custoDoDia();
    return {requisicoes:q.requisicoes,tokens:q.tokens,entrada:q.entrada,saida:q.saida,pctTokens,pctReq,fonte:(temTok||temReq)?cfg.provedor:'aguardando headers',provedor:cfg.provedor,ref:null,headers:h,porModelo:q.porModelo,custo:gastoDia,custoDiaUSD:gastoDia,limiteDiarioUSD:diario,restanteDiaUSD:Math.max(0,diario-gastoDia),diarioAutomatico:cfg.diarioAutomatico,modoOrcamento:cfg.modoOrcamento,custoPeriodo:custoPeriodo(),orcamentoUSD:periodo.limiteUSD,margemUSD:0,restanteUSD:restante,diasRestantes,ritmoDiarioUSD:ritmo,periodoInicio:periodo.inicio,periodoFim:periodo.inicio+periodo.dias*86400000,esgotado:orcamentoEsgotado(),esgotadoDia:(cfg.modoOrcamento !== 'intensivo' && orcamentoDiarioEsgotado()),tier:cfg.tier,roteamento:cfg.roteamento,limiteTokensDia:cfg.limiteTokensDia,openrouterSaldo:stateProvedor('openrouter').saldoConta,openrouterLimiteChave:stateProvedor('openrouter').limiteRestante,openrouterSaldoEfetivo:saldoOpenRouterDisponivel(),openrouterManagementConfigured:Boolean(openRouterManagementKey),openrouterSync:stateProvedor('openrouter').ultimoSyncCreditos};
  }

  S.ai = {
    get MODELOS() { return MODELOS_DE(cfg.provedor); },
    PROVEDORES,
    definirProvedor(p) {
      if (p === 'auto') { cfg.roteamento='automatico'; cfg.provedor = chaves.groq ? 'groq' : 'openrouter'; cfg.providerSelecionadoEm=Date.now(); S.local.setJson(K_CFG,cfg); estado.bloqueadaAte=0; estado.falhas=0; situar(chave()?'pronta':'off',chave()?'IA pronta':'IA desligada','roteamento automático · Groq grátis → OpenRouter'); return; }
      if (!PROVEDORES[p]) return;
      if (p === cfg.provedor && cfg.roteamento === 'manual') return;
      cfg.roteamento='manual';
      cfg.providerSelecionadoEm = Date.now();
      cfg.provedor = p;
      // Modelos são identificados de forma diferente em cada provedor:
      // ao trocar, cai no padrão da nova lista em vez de mandar um id inválido.
      const lista = MODELOS_DE(p);
      cfg.pensamento = lista[0].id;
      cfg.producao = (lista[1] || lista[0]).id;
      S.local.setJson(K_CFG, cfg);
      estado.bloqueadaAte = 0; estado.falhas = 0; estado.ultimo429 = 0;
      situar(chave() ? 'pronta' : 'off', chave() ? 'IA pronta' : 'IA desligada',
        chave() ? `usando ${PROVEDORES[p].nome}` : `informe a chave ${PROVEDORES[p].rotulo}`);
    },    provedorAtual: () => cfg.provedor, cfg, estado, chamar, deliberar, perguntar, campos, corpo, testar, salvarCfg, salvarChaves, salvarChaveGerenciamentoOpenRouter, limiteTokensDia,
    orcamento, pronta, disponivel, PRECOS_POR_PROVEDOR, orcamentoEsgotado, orcamentoDiarioEsgotado, orcamentoIndisponivel, restanteUSD, restanteDiaUSD, custoPeriodo, custoDoDia,
    sincronizarFornecedor: sincronizarOpenRouter, sincronizarCreditosOpenRouter: sincronizarOpenRouterCreditos,
    statusFornecedores: () => ({ groq: stateProvedor('groq'), openrouter: stateProvedor('openrouter'), roteamento: cfg.roteamento, openrouterSaldo: saldoOpenRouterDisponivel(), openrouterManagementConfigured: Boolean(openRouterManagementKey) }),
    definirTier(v) {
      cfg.tier = v === 'dev' ? 'dev' : 'free';
      S.local.setJson(K_CFG, cfg);
      S.bus.emit('ia');
    }, reservarAutonomia, faltaParaAutonomia, msDeHeader,
    temChave: () => Boolean(chave()),
    chaveMascarada: () => (chave() ? chave().slice(0, 7) + '••••••' + chave().slice(-4) : ''),
    pausar(v) { estado.pausado = Boolean(v); situar(estado.pausado ? 'off' : (chave() ? 'pronta' : 'off'), estado.pausado ? 'Equipe pausada' : (chave() ? 'IA pronta' : 'IA desligada')); },
    iniciar() {
      if (chave()) situar('pronta', 'IA pronta', `chave ${prov().rotulo} carregada deste aparelho`);
      if (openRouterManagementKey) void sincronizarOpenRouterCreditos();
      if (openRouterManagementKey) {
        void sincronizarOpenRouterCreditos();
        openRouterCreditsTimer = setInterval(() => {
          if (document.visibilityState === 'visible') void sincronizarOpenRouterCreditos();
        }, 60000);
      }
    }
  };
  void sleep;
})(window.S);
