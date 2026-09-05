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
    reuniao: { x: 320, y: 300, rotulo: 'sala de reunião' },
    quadro: { x: 550, y: 300, rotulo: 'quadro' },
    descanso: { x: 320, y: 346, rotulo: 'descanso' }
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
  function logPessoa(p, texto, tag) { if (p && p.id) S.state.registrarPessoa(p.id, texto, tag || 'info'); }
  function logEscritorio(texto, tag) { S.state.registrar(texto, tag || 'info'); }
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

  /* ---------- vida social e colaboração ----------
     Conversas casuais não são frases pré-fabricadas. Quando duas pessoas
     têm disponibilidade e existe um contexto plausível (projeto, tarefa,
     entrega ou rotina), elas conversam com a própria personalidade. A fala
     vira também memória e log individual dos dois participantes. */
  const livres = () => rt.filter(p => !p.ocupado && p.estado === 'sentado' && p.ref.energia > 28);

  function perfilTexto(p) {
    const f = p.ref || {};
    const per = f.personalidade || {};
    return `${p.nome} | ${p.cargo} | especialidade=${p.especialidade}\nTraços: ${(per.tracos||[]).join(', ')}\nComunicação: ${per.comunicacao||'direta e cordial'}\nPrioridades: ${per.prioridades||'qualidade e utilidade'}\nEstilo: ${per.estilo||'prático'}\nColaboração: ${per.colaboracao||'faz handoff claro'}\nEvita: ${per.aversoes||'retrabalho'}\nExperiência: ${per.experiencia||p.cargo}`;
  }

  function contextoSocial(a,b) {
    const e=S.state.atual(); if(!e) return '';
    const projeto=e.projetos.find(x=>x.status==='ativo')||e.projetos[0];
    const tarefas=e.tarefas.filter(t=>t.status!=='feita').slice(0,6).map(t=>`${t.titulo} | ${t.status} | responsável=${(e.equipe.find(x=>x.id===t.para)||{}).nome||'livre'}`).join('\n')||'sem tarefas abertas';
    const arquivos=e.arquivos.slice(0,8).map(x=>`${x.nome} | ${x.classe} | q${x.qualidade}`).join('\n')||'sem entregas recentes';
    return `Projeto: ${projeto?projeto.nome:'principal'} | objetivo=${projeto?projeto.objetivo:e.missao}\nTarefas abertas:\n${tarefas}\nEntregas recentes:\n${arquivos}\n\n${perfilTexto(a)}\n\n${perfilTexto(b)}`.slice(0,7000);
  }

  function memorizarInteracao(a,b,texto) {
    const t=Date.now();
    const pares=[a,b];
    pares.forEach(p=>{
      const f=p.ref; if(!f) return;
      f.memoria=(f.memoria||[]).concat({texto:`Interação com ${p===a?b.nome:a.nome}: ${texto}`.slice(0,220),t}).slice(-24);
    });
  }

  async function bateBoca(a,b) {
    if (!a || !b || a.ocupado || b.ocupado || a.estado !== 'sentado' || b.estado !== 'sentado') return;
    const meio={x:clamp((a.mesa.x+b.mesa.x)/2,70,570),y:300};
    a.estado='andando'; b.estado='andando';
    await Promise.all([irPara(a,meio),irPara(b,{x:meio.x+24,y:meio.y})]);
    if(a.ocupado||b.ocupado) return;
    a.estado=b.estado='falando';
    const e=S.state.atual(); const projeto=e && (e.projetos.find(x=>x.status==='ativo')||e.projetos[0]);
    const historico=(e && e.reuniao && e.reuniao.mensagens || []).slice(-6).map(m=>`[${m.quem}] ${m.texto}`).join('\n');
    const base=`Vocês são dois colegas reais no mesmo estúdio. Esta é uma conversa espontânea de trabalho, não uma reunião formal. Não use frases genéricas nem invente acontecimentos. Fale a partir da tarefa, projeto, personalidade e memória reais. A conversa deve ter utilidade: trocar informação, pedir ajuda, avisar de um risco, reconhecer uma entrega ou combinar um próximo passo. Pode ser breve e humana.\n\nCONTEXTO:\n${contextoSocial(a,b)}\n\nProjeto atual: ${projeto?projeto.nome:'principal'}\nHistórico social/reunião recente:\n${historico||'nenhum'}`;
    let fa='',fb='';
    try {
      const ra=await S.ai.perguntar({sistema:base+`\n\nVocê é ${a.nome}. Responda somente:\nFALA: <até 45 palavras>`,pedido:`Você encontrou ${b.nome} no estúdio. Inicie uma conversa que tenha relação com o trabalho atual.`,tokens:120,agente:a.nome,motivo:'interação entre colegas'});
      fa=ra?String(ra.campos.fala||'').trim():'';
      if(fa){ registrarReuniao(a.nome,fa,'interacao'); logPessoa(a,`conversou com ${b.nome}: ${fa}`,'interacao'); a.ref.pensamento=fa.slice(0,220); }
      const rb=await S.ai.perguntar({sistema:base+`\n\nVocê é ${b.nome}. Responda somente:\nFALA: <até 45 palavras>`,pedido:`${a.nome} disse: ${fa||'Quero alinhar o que estamos fazendo.'}\nResponda naturalmente, acrescente informação ou faça uma pergunta útil.`,tokens:120,agente:b.nome,motivo:'interação entre colegas'});
      fb=rb?String(rb.campos.fala||'').trim():'';
      if(fb){ registrarReuniao(b.nome,fb,'interacao'); logPessoa(b,`conversou com ${a.nome}: ${fb}`,'interacao'); b.ref.pensamento=fb.slice(0,220); }
      if(fa||fb) memorizarInteracao(a,b,`${fa||'…'} ${fb||''}`.trim());
    } catch(err) {
      // Sem IA, não inventamos diálogo. Apenas registramos que a interação não ocorreu.
      logPessoa(a,`encontrou ${b.nome}, mas a conversa não foi gerada porque a IA estava indisponível.`,'interacao');
      logPessoa(b,`encontrou ${a.nome}, mas a conversa não foi gerada porque a IA estava indisponível.`,'interacao');
    }
    await sleep(500);
    if(!a.ocupado){a.estado='andando';await irPara(a,assento(a));}
    if(!b.ocupado){b.estado='andando';await irPara(b,assento(b));}
    S.state.gravar(); S.bus.emit('reuniao'); S.bus.emit('equipe');
  }

  function socializar() {
    const disponiveis=livres();
    if(disponiveis.length<2 || Math.random()>0.38) return;
    const shuf=disponiveis.slice().sort(()=>Math.random()-0.5);
    bateBoca(shuf[0],shuf[1]).catch(()=>{});
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
      const agora = Date.now();
      f.cuidados = f.cuidados || {};
      if (rel.expediente && f.energia < 62 && agora - (f.cuidados.ultimo || 0) > 12 * 60 * 1000 && !p.ocupado) {
        f.cuidados.ultimo = agora; f.cuidados.pausa = (f.cuidados.pausa || 0) + 1;
        p.estado = 'pausa';
        const est = f.energia < 42 ? ESTACOES.descanso : ESTACOES.cafe;
        logPessoa(p, f.energia < 42 ? 'fez uma pausa de recuperação antes de retomar o trabalho.' : 'fez uma pausa curta para água/café e reorganização.', 'bem-estar');
        irPara(p, est).then(() => setTimeout(() => { if (p.estado === 'pausa') irPara(p, assento(p)).then(() => { p.estado = 'sentado'; logPessoa(p, 'retomou as atividades após a pausa.', 'bem-estar'); }); }, 9000));
      }
      if (rel.expediente && agora - (f.cuidados.agua || 0) > 25 * 60 * 1000 && !p.ocupado) {
        f.cuidados.agua = agora;
        logPessoa(p, 'fez uma pausa breve para hidratação.', 'bem-estar');
      }
      if (f.energia < 18 && p.estado !== 'pausa' && !p.ocupado) {
        p.estado = 'pausa';
        logPessoa(p, 'interrompeu o trabalho para recuperação: energia baixa.', 'bem-estar');
        irPara(p, ESTACOES.descanso).then(() => setTimeout(() => { if (p.estado === 'pausa') irPara(p, assento(p)).then(() => { p.estado = 'sentado'; logPessoa(p, 'retomou o trabalho após recuperação.', 'bem-estar'); }); }, 9000));
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
    const item = { texto: String(texto).slice(0, 180), t: Date.now() };
    p.ref.memoria = (p.ref.memoria || []).concat(item).slice(-12);
    p.ref.pensamento = String(texto).slice(0, 220);
    S.state.gravar();
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

  /* Artefatos em produção podem ser corrigidos. Produto final é imutável:
     qualquer correção após publicação gera uma nova versão por nova tarefa. */
  function editarArquivo(arqId, novoConteudo, novoNome) {
    const e = S.state.atual(); if (!e) return false;
    const a = e.arquivos.find(x => x.id === arqId);
    if (!a) return false;
    if (a.classe === 'produto') {
      S.state.registrar(`Tentativa de editar ${a.nome} bloqueada: produto final é imutável.`, 'alerta');
      return false;
    }
    const conteudo = String(novoConteudo == null ? '' : novoConteudo).trim();
    if (!conteudo) return false;
    a.conteudo = conteudo;
    if (novoNome && String(novoNome).trim()) a.nome = String(novoNome).trim();
    a.editadoEm = Date.now();
    a.quando = S.fmt.dataHora();
    a.versaoEdicao = Number(a.versaoEdicao || 0) + 1;
    a.qualidade = Math.min(Number(a.qualidade || 50), 69);
    if (a.classe === 'candidato') a.classe = 'prototipo';
    a.avaliado = false;
    S.state.registrar(`${a.nome} foi editado em produção e voltou para revisão.`, 'info');
    S.state.gravar();
    S.bus.emit('arquivos'); S.bus.emit('trabalho'); S.bus.emit('equipe');
    return true;
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

  /* Executa uma tarefa do começo ao fim: uma chamada de IA, um arquivo. */
  async function executar(p, tarefa) {
    const e = S.state.atual(); if (!e) return false;
    p.ocupado = true; p.tarefa = tarefa.titulo; p.progresso = 0;
    p.ref.foco = tarefa.titulo;
    p.ref.pensamento = `Estou trabalhando em ${tarefa.titulo}. Preciso deixar um resultado que avance o produto final e seja útil para a próxima pessoa.`;
    tarefa.status = 'fazendo'; tarefa.para = p.id;
    S.bus.emit('trabalho'); S.bus.emit('equipe');
    S.state.registrar(`${p.nome} assumiu: ${tarefa.titulo}`, 'info', p.id);
    logPessoa(p, `iniciou a tarefa "${tarefa.titulo}". Conferindo briefing, dependências e materiais já produzidos.`, 'trabalho');

    await irPara(p, assento(p));
    p.estado = 'trabalhando';
    logPessoa(p, `está executando "${tarefa.titulo}" sobre o contexto persistido do projeto.`, 'trabalho');
    const relogio = setInterval(() => { p.progresso = Math.min(0.97, p.progresso + 0.03); }, 400);

    let ok = false;
    try {
      const saida = await S.factory.produzir({ kit: tarefa.kit, briefing: tarefa.briefing, agente: p.ref, projectId: tarefa.projectId, taskId: tarefa.id, baseArquivoId: tarefa.baseArquivoId });
      if (saida && saida.arquivos.length) {
        const salvos = salvarArquivos(saida.arquivos, Object.assign({}, saida, { projectId: tarefa.projectId }), p);
        tarefa.status = 'feita'; tarefa.concluidaEm = Date.now();
        logPessoa(p, `concluiu "${tarefa.titulo}"; o resultado foi registrado e entregue à próxima etapa.`, 'entrega');
        p.ref.pensamento = `Concluí ${tarefa.titulo}. Agora verifico se o que produzi realmente ajuda o produto final e se outra pessoa consegue continuar daqui.`;
        lembrar(p, `Concluí ${tarefa.titulo}; entrega vinculada ao projeto ${tarefa.projectId || 'principal'}.`);
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
        logPessoa(p, `não conseguiu concluir "${tarefa.titulo}"; deixou a tarefa aberta para recuperação ou revisão.`, 'alerta');
        humor(p, -7, `empaquei em ${tarefa.titulo}`);
        S.state.registrar(`${p.nome} não conseguiu concluir "${tarefa.titulo}".`, 'erro', p.id);
      }
    } catch (err) {
      tarefa.status = 'aberta';
      logPessoa(p, `encontrou um erro durante "${tarefa.titulo}" e registrou a falha para retomada.`, 'erro');
      S.state.registrar(`${p.nome} travou em "${tarefa.titulo}": ${err && err.message || 'erro'}`, 'erro', p.id);
    } finally {
      clearInterval(relogio);
      p.progresso = 1;
      p.ocupado = false; p.tarefa = null; p.ref.foco = '';
      if (!p.ref.pensamento) p.ref.pensamento = 'Estou disponível para contribuir com a próxima etapa do projeto.';
      await falar(p, ok ? 'Pronto ✓' : 'Travei aqui', 1400);
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

  function planejarLocal(g) {
    const e = S.state.atual(); if (!e || !g) return 0;
    const projeto = e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    if (!projeto) return 0;
    const abertas = e.tarefas.filter(t => t.status !== 'feita');
    if (abertas.length >= 2) return 0;
    const arquivos = (projeto.arquivoIds || []).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean);
    const temSite = arquivos.some(a => a.classe === 'produto' && a.kit === 'landing');
    const temCatalogo = arquivos.some(a => /cat[aá]logo/i.test(a.nome) || a.kit === 'catalogo');
    let spec = null;
    if (!temSite) spec = { kit:'landing', titulo:'Construir a presença inicial do projeto', briefing:'Criar a primeira página completa usando a missão, público e identidade já definidos.' };
    else if (temCatalogo) spec = { kit:'landing', titulo:'Revisar e integrar o catálogo ao site existente', briefing:'Verificar se o site apresenta corretamente os produtos já produzidos e integrar o que estiver faltando.' };
    else spec = { kit:'catalogo', titulo:'Organizar os produtos já produzidos', briefing:'Consolidar os produtos existentes em um catálogo coerente para alimentar as próximas etapas do projeto.' };
    const kit = S.factory.porId(spec.kit);
    if (!kit || kit.nivel > S.state.nivelDe(e.xp)) return 0;
    const funcs = rt.filter(p => p.papel === 'func' && !p.ocupado && p.ref.energia > 20);
    const alvo = funcs.find(p => p.ref.especialidade === kit.especialidade) || funcs[0];
    const t = novaTarefa({ titulo: spec.titulo, kit: kit.id, briefing: spec.briefing, para: alvo ? alvo.id : null, projectId: projeto.id, origem:'supervisão local' });
    if (t) {
      logPessoa(g, `revisou o estado do projeto sem depender de IA e abriu a próxima etapa: "${t.titulo}".`, 'supervisao');
      S.state.registrar(`${g.nome} manteve o projeto em movimento com uma etapa operacional local.`, 'info', g.id);
      return 1;
    }
    return 0;
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
    if (r.campos.publicar === true && cand.qualidade >= 82) {
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

  /* ============================================================
     CICLO ESTRATÉGICO DA EQUIPE
     Ideias não pertencem exclusivamente à gerente. Quando uma etapa
     termina e não existe outra necessidade concreta, a própria equipe
     observa o trabalho, levanta oportunidades e escolhe coletivamente
     uma próxima iniciativa. Um marco de produção concluído libera um
     novo ciclo; não existe cronômetro de "gerar ideia".
     ============================================================ */
  function marcoIdeacao(e) {
    const feitas = (e.tarefas || []).filter(t => t.status === 'feita').length;
    const produtos = (e.arquivos || []).filter(a => a.classe === 'produto').length;
    const projetos = (e.projetos || []).length;
    return `${feitas}|${produtos}|${projetos}`;
  }

  function registrarIdeia(ideia) {
    const e = S.state.atual(); if (!e) return;
    e.ideias = Array.isArray(e.ideias) ? e.ideias : [];
    e.ideias.unshift({
      id: uid('ideia'), t: Date.now(), status: ideia.status || 'selecionada',
      titulo: String(ideia.titulo || 'Nova oportunidade').slice(0, 180),
      objetivo: String(ideia.objetivo || '').slice(0, 360),
      proposta: String(ideia.proposta || '').slice(0, 500),
      participantes: ideia.participantes || [],
      projetoId: ideia.projetoId || null
    });
    e.ideias = e.ideias.slice(0, 40);
    S.state.gravar(); S.bus.emit('ideias');
  }

  function idearLocal() {
    const e = S.state.atual(); if (!e) return false;
    const projeto = e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    if (!projeto) return false;
    const marco = marcoIdeacao(e);
    if (e.estrategia && e.estrategia.ultimoMarcoIdeacao === marco) return false;
    const funcs = rt.filter(p => p.papel === 'func' && p.ref.energia > 25);
    if (funcs.length < 1) return false;
    const produtos = e.arquivos.filter(a => a.classe === 'produto');
    const spec = produtos.length ? {
      titulo:'Evoluir e integrar o portfólio existente',
      objetivo:'Criar uma evolução útil a partir dos produtos já produzidos, evitando começar novamente do zero.',
      brief:'Revisar os produtos existentes e identificar a integração ou melhoria de maior impacto para o projeto.'
    } : {
      titulo:'Construir a primeira entrega completa do projeto',
      objetivo:'Transformar a missão do estúdio em uma primeira entrega concreta e utilizável.',
      brief:'Definir a estrutura e os requisitos da primeira entrega completa usando o contexto persistido do projeto.'
    };
    const participantes = funcs.slice(0,3).map(p => ({id:p.id,nome:p.nome,fala:`Como ${p.cargo}, vou avaliar ${spec.titulo.toLowerCase()} usando o que já existe no projeto.`}));
    participantes.forEach(x => { const p=rt.find(y=>y.id===x.id); if(p){ registrarReuniao(p.nome,x.fala,'ideia'); logPessoa(p,`participou da ideação da equipe: ${spec.titulo}`,'ideia'); } });
    registrarIdeia({titulo:spec.titulo, objetivo:spec.objetivo, proposta:spec.brief, participantes, projetoId:projeto.id});
    registrarReuniao('Equipe',`Decisão coletiva: ${spec.titulo}. ${spec.brief}`,'decisao');
    const kit = produtos.length ? S.factory.porId('landing') : S.factory.porId('landing');
    const alvo = funcs.find(p=>p.ref.especialidade===kit.especialidade) || funcs[0];
    const t=novaTarefa({titulo:`${kit.nome}: ${spec.brief}`,kit:kit.id,briefing:spec.brief,para:alvo.id,projectId:projeto.id,origem:'decisão da equipe'});
    e.estrategia=e.estrategia||{}; e.estrategia.ultimoMarcoIdeacao=marco; e.estrategia.ultimaIdeia=Date.now();
    S.state.gravar(); S.bus.emit('reuniao'); return !!t;
  }

  async function idearComEquipe() {
    const e=S.state.atual(); if(!e) return false;
    const projeto=e.projetos.find(p=>p.status==='ativo')||e.projetos[0]; if(!projeto) return false;
    const abertas=e.tarefas.filter(t=>t.status!=='feita');
    const pendentes=e.arquivos.filter(a=>['candidato','prototipo'].includes(a.classe)&&!a.avaliado);
    if(abertas.length||pendentes.length) return false;
    const marco=marcoIdeacao(e); if(e.estrategia&&e.estrategia.ultimoMarcoIdeacao===marco) return false;
    const r=await reuniaoInterna('definir a próxima iniciativa do estúdio');
    if(!r) return false;
    const d=r.decisao||{};
    const titulo=d.texto||'Próxima iniciativa definida pela equipe';
    const brief=d.brief||'Transformar a decisão da reunião em uma primeira etapa concreta usando o trabalho já existente.';
    const kit=S.factory.porId(d.kit)||S.factory.porId(kitPorPalavra(brief));
    const participantes=(r.participantes||[]).map(p=>({id:p.id,nome:p.nome,fala:(r.falas||[]).find(x=>x.id===p.id)?.texto||''}));
    registrarIdeia({titulo,objetivo:brief,proposta:d.texto||brief,participantes,projetoId:projeto.id});
    projeto.atividade.unshift({t:Date.now(),tipo:'ideia',texto:`Equipe decidiu em reunião: ${titulo}.`});
    if(kit){const alvo=r.participantes.find(p=>p.papel==='func'&&p.ref.especialidade===kit.especialidade)||r.participantes.find(p=>p.papel==='func');const t=novaTarefa({titulo:`${kit.nome}: ${brief}`,kit:kit.id,briefing:brief,para:alvo?alvo.id:null,projectId:projeto.id,origem:'reunião da equipe'});if(t)registrarReuniao('Sistema',`Primeira etapa da decisão: ${t.titulo}${alvo?' → '+alvo.nome:''}.`,'ordem');}
    e.estrategia=e.estrategia||{};e.estrategia.ultimoMarcoIdeacao=marco;e.estrategia.ultimaIdeia=Date.now();S.state.gravar();S.bus.emit('ideias');return true;
  }

  /* O usuário observa; a equipe decide e distribui o trabalho autonomamente. */

  /* A gerente observa a operação continuamente: carga, gargalos, qualidade,
     dependências e cobertura de especialidades. Só recomenda contratação quando
     existe uma necessidade operacional sustentada. */
  function monitorarEquipe(g) {
    const e = S.state.atual(); if (!e || !g) return;
    const agora = Date.now();
    if (agora - (e.gerencia && e.gerencia.ultimaAvaliacao || 0) < 30000) return;
    e.gerencia = e.gerencia || {};
    const funcs = e.equipe.filter(x => x.papel !== 'gerente');
    const abertas = e.tarefas.filter(t => t.status !== 'feita');
    const porPessoa = funcs.map(f => {
      const minhas = e.tarefas.filter(t => t.para === f.id);
      const feitas = minhas.filter(t => t.status === 'feita').length;
      const ativas = minhas.filter(t => t.status === 'fazendo').length;
      const travadas = minhas.filter(t => t.status !== 'feita' && t.dependsOn && t.dependsOn.some(id => { const d=e.tarefas.find(x=>x.id===id); return d && d.status!=='feita'; })).length;
      return { f, feitas, ativas, travadas };
    });
    const alertas = [];
    porPessoa.forEach(x => {
      if (x.ativas > 1) alertas.push(`${x.f.nome} está com ${x.ativas} tarefas simultâneas.`);
      if (x.travadas > 0) alertas.push(`${x.f.nome} tem ${x.travadas} tarefa(s) aguardando dependências.`);
      if ((x.f.energia || 0) < 25) alertas.push(`${x.f.nome} está com baixa energia; redistribuir antes de sobrecarregar.`);
    });
    const especialidades = funcs.map(f => f.especialidade);
    const faltantes = S.studio.ESPECIALIDADES.filter(x => !especialidades.includes(x.id)).map(x => x.cargo);
    let rec = abertas.length > Math.max(2, funcs.length * 2) ? `Carga acima da capacidade atual: ${abertas.length} etapas abertas para ${funcs.length} funcionários.` : 'Carga compatível com a equipe atual.';
    if (faltantes.length && abertas.length > funcs.length) rec += ` Cobertura ausente: ${faltantes.slice(0,2).join(' e ')}.`;
    if (!funcs.length) rec = 'Não há funcionários além da gerente; avaliar contratação para executar produção.';
    e.gerencia.ultimaAvaliacao = agora;
    e.gerencia.recomendacao = rec;
    // A supervisão gera uma trilha legível, mas sem registrar a mesma coisa a cada ciclo.
    porPessoa.forEach(x => {
      const f = x.f; f.log = Array.isArray(f.log) ? f.log : [];
      const ultimo = Number(f.ultimaSupervisao || 0);
      if (agora - ultimo > 120000) {
        f.ultimaSupervisao = agora;
        const situacao = x.travadas ? `tem ${x.travadas} dependência(s) bloqueando` : x.ativas ? `está executando ${x.ativas} tarefa(s)` : 'está disponível para a próxima etapa';
        S.state.registrarPessoa(f.id, `supervisão: ${situacao}; energia ${Math.round(f.energia || 0)}/100; ${x.feitas} tarefa(s) concluída(s) no histórico recente.`, x.travadas ? 'alerta' : 'supervisão');
      }
    });
    e.gerencia.alertas = alertas.slice(-20);
    g.ref.foco = 'Monitorando desempenho, gargalos e necessidade de equipe';
    g.ref.pensamento = `Acompanho carga, qualidade, dependências e capacidade da equipe. ${rec}`.slice(0,240);
    if (alertas.length) S.state.registrar(`${g.nome}: ${alertas[0]}`, 'alerta', g.id);
    if (abertas.length > Math.max(3, funcs.length * 3) && faltantes.length) S.state.registrar(`${g.nome} recomenda avaliar nova contratação para ${faltantes[0]}.`, 'info', g.id);
    S.state.gravar(); S.bus.emit('equipe'); S.bus.emit('gerencia');
  }

  /* ---------- reuniões internas presenciais ---------- */
  async function reuniaoInterna(motivo, opcoes) {
    const e=S.state.atual(); if(!e) return null;
    e.reuniao=e.reuniao||{mensagens:[],relatorios:[],reunioes:[]};
    if(e.reuniao.reuniaoAtiva) return null;
    const pessoas=rt.filter(p=>p.ref.energia>30 && !p.ocupado && p.estado==='sentado');
    const g=gerente();
    if(g && !pessoas.includes(g)) pessoas.push(g);
    const participantes=pessoas.slice(0,4);
    if(participantes.length<2) return null;
    e.reuniao.reuniaoAtiva={inicio:Date.now(),motivo,participantes:participantes.map(p=>p.id)};
    registrarReuniao('Sistema',`Reunião interna iniciada: ${motivo}. Participantes: ${participantes.map(p=>p.nome).join(', ')}.`,'reuniao-inicio');
    S.state.registrar(`Reunião interna iniciada para ${motivo}.`,'reuniao');
    const mesa={x:ESTACOES.reuniao.x,y:ESTACOES.reuniao.y};
    participantes.forEach(p=>{p.ocupado=true;p.estado='andando';p.alvo=mesa;});
    await Promise.all(participantes.map(p=>irPara(p,{x:mesa.x+(participantes.indexOf(p)-1.5)*24,y:mesa.y})));
    participantes.forEach(p=>{p.estado='falando';p.ref.foco=`Reunião: ${motivo}`;});
    const projeto=e.projetos.find(x=>x.status==='ativo')||e.projetos[0];
    const base=`Você está em uma reunião presencial do estúdio. Não revele raciocínio interno. Fale apenas o que um colega poderia dizer em voz alta. Use sua personalidade e fatos reais.\nESTÚDIO=${e.nome}; MISSÃO=${e.missao}\nPROJETO=${projeto?projeto.nome:'principal'}; OBJETIVO=${projeto?projeto.objetivo:e.missao}\nPERSONALIDADE:\n${participantes.map(perfilTexto).join('\n---\n')}\nTAREFAS=${e.tarefas.filter(t=>t.status!=='feita').slice(0,8).map(t=>t.titulo+' ['+t.status+']').join(' | ')||'nenhuma'}\nENTREGAS=${e.arquivos.slice(0,8).map(a=>a.nome+' ['+a.classe+', q'+a.qualidade+']').join(' | ')||'nenhuma'}\nMOTIVO DA REUNIÃO=${motivo}`.slice(0,9000);
    const falas=[];
    for(const p of participantes.filter(x=>x!==g)){
      const historico=falas.map(x=>`[${x.nome}] ${x.texto}`).join('\n')||'ninguém falou ainda';
      const r=await S.ai.perguntar({sistema:base+`\n\nVocê é ${p.nome}. Responda somente:\nFALA: <até 55 palavras>`,pedido:`Histórico desta reunião:\n${historico}\nContribua de forma concreta para ${motivo}. Se outro colega precisar de algo, mencione a dependência.`,tokens:140,agente:p.nome,motivo:'reunião interna'});
      const texto=r?String(r.campos.fala||'').trim():'';
      if(texto){falas.push({id:p.id,nome:p.nome,texto});registrarReuniao(p.nome,texto,'reuniao');logPessoa(p,`na reunião sobre ${motivo}: ${texto}`,'reuniao');p.ref.memoria=(p.ref.memoria||[]).concat({texto:`Reunião com a equipe sobre ${motivo}: ${texto}`.slice(0,220),t:Date.now()}).slice(-24);p.ref.pensamento=texto.slice(0,220);}
    }
    let decisao=null;
    if(g){
      const historico=falas.map(x=>`[${x.nome}] ${x.texto}`).join('\n')||'sem contribuições';
      const r=await S.ai.perguntar({sistema:base+`\n\nVocê é ${g.nome}, sócia-gerente. Escute as falas e feche a reunião sem microgerenciar. Responda somente:\nFALA: <até 55 palavras>\nDECISAO: <decisão prática, até 45 palavras>\nKIT: <kit existente ou vazio>\nBRIEF: <primeira etapa concreta, até 35 palavras>`,pedido:`Falas dos colegas:\n${historico}\nFeche a reunião com uma decisão que mantenha o trabalho em movimento. Não exija aprovação do dono para decisões internas, orçamento interno ou brief; só escale o que for irreversível ou externo.`,tokens:220,agente:g.nome,motivo:'decisão de reunião'});
      if(r){const c=r.campos||{};const fala=String(c.fala||'').trim();decisao={texto:String(c.decisao||'').trim(),kit:String(c.kit||'').trim(),brief:String(c.brief||'').trim()};if(fala){falas.push({id:g.id,nome:g.nome,texto:fala});registrarReuniao(g.nome,fala,'reuniao');logPessoa(g,`conduziu a reunião sobre ${motivo}: ${fala}`,'reuniao');g.ref.memoria=(g.ref.memoria||[]).concat({texto:`Reunião sobre ${motivo}: ${fala}`.slice(0,220),t:Date.now()}).slice(-24);}}
    }
    registrarReuniao('Sistema',`Reunião encerrada: ${decisao&&decisao.texto||'sem decisão registrada'}`,'reuniao-fim');
    e.reuniao.reunioes.unshift({id:uid('reu'),t:Date.now(),motivo,participantes:participantes.map(p=>p.nome),falas:falas.slice(-8),decisao:decisao&&decisao.texto||''});
    e.reuniao.reunioes=e.reuniao.reunioes.slice(0,30); delete e.reuniao.reuniaoAtiva;
    participantes.forEach(p=>{p.ocupado=false;p.estado='andando';p.ref.foco='';});
    await Promise.all(participantes.map(p=>irPara(p,assento(p))));
    S.state.gravar();S.bus.emit('reuniao');S.bus.emit('equipe');
    return {participantes,falas,decisao};
  }

  function liberarAprovacoesInternas() {
    const e=S.state.atual(); if(!e) return 0;
    let n=0;
    e.tarefas.forEach(t=>{
      if(t.status==='aguardando_aprovacao' || t.status==='aguardando_aprovação'){
        // Aprovação do dono não é uma dependência do trabalho interno. A gerente decide.
        t.status='aberta'; t.aprovacaoInterna=true; t.aprovadoEm=Date.now(); n++;
        const p=rt.find(x=>x.id===t.para);
        if(p) logPessoa(p,`a etapa foi liberada pela gerência; não ficou aguardando aprovação externa.`,'supervisao');
      }
    });
    if(n){S.state.registrar(`A gerência liberou ${n} etapa(s) internas que estavam aguardando aprovação.`,'info',gId());S.state.gravar();}
    return n;
  }
  function gId(){const g=gerente();return g?g.id:null;}

  /* ============================================================
     Sala de reuniões — canal persistente entre você e a equipe.
     Uma chamada barata por intervenção; o contexto é rico e a saída curta.
     ============================================================ */
  function contextoReuniao() {
    const e = S.state.atual(); if (!e) return '';
    const projeto = e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    const mensagens = (e.reuniao && e.reuniao.mensagens || []).slice(-14).map(m => `[${m.quem}] ${m.texto}`).join('\n') || 'Nenhuma conversa anterior.';
    const tarefas = e.tarefas.slice(0, 14).map(t => { const q = t.para ? (e.equipe.find(x => x.id === t.para) || {}).nome : 'não atribuído'; return `${t.status.toUpperCase()} | ${t.titulo} | responsável=${q} | handoff=${t.handoff || '—'}`; }).join('\n') || 'Nenhuma tarefa.';
    const arquivos = e.arquivos.slice(0, 14).map(a => `${a.nome} | ${a.classe} | v${a.versao || 1} | q${a.qualidade || 0} | autor=${a.autor}`).join('\n') || 'Nenhum artefato.';
    const equipe = e.equipe.map(f => `${f.id} | ${f.nome} | ${f.cargo} | ${f.especialidade} | energia=${Math.round(f.energia || 0)} | foco=${f.foco || 'livre'} | pensamento=${f.pensamento || '—'}`).join('\n');
    return `ESTÚDIO\n${e.nome} | ramo=${e.ramo} | missão=${e.missao} | público=${e.publico}\n\nPROJETO ATIVO\n${projeto ? `${projeto.nome} | objetivo=${projeto.objetivo} | id=${projeto.id}` : 'nenhum'}\n\nEQUIPE\n${equipe}\n\nTRABALHO ATUAL\n${tarefas}\n\nARTEFATOS E PRODUTOS PERSISTENTES\n${arquivos}\n\nCONVERSA RECENTE DA SALA\n${mensagens}`.slice(0, 12500);
  }

  function registrarReuniao(quem, texto, tipo) {
    const e = S.state.atual(); if (!e) return;
    e.reuniao = e.reuniao || { mensagens: [], relatorios: [] };
    e.reuniao.mensagens.push({ id: S.util.uid('m'), t: Date.now(), quem: String(quem), texto: String(texto).slice(0, 1200), tipo: tipo || 'fala' });
    if (e.reuniao.mensagens.length > 120) e.reuniao.mensagens.splice(0, e.reuniao.mensagens.length - 120);
    S.state.gravar(); S.bus.emit('reuniao');
  }

  function gerarRelatorioLocal(e) {
    const projeto = e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    const abertas = e.tarefas.filter(t => t.status !== 'feita').length;
    const feitas = e.tarefas.filter(t => t.status === 'feita').length;
    const produtos = e.arquivos.filter(a => a.classe === 'produto').length;
    const recentes = e.log.slice(-5).map(x => x.texto).join(' | ');
    return `${projeto ? projeto.nome : 'Projeto principal'}: ${feitas} tarefas concluídas, ${abertas} em aberto, ${produtos} produtos finais persistidos. Últimos acontecimentos: ${recentes || 'nenhum registrado'}.`;
  }

  function relatorioReuniao() {
    const e = S.state.atual(); if (!e) return '';
    const rel = gerarRelatorioLocal(e);
    e.reuniao = e.reuniao || { mensagens: [], relatorios: [] };
    e.reuniao.relatorios.unshift({ t: Date.now(), texto: rel });
    e.reuniao.relatorios = e.reuniao.relatorios.slice(0, 20);
    registrarReuniao('Relatório', rel, 'relatorio');
    return rel;
  }

  async function reuniaoFalar(texto) {
    const e = S.state.atual(); const msg = String(texto || '').trim();
    if (!e || !msg) return { ok:false, erro:'Digite uma mensagem.' };
    e.reuniao = e.reuniao || { mensagens:[], relatorios:[] };
    registrarReuniao('Você', msg, 'usuario');
    const pessoas = e.equipe.filter(x => x.papel !== 'gerente');
    const gerenteAtual = gerente();
    const participantes = pessoas.slice();
    if (!S.ai.pronta()) {
      participantes.forEach(p => registrarReuniao(p.nome, 'Recebi a sua mensagem. Quando a IA estiver conectada, responderei com base no meu trabalho atual.', 'resposta'));
      S.state.gravar(); S.bus.emit('reuniao');
      return {ok:true, local:true, falas:participantes.length};
    }

    const contexto = contextoReuniao();
    const historico = (e.reuniao.mensagens || []).slice(-10).map(m => `[${m.quem}] ${m.texto}`).join('\n');
    let falas = 0;

    // Cada pessoa recebe sua própria chamada e responde a partir de sua função,
    // memória e trabalho. Assim não existe uma única "voz da equipe".
    const respostas = await Promise.all(participantes.map(async p => {
      const r = await S.ai.perguntar({
        sistema: `Você é ${p.nome}, ${p.cargo}, integrante de um estúdio real. Você está em uma conversa direta com o dono. Responda SOMENTE pelo seu ponto de vista profissional. Não fale em nome dos colegas, não invente fatos e não revele raciocínio interno. Dê uma resposta natural, curta e concreta (até 70 palavras), baseada no seu trabalho atual, memória e especialidade. Se a mensagem não exigir sua participação, diga isso naturalmente em uma frase curta. Se houver algo que você precise de outro colega, mencione a dependência explicitamente.\n\nCONTEXTO DO ESTÚDIO:\n${contexto}`,
        pedido: `Mensagem do dono: ${msg}\nHistórico recente:\n${historico || 'nenhum'}\nSeu foco atual: ${p.foco || 'nenhum'}\nSua memória recente: ${(p.memoria || []).slice(-5).map(x => typeof x==='string' ? x : x.texto).join(' | ') || 'nenhuma'}\nResponda como ${p.nome}, não como narrador.`,
        tokens: 220, agente:p.nome, motivo:'resposta individual na reunião'
      });
      return {p, texto:r && r.campos ? String(r.campos.resposta || r.campos.fala || r.texto || '').trim() : ''};
    }));

    respostas.forEach(({p,texto}) => {
      if (!texto) return;
      registrarReuniao(p.nome, texto, 'resposta');
      p.pensamento = texto.slice(0,220);
      p.memoria = (p.memoria||[]).concat({texto:`Na reunião: ${msg.slice(0,100)} → ${texto.slice(0,130)}`,t:Date.now()}).slice(-12);
      falas++;
    });

    // A gerente também responde por conta própria. Quando houver uma ordem,
    // a mesma conversa já serve para transformar a orientação em tarefas.
    if (gerenteAtual) {
      const ordem = /\b(faça|fazer|crie|criar|produza|produzir|prepare|preparar|revise|revisar|atualize|atualizar|construa|construir|publique|publicar|entregue|entregar|preciso que|quero que)\b/i.test(msg);
      const r = await S.ai.perguntar({
        sistema: `Você é ${gerenteAtual.nome}, sócia-gerente. Está numa conversa direta com o dono do estúdio. Dê sua própria resposta profissional, curta e natural (até 70 palavras). Não revele raciocínio interno. Use o contexto real do trabalho. ${ordem ? 'Se a mensagem for uma ordem, além da resposta, converta-a em no máximo duas tarefas usando somente kits, funcionários e projetos existentes.' : ''}\n\nCONTEXTO:\n${contexto}\n\nRETORNE SOMENTE:\nRESPOSTA: <até 70 palavras>\nORDEM1_KIT: <id ou vazio>\nORDEM1_PARA: <id ou vazio>\nORDEM1_BRIEF: <até 35 palavras>\nORDEM1_PROJETO: <id ou vazio>\nORDEM2_KIT: <id ou vazio>\nORDEM2_PARA: <id ou vazio>\nORDEM2_BRIEF: <até 35 palavras>\nORDEM2_PROJETO: <id ou vazio>`,
        pedido:`Mensagem do dono: ${msg}\nSeu foco: ${gerenteAtual.foco || 'supervisão geral'}\nSua memória: ${(gerenteAtual.memoria||[]).slice(-5).map(x=>typeof x==='string'?x:x.texto).join(' | ') || 'nenhuma'}`,
        tokens:360, agente:gerenteAtual.nome, motivo:'resposta da gerente na reunião'
      });
      if (r) {
        const c=r.campos||{}; const resposta=String(c.resposta||'').trim();
        if(resposta){ registrarReuniao(gerenteAtual.nome,resposta,'resposta'); gerenteAtual.pensamento=resposta.slice(0,220); gerenteAtual.memoria=(gerenteAtual.memoria||[]).concat({texto:`Reunião: ${msg.slice(0,110)} → ${resposta.slice(0,120)}`,t:Date.now()}).slice(-12); falas++; }
        ['1','2'].forEach(n=>{
          const kit=S.factory.porId(String(c[`ordem${n}_kit`]||'').trim());
          const para=e.equipe.find(x=>x.id===String(c[`ordem${n}_para`]||'').trim());
          const brief=String(c[`ordem${n}_brief`]||'').trim();
          const projetoId=String(c[`ordem${n}_projeto`]||'').trim() || ((e.projetos.find(x=>x.status==='ativo')||e.projetos[0]||{}).id);
          if(kit&&brief){ const t=novaTarefa({titulo:`${kit.nome}: ${brief}`,kit:kit.id,briefing:brief,para:para?para.id:null,projectId:projetoId,origem:'reunião'}); if(t) registrarReuniao('Sistema',`Ordem registrada: ${t.titulo}${para?' → '+para.nome:' → distribuição automática'}.`,'ordem'); }
        });
      }
    }

    if (!falas) registrarReuniao('Equipe','Todos receberam a mensagem, mas ninguém tinha uma resposta útil para acrescentar agora.','resposta');
    S.state.gravar(); S.bus.emit('reuniao'); S.bus.emit('equipe'); S.bus.emit('gerencia'); S.bus.emit('trabalho');
    return {ok:true,falas};
  }

  function personalidadeInicial(especialidade, nome) {
    const perfis={
      criacao:{tracos:['criativo','curioso','observador'],comunicacao:'visual e direta',prioridades:'clareza, experiência e coerência',estilo:'explora alternativas antes de escolher',colaboracao:'pede referências e compartilha versões',aversoes:'repetição sem propósito'},
      comercial:{tracos:['persuasivo','prático','atento a contexto'],comunicacao:'objetiva e orientada a impacto',prioridades:'clareza, proposta de valor e conversão',estilo:'procura a mensagem mais útil',colaboracao:'transforma ideias em mensagens acionáveis',aversoes:'mensagens vagas'},
      dados:{tracos:['analítico','metódico','cauteloso'],comunicacao:'precisa e organizada',prioridades:'consistência, dados e rastreabilidade',estilo:'confere antes de consolidar',colaboracao:'documenta fontes e dependências',aversoes:'dados sem origem'},
      producao:{tracos:['detalhista','pragmático','persistente'],comunicacao:'curta e concreta',prioridades:'qualidade, acabamento e estabilidade',estilo:'melhora o que já existe',colaboracao:'faz revisão e handoff detalhado',aversoes:'começar de novo sem necessidade'},
      geral:{tracos:['adaptável','curioso','colaborativo'],comunicacao:'direta e cordial',prioridades:'utilidade e continuidade',estilo:'entra onde existe gargalo',colaboracao:'pergunta antes de assumir uma dependência',aversoes:'trabalho desconectado'}
    };
    const base=perfis[especialidade]||perfis.geral;
    return Object.assign({},base,{experiencia:`experiência prática em ${especialidade}`});
  }

  /* ---------- contratação ---------- */
  function custoContratacao(e) { return 600 + (e.equipe.length - 1) * 350; }
  function contratar(nome, especialidade) {
    const e = S.state.atual(); if (!e) return false;
    const custo = custoContratacao(e);
    if (!S.market.debitar(e, custo, 'contratação')) return 'sem-caixa';
    const esp = ESPECIALIDADES.find(x => x.id === especialidade) || ESPECIALIDADES[4];
    const novoNome = nome || pick(NOMES);
    e.equipe.push({
      id: uid('a'), nome: novoNome, papel: 'func', cargo: esp.cargo,
      especialidade: esp.id, cor: S.state.PALETA[e.equipe.length % S.state.PALETA.length],
      energia: 85, humor: 72, entregas: 0, memoria: [], uso: { chamadas: 0, tokens: 0 },
      personalidade: personalidadeInicial(esp.id, novoNome)
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
        { id: 'a0', nome: dados.gerente || 'Ana', papel: 'gerente', cargo: 'Sócia-gerente', especialidade: 'geral', cor: S.state.PALETA[0], energia: 88, humor: 74, personalidade: {tracos:['estratégica','responsável','criteriosa','acolhedora'],comunicacao:'clara e firme',prioridades:'qualidade, continuidade e capacidade da equipe',estilo:'coordena sem microgerenciar',colaboracao:'escuta a equipe e remove bloqueios',aversoes:'gargalos invisíveis e retrabalho',experiencia:'gestão de projetos, pessoas e qualidade'} },
        { id: 'a1', nome: pick(NOMES), papel: 'func', cargo: 'Criação', especialidade: 'criacao', cor: S.state.PALETA[1], energia: 85, humor: 70, personalidade: personalidadeInicial('criacao','') },
        { id: 'a2', nome: pick(NOMES.filter(n => n !== 'Lia')), papel: 'func', cargo: 'Comercial', especialidade: 'comercial', cor: S.state.PALETA[2], energia: 85, humor: 70, personalidade: personalidadeInicial('comercial','') }
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
    liberarAprovacoesInternas();

    // A supervisão operacional não depende de IA: a gerente sempre acompanha
    // carga, gargalos e capacidade mesmo quando a produção de conteúdo está parada.
    const g = gerente();
    if (g) monitorarEquipe(g);
    // A operação básica nunca depende de a API estar disponível.
    // A IA melhora decisões e entregas, mas não pode fazer o escritório parar.
    const livre = rt.find(p => p.papel === 'func' && !p.ocupado && p.estado !== 'pausa' && (p.ref.energia > 20));
    if (livre) {
      const t = proximaPara(livre);
      if (t) {
        if (S.ai.disponivel() && S.ai.reservarAutonomia()) { await executar(livre, t); return; }
        if (!S.ai.pronta()) { await executar(livre, t); return; }
      }
    }
    // Gargalo social/operacional: dependências persistentes que merecem alinhamento viram reunião real.
    const bloqueadas=e.tarefas.filter(t=>t.status!=='feita' && (t.dependsOn||[]).some(id=>{const d=e.tarefas.find(x=>x.id===id);return d && d.status!=='feita';}));
    if(bloqueadas.length && !e.reuniao.reuniaoAtiva && g && !g.ocupado && S.ai.disponivel() && S.ai.reservarAutonomia()){
      await reuniaoInterna(`desbloquear ${bloqueadas[0].titulo}`);
      return;
    }
    // Gerência: quando há IA, usa análise; sem IA, mantém uma linha operacional local.
    if (g && !g.ocupado) {
      const candidato = e.arquivos.find(a => (a.classe === 'candidato' || a.classe === 'prototipo') && !a.avaliado);
      if (candidato && S.ai.disponivel() && S.ai.reservarAutonomia()) await avaliar(g);
      else if (tarefasAbertas().length === 0 && !candidato) {
        // Não é um timer: o marco de produção concluído é o gatilho. A equipe inteira participa.
        if (S.ai.disponivel() && S.ai.reservarAutonomia()) await idearComEquipe();
        else idearLocal();
      } else if (tarefasAbertas().length < 2) {
        if (S.ai.disponivel() && S.ai.reservarAutonomia()) await planejar(g);
        else planejarLocal(g);
      } else monitorarEquipe(g);
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
    reuniaoFalar, reuniaoInterna, relatorioReuniao, registrarReuniao, gerarRelatorioLocal, idearComEquipe,
    ESPECIALIDADES, NOMES,
    montar, iniciar, parar, ajustarCanvas, cliqueNoChao,
    pessoas: () => rt, pessoa, gerente,
    novaTarefa, tarefasAbertas, executar,
    salvarArquivos, publicar, editarArquivo,
    contratar, demitir, custoContratacao, fundar,
    selecionado: () => selecionado,
    selecionar(id) { selecionado = id; }
  };
})(window.S);
