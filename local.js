/* ============================================================
   IA LOCAL — dois motores sem cota nenhuma:

   1) WebLLM: o modelo roda dentro do próprio navegador, na GPU do
      aparelho (WebGPU). Baixa uma vez, fica guardado em cache e
      depois funciona offline. Nenhuma chave, nenhum limite.
   2) Ollama: um servidor na mesma rede (PC) com endpoint compatível
      com o formato OpenAI. Mais rápido e mais inteligente, mas exige
      a máquina ligada.

   Este arquivo não conhece o Estúdio: só sabe receber mensagens e
   devolver texto. Quem decide quando chamar continua sendo o ai.js.
   ============================================================ */
(function (S) {
  'use strict';

  const K_CFG = 'estudio-ia-local-v1';

  /* Modelos WebLLM prontos. A memória é o limite real do celular:
     abaixo de 3 GB livres, fique no 1B/1.5B. */
  const MODELOS_WEBLLM = [
    { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', nome: 'Llama 3.2 1B · leve', nota: '~0,9 GB. O mais rápido em celular. Bom para decisão e coordenação, fraco para texto longo.' },
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', nome: 'Qwen 2.5 1.5B · equilibrado', nota: '~1,1 GB. Melhor obediência a formato CHAVE: valor. Escolha padrão.' },
    { id: 'gemma-2-2b-it-q4f16_1-MLC', nome: 'Gemma 2 2B · texto', nota: '~1,6 GB. Escreve melhor que os de 1B. Precisa de aparelho folgado.' },
    { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', nome: 'Qwen 2.5 3B · produção', nota: '~2,1 GB. Melhor qualidade de produto final. Só em aparelho forte ou PC.' },
    { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', nome: 'Llama 3.2 3B · produção', nota: '~2,2 GB. Alternativa ao Qwen 3B.' },
    { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', nome: 'Phi 3.5 mini · raciocínio', nota: '~2,4 GB. Bom em instrução estruturada, mais pesado.' }
  ];

  /* Tentadas em ordem. A primeira é uma cópia opcional dentro do próprio
     site: quem quiser independência total da rede é só colocar o arquivo
     em vendor/web-llm.js. As demais ficam no cache do service worker
     depois do primeiro carregamento, então o offline continua valendo. */
  const FONTES_WEBLLM = [
    './vendor/web-llm.js',
    'https://esm.run/@mlc-ai/web-llm',
    'https://esm.sh/@mlc-ai/web-llm'
  ];
  async function importarLib() {
    let ultimo = null;
    for (const url of FONTES_WEBLLM) {
      try { return await import(/* @vite-ignore */ url); } catch (e) { ultimo = e; }
    }
    throw new Error('Não foi possível carregar a biblioteca do modelo local. ' +
      (navigator.onLine === false ? 'Você está sem internet e ela ainda não estava guardada neste aparelho.' : String(ultimo && ultimo.message || '')));
  }

  const cfg = Object.assign({
    // modelos já baixados neste navegador. Serve para o Estúdio saber se
    // pode cair no motor local sem disparar um download de 1 GB no 4G.
    baixados: [],
    modeloWebllm: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    urlOllama: 'http://localhost:11434',
    modeloOllama: 'qwen2.5:3b-instruct'
  }, S.local.json(K_CFG, {}));

  function salvar() { S.local.setJson(K_CFG, cfg); }

  /* ---------- WebLLM ---------- */
  let lib = null;          // módulo importado do CDN
  let motor = null;        // engine já criada
  let motorModelo = '';    // qual modelo está carregado
  let carregando = null;   // promessa em andamento
  const carga = { pct: 0, texto: '', pronto: false };

  function temWebGPU() { return typeof navigator !== 'undefined' && !!navigator.gpu; }

  async function carregarWebllm(modeloId) {
    const alvo = modeloId || cfg.modeloWebllm;
    if (motor && motorModelo === alvo) return motor;
    if (carregando) return carregando;
    if (!temWebGPU()) throw new Error('Este navegador não tem WebGPU. Use o Chrome atualizado, ou escolha Ollama.');

    carga.pronto = false; carga.pct = 0; carga.texto = 'preparando…';
    S.bus.emit('ia-local');

    carregando = (async () => {
      if (!lib) lib = await importarLib();
      if (motor) { try { await motor.unload(); } catch (e) {} motor = null; motorModelo = ''; }
      const m = await lib.CreateMLCEngine(alvo, {
        initProgressCallback: p => {
          carga.pct = Math.round((Number(p && p.progress) || 0) * 100);
          carga.texto = String((p && p.text) || '').slice(0, 120);
          S.bus.emit('ia-local');
        }
      });
      motor = m; motorModelo = alvo;
      cfg.modeloWebllm = alvo;
      if (!Array.isArray(cfg.baixados)) cfg.baixados = [];
      if (!cfg.baixados.includes(alvo)) cfg.baixados.push(alvo);
      salvar();
      carga.pronto = true; carga.pct = 100; carga.texto = 'modelo carregado neste aparelho';
      S.bus.emit('ia-local');
      return m;
    })().finally(() => { carregando = null; });

    return carregando;
  }

  async function descarregar() {
    if (motor) { try { await motor.unload(); } catch (e) {} }
    motor = null; motorModelo = '';
    carga.pronto = false; carga.pct = 0; carga.texto = 'modelo descarregado da memória';
    S.bus.emit('ia-local');
  }

  async function chamarWebllm(mensagens, teto, temperatura) {
    const m = await carregarWebllm(cfg.modeloWebllm);
    const r = await m.chat.completions.create({
      messages: mensagens,
      max_tokens: teto,
      temperature: temperatura,
      stream: false
    });
    const escolha = (r.choices || [])[0] || {};
    return {
      texto: String((escolha.message && escolha.message.content) || '').trim(),
      usage: r.usage || {},
      modelo: motorModelo || cfg.modeloWebllm
    };
  }

  /* ---------- Ollama (ou qualquer endpoint compatível com OpenAI) ---------- */
  function baseOllama() {
    return String(cfg.urlOllama || '').trim().replace(/\/+$/, '');
  }

  async function listarOllama() {
    const base = baseOllama();
    if (!base) throw new Error('Informe o endereço do servidor.');
    const r = await fetch(base + '/api/tags');
    if (!r.ok) throw new Error(`O servidor respondeu HTTP ${r.status}.`);
    const d = await r.json();
    return (d.models || []).map(m => m.name).filter(Boolean);
  }

  async function chamarOllama(mensagens, teto, temperatura) {
    const base = baseOllama();
    if (!base) throw new Error('Nenhum servidor Ollama configurado.');
    const r = await fetch(base + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.modeloOllama,
        messages: mensagens,
        max_tokens: teto,
        temperature: temperatura,
        stream: false
      })
    });
    let d = null;
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) {
      const msg = (d && d.error && (d.error.message || d.error)) || `HTTP ${r.status}`;
      throw new Error('Ollama: ' + msg);
    }
    const escolha = ((d && d.choices) || [])[0] || {};
    return {
      texto: String((escolha.message && escolha.message.content) || '').trim(),
      usage: (d && d.usage) || {},
      modelo: cfg.modeloOllama
    };
  }

  /* ---------- porta única ---------- */
  async function chamar(provedor, mensagens, teto, temperatura) {
    return provedor === 'ollama'
      ? chamarOllama(mensagens, teto, temperatura)
      : chamarWebllm(mensagens, teto, temperatura);
  }

  function modeloAtual(provedor) {
    return provedor === 'ollama' ? cfg.modeloOllama : cfg.modeloWebllm;
  }

  /* Pronto quer dizer "posso chamar agora sem pedir nada ao usuário".
     No WebLLM, a primeira chamada dispara o download sozinha, então
     basta haver WebGPU. */
  function pronto(provedor) {
    return provedor === 'ollama' ? Boolean(baseOllama() && cfg.modeloOllama) : temWebGPU();
  }

  function definir(campos) {
    if (campos.modeloWebllm) cfg.modeloWebllm = campos.modeloWebllm;
    if (campos.urlOllama !== undefined) cfg.urlOllama = String(campos.urlOllama).trim();
    if (campos.modeloOllama !== undefined) cfg.modeloOllama = String(campos.modeloOllama).trim();
    salvar();
    S.bus.emit('ia-local');
  }

  /* Um modelo já baixado fica no cache do navegador: pode ser carregado
     de novo sem rede e sem gastar dados. É essa a condição para o
     Estúdio usar a reserva local automaticamente. */
  function emCache(id) {
    const alvo = id || cfg.modeloWebllm;
    return Array.isArray(cfg.baixados) && cfg.baixados.includes(alvo);
  }
  function tamanhoDe(id) {
    const m = MODELOS_WEBLLM.find(x => x.id === (id || cfg.modeloWebllm));
    const n = m && m.nota.match(/~([\d,]+) GB/);
    return n ? n[1] + ' GB' : '';
  }

  S.iaLocal = {
    MODELOS_WEBLLM, cfg, carga, chamar, carregarWebllm, descarregar, emCache, tamanhoDe,
    listarOllama, temWebGPU, pronto, definir, modeloAtual,
    carregado: () => Boolean(motor),
    modeloCarregado: () => motorModelo
  };
})(window.S);
