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
  let socialTimer = null;
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

  /* ---------- vida social — o chão vira um "sims" mixado. Gente livre
     sai andando sozinha ou puxa assunto com um colega, sem custar
     nenhuma chamada de IA: só figurino, pra dar vida ao estúdio. ---------- */
  async function dizer(p, texto, ms) {
    p.balao = texto;
    await sleep(ms || 1400);
    p.balao = null;
  }
  const PAPOS = [
    ['Você viu a última versão do projeto?', 'Vi. Vou partir dela, não duplicar o trabalho.'],
    ['Essa etapa depende da sua entrega?', 'Sim. Vou deixar o handoff claro para você.'],
    ['O que falta para isso virar produto?', 'Ainda preciso fechar os detalhes de uso público.'],
    ['Posso aproveitar sua base na próxima etapa?', 'Pode. A versão persistida está no projeto.'],
    ['Tem algum dado que eu não devo perder?', 'Sim. Está registrado na entrega anterior.'],
    ['Acho que encontrei um caminho melhor.', 'Mostra depois; se melhorar o produto, incorporamos.']
  ];
  const SOZINHO = ['Vou revisar o que já foi feito.', 'Vou conferir a próxima etapa.', 'Vou organizar o contexto do projeto.'];

  const livres = () => rt.filter(p => !p.ocupado && p.estado === 'sentado');

  async function bateBoca(a, b) {
    if (a.ocupado || b.ocupado || a.estado !== 'sentado' || b.estado !== 'sentado') return;
    const meio = { x: clamp((a.mesa.x + b.mesa.x) / 2 + (Math.random() * 30 - 15), 40, 600), y: 300 + (Math.random() * 16 - 8) };
    a.estado = 'andando'; b.estado = 'andando';
    await Promise.all([irPara(a, meio), irPara(b, { x: meio.x + 24, y: meio.y })]);
    if (a.ocupado || b.ocupado) return;
    a.estado = 'falando'; b.estado = 'falando';
    const chavePapo = (a.id + b.id).split('').reduce((n,ch) => n + ch.charCodeAt(0), 0);
    const [fa, fb] = PAPOS[chavePapo % PAPOS.length];
    await dizer(a, fa, 1500);
    if (!b.ocupado) await dizer(b, fb, 1500);
    await sleep(200);
    if (!a.ocupado) { a.estado = 'andando'; await irPara(a, assento(a)); }
    if (!b.ocupado) { b.estado = 'andando'; await irPara(b, assento(b)); }
  }

  async function darUmaVolta(p) {
    if (p.ocupado || p.estado !== 'sentado') return;
    const destino = ESTACOES[pick(['cafe', 'quadro', 'descanso'])];
    p.estado = 'andando';
    await irPara(p, destino);
    if (p.ocupado) return;
    p.estado = 'falando';
    await dizer(p, pick(SOZINHO), 1300);
    if (p.ocupado) return;
    p.estado = 'andando';
    await irPara(p, assento(p));
  }

  let ultimoEncontro = 0;
  function socializar() {
    if (Date.now() - ultimoEncontro < 26000) return;
    const disponiveis = livres();
    if (disponiveis.length < 2) return;
    const e = S.state.atual();
    const projeto = (e && e.projetos || []).find(x => x.status === 'ativo');
    if (!projeto) return;
    const grupo = disponiveis.filter(p => p.ref.projetoAtual === projeto.id);
    const lista = grupo.length >= 2 ? grupo : disponiveis;
    if (lista.length < 2) return;
    ultimoEncontro = Date.now();
    bateBoca(lista[0], lista[1]).catch(() => {});
  }

  /* ---------- vitais ---------- */
  function tickVitais() {
    const e = S.state.atual(); if (!e) return;
    const hora = new Date().getHours() + new Date().getMinutes()/60;
    const rel = { expediente: hora >= 8 && hora < 18 };
    rt.forEach(p => {
      const f = p.ref;
      if (!f) return;
      // Energia é proporcional ao tempo real, não ao número de ciclos.
      // Um ciclo de 7 s não pode equivaler a horas de trabalho.
      if (p.ocupado) f.energia = clamp(f.energia - 0.12, 0, 100);
      else if (p.estado === 'pausa' || !rel.expediente) f.energia = clamp(f.energia + 0.25, 0, 100);
      else f.energia = clamp(f.energia - 0.015, 0, 100);
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
  /* Memória em camadas, barata e persistente:
     - perfil: fatos estáveis que o agente aprende sobre seu jeito de trabalhar;
     - episódios: últimos acontecimentos relevantes;
     - projeto atual: o que está sendo construído e por quê.
     Nunca enviamos toda a memória para a IA: só os itens relevantes e recentes. */
  function lembrar(p, texto, tipo='episodio', importancia=1, projectId=null) {
    if (!p || !p.ref) return;
    const f = p.ref;
    const item = { texto: String(texto || '').replace(/\s+/g, ' ').slice(0, 180), tipo, importancia, projectId: projectId || f.projetoAtual || null, quando: Date.now() };
    if (!item.texto) return;
    f.memoria = (Array.isArray(f.memoria) ? f.memoria : []).filter(m => {
      const t = typeof m === 'string' ? m : m.texto;
      return String(t || '').toLowerCase() !== item.texto.toLowerCase();
    }).concat(item).slice(-12);
  }
  function foco(p, texto) {
    if (!p || !p.ref) return;
    p.ref.focoAtual = String(texto || '').replace(/\s+/g, ' ').slice(0, 220);
    S.bus.emit('equipe');
  }
  function memoriaRelevante(p, projectId) {
    const f = p && p.ref; if (!f) return [];
    return (f.memoria || []).map(m => typeof m === 'string' ? { texto:m, importancia:1, projectId:null } : m)
      .filter(m => !projectId || !m.projectId || m.projectId === projectId)
      .sort((a,b) => (Number(b.importancia)||1) - (Number(a.importancia)||1) || (Number(b.quando)||0)-(Number(a.quando)||0))
      .slice(0, 5);
  }
  function memoriaPrompt(p, projectId) {
    const itens = memoriaRelevante(p, projectId);
    return itens.length ? '\nMEMÓRIA RELEVANTE DO AGENTE:\n' + itens.map(m => '- ' + m.texto).join('\n') : '';
  }

  /* ---------- arquivos ---------- */
  function salvarArquivos(lista, meta, p) {
    const e = S.state.atual(); if (!e) return [];
    const salvos = lista.map(a => {
      const arq = {
        id: uid('f'), nome: a.nome, tipo: a.tipo, conteudo: String(a.conteudo),
        classe: meta.classe || 'esboco', kit: meta.kit || 'legado', projectId: meta.projectId || (e.projetos[0] && e.projetos[0].id),
        qualidade: meta.qualidade == null ? 50 : meta.qualidade,
        viaIA: Boolean(meta.viaIA), versao: 1, linhagem: slug(a.nome.replace(/\.[a-z0-9]+$/i, '')),
        autor: p ? p.nome : 'equipe', criadoEm: Date.now(), quando: S.fmt.dataHora()
      };
      e.arquivos.unshift(arq);
      return arq;
    });
    /* O site é um artefato vivo: qualquer produto novo do projeto precisa
       aparecer nele. A atualização vira trabalho da equipe, nunca uma cópia
       isolada esquecida. */
    salvos.filter(a => a.classe === 'produto' && a.kit !== 'landing').forEach(produto => {
      const projeto = e.projetos.find(pr => pr.id === produto.projectId);
      if (!projeto) return;
      const site = e.arquivos.find(a => a.projectId === projeto.id && a.classe === 'produto' && a.kit === 'landing');
      const jaExiste = e.tarefas.some(t => t.projectId === projeto.id && t.status !== 'feita' && t.kit === 'landing' && /atualizar site|integrar .* site/i.test(t.titulo));
      if (site && !jaExiste) novaTarefa({
        titulo: `Atualizar site com ${produto.nome}`,
        kit: 'landing',
        briefing: `Atualizar o site existente com o produto ${produto.nome}, preservando produtos, textos e estrutura já publicados.`,
        projectId: projeto.id, baseArquivoId: site.id, origem: 'continuidade-do-projeto'
      });
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
    const proj = e.projetos.find(x => x.id === (base.projectId || '')) || e.projetos.find(x => x.status === 'ativo') || e.projetos[0];
    if (proj) {
      if (!proj.arquivoIds.includes(produto.id)) proj.arquivoIds.unshift(produto.id);
      proj.atividade.unshift({ t: Date.now(), tipo: 'publicacao', texto: `${produto.nome} entrou no projeto.` });
      proj.atividade = proj.atividade.slice(-40);
      // O site é tratado como artefato vivo do projeto: quando um produto novo
      // entra, a equipe agenda a integração em vez de deixar o site desatualizado.
      if (base.kit !== 'landing') {
        const site = e.arquivos.find(a => a.classe === 'produto' && a.kit === 'landing');
        const jaExiste = e.tarefas.some(t => t.status !== 'feita' && t.projectId === proj.id && t.kit === 'landing' && /atualiz|catálogo|catalogo/i.test(t.titulo));
        if (site && !jaExiste) {
          novaTarefa({ titulo: `Atualizar site com ${produto.nome}`, kit: 'landing',
            briefing: `Atualizar o site existente e integrar o novo produto ${produto.nome}; preservar o que já funciona.`,
            projectId: proj.id, baseArquivoId: site.id });
        }
      }
    }
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
    const projeto = e.projetos.find(p => p.id === dados.projectId) || e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    const t = {
      id: uid('t'), titulo, kit: dados.kit || 'landing', briefing: dados.briefing || titulo,
      para: dados.para || null, status: 'aberta', origem: dados.origem || 'gerente',
      projectId: projeto ? projeto.id : null,
      dependsOn: Array.isArray(dados.dependsOn) ? dados.dependsOn : [],
      handoff: dados.handoff || null, criadaEm: Date.now()
    };
    e.tarefas.unshift(t);
    if (projeto) {
      projeto.tarefaIds.unshift(t.id);
      projeto.atividade.unshift({ t: Date.now(), tipo: 'tarefa', texto: `${t.titulo}${t.para ? '' : ' — aguardando distribuição'}` });
      projeto.atividade = projeto.atividade.slice(-40);
    }
    if (e.tarefas.length > 60) e.tarefas.length = 60;
    S.state.gravar(); S.bus.emit('trabalho');
    return t;
  }
  function tarefasAbertas() {
    const e = S.state.atual(); return e ? e.tarefas.filter(t => t.status === 'aberta') : [];
  }
  function dependenciasOK(t) {
    const e = S.state.atual(); if (!e) return false;
    return (t.dependsOn || []).every(id => {
      const dep = e.tarefas.find(x => x.id === id);
      return dep && dep.status === 'feita';
    });
  }
  function proximaPara(p) {
    const abertas = tarefasAbertas().filter(dependenciasOK);
    return abertas.find(t => t.para === p.id)
      || abertas.find(t => !t.para && (S.factory.porId(t.kit) || {}).especialidade === p.especialidade)
      || abertas.find(t => !t.para) || null;
  }

  async function colaborar(p, projectId) {
    const e = S.state.atual(); if (!e || !p || p.ocupado) return;
    const prox = e.tarefas.find(t => t.projectId === projectId && t.status === 'aberta' && t.para && t.para !== p.id);
    if (!prox) return;
    const colega = rt.find(x => x.id === prox.para && !x.ocupado);
    if (!colega) return;
    p.estado = colega.estado = 'falando';
    p.balao = `Handoff: ${prox.titulo.slice(0, 28)}`;
    colega.balao = 'Recebi o contexto.';
    lembrar(p, `Passei contexto para ${colega.nome} sobre a continuidade do projeto.`, 'colaboracao', 3, projectId);
    lembrar(colega, `Recebi contexto de ${p.nome} para continuar ${prox.titulo}.`, 'colaboracao', 3, projectId);
    await sleep(1700);
    if (!p.ocupado) { p.balao = null; p.estado = 'sentado'; }
    if (!colega.ocupado) { colega.balao = null; colega.estado = 'sentado'; }
    S.state.gravar(); S.bus.emit('equipe');
  }

  /* Executa uma tarefa do começo ao fim: uma chamada de IA, um arquivo. */
  async function executar(p, tarefa) {
    const e = S.state.atual(); if (!e) return false;
    p.ocupado = true; p.tarefa = tarefa.titulo; p.progresso = 0;
    p.ref.projetoAtual = tarefa.projectId || p.ref.projetoAtual;
    foco(p, `Estou trabalhando em "${tarefa.titulo}". Minha prioridade é: 1) contribuir para o produto final; 2) deixar algo reutilizável para a equipe.`);
    lembrar(p, `Assumi a etapa "${tarefa.titulo}".`, 'episodio', 2, tarefa.projectId);
    tarefa.status = 'fazendo'; tarefa.para = p.id;
    S.bus.emit('trabalho'); S.bus.emit('equipe');
    S.state.registrar(`${p.nome} assumiu: ${tarefa.titulo}`, 'info', p.id);

    await irPara(p, assento(p));
    p.estado = 'trabalhando';
    const relogio = setInterval(() => { p.progresso = Math.min(0.97, p.progresso + 0.03); }, 400);

    let ok = false;
    try {
      const saida = await S.factory.produzir({ kit: tarefa.kit, briefing: tarefa.briefing, agente: p.ref, projectId: tarefa.projectId, baseArquivoId: tarefa.baseArquivoId });
      if (saida && saida.arquivos.length && saida.classe === 'produto') {
        const salvos = salvarArquivos(saida.arquivos, Object.assign({}, saida, { projectId: tarefa.projectId }), p);
        tarefa.status = 'feita'; tarefa.concluidaEm = Date.now();
        colaborar(p, tarefa.projectId).catch(() => {});
        foco(p, `Concluí a etapa e deixei ${salvos[0].nome} integrado ao projeto. A próxima pessoa deve partir desta versão, não começar do zero.`);
        lembrar(p, `Entreguei ${salvos.map(a => a.nome).join(', ')} para a continuidade do projeto.`, 'episodio', 3, tarefa.projectId);
        tarefa.arquivo = salvos[0].id; tarefa.qualidade = saida.qualidade;
        tarefa.handoff = `${p.nome}: ${salvos.map(a => a.nome).join(', ')} prontos para a próxima etapa.`;
        const proj = e.projetos.find(x => x.id === tarefa.projectId);
        if (proj) {
          salvos.forEach(a => { if (!proj.arquivoIds.includes(a.id)) proj.arquivoIds.unshift(a.id); });
          proj.atividade.unshift({ t: Date.now(), tipo: 'entrega', texto: `${p.nome} concluiu ${tarefa.titulo}.` });
          proj.atividade = proj.atividade.slice(-40);
        }
        ok = true;
        humor(p, 8, `entreguei ${salvos[0].nome}`);
        if (!saida.viaIA) S.state.registrar('Entrega feita pelo gabarito local — sem IA no momento. Vale como esboço.', 'alerta', p.id);
      } else {
        tarefa.status = 'aberta';
        foco(p, `A entrega ainda não atingiu o padrão de produto pronto. Vou preservar o contexto e tentar novamente, sem publicar um rascunho.`);
        lembrar(p, `A primeira tentativa de "${tarefa.titulo}" não passou pelo padrão de produto pronto.`, 'qualidade', 3, tarefa.projectId);
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
      if (ok) lembrar(p, 'Minha produção precisa continuar útil para a equipe, não apenas parecer concluída.', 'principio', 3, tarefa.projectId);
      p.progresso = 0;
      S.state.gravar(); S.bus.emit('trabalho'); S.bus.emit('equipe');
    }
    return ok;
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
    const projeto = e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    if (!projeto) return;
    const equipe = rt.filter(p => p.papel === 'func').map(p => `${p.id}=${p.nome}(${p.especialidade})`).join('; ') || 'só a gerente';
    const recentes = (projeto.arquivoIds || []).slice(0, 6).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean)
      .map(a => `${a.nome} [${a.classe}, q${a.qualidade}]`).join(', ') || 'nenhuma entrega ainda';
    g.ocupado = true; g.estado = 'trabalhando'; g.balao = 'planejando';
    const r = await S.ai.perguntar({
      sistema: `Você é ${g.nome}, sócia-gerente do estúdio ${e.nome}. Trabalhe como gerente de um projeto contínuo, não como um jogo.
Projeto: ${projeto.nome}. Objetivo: ${projeto.objetivo}.
Equipe: ${equipe}.
Entregas existentes: ${recentes}.
Crie no máximo 2 próximas tarefas que realmente dependam do que já foi feito. Prefira revisão, integração, dados, conteúdo e evolução sobre começar do zero.
Tipos: ${kits.map(k => k.id).join(', ')}.
Responda SOMENTE:
KIT1: <código ou vazio>
PARA1: <id ou vazio>
BRIEF1: <até 20 palavras>
DEP1: <id de tarefa anterior ou vazio>
KIT2: <código ou vazio>
PARA2: <id ou vazio>
BRIEF2: <até 20 palavras>
DEP2: <id de tarefa anterior ou vazio>`,
      pedido: `Missão: ${e.missao}. Não crie uma entrega duplicada. Faça a próxima etapa do projeto usando os artefatos persistidos.`,
      tokens: 300, agente: g.nome, motivo: 'planejar projeto'
    });
    g.ocupado = false; g.balao = null; g.estado = 'sentado';
    if (!r) return;
    let criadas = 0;
    ['1','2'].forEach(n => {
      const kitId = String(r.campos['kit'+n] || '').trim();
      const kit = S.factory.porId(kitId) || S.factory.porId(kitPorPalavra(r.campos['brief'+n]));
      if (!kit || kit.nivel > S.state.nivelDe(e.xp)) return;
      const alvo = rt.find(p => p.papel === 'func' && p.id === String(r.campos['para'+n] || '').trim());
      const brief = String(r.campos['brief'+n] || kit.desc).trim();
      const dep = e.tarefas.find(t => t.id === String(r.campos['dep'+n] || '').trim() && t.status === 'feita');
      if (novaTarefa({ titulo: `${kit.nome}: ${brief}`, kit: kit.id, briefing: brief, para: alvo ? alvo.id : null,
        projectId: projeto.id, dependsOn: dep ? [dep.id] : [] })) criadas++;
    });
    S.state.registrar(criadas ? `${g.nome} atualizou o projeto e criou ${criadas} próxima(s) etapa(s).` : `${g.nome} revisou o projeto e manteve o plano.`, criadas ? 'ok' : 'info', g.id);
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

  /* O usuário observa; a equipe decide e distribui o trabalho autonomamente. */

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
      projetos: [{
        id: uid('proj'), nome: 'Projeto principal', objetivo: dados.missao || 'Construir e melhorar o portfólio do estúdio.',
        status: 'ativo', criadoEm: Date.now(), tarefaIds: [], arquivoIds: [], atividade: []
      }],
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
    S.state.registrar(`${nome} foi fundado. Caixa inicial de ${S.fmt.brl(S.market.ECON.capitalInicial)}.`, 'ok');
    S.bus.emit('trocou');   // a UI reconstrói o runtime a partir daqui
    return e;
  }

  /* ---------- motor ---------- */
  async function ciclo(meu) {
    if (meu !== token) return;
    const e = S.state.atual();
    if (!e) return;
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
    socialTimer = setInterval(socializar, 4500);
    if (!animacao) laco();
  }
  function parar() {
    if (motorTimer) clearInterval(motorTimer);
    if (vitaisTimer) clearInterval(vitaisTimer);
    if (socialTimer) clearInterval(socialTimer);
    motorTimer = vitaisTimer = socialTimer = null;
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

      // Sprite vetorial: cabeça, cabelo, roupa, braços e pernas.
      // Mantém leitura clara mesmo em telas pequenas e dá identidade por agente.
      const pulse = p.ocupado ? Math.sin(agora / 150) * 1.2 : 0;
      const skin = ['#E8B08A','#C9825B','#F0C29B','#A96448'][Math.abs(p.id.charCodeAt(1) || 0) % 4];
      const hair = p.papel === 'gerente' ? '#24272A' : ['#2A211D','#6B3F2A','#B87943','#30343A'][Math.abs(p.id.charCodeAt(2) || 0) % 4];
      // pernas
      cx.strokeStyle = '#202428'; cx.lineWidth = 4; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(x-5,y+10); cx.lineTo(x-6,y+18); cx.moveTo(x+5,y+10); cx.lineTo(x+6,y+18); cx.stroke();
      // corpo
      cx.fillStyle = p.cor; rrect(x-9,y-1+pulse,18,15,6); cx.fill();
      // braços
      cx.strokeStyle = p.cor; cx.lineWidth = 5;
      cx.beginPath(); cx.moveTo(x-8,y+3+pulse); cx.lineTo(x-13,y+10+pulse); cx.moveTo(x+8,y+3+pulse); cx.lineTo(x+13,y+10+pulse); cx.stroke();
      // pescoço + cabeça
      cx.fillStyle = skin; rrect(x-3.5,y-8+pulse,7,6,2); cx.fill();
      cx.beginPath(); cx.arc(x,y-11+pulse,9,0,Math.PI*2); cx.fill();
      // cabelo
      cx.fillStyle = hair; cx.beginPath(); cx.arc(x,y-13+pulse,9.3,Math.PI,Math.PI*2); cx.fill();
      cx.fillRect(x-9,y-14+pulse,18,4);
      // olhos
      cx.fillStyle = '#202124'; cx.fillRect(x-4,y-11+pulse,2,2); cx.fillRect(x+2,y-11+pulse,2,2);
      // notebook quando trabalhando
      if (p.ocupado) {
        cx.fillStyle = '#D6D9D7'; rrect(x-8,y+1+pulse,16,8,2); cx.fill();
        cx.fillStyle = '#7C8588'; cx.fillRect(x-6,y+3+pulse,12,1.5);
      }
      // pausa
      if (p.estado === 'pausa') { cx.fillStyle = 'rgba(0,0,0,.42)'; cx.beginPath(); cx.arc(x,y-4,12,0,Math.PI*2); cx.fill(); }
      // seleção
      if (p.id === selecionado) {
        cx.strokeStyle = '#E9E7E2'; cx.lineWidth = 1.5;
        cx.beginPath(); cx.roundRect(x-16,y-25,x*0+32,48,9); cx.stroke();
      }
      cx.fillStyle = '#8C9497'; cx.font = '600 10px -apple-system,system-ui,sans-serif';
      cx.textAlign = 'center'; cx.fillText(p.nome, x, y + 30);
      if (p.papel === 'gerente') {
        cx.fillStyle = '#D9A441'; cx.beginPath(); cx.arc(x + 10, y - 23, 3.4, 0, Math.PI * 2); cx.fill();
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
    novaTarefa, tarefasAbertas, executar,
    salvarArquivos, publicar,
    contratar, demitir, custoContratacao, fundar,
    selecionado: () => selecionado,
    selecionar(id) { selecionado = id; }
  };
})(window.S);
