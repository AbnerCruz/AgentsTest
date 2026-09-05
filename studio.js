/* ============================================================
   ESTÚDIO — o simulador propriamente dito.
   Um único motor assíncrono decide, no máximo, UMA ação de IA por
   ciclo. Isso mantém o consumo previsível e evita várias pessoas
   chamando a API ao mesmo tempo.
   ============================================================ */
(function (S) {
  'use strict';
  const { clamp, sleep, uid, slug, pick } = S.util;

  const ESPECIALIDADES = [
    { id: 'criacao', cargo: 'Criação', desc: 'Páginas, artigos, marca e calendário.' },
    { id: 'comercial', cargo: 'Comercial', desc: 'Anúncios, e-mails e propostas.' },
    { id: 'dados', cargo: 'Dados', desc: 'Catálogos, planilhas e organização.' },
    { id: 'producao', cargo: 'Produção', desc: 'Ajustes, revisões e acabamento.' },
    { id: 'geral', cargo: 'Generalista', desc: 'Pega o que aparecer, sem bônus.' }
  ];
  const NOMES = ['Lia', 'Rui', 'Bia', 'Téo', 'Vera', 'Caio', 'Ju', 'Nara', 'Íris', 'Davi', 'Cléo', 'Otto', 'Selma', 'Bento'];

  let rt = [];              // pessoas vivas em memória
  let token = 0;            // invalida ciclos de estúdios anteriores
  let motorTimer = null;
  let vitaisTimer = null;
  let selecionado = null;
  let animacao = null;

  /* ---------- construção ---------- */
  function mesa(i, total) {
    const porLinha = total > 4 ? 3 : 2;
    const col = i % porLinha, lin = Math.floor(i / porLinha);
    const largura = 640, margem = 76;
    const passo = (largura - margem * 2) / Math.max(1, porLinha - 1);
    return { x: margem + col * (porLinha === 1 ? 0 : passo), y: 74 + lin * 96 };
  }
  const assento = p => ({ x: p.mesa.x, y: p.mesa.y + 40 });

  const ESTACOES = {
    cafe: { x: 90, y: 300, rotulo: 'café' },
    descanso: { x: 320, y: 300, rotulo: 'descanso' },
    quadro: { x: 550, y: 300, rotulo: 'quadro' }
  };

  function montar() {
    const e = S.state.atual();
    token++;
    const meu = token;
    rt = (e ? e.equipe : []).map((f, i) => {
      const m = mesa(i, (e.equipe || []).length);
      return {
        id: f.id, nome: f.nome, papel: f.papel, cargo: f.cargo,
        especialidade: f.especialidade || 'geral', cor: f.cor,
        mesa: m, pos: { x: m.x, y: m.y + 40 }, alvo: null,
        estado: 'sentado', balao: null, ocupado: false, progresso: 0,
        tarefa: null, ref: f
      };
    });
    selecionado = null;
    iniciar(meu);
    S.bus.emit('estudio');
  }

  function pessoa(id) { return rt.find(p => p.id === id) || null; }
  const gerente = () => rt.find(p => p.papel === 'gerente') || null;

  function irPara(p, alvo) {
    p.estado = 'andando'; p.alvo = alvo;
    return new Promise(res => { p._chegou = res; setTimeout(() => { if (p._chegou === res) { p._chegou = null; res(); } }, 6000); });
  }
  async function falar(p, texto, ms) {
    p.balao = texto; p.estado = 'falando';
    await sleep(ms || 1600);
    p.balao = null; p.estado = 'sentado';
  }

  /* ---------- vitais ---------- */
  function tickVitais() {
    const e = S.state.atual(); if (!e) return;
    const rel = S.market.relogio(e);
    rt.forEach(p => {
      const f = p.ref;
      if (!f) return;
      if (p.ocupado) f.energia = clamp(f.energia - 1.6, 0, 100);
      else if (p.estado === 'pausa' || !rel.expediente) f.energia = clamp(f.energia + 2.4, 0, 100);
      else f.energia = clamp(f.energia - 0.35, 0, 100);
      // Humor volta devagar para o meio quando nada acontece.
      f.humor = clamp(f.humor + (f.humor < 60 ? 0.35 : -0.12), 0, 100);
      if (f.energia < 18 && p.estado !== 'pausa' && !p.ocupado) {
        p.estado = 'pausa';
        irPara(p, ESTACOES[pick(['cafe', 'descanso'])]).then(() => {
          setTimeout(() => { if (p.estado === 'pausa') { irPara(p, assento(p)).then(() => { p.estado = 'sentado'; }); } }, 9000);
        });
        S.state.registrar(`${p.nome} parou para descansar — energia no fim.`, 'info', p.id);
      }
    });
    S.bus.emit('equipe');
    S.state.gravar();
  }

  function humor(p, delta, motivo) {
    if (!p.ref) return;
    p.ref.humor = clamp(p.ref.humor + delta, 0, 100);
    if (motivo && Math.abs(delta) >= 6) lembrar(p, motivo);
  }
  function lembrar(p, texto) {
    if (!p.ref) return;
    p.ref.memoria = (p.ref.memoria || []).concat(String(texto).slice(0, 90)).slice(-5);
  }

  /* ---------- arquivos ---------- */
  function salvarArquivos(lista, meta, p) {
    const e = S.state.atual(); if (!e) return [];
    const salvos = lista.map(a => {
      const arq = {
        id: uid('f'), nome: a.nome, tipo: a.tipo, conteudo: String(a.conteudo),
        classe: meta.classe || 'esboco', kit: meta.kit || 'legado',
        qualidade: meta.qualidade == null ? 50 : meta.qualidade,
        viaIA: Boolean(meta.viaIA), versao: 1, linhagem: slug(a.nome.replace(/\.[a-z0-9]+$/i, '')),
        autor: p ? p.nome : 'equipe', criadoEm: Date.now(), quando: S.fmt.dataHora()
      };
      e.arquivos.unshift(arq);
      return arq;
    });
    if (e.arquivos.length > 90) e.arquivos.length = 90;
    if (p && p.ref) p.ref.entregas = (p.ref.entregas || 0) + 1;
    S.state.registrar(
      `${p ? p.nome : 'A equipe'} entregou ${salvos.map(a => a.nome).join(', ')} · qualidade ${meta.qualidade}.`,
      'ok', p ? p.id : null);
    S.state.ganharXP(8 * salvos.length);
    S.state.gravar();
    S.bus.emit('arquivos');
    return salvos;
  }

  /* Publicar congela uma versão. Produto final nunca é reescrito:
     correção vira versão nova, e o histórico permanece. */
  function publicar(arqId, quem, motivo) {
    const e = S.state.atual(); if (!e) return null;
    const base = e.arquivos.find(a => a.id === arqId); if (!base) return null;
    if (base.classe === 'produto') return null;
    const anteriores = e.arquivos.filter(a => a.classe === 'produto' && a.linhagem === base.linhagem);
    const versao = anteriores.reduce((m, a) => Math.max(m, a.versao || 1), 0) + 1;
    const ext = (base.nome.match(/\.[a-z0-9]+$/i) || [''])[0];
    const produto = Object.assign({}, base, {
      id: uid('p'), classe: 'produto', versao,
      nome: base.nome.replace(/\.[a-z0-9]+$/i, '') + '-v' + versao + ext,
      publicadoPor: quem || 'você', motivo: motivo || '', quando: S.fmt.dataHora(), publicadoEm: Date.now()
    });
    e.arquivos.unshift(produto);
    S.state.registrar(`${produto.publicadoPor} publicou ${produto.nome}${motivo ? ' — ' + motivo : ''}.`, 'ok');
    S.state.ganharXP(25);
    S.state.gravar();
    S.bus.emit('arquivos'); S.bus.emit('negocio');
    return produto;
  }

  /* ---------- tarefas ---------- */
  function novaTarefa(dados) {
    const e = S.state.atual(); if (!e) return null;
    const titulo = String(dados.titulo || '').trim(); if (!titulo) return null;
    if (e.tarefas.some(t => t.status !== 'feita' && t.titulo.toLowerCase() === titulo.toLowerCase())) return null;
    const t = {
      id: uid('t'), titulo, kit: dados.kit || 'landing', briefing: dados.briefing || titulo,
      para: dados.para || null, status: 'aberta', origem: dados.origem || 'gerente',
      contrato: dados.contrato || null, criadaEm: Date.now()
    };
    e.tarefas.unshift(t);
    if (e.tarefas.length > 60) e.tarefas.length = 60;
    S.state.gravar(); S.bus.emit('trabalho');
    return t;
  }
  function tarefasAbertas() {
    const e = S.state.atual(); return e ? e.tarefas.filter(t => t.status === 'aberta') : [];
  }
  function proximaPara(p) {
    const abertas = tarefasAbertas();
    return abertas.find(t => t.para === p.id)
      || abertas.find(t => !t.para && (S.factory.porId(t.kit) || {}).especialidade === p.especialidade)
      || abertas.find(t => !t.para) || null;
  }

  /* Executa uma tarefa do começo ao fim: uma chamada de IA, um arquivo. */
  async function executar(p, tarefa) {
    const e = S.state.atual(); if (!e) return false;
    p.ocupado = true; p.tarefa = tarefa.titulo; p.progresso = 0;
    tarefa.status = 'fazendo'; tarefa.para = p.id;
    S.bus.emit('trabalho'); S.bus.emit('equipe');
    S.state.registrar(`${p.nome} assumiu: ${tarefa.titulo}`, 'info', p.id);

    await irPara(p, assento(p));
    p.estado = 'trabalhando';
    const relogio = setInterval(() => { p.progresso = Math.min(0.97, p.progresso + 0.03); }, 400);

    let ok = false;
    try {
      const saida = await S.factory.produzir({ kit: tarefa.kit, briefing: tarefa.briefing, agente: p.ref });
      if (saida && saida.arquivos.length) {
        const salvos = salvarArquivos(saida.arquivos, saida, p);
        tarefa.status = 'feita'; tarefa.concluidaEm = Date.now();
        tarefa.arquivo = salvos[0].id; tarefa.qualidade = saida.qualidade;
        ok = true;
        humor(p, 8, `entreguei ${salvos[0].nome}`);
        if (tarefa.contrato) fecharContrato(tarefa.contrato, salvos[0], saida.qualidade);
        if (!saida.viaIA) S.state.registrar('Entrega feita pelo gabarito local — sem IA no momento. Vale como esboço.', 'alerta', p.id);
      } else {
        tarefa.status = 'aberta';
        humor(p, -7, `empaquei em ${tarefa.titulo}`);
        S.state.registrar(`${p.nome} não conseguiu concluir "${tarefa.titulo}".`, 'erro', p.id);
      }
    } catch (err) {
      tarefa.status = 'aberta';
      S.state.registrar(`${p.nome} travou em "${tarefa.titulo}": ${err && err.message || 'erro'}`, 'erro', p.id);
    } finally {
      clearInterval(relogio);
      p.progresso = 1;
      p.ocupado = false; p.tarefa = null;
      await falar(p, ok ? 'Pronto ✓' : 'Travei aqui', 1400);
      p.progresso = 0;
      S.state.gravar(); S.bus.emit('trabalho'); S.bus.emit('equipe');
    }
    return ok;
  }

  /* ---------- contratos ---------- */
  function aceitarContrato(id) {
    const e = S.state.atual(); if (!e) return;
    const c = e.contratos.find(x => x.id === id); if (!c || c.status !== 'oferta') return;
    c.status = 'aceito'; c.aceitoEm = Date.now();
    novaTarefa({
      titulo: c.titulo, kit: c.kit, briefing: c.briefing,
      origem: 'contrato', contrato: c.id
    });
    S.state.registrar(`Contrato aceito: ${c.titulo} · ${S.fmt.brl(c.valor)}.`, 'ok');
    S.state.gravar(); S.bus.emit('trabalho');
  }
  function recusarContrato(id) {
    const e = S.state.atual(); if (!e) return;
    const c = e.contratos.find(x => x.id === id); if (!c) return;
    c.status = 'recusado';
    S.state.gravar(); S.bus.emit('trabalho');
  }
  /* O pagamento é proporcional à qualidade aferida. Entrega fraca não
     recebe cheio — é o que dá peso à decisão de quem faz o quê. */
  function fecharContrato(contratoId, arquivo, qualidade) {
    const e = S.state.atual(); if (!e) return;
    const c = e.contratos.find(x => x.id === contratoId); if (!c || c.status !== 'aceito') return;
    const fator = clamp(0.45 + (qualidade - 45) / 70, 0.35, 1.15);
    const pago = Math.round(c.valor * fator);
    c.status = 'entregue'; c.pago = pago; c.qualidade = qualidade; c.arquivo = arquivo.id; c.entregueEm = Date.now();
    S.market.creditar(e, pago, `contrato ${c.cliente}`);
    S.state.ganharXP(Math.round(pago / 40));
    S.bus.emit('trabalho');
  }

  /* ---------- decisões da gerência (custam 1 chamada barata) ---------- */
  function kitsDisponiveis() {
    const e = S.state.atual();
    return S.factory.disponiveis(S.state.nivelDe(e ? e.xp : 0));
  }
  function kitPorPalavra(texto) {
    const t = String(texto || '').toLowerCase();
    const mapa = [
      ['marca|logo|identidade|paleta', 'marca'],
      ['an[úu]ncio|campanha|tr[áa]fego|ads', 'anuncios'],
      ['e-?mail|newsletter|disparo|fluxo', 'emails'],
      ['cat[áa]logo|planilha|estoque|pre[çc]o', 'catalogo'],
      ['proposta|or[çc]amento|contrato comercial', 'proposta'],
      ['calend[áa]rio|pauta|postagem|conte[úu]do do m[êe]s', 'calendario'],
      ['artigo|blog|texto|seo|seo|autoridade', 'artigo'],
      ['p[áa]gina|site|landing|lan[çc]amento|vender', 'landing']
    ];
    for (const [re, kit] of mapa) if (new RegExp(re).test(t)) return kit;
    return null;
  }

  async function planejar(g) {
    const e = S.state.atual(); if (!e) return;
    const kits = kitsDisponiveis();
    const equipe = rt.filter(p => p.papel === 'func').map(p => `${p.id}=${p.nome}(${p.especialidade})`).join('; ') || 'só a gerente';
    const feitos = e.arquivos.slice(0, 5).map(a => a.nome).join(', ') || 'nada ainda';
    g.ocupado = true; g.estado = 'trabalhando'; g.balao = 'planejando';
    const r = await S.ai.perguntar({
      sistema: `Você é ${g.nome}, sócia-gerente do estúdio ${e.nome} (${e.ramo}). Defina as próximas 3 entregas.
Tipos possíveis (use exatamente o código): ${kits.map(k => k.id).join(', ')}.
Equipe: ${equipe}.
Responda SOMENTE nestas linhas:
KIT1: <código>
PARA1: <id da pessoa>
BRIEF1: <o que entregar, até 14 palavras>
KIT2: <código>
PARA2: <id>
BRIEF2: <até 14 palavras>
KIT3: <código>
PARA3: <id>
BRIEF3: <até 14 palavras>`,
      pedido: `Missão: ${e.missao}. Público: ${e.publico}. Já existe: ${feitos}. Não repita o que já existe.`,
      tokens: 260, agente: g.nome, motivo: 'planejar trabalho'
    });
    g.ocupado = false; g.balao = null; g.estado = 'sentado';
    if (!r) { S.state.registrar(`${g.nome} não conseguiu montar o plano agora.`, 'alerta', g.id); return; }
    let criadas = 0;
    ['1', '2', '3'].forEach(n => {
      const kitId = String(r.campos['kit' + n] || '').trim();
      const kit = S.factory.porId(kitId) || S.factory.porId(kitPorPalavra(r.campos['brief' + n]));
      if (!kit || kit.nivel > S.state.nivelDe(e.xp)) return;
      const alvo = rt.find(p => p.papel === 'func' && p.id === String(r.campos['para' + n] || '').trim());
      const brief = String(r.campos['brief' + n] || kit.desc);
      if (novaTarefa({ titulo: `${kit.nome}: ${brief}`, kit: kit.id, briefing: brief, para: alvo ? alvo.id : null })) criadas++;
    });
    S.state.registrar(criadas ? `${g.nome} colocou ${criadas} entrega(s) no plano.` : `${g.nome} revisou o plano e não viu necessidade de tarefa nova.`, criadas ? 'ok' : 'info', g.id);
  }

  async function avaliar(g) {
    const e = S.state.atual(); if (!e) return;
    const cand = e.arquivos.find(a => (a.classe === 'candidato' || a.classe === 'prototipo') && !a.avaliado);
    if (!cand) return;
    cand.avaliado = true;
    g.ocupado = true; g.balao = 'revisando';
    const r = await S.ai.perguntar({
      sistema: `Você é ${g.nome}, sócia-gerente do estúdio ${e.nome}. Decida se este material já pode ser publicado como produto final, aquele que o cliente recebe. Publicar congela a versão.
Responda SOMENTE nestas linhas:
PUBLICAR: sim ou não
MOTIVO: <até 14 palavras>
CORRECAO: <o que falta, até 14 palavras, ou vazio>`,
      pedido: `Arquivo ${cand.nome} (${cand.tipo}), qualidade aferida ${cand.qualidade}/100, autor ${cand.autor}.\nTrecho: ${String(cand.conteudo).slice(0, 900)}`,
      tokens: 160, agente: g.nome, motivo: 'avaliar entrega'
    });
    g.ocupado = false; g.balao = null;
    if (!r) return;
    if (r.campos.publicar === true && cand.qualidade >= 45) {
      publicar(cand.id, g.nome, String(r.campos.motivo || ''));
      e.decisoes.unshift({ t: Date.now(), tipo: 'publicação', quem: g.nome, texto: `${cand.nome}: ${r.campos.motivo || 'aprovado'}` });
    } else {
      const correcao = String(r.campos.correcao || r.campos.motivo || '').trim();
      S.state.registrar(`${g.nome} segurou ${cand.nome}: ${correcao || 'ainda não está pronto'}.`, 'alerta', g.id);
      e.decisoes.unshift({ t: Date.now(), tipo: 'segurou', quem: g.nome, texto: `${cand.nome}: ${correcao}` });
      if (correcao) novaTarefa({ titulo: `Refazer ${cand.nome}: ${correcao}`, kit: cand.kit, briefing: `${correcao}. Base: ${cand.nome}` });
    }
    if (e.decisoes.length > 20) e.decisoes.length = 20;
    S.state.gravar(); S.bus.emit('negocio');
  }

  /* ---------- ordem do usuário ---------- */
  async function darOrdem(texto) {
    const e = S.state.atual(); if (!e || !texto.trim()) return;
    S.state.registrar(`Você: "${texto}"`, 'info');
    const g = gerente();
    const kits = kitsDisponiveis();
    let criadas = 0;
    if (g && S.ai.pronta()) {
      g.ocupado = true; g.balao = 'anotando';
      const r = await S.ai.perguntar({
        sistema: `Você é ${g.nome}, sócia-gerente do estúdio ${e.nome} (${e.ramo}). Traduza a ordem do sócio em até 3 entregas concretas.
Tipos possíveis (use o código exato): ${kits.map(k => k.id).join(', ')}.
Responda SOMENTE nestas linhas:
KIT1: <código>
BRIEF1: <até 14 palavras>
KIT2: <código ou vazio>
BRIEF2: <até 14 palavras ou vazio>
KIT3: <código ou vazio>
BRIEF3: <até 14 palavras ou vazio>
RESPOSTA: <o que você responde ao sócio, até 18 palavras>`,
        pedido: `Ordem: ${texto}\nMissão: ${e.missao}. Público: ${e.publico}.`,
        tokens: 240, agente: g.nome, motivo: 'interpretar ordem'
      });
      g.ocupado = false; g.balao = null;
      if (r) {
        ['1', '2', '3'].forEach(n => {
          const kit = S.factory.porId(String(r.campos['kit' + n] || '').trim());
          const brief = String(r.campos['brief' + n] || '').trim();
          if (!kit || !brief || kit.nivel > S.state.nivelDe(e.xp)) return;
          if (novaTarefa({ titulo: `${kit.nome}: ${brief}`, kit: kit.id, briefing: brief, origem: 'você' })) criadas++;
        });
        if (r.campos.resposta) await falar(g, String(r.campos.resposta).slice(0, 90), 2600);
      }
    }
    if (!criadas) {
      const kitId = kitPorPalavra(texto) || 'landing';
      const kit = S.factory.porId(kitId);
      if (novaTarefa({ titulo: `${kit.nome}: ${texto.slice(0, 60)}`, kit: kit.id, briefing: texto, origem: 'você' })) criadas = 1;
    }
    S.state.registrar(criadas ? `${criadas} entrega(s) entraram no plano.` : 'Nenhuma tarefa nova foi criada.', criadas ? 'ok' : 'alerta');
    S.bus.emit('trabalho');
  }

  /* Encomenda direta: fura a fila da autonomia e produz agora. */
  async function encomendar(kitId, briefing) {
    const e = S.state.atual(); if (!e) return null;
    const kit = S.factory.porId(kitId); if (!kit) return null;
    const candidatos = rt.filter(p => p.papel === 'func' && !p.ocupado);
    const p = candidatos.find(x => x.especialidade === kit.especialidade) || candidatos[0] || gerente();
    if (!p) return null;
    const t = novaTarefa({ titulo: `${kit.nome}: ${String(briefing).slice(0, 50)}`, kit: kit.id, briefing, para: p.id, origem: 'você' });
    if (!t) return null;
    await executar(p, t);
    return t;
  }

  /* ---------- contratação ---------- */
  function custoContratacao(e) { return 600 + (e.equipe.length - 1) * 350; }
  function contratar(nome, especialidade) {
    const e = S.state.atual(); if (!e) return false;
    const custo = custoContratacao(e);
    if (!S.market.debitar(e, custo, 'contratação')) return 'sem-caixa';
    const esp = ESPECIALIDADES.find(x => x.id === especialidade) || ESPECIALIDADES[4];
    e.equipe.push({
      id: uid('a'), nome: nome || pick(NOMES), papel: 'func', cargo: esp.cargo,
      especialidade: esp.id, cor: S.state.PALETA[e.equipe.length % S.state.PALETA.length],
      energia: 85, humor: 72, entregas: 0, memoria: [], uso: { chamadas: 0, tokens: 0 }
    });
    S.state.registrar(`${e.equipe[e.equipe.length - 1].nome} entrou na equipe como ${esp.cargo}.`, 'ok');
    S.state.gravar(); montar();
    return true;
  }
  function demitir(id) {
    const e = S.state.atual(); if (!e) return;
    const f = e.equipe.find(x => x.id === id); if (!f || f.papel === 'gerente') return;
    e.equipe = e.equipe.filter(x => x.id !== id);
    e.tarefas.forEach(t => { if (t.para === id) t.para = null; });
    S.state.registrar(`${f.nome} deixou a equipe.`, 'alerta');
    S.state.gravar(); montar();
  }

  /* ---------- fundação ---------- */
  function fundar(dados) {
    const nome = String(dados.nome || '').trim() || 'Estúdio Novo';
    const e = S.state.normalizarEstudio({
      id: uid('e'), nome, ramo: dados.ramo, missao: dados.missao, tom: dados.tom, publico: dados.publico,
      criadoEm: Date.now(), xp: 0,
      equipe: [
        { id: 'a0', nome: dados.gerente || 'Ana', papel: 'gerente', cargo: 'Sócia-gerente', especialidade: 'geral', cor: S.state.PALETA[0], energia: 88, humor: 74 },
        { id: 'a1', nome: pick(NOMES), papel: 'func', cargo: 'Criação', especialidade: 'criacao', cor: S.state.PALETA[1], energia: 85, humor: 70 },
        { id: 'a2', nome: pick(NOMES.filter(n => n !== 'Lia')), papel: 'func', cargo: 'Comercial', especialidade: 'comercial', cor: S.state.PALETA[2], energia: 85, humor: 70 }
      ]
    });
    S.market.normalizar(e);
    S.DB.estudios.unshift(e);
    S.DB.atual = e.id;
    S.state.gravarJa();
    S.factory.prospectar(e, 3);
    S.state.registrar(`${nome} foi fundado. Caixa inicial de ${S.fmt.brl(S.market.ECON.capitalInicial)}.`, 'ok');
    S.bus.emit('trocou');   // a UI reconstrói o runtime a partir daqui
    return e;
  }

  /* ---------- motor ---------- */
  async function ciclo(meu) {
    if (meu !== token) return;
    const e = S.state.atual();
    if (!e) return;
    S.market.tick(e);
    S.bus.emit('relogio');

    if (!S.ai.disponivel()) return;

    // Prioridade 1: alguém livre com tarefa aberta.
    const livre = rt.find(p => p.papel === 'func' && !p.ocupado && p.estado !== 'pausa' && (p.ref.energia > 20));
    if (livre) {
      const t = proximaPara(livre);
      if (t && S.ai.reservarAutonomia()) { await executar(livre, t); return; }
    }
    // Prioridade 2: gerência.
    const g = gerente();
    if (g && !g.ocupado && S.ai.reservarAutonomia()) {
      if (tarefasAbertas().length < 2) await planejar(g);
      else await avaliar(g);
    }
  }

  function iniciar(meu) {
    parar();
    const alvo = meu == null ? token : meu;
    motorTimer = setInterval(() => { ciclo(alvo).catch(err => console.error('ciclo', err)); }, 6000);
    vitaisTimer = setInterval(tickVitais, 7000);
    if (!animacao) laco();
  }
  function parar() {
    if (motorTimer) clearInterval(motorTimer);
    if (vitaisTimer) clearInterval(vitaisTimer);
    motorTimer = vitaisTimer = null;
  }

  /* ============================================================
     Desenho do chão. Redesenhado a 30 fps só quando há movimento,
     para não gastar bateria à toa no celular.
     ============================================================ */
  let cv = null, cx = null, larguraLog = 640, alturaLog = 360, ultimo = 0;

  function ajustarCanvas() {
    cv = document.getElementById('floor'); if (!cv) return;
    cx = cv.getContext('2d');
    const linhas = Math.ceil(Math.max(1, rt.length) / (rt.length > 4 ? 3 : 2));
    alturaLog = 74 + linhas * 96 + 96;
    const larguraCSS = (cv.parentElement.clientWidth || 0) - 2;
    if (larguraCSS < 40) return;            // painel oculto: nada a redimensionar
    const escala = larguraCSS / larguraLog;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(larguraLog * escala * dpr);
    cv.height = Math.round(alturaLog * escala * dpr);
    cv.style.height = Math.round(alturaLog * escala) + 'px';
    cx.setTransform(escala * dpr, 0, 0, escala * dpr, 0, 0);
  }

  function rrect(x, y, w, h, r) {
    cx.beginPath();
    cx.moveTo(x + r, y); cx.lineTo(x + w - r, y); cx.quadraticCurveTo(x + w, y, x + w, y + r);
    cx.lineTo(x + w, y + h - r); cx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    cx.lineTo(x + r, y + h); cx.quadraticCurveTo(x, y + h, x, y + h - r);
    cx.lineTo(x, y + r); cx.quadraticCurveTo(x, y, x + r, y); cx.closePath();
  }

  function desenhar(agora) {
    if (!cx) return;
    cx.clearRect(0, 0, larguraLog, alturaLog);
    // piso
    cx.fillStyle = '#13171A'; cx.fillRect(0, 0, larguraLog, alturaLog);
    cx.fillStyle = 'rgba(255,255,255,.035)';
    for (let x = 24; x < larguraLog; x += 40) for (let y = 24; y < alturaLog; y += 40) cx.fillRect(x, y, 1.5, 1.5);

    // estações
    Object.keys(ESTACOES).forEach(k => {
      const s = ESTACOES[k];
      cx.fillStyle = '#181D21'; cx.strokeStyle = '#242B30'; cx.lineWidth = 1;
      rrect(s.x - 40, s.y - 16, 80, 32, 9); cx.fill(); cx.stroke();
      cx.fillStyle = '#5F686C'; cx.font = '500 10px -apple-system,system-ui,sans-serif';
      cx.textAlign = 'center'; cx.fillText(s.rotulo, s.x, s.y + 4);
    });

    // mesas
    rt.forEach(p => {
      cx.fillStyle = '#1A2024'; cx.strokeStyle = '#252C31'; cx.lineWidth = 1;
      rrect(p.mesa.x - 46, p.mesa.y - 16, 92, 34, 8); cx.fill(); cx.stroke();
      cx.fillStyle = p.ocupado ? 'rgba(228,112,62,.32)' : '#20272B';
      rrect(p.mesa.x - 16, p.mesa.y - 9, 32, 20, 4); cx.fill();
    });

    // pessoas
    rt.forEach(p => {
      const { x, y } = p.pos;
      cx.fillStyle = 'rgba(0,0,0,.32)';
      cx.beginPath(); cx.ellipse(x, y + 15, 13, 4.5, 0, 0, Math.PI * 2); cx.fill();

      if (p.ocupado) {
        cx.strokeStyle = 'rgba(228,112,62,.28)'; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(x, y, 18, 0, Math.PI * 2); cx.stroke();
        cx.strokeStyle = '#E4703E'; cx.lineWidth = 3; cx.lineCap = 'round';
        cx.beginPath(); cx.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.progresso); cx.stroke();
        cx.lineCap = 'butt';
      } else if (p.id === selecionado) {
        cx.strokeStyle = '#E9E7E2'; cx.lineWidth = 1.5;
        cx.beginPath(); cx.arc(x, y, 18, 0, Math.PI * 2); cx.stroke();
      }

      cx.fillStyle = p.cor;
      cx.beginPath(); cx.arc(x, y, 13, 0, Math.PI * 2); cx.fill();
      if (p.estado === 'pausa') { cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.arc(x, y, 13, 0, Math.PI * 2); cx.fill(); }

      cx.fillStyle = '#14100D'; cx.font = '700 11px -apple-system,system-ui,sans-serif';
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(p.nome.slice(0, 2).toUpperCase(), x, y + .5);
      cx.textBaseline = 'alphabetic';

      cx.fillStyle = '#8C9497'; cx.font = '500 10px -apple-system,system-ui,sans-serif';
      cx.fillText(p.nome, x, y + 30);

      if (p.papel === 'gerente') {
        cx.fillStyle = '#D9A441';
        cx.beginPath(); cx.arc(x + 11, y - 10, 3.4, 0, Math.PI * 2); cx.fill();
      }

      if (p.balao) {
        const txt = String(p.balao).slice(0, 34);
        cx.font = '500 11px -apple-system,system-ui,sans-serif';
        const w = Math.min(200, cx.measureText(txt).width + 18);
        const bx = clamp(x - w / 2, 6, larguraLog - w - 6), by = y - 46;
        cx.fillStyle = '#EDEBE6'; rrect(bx, by, w, 24, 8); cx.fill();
        cx.beginPath(); cx.moveTo(x - 5, by + 24); cx.lineTo(x + 5, by + 24); cx.lineTo(x, by + 31); cx.fill();
        cx.fillStyle = '#16191B'; cx.textAlign = 'center';
        cx.fillText(txt, bx + w / 2, by + 16);
      }
    });
    void agora;
  }

  function fisica(dt) {
    let mexeu = false;
    rt.forEach(p => {
      if (p.estado === 'andando' && p.alvo) {
        const dx = p.alvo.x - p.pos.x, dy = p.alvo.y - p.pos.y;
        const d = Math.hypot(dx, dy), passo = 78 * dt;
        if (d <= passo) {
          p.pos.x = p.alvo.x; p.pos.y = p.alvo.y; p.alvo = null;
          p.estado = p.ocupado ? 'trabalhando' : 'sentado';
          if (p._chegou) { const f = p._chegou; p._chegou = null; f(); }
        } else { p.pos.x += (dx / d) * passo; p.pos.y += (dy / d) * passo; }
        mexeu = true;
      }
      if (p.ocupado) mexeu = true;
    });
    return mexeu;
  }

  function laco() {
    animacao = requestAnimationFrame(ts => {
      const dt = Math.min(0.05, (ts - (ultimo || ts)) / 1000);
      ultimo = ts;
      const mexeu = fisica(dt);
      if (mexeu || ts - (laco._ultimoDesenho || 0) > 900) { desenhar(ts); laco._ultimoDesenho = ts; }
      laco();
    });
  }

  function cliqueNoChao(ev) {
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const escala = larguraLog / r.width;
    const x = (ev.clientX - r.left) * escala, y = (ev.clientY - r.top) * escala;
    const alvo = rt.find(p => Math.hypot(p.pos.x - x, p.pos.y - y) < 24);
    selecionado = alvo ? alvo.id : null;
    return alvo;
  }

  S.studio = {
    ESPECIALIDADES, NOMES,
    montar, iniciar, parar, ajustarCanvas, cliqueNoChao,
    pessoas: () => rt, pessoa, gerente,
    novaTarefa, tarefasAbertas, executar, darOrdem, encomendar,
    salvarArquivos, publicar,
    aceitarContrato, recusarContrato, contratar, demitir, custoContratacao, fundar,
    selecionado: () => selecionado,
    selecionar(id) { selecionado = id; }
  };
})(window.S);
