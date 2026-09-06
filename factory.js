/* ============================================================
   FÁBRICA — ferramenta de produção.

   Não existem gabaritos de conteúdo nem uma sequência de produtos aqui.
   O agente decide o que deve nascer ou mudar; esta camada apenas entrega a
   capacidade técnica para transformar essa decisão em um arquivo real.
   ============================================================ */
(function (S) {
  'use strict';
  const { slug } = S.util;

  const FORMATOS = ['html','md','txt','csv','json','js','css','pdf','outro'];
  const KITS = [{
    id:'autonomo', nome:'Produção autônoma', ext:'md', nivel:1, especialidade:'geral',
    desc:'Capacidade aberta de criar, transformar ou excluir arquivos conforme a decisão do agente.',
    vende:'Ferramenta de produção; não determina o que a empresa deve vender.', tokens:2400,
    obrigatorios:[]
  }];
  const LEGADO = {
    obra:{especialidade:'criacao',nome:'Produção autônoma'}, landing:{especialidade:'criacao',nome:'Produção autônoma'},
    artigo:{especialidade:'criacao',nome:'Produção autônoma'}, marca:{especialidade:'criacao',nome:'Produção autônoma'},
    anuncios:{especialidade:'comercial',nome:'Produção autônoma'}, emails:{especialidade:'comercial',nome:'Produção autônoma'},
    catalogo:{especialidade:'dados',nome:'Produção autônoma'}, calendario:{especialidade:'comercial',nome:'Produção autônoma'},
    proposta:{especialidade:'comercial',nome:'Produção autônoma'}
  };
  const porId = id => KITS.find(k => k.id === id) || (LEGADO[id] ? Object.assign({id}, LEGADO[id]) : null);
  const disponiveis = () => KITS.slice();

  const placeholder = /<[^>]{2,}>|lorem ipsum|xxx+|\[\s*(?:preencher|exemplo|aqui)\s*\]|preencher aqui|conteúdo em elaboração/i;
  function validar(kit, campos, arquivos) {
    const lista = Array.isArray(arquivos) ? arquivos : [];
    const problemas = [];
    if (!lista.length) problemas.push('nenhum arquivo foi produzido');
    lista.forEach(a => {
      const nome=String(a.nome||'').trim(), conteudo=String(a.conteudo||'').trim();
      if(nome.length<3) problemas.push('arquivo sem nome utilizável');
      if(conteudo.length<80) problemas.push(`${nome || 'arquivo'} tem conteúdo insuficiente`);
      if(placeholder.test(conteudo)) problemas.push(`${nome || 'arquivo'} contém placeholder`);
    });
    return {
      pronto: problemas.length === 0,
      problemas,
      palavras: lista.reduce((n,a)=>n+String(a.conteudo||'').split(/\s+/).filter(Boolean).length,0)
    };
  }
  const aferir = validar;

  function contextoProjeto(e, projectId) {
    const projeto=(e.projetos||[]).find(p=>p.id===projectId)||(e.projetos||[]).find(p=>p.status==='ativo')||(e.projetos||[])[0];
    if(!projeto) return {id:'',nome:'Projeto principal',objetivo:e.missao,arquivos:[],tarefas:[]};
    const arquivos=(projeto.arquivoIds||[]).map(id=>e.arquivos.find(a=>a.id===id)).filter(Boolean).slice(0,10)
      .map(a=>({id:a.id,nome:a.nome,tipo:a.tipo,classe:a.classe,versao:a.versao,linhagem:a.linhagem,conteudo:String(a.conteudo||'').slice(0,8000)}));
    const tarefas=(projeto.tarefaIds||[]).map(id=>e.tarefas.find(t=>t.id===id)).filter(Boolean).slice(0,12)
      .map(t=>({id:t.id,titulo:t.titulo,status:t.status,briefing:t.briefing,handoff:t.handoff||''}));
    return {id:projeto.id,nome:projeto.nome,objetivo:projeto.objetivo,arquivos,tarefas};
  }

  async function produzir(op) {
    const e=S.state.atual(); const agente=op.agente||null;
    if(!e || !S.ai.disponivel(agente&&agente.id)) return null;
    const projeto=contextoProjeto(e,op.projectId);
    const base=op.baseArquivoId?e.arquivos.find(a=>a.id===op.baseArquivoId):null;
    const arquivos=(projeto.arquivos||[]).map(a=>
      `ID=${a.id} | ${a.nome} | ${a.tipo} | ${a.classe} | v${a.versao||1}\n${a.conteudo}`
    ).join('\n\n')||'Nenhum artefato existente.';
    const tarefas=(projeto.tarefas||[]).map(t=>`${t.status}: ${t.titulo} | ${t.briefing} | ${t.handoff||''}`).join('\n')||'Nenhuma tarefa.';
    const memoria=agente&&Array.isArray(agente.memoria)?agente.memoria.slice(-10).map(m=>typeof m==='string'?m:m.texto).join(' | '):'';
    const sistema=`Você é ${agente?agente.nome:'um funcionário'} do estúdio ${e.nome}. Você está na etapa de EXECUÇÃO, não de planejamento. Sua função agora é transformar uma decisão de trabalho em um resultado concreto no acervo.\n\nEMPRESA: ${e.nome}\nMISSÃO: ${e.missao}\nRAMO: ${e.ramo}\nPÚBLICO: ${e.publico}\nPROJETO: ${projeto.nome}\nOBJETIVO: ${projeto.objetivo}\n\nDECISÃO E BRIEFING:\n${String(op.briefing||'').slice(0,2200)}\n\nPENSAMENTO DO FUNCIONÁRIO:\n${String(op.deliberacao||'').slice(0,1800)}\n\nARTEFATO BASE:\n${base?`ID=${base.id} | ${base.nome} | ${base.tipo} | v${base.versao||1}\n${String(base.conteudo||'').slice(0,14000)}`:'nenhum'}\n\nACERVO DO PROJETO:\n${arquivos.slice(0,28000)}\n\nTAREFAS:\n${tarefas.slice(0,7000)}\n\nMEMÓRIA:\n${memoria||'nenhuma'}\n\nEXECUTE AGORA. Você pode criar um arquivo, atualizar um arquivo existente ou excluir um arquivo que realmente não serve. Se atualizar, devolva o arquivo completo. Não devolva plano, promessa, avaliação ou explicação no lugar do arquivo. Não invente fatos ausentes. Não use placeholders.\n\nFORMATOS ACEITOS: ${FORMATOS.join(', ')}\n\nRETORNE EXATAMENTE:\nACAO: criar | atualizar | excluir\nARQUIVO_ID: <id existente se atualizar/excluir; vazio se criar>\nNOME: <nome completo com extensão>\nTIPO: <formato>\nRESUMO: <uma frase sobre o que mudou>\n---\nCONTEUDO COMPLETO DO ARQUIVO`; 
    try {
      const r=await S.ai.chamar({sistema,pedido:'Execute a decisão agora. O conteúdo depois de --- deve ser o arquivo final completo. Não pare em uma descrição.',tipo:'conteudo',tokens:Math.max(1800,Math.min(3600,Number(op.tokens||2400))),agente:agente&&agente.nome,agenteId:agente&&agente.id,motivo:'execução de decisão'});
      const c=S.ai.campos(r.texto), corpo=S.ai.corpo(r.texto);
      const acao=String(c.acao||'').trim().toLowerCase(), id=String(c.arquivo_id||'').trim();
      if(!['criar','atualizar','excluir'].includes(acao)) throw new Error('A produção não escolheu uma transformação válida.');
      const alvo=e.arquivos.find(a=>a.id===id)||base;
      if(acao==='excluir') {
        if(!alvo) throw new Error('A produção pediu exclusão sem apontar um arquivo existente.');
        return {arquivos:[],excluir:[alvo.id],kit:'autonomo',classe:'candidato',viaIA:true,resumo:String(c.resumo||'').slice(0,400),validacao:{pronto:true,problemas:[]}};
      }
      const nome=String(c.nome||'').trim()||(alvo&&alvo.nome)||`${slug(c.resumo||'entrega')}.md`;
      const tipo=String(c.tipo||'').trim().toLowerCase()||((nome.match(/\.([a-z0-9]+)$/i)||[])[1]||'md');
      if(corpo.trim().length<80) throw new Error('A produção devolveu um arquivo vazio ou insuficiente.');
      if(acao==='atualizar'&&!alvo) throw new Error('A produção pediu atualização sem arquivo base.');
      const arquivo={nome,tipo,conteudo:corpo.trim(),baseArquivoId:alvo?alvo.id:null};
      return {arquivos:[arquivo],kit:'autonomo',classe:'candidato',viaIA:true,linhagem:alvo&&alvo.linhagem||null,validacao:validar(null,c,[arquivo]),campos:c,resumo:String(c.resumo||'').slice(0,400)};
    } catch(err) { console.error('Produção autônoma falhou',err); return null; }
  }

  S.factory={KITS,FORMATOS,porId,disponiveis,produzir,aferir,validar,contextoProjeto};
})(window.S);
