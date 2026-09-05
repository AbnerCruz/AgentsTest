from pathlib import Path
p=Path('/mnt/data/meeting_work')
# core.js: initialize meetings safely
f=p/'core.js'; s=f.read_text()
s=s.replace("    e.aprovacoes = Array.isArray(e.aprovacoes) ? e.aprovacoes : [];\n    e.decisoes = Array.isArray(e.decisoes) ? e.decisoes : [];", "    e.aprovacoes = Array.isArray(e.aprovacoes) ? e.aprovacoes : [];\n    e.decisoes = Array.isArray(e.decisoes) ? e.decisoes : [];\n    e.reuniao = e.reuniao && typeof e.reuniao === 'object' ? e.reuniao : { mensagens: [], relatorios: [] };\n    e.reuniao.mensagens = Array.isArray(e.reuniao.mensagens) ? e.reuniao.mensagens.slice(-120) : [];\n    e.reuniao.relatorios = Array.isArray(e.reuniao.relatorios) ? e.reuniao.relatorios.slice(-20) : [];")
f.write_text(s)

# studio.js: add meeting functions before contracting section
f=p/'studio.js'; s=f.read_text()
needle="  /* ---------- contratação ---------- */"
insert=r'''  /* ============================================================
     Sala de reuniões — canal persistente entre você e a equipe.
     Uma chamada barata por intervenção; o contexto é rico e a saída curta.
     ============================================================ */
  function contextoReuniao() {
    const e = S.state.atual(); if (!e) return '';
    const projeto = e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    const mensagens = (e.reuniao && e.reuniao.mensagens || []).slice(-14).map(m =>
      `[${m.quem}] ${m.texto}`).join('\n') || 'Nenhuma conversa anterior.';
    const tarefas = e.tarefas.slice(0, 14).map(t => {
      const q = t.para ? (e.equipe.find(x => x.id === t.para) || {}).nome : 'não atribuído';
      return `${t.status.toUpperCase()} | ${t.titulo} | responsável=${q} | handoff=${t.handoff || '—'}`;
    }).join('\n') || 'Nenhuma tarefa.';
    const arquivos = e.arquivos.slice(0, 14).map(a =>
      `${a.nome} | ${a.classe} | v${a.versao || 1} | q${a.qualidade || 0} | autor=${a.autor}`).join('\n') || 'Nenhum artefato.';
    const equipe = e.equipe.map(f =>
      `${f.id} | ${f.nome} | ${f.cargo} | ${f.especialidade} | energia=${Math.round(f.energia || 0)} | foco=${f.foco || 'livre'} | pensamento=${f.pensamento || '—'}`).join('\n');
    return `ESTÚDIO\n${e.nome} | ramo=${e.ramo} | missão=${e.missao} | público=${e.publico}\n\nPROJETO ATIVO\n${projeto ? `${projeto.nome} | objetivo=${projeto.objetivo}` : 'nenhum'}\n\nEQUIPE\n${equipe}\n\nTRABALHO ATUAL\n${tarefas}\n\nARTEFATOS E PRODUTOS PERSISTENTES\n${arquivos}\n\nCONVERSA RECENTE DA SALA\n${mensagens}`.slice(0, 12500);
  }

  function registrarReuniao(quem, texto, tipo) {
    const e = S.state.atual(); if (!e) return;
    e.reuniao = e.reuniao || { mensagens: [], relatorios: [] };
    e.reuniao.mensagens.push({ id: S.util.uid('m'), t: Date.now(), quem: String(quem), texto: String(texto).slice(0, 1200), tipo: tipo || 'fala' });
    if (e.reuniao.mensagens.length > 120) e.reuniao.mensagens.splice(0, e.reuniao.mensagens.length - 120);
    S.state.gravar(); S.bus.emit('reuniao');
  }

  async function reuniaoFalar(texto) {
    const e = S.state.atual();
    const msg = String(texto || '').trim();
    if (!e || !msg) return { ok: false, erro: 'Digite uma mensagem.' };
    registrarReuniao('Você', msg, 'usuario');
    const g = gerente();
    if (!S.ai.pronta()) {
      const local = 'Recebi a orientação. Assim que a IA estiver conectada, a equipe poderá discutir e transformar isso em próximas ações.';
      registrarReuniao(g ? g.nome : 'Equipe', local, 'resposta');
      return { ok: true, local: true };
    }
    const projeto = e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    const ids = e.equipe.map(x => `${x.id}=${x.nome}`).join('; ');
    const r = await S.ai.perguntar({
      sistema: `Você é o coordenador de uma reunião real de uma pequena equipe. Não é um jogo. O usuário é o dono e está falando diretamente com os funcionários. Responda como uma conversa curta, concreta e profissional.\n\n${contextoReuniao()}\n\nFUNCIONÁRIOS: ${ids}\n\nREGRAS: não invente fatos; use o trabalho persistente como verdade; reconheça o que já existe; se o usuário der uma ordem, transforme-a em tarefas executáveis; não crie contratos, clientes ou encomendas; não faça promessas vagas. Produtos finais devem ser realmente consumíveis pelo público.\n\nRETORNE SOMENTE:\nFALA1_QUEM: <id de funcionário ou gerente>\nFALA1: <até 45 palavras>\nFALA2_QUEM: <id ou vazio>\nFALA2: <até 45 palavras>\nFALA3_QUEM: <id ou vazio>\nFALA3: <até 45 palavras>\nORDEM1_KIT: <kit ou vazio>\nORDEM1_PARA: <id ou vazio>\nORDEM1_BRIEF: <até 28 palavras>\nORDEM1_PROJETO: <id do projeto ou vazio>\nORDEM2_KIT: <kit ou vazio>\nORDEM2_PARA: <id ou vazio>\nORDEM2_BRIEF: <até 28 palavras>\nORDEM2_PROJETO: <id do projeto ou vazio>\nRELATORIO: <sim ou não>`,
      pedido: `Mensagem do dono: ${msg}\nProjeto atual: ${projeto ? projeto.nome + ' (' + projeto.id + ')' : 'nenhum'}. Escolha quem realmente precisa responder. Se for apenas uma conversa/feedback, não crie tarefas. Se houver uma ordem clara, crie no máximo duas tarefas e aproveite artefatos existentes.`,
      tokens: 520, agente: 'sala de reuniões', motivo: 'reunião'
    });
    if (!r) {
      registrarReuniao(g ? g.nome : 'Equipe', 'Tive uma falha ao consultar a equipe. A orientação ficou registrada e pode ser retomada.', 'resposta');
      return { ok: false, erro: 'A IA não respondeu.' };
    }
    const campos = r.campos || {};
    const byId = id => e.equipe.find(x => x.id === String(id || '').trim()) || null;
    let falas = 0;
    ['1','2','3'].forEach(n => {
      const pessoa = byId(campos['fala'+n+'_quem']);
      const texto = String(campos['fala'+n] || '').trim();
      if (pessoa && texto) { registrarReuniao(pessoa.nome, texto, 'resposta'); pessoa.pensamento = texto.slice(0, 220); pessoa.memoria = (pessoa.memoria || []).concat({ texto: `Na reunião: ${msg.slice(0,110)} → ${texto.slice(0,120)}`, t: Date.now() }).slice(-12); falas++; }
    });
    let ordens = 0;
    ['1','2'].forEach(n => {
      const kit = S.factory.porId(String(campos['ordem'+n+'_kit'] || '').trim());
      const para = byId(campos['ordem'+n+'_para']);
      const brief = String(campos['ordem'+n+'_brief'] || '').trim();
      const projetoId = String(campos['ordem'+n+'_projeto'] || '').trim() || (projeto && projeto.id);
      if (kit && brief) {
        const t = novaTarefa({ titulo: `${kit.nome}: ${brief}`, kit: kit.id, briefing: brief, para: para ? para.id : null, projectId: projetoId, origem: 'reunião' });
        if (t) { ordens++; registrarReuniao('Sistema', `Ordem registrada: ${t.titulo}${para ? ` → ${para.nome}` : ' → distribuição automática'}.`, 'ordem'); }
      }
    });
    if (campos.relatorio === true) {
      const rel = gerarRelatorioLocal(e);
      e.reuniao.relatorios.unshift({ t: Date.now(), texto: rel });
      e.reuniao.relatorios = e.reuniao.relatorios.slice(0, 20);
      registrarReuniao('Relatório', rel, 'relatorio');
    }
    if (!falas && !ordens) registrarReuniao(g ? g.nome : 'Equipe', 'Entendi. Vamos manter o foco no trabalho que já está em andamento e retomar isso quando houver uma decisão concreta.', 'resposta');
    S.state.gravar(); S.bus.emit('reuniao'); S.bus.emit('equipe'); S.bus.emit('trabalho');
    return { ok: true, falas, ordens };
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

'''
s=s.replace(needle, insert+needle)
# export funcs
s=s.replace("  S.studio = {", "  S.studio = {") if "S.studio = {" in s else s
# find actual export near end
idx=s.rfind("  S.studio = {")
if idx>=0:
    end=s.find("\n  };",idx)
    block=s[idx:end]
    if 'reuniaoFalar' not in block:
        block=block.replace('  S.studio = {','  S.studio = { reuniaoFalar, relatorioReuniao, registrarReuniao, gerarRelatorioLocal,')
        s=s[:idx]+block+s[end:]
    
 f.write_text(s)
