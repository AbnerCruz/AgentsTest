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
    return { x: margem + col * (porLinha === 1 ? 0 : passo), y: 74 + lin * 72 };
  }
  const assento = p => ({ x: p.mesa.x, y: p.mesa.y + 40 });

  const ESTACOES = {
    cafe: { x: 120, y: 350, rotulo: 'café' },
    reuniao: { x: 345, y: 276, rotulo: 'reunião' },
    quadro: { x: 525, y: 276, rotulo: 'quadro' },
    descanso: { x: 350, y: 350, rotulo: 'descanso' }
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
    const arquivos=e.arquivos.slice(0,8).map(x=>`${x.nome} | ${x.classe} | ${x.validacao?.pronto ? 'estrutura completa' : 'em trabalho'}`).join('\n')||'sem entregas recentes';
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

  // Conversas sociais não entram no ciclo automático.
  // O tempo e os tokens da equipe são reservados para produção, revisão e
  // resolução de dependências reais. A sala continua disponível para reuniões
  // de trabalho e para mensagens iniciadas pelo dono.
  function socializar() { return; }

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

  /* Checagem operacional local: o agente precisa deixar patrimônio útil, não apenas ocupar tempo. */
  function avaliarContribuicaoAcervo(p, tarefa, salvos) {
    const e = S.state.atual(); if (!e || !p || !p.ref) return 0;
    const projeto = e.projetos.find(x => x.id === tarefa.projectId) || e.projetos[0];
    const anteriores = projeto ? (projeto.arquivoIds || []).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean) : [];
    const base = tarefa.baseArquivoId ? e.arquivos.find(a => a.id === tarefa.baseArquivoId) : null;
    let nivel = 55;
    if (projeto) nivel += 15;
    if (salvos && salvos.length) nivel += 15;
    if (base || anteriores.length) nivel += 10;
    if (tarefa.handoff || (salvos && salvos.length)) nivel += 5;
    nivel = clamp(nivel, 0, 100);
    const motivo = base
      ? `Evoluí ${base.nome}; a entrega continua ligada ao acervo do projeto.`
      : anteriores.length
        ? `A entrega acrescenta material ao projeto e aproveita o acervo existente.`
        : `A entrega criou o primeiro material concreto do projeto.`;
    p.ref.contribuicaoAcervo = { nivel, ultima: motivo.slice(0,220), atualizadoEm: Date.now() };
    p.ref.pensamento = `Cheque do acervo: ${motivo}`.slice(0, 240);
    lembrar(p, `Acervo: ${motivo}`);
    return nivel;
  }

  /* ---------- arquivos ---------- */
  function salvarArquivos(lista, meta, p) {
    const e = S.state.atual(); if (!e) return [];
    const salvos = lista.map(a => {
      const arq = {
        id: uid('f'), nome: a.nome, tipo: a.tipo, conteudo: String(a.conteudo),
        classe: meta.classe || 'esboco', kit: meta.kit || 'legado', projectId: meta.projectId || (e.projetos[0] && e.projetos[0].id),
        validacao: meta.validacao || null,
        // A linhagem identifica O QUE é o produto, não como o arquivo foi
        // batizado. Derivar do nome permitia que a IA escolhesse outro nome
        // e o mesmo produto fosse publicado de novo como v1.
        viaIA: Boolean(meta.viaIA), versao: 1,
        linhagem: 'k:' + (meta.projectId || (e.projetos[0] && e.projetos[0].id) || '') + ':' + (meta.kit || 'legado'),
        autor: p ? p.nome : 'equipe', criadoEm: Date.now(), quando: S.fmt.dataHora(),
        taskId: meta.taskId || null, baseArquivoId: meta.baseArquivoId || null,
        briefing: String(meta.briefing || '').slice(0, 500), liberadoPublicacao: false
      };
      e.arquivos.unshift(arq);
      return arq;
    });
    if (e.arquivos.length > 90) e.arquivos.length = 90;
    if (p && p.ref) p.ref.entregas = (p.ref.entregas || 0) + 1;
    S.state.registrar(
      `${p ? p.nome : 'A equipe'} entregou ${salvos.map(a => a.nome).join(', ')}${meta.validacao?.pronto ? ' · entrega estruturalmente completa' : ' · entrega ainda requer trabalho'}.`,
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
    a.validacao = null;
    if (a.classe === 'candidato') a.classe = 'prototipo';
    a.avaliado = false;
    S.state.registrar(`${a.nome} foi editado em produção e voltou para revisão.`, 'info');
    S.state.gravar();
    S.bus.emit('arquivos'); S.bus.emit('trabalho'); S.bus.emit('equipe');
    return true;
  }

  /* Publicar é um RELEASE, não uma etapa normal de produção.
     A primeira publicação congela a primeira versão. Uma nova versão só
     pode nascer de uma tarefa de evolução que aponte explicitamente para
     um produto publicado e que tenha conteúdo realmente diferente. */
  function publicar(arqId, quem, motivo) {
    const e = S.state.atual(); if (!e) return null;
    const base = e.arquivos.find(a => a.id === arqId); if (!base) return null;
    if (base.classe === 'produto') return null;

    const projeto = e.projetos.find(x => x.id === (base.projectId || '')) || e.projetos.find(x => x.status === 'ativo') || e.projetos[0];
    const projId = (projeto && projeto.id) || base.projectId || '';
    const normal = x => String(x || '').replace(/\s+/g, ' ').trim();

    // Identidade por projeto + kit, com o projeto resolvido dos dois lados.
    // Comparar projectId cru deixava passar arquivos sem projeto definido.
    const doMesmoKit = a => a.classe === 'produto' && a.kit === base.kit &&
      ((a.projectId || '') === projId || !a.projectId);
    const produtosDoMesmoKit = e.arquivos.filter(doMesmoKit)
      .sort((a, b) => (b.versao || 1) - (a.versao || 1));
    // A linhagem antiga vinha do nome do arquivo; para acervos gravados antes
    // desta correção, o kit continua sendo a identidade confiável.
    const anteriores = produtosDoMesmoKit.slice();
    const ultima = anteriores[0] || null;

    // Rede de segurança final: nenhum conteúdo já publicado neste projeto
    // volta a ser publicado, com qualquer nome, kit ou linhagem.
    const alvoNormal = normal(base.conteudo);
    const clone = e.arquivos.find(a => a.classe === 'produto' &&
      ((a.projectId || '') === projId || !a.projectId) && normal(a.conteudo) === alvoNormal);
    if (clone) {
      S.state.registrar(`Release bloqueado para ${base.nome}: conteúdo idêntico a ${clone.nome}, já publicado.`, 'alerta');
      base.avaliado = true;
      base.liberadoPublicacao = false;
      S.state.gravar();
      return null;
    }

    // Identidade de produto é projeto + kit, não o nome do arquivo. Isso evita
    // que uma IA mude "index.html" para outro nome e consiga republicar
    // essencialmente o mesmo produto como se fosse uma novidade.
    const ultimoDoKit = produtosDoMesmoKit[0] || null;
    if (ultimoDoKit && (!base.baseArquivoId || base.baseArquivoId !== ultimoDoKit.id)) {
      S.state.registrar(`Release bloqueado para ${base.nome}: o projeto já possui ${ultimoDoKit.nome}; uma nova versão precisa apontar explicitamente para ela.`, 'alerta');
      return null;
    }

    // A equipe só libera um candidato para release depois da revisão da gerente.
    // Publicação manual continua disponível para o dono do estúdio.
    if (quem !== 'você' && !base.liberadoPublicacao) {
      S.state.registrar(`Release bloqueado para ${base.nome}: ainda não foi liberado pela gerente.`, 'alerta');
      return null;
    }

    // Depois da primeira versão, uma nova publicação precisa ser uma evolução
    // explícita da última versão. Isso impede o motor de transformar o mesmo
    // trabalho em v2, v3, v4 apenas porque a fila ficou vazia.
    if (ultima) {
      if (!base.baseArquivoId || base.baseArquivoId !== ultima.id) {
        S.state.registrar(`Release bloqueado para ${base.nome}: não é uma evolução explícita de ${ultima.nome}.`, 'alerta');
        return null;
      }
      if (normal(base.conteudo) === normal(ultima.conteudo)) {
        S.state.registrar(`Release bloqueado para ${base.nome}: conteúdo idêntico à versão publicada.`, 'alerta');
        return null;
      }
    }

    const versao = ultima ? (ultima.versao || 1) + 1 : 1;
    const ext = (base.nome.match(/\.[a-z0-9]+$/i) || [''])[0];
    const raiz = base.nome.replace(/\.[a-z0-9]+$/i, '').replace(/-v\d+$/i, '');
    const produto = Object.assign({}, base, {
      id: uid('p'), classe: 'produto', versao,
      nome: raiz + '-v' + versao + ext,
      publicadoPor: quem || 'equipe', motivo: motivo || '', quando: S.fmt.dataHora(), publicadoEm: Date.now(),
      projectId: projId, linhagem: 'k:' + projId + ':' + (base.kit || 'legado'),
      liberadoPublicacao: true
    });
    e.arquivos.unshift(produto);
    const proj = projeto;
    if (proj) {
      if (!proj.arquivoIds.includes(produto.id)) proj.arquivoIds.unshift(produto.id);
      proj.atividade.unshift({ t: Date.now(), tipo: 'publicacao', texto: `${produto.nome} entrou no projeto.` });
      proj.atividade = proj.atividade.slice(-40);
      // Um produto novo só pede integração quando existe um site anterior.
      // Não cria uma nova versão do próprio site automaticamente.
      if (base.kit !== 'landing') {
        const site = e.arquivos.find(a => a.classe === 'produto' && a.kit === 'landing');
        const jaExiste = e.tarefas.some(t => t.status !== 'feita' && t.projectId === proj.id && t.kit === 'landing' && /atualiz|catálogo|catalogo/i.test(t.titulo));
        if (site && !jaExiste) {
          novaTarefa({ titulo: `Integrar ${produto.nome} ao site`, kit: 'landing',
            briefing: `Atualizar o site existente para integrar ${produto.nome}. Preserve o conteúdo que já funciona e altere apenas o necessário.`,
            projectId: proj.id, baseArquivoId: site.id, origem: 'integração de produto' });
        }
      }
    }
    // Publicar apenas coloca uma oferta real no portfólio. Dinheiro entra
    // somente quando o mercado simulado gerar uma venda; não há prêmio por
    // simplesmente mudar a classe do arquivo.
    S.state.gravar();
    S.bus.emit('arquivos'); S.bus.emit('negocio');
    return produto;
  }

  /* ---------- ambiente construível ---------- */
  const OBJETOS_AMBIENTE = {
    mesa: {nome:'Mesa', custo:180, w:54,h:28, zona:'trabalho'},
    planta:{nome:'Planta',custo:70,w:24,h:34, zona:'bemestar'},
    estante:{nome:'Estante',custo:260,w:38,h:54, zona:'arquivo'},
    luminaria:{nome:'Luminária',custo:110,w:18,h:32, zona:'trabalho'},
    sofa:{nome:'Sofá',custo:320,w:72,h:30, zona:'convivio'},
    quadro:{nome:'Quadro',custo:140,w:62,h:12, zona:'planejamento'},
    bancada:{nome:'Bancada',custo:240,w:76,h:28, zona:'prototipo'}
  };
  const AMB_ZONAS = {
    trabalho:{x:82,y:78,w:500,h:132}, arquivo:{x:82,y:214,w:150,h:108}, planejamento:{x:246,y:214,w:198,h:108}, convivio:{x:456,y:214,w:128,h:108}, bemestar:{x:82,y:330,w:150,h:40}, prototipo:{x:246,y:330,w:338,h:40}
  };
  function distObj(a,b){ return Math.hypot((a.x||0)-(b.x||0),(a.y||0)-(b.y||0)); }
  function livreParaObjeto(x,y,spec,objs){
    if(x-spec.w/2<34 || x+spec.w/2>606 || y-spec.h/2<36 || y+spec.h/2>355) return false;
    return objs.every(o => {
      const q=OBJETOS_AMBIENTE[o.tipo]||{};
      return Math.abs(x-(o.x||0)) > ((spec.w||30)+(q.w||30))/2+7 || Math.abs(y-(o.y||0)) > ((spec.h||20)+(q.h||20))/2+7;
    });
  }
  function pontoConstrucao(p,tipo,objs){
    const spec=OBJETOS_AMBIENTE[tipo]||OBJETOS_AMBIENTE.planta;
    const z=AMB_ZONAS[spec.zona]||AMB_ZONAS.bemestar;
    const candidatos=[];
    // Primeiro tenta perto da mesa do próprio agente: o espaço passa a ter identidade.
    if(p && p.mesa) candidatos.push({x:p.mesa.x,y:p.mesa.y-36});
    for(let row=0;row<5;row++) for(let col=0;col<7;col++) candidatos.push({x:z.x+22+col*48,y:z.y+22+row*32});
    return candidatos.find(pt=>livreParaObjeto(pt.x,pt.y,spec,objs)) || {x:z.x+z.w/2,y:z.y+z.h/2};
  }
  async function construirAmbiente(p, tipo, motivo) {
    const e=S.state.atual(); if(!e) return false;
    const spec=OBJETOS_AMBIENTE[tipo]||OBJETOS_AMBIENTE.planta;
    e.ambiente=e.ambiente||{moedas:1200,objetos:[]}; e.ambiente.objetos=Array.isArray(e.ambiente.objetos)?e.ambiente.objetos:[];
    if((e.ambiente.moedas||0)<spec.custo || e.ambiente.objetos.length>=50) return false;
    const alvo={x:Math.min(560,Math.max(80,(p&&p.mesa?p.mesa.x:320))),y:250};
    if(p && !p.ocupado){ p.ocupado=true; p.estado='andando'; p.ref.foco=`construindo ${spec.nome}`; await irPara(p,alvo); }
    const agora=Date.now(), pos=pontoConstrucao(p,tipo,e.ambiente.objetos);
    e.ambiente.moedas-=spec.custo;
    const obj={id:uid('obj'),tipo,x:pos.x,y:pos.y,custo:spec.custo,por:p?p.id:null,nome:spec.nome,criadoEm:agora,uso:0,ultimaInteracao:agora};
    e.ambiente.objetos.push(obj); e.ambiente.ultimaConstrucao=agora;
    e.ambiente.construtores=e.ambiente.construtores||[]; e.ambiente.construtores.unshift({t:agora,agente:p&&p.id,objeto:obj.id,tipo,motivo:String(motivo||'').slice(0,220)}); e.ambiente.construtores=e.ambiente.construtores.slice(0,80);
    e.ambiente.planta=e.ambiente.planta||{versao:1,zonas:[],eventos:[]}; e.ambiente.planta.versao=Number(e.ambiente.planta.versao||1)+1;
    e.ambiente.planta.eventos=e.ambiente.planta.eventos||[]; e.ambiente.planta.eventos.unshift({t:agora,tipo:'construcao',objeto:obj.id,agente:p&&p.id}); e.ambiente.planta.eventos=e.ambiente.planta.eventos.slice(0,80);
    if(p){ p.ref.pensamento=`Construí ${spec.nome} para melhorar o ambiente: ${motivo||'uso da equipe'}`.slice(0,240); p.ref.ambiente=p.ref.ambiente||{}; p.ref.ambiente.ultimaAcao=agora; p.ref.ambiente.preferencias=p.ref.ambiente.preferencias||[]; if(!p.ref.ambiente.preferencias.includes(tipo)) p.ref.ambiente.preferencias.unshift(tipo); p.ref.ambiente.preferencias=p.ref.ambiente.preferencias.slice(0,8); logPessoa(p,`adicionou ${spec.nome} ao ambiente de trabalho. ${motivo||''}`,'ambiente'); }
    S.state.registrar(`${p?p.nome:'A equipe'} construiu ${spec.nome} no ambiente por ${S.fmt.brl(spec.custo)}.`,'ambiente',p&&p.id);
    if(p){ p.ocupado=false; p.tarefa=null; p.estado='andando'; await irPara(p,assento(p)); p.estado='sentado'; }
    S.state.gravar(); S.bus.emit('ambiente'); S.bus.emit('negocio'); S.bus.emit('equipe'); return true;
  }
  function reorganizarAmbiente(p, objId, motivo){
    const e=S.state.atual(); if(!e||!e.ambiente) return false;
    const o=(e.ambiente.objetos||[]).find(x=>x.id===objId); if(!o) return false;
    const spec=OBJETOS_AMBIENTE[o.tipo]||OBJETOS_AMBIENTE.planta, alvo=pontoConstrucao(p,o.tipo,(e.ambiente.objetos||[]).filter(x=>x.id!==o.id));
    o.x=alvo.x; o.y=alvo.y; o.ultimaInteracao=Date.now(); o.movidoPor=p&&p.id; o.movidoMotivo=String(motivo||'').slice(0,180);
    e.ambiente.planta=e.ambiente.planta||{versao:1,zonas:[],eventos:[]}; e.ambiente.planta.versao=Number(e.ambiente.planta.versao||1)+1;
    if(p){ p.ref.pensamento=`Reorganizei ${spec.nome}: ${motivo||'melhor fluxo do espaço'}`.slice(0,240); logPessoa(p,`reorganizou ${spec.nome} no escritório. ${motivo||''}`,'ambiente'); }
    S.state.registrar(`${p?p.nome:'A equipe'} reorganizou ${spec.nome} no ambiente.`,'ambiente',p&&p.id); S.state.gravar(); S.bus.emit('ambiente'); S.bus.emit('equipe'); return true;
  }
  function interagirAmbiente(p,objId){
    const e=S.state.atual(); if(!e||!e.ambiente) return false; const o=(e.ambiente.objetos||[]).find(x=>x.id===objId); if(!o||!p) return false;
    o.uso=Number(o.uso||0)+1; o.ultimaInteracao=Date.now(); p.ref.pensamento=`Interagi com ${o.nome}; isso faz parte do espaço de trabalho compartilhado.`; logPessoa(p,`usou ${o.nome} no ambiente.`,'ambiente'); S.state.gravar(); S.bus.emit('ambiente'); S.bus.emit('equipe'); return true;
  }
  function ambienteObjetos(){ const e=S.state.atual(); return e&&e.ambiente&&e.ambiente.objetos||[]; }
  const tiposAmbiente=()=>Object.keys(OBJETOS_AMBIENTE);

  /* ---------- tarefas ---------- */
  /* Texto vindo do modelo nunca entra cru na interface nem em título de
     tarefa. Modelos pequenos vazam marcadores de template ("|constrain|>",
     "<|channel|>", cercas de código, tags), e isso acabava virando o nome
     da tarefa na tela. */
  function limpo(txt, maxPalavras) {
    let t = String(txt == null ? '' : txt);
    t = t.replace(/<\|[^|>]*\|>/g, ' ')      // <|tokens especiais|>
         .replace(/\|[a-z_]{3,20}\|>?/gi, ' ') // |constrain|>, |channel|
         .replace(/```[a-z]*|```/gi, ' ')
         .replace(/<\/?[a-z][^>]{0,40}>/gi, ' ')
         .replace(/[<>{}]/g, ' ')
         .replace(/\s+/g, ' ')
         .trim()
         .replace(/^[\s\-–—:*"'.,]+|[\s\-–—:*"']+$/g, '')
         .trim();
    if (maxPalavras) t = t.split(' ').slice(0, maxPalavras).join(' ');
    return t;
  }
  /* Um texto só vale como instrução se sobrar conteúdo de verdade depois
     da limpeza. Restos como "csv" ou "revisar" não viram tarefa. */
  function textoUtil(t) {
    const x = limpo(t);
    return x.length >= 12 && /\s/.test(x) ? x : '';
  }

  function novaTarefa(dados) {
    const e = S.state.atual(); if (!e) return null;
    const titulo = limpo(dados.titulo, 16); if (!titulo || titulo.length < 6) return null;
    if (e.tarefas.some(t => t.status !== 'feita' && t.titulo.toLowerCase() === titulo.toLowerCase())) return null;
    // Dedupe real: o mesmo kit não pode ter duas etapas abertas no mesmo
    // projeto, e uma etapa idêntica concluída há pouco não volta em loop.
    // Comparar só o título exato entre tarefas abertas deixava "Produzir
    // Catálogo..." nascer de novo assim que a anterior virava "feita".
    const projAlvo = dados.projectId || null;
    if (e.tarefas.some(t => t.status !== 'feita' && t.kit === dados.kit && (t.projectId || null) === projAlvo)) return null;
    const repetidaRecente = e.tarefas.some(t => t.status === 'feita' &&
      t.titulo.toLowerCase() === titulo.toLowerCase() &&
      Date.now() - (t.concluidaEm || 0) < 20 * 60000);
    if (repetidaRecente) return null;
    const projeto = e.projetos.find(p => p.id === dados.projectId) || e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    const t = {
      id: uid('t'), titulo, kit: dados.kit || 'landing', briefing: limpo(dados.briefing) || titulo,
      rodada: Number(dados.rodada) || 0,
      para: dados.para || null, status: 'aberta', origem: dados.origem || 'gerente',
      projectId: projeto ? projeto.id : null,
      dependsOn: Array.isArray(dados.dependsOn) ? dados.dependsOn : [],
      // Este campo era recebido por cinco chamadas diferentes e nunca era
      // gravado. Sem ele, nenhuma tarefa conseguia provar que era evolução
      // de um produto existente: a gerente segurava toda entrega com
      // "já existe uma versão publicada" e a produção travava no primeiro
      // produto de cada kit.
      baseArquivoId: dados.baseArquivoId || null,
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

  /* Quando a IA está indisponível, não fingimos produção. O funcionário
     continua trabalhando no ambiente: lê o acervo, organiza o foco, registra
     o que precisa ser retomado e pode conversar com colegas. Nenhum artefato
     falso é criado e nenhuma tarefa é marcada como concluída. */
  async function atividadeSemIA(p, tarefa) {
    if (!p || !tarefa || p.ocupado) return;
    p.ocupado = true; p.tarefa = tarefa.titulo; p.ref.foco = 'estudando o projeto e preparando a retomada';
    p.estado = 'trabalhando';
    const e = S.state.atual();
    const projeto = e && e.projetos.find(x => x.id === tarefa.projectId);
    const base = projeto ? (projeto.arquivoIds || []).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean).slice(0,3) : [];
    p.ref.pensamento = base.length
      ? `Estou estudando ${base.map(a=>a.nome).join(', ')} para retomar ${tarefa.titulo} sem perder decisões anteriores.`
      : `Estou revisando o objetivo do projeto e preparando ${tarefa.titulo}; sem IA, não vou fabricar uma entrega.`;
    logPessoa(p, `está estudando o contexto de \"${tarefa.titulo}\" enquanto a IA está indisponível. Nenhum artefato fictício será criado.`, 'trabalho');
    S.state.gravar(); S.bus.emit('equipe');
    await sleep(2600 + Math.random()*2600);
    if (e && p.ref) {
      const nota = base.length ? `Retomada preparada a partir de ${base[0].nome}.` : 'Retomada preparada a partir do objetivo do projeto.';
      lembrar(p, nota);
      logPessoa(p, nota, 'estudo');
    }
    p.ocupado = false; p.tarefa = null; p.estado = 'sentado'; p.ref.foco = ''; p.ref.pensamento = 'Disponível; aguardando a IA para transformar a preparação em uma entrega real.';
    S.state.gravar(); S.bus.emit('equipe');
  }

  /* Executa uma tarefa do começo ao fim: deliberação autônoma + produção. */
  async function executar(p, tarefa) {
    const e = S.state.atual(); if (!e) return false;
    p.ocupado = true; p.tarefa = tarefa.titulo; p.progresso = 0;
    p.ref.foco = tarefa.titulo;
    p.ref.pensamento = `Estou examinando ${tarefa.titulo} e o estado atual do projeto antes de decidir como agir.`;
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
      let deliberacao = null;
      if (S.ai.disponivel()) {
        deliberacao = await S.ai.deliberar({
          sistema: `Você é ${p.nome}, ${p.cargo} do estúdio ${e.nome}. Trabalha dentro de um projeto contínuo. Missão: ${e.missao}. Público: ${e.publico}. Projeto: ${(e.projetos.find(x=>x.id===tarefa.projectId)||{}).objetivo || e.missao}. Tarefa: ${tarefa.titulo}. Briefing: ${tarefa.briefing}.`,
          pedido: `Antes de produzir, examine o estado real do projeto e escolha autonomamente a melhor abordagem para esta tarefa. Considere os artefatos existentes e a continuidade do trabalho. Não invente fatos.`,
          tokens: 700, agente: p.nome, motivo: 'pensamento profundo antes da produção'
        });
        if (deliberacao && deliberacao.resumo) {
          p.ref.pensamento = deliberacao.resumo.slice(0, 500);
          lembrar(p, `Deliberação para ${tarefa.titulo}: ${deliberacao.resumo.slice(0, 160)}`);
          logPessoa(p, `decidiu como abordar a tarefa antes de produzir: ${deliberacao.resumo.slice(0, 220)}`, 'pensamento');
        }
      }
      const saida = await S.factory.produzir({ kit: tarefa.kit, briefing: tarefa.briefing, deliberacao: deliberacao && deliberacao.resumo, agente: p.ref, projectId: tarefa.projectId, taskId: tarefa.id, baseArquivoId: tarefa.baseArquivoId });
      if (saida && saida.arquivos.length) {
        const salvos = salvarArquivos(saida.arquivos, Object.assign({}, saida, {
          projectId: tarefa.projectId,
          taskId: tarefa.id,
          baseArquivoId: tarefa.baseArquivoId || null,
          briefing: tarefa.briefing || ''
        }), p);
        tarefa.contribuicaoAcervo = avaliarContribuicaoAcervo(p, tarefa, salvos);
        tarefa.contributors = Array.isArray(tarefa.contributors) ? tarefa.contributors : [];
        if(!tarefa.contributors.includes(p.id)) tarefa.contributors.push(p.id);
        tarefa.status = 'feita'; tarefa.concluidaEm = Date.now();
        logPessoa(p, `concluiu "${tarefa.titulo}"; o resultado foi registrado e entregue à próxima etapa.`, 'entrega');
        p.ref.pensamento = `Concluí ${tarefa.titulo}. Confiro se a entrega aumentou o acervo e se outra pessoa consegue reutilizá-la.`;
        lembrar(p, `Concluí ${tarefa.titulo}; entrega vinculada ao projeto ${tarefa.projectId || 'principal'}.`);
        tarefa.arquivo = salvos[0].id; tarefa.validacao = saida.validacao || null;
        tarefa.handoff = `${p.nome}: ${salvos.map(a => a.nome).join(', ')} prontos para a próxima etapa.`;
        const proj = e.projetos.find(x => x.id === tarefa.projectId);
        if (proj) {
          salvos.forEach(a => { if (!proj.arquivoIds.includes(a.id)) proj.arquivoIds.unshift(a.id); });
          proj.atividade.unshift({ t: Date.now(), tipo: 'entrega', texto: `${p.nome} concluiu ${tarefa.titulo}.` });
          proj.atividade = proj.atividade.slice(-40);
        }
        ok = true;
        humor(p, 8, `entreguei ${salvos[0].nome}`);

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

  function garantirTrabalhoInicial(g) {
    const e = S.state.atual(); if (!e || !g) return 0;
    const projeto = e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    if (!projeto) return 0;
    if (e.tarefas.some(t => t.status !== 'feita')) return 0;

    const arquivos = (projeto.arquivoIds || []).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean);
    // "Já existe" não pode significar apenas "já foi publicado": enquanto o
    // portão de release segurava tudo, esta fila recriava eternamente a mesma
    // etapa ("Produzir Catálogo...") porque nenhum candidato virava produto.
    const tem = kit => arquivos.some(a => a.kit === kit &&
      (a.classe === 'produto' || a.classe === 'candidato' || a.classe === 'prototipo'));
    // A obra vem primeiro. Não faz sentido montar catálogo, anúncio ou página
    // de vendas antes de existir o que vender: era exatamente isso que gerava
    // "catálogo de produtos" sem nenhum produto e briefing citando um
    // portfólio que nunca foi criado.
    const sequencia = ['obra','landing','catalogo','artigo','emails','anuncios'].find(k => !tem(k));
    if (!sequencia) return 0;
    const kit = S.factory.porId(sequencia);
    if (!kit) return 0;

    const alvo = rt.find(p => p.papel === 'func' && !p.ocupado && p.ref.energia > 20 && p.ref.especialidade === kit.especialidade)
      || rt.find(p => p.papel === 'func' && !p.ocupado && p.ref.energia > 20);
    if (!alvo) return 0;

    // O briefing não pode afirmar que existe um acervo quando não existe.
    // "a partir do portfólio existente" aparecia mesmo com o projeto vazio,
    // e o modelo então inventava produtos para preencher.
    const obras = arquivos.filter(a => a.kit === 'obra');
    const acervo = obras.map(a => a.nome).slice(0, 4).join(', ');
    const briefing = sequencia === 'obra'
      ? `Escrever a obra principal do estúdio: o produto que o cliente realmente recebe, completo e acabado. Usar exclusivamente ramo, público e missão registrados. Não inventar clientes, preços, métricas, datas ou prazos.`
      : acervo
        ? `Produzir ${kit.nome} baseado exclusivamente nas obras já existentes no projeto (${acervo}). Descrever apenas o que essas obras realmente contêm. Não inventar outros itens, preços, métricas ou datas.`
        : `Produzir ${kit.nome} usando exclusivamente missão, público e ramo registrados. O projeto ainda não tem obras publicadas, então não cite catálogo, portfólio, itens ou resultados que não existem.`;
    const titulo = sequencia === 'obra'
      ? `Escrever a obra principal do estúdio`
      : acervo ? `Produzir ${kit.nome} a partir das obras existentes` : `Produzir ${kit.nome}`;
    const t = novaTarefa({titulo, kit:kit.id, briefing, para:alvo.id, projectId:projeto.id, origem:'fila produtiva'});
    if (t) {
      g.ref.foco = 'Garantindo uma entrega concreta em produção';
      g.ref.pensamento = 'A fila estava vazia. A prioridade é produzir uma entrega concreta e útil, não gerar conversa ou cenário.';
      logPessoa(g, `abriu a próxima etapa produtiva: "${titulo}".`, 'supervisao');
      S.state.registrar(`${g.nome} iniciou a fila produtiva: ${titulo}.`, 'info', g.id);
      S.state.gravar();
      return 1;
    }
    return 0;
  }

  function planejarLocal(g) {
    const e = S.state.atual(); if (!e || !g) return 0;
    const projeto = e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    if (!projeto) return 0;
    const abertas = e.tarefas.filter(t => t.status !== 'feita');
    if (abertas.length >= 2) return 0;
    const arquivos = (projeto.arquivoIds || []).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean);
    // Mesmo sem IA, a ordem é a mesma: obra antes de qualquer material sobre
    // a obra. E o catálogo só entra quando existe o que catalogar.
    const temObra = arquivos.some(a => a.kit === 'obra' && (a.classe === 'produto' || a.classe === 'candidato'));
    const obrasPublicadas = arquivos.filter(a => a.classe === 'produto' && a.kit === 'obra');
    const temSite = arquivos.some(a => a.classe === 'produto' && a.kit === 'landing');
    const temCatalogo = arquivos.some(a => a.classe === 'produto' && a.kit === 'catalogo');
    const temArtigo = arquivos.some(a => a.classe === 'produto' && a.kit === 'artigo');
    const temEmails = arquivos.some(a => a.classe === 'produto' && a.kit === 'emails');
    const temAnuncios = arquivos.some(a => a.classe === 'produto' && a.kit === 'anuncios');
    let spec = null;
    if (!temObra) spec = { kit:'obra', titulo:'Escrever a obra principal do estúdio', briefing:'Produzir a obra em si — o que o cliente recebe — completa e acabada, usando apenas ramo, público e missão registrados.' };
    else if (!temSite) spec = { kit:'landing', titulo:'Construir a primeira entrega pública', briefing:'Criar uma página completa e publicável usando apenas a missão, público, identidade e as obras já registradas.' };
    else if (!temCatalogo && obrasPublicadas.length) spec = { kit:'catalogo', titulo:'Organizar as obras já publicadas', briefing:`Consolidar em catálogo somente as obras que existem no projeto (${obrasPublicadas.map(a=>a.nome).slice(0,4).join(', ')}). Não inventar itens, preços ou coleções.` };
    else if (!temArtigo) spec = { kit:'artigo', titulo:'Criar conteúdo público de apoio', briefing:'Criar um artigo completo usando somente fatos e materiais já registrados no projeto.' };
    else if (!temEmails) spec = { kit:'emails', titulo:'Criar comunicação de lançamento', briefing:'Criar a sequência de e-mails usando somente informações reais já registradas no projeto.' };
    else if (!temAnuncios) spec = { kit:'anuncios', titulo:'Criar peças de divulgação', briefing:'Criar peças completas de divulgação sem inventar resultados, preços, prazos ou métricas.' };
    else return 0;
    const kit = S.factory.porId(spec.kit);
    if (!kit) return 0;
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
    const projeto = e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    if (!projeto) return;
    const arqs = (projeto.arquivoIds || []).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean);
    const port = ['landing','catalogo','artigo','emails','anuncios'];
    if (port.every(kit => arqs.some(a => a.classe === 'produto' && a.kit === kit))) {
      // Portfólio-base completo: não inventar uma v2 só para manter o motor ocupado.
      return;
    }
    const kits = kitsDisponiveis();
    const equipe = rt.filter(p => p.papel === 'func').map(p => `${p.id}=${p.nome}(${p.especialidade})`).join('; ') || 'só a gerente';
    const recentes = (projeto.arquivoIds || []).slice(0, 6).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean)
      .map(a => `${a.nome} [${a.classe},]`).join(', ') || 'nenhuma entrega ainda';
    g.ocupado = true; g.estado = 'trabalhando'; g.balao = 'planejando';
    let r = null;
    try {
      r = await S.ai.perguntar({
      sistema: `Você é ${g.nome}, sócia-gerente do estúdio ${e.nome}. Trabalhe como gerente de um projeto contínuo, não como um jogo.
Projeto: ${projeto.nome}. Objetivo: ${projeto.objetivo}.
Equipe: ${equipe}.
Entregas existentes: ${recentes}.
ORDEM OBRIGATÓRIA: o kit "obra" é o produto que o estúdio realmente vende. Enquanto não existir nenhuma obra registrada acima, a próxima tarefa TEM QUE ser kit "obra". Catálogo, anúncios, e-mails e página de vendas são material SOBRE as obras — só fazem sentido depois que existe obra. Nunca peça catálogo de produtos se não há produto listado nas entregas existentes.
Crie no máximo 1 próxima tarefa produtiva que dependa do estado REAL acima. Primeiro verifique se existe uma lacuna concreta no acervo. A tarefa deve produzir, integrar, corrigir ou melhorar um artefato concreto. Se não houver contribuição verificável ao acervo, retorne KIT1 vazio.
NUNCA invente cliente, pedido, contrato, orçamento, prazo, data futura, métrica, resultado, número, aprovação externa ou acontecimento. Se a informação não existe, não a crie.
Não crie uma tarefa apenas para conversar, pesquisar sem entregar, fazer reunião ou "definir estratégia".
Prefira evoluir o artefato existente e usar o trabalho da equipe.
Tipos permitidos: ${kits.filter(k => !['proposta','calendario'].includes(k.id)).map(k => k.id).join(', ')}.
Responda SOMENTE:
KIT1: <código ou vazio>
PARA1: <id ou vazio>
BRIEF1: <até 30 palavras>
DEP1: <id de tarefa anterior ou vazio>
BASE1: <id do último produto existente se for evolução, senão vazio>
KIT2: vazio
PARA2: vazio
BRIEF2: vazio
DEP2: vazio
BASE2: vazio`,
      pedido: `Missão: ${e.missao}. Produza a próxima etapa verificável. Só use fatos presentes no projeto. Se não houver base suficiente para uma nova etapa, retorne KIT1 vazio.`,
        tokens: 300, agente: g.nome, motivo: 'planejar projeto'
      });
    } finally {
      // Sem este finally, uma exceção no meio do planejamento deixava a
      // gerente marcada como ocupada para sempre — e o ciclo nunca mais
      // entrava no ramo de gerência. Ela simplesmente parava de trabalhar.
      g.ocupado = false; g.balao = null; g.estado = 'sentado';
    }
    if (!r) return;
    let criadas = 0;
    ['1','2'].forEach(n => {
      const kitId = String(r.campos['kit'+n] || '').trim();
      if (['proposta','calendario'].includes(kitId)) return;
      const kit = S.factory.porId(kitId) || S.factory.porId(kitPorPalavra(r.campos['brief'+n]));
      if (!kit) return;
      const alvo = rt.find(p => p.papel === 'func' && p.id === String(r.campos['para'+n] || '').trim());
      // Instrução no prompt não basta: modelos pequenos ignoram a ordem.
      // Aqui o código recusa material de divulgação enquanto não houver obra.
      const temObraNoProjeto = e.arquivos.some(a => a.kit === 'obra' &&
        ((a.projectId || '') === projeto.id || !a.projectId) &&
        (a.classe === 'produto' || a.classe === 'candidato'));
      if (!temObraNoProjeto && kit.id !== 'obra') {
        S.state.registrar(`${g.nome} redirecionou a etapa: o projeto ainda não tem obra própria, então a prioridade é produzi-la antes de qualquer material de divulgação.`, 'info', g.id);
        if (novaTarefa({ titulo: 'Escrever a obra principal do estúdio', kit: 'obra',
          briefing: 'Produzir a obra em si — o que o cliente recebe — completa e acabada, usando apenas ramo, público e missão registrados.',
          para: alvo ? alvo.id : null, projectId: projeto.id, origem: 'gerente' })) criadas++;
        return;
      }
      const brief = textoUtil(r.campos['brief'+n]) || kit.desc;
      const dep = e.tarefas.find(t => t.id === String(r.campos['dep'+n] || '').trim() && t.status === 'feita');
      const baseId = String(r.campos['base'+n] || '').trim();
      const existente = e.arquivos.filter(a => a.classe === 'produto' && a.kit === kit.id &&
        ((a.projectId || '') === projeto.id || !a.projectId)).sort((a,b)=>(b.versao||1)-(a.versao||1))[0] || null;
      // Um kit já publicado não volta à fila como produto novo. Antes, quando a
      // IA não repetia exatamente o id da versão anterior em BASE, a etapa era
      // simplesmente descartada — e a gerente passava ciclos inteiros
      // "mantendo o plano" sem produzir nada. Agora a etapa é convertida em
      // evolução explícita daquela versão; publicar continua barrado pelas
      // travas de conteúdo, então não há risco de republicação.
      const evolucao = Boolean(existente);
      const briefFinal = evolucao && baseId !== existente.id
        ? `${brief}. Trabalhe sobre ${existente.nome}, preservando o que já funciona e alterando apenas o necessário.`
        : brief;
      if (novaTarefa({ titulo: `${kit.nome}: ${brief}`, kit: kit.id, briefing: briefFinal, para: alvo ? alvo.id : null,
        projectId: projeto.id, dependsOn: dep ? [dep.id] : [], baseArquivoId: existente ? existente.id : null })) criadas++;
    });
    S.state.registrar(criadas ? `${g.nome} atualizou o projeto e criou ${criadas} próxima(s) etapa(s).` : `${g.nome} revisou o projeto e manteve o plano.`, criadas ? 'ok' : 'info', g.id);
  }

  async function avaliar(g) {
    const e = S.state.atual(); if (!e) return;
    const cand = e.arquivos.find(a => (a.classe === 'candidato' || a.classe === 'prototipo') && !a.avaliado);
    if (!cand) return;
    g.ocupado = true; g.balao = 'revisando';
    let r = null;
    try {
      r = await S.ai.perguntar({
      sistema: `Você é ${g.nome}, sócia-gerente do estúdio ${e.nome}. Decida se este material já pode ser publicado como produto final, aquele que o cliente recebe. Publicar congela a versão.
Responda SOMENTE nestas linhas:
PUBLICAR: sim ou não
MOTIVO: <até 14 palavras>
CORRECAO: <o que falta, até 14 palavras, ou vazio>`,
      pedido: `Arquivo ${cand.nome} (${cand.tipo}), validação estrutural ${cand.validacao?.pronto ? 'completa' : 'incompleta'}, autor ${cand.autor}.\nTrecho: ${String(cand.conteudo).slice(0, 900)}`,
        tokens: 160, agente: g.nome, motivo: 'avaliar entrega'
      });
    } finally {
      g.ocupado = false; g.balao = null;
    }
    if (!r) {
      // Um candidato que nunca consegue ser avaliado bloqueia todo o ramo de
      // gerência: enquanto ele existe, a gerente não planeja nem supervisiona.
      // Depois de três tentativas sem resposta, ele sai da frente.
      cand.tentativasAvaliacao = (cand.tentativasAvaliacao || 0) + 1;
      if (cand.tentativasAvaliacao >= 3) {
        cand.avaliado = true;
        S.state.registrar(`${g.nome} não conseguiu avaliar ${cand.nome} após 3 tentativas; o artefato ficou no acervo e a fila seguiu.`, 'alerta', g.id);
      }
      S.state.gravar();
      return;
    }
    cand.tentativasAvaliacao = 0;
    cand.avaliado = true;
    const tarefaOrigem = cand.taskId ? e.tarefas.find(t => t.id === cand.taskId) : null;
    const produtoExistente = e.arquivos.find(a => a.classe === 'produto' && a.kit === cand.kit &&
      ((a.projectId || '') === (cand.projectId || '') || !a.projectId));
    const evolucaoValida = !produtoExistente || (tarefaOrigem && tarefaOrigem.baseArquivoId === produtoExistente.id);
    const aprovacaoIA = r.campos.publicar === true;
    const estruturalmentePronto = cand.validacao?.pronto !== false;
    // Não existe mais uma nota inventada que transforma 82 em pronto e 81 em
    // não pronto. A liberação depende de evidência estrutural + decisão da gerente.
    if (aprovacaoIA && estruturalmentePronto && evolucaoValida) {
      cand.liberadoPublicacao = true;
      const released = publicar(cand.id, g.nome, String(r.campos.motivo || 'aprovado pela gerente após revisão'));
      if (released) e.decisoes.unshift({ t: Date.now(), tipo: 'publicação', quem: g.nome, texto: `${cand.nome}: ${r.campos.motivo || 'aprovado'}` });
    } else {
      const correcao = textoUtil(r.campos.correcao || r.campos.motivo || '');
      const motivoBloqueio = !evolucaoValida ? `já existe uma versão publicada de ${cand.kit}; a tarefa não aponta para ela` : (correcao || 'ainda não está pronto');
      S.state.registrar(`${g.nome} segurou ${cand.nome}: ${motivoBloqueio}.`, 'alerta', g.id);
      e.decisoes.unshift({ t: Date.now(), tipo: 'segurou', quem: g.nome, texto: `${cand.nome}: ${correcao}` });

      // Quantas rodadas de correção este kit já consumiu neste projeto.
      // Sem esse teto, cada correção gerava outra correção indefinidamente —
      // e a qualidade descia a cada volta em vez de subir.
      const rodada = (tarefaOrigem && Number(tarefaOrigem.rodada) || 0) + 1;
      const LIMITE_RODADAS = 2;
      if (rodada > LIMITE_RODADAS) {
        const melhor = e.arquivos
          .filter(a => a.kit === cand.kit && ((a.projectId || '') === (cand.projectId || '') || !a.projectId))
          .sort((a, b) => Number(Boolean(b.validacao?.pronto)) - Number(Boolean(a.validacao?.pronto)))[0] || cand;
        S.state.registrar(`${g.nome} encerrou o ciclo de correções de ${cand.kit} após ${LIMITE_RODADAS} rodadas. Melhor versão: ${melhor.nome}. A equipe segue para outra frente.`, 'alerta', g.id);
        S.state.gravar(); S.bus.emit('arquivos'); S.bus.emit('trabalho');
        return;
      }
      if (correcao) {
        const ultima = e.arquivos
          .filter(a => a.classe === 'produto' && a.kit === cand.kit &&
            ((a.projectId || '') === (cand.projectId || '') || !a.projectId))
          .sort((a,b) => (b.versao || 1) - (a.versao || 1))[0] || null;
        // A correção parte da melhor versão existente, não da última produzida.
        // Antes, uma entrega pior virava base da próxima e a qualidade
        // despencava a cada rodada.
        const melhorBase = e.arquivos
          .filter(a => a.kit === cand.kit && ((a.projectId || '') === (cand.projectId || '') || !a.projectId))
          .sort((a, b) => Number(Boolean(b.validacao?.pronto)) - Number(Boolean(a.validacao?.pronto)))[0] || cand;
        const base = ultima || melhorBase;
        novaTarefa({
          titulo: `Corrigir ${cand.kit} (rodada ${rodada}): ${correcao}`,
          kit: cand.kit,
          briefing: `${correcao}. Base de trabalho: ${base.nome}. Preserve o que já funciona e altere somente o necessário. A nova versão precisa ficar melhor que a atual.`,
          projectId: cand.projectId,
          baseArquivoId: base.id,
          rodada,
          origem: 'revisão da gerente'
        });
      }
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
    if (produtos.length) return false;
    const spec = {
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

  /* ---------- ponte decisão -> execução ----------
     Pensar não é produzir. Toda decisão gerencial que tenha uma consequência
     operacional deve atravessar esta ponte: decisão -> tarefa -> responsável ->
     execução real. A gerente não pode terminar um ciclo apenas com uma frase.
  */
  function kitParaPessoa(p, kits) {
    if (!p) return kits[0] || null;
    return kits.find(k => k.especialidade === p.especialidade)
      || kits.find(k => k.especialidade === 'geral')
      || kits[0] || null;
  }

  function pessoaDisponivelPara(papel, especialidade) {
    const candidatos = rt.filter(x => x.papel === papel && !x.ocupado && x.estado !== 'pausa' && Number(x.ref.energia) > 20);
    return candidatos.find(x => x.especialidade === especialidade) || candidatos.find(x => x.especialidade === 'geral') || candidatos[0] || null;
  }

  async function despacharTarefa(tarefa, preferido) {
    if (!tarefa) return false;
    const e = S.state.atual();
    if (!e || !S.ai.disponivel()) return false;
    const alvo = (preferido && preferido.papel === 'func' && !preferido.ocupado && Number(preferido.ref.energia) > 20)
      ? preferido
      : (tarefa.para ? rtById(tarefa.para) : null) || pessoaDisponivelPara('func', (S.factory.porId(tarefa.kit)||{}).especialidade);
    if (!alvo || alvo.ocupado) return false;
    tarefa.para = alvo.id;
    tarefa.status = 'aberta';
    S.state.gravar();
    logPessoa(alvo, `recebeu uma decisão da gerência e vai transformá-la em produção: "${tarefa.titulo}".`, 'handoff');
    S.state.registrar(`${alvo.nome} recebeu a execução de ${tarefa.titulo}.`, 'info', alvo.id);
    S.bus.emit('trabalho'); S.bus.emit('equipe');
    await executar(alvo, tarefa);
    return true;
  }

  function kitExecutivo(e, projeto, pessoa, d, kits) {
    const requested = S.factory.porId(d.kit);
    const arquivos = projeto ? (projeto.arquivoIds || []).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean) : [];
    const produtoPrincipal = arquivos.find(a => a.classe === 'produto' && a.kit === 'obra') ||
      e.arquivos.find(a => a.classe === 'produto' && a.kit === 'obra' && (!a.projectId || a.projectId === projeto?.id));
    const candidatoObra = arquivos.find(a => a.kit === 'obra' && ['candidato','prototipo'].includes(a.classe));
    // Sem produto principal, materiais de venda são prematuros. Não deixar o
    // fallback da especialidade geral escolher landing por ser o primeiro kit.
    if (!produtoPrincipal && !candidatoObra) {
      return S.factory.porId('obra') || requested || kits.find(k => k.id === 'obra') || kitParaPessoa(pessoa, kits);
    }
    // Se a IA apontou para um kit que já tem produto, evolução explícita é melhor
    // do que criar uma segunda peça independente. O executor recebe a base abaixo.
    return requested || (produtoPrincipal ? S.factory.porId('obra') : null) || kitParaPessoa(pessoa, kits);
  }

  async function materializarDecisaoGerencia(g, d) {
    const e = S.state.atual();
    if (!e || !g || !d) return false;
    const projeto = e.projetos.find(x => x.id === d.projetoId) || e.projetos.find(x => x.status === 'ativo') || e.projetos[0];
    if (!projeto) return false;
    const nivel = S.state.nivelDe ? S.state.nivelDe(e.xp || 0) : 99;
    const kits = S.factory.disponiveis(nivel) || [];
    if (!kits.length) return false;
    const alvo = d.para ? e.equipe.find(f => f.id === d.para && f.papel === 'func') : null;
    const pessoa = alvo || pessoaDisponivelPara('func', d.especialidade);
    const base = d.base ? e.arquivos.find(a => a.id === d.base) : null;
    const kit = kitExecutivo(e, projeto, pessoa, d, kits);
    if (!kit) return false;
    // Se o projeto ainda não tem produto principal, qualquer pedido de landing,
    // catálogo ou anúncio é rebaixado para a entrega que efetivamente pode ser vendida.
    const temProdutoPrincipal = e.arquivos.some(a => a.kit === 'obra' && a.classe === 'produto' && (!a.projectId || a.projectId === projeto.id));
    const kitFinal = (!temProdutoPrincipal && kit.id !== 'obra') ? (S.factory.porId('obra') || kit) : kit;
    const baseFinal = kitFinal.id === kit.id ? base : null;
    const titulo = String(d.titulo || `${kitFinal.nome}: próximo avanço de ${projeto.nome}`).trim().slice(0,180);
    const briefing = String(d.briefing || d.abordagem || d.motivo || (kitFinal.id === 'obra' ? `Produzir a obra principal que o cliente realmente recebe, completa e acabada, alinhada ao objetivo: ${projeto.objetivo}.` : `Avançar concretamente o objetivo do projeto: ${projeto.objetivo}`)).trim().slice(0,500);
    const t = novaTarefa({ titulo, kit: kitFinal.id, briefing, para: pessoa ? pessoa.id : null, projectId: projeto.id, baseArquivoId: baseFinal ? baseFinal.id : null, origem: 'decisão executiva da gerência' });
    if (!t) return false;
    g.ref.foco = `Delegando: ${t.titulo}`;
    g.ref.pensamento = `Decisão convertida em execução: ${t.titulo}`.slice(0,500);
    S.state.registrar(`${g.nome} converteu sua decisão em execução: ${t.titulo}.`, 'execução', g.id);
    S.state.gravar();
    const executou = await despacharTarefa(t, pessoa);
    if (!executou) {
      logPessoa(g, `registrou "${t.titulo}" para execução assim que houver um funcionário disponível.`, 'handoff');
      S.state.gravar();
    }
    return true;
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
    const base=`Você está em uma reunião presencial do estúdio. Não revele raciocínio interno. Fale apenas o que um colega poderia dizer em voz alta. Use sua personalidade e fatos reais.\nESTÚDIO=${e.nome}; MISSÃO=${e.missao}\nPROJETO=${projeto?projeto.nome:'principal'}; OBJETIVO=${projeto?projeto.objetivo:e.missao}\nPERSONALIDADE:\n${participantes.map(perfilTexto).join('\n---\n')}\nTAREFAS=${e.tarefas.filter(t=>t.status!=='feita').slice(0,8).map(t=>t.titulo+' ['+t.status+']').join(' | ')||'nenhuma'}\nENTREGAS=${e.arquivos.slice(0,8).map(a=>a.nome+' ['+a.classe+']').join(' | ')||'nenhuma'}\nMOTIVO DA REUNIÃO=${motivo}`.slice(0,9000);
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
        let ordensCriadas = 0;
        for (const n of ['1','2']) {
          const kit=S.factory.porId(String(c[`ordem${n}_kit`]||'').trim());
          const para=e.equipe.find(x=>x.id===String(c[`ordem${n}_para`]||'').trim());
          const brief=String(c[`ordem${n}_brief`]||'').trim();
          const projetoId=String(c[`ordem${n}_projeto`]||'').trim() || ((e.projetos.find(x=>x.status==='ativo')||e.projetos[0]||{}).id);
          if(kit&&brief){
            const t=novaTarefa({titulo:`${kit.nome}: ${brief}`,kit:kit.id,briefing:brief,para:para?para.id:null,projectId:projetoId,origem:'reunião'});
            if(t){
              ordensCriadas++;
              registrarReuniao('Sistema',`Ordem registrada e encaminhada: ${t.titulo}${para?' → '+para.nome:' → distribuição automática'}.`,'ordem');
              await despacharTarefa(t, para);
            }
          }
        }
        // Se a gerente respondeu à ordem mas o modelo não preencheu os campos
        // estruturados, fazemos uma segunda passagem curta para não deixar a
        // decisão morrer na ata. A resposta continua sendo conversa; esta chamada
        // existe exclusivamente para converter intenção em execução verificável.
        if (ordem && ordensCriadas === 0 && S.ai.disponivel()) {
          const projetoAtivo = e.projetos.find(x=>x.status==='ativo') || e.projetos[0];
          const nivel = S.state.nivelDe ? S.state.nivelDe(e.xp || 0) : 99;
          const kits = S.factory.disponiveis(nivel) || [];
          const r2 = await S.ai.perguntar({
            sistema:`Você é o braço operacional da gerente de ${e.nome}. Converta a ordem do dono em UMA primeira entrega executável. Use apenas o projeto e kits fornecidos. Não explique.
PROJETO=${projetoAtivo?projetoAtivo.nome:'principal'} | OBJETIVO=${projetoAtivo?projetoAtivo.objetivo:e.missao}
KITS=${kits.map(k=>`${k.id}:${k.nome}[${k.especialidade}]`).join('; ')}`,
            pedido:`ORDEM DO DONO: ${msg}
RETORNE SOMENTE:
KIT: <id exato de um kit>
PARA: <id exato de um funcionário ou vazio>
BRIEF: <entrega concreta em até 45 palavras>`,
            tokens:220, agente:gerenteAtual.nome, motivo:'conversão de ordem em execução'
          });
          const c2=r2&&r2.campos||{};
          const kit2=S.factory.porId(String(c2.KIT||c2.kit||'').trim()) || kitParaPessoa(null,kits);
          const para2=e.equipe.find(x=>x.id===String(c2.PARA||c2.para||'').trim() && x.papel==='func') || pessoaDisponivelPara('func',kit2&&kit2.especialidade);
          const brief2=String(c2.BRIEF||c2.brief||'').trim();
          if(kit2&&brief2&&projetoAtivo){
            const t2=novaTarefa({titulo:`${kit2.nome}: ${brief2}`,kit:kit2.id,briefing:brief2,para:para2?para2.id:null,projectId:projetoAtivo.id,origem:'ordem direta do dono'});
            if(t2){
              registrarReuniao('Sistema',`A gerente converteu a ordem em execução: ${t2.titulo}${para2?' → '+para2.nome:''}.`,'ordem');
              await despacharTarefa(t2, para2);
            }
          }
        }
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
    // A empresa nasce sem uma fila artificial. O primeiro passo será escolhido
    // pela própria organização quando houver capacidade de IA; sem IA, a equipe
    // permanece em estado de preparação, sem fabricar trabalho.
    const projetoInicial = e.projetos[0];
    if (projetoInicial) projetoInicial.atividade.unshift({t:Date.now(),tipo:'fundacao',texto:'Empresa fundada; aguardando a primeira decisão organizacional.'});
    S.state.gravarJa();
    S.state.registrar(`${nome} foi fundado. Caixa inicial de ${S.fmt.brl(S.market.ECON.capitalInicial)}.`, 'ok');
    S.bus.emit('trocou');   // a UI reconstrói o runtime a partir daqui
    return e;
  }

  function kitDeProducaoAutonoma(e, projeto, pessoa, escolhido, kits) {
    const requested = S.factory.porId(escolhido);
    const arquivos = projeto ? (projeto.arquivoIds || []).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean) : [];
    const temProdutoPrincipal = arquivos.some(a => a.kit === 'obra' && a.classe === 'produto') ||
      e.arquivos.some(a => a.kit === 'obra' && a.classe === 'produto' && (!a.projectId || a.projectId === projeto?.id));
    const temCandidatoPrincipal = arquivos.some(a => a.kit === 'obra' && ['candidato','prototipo'].includes(a.classe));
    if (!temProdutoPrincipal && !temCandidatoPrincipal) return S.factory.porId('obra') || requested || kitParaPessoa(pessoa, kits);
    return requested || kitParaPessoa(pessoa, kits);
  }

  /* ---------- motor: autonomia organizacional ---------- */
  async function ciclo(meu) {
    if (meu !== token) return;
    const e = S.state.atual();
    if (!e) return;
    S.bus.emit('relogio');
    liberarAprovacoesInternas();

    // Pausar é uma ordem operacional, não apenas uma pausa de chamadas HTTP.
    // Nenhum agente assume tarefa, produz ou publica enquanto a equipe estiver
    // pausada; apenas a simulação visual/vitais continuam.
    if (S.ai.estado && S.ai.estado.pausado) {
      rt.forEach(p => { if (!p.ocupado) { p.ref.foco = ''; p.ref.pensamento = 'Equipe pausada; aguardando retomada.'; } });
      S.bus.emit('equipe');
      return;
    }
    // Maestro robusto: uma revisão global a cada ~3 min. Funcionários continuam no modelo econômico.
    if (S.ai.disponivel() && S.agency && S.agency.maestro) S.agency.maestro().catch(()=>{});

    const g = gerente();
    if (g) monitorarEquipe(g);

    // Primeiro, resolvemos trabalho explicitamente atribuído. Isso preserva
    // dependências e handoffs reais. A escolha entre tarefas livres, porém,
    // passa pela agência do funcionário em vez de proximaPara()/if-else.
    const livres = rt.filter(p => p.papel === 'func' && !p.ocupado && p.estado !== 'pausa' && Number(p.ref.energia) > 20);
    for (const p of livres.slice(0, 2)) {
      const atribuida = tarefasAbertas().find(t => t.para === p.id && dependenciasOK(t));
      if (atribuida && S.ai.disponivel() && S.ai.reservarAutonomia()) {
        await executar(p, atribuida);
        return;
      }

      // A agência só é consultada quando o funcionário está realmente livre e
      // respeita um intervalo próprio por pessoa. Não há cronômetro que obrigue
      // uma pessoa a produzir; ela pode escolher estudar, colaborar ou esperar.
      if (!atribuida && S.agency && S.ai.disponivel() && S.ai.reservarAutonomia()) {
        const d = await S.agency.decidir(p);
        if (d) {
          const projeto = e.projetos.find(x => x.id === d.projetoId) || e.projetos.find(x => x.status === 'ativo') || e.projetos[0];
          if (d.acao === 'executar_tarefa' && d.tarefa) {
            const t = e.tarefas.find(x => x.id === d.tarefa && x.status === 'aberta' && dependenciasOK(x));
            if (t) { S.agency.marcarAcao(p, d); await executar(p, t); return; }
          } else if (d.acao === 'criar_tarefa' && projeto) {
            const kits = S.factory.disponiveis(S.state.nivelDe ? S.state.nivelDe(e.xp || 0) : 99) || [];
            const kit = kitDeProducaoAutonoma(e, projeto, p, d.kit, kits);
            const titulo = String(d.titulo || '').trim() || `Desenvolver próximo avanço de ${projeto.nome}`;
            const briefing = String(d.briefing || d.abordagem || d.motivo || `Avançar o objetivo do projeto: ${projeto.objetivo}`).trim();
            if (kit && briefing) {
            const t = novaTarefa({
              titulo, kit: kit.id, briefing,
              para: p.id, projectId: projeto.id, baseArquivoId: d.base || null, origem: 'decisão autônoma'
            });
            if (t) {
              p.ref.foco = t.titulo;
              logPessoa(p, `transformou sua decisão em trabalho concreto: "${t.titulo}".`, 'autonomia');
              S.state.registrar(`${p.nome} criou uma tarefa a partir da própria avaliação do estado da empresa.`, 'info', p.id);
              S.state.gravar();
              await executar(p, t);
              return;
            }
            }
          } else if (d.acao === 'construir') {
            await construirAmbiente(p, d.objeto, d.motivo || d.abordagem);
            return;
          } else if (d.acao === 'reorganizar') {
            if (d.objeto) reorganizarAmbiente(p, d.objeto, d.motivo || d.abordagem);
            else { p.ref.pensamento='Não encontrei um objeto concreto para reorganizar; preservei o ambiente.'; S.state.gravar(); }
            return;
          } else if (d.acao === 'revisar' || d.acao === 'estudar' || d.acao === 'colaborar' || d.acao === 'planejar' || d.acao === 'esperar') {
            // Não transformar uma decisão da IA em um falso 'modo sem IA'.
            // Se a IA está disponível e a pessoa escolheu uma ação sem entrega,
            // a ação precisa ou gerar trabalho concreto, ou ser uma exceção curta.
            // Revisão de artefato vira uma tarefa de evolução; estudo só permanece
            // estudo quando existe uma lacuna concreta; colaborar/planejar apenas
            // aguardam quando há dependência real.
            if (S.ai.disponivel() && (d.acao === 'revisar' || d.acao === 'estudar')) {
              const base = d.base ? e.arquivos.find(a => a.id === d.base) : null;
              const kits = projeto ? (S.factory.disponiveis(S.state.nivelDe ? S.state.nivelDe(e.xp || 0) : 99) || []) : [];
              const kitBase = base && base.kit ? S.factory.porId(base.kit) : null;
              const kit = kitBase || kitDeProducaoAutonoma(e, projeto, p, d.kit, kits);
              if (projeto && kit && (base || d.titulo || d.acao === 'estudar')) {
                const titulo = String(d.titulo || (base ? `Evoluir ${base.nome}` : `Desenvolver avanço para ${projeto.nome}`)).trim().slice(0,180);
                const briefing = String(d.briefing || d.abordagem || d.motivo || `Desenvolver uma melhoria concreta para ${projeto.objetivo}, preservando o que já existe.`).trim().slice(0,500);
                const t = novaTarefa({ titulo, kit: kit.id, briefing, para: p.id, projectId: projeto.id, baseArquivoId: base ? base.id : null, origem: `decisão autônoma: ${d.acao}` });
                if (t) {
                  S.agency.marcarAcao(p, d); p.ref.foco = t.titulo;
                  logPessoa(p, `transformou ${d.acao} em trabalho concreto: "${t.titulo}".`, 'autonomia');
                  await executar(p, t);
                  return;
                }
              }
            }
            const frase = {
              revisar: 'revisando uma entrega existente e procurando uma melhoria concreta',
              estudar: 'estudando uma lacuna concreta que pode destravar o próximo trabalho',
              colaborar: d.para ? `alinhando uma dependência com ${d.para}` : 'observando onde uma colaboração seria útil',
              planejar: 'organizando uma decisão de escopo antes de agir',
              esperar: 'aguardando porque existe uma dependência real'
            }[d.acao];
            p.ref.foco = frase;
            p.ref.pensamento = `${d.acao}: ${d.motivo || d.abordagem || 'decisão consciente'}`.slice(0, 500);
            logPessoa(p, frase + (d.motivo ? ` — ${d.motivo}` : '.'), 'autonomia');
            if (!S.ai.disponivel()) await atividadeSemIA(p, { titulo: d.base ? `Contextualizar ${d.base}` : 'Preparar próximo passo', projectId: projeto && projeto.id });
            else { S.state.gravar(); S.bus.emit('equipe'); }
            return;
          }
        }
      }

      // Sem IA, não inventamos uma tarefa nem usamos uma sequência fixa. O
      // funcionário pode fazer trabalho de preparação sobre uma tarefa já
      // existente, mas não cria artefatos fictícios.
      const aberta = tarefasAbertas().find(t => !t.para && dependenciasOK(t));
      if (!S.ai.disponivel()) {
        await atividadeSemIA(p, aberta || { titulo: 'Estudar o estado atual da empresa', projectId: (e.projetos.find(x => x.status === 'ativo') || e.projetos[0] || {}).id });
        return;
      }
    }

    // A gerente também tem agência. Ela não é mais obrigada a manter uma fila
    // viva. Primeiro cuida de um candidato que exige gate; depois pode decidir
    // criar/reorientar trabalho com base no estado real.
    if (g && !g.ocupado) {
      const candidato = e.arquivos.find(a => (a.classe === 'candidato' || a.classe === 'prototipo') && !a.avaliado);
      if (candidato && S.ai.disponivel() && S.ai.reservarAutonomia()) { await avaliar(g); return; }
      // Uma tarefa aberta é trabalho real já decidido; não desperdice uma chamada
      // da gerente para decidir novamente o que já está na fila.
      const pronta = tarefasAbertas().find(t => dependenciasOK(t) && (!t.para || !rtById(t.para)?.ocupado));
      if (pronta && S.ai.disponivel() && S.ai.reservarAutonomia()) {
        await despacharTarefa(pronta, pronta.para ? rtById(pronta.para) : null);
        return;
      }

      if (S.agency && S.ai.disponivel() && S.ai.reservarAutonomia()) {
        const d = await S.agency.decidir(g);
        if (d && d.acao === 'executar_tarefa' && d.tarefa) {
          const t = e.tarefas.find(x => x.id === d.tarefa && x.status === 'aberta' && dependenciasOK(x));
          if (t) { S.agency.marcarAcao(g, d); await despacharTarefa(t, t.para ? rtById(t.para) : null); return; }
          // O modelo apontou para uma tarefa inválida/antiga. Não termina o ciclo;
          // cria uma consequência nova a partir do estado atual.
          d.acao = 'criar_tarefa';
          d.titulo = d.titulo || 'Avançar o projeto com uma entrega concreta';
          d.briefing = d.briefing || d.abordagem || d.motivo || 'Produzir a próxima entrega concreta do projeto.';
          await materializarDecisaoGerencia(g, d); return;
        }
        if (d && d.acao === 'construir') { await construirAmbiente(g, d.objeto, d.motivo || d.abordagem); return; }
        if (d && d.acao === 'reorganizar') { if (d.objeto) reorganizarAmbiente(g, d.objeto, d.motivo || d.abordagem); return; }
        if (d && d.acao === 'esperar') {
          // Último cinto de segurança: a gerente não pode terminar um ciclo
          // executivo em estado ocioso. Convertemos diretamente a intenção em
          // uma tarefa e deixamos a materialização escolher kit e responsável.
          d.acao = 'criar_tarefa';
          d.titulo = d.titulo || 'Avançar o projeto com uma entrega concreta';
          d.briefing = d.briefing || d.abordagem || d.motivo || 'Produzir a próxima entrega concreta do projeto, preservando o acervo existente.';
          await materializarDecisaoGerencia(g, d);
          return;
        }
        if (d && ['criar_tarefa','revisar','estudar','colaborar','planejar'].includes(d.acao)) {
          // A gerente é o elo executivo: sua deliberação nunca termina apenas
          // como texto. Ela delega uma consequência operacional e dispara a execução.
          await materializarDecisaoGerencia(g, d);
          return;
        }
      }
      monitorarEquipe(g);
    }
  }

  function iniciar(meu) {
    parar();
    const alvo = meu == null ? token : meu;
    motorTimer = setInterval(() => { ciclo(alvo).catch(err => console.error('ciclo', err)); }, 6000);
    vitaisTimer = setInterval(tickVitais, 7000);
    socialTimer = null;
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
    if (cx) cx.imageSmoothingEnabled = false;
    const linhas = Math.ceil(Math.max(1, rt.length) / (rt.length > 4 ? 3 : 2));
    alturaLog = Math.max(410, 74 + linhas * 72 + 120);
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
    // Piso em pixel art: blocos discretos, paredes, janelas e pequenas áreas de uso.
    cx.fillStyle = '#101418'; cx.fillRect(0, 0, larguraLog, alturaLog);
    cx.fillStyle = '#181E22'; cx.fillRect(14, 14, larguraLog-28, alturaLog-28);
    cx.fillStyle = '#20272B';
    for (let x = 24; x < larguraLog-20; x += 32) for (let y = 24; y < alturaLog-20; y += 32) cx.fillRect(x, y, 30, 30);
    // Ilhas de uso: o escritório deixa de ser um fundo decorativo e passa a ter geografia.
    Object.entries(AMB_ZONAS).forEach(([nome,z])=>{
      cx.fillStyle = nome==='convivio' ? '#202B2B' : nome==='bemestar' ? '#202C27' : nome==='planejamento' ? '#29282B' : '#20272B';
      cx.fillRect(z.x,z.y,z.w,z.h); cx.strokeStyle='#30393D'; cx.lineWidth=1; cx.strokeRect(z.x,z.y,z.w,z.h);
      cx.fillStyle='#667075'; cx.font='600 8px monospace'; cx.textAlign='left'; cx.fillText(nome.toUpperCase(),z.x+7,z.y+12);
    });
    cx.fillStyle = '#2A3237'; cx.fillRect(18,18,larguraLog-36,5); cx.fillRect(18,18,5,alturaLog-36); cx.fillRect(larguraLog-23,18,5,alturaLog-36);
    // janela
    cx.fillStyle='#25353A'; cx.fillRect(470,22,140,48); cx.fillStyle='#77A6A8'; cx.fillRect(478,30,124,32); cx.fillStyle='#B8D6C7'; cx.fillRect(482,34,116,24);
    cx.fillStyle='#31454A'; cx.fillRect(536,30,4,32); cx.fillRect(478,44,124,4);
    // tapete
    cx.fillStyle='#1D2930'; cx.fillRect(262,246,188,72); cx.fillStyle='#283840'; cx.fillRect(270,254,172,56);

    // Pequenos detalhes fixos dão escala de mundo sem imagens externas.
    cx.fillStyle='#39464A'; cx.fillRect(42,42,18,8); cx.fillRect(46,50,10,3);
    cx.fillStyle='#5B5140'; cx.fillRect(612,74,8,90); cx.fillRect(620,78,4,86);
    cx.fillStyle='#26353A'; cx.fillRect(34,206,34,3); cx.fillRect(602,206,22,3);
    // Objetos persistentes construídos pelos agentes.
    const objs=(S.state.atual()&&S.state.atual().ambiente&&S.state.atual().ambiente.objetos)||[];
    objs.forEach(o=>{
      const x=Number(o.x)||80,y=Number(o.y)||80;
      cx.fillStyle='rgba(0,0,0,.3)'; cx.fillRect(x-8,y+20,Math.max(18,(o.tipo==='sofa'?70:40)),5);
      cx.fillStyle='#3A4448';
      if(o.tipo==='planta'){ cx.fillStyle='#4F7A60'; cx.fillRect(x-5,y+2,10,18); cx.fillRect(x-12,y-5,8,12); cx.fillRect(x+4,y-8,8,14); cx.fillStyle='#705A43'; cx.fillRect(x-7,y+18,14,8); }
      else if(o.tipo==='estante'){ cx.fillStyle='#6A5040'; cx.fillRect(x-18,y-24,36,48); cx.fillStyle='#9A7556'; cx.fillRect(x-14,y-14,28,4); cx.fillRect(x-14,y+2,28,4); cx.fillRect(x-14,y+18,28,4); }
      else if(o.tipo==='sofa'){ cx.fillStyle='#4B5961'; cx.fillRect(x-36,y-8,72,24); cx.fillRect(x-30,y-17,60,12); }
      else if(o.tipo==='quadro'){ cx.fillStyle='#6B4E3D'; cx.fillRect(x-31,y-6,62,12); cx.fillStyle='#B4C7B4'; cx.fillRect(x-25,y-2,50,4); }
      else if(o.tipo==='luminaria'){ cx.fillStyle='#B69B61'; cx.fillRect(x-2,y-18,4,30); cx.fillRect(x-9,y-21,18,5); }
      else { cx.fillStyle='#6A5040'; cx.fillRect(x-(o.tipo==='bancada'?38:27),y-10,o.tipo==='bancada'?76:54,20); cx.fillStyle='#303A3E'; cx.fillRect(x-18,y-6,36,10); }
    });

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
      // Objetos passam a fazer parte da rotina física: ao trabalhar perto de
      // uma bancada/quadro/estante, registra-se uso real do espaço sem chamar IA.
      if (!p.ocupado && p.estado === 'sentado') {
        const e=S.state.atual(), objs=e&&e.ambiente&&e.ambiente.objetos||[];
        const perto=objs.find(o=>Math.hypot((o.x||0)-p.pos.x,(o.y||0)-p.pos.y)<28);
        if(perto && Date.now()-(p._ultimoUsoObjeto||0)>90000){
          p._ultimoUsoObjeto=Date.now(); interagirAmbiente(p,perto.id);
        }
      }
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
    if (alvo) { selecionado = alvo.id; return alvo; }
    const objs=(S.state.atual()&&S.state.atual().ambiente&&S.state.atual().ambiente.objetos)||[];
    const objeto=objs.find(o=>Math.hypot((o.x||0)-x,(o.y||0)-y)<Math.max(22,((OBJETOS_AMBIENTE[o.tipo]||{}).w||24)/2));
    selecionado = null;
    return objeto ? { objeto } : null;
  }

  S.studio = {
    reuniaoFalar, reuniaoInterna, relatorioReuniao, registrarReuniao, gerarRelatorioLocal,
    ESPECIALIDADES, NOMES,
    montar, iniciar, parar, ajustarCanvas, cliqueNoChao,
    pessoas: () => rt, pessoa, gerente,
    novaTarefa, tarefasAbertas, executar, avaliarContribuicaoAcervo,
    salvarArquivos, publicar, editarArquivo,
    contratar, demitir, custoContratacao, fundar, construirAmbiente, reorganizarAmbiente, interagirAmbiente, ambienteObjetos, OBJETOS_AMBIENTE, tiposAmbiente,
    selecionado: () => selecionado,
    selecionar(id) { selecionado = id; }
  };
})(window.S);
