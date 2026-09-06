/* ============================================================
   AGENCY — camada de autonomia organizacional.
   O funcionário não recebe uma sequência de produção. Ele observa o estado
   da empresa, delibera sobre o que seria útil agora e escolhe uma ação.
   Regras locais existem apenas como segurança operacional, nunca como roteiro
   obrigatório de produção.
   ============================================================ */
(function (S) {
  'use strict';

  const DECISAO_MIN_MS = 45000;
  const max = (v, n) => String(v || '').slice(0, n);

  function agora() { return Date.now(); }
  function projetoAtual(e, p) {
    if (!e) return null;
    const pid = p && p.ref && p.ref.projetoId;
    return e.projetos.find(x => x.id === pid && x.status === 'ativo')
      || e.projetos.find(x => x.status === 'ativo') || e.projetos[0] || null;
  }
  function arquivosDoProjeto(e, pr) {
    if (!e || !pr) return [];
    const ids = Array.isArray(pr.arquivoIds) ? pr.arquivoIds : [];
    return ids.map(id => e.arquivos.find(a => a.id === id)).filter(Boolean).slice(0, 12);
  }
  function tarefasDoProjeto(e, pr) {
    if (!e || !pr) return [];
    return e.tarefas.filter(t => t.projectId === pr.id && t.status !== 'feita').slice(0, 12);
  }
  function equipeContexto(e) {
    return (e.equipe || []).map(f => {
      const estado = f.papel === 'gerente' ? 'gerente' : (f.estado || 'disponível');
      return `${f.id}=${f.nome} (${f.cargo}, ${f.especialidade}, ${estado}, energia ${Math.round(Number(f.energia)||0)}, foco: ${max(f.foco,90)})`;
    }).join('; ');
  }
  function contexto(e, p) {
    const pr = projetoAtual(e, p);
    const arqs = arquivosDoProjeto(e, pr);
    const tarefas = tarefasDoProjeto(e, pr);
    const memorias = Array.isArray(p.ref && p.ref.memoria) ? p.ref.memoria : (Array.isArray(p.memoria) ? p.memoria : []);
    const decisoes = (e.decisoes || []).slice(0, 8).map(d => max(d.texto,180)).join(' | ');
    return {
      projeto: pr,
      texto: [
        `EMPRESA: ${e.nome} | ramo: ${e.ramo} | missão: ${e.missao} | público: ${e.publico} | tom: ${e.tom}`,
        `PROJETO: ${pr ? pr.nome : 'nenhum'} | objetivo: ${pr ? pr.objetivo : e.missao} | status: ${pr ? pr.status : 'sem projeto'}`,
        `ARTEFATOS EXISTENTES: ${arqs.length ? arqs.map(a => `${a.id}:${a.nome}[${a.classe}, kit=${a.kit||'?'}, v${a.versao||1}, q${a.qualidade||0}]`).join('; ') : 'nenhum'}`,
        `TRABALHO ABERTO: ${tarefas.length ? tarefas.map(t => `${t.id}:${t.titulo}[${t.status}, responsável=${t.para||'livre'}, base=${t.baseArquivoId||'nenhuma'}]`).join('; ') : 'nenhum'}`,
        `EQUIPE: ${equipeContexto(e)}`,
        `MEMÓRIA DE ${p.nome}: ${memorias.slice(-8).map(m => typeof m === 'string' ? m : (m.texto || '')).filter(Boolean).join(' | ') || 'nenhuma'}`,
        `DECISÕES RECENTES: ${decisoes || 'nenhuma'}`,
        `IDEIAS RECENTES: ${(e.ideias||[]).slice(0,5).map(x => typeof x === 'string' ? x : x.texto || '').filter(Boolean).join(' | ') || 'nenhuma'}`
      ].join('\n'),
      arquivos: arqs,
      tarefas,
      projeto: pr
    };
  }

  function normalizar(c, ctx) {
    const acaoRaw = String(c.acao || '').trim().toLowerCase();
    const permitidas = ['executar_tarefa','criar_tarefa','revisar','estudar','colaborar','planejar','esperar'];
    let acao = permitidas.includes(acaoRaw) ? acaoRaw : 'esperar';
    const kit = String(c.kit || '').trim();
    const taskId = String(c.tarefa || '').trim();
    const para = String(c.para || '').trim();
    return {
      acao, tarefa: taskId, para, kit,
      titulo: max(c.titulo, 180),
      briefing: max(c.brief, 500),
      base: max(c.base, 120),
      motivo: max(c.motivo, 280),
      abordagem: max(c.abordagem, 320),
      risco: max(c.risco, 240),
      projetoId: ctx.projeto ? ctx.projeto.id : '',
      em: agora()
    };
  }

  async function decidir(p, forcar) {
    const e = S.state.atual();
    if (!e || !p || !p.ref) return null;
    p._agencia = p._agencia || { ultima: 0, ultimaAcao: null };
    if (!forcar && agora() - p._agencia.ultima < DECISAO_MIN_MS) return p._agencia.ultimaAcao;
    if (!S.ai.disponivel()) return null;

    const ctx = contexto(e, p);
    p._agencia.ultima = agora();
    p.ref.foco = 'observando a empresa e deliberando';
    p.ref.pensamento = 'Estou olhando o objetivo, o trabalho existente e o que já foi construído antes de escolher uma ação.';
    S.bus.emit('equipe');

    const sistema = `Você é ${p.nome}, ${p.cargo}, integrante da empresa ${e.nome}. Você não existe para preencher uma fila nem para manter atividade artificial. Você é um agente responsável por contribuir para uma organização real.

${ctx.texto}

Sua autonomia é limitada pelo propósito da empresa, pela realidade dos dados acima e por suas capacidades. Você pode escolher uma ação diferente a cada ciclo. Não há ordem obrigatória de produção. Não crie uma tarefa só para manter o escritório ocupado.

Pense profundamente antes de decidir. Compare o valor das alternativas, observe dependências, procure oportunidades de melhorar o que já existe e considere se outra pessoa precisa ser envolvida. O resultado persistido deve ser apenas a decisão operacional, nunca seu raciocínio privado passo a passo.

Ações possíveis: executar_tarefa, criar_tarefa, revisar, estudar, colaborar, planejar, esperar.
- executar_tarefa: escolha uma tarefa aberta que realmente combine com você.
- criar_tarefa: crie trabalho concreto que seja consequência do estado atual, preferindo evolução ou integração de algo existente.
- revisar: examine uma entrega ou problema existente; só use se houver algo concreto para revisar.
- estudar: adquira contexto do próprio acervo/objetivo para preparar uma ação futura; não finja que isso é produção.
- colaborar: procure outro membro porque existe uma dependência ou decisão que se beneficia de colaboração.
- planejar: só quando houver uma decisão de escopo/ordem que realmente precise ser tomada.
- esperar: quando agir agora teria pouco valor, quando não há base suficiente ou quando outra pessoa precisa agir primeiro.

Se criar_tarefa, escolha um kit existente apenas se ele for adequado ao trabalho. O kit é uma ferramenta, não um roteiro. Não invente clientes, pedidos, métricas, preços, datas, aprovações, resultados ou fatos ausentes.

Retorne SOMENTE:
ACAO: <uma das ações>
TAREFA: <id da tarefa existente ou vazio>
KIT: <id do kit existente ou vazio>
TITULO: <se criar tarefa, título concreto; senão vazio>
BRIEF: <se criar tarefa, briefing verificável; senão vazio>
BASE: <id do artefato existente que deve ser evoluído/revisado ou vazio>
PARA: <id de colega que deve receber colaboração/handoff ou vazio>
MOTIVO: <por que esta é a melhor ação agora, até 35 palavras>
ABORDAGEM: <como pretende agir, até 45 palavras>
RISCO: <principal risco ou incerteza, até 30 palavras>`;

    try {
      const r = await S.ai.deliberar({
        sistema,
        pedido: 'Decida agora o próximo passo mais útil para a empresa. Não tente parecer produtivo: seja útil, coerente e capaz de explicar a decisão de forma curta.',
        tokens: 900,
        agente: p.nome,
        motivo: 'deliberação autônoma organizacional'
      });
      const d = normalizar(r.campos || {}, ctx);
      p._agencia.ultimaAcao = d;
      p.ref.pensamento = `${d.acao}: ${d.motivo || d.abordagem || 'decisão tomada'}`.slice(0, 500);
      if (d.motivo) {
        p.memoria = Array.isArray(p.memoria) ? p.memoria : [];
        p.memoria.unshift({ t: agora(), texto: `Autonomia: ${d.acao}. ${d.motivo}` });
        p.memoria = p.memoria.slice(0, 24);
      }
      S.bus.emit('equipe');
      return d;
    } catch (err) {
      p._agencia.ultimaAcao = null;
      p.ref.pensamento = 'Não consegui deliberar agora; vou preservar o contexto e não fabricar trabalho.';
      S.bus.emit('equipe');
      return null;
    }
  }

  function marcarAcao(p, d) {
    if (!p) return;
    p._agencia = p._agencia || {};
    p._agencia.ultimaAcao = d || null;
    p._agencia.ultima = agora();
  }

  S.agency = { decidir, contexto, marcarAcao, DECISAO_MIN_MS };
})(window.S);
