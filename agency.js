/* ============================================================
   AGENCY — camada de autonomia organizacional.
   O funcionário não recebe uma sequência de produção. Ele observa o estado
   da empresa, delibera sobre o que seria útil agora e escolhe uma ação.
   Regras locais existem apenas como segurança operacional, nunca como roteiro
   obrigatório de produção.
   ============================================================ */
(function (S) {
  'use strict';

  const DECISAO_MIN_MS = 120000;
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
        `IDENTIDADE/ESTRATÉGIA: slogan=${e.fundacao?.identidade?.slogan||'n/d'} | posicionamento=${e.fundacao?.identidade?.posicionamento||'n/d'} | valores=${e.fundacao?.identidade?.valores||'n/d'} | estado da fundação=${e.fundacao?.estado||'n/d'}`,
        `PLANO DE NEGÓCIO DA GERENTE: ${max(e.fundacao?.planoNegocio||'ainda não consolidado',2200)}`,
        `PLANEJAMENTO DO PRIMEIRO PRODUTO: ${max(e.fundacao?.primeiroProduto||'ainda não consolidado',2200)}`,
        `PROJETO: ${pr ? pr.nome : 'nenhum'} | objetivo: ${pr ? pr.objetivo : e.missao} | status: ${pr ? pr.status : 'sem projeto'}`,
        `ARTEFATOS EXISTENTES: ${arqs.length ? arqs.map(a => `${a.id}:${a.nome}[${a.classe}, kit=${a.kit||'?'}, v${a.versao||1}]`).join('; ') : 'nenhum'}`,
        `TRABALHO ABERTO: ${tarefas.length ? tarefas.map(t => `${t.id}:${t.titulo}[${t.status}, responsável=${t.para||'livre'}, base=${t.baseArquivoId||'nenhuma'}]`).join('; ') : 'nenhum'}`,
        `CAPACIDADE DE PRODUÇÃO: criação e edição de arquivos reais. Formatos possíveis: html, md, txt, csv, json, js, css e outros compatíveis com o trabalho.`,
        `EQUIPE: ${equipeContexto(e)}`,
        `MEMÓRIA DE ${p.nome}: ${memorias.slice(-8).map(m => typeof m === 'string' ? m : (m.texto || '')).filter(Boolean).join(' | ') || 'nenhuma'}`,
        `DECISÕES RECENTES: ${decisoes || 'nenhuma'}`,
        `IDEIAS RECENTES: ${(e.ideias||[]).slice(0,5).map(x => typeof x === 'string' ? x : x.texto || '').filter(Boolean).join(' | ') || 'nenhuma'}`,
        `AMBIENTE: ${((e.ambiente&&e.ambiente.objetos)||[]).slice(-12).map(o => `${o.id}:${o.nome}@${Math.round(o.x)},${Math.round(o.y)} uso=${o.uso||0} por=${o.por||'equipe'}`).join('; ') || 'vazio'} | orçamento=${e.ambiente&&e.ambiente.moedas!=null?e.ambiente.moedas:'indisponível'}`
      ].join('\n'),
      arquivos: arqs,
      tarefas,
      projeto: pr
    };
  }

  function normalizar(c, ctx) {
    const acaoRaw = String(c.acao || '').trim().toLowerCase();
    const permitidas = ['executar_tarefa','criar_tarefa','revisar','estudar','colaborar','reuniao','planejar','construir','reorganizar','esperar'];
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
      objeto: max(c.objeto, 40),
      colega: max(c.colega || c.para, 60),
      especialidade: max(c.especialidade, 40),
      projetoId: ctx.projeto ? ctx.projeto.id : '',
      executivo: !!(ctx && ctx.executivo),
      em: agora()
    };
  }

  async function decidir(p, forcar) {
    const e = S.state.atual();
    if (!e || !p || !p.ref) return null;
    p._agencia = p._agencia || { ultima: 0, ultimaAcao: null };
    if (!forcar && agora() - p._agencia.ultima < DECISAO_MIN_MS) return p._agencia.ultimaAcao;
    if (!S.ai.disponivel(p.id)) return null;

    const ctx = contexto(e, p);
    ctx.executivo = p.papel === 'gerente';
    p._agencia.ultima = agora();
    p.ref.foco = 'observando a empresa e deliberando';
    p.ref.pensamento = 'Estou olhando o objetivo, o trabalho existente e o que já foi construído antes de escolher uma ação.';
    S.bus.emit('equipe');

    const sistema = `Você é ${p.nome}, ${p.cargo}, integrante da empresa ${e.nome}. Você não existe para preencher uma fila nem para manter atividade artificial. Você é um agente responsável por contribuir para uma organização real.

${ctx.texto}

Sua autonomia é limitada pelo propósito da empresa, pela realidade dos dados acima e por suas capacidades. Você pode escolher uma ação diferente a cada ciclo. Não há ordem obrigatória de produção. Não crie uma tarefa só para manter o escritório ocupado. Para a gerente, porém, uma decisão operacional deve sempre terminar em uma ação executável.

Pense profundamente antes de decidir. Compare o valor das alternativas, observe dependências, procure oportunidades de melhorar o que já existe e considere se outra pessoa precisa ser envolvida. O resultado persistido deve ser apenas a decisão operacional, nunca seu raciocínio privado passo a passo.

Ações possíveis: executar_tarefa, criar_tarefa, revisar, estudar, colaborar, reuniao, planejar, construir, reorganizar, esperar.
- executar_tarefa: escolha uma tarefa aberta que realmente combine com você.
- criar_tarefa: crie trabalho concreto que seja consequência do estado atual, preferindo evolução ou integração de algo existente.
- revisar: examine uma entrega ou problema existente; só use se houver algo concreto para revisar.
- estudar: adquira contexto do próprio acervo/objetivo para preparar uma ação futura; não finja que isso é produção.
- colaborar: procure outro membro porque existe uma dependência ou decisão que se beneficia de colaboração; indique COLEGA.
- reuniao: convoque uma reunião quando uma decisão conjunta ou conflito realmente exigir conversa; indique COLEGA se houver alguém específico.
- planejar: só quando houver uma decisão de escopo/ordem que realmente precise ser tomada.
- construir: só quando uma mudança física no ambiente tiver valor para trabalho, bem-estar ou identidade da equipe; escolha um tipo simples de mobiliário.
- reorganizar: só quando mover um objeto existente resolver um problema concreto de fluxo, colaboração ou uso do espaço.
- esperar: quando agir agora teria pouco valor, quando não há base suficiente ou quando outra pessoa precisa agir primeiro.

Se criar_tarefa, descreva exatamente o resultado que deve ser produzido. Não escolha um template de produto: a ferramenta de produção interpretará sua decisão. Prefira evoluir um artefato existente quando isso trouxer valor.
REGRA DE CONTINUIDADE: você é responsável por encontrar uma próxima ação útil. Trabalho aberto, artefato incompleto, decisão pendente, dependência ou oportunidade concreta devem orientar sua escolha. Se a melhor ação for pensar, transforme esse pensamento em conversa, revisão ou trabalho persistente; não use atividade vazia como substituto de contribuição.
REGRA DE CONCRETUDE: revisar exige um artefato real; estudar exige uma lacuna concreta; esperar exige uma dependência real.
REGRA SOCIAL: quando outra pessoa pode melhorar a decisão, converse com ela e registre a conversa; quando uma decisão precisa da autoridade da gerente, convoque reunião.
Não invente clientes, pedidos, métricas, preços, datas, aprovações, resultados ou fatos ausentes.
${p.papel === 'gerente' ? `REGRA EXECUTIVA: você é a autoridade final. Leia os artefatos, acompanhe o trabalho real, decida o que continua, muda, é descartado ou está pronto para release. Quando precisar de opinião, convoque os envolvidos. Quando decidir uma ação, encaminhe-a ao responsável. Seu ciclo deve deixar o projeto em um estado diferente ou claramente justificar uma dependência real.` : ''}

Retorne SOMENTE:
ACAO: <uma das ações>
TAREFA: <id da tarefa existente ou vazio>
COLEGA: <id de colega para conversar/reunião ou vazio>
TITULO: <se criar tarefa, título concreto; senão vazio>
BRIEF: <se criar tarefa, briefing verificável; senão vazio>
BASE: <id do artefato existente que deve ser evoluído/revisado ou vazio>
PARA: <id de colega que deve receber colaboração/handoff ou vazio>
MOTIVO: <por que esta é a melhor ação agora, até 35 palavras>
ABORDAGEM: <como pretende agir, até 45 palavras>
RISCO: <principal risco ou incerteza, até 30 palavras>
OBJETO: <se construir, um de mesa, planta, estante, luminaria, sofa, quadro, bancada; senão vazio>`;

    try {
      const r = await S.ai.chamar({
        sistema,
        pedido: 'Decida agora o próximo passo mais útil para a empresa. Não tente parecer produtivo: seja útil, coerente e capaz de explicar a decisão de forma curta. Retorne SOMENTE os campos solicitados.',
        tipo: 'pensamento', tokens: 420, reasoning_effort: 'low', agente: p.nome, agenteId: p.id,
        motivo: 'deliberação autônoma organizacional'
      });
      const d = normalizar(S.ai.campos(r && r.texto || ''), ctx);
      p._agencia.ultimaAcao = d;
      p.ref.pensamento = `${d.acao}: ${d.motivo || d.abordagem || 'decisão tomada'}`.slice(0, 500);
      p.ref.foco = d.titulo || d.abordagem || d.acao || 'próxima ação';
      p.balao = (d.motivo || d.abordagem || d.acao || '').slice(0, 70);
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
    if (!p || !p.ref || !d) return;
    p._agencia = p._agencia || { ultima: 0, ultimaAcao: null };
    p._agencia.ultimaAcao = d;
    p.ref.foco = d.titulo || d.abordagem || d.acao || 'próxima ação';
    p.ref.pensamento = `${d.acao || 'ação'}: ${d.motivo || d.abordagem || 'decisão registrada'}`.slice(0, 500);
    S.state.gravar();
    S.bus.emit('equipe');
  }

  S.agency = { decidir, contexto, marcarAcao, DECISAO_MIN_MS };
})(window.S);
