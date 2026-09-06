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
    cafe: { x: 120, y: 350, rotulo: 'café/refeição' },
    reuniao: { x: 345, y: 276, rotulo: 'reunião' },
    quadro: { x: 525, y: 276, rotulo: 'quadro' },
    descanso: { x: 350, y: 350, rotulo: 'descanso' },
    dormitorio: { x: 555, y: 350, rotulo: 'dormitório' }
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

  async function bateBoca(a,b,motivo) {
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
      const ra=await S.ai.perguntar({sistema:base+`\n\nVocê é ${a.nome}. Responda somente:\nFALA: <até 45 palavras>`,pedido:`Você encontrou ${b.nome} no estúdio. Inicie uma conversa de trabalho sobre: ${motivo || 'o que está impedindo o projeto de avançar'}. A conversa precisa produzir entendimento útil, não conversa vazia.`,tokens:120,agente:a.nome,agenteId:a.id,motivo:'interação entre colegas'});
      fa=ra?String(ra.campos.fala||'').trim():'';
      if(fa){ registrarReuniao(a.nome,fa,'interacao'); logPessoa(a,`conversou com ${b.nome}: ${fa}`,'interacao'); a.ref.pensamento=fa.slice(0,220); }
      const rb=await S.ai.perguntar({sistema:base+`\n\nVocê é ${b.nome}. Responda somente:\nFALA: <até 45 palavras>`,pedido:`${a.nome} disse: ${fa||'Quero alinhar o que estamos fazendo.'}\nResponda naturalmente, acrescente informação ou faça uma pergunta útil.`,tokens:120,agente:b.nome,agenteId:b.id,motivo:'interação entre colegas'});
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

  function registrarReuniao(quem,texto,tipo){
    const e=S.state.atual(); if(!e)return;
    e.reuniao=e.reuniao||{mensagens:[],relatorios:[],reunioes:[]};
    e.reuniao.mensagens.push({id:uid('m'),t:Date.now(),quem:String(quem),texto:String(texto).slice(0,1200),tipo:tipo||'fala'});
    e.reuniao.mensagens=e.reuniao.mensagens.slice(-180);
    S.state.gravar();S.bus.emit('reuniao');
  }
  function gerarRelatorioLocal(e){
    const projeto=e.projetos.find(p=>p.status==='ativo')||e.projetos[0];
    const abertas=e.tarefas.filter(t=>t.status!=='feita').length, feitas=e.tarefas.filter(t=>t.status==='feita').length;
    const produtos=e.arquivos.filter(a=>a.classe==='produto').length;
    return `${projeto?projeto.nome:'Projeto principal'}: ${feitas} tarefas concluídas, ${abertas} em aberto, ${produtos} produtos finais. Últimos eventos: ${(e.log||[]).slice(-4).map(x=>x.texto).join(' | ')||'nenhum'}.`;
  }
  function relatorioReuniao(){const e=S.state.atual();if(!e)return '';const texto=gerarRelatorioLocal(e);registrarReuniao('Relatório',texto,'relatorio');return texto;}

  async function reuniaoInterna(motivo,opcoes){
    const e=S.state.atual();if(!e||!S.ai.pronta()||(S.ai.orcamentoIndisponivel&&S.ai.orcamentoIndisponivel()))return null;
    e.reuniao=e.reuniao||{mensagens:[],relatorios:[],reunioes:[]};if(e.reuniao.reuniaoAtiva)return null;
    const g=gerente();const participantes=rt.filter(p=>p.ref.energia>30&&!p.ocupado&&p.estado==='sentado').slice(0,3);
    if(g&&!participantes.includes(g))participantes.push(g);if(participantes.length<2)return null;
    e.reuniao.reuniaoAtiva={inicio:Date.now(),motivo,participantes:participantes.map(p=>p.id)};
    registrarReuniao('Sistema',`Reunião: ${motivo}`,'reuniao-inicio');
    const mesa=ESTACOES.reuniao;participantes.forEach((p,i)=>{p.ocupado=true;p.estado='andando';p.alvo={x:mesa.x+(i-1)*26,y:mesa.y};});
    await Promise.all(participantes.map((p,i)=>irPara(p,{x:mesa.x+(i-1)*26,y:mesa.y})));
    participantes.forEach(p=>{p.estado='falando';p.balao='ouvindo a equipe';});
    const projeto=e.projetos.find(x=>x.status==='ativo')||e.projetos[0];
    const estado=`MISSÃO=${e.missao}\nPROJETO=${projeto?projeto.nome:'principal'}\nOBJETIVO=${projeto?projeto.objetivo:e.missao}\nTAREFAS=${e.tarefas.filter(t=>t.status!=='feita').slice(0,8).map(t=>t.id+' '+t.titulo).join(' | ')||'nenhuma'}\nARTEFATOS=${e.arquivos.slice(0,8).map(a=>a.id+' '+a.nome+' ['+a.classe+']').join(' | ')||'nenhum'}\nSITE CENTRAL=${e.site&&e.site.projetoId?'sim — arquitetura livre, definida pela equipe':'a definir'}\nMOTIVO=${motivo}`;
    const falas=[];
    for(const p of participantes.filter(x=>x!==g)){
      const hist=falas.map(x=>`[${x.nome}] ${x.texto}`).join('\n')||'ninguém falou';
      const r=await S.ai.perguntar({sistema:`Você é ${p.nome}, ${p.cargo}. Reunião presencial de trabalho. Fale em voz alta, sem revelar raciocínio privado. Traga uma observação ou proposta que possa mudar a decisão. O produto e o site central devem nascer do contexto desta empresa; não use modelo ou layout pré-pronto.\n${estado}\nRETORNE: FALA: <até 65 palavras>`,pedido:`Histórico:\n${hist}\nDiga o que deve ser feito a seguir.`,tokens:150,agente:p.nome,agenteId:p.id,motivo:'reunião de trabalho'});
      const texto=r?String(r.campos.fala||'').trim():'';if(texto){falas.push({id:p.id,nome:p.nome,texto});registrarReuniao(p.nome,texto,'reuniao');logPessoa(p,`contribuiu: ${texto}`,'reuniao');p.ref.pensamento=texto.slice(0,220);p.balao=texto.slice(0,70);}
    }
    let decisao=null;
    if(g){
      const hist=falas.map(x=>`[${x.nome}] ${x.texto}`).join('\n')||'sem contribuições';
      const r=await S.ai.perguntar({sistema:`Você é ${g.nome}, sócia-gerente e autoridade final. Ouça a equipe e transforme a reunião em uma decisão operacional. Leia o estado real. Não dê nota.\n${estado}\nRETORNE SOMENTE:\nFALA: <até 65 palavras>\nDECISAO: criar_tarefa | corrigir | continuar | descartar | nenhuma\nTAREFA: <ação concreta, até 100 palavras>\nPARA: <id do funcionário ou vazio>\nBASE: <id do artefato ou vazio>`,pedido:`Falas:\n${hist}\nFeche a reunião com uma decisão que mude o estado do projeto quando houver algo a fazer.`,tokens:260,agente:g.nome,agenteId:g.id,motivo:'decisão executiva em reunião'});
      if(r){const c=r.campos||{};decisao={acao:String(c.decisao||'').toLowerCase().trim(),texto:String(c.tarefa||'').trim(),para:String(c.para||'').trim(),base:String(c.base||'').trim()};const fala=String(c.fala||'').trim();if(fala){falas.push({id:g.id,nome:g.nome,texto:fala});registrarReuniao(g.nome,fala,'reuniao');logPessoa(g,`fechou a reunião: ${fala}`,'reuniao');g.ref.pensamento=fala.slice(0,220);g.balao=fala.slice(0,70);}}
    }
    if(decisao&&decisao.acao==='descartar'&&decisao.base){const a=e.arquivos.find(x=>x.id===decisao.base);if(a&&a.classe!=='produto'){e.arquivos=e.arquivos.filter(x=>x.id!==a.id);e.projetos.forEach(pr=>pr.arquivoIds=pr.arquivoIds.filter(id=>id!==a.id));registrarReuniao(g.nome,`Descartei ${a.nome}.`,'decisao');}}
    if(decisao&&['criar_tarefa','corrigir','continuar'].includes(decisao.acao)&&decisao.texto&&projeto){const base=decisao.base?e.arquivos.find(a=>a.id===decisao.base):null;const alvo=decisao.para?rtById(decisao.para):null;const t=novaTarefa({titulo:decisao.texto,kit:'autonomo',briefing:decisao.texto,para:alvo&&alvo.papel==='func'?alvo.id:null,projectId:projeto.id,baseArquivoId:base?base.id:null,origem:'reunião'});if(t){registrarReuniao('Sistema',`A decisão virou trabalho: ${t.titulo}${alvo?' → '+alvo.nome:''}.`,'ordem');await despacharTarefa(t,alvo);}}
    registrarReuniao('Sistema',`Reunião encerrada: ${decisao&&decisao.texto||'a gerente encerrou sem nova tarefa.'}`,'reuniao-fim');
    e.reuniao.reunioes.unshift({id:uid('reu'),t:Date.now(),motivo,participantes:participantes.map(p=>p.nome),falas:falas.slice(-10),decisao:decisao&&decisao.texto||''});e.reuniao.reunioes=e.reuniao.reunioes.slice(0,30);delete e.reuniao.reuniaoAtiva;
    participantes.forEach(p=>{p.ocupado=false;p.balao=null;p.estado='andando';p.ref.foco='';});await Promise.all(participantes.map(p=>irPara(p,assento(p))));
    S.state.gravar();S.bus.emit('reuniao');S.bus.emit('equipe');S.bus.emit('trabalho');return{participantes,falas,decisao};
  }

  async function reuniaoFalar(texto){
    const e=S.state.atual(),msg=String(texto||'').trim();if(!e||!msg)return{ok:false,erro:'Digite uma mensagem.'};
    registrarReuniao('Você',msg,'usuario');if(!S.ai.pronta())return{ok:true,falas:0};
    const g=gerente(),projeto=e.projetos.find(x=>x.status==='ativo')||e.projetos[0];const pessoas=e.equipe.filter(x=>x.papel!=='gerente').slice(0,4);const contexto=`MISSÃO=${e.missao}\nPROJETO=${projeto?projeto.nome:'principal'} | OBJETIVO=${projeto?projeto.objetivo:e.missao}\nTAREFAS=${e.tarefas.filter(t=>t.status!=='feita').slice(0,8).map(t=>t.id+' '+t.titulo).join(' | ')||'nenhuma'}\nARTEFATOS=${e.arquivos.slice(0,6).map(a=>a.id+' '+a.nome+' ['+a.classe+']').join(' | ')||'nenhum'}`;
    for(const p of pessoas){const r=await S.ai.perguntar({sistema:`Você é ${p.nome}, ${p.cargo}. Responda ao dono pelo seu ponto de vista profissional. Não revele raciocínio privado. Se houver uma ação útil, diga qual.\n${contexto}\nFALA:`,pedido:msg,tokens:150,agente:p.nome,agenteId:p.id,motivo:'conversa com o dono'});const fala=r?String(r.campos.fala||r.texto||'').trim():'';if(fala){registrarReuniao(p.nome,fala,'resposta');p.balao=fala.slice(0,70);p.ref.pensamento=fala.slice(0,220);}}
    if(g){const r=await S.ai.perguntar({sistema:`Você é ${g.nome}, gerente e autoridade final. Interprete a mensagem do dono e a equipe. Se houver trabalho a fazer, transforme a intenção em uma tarefa executável.\n${contexto}\nRETORNE SOMENTE:\nFALA: <até 80 palavras>\nACAO: criar_tarefa | executar_tarefa | revisar | reuniao | nenhuma\nTAREFA: <ação concreta, até 100 palavras>\nPARA: <id ou vazio>\nBASE: <id do artefato ou vazio>`,pedido:`Dono: ${msg}`,tokens:300,agente:g.nome,agenteId:g.id,motivo:'decisão da gerente na sala'});if(r){const c=r.campos||{};const fala=String(c.fala||'').trim();if(fala){registrarReuniao(g.nome,fala,'resposta');g.balao=fala.slice(0,70);g.ref.pensamento=fala.slice(0,240);}const acao=String(c.acao||'').toLowerCase().trim();const tarefa=String(c.tarefa||'').trim();if(['criar_tarefa','executar_tarefa','revisar'].includes(acao)&&tarefa&&projeto){const base=String(c.base||'').trim()?e.arquivos.find(a=>a.id===String(c.base).trim()):null;const alvo=String(c.para||'').trim()?rtById(String(c.para).trim()):null;const t=novaTarefa({titulo:tarefa,kit:'autonomo',briefing:tarefa,para:alvo&&alvo.papel==='func'?alvo.id:null,projectId:projeto.id,baseArquivoId:base?base.id:null,origem:'ordem do dono'});if(t){registrarReuniao('Sistema',`A gerente transformou sua orientação em trabalho: ${t.titulo}.`,'ordem');await despacharTarefa(t,alvo);}}else if(acao==='reuniao'){await reuniaoInterna(`decidir como executar a orientação do dono: ${msg}`,{});}}}
    S.state.gravar();S.bus.emit('reuniao');S.bus.emit('equipe');S.bus.emit('trabalho');return{ok:true,falas:pessoas.length};
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
    const semOrcamento = S.ai && S.ai.orcamentoEsgotado && S.ai.orcamentoEsgotado();
    rt.forEach(p => {
      const f = p.ref; if (!f) return;
      f.cuidados = f.cuidados || {};
      f.cuidados.fome = clamp(Number(f.cuidados.fome || 0) + (p.ocupado ? 0.16 : 0.07), 0, 100);
      f.cuidados.sono = clamp(Number(f.cuidados.sono || 0) + (p.ocupado ? 0.12 : 0.05), 0, 100);
      if (p.estado === 'dormindo') {
        f.energia = clamp(f.energia + 0.55, 0, 100);
        f.cuidados.sono = clamp(f.cuidados.sono - 0.85, 0, 100);
        f.humor = clamp(f.humor + 0.12, 0, 100);
      } else if (p.estado === 'comendo') {
        f.cuidados.fome = clamp(f.cuidados.fome - 1.25, 0, 100);
        f.cuidados.sono = clamp(f.cuidados.sono + 0.01, 0, 100);
        f.energia = clamp(f.energia + 0.08, 0, 100);
      } else if (p.ocupado) f.energia = clamp(f.energia - 0.12, 0, 100);
      else if (p.estado === 'pausa' || !rel.expediente) f.energia = clamp(f.energia + 0.25, 0, 100);
      else f.energia = clamp(f.energia - 0.015, 0, 100);
      f.humor = clamp(f.humor + (f.humor < 60 ? 0.35 : -0.12), 0, 100);
      const agora = Date.now();

      // Quando o orçamento de 30 dias acaba, a equipe não finge trabalhar:
      // a rotina física continua, mas nenhuma chamada de IA é iniciada.
      if (semOrcamento && !p.ocupado && p.estado !== 'dormindo' && p.estado !== 'comendo') {
        if (f.cuidados.fome > 58) {
          p.estado='comendo'; f.cuidados.rotina='refeicao'; p.balao='comendo';
          logPessoa(p,'foi comer enquanto o orçamento de IA está esgotado.','rotina');
          irPara(p,ESTACOES.cafe).then(()=>setTimeout(()=>{ if(p.estado==='comendo'){p.estado='dormindo';f.cuidados.rotina='sono';p.balao='dormindo';irPara(p,ESTACOES.dormitorio);logPessoa(p,'foi descansar no dormitório; aguardando a renovação do orçamento de IA.','rotina');}},7000));
        } else {
          p.estado='dormindo'; f.cuidados.rotina='sono'; p.balao='dormindo';
          logPessoa(p,'encerrou o expediente e foi dormir porque o orçamento de IA do período acabou.','rotina');
          irPara(p,ESTACOES.dormitorio);
        }
        return;
      }
      if (!semOrcamento && p.estado === 'dormindo' && f.cuidados.sono < 45) {
        p.estado='andando'; p.balao='voltando ao trabalho';
        irPara(p,assento(p)).then(()=>{p.estado='sentado';p.balao=null;f.cuidados.rotina='trabalho';logPessoa(p,'voltou ao posto depois que o orçamento de IA foi renovado.','rotina');});
      }
      if (rel.expediente && f.energia < 62 && agora - (f.cuidados.ultimo || 0) > 12 * 60 * 1000 && !p.ocupado && !semOrcamento) {
        f.cuidados.ultimo = agora; f.cuidados.pausa = (f.cuidados.pausa || 0) + 1;
        p.estado = 'pausa';
        const est = f.energia < 42 ? ESTACOES.descanso : ESTACOES.cafe;
        logPessoa(p, f.energia < 42 ? 'fez uma pausa de recuperação antes de retomar o trabalho.' : 'fez uma pausa curta para água/café e reorganização.', 'bem-estar');
        irPara(p, est).then(() => setTimeout(() => { if (p.estado === 'pausa') irPara(p, assento(p)).then(() => { p.estado = 'sentado'; logPessoa(p, 'retomou as atividades após a pausa.', 'bem-estar'); }); }, 9000));
      }
      if (rel.expediente && agora - (f.cuidados.agua || 0) > 25 * 60 * 1000 && !p.ocupado && !semOrcamento) { f.cuidados.agua = agora; logPessoa(p, 'fez uma pausa breve para hidratação.', 'bem-estar'); }
      if (f.energia < 18 && p.estado !== 'pausa' && !p.ocupado && !semOrcamento) {
        p.estado = 'pausa'; logPessoa(p, 'interrompeu o trabalho para recuperação: energia baixa.', 'bem-estar');
        irPara(p, ESTACOES.descanso).then(() => setTimeout(() => { if (p.estado === 'pausa') irPara(p, assento(p)).then(() => { p.estado = 'sentado'; logPessoa(p, 'retomou o trabalho após recuperação.', 'bem-estar'); }); }, 9000));
      }
    });
    S.bus.emit('equipe'); S.state.gravar();
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

  /* Registro objetivo de continuidade: sem pontuação artificial. */
  function registrarContribuicaoAcervo(p, tarefa, salvos) {
    if (!p || !p.ref) return;
    const e = S.state.atual();
    const projeto = e && e.projetos.find(x => x.id === tarefa.projectId);
    const base = tarefa.baseArquivoId ? e.arquivos.find(a => a.id === tarefa.baseArquivoId) : null;
    const texto = base
      ? `Evoluiu ${base.nome} e manteve a entrega ligada ao projeto.`
      : salvos && salvos.length
        ? `Criou ${salvos.map(a=>a.nome).join(', ')} como material concreto do projeto.`
        : 'Registrou uma contribuição concreta ao projeto.';
    p.ref.contribuicaoAcervo = { ultima: texto.slice(0,220), atualizadoEm: Date.now(), arquivoIds: (salvos||[]).map(a=>a.id) };
    lembrar(p, `Acervo: ${texto}`);
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
        linhagem: meta.linhagem || (meta.baseArquivoId && e.arquivos.find(x => x.id === meta.baseArquivoId)?.linhagem) || ('p:' + (meta.projectId || (e.projetos[0] && e.projetos[0].id) || '') + ':' + slug(a.nome)),
        autor: p ? p.nome : 'equipe', autorId: p ? p.id : null, criadoEm: Date.now(), quando: S.fmt.dataHora(),
        taskId: meta.taskId || null, baseArquivoId: meta.baseArquivoId || null,
        briefing: String(meta.briefing || '').slice(0, 500), liberadoPublicacao: false,
        siteCentral: Boolean(meta.siteCentral), sitePath: meta.sitePath || null, clienteVisivel: Boolean(meta.clienteVisivel)
      };
      e.arquivos.unshift(arq);
      return arq;
    });
    if (e.arquivos.length > 90) e.arquivos.length = 90;
    if (p && p.ref) p.ref.entregas = (p.ref.entregas || 0) + 1;
    S.state.registrar(
      `${p ? p.nome : 'A equipe'} entregou ${salvos.map(a => a.nome).join(', ')} e vinculou o resultado ao projeto.`,
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
    const doMesmoKit = a => a.classe === 'produto' && a.linhagem === base.linhagem &&
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
      projectId: projId, linhagem: base.linhagem || ('p:' + projId + ':' + slug(base.nome)),
      liberadoPublicacao: true
    });
    e.arquivos.unshift(produto);
    const proj = projeto;
    if (proj) {
      if (!proj.arquivoIds.includes(produto.id)) proj.arquivoIds.unshift(produto.id);
      proj.atividade.unshift({ t: Date.now(), tipo: 'publicacao', texto: `${produto.nome} entrou no projeto.` });
      proj.atividade = proj.atividade.slice(-40);
      // Tudo que é cliente-visível pertence ao site central da empresa.
      // A equipe decide a arquitetura e a linguagem; o código não fornece template.
      if (!base.siteCentral && base.clienteVisivel) {
        const siteArquivos = e.arquivos.filter(a => a.siteCentral && a.projectId === proj.id);
        const siteBase = siteArquivos.find(a => /(^|\/)index\.html$/i.test(a.sitePath || a.nome)) || siteArquivos[0];
        if (siteBase) {
          const jaExiste = e.tarefas.some(t => t.status !== 'feita' && t.projectId === proj.id && /integrar|site central/i.test(t.titulo));
          if (!jaExiste) novaTarefa({titulo:`Integrar ${produto.nome} ao site central`,kit:'autonomo',briefing:`Integrar ${produto.nome} ao site central da empresa sem impor template. Leia a arquitetura atual, preserve o que funciona e faça a alteração necessária para o cliente encontrar e usar o produto.`,projectId:proj.id,baseArquivoId:siteBase.id,origem:'integração ao site central'});
        }
      }
    }
    // Publicar congela uma versão que a gerente considerou pronta para sair.
    // Não existe mercado, cliente ou receita simulados neste aplicativo.
    S.state.gravar();
    S.bus.emit('arquivos');
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
    S.state.gravar(); S.bus.emit('ambiente'); S.bus.emit('equipe'); return true;
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
    const titulo = limpo(dados.titulo, 24); if (!titulo || titulo.length < 6) return null;
    if (e.tarefas.some(t => t.status !== 'feita' && t.titulo.toLowerCase() === titulo.toLowerCase())) return null;
    // Dedupe real: o mesmo kit não pode ter duas etapas abertas no mesmo
    // projeto, e uma etapa idêntica concluída há pouco não volta em loop.
    // Comparar só o título exato entre tarefas abertas deixava "Produzir
    // Catálogo..." nascer de novo assim que a anterior virava "feita".
    const projAlvo = dados.projectId || null;
    if (dados.kit !== 'autonomo' && e.tarefas.some(t => t.status !== 'feita' && t.kit === dados.kit && (t.projectId || null) === projAlvo)) return null;
    const repetidaRecente = e.tarefas.some(t => t.status === 'feita' &&
      t.titulo.toLowerCase() === titulo.toLowerCase() &&
      Date.now() - (t.concluidaEm || 0) < 20 * 60000);
    if (repetidaRecente) return null;
    const projeto = e.projetos.find(p => p.id === dados.projectId) || e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    const t = {
      id: uid('t'), titulo, kit: dados.kit || 'autonomo', briefing: limpo(dados.briefing) || titulo,
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
  async function despacharTarefa(t, alvo) {
    const e=S.state.atual(); if(!e||!t) return false;
    const candidato=(alvo&&alvo.papel==='func'&&!alvo.ocupado?alvo:null)
      || rt.find(p=>p.papel==='func'&&!p.ocupado&&p.estado==='sentado'&&p.ref.energia>20&&(!t.para||p.id===t.para));
    if(!candidato) {
      t.status='aberta'; S.state.gravar(); return false;
    }
    t.para=candidato.id;
    S.state.gravar(); S.bus.emit('trabalho');
    candidato.balao=`recebi: ${t.titulo.slice(0,42)}`;
    await sleep(650); candidato.balao=null;
    return executar(candidato,t);
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
      if (S.ai.disponivel(p.id)) {
        try {
          deliberacao = await S.ai.deliberar({
            sistema: `Você é ${p.nome}, ${p.cargo} do estúdio ${e.nome}. Trabalha dentro de um projeto contínuo. Missão: ${e.missao}. Público: ${e.publico}. Projeto: ${(e.projetos.find(x=>x.id===tarefa.projectId)||{}).objetivo || e.missao}. Tarefa: ${tarefa.titulo}. Briefing: ${tarefa.briefing}.`,
            pedido: `Pense no que precisa ser feito e transforme essa decisão em uma abordagem executável para esta tarefa. Examine o acervo existente e preserve continuidade. Não invente fatos. Retorne somente a síntese operacional.`,
            tokens: 420, reasoning_effort: 'low', agente: p.nome, agenteId: p.id, motivo: 'pensamento antes da produção'
          });
          if (deliberacao && deliberacao.resumo) {
            p.ref.pensamento = deliberacao.resumo.slice(0, 500);
            lembrar(p, `Decisão para ${tarefa.titulo}: ${deliberacao.resumo.slice(0, 160)}`);
            logPessoa(p, `transformou o pensamento em uma abordagem executável para produzir.`, 'pensamento');
          }
        } catch (err) {
          p.ref.pensamento = 'A camada de pensamento falhou nesta rodada; o briefing persistente continua sendo a instrução de produção.';
          logPessoa(p, 'a camada de pensamento falhou; preservou o briefing e tentou a IA de produção.', 'alerta');
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
        registrarContribuicaoAcervo(p, tarefa, salvos);
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

  async function avaliar(g) {
    const e = S.state.atual(); if (!e || !g || g.ocupado || (S.ai.orcamentoIndisponivel && S.ai.orcamentoIndisponivel())) return;
    const candidatos = e.arquivos.filter(a => (a.classe === 'candidato' || a.classe === 'prototipo') && !a.avaliado);
    const cand = candidatos[0];
    if (!cand) return;
    g.ocupado = true; g.estado = 'trabalhando'; g.balao = 'lendo a entrega';
    const projeto = e.projetos.find(x => x.id === cand.projectId) || e.projetos.find(x => x.status === 'ativo') || e.projetos[0];
    const tarefa = cand.taskId ? e.tarefas.find(t => t.id === cand.taskId) : null;
    const contexto = `Você é ${g.nome}, gerente e autoridade final do estúdio ${e.nome}. Sua função não é dar uma nota. Você deve INSPECIONAR o conteúdo real, comparar com o objetivo do projeto, lembrar decisões anteriores e decidir o destino desta entrega.

MISSÃO: ${e.missao}
PÚBLICO: ${e.publico}
PROJETO: ${projeto ? projeto.nome : 'principal'}
OBJETIVO: ${projeto ? projeto.objetivo : e.missao}
TAREFA QUE GEROU A ENTREGA: ${tarefa ? tarefa.titulo + ' | ' + tarefa.briefing : 'não registrada'}
ARQUIVO: ${cand.id} | ${cand.nome} | ${cand.tipo} | autor=${cand.autor} | versão=${cand.versao || 1}
ARTEFATO BASE: ${cand.baseArquivoId || 'nenhum'}

CONTEÚDO COMPLETO DA ENTREGA:
${String(cand.conteudo || '').slice(0, 16000)}

ARTEFATOS RELACIONADOS:
${e.arquivos.filter(a => a.id !== cand.id && (a.projectId === cand.projectId || a.linhagem === cand.linhagem)).slice(0,6).map(a => `${a.id} ${a.nome} [${a.classe}]\n${String(a.conteudo||'').slice(0,2200)}`).join('\n\n') || 'nenhum'}

DECISÕES RECENTES:
${(e.decisoes||[]).slice(0,8).map(d=>d.texto).join(' | ') || 'nenhuma'}

DECIDA PELO TRABALHO REAL. Você pode:
- publicar: a entrega cumpre o objetivo e está pronta para sair da empresa;
- corrigir: existe problema concreto e você deve mandar alguém corrigi-lo;
- descartar: a entrega não deve continuar;
- continuar: está correta como etapa, mas outra etapa precisa ser executada antes.
Não use pontuação. Cite problemas específicos encontrados no conteúdo. Se corrigir/continuar, descreva a próxima ação em termos executáveis.`;
    try {
      const r = await S.ai.perguntar({
        sistema: contexto + `\n\nRETORNE SOMENTE:\nDECISAO: publicar | corrigir | descartar | continuar\nANALISE: <o que você realmente encontrou no conteúdo, até 100 palavras>\nEVIDENCIAS: <até 3 verificações concretas feitas no conteúdo>\nPENDENCIAS: <o que ainda impede o produto; escreva nenhuma se não houver>\nACAO: <próxima ação concreta, até 80 palavras>\nPARA: <id do funcionário ou vazio>\nBASE: <id do artefato base ou vazio>\nPRONTO: sim | nao`,
        pedido: `Inspecione agora o arquivo ${cand.nome}. Não avalie aparência nem atribua nota. Leia o conteúdo e tome uma decisão executiva que altere o próximo estado do projeto.`,
        tokens: 520, reasoning_effort: 'low', agente: g.nome, agenteId: g.id, motivo: 'auditoria real de artefato'
      });
      if (!r) return;
      const c = r.campos || {};
      const decisao = String(c.decisao || '').toLowerCase().trim();
      const analise = String(c.analise || '').trim();
      const evidencias = String(c.evidencias || '').trim();
      const pendencias = String(c.pendencias || '').trim();
      const pronto = String(c.pronto || '').toLowerCase().trim();
      const acao = String(c.acao || '').trim();
      g.balao = analise.slice(0, 70) || decisao;
      registrarReuniao(g.nome, `${decisao.toUpperCase()}: ${analise}${evidencias ? ' Evidências: ' + evidencias : ''}${pendencias ? ' Pendências: ' + pendencias : ''}${acao ? ' Próximo passo: ' + acao : ''}`, 'gerencia');
      logPessoa(g, `inspecionou ${cand.nome}: ${decisao}. ${analise}`, 'supervisao');
      g.ref.pensamento = `${decisao}: ${analise}`.slice(0, 500);
      cand.avaliado = true;

      if (decisao === 'publicar' && pronto === 'sim' && (!pendencias || /^nenhuma$|^nenhum$/i.test(pendencias))) {
        cand.liberadoPublicacao = true;
        const produto = publicar(cand.id, g.nome, analise || 'Aprovado pela gerente após inspeção do conteúdo.');
        if (produto) {
          registrarReuniao(g.nome, `Liberei ${produto.nome} para sair do estúdio.`, 'decisao');
          projeto && projeto.atividade.unshift({t:Date.now(),tipo:'release',texto:`${g.nome} aprovou ${produto.nome} após inspeção do conteúdo.`});
        }
      } else if (decisao === 'publicar') {
        cand.avaliado = false;
        const tarefaNova = novaTarefa({titulo:`Resolver pendências de ${cand.nome}`,kit:'autonomo',briefing:acao || pendencias || 'Revisar o produto final e eliminar tudo que ainda impede a publicação.',para:String(c.para||'').trim()||cand.autorId,projectId:cand.projectId||projeto.id,baseArquivoId:cand.id,origem:'gate rigoroso de produto'});
        if(tarefaNova) registrarReuniao(g.nome,`Não liberei ${cand.nome}: ainda existem pendências ou a verificação final não foi declarada concluída.`,'ordem');
      } else if (decisao === 'descartar') {
        e.arquivos = e.arquivos.filter(a => a.id !== cand.id);
        if (projeto) projeto.arquivoIds = projeto.arquivoIds.filter(id => id !== cand.id);
        registrarReuniao(g.nome, `Descartei ${cand.nome}. Motivo: ${analise || 'não atende ao objetivo do projeto'}.`, 'decisao');
      } else if (decisao === 'corrigir') {
        const alvo = e.equipe.find(f => f.id === String(c.para || '').trim() && f.papel === 'func') || e.equipe.find(f => f.papel === 'func' && f.id === cand.autorId);
        const tarefaNova = novaTarefa({
          titulo: `Corrigir: ${cand.nome}`, kit: 'autonomo', briefing: acao || `Corrigir os problemas encontrados pela gerente em ${cand.nome}: ${analise}`,
          para: alvo ? alvo.id : null, projectId: cand.projectId || (projeto && projeto.id), baseArquivoId: cand.id, origem: 'decisão da gerente após inspeção'
        });
        if (tarefaNova) { cand.avaliado = true; registrarReuniao(g.nome, `Enviei ${cand.nome} para correção${alvo ? ' com ' + alvo.nome : ''}.`, 'ordem'); }
      } else if (decisao === 'continuar') {
        const tarefaNova = novaTarefa({
          titulo: `Próxima etapa: ${cand.nome}`, kit: 'autonomo', briefing: acao || `Continuar o desenvolvimento a partir de ${cand.nome}. Decisão da gerente: ${analise}`,
          para: String(c.para || '').trim() || null, projectId: cand.projectId || (projeto && projeto.id), baseArquivoId: String(c.base || '').trim() || cand.id, origem: 'decisão da gerente após inspeção'
        });
        if (tarefaNova) registrarReuniao(g.nome, `A entrega ${cand.nome} passou para a próxima etapa.`, 'ordem');
      } else {
        cand.avaliado = false;
        throw new Error('A gerente não produziu uma decisão executiva válida.');
      }
    } finally {
      g.ocupado = false; g.balao = null; g.estado = 'sentado';
      S.state.gravar(); S.bus.emit('arquivos'); S.bus.emit('trabalho'); S.bus.emit('equipe');
    }
  }

  function personalidadeInicial(especialidade,nome){
    const perfis={
      criacao:{tracos:['criativo','curioso','observador'],comunicacao:'visual e direta',prioridades:'clareza, experiência e coerência',estilo:'explora alternativas antes de escolher',colaboracao:'pede referências e compartilha versões',aversoes:'repetição sem propósito'},
      comercial:{tracos:['persuasivo','prático','atento a contexto'],comunicacao:'objetiva e orientada a impacto',prioridades:'clareza e proposta de valor',estilo:'procura a mensagem mais útil',colaboracao:'transforma ideias em mensagens acionáveis',aversoes:'mensagens vagas'},
      dados:{tracos:['analítico','metódico','cauteloso'],comunicacao:'precisa e organizada',prioridades:'consistência e rastreabilidade',estilo:'confere antes de consolidar',colaboracao:'documenta dependências',aversoes:'dados sem origem'},
      producao:{tracos:['detalhista','pragmático','persistente'],comunicacao:'curta e concreta',prioridades:'acabamento e estabilidade',estilo:'melhora o que já existe',colaboracao:'faz revisão e handoff',aversoes:'retrabalho'},
      geral:{tracos:['adaptável','curioso','colaborativo'],comunicacao:'direta e cordial',prioridades:'utilidade e continuidade',estilo:'entra onde existe gargalo',colaboracao:'pede contexto e compartilha',aversoes:'trabalho desconectado'}
    };
    return Object.assign({},perfis[especialidade]||perfis.geral,{experiencia:`experiência prática em ${especialidade}`,nome:nome||''});
  }
  function custoContratacao(){return 0;}
  function contratar(nome,especialidade){
    const e=S.state.atual();if(!e)return false;const esp=ESPECIALIDADES.find(x=>x.id===especialidade)||ESPECIALIDADES[4];
    const novo={id:uid('a'),nome:nome||pick(NOMES),papel:'func',cargo:esp.cargo,especialidade:esp.id,cor:S.state.PALETA[e.equipe.length%S.state.PALETA.length],energia:85,humor:70,entregas:0,memoria:[],uso:{chamadas:0,tokens:0},personalidade:personalidadeInicial(esp.id,nome)};
    e.equipe.push(novo);S.state.registrar(`${novo.nome} entrou na equipe como ${novo.cargo}.`,'ok');S.state.gravar();montar();return true;
  }
  function demitir(id){const e=S.state.atual();if(!e)return false;const f=e.equipe.find(x=>x.id===id);if(!f||f.papel==='gerente')return false;e.equipe=e.equipe.filter(x=>x.id!==id);e.tarefas.forEach(t=>{if(t.para===id)t.para=null;});S.state.registrar(`${f.nome} deixou a equipe.`,'alerta');S.state.gravar();montar();return true;}
  function fundar(dados){
    const nome=String(dados.nome||'').trim()||'Estúdio Novo';
    const e=S.state.normalizarEstudio({id:uid('e'),nome,ramo:dados.ramo,missao:dados.missao,tom:dados.tom,publico:dados.publico,criadoEm:Date.now(),xp:0,
      projetos:[{id:uid('proj'),nome:'Projeto principal',objetivo:dados.missao||'Construir o primeiro produto do estúdio.',status:'ativo',criadoEm:Date.now(),tarefaIds:[],arquivoIds:[],atividade:[]}],
      equipe:[
        {id:'a0',nome:dados.gerente||'Ana',papel:'gerente',cargo:'Sócia-gerente',especialidade:'geral',cor:S.state.PALETA[0],energia:88,humor:74,personalidade:personalidadeInicial('geral',dados.gerente||'Ana')},
        {id:'a1',nome:pick(NOMES),papel:'func',cargo:'Criação',especialidade:'criacao',cor:S.state.PALETA[1],energia:85,humor:70,personalidade:personalidadeInicial('criacao','')},
        {id:'a2',nome:pick(NOMES),papel:'func',cargo:'Produção',especialidade:'producao',cor:S.state.PALETA[2],energia:85,humor:70,personalidade:personalidadeInicial('producao','')}
      ]});
    S.DB.estudios.unshift(e);S.DB.atual=e.id;S.state.gravarJa();S.state.registrar(`${nome} foi fundada. A equipe vai discutir o primeiro produto.`,'ok');S.bus.emit('trocou');
    setTimeout(()=>{const atual=S.state.atual();if(atual&&atual.id===e.id&&!atual.reuniao?.reunioes?.length&&S.ai.pronta())reuniaoInterna('planejar o primeiro produto e decidir como o site central da empresa deve apresentá-lo',{inicial:true}).catch(err=>console.error('reunião inicial',err));},1600);
    return e;
  }

  /* ============================================================
     MEMÓRIA DE IDEIAS
     Ideias são consequências de decisões reais dos agentes. Não há gerador
     local de ideias nem sequência pré-programada de produtos.
     ============================================================ */
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



  /* O usuário observa; a equipe decide e distribui o trabalho autonomamente. */

  /* ============================================================
     EXECUÇÃO: a decisão pertence ao agente; estas funções só transportam a
     decisão para o mundo persistente. Não existe roteiro de produto aqui.
     ============================================================ */
  function colegaDisponivel(p, id) {
    const e = S.state.atual();
    const f = e && e.equipe.find(x => x.id === id && x.id !== p.id);
    return f ? rtById(f.id) : rt.find(x => x.id !== p.id && x.papel === 'func' && !x.ocupado && x.estado === 'sentado');
  }

  async function materializarDecisaoAgente(p, d) {
    const e = S.state.atual(); if (!e || !p || !d) return false;
    const projeto = e.projetos.find(x => x.id === d.projetoId) || e.projetos.find(x => x.status === 'ativo') || e.projetos[0];
    if (!projeto) return false;

    if (d.acao === 'executar_tarefa' && d.tarefa) {
      const t = e.tarefas.find(x => x.id === d.tarefa && x.status === 'aberta' && dependenciasOK(x));
      if (!t || t._agenteEmExecucao) return false;
      t._agenteEmExecucao = p.id;
      const ok = await executar(p, t);
      delete t._agenteEmExecucao;
      return ok;
    }

    if (d.acao === 'criar_tarefa' || d.acao === 'revisar' || d.acao === 'estudar') {
      const base = d.base ? e.arquivos.find(a => a.id === d.base) : null;
      if ((d.acao === 'revisar' || d.acao === 'estudar') && d.acao === 'revisar' && !base) return false;
      const titulo = String(d.titulo || (base ? `Evoluir ${base.nome}` : `Avançar ${projeto.nome}`)).trim().slice(0,180);
      const briefing = String(d.briefing || d.abordagem || d.motivo || `Executar a próxima contribuição concreta para ${projeto.objetivo}`).trim().slice(0,900);
      const t = novaTarefa({ titulo, kit:'autonomo', briefing, para:p.id, projectId:projeto.id, baseArquivoId:base ? base.id : null, origem:`decisão de ${p.nome}` });
      if (!t) return false;
      S.agency.marcarAcao(p,d);
      return executar(p,t);
    }

    if (d.acao === 'colaborar') {
      const outro = colegaDisponivel(p, d.colega || d.para);
      if (!outro) return false;
      await bateBoca(p, outro, d.motivo || d.abordagem || 'alinhar uma decisão de trabalho');
      return true;
    }

    if (d.acao === 'reuniao') {
      const motivo = d.motivo || d.abordagem || `decidir a próxima etapa de ${projeto.nome}`;
      const r = await reuniaoInterna(motivo, { foco:d.titulo || '', colega:d.colega || d.para || '' });
      return !!r;
    }

    if (d.acao === 'construir') return construirAmbiente(p, d.objeto, d.motivo || d.abordagem);
    if (d.acao === 'reorganizar' && d.objeto) return reorganizarAmbiente(p, d.objeto, d.motivo || d.abordagem);
    return false;
  }

  /* Executa uma tarefa: pensamento visível, seguido imediatamente pela ação de produção. */
  async function executar(p, tarefa) {
    const e = S.state.atual(); if (!e || !p || !tarefa) return false;
    p.ocupado = true; p.tarefa = tarefa.titulo; p.progresso = 0;
    p.ref.foco = tarefa.titulo; p.ref.pensamento = 'Vou examinar o objetivo, a tarefa e o que já existe antes de alterar o acervo.';
    tarefa.status = 'fazendo'; tarefa.para = p.id;
    logPessoa(p, `assumiu “${tarefa.titulo}”. Primeiro vai examinar o trabalho existente e decidir como executá-lo.`, 'trabalho');
    S.state.registrar(`${p.nome} começou a execução de ${tarefa.titulo}.`, 'trabalho', p.id);
    await irPara(p, assento(p)); p.estado = 'trabalhando'; p.balao = 'examinando o trabalho';
    const relogio = setInterval(() => { p.progresso = Math.min(0.96, p.progresso + 0.025); }, 400);
    let sucesso = false;
    try {
      let pensamento = null;
      try {
        pensamento = await S.ai.deliberar({
          sistema: `Você é ${p.nome}, ${p.cargo} do estúdio ${e.nome}. Você está prestes a executar uma tarefa real. Leia o objetivo do projeto, a tarefa, os artefatos relacionados e sua memória. Decida como transformar isso em uma mudança concreta. Não revele raciocínio privado.`,
          pedido: `Projeto: ${tarefa.projectId || 'principal'}\nTarefa: ${tarefa.titulo}\nBriefing: ${tarefa.briefing}\nArtefato base: ${tarefa.baseArquivoId || 'nenhum'}\nArtefatos e memória serão enviados pela produção. Dê somente uma síntese operacional curta que a produção possa executar agora.`,
          tokens: 420, reasoning_effort:'low', agente:p.nome, agenteId:p.id, motivo:'decisão antes da execução'
        });
      } catch (_) {}
      if (pensamento && pensamento.resumo) {
        p.ref.pensamento = pensamento.resumo.slice(0,500); p.balao = pensamento.resumo.slice(0,70);
        logPessoa(p, `decidiu como agir: ${pensamento.resumo}`, 'pensamento');
        lembrar(p, `Decisão de execução: ${pensamento.resumo.slice(0,180)}`);
      }
      p.balao = 'produzindo';
      const saida = await S.factory.produzir({ kit:tarefa.kit || 'autonomo', briefing:tarefa.briefing, deliberacao:p.ref.pensamento, agente:p.ref, projectId:tarefa.projectId, taskId:tarefa.id, baseArquivoId:tarefa.baseArquivoId });
      if (!saida) throw new Error('A IA de produção não entregou uma transformação utilizável.');
      if (saida.excluir && saida.excluir.length) {
        saida.excluir.forEach(id => { const a=e.arquivos.find(x=>x.id===id); if(a && a.classe!=='produto'){ e.arquivos=e.arquivos.filter(x=>x.id!==id); e.projetos.forEach(pr=>pr.arquivoIds=pr.arquivoIds.filter(x=>x!==id)); } });
        tarefa.status='feita'; tarefa.concluidaEm=Date.now(); tarefa.handoff=`${p.nome} removeu um artefato conforme sua decisão: ${saida.resumo || 'não servia ao objetivo'}.`;
        logPessoa(p, `removeu um artefato que julgou inadequado ao objetivo.`, 'entrega'); sucesso=true;
      } else if (saida.arquivos && saida.arquivos.length) {
        const salvos = salvarArquivos(saida.arquivos, { projectId:tarefa.projectId, taskId:tarefa.id, baseArquivoId:tarefa.baseArquivoId || null, briefing:tarefa.briefing, viaIA:true, kit:'autonomo', classe:'candidato', siteCentral:Boolean(saida.siteCentral), sitePath:saida.sitePath||null, clienteVisivel:true, linhagem:(tarefa.baseArquivoId && e.arquivos.find(a=>a.id===tarefa.baseArquivoId)?.linhagem) || null }, p);
        tarefa.contributors = Array.isArray(tarefa.contributors) ? tarefa.contributors : []; if(!tarefa.contributors.includes(p.id)) tarefa.contributors.push(p.id);
        tarefa.status='feita'; tarefa.concluidaEm=Date.now(); tarefa.arquivo=salvos[0] && salvos[0].id; tarefa.handoff=`${p.nome} entregou ${salvos.map(a=>a.nome).join(', ')} para inspeção da gerente.`; tarefa.validacao=saida.validacao || null;
        const proj=e.projetos.find(x=>x.id===tarefa.projectId); if(proj){ salvos.forEach(a=>{if(!proj.arquivoIds.includes(a.id))proj.arquivoIds.unshift(a.id);}); proj.atividade.unshift({t:Date.now(),tipo:'entrega',texto:`${p.nome} entregou ${salvos.map(a=>a.nome).join(', ')}.`}); proj.atividade=proj.atividade.slice(-40); }
        logPessoa(p, `entregou ${salvos.map(a=>a.nome).join(', ')}. A gerente agora pode ler o conteúdo e decidir o próximo passo.`, 'entrega');
        p.ref.pensamento = `Entreguei ${salvos[0].nome}; agora a gerente deve inspecionar o conteúdo e decidir se continua, corrige, descarta ou publica.`;
        lembrar(p, `Entrega: ${salvos[0].nome}; aguardando decisão da gerente.`); sucesso=true;
      } else throw new Error('Nenhuma transformação foi produzida.');
    } catch(err) {
      tarefa.status='aberta'; logPessoa(p, `não conseguiu concluir “${tarefa.titulo}”: ${err.message || err}`, 'erro'); S.state.registrar(`${p.nome} falhou em ${tarefa.titulo}: ${err.message || err}`, 'erro', p.id);
    } finally {
      clearInterval(relogio); p.progresso=1; p.ocupado=false; p.tarefa=null; p.ref.foco=''; p.balao=sucesso?'entregue':'falhou';
      await sleep(900); p.balao=null; p.estado='andando'; await irPara(p,assento(p)); p.estado='sentado';
      S.state.gravar(); S.bus.emit('trabalho'); S.bus.emit('equipe'); S.bus.emit('arquivos');
    }
    return sucesso;
  }

  async function ciclo(meu) {
    if (meu !== token) return;
    const e=S.state.atual(); if(!e) return;
    if (e.reuniao && e.reuniao.reuniaoAtiva) return;
    S.bus.emit('relogio');
    if(S.ai.estado && S.ai.estado.pausado) return;
    if(S.ai.orcamentoIndisponivel && S.ai.orcamentoIndisponivel()) {
      rt.forEach(p=>{ if(!p.ocupado && p.estado!=='dormindo' && p.estado!=='comendo'){ p.estado='dormindo'; p.ref.cuidados=p.ref.cuidados||{}; p.ref.cuidados.rotina='sono'; p.balao='dormindo'; logPessoa(p,'está descansando: o orçamento de IA de 30 dias chegou ao limite.','rotina'); irPara(p,ESTACOES.dormitorio); }});
      S.bus.emit('equipe'); return;
    }
    const g=gerente();

    // A gerente primeiro lê entregas reais. Só depois toma uma nova decisão.
    if(g && !g.ocupado && S.ai.disponivel(g.id)) {
      const pendente=e.arquivos.find(a=>(a.classe==='candidato'||a.classe==='prototipo')&&!a.avaliado);
      if(pendente){ await avaliar(g); return; }
      const ultima=g._agencia&&g._agencia.ultima||0;
      if(Date.now()-ultima>=60000){
        const d=await S.agency.decidir(g,true);
        if(d){ S.agency.marcarAcao(g,d); const fez=await materializarDecisaoAgente(g,d); if(fez)return; }
      }
    }

    const livres=rt.filter(p=>p.papel==='func'&&!p.ocupado&&p.estado!=='pausa'&&Number(p.ref.energia)>20).slice(0,3);
    await Promise.allSettled(livres.map(async p=>{
      const atribuida=tarefasAbertas().find(t=>t.para===p.id&&dependenciasOK(t));
      if(atribuida){ await executar(p,atribuida); return; }
      if(!S.ai.disponivel(p.id)) return;
      const d=await S.agency.decidir(p);
      if(!d) return;
      if (['criar_tarefa','colaborar','reuniao'].includes(d.acao) && (d.motivo || d.titulo)) registrarIdeia({titulo:d.titulo || d.acao, objetivo:e.missao, proposta:d.motivo || d.abordagem, participantes:[{id:p.id,nome:p.nome,fala:d.motivo || d.abordagem || d.acao}], projetoId:d.projetoId || null, status:'observada'});
      S.agency.marcarAcao(p,d);
      await materializarDecisaoAgente(p,d);
    }));
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
    novaTarefa, tarefasAbertas, despacharTarefa, executar, registrarContribuicaoAcervo,
    salvarArquivos, publicar, editarArquivo,
    contratar, demitir, custoContratacao, fundar, construirAmbiente, reorganizarAmbiente, interagirAmbiente, ambienteObjetos, OBJETOS_AMBIENTE, tiposAmbiente,
    selecionado: () => selecionado,
    selecionar(id) { selecionado = id; }
  };
})(window.S);
