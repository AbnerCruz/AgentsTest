from pathlib import Path
p=Path('/mnt/data/v37work/core.js')
s=p.read_text()
s=s.replace("e.ambiente.ultimaConstrucao = Number(e.ambiente.ultimaConstrucao) || 0;", """e.ambiente.ultimaConstrucao = Number(e.ambiente.ultimaConstrucao) || 0;
    e.ambiente.planta = e.ambiente.planta && typeof e.ambiente.planta === 'object' ? e.ambiente.planta : {};
    e.ambiente.planta.versao = Number(e.ambiente.planta.versao) || 1;
    e.ambiente.planta.zonas = Array.isArray(e.ambiente.planta.zonas) ? e.ambiente.planta.zonas : [];
    e.ambiente.planta.eventos = Array.isArray(e.ambiente.planta.eventos) ? e.ambiente.planta.eventos.slice(-80) : [];
    e.ambiente.construtores = Array.isArray(e.ambiente.construtores) ? e.ambiente.construtores.slice(-80) : [];""")
s=s.replace("f.cuidados.pausa = Number.isFinite(f.cuidados.pausa) ? f.cuidados.pausa : 0;", """f.cuidados.pausa = Number.isFinite(f.cuidados.pausa) ? f.cuidados.pausa : 0;
      f.comissaoHistorico = Array.isArray(f.comissaoHistorico) ? f.comissaoHistorico.slice(-60) : [];
      f.ambiente = f.ambiente && typeof f.ambiente === 'object' ? f.ambiente : {};
      f.ambiente.preferencias = Array.isArray(f.ambiente.preferencias) ? f.ambiente.preferencias.slice(0,8) : [];
      f.ambiente.ultimaAcao = Number(f.ambiente.ultimaAcao) || 0;""")
p.write_text(s)

p=Path('/mnt/data/v37work/agency.js'); s=p.read_text()
s=s.replace("const permitidas = ['executar_tarefa','criar_tarefa','revisar','estudar','colaborar','planejar','construir','esperar'];", "const permitidas = ['executar_tarefa','criar_tarefa','revisar','estudar','colaborar','planejar','construir','reorganizar','esperar'];")
s=s.replace("- construir: só quando uma mudança física no ambiente tiver valor para trabalho, bem-estar ou identidade da equipe; escolha um tipo simples de mobiliário.\n- esperar", "- construir: só quando uma mudança física no ambiente tiver valor para trabalho, bem-estar ou identidade da equipe; escolha um tipo simples de mobiliário.\n- reorganizar: só quando mover um objeto existente resolver um problema concreto de fluxo, colaboração ou uso do espaço.\n- esperar")
s=s.replace("OBJETO: <se construir, um de mesa, planta, estante, luminaria, sofa, quadro, bancada; senão vazio>`,", "OBJETO: <se construir, um de mesa, planta, estante, luminaria, sofa, quadro, bancada; se reorganizar, o id do objeto; senão vazio>`,")
p.write_text(s)

p=Path('/mnt/data/v37work/studio.js'); s=p.read_text()
old="""  const OBJETOS_AMBIENTE = {
    mesa: {nome:'Mesa', custo:180, w:54,h:28}, planta:{nome:'Planta',custo:70,w:24,h:34}, estante:{nome:'Estante',custo:260,w:38,h:54},
    luminaria:{nome:'Luminária',custo:110,w:18,h:32}, sofa:{nome:'Sofá',custo:320,w:72,h:30}, quadro:{nome:'Quadro',custo:140,w:62,h:12}, bancada:{nome:'Bancada',custo:240,w:76,h:28}
  };
  function construirAmbiente(p, tipo, motivo) {
    const e=S.state.atual(); if(!e) return false;
    const spec=OBJETOS_AMBIENTE[tipo]||OBJETOS_AMBIENTE.planta;
    e.ambiente=e.ambiente||{moedas:1200,objetos:[]}; e.ambiente.objetos=Array.isArray(e.ambiente.objetos)?e.ambiente.objetos:[];
    if((e.ambiente.moedas||0)<spec.custo) return false;
    if(e.ambiente.objetos.length>=40) return false;
    const cols=5, idx=e.ambiente.objetos.length, col=idx%cols, row=Math.floor(idx/cols);
    const x=72+col*118+(idx%2)*12, y=54+row*74;
    e.ambiente.moedas-=spec.custo;
    e.ambiente.objetos.push({id:uid('obj'),tipo,x,y,custo:spec.custo,por:p?p.id:null,nome:spec.nome,criadoEm:Date.now()});
    e.ambiente.ultimaConstrucao=Date.now();
    if(p){ p.ref.pensamento=`Construí ${spec.nome} para melhorar o ambiente: ${motivo||'uso da equipe'}`.slice(0,240); logPessoa(p,`adicionou ${spec.nome} ao ambiente de trabalho. ${motivo||''}`,'ambiente'); }
    S.state.registrar(`${p?p.nome:'A equipe'} construiu ${spec.nome} no ambiente por ${S.fmt.brl(spec.custo)}.`,'ambiente',p&&p.id);
    S.state.gravar(); S.bus.emit('ambiente'); S.bus.emit('negocio'); S.bus.emit('equipe'); return true;
  }
  function ambienteObjetos(){ const e=S.state.atual(); return e&&e.ambiente&&e.ambiente.objetos||[]; }
"""
new="""  const OBJETOS_AMBIENTE = {
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
"""
if old not in s: raise SystemExit('build block not found')
s=s.replace(old,new)
s=s.replace("} else if (d.acao === 'construir') {\n            construirAmbiente(p, d.objeto, d.motivo || d.abordagem);\n            return;", "} else if (d.acao === 'construir') {\n            await construirAmbiente(p, d.objeto, d.motivo || d.abordagem);\n            return;\n          } else if (d.acao === 'reorganizar') {\n            if (d.objeto) reorganizarAmbiente(p, d.objeto, d.motivo || d.abordagem);\n            else { p.ref.pensamento='Não encontrei um objeto concreto para reorganizar; preservei o ambiente.'; S.state.gravar(); }\n            return;")
# Add environment collision-aware draw and zones, replace initial floor segment
needle="""    cx.fillStyle = '#20272B';
    for (let x = 24; x < larguraLog-20; x += 32) for (let y = 24; y < alturaLog-20; y += 32) cx.fillRect(x, y, 30, 30);
    cx.fillStyle = '#2A3237'; cx.fillRect(18,18,larguraLog-36,5); cx.fillRect(18,18,5,alturaLog-36); cx.fillRect(larguraLog-23,18,5,alturaLog-36);
"""
repl="""    cx.fillStyle = '#20272B';
    for (let x = 24; x < larguraLog-20; x += 32) for (let y = 24; y < alturaLog-20; y += 32) cx.fillRect(x, y, 30, 30);
    // Ilhas de uso: o escritório deixa de ser um fundo decorativo e passa a ter geografia.
    Object.entries(AMB_ZONAS).forEach(([nome,z])=>{
      cx.fillStyle = nome==='convivio' ? '#202B2B' : nome==='bemestar' ? '#202C27' : nome==='planejamento' ? '#29282B' : '#20272B';
      cx.fillRect(z.x,z.y,z.w,z.h); cx.strokeStyle='#30393D'; cx.lineWidth=1; cx.strokeRect(z.x,z.y,z.w,z.h);
      cx.fillStyle='#667075'; cx.font='600 8px monospace'; cx.textAlign='left'; cx.fillText(nome.toUpperCase(),z.x+7,z.y+12);
    });
    cx.fillStyle = '#2A3237'; cx.fillRect(18,18,larguraLog-36,5); cx.fillRect(18,18,5,alturaLog-36); cx.fillRect(larguraLog-23,18,5,alturaLog-36);
"""
s=s.replace(needle,repl)
# stations should be smaller / not overlap bottom zones
s=s.replace("const ESTACOES = {\n    cafe: { x: 90, y: 300, rotulo: 'café' },\n    reuniao: { x: 320, y: 300, rotulo: 'sala de reunião' },\n    quadro: { x: 550, y: 300, rotulo: 'quadro' },\n    descanso: { x: 320, y: 346, rotulo: 'descanso' }\n  };", "const ESTACOES = {\n    cafe: { x: 120, y: 350, rotulo: 'café' },\n    reuniao: { x: 345, y: 276, rotulo: 'reunião' },\n    quadro: { x: 525, y: 276, rotulo: 'quadro' },\n    descanso: { x: 350, y: 350, rotulo: 'descanso' }\n  };")
# exports
s=s.replace("contratar, demitir, custoContratacao, fundar, construirAmbiente, ambienteObjetos, OBJETOS_AMBIENTE, tiposAmbiente,", "contratar, demitir, custoContratacao, fundar, construirAmbiente, reorganizarAmbiente, interagirAmbiente, ambienteObjetos, OBJETOS_AMBIENTE, tiposAmbiente,")
p.write_text(s)
