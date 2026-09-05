/* ============================================================
   UI — desenho dos painéis e ligações de evento.
   Cada painel se redesenha sozinho quando o escopo dele muda.
   ============================================================ */
(function (S) {
  'use strict';
  const { $, $$, esc, clamp } = S.util;
  const F = S.fmt;

  let viewAtual = 'estudio';
  let filtroClasse = 'todos';
  let abertos = {};   // arquivos com o corpo expandido

  /* ---------- avisos ---------- */
  function toast(texto, tipo) {
    const t = document.createElement('div');
    t.className = 'toast ' + (tipo || '');
    t.textContent = texto;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(6px)'; }, 3200);
    setTimeout(() => t.remove(), 3600);
  }

  /* ---------- folha inferior ---------- */
  function folha(html, aoAbrir) {
    $('#sheetBody').innerHTML = html;
    $('#sheetBackdrop').hidden = false;
    if (aoAbrir) aoAbrir($('#sheetBody'));
  }
  function fecharFolha() { $('#sheetBackdrop').hidden = true; $('#sheetBody').innerHTML = ''; }

  /* ---------- navegação ---------- */
  function mostrar(view) {
    const e = S.state.atual();
    if (!e) view = 'vazio';
    viewAtual = view;
    $$('.view').forEach(v => v.classList.toggle('is-on', v.id === 'v-' + view));
    $$('.nav-item').forEach(b => b.classList.toggle('is-on', b.dataset.view === view));
    $('#nav').style.visibility = e ? 'visible' : 'hidden';
    if (view === 'estudio') { S.studio.ajustarCanvas(); }
    if (view === 'motor') pintarMotor();
    if (view === 'negocio') pintarNegocio();
    if (view === 'entregas') { pintarKits(); pintarArquivos(); }
    if (view === 'trabalho') pintarTrabalho();
  }

  /* ============================================================
     Topo
     ============================================================ */
  function pintarTopo() {
    const e = S.state.atual();
    $('#brandName').textContent = e ? e.nome : 'Estúdio';
    $('#brandSub').textContent = e
      ? `${e.ramo} · nível ${S.state.nivelDe(e.xp)}`
      : 'nenhum estúdio fundado';
    $('#topClock').hidden = !e;
    pintarPulso();
  }
  function pintarPulso() {
    const st = S.ai.estado;
    const dot = $('#pulseDot'), txt = $('#pulseTxt');
    dot.className = 'pulse-dot ' + ({ off: '', pronta: 'on', ocupada: 'busy', erro: 'err' }[st.situacao] || '');
    txt.textContent = st.pausado ? 'pausado'
      : st.situacao === 'ocupada' ? 'trabalhando'
        : st.situacao === 'erro' ? 'falha'
          : st.situacao === 'pronta' ? 'pronta' : 'sem IA';
    const f = $('#floorStatus');
    if (f) f.textContent = st.pausado ? 'equipe pausada' : st.situacao === 'ocupada' ? 'produzindo' : S.ai.temChave() ? 'em operação' : 'aguardando IA';
  }
  function pintarRelogio() {
    const e = S.state.atual(); if (!e) return;
    const r = S.market.relogio(e);
    $('#clockDay').textContent = 'Dia ' + r.dia;
    $('#clockHour').textContent = r.hora;
  }

  /* ============================================================
     Estúdio
     ============================================================ */
  function barra(classe, v) {
    return `<div class="bar ${classe}"><i style="width:${clamp(v, 0, 100)}%"></i></div>`;
  }
  function pintarEquipe() {
    const e = S.state.atual(); if (!e) return;
    const pessoas = S.studio.pessoas();
    $('#teamList').innerHTML = pessoas.map(p => {
      const f = p.ref || {};
      const estado = p.ocupado ? (p.tarefa || 'trabalhando')
        : p.estado === 'pausa' ? 'em pausa'
          : p.estado === 'andando' ? 'andando pelo estúdio' : 'disponível';
      return `<button class="member" data-pessoa="${p.id}" type="button">
        <span class="avatar" style="background:${esc(p.cor)}">${esc(p.nome.slice(0, 2).toUpperCase())}</span>
        <span class="member-body">
          <span class="member-name">${esc(p.nome)} ${p.ocupado ? '<i class="thinking">trabalhando</i>' : ''}</span>
          <span class="member-role">${esc(p.cargo)}${p.papel === 'gerente' ? ' · decide o que publica' : ''}</span>
          <span class="member-status">${esc(estado)}</span>
        </span>
        <span class="bars">
          ${barra('energia', f.energia)}
          ${barra('humor', f.humor)}
        </span>
      </button>`;
    }).join('') || '<div class="empty">Sem equipe.</div>';
    $$('#teamList [data-pessoa]').forEach(b => b.onclick = () => painelPessoa(b.dataset.pessoa));
  }

  function pintarXP() {
    const e = S.state.atual(); if (!e) return;
    const pr = S.state.progressoNivel(e.xp);
    const kits = S.factory.KITS;
    const liberados = kits.filter(k => k.nivel <= pr.nivel).length;
    const proximo = kits.filter(k => k.nivel === pr.nivel + 1);
    $('#xpPanel').innerHTML = `
      <div class="panel-head"><span class="panel-label">Progresso do estúdio</span><span class="chip">nível ${pr.nivel}</span></div>
      <div class="meter"><i style="width:${pr.pct}%"></i></div>
      <div class="stat"><span>${F.num(e.xp)} XP acumulado</span><b>${pr.falta > 0 ? 'faltam ' + F.num(pr.falta) : 'nível máximo'}</b></div>
      <div class="stat"><span>Tipos de entrega liberados</span><b>${liberados}/${kits.length}</b></div>
      <p class="panel-foot">XP vem de entrega concluída, contrato pago e publicação. ${proximo.length ? 'No próximo nível: ' + proximo.map(k => k.nome).join(', ') + '.' : 'Tudo liberado.'}</p>`;
  }

  function painelPessoa(id) {
    const p = S.studio.pessoa(id); if (!p) return;
    const f = p.ref || {};
    const e = S.state.atual();
    const feitas = e.tarefas.filter(t => t.para === id && t.status === 'feita').length;
    const esp = S.studio.ESPECIALIDADES.find(x => x.id === p.especialidade);
    folha(`
      <h2>${esc(p.nome)}</h2>
      <p class="sub">${esc(p.cargo)} · ${esc(esp ? esp.desc : '')}</p>
      <div class="stats">
        <div class="stat"><span>Energia</span><b>${Math.round(f.energia)}/100</b></div>
        <div class="stat"><span>Humor</span><b>${Math.round(f.humor)}/100</b></div>
        <div class="stat"><span>Entregas assinadas</span><b>${f.entregas || 0}</b></div>
        <div class="stat"><span>Tarefas concluídas</span><b>${feitas}</b></div>
        <div class="stat"><span>Agora</span><b>${esc(p.ocupado ? (p.tarefa || 'trabalhando') : p.estado)}</b></div>
      </div>
      ${(f.memoria || []).length ? `<p class="panel-foot">Últimas anotações: ${esc(f.memoria.slice(-3).join(' · '))}</p>` : ''}
      <div class="sheet-actions">
        ${p.papel === 'gerente' ? '' : `<button class="btn btn-danger" id="demitirBtn" type="button">Dispensar</button>`}
        <button class="btn btn-primary" id="fecharPessoa" type="button">Fechar</button>
      </div>`, box => {
      const d = box.querySelector('#demitirBtn');
      if (d) d.onclick = () => { S.studio.demitir(id); fecharFolha(); toast(p.nome + ' saiu da equipe.'); };
      box.querySelector('#fecharPessoa').onclick = fecharFolha;
    });
  }

  /* ============================================================
     Trabalho
     ============================================================ */
  function pintarTrabalho() { pintarContratos(); pintarBacklog(); pintarLog(); pintarPendencias(); pintarBadges(); }

  function pintarBadges() {
    const e = S.state.atual(); if (!e) return;
    const ofertas = e.contratos.filter(c => c.status === 'oferta').length;
    const candidatos = e.arquivos.filter(a => a.classe === 'candidato').length;
    $('#badgeTrabalho').hidden = ofertas === 0;
    $('#badgeEntregas').hidden = candidatos === 0;
  }

  function pintarContratos() {
    const e = S.state.atual(); if (!e) return;
    const lista = e.contratos.filter(c => c.status === 'oferta' || c.status === 'aceito').slice(0, 6);
    $('#contratosList').innerHTML = lista.length ? lista.map(c => {
      const kit = S.factory.porId(c.kit);
      return `<div class="item">
        <span class="dot-state ${c.status === 'aceito' ? 'fazendo' : ''}"></span>
        <div class="item-body">
          <div class="item-title">${esc(c.cliente)} — ${esc(kit ? kit.nome : c.kit)}</div>
          <div class="item-meta">
            <span class="tag tag-sim">${esc(F.brl(c.valor))} simulado</span>
            <span>${esc(c.briefing).slice(0, 90)}</span>
          </div>
        </div>
        <div class="item-actions">
          ${c.status === 'oferta'
          ? `<button class="btn btn-mini btn-primary" data-aceitar="${c.id}" type="button">Aceitar</button>
               <button class="btn btn-mini" data-recusar="${c.id}" type="button">Passar</button>`
          : '<span class="chip">em produção</span>'}
        </div>
      </div>`;
    }).join('') : '<div class="empty">Nenhum contrato na mesa. Toque em Prospectar para bater na porta de novos clientes.</div>';
    $$('#contratosList [data-aceitar]').forEach(b => b.onclick = () => {
      S.studio.aceitarContrato(b.dataset.aceitar); toast('Contrato aceito. Entrou no plano de trabalho.', 'ok');
    });
    $$('#contratosList [data-recusar]').forEach(b => b.onclick = () => S.studio.recusarContrato(b.dataset.recusar));
  }

  function pintarBacklog() {
    const e = S.state.atual(); if (!e) return;
    const lista = e.tarefas.slice(0, 14);
    const abertas = e.tarefas.filter(t => t.status === 'aberta').length;
    $('#backlogChip').textContent = abertas + (abertas === 1 ? ' aberta' : ' abertas');
    $('#backlogList').innerHTML = lista.length ? lista.map(t => {
      const quem = t.para ? (S.studio.pessoa(t.para) || {}).nome : null;
      return `<div class="item">
        <span class="dot-state ${esc(t.status)}"></span>
        <div class="item-body">
          <div class="item-title">${esc(t.titulo)}</div>
          <div class="item-meta">
            <span>${esc(t.status)}</span>
            ${quem ? `<span>· ${esc(quem)}</span>` : '<span>· sem responsável</span>'}
            ${t.qualidade ? `<span>· qualidade ${t.qualidade}</span>` : ''}
            ${t.origem === 'contrato' ? '<span class="tag">contrato</span>' : ''}
          </div>
        </div>
        ${t.status === 'aberta' ? `<div class="item-actions"><button class="btn btn-mini" data-agora="${t.id}" type="button">Fazer agora</button></div>` : ''}
      </div>`;
    }).join('') : '<div class="empty">O plano está vazio. Dê uma ordem, aceite um contrato ou espere a gerente montar o próximo passo.</div>';
    $$('#backlogList [data-agora]').forEach(b => b.onclick = async () => {
      const t = e.tarefas.find(x => x.id === b.dataset.agora); if (!t) return;
      b.disabled = true; b.textContent = 'produzindo…';
      const p = S.studio.pessoas().find(x => x.papel === 'func' && !x.ocupado) || S.studio.gerente();
      if (!p) return;
      await S.studio.executar(p, t);
      toast(t.status === 'feita' ? 'Entrega pronta na aba Entregas.' : 'A tentativa falhou.', t.status === 'feita' ? 'ok' : 'erro');
    });
  }

  function pintarPendencias() {
    const e = S.state.atual(); if (!e) return;
    const cands = e.arquivos.filter(a => a.classe === 'candidato').slice(0, 4);
    const painel = $('#aprovacoesPanel');
    painel.hidden = cands.length === 0;
    if (!cands.length) return;
    painel.innerHTML = `<div class="panel-head"><span class="panel-label">Aguardando sua decisão</span><span class="chip">${cands.length}</span></div>
      ${cands.map(a => `<div class="item">
        <span class="dot-state feita"></span>
        <div class="item-body">
          <div class="item-title">${esc(a.nome)}</div>
          <div class="item-meta"><span>qualidade ${a.qualidade}</span><span>· por ${esc(a.autor)}</span></div>
        </div>
        <div class="item-actions"><button class="btn btn-mini btn-primary" data-pub="${a.id}" type="button">Publicar</button></div>
      </div>`).join('')}
      <p class="panel-foot">Publicar congela a versão e coloca o material no mercado — é o que faz o funil começar a girar.</p>`;
    $$('#aprovacoesPanel [data-pub]').forEach(b => b.onclick = () => {
      const p = S.studio.publicar(b.dataset.pub, 'você', 'publicação direta');
      if (p) toast('Publicado: ' + p.nome, 'ok');
    });
  }

  function pintarLog() {
    const e = S.state.atual(); if (!e) return;
    const linhas = e.log.slice(-40).reverse();
    $('#logList').innerHTML = linhas.length ? linhas.map(l =>
      `<div class="log-line ${esc(l.tag)}"><span class="log-ts">${F.hora(l.t)}</span><span class="log-txt">${esc(l.texto)}</span></div>`
    ).join('') : '<div class="empty">Nada registrado ainda.</div>';
  }

  /* ============================================================
     Entregas
     ============================================================ */
  function pintarKits() {
    const e = S.state.atual(); if (!e) return;
    const nivel = S.state.nivelDe(e.xp);
    $('#kitsList').innerHTML = S.factory.KITS.map(k => {
      const travado = k.nivel > nivel;
      return `<button class="kit" data-kit="${k.id}" type="button" ${travado ? 'disabled' : ''}>
        <span class="kit-top"><span class="kit-ext">.${k.ext}</span>${travado ? `<span class="tag">nível ${k.nivel}</span>` : ''}</span>
        <span class="kit-nome">${esc(k.nome)}</span>
        <span class="kit-desc">${esc(k.desc)}</span>
      </button>`;
    }).join('');
    $$('#kitsList [data-kit]').forEach(b => b.onclick = () => painelEncomenda(b.dataset.kit));
  }

  function painelEncomenda(kitId) {
    const kit = S.factory.porId(kitId); if (!kit) return;
    const e = S.state.atual();
    folha(`
      <h2>${esc(kit.nome)}</h2>
      <p class="sub">${esc(kit.vende)}</p>
      <div class="field">
        <label for="briefInput">O que essa entrega precisa cobrir</label>
        <textarea id="briefInput" placeholder="ex: destacar a coleção de inverno para clientes que já compraram"></textarea>
        <p class="hint">Gera ${kit.multiplo ? 'vários arquivos' : 'um arquivo .' + kit.ext} de verdade. Custa uma chamada de IA (~${kit.tokens} tokens de saída).</p>
      </div>
      <div class="sheet-actions">
        <button class="btn" id="cancelEnc" type="button">Cancelar</button>
        <button class="btn btn-primary" id="okEnc" type="button">Produzir agora</button>
      </div>`, box => {
      box.querySelector('#cancelEnc').onclick = fecharFolha;
      box.querySelector('#okEnc').onclick = async ev => {
        const brief = box.querySelector('#briefInput').value.trim() || `${kit.nome} para ${e.ramo}`;
        ev.target.disabled = true; ev.target.textContent = 'produzindo…';
        fecharFolha();
        toast('Produzindo ' + kit.nome + '…');
        const t = await S.studio.encomendar(kit.id, brief);
        toast(t && t.status === 'feita' ? 'Arquivo pronto.' : 'Não deu certo dessa vez.', t && t.status === 'feita' ? 'ok' : 'erro');
        mostrar('entregas');
      };
    });
  }

  const ROTULO_CLASSE = { esboco: 'esboço', prototipo: 'protótipo', candidato: 'candidato', produto: 'produto final' };
  const EXPLICA_CLASSE = {
    todos: 'A ordem é rígida: esboço → protótipo → candidato → produto final. Só o que vira produto final entra no mercado da simulação.',
    esboco: 'Material incompleto ou feito sem IA. Serve de base, não de entrega.',
    prototipo: 'Primeira versão utilizável. Ainda vale revisar antes de mandar para alguém.',
    candidato: 'Passou na checagem estrutural e está esperando sua publicação.',
    produto: 'Versão congelada. Não é reescrita: correção vira uma versão nova.'
  };

  function pintarArquivos() {
    const e = S.state.atual(); if (!e) return;
    const todos = e.arquivos;
    const lista = filtroClasse === 'todos' ? todos : todos.filter(a => a.classe === filtroClasse);
    $('#pipelineNota').textContent = EXPLICA_CLASSE[filtroClasse];
    $('#filesList').innerHTML = lista.length ? lista.slice(0, 40).map(a => {
      const aberto = abertos[a.id];
      const previa = aberto === 'previa' && (a.tipo === 'html' || a.tipo === 'svg');
      return `<div class="file">
        <div class="file-head">
          <div class="file-info">
            <div class="file-name">${esc(a.nome)}</div>
            <div class="file-meta">
              <span class="tag ${a.classe === 'produto' ? 'tag-ember' : ''}">${esc(ROTULO_CLASSE[a.classe])}${a.classe === 'produto' ? ' v' + a.versao : ''}</span>
              <span class="quality">q${a.qualidade}<span class="quality-bar"><i style="width:${a.qualidade}%"></i></span></span>
              <span>${esc(a.autor)}</span><span>${esc(a.quando || '')}</span>
              <span>${F.compact(a.conteudo.length)} car.</span>
              ${a.viaIA === false ? '<span class="tag">gabarito local</span>' : ''}
            </div>
          </div>
        </div>
        <div class="file-tools">
          ${(a.tipo === 'html' || a.tipo === 'svg') ? `<button class="btn btn-mini" data-previa="${a.id}" type="button">${previa ? 'Fechar prévia' : 'Ver prévia'}</button>` : ''}
          <button class="btn btn-mini" data-codigo="${a.id}" type="button">${aberto === 'codigo' ? 'Fechar' : 'Ver conteúdo'}</button>
          <button class="btn btn-mini btn-primary" data-baixar="${a.id}" type="button">Baixar</button>
          ${a.classe !== 'produto' ? `<button class="btn btn-mini" data-publicar="${a.id}" type="button">Publicar</button>` : ''}
          ${a.classe !== 'produto' ? `<button class="btn btn-mini btn-danger" data-apagar="${a.id}" type="button">Apagar</button>` : ''}
        </div>
        ${previa ? `<iframe class="file-frame" sandbox="allow-same-origin" srcdoc="${esc(a.conteudo)}"></iframe>` : ''}
        ${aberto === 'codigo' ? `<div class="file-view">${esc(a.conteudo.slice(0, 9000))}</div>` : ''}
      </div>`;
    }).join('') : `<div class="empty">Nenhum arquivo ${filtroClasse === 'todos' ? '' : 'nesse estágio '}ainda. Encomende uma entrega acima ou aceite um contrato.</div>`;

    $$('#filesList [data-previa]').forEach(b => b.onclick = () => {
      abertos[b.dataset.previa] = abertos[b.dataset.previa] === 'previa' ? null : 'previa'; pintarArquivos();
    });
    $$('#filesList [data-codigo]').forEach(b => b.onclick = () => {
      abertos[b.dataset.codigo] = abertos[b.dataset.codigo] === 'codigo' ? null : 'codigo'; pintarArquivos();
    });
    $$('#filesList [data-baixar]').forEach(b => b.onclick = () => {
      const a = e.arquivos.find(x => x.id === b.dataset.baixar); if (!a) return;
      const mime = { html: 'text/html', svg: 'image/svg+xml', md: 'text/markdown', csv: 'text/csv', css: 'text/css', json: 'application/json' }[a.tipo] || 'text/plain';
      S.arquivo.baixarBlob(new Blob([a.conteudo], { type: mime + ';charset=utf-8' }), a.nome);
    });
    $$('#filesList [data-publicar]').forEach(b => b.onclick = () => {
      const p = S.studio.publicar(b.dataset.publicar, 'você', 'publicação direta');
      if (p) toast('Publicado: ' + p.nome, 'ok');
    });
    $$('#filesList [data-apagar]').forEach(b => b.onclick = () => {
      e.arquivos = e.arquivos.filter(x => x.id !== b.dataset.apagar);
      S.state.gravar(); pintarArquivos();
    });
    pintarBadges();
  }

  function exportarZip() {
    const e = S.state.atual(); if (!e || !e.arquivos.length) return toast('Nada para exportar ainda.');
    const pasta = S.util.slug(e.nome);
    const arquivos = e.arquivos.map(a => ({
      nome: `${pasta}/${a.classe}/${a.nome}`, conteudo: a.conteudo
    }));
    arquivos.push({
      nome: `${pasta}/LEIA-ME.md`,
      conteudo: `# ${e.nome}\n\n${e.missao}\n\nRamo: ${e.ramo}\nPúblico: ${e.publico}\nExportado em ${new Date().toLocaleString('pt-BR')}\n\n## Arquivos\n\n` +
        e.arquivos.map(a => `- \`${a.classe}/${a.nome}\` — qualidade aferida ${a.qualidade}/100, por ${a.autor}`).join('\n') +
        `\n\nOs arquivos deste pacote são reais e podem ser usados, editados e vendidos livremente. Os números de vendas, caixa e reputação vistos no aplicativo são simulação.\n`
    });
    S.arquivo.baixarBlob(S.arquivo.zip(arquivos), pasta + '.zip');
    toast(`${arquivos.length} arquivos exportados.`, 'ok');
  }

  /* ============================================================
     Negócio
     ============================================================ */
  function sparkline(pontos, chave) {
    if (!pontos || pontos.length < 2) return '<p class="hint">O gráfico aparece depois de alguns minutos de operação.</p>';
    const vs = pontos.map(p => p[chave]);
    const min = Math.min.apply(null, vs), max = Math.max.apply(null, vs);
    const amp = (max - min) || 1;
    const L = 300, A = 54;
    const d = vs.map((v, i) => {
      const x = (i / (vs.length - 1)) * L;
      const y = A - 4 - ((v - min) / amp) * (A - 10);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    const sobe = vs[vs.length - 1] >= vs[0];
    const cor = sobe ? '#6FA98A' : '#C9553F';
    return `<svg class="spark" viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${d} L${L} ${A} L0 ${A} Z" fill="${cor}" opacity=".10"/>
      <path d="${d}" fill="none" stroke="${cor}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  function pintarNegocio() {
    const e = S.state.atual(); if (!e) return;
    S.market.tick(e);
    const i = S.market.indicadores(e); if (!i) return;

    $('#kpiGrid').innerHTML = [
      { v: F.brl(i.caixa), l: 'caixa', d: i.lucroOperacional >= 0 ? 'operação positiva' : 'queimando caixa', up: i.lucroOperacional >= 0 },
      { v: F.brl(i.receita), l: 'receita total', d: `${F.brl(i.receitaContratos)} de contratos`, up: true },
      { v: F.num(i.clientes), l: 'clientes', d: `${F.num(i.leads)} leads no funil`, up: true },
      { v: F.pct(i.convTotal, 2), l: 'visita → pedido', d: `${F.num(i.visitas)} visitas`, up: i.convTotal > 0 }
    ].map(k => `<div class="kpi">
      <div class="kpi-v">${k.v}</div>
      <div class="kpi-l">${k.l}</div>
      <div class="kpi-d ${k.up ? 'up' : 'down'}">${esc(k.d)}</div>
    </div>`).join('');

    $('#caixaPanel').innerHTML = `
      <div class="panel-head"><span class="panel-label">Caixa ao longo do tempo</span><span class="tag tag-sim">SIMULADO</span></div>
      ${sparkline(i.historico, 'caixa')}
      <div class="stats">
        <div class="stat"><span>Runway</span><b>${Number.isFinite(i.runway) ? i.runway.toFixed(1) + ' meses' : '∞'}</b></div>
        <div class="stat"><span>Queima mensal estimada</span><b>${F.brl(i.burnMes)}</b></div>
        <div class="stat"><span>Folha por hora de expediente</span><b>${F.brl(i.folhaHora)}</b></div>
      </div>`;

    const p = i.presenca;
    const kitsPublicados = p.kits.map(k => (S.factory.porId(k) || { nome: k }).nome);
    $('#funilPanel').innerHTML = `
      <div class="panel-head"><span class="panel-label">Funil e presença</span></div>
      <div class="stats">
        <div class="stat"><span>Visitas</span><b>${F.num(i.visitas)}</b></div>
        <div class="stat"><span>Leads</span><b>${F.num(i.leads)} · ${F.pct(i.convVisitaLead, 2)}</b></div>
        <div class="stat"><span>Pedidos</span><b>${F.num(i.pedidos)} · ${F.pct(i.convLeadPedido, 2)}</b></div>
        <div class="stat"><span>Ticket médio</span><b>${F.brl(i.ticket)}</b></div>
        <div class="stat"><span>Reputação</span><b>${Math.round(i.reputacao)}/100</b></div>
        <div class="stat"><span>Qualidade média publicada</span><b>${Math.round(i.qualidade)}/100</b></div>
      </div>
      <p class="panel-foot">${p.oferta
        ? `O funil gira porque existem ${p.itens} produto(s) publicado(s): ${esc(kitsPublicados.join(', '))}. Cada tipo mexe num fator diferente — anúncio traz gente, catálogo e e-mail convertem, marca sustenta reputação.`
        : 'Nada foi publicado ainda, então não há visitas nem vendas. Publique um material na aba Entregas para o mercado começar a existir.'}</p>`;

    $('#drePanel').innerHTML = `
      <div class="panel-head"><span class="panel-label">Resultado</span></div>
      <div class="stats">
        <div class="stat"><span>Receita de mercado</span><b>${F.brl(i.receitaMercado)}</b></div>
        <div class="stat"><span>Receita de contratos</span><b>${F.brl(i.receitaContratos)}</b></div>
        <div class="stat"><span>Custo direto</span><b>−${F.brl(i.custoDireto)}</b></div>
        <div class="stat"><span>Lucro bruto</span><b>${F.brl(i.lucroBruto)} · ${F.pct(i.margemBruta)}</b></div>
        <div class="stat"><span>Despesas operacionais</span><b>−${F.brl(i.opex)}</b></div>
        <div class="stat"><span>Lucro operacional</span><b>${F.brl(i.lucroOperacional)} · ${F.pct(i.margemOperacional)}</b></div>
      </div>
      <p class="panel-foot">Nenhum destes números é sorteado nem inventado pela IA. Eles saem do tempo de operação, do que está publicado, da qualidade aferida e do custo da equipe. O relógio anda 1 hora a cada minuto real.</p>`;

    const decisoes = (e.decisoes || []).slice(0, 6);
    $('#decisoesPanel').innerHTML = `
      <div class="panel-head"><span class="panel-label">Decisões da gerência</span></div>
      ${decisoes.length ? decisoes.map(d => `<div class="item">
        <span class="dot-state ${d.tipo === 'publicação' ? 'feita' : ''}"></span>
        <div class="item-body"><div class="item-title">${esc(d.tipo)} — ${esc(d.quem)}</div>
        <div class="item-meta"><span>${esc(d.texto)}</span></div></div>
      </div>`).join('') : '<div class="empty">A gerente ainda não tomou decisões registradas.</div>'}`;
  }

  /* ============================================================
     Motor
     ============================================================ */
  function pintarMotor() {
    const e = S.state.atual();
    const st = S.ai.estado;
    $('#conexaoChip').textContent = st.pausado ? 'pausada' : S.ai.temChave() ? st.situacao : 'desligada';
    $('#pausarBtn').textContent = st.pausado ? 'Religar equipe' : 'Pausar equipe';
    if (!$('#apiKeyInput').value && S.ai.temChave()) $('#apiKeyInput').placeholder = S.ai.chaveMascarada();
    $('#conexaoMsg').textContent = st.detalhe || '';

    const opcoes = sel => S.ai.MODELOS.map(m =>
      `<option value="${m.id}" ${S.ai.cfg[sel] === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('');
    $('#modeloDecisaoSel').innerHTML = opcoes('decisao');
    $('#modeloProducaoSel').innerHTML = opcoes('producao');
    $('#ritmoSel').value = S.ai.cfg.ritmo;

    const o = S.ai.orcamento();
    const h = o.headers;
    const espera = S.ai.faltaParaAutonomia();
    $('#consumoPanel').innerHTML = `
      <div class="panel-head"><span class="panel-label">Consumo de hoje</span><span class="tag tag-real">REAL</span></div>
      <div class="meter ${o.pctTokens > 85 ? 'bad' : o.pctTokens > 60 ? 'warn' : 'ok'}"><i style="width:${o.pctTokens}%"></i></div>
      <div class="stats">
        <div class="stat"><span>Tokens usados (soma exata das respostas)</span><b>${F.num(o.tokens)}</b></div>
        <div class="stat"><span>Chamadas feitas</span><b>${F.num(o.requisicoes)}</b></div>
        <div class="stat"><span>Entrada / saída</span><b>${F.compact(o.entrada)} / ${F.compact(o.saida)}</b></div>
        ${h && h.restaReq != null ? `<div class="stat"><span>Requisições restantes na Groq</span><b>${F.num(h.restaReq)}${h.limiteReq ? ' / ' + F.num(h.limiteReq) : ''}</b></div>` : ''}
        ${h && h.restaTok != null ? `<div class="stat"><span>Tokens restantes na janela (Groq)</span><b>${F.num(h.restaTok)}${h.limiteTok ? ' / ' + F.num(h.limiteTok) : ''}</b></div>` : ''}
        <div class="stat"><span>Próxima ação autônoma</span><b>${espera > 0 ? 'em ' + F.dur(espera) : 'liberada'}</b></div>
        ${e ? `<div class="stat"><span>Consumo deste estúdio</span><b>${F.compact(e.uso.tokens)} tokens · ${F.num(e.uso.chamadas)} chamadas</b></div>` : ''}
      </div>
      <p class="panel-foot">${o.fonte === 'groq'
        ? 'A barra e os números acima vêm direto dos cabeçalhos que a Groq devolve na última resposta — sem cálculo por fora.'
        : 'Ainda sem resposta da Groq nesta sessão: a barra usa um teto local só de referência até a primeira chamada trazer os números reais.'}</p>`;

    $('#callsList').innerHTML = st.chamadas.length ? st.chamadas.map(c => `
      <div class="call">
        <div class="call-head"><b>${esc(c.quem)}</b><span>${esc(c.motivo)}</span>
          <span class="tag ${c.ok ? 'tag-real' : 'tag-rust'}">${c.ok ? 'ok' : 'falhou'}</span></div>
        <div class="call-meta">${esc(c.modelo)} · ${F.dur(c.ms)}${c.tokens ? ' · ' + F.num(c.tokens) + ' tokens' : ''} · ${F.hora(c.em)}</div>
        ${c.erro ? `<div class="call-meta" style="color:#E08573">${esc(c.erro).slice(0, 160)}</div>` : ''}
      </div>`).join('') : '<div class="empty">Nenhuma chamada ainda nesta sessão.</div>';

    if (e) {
      $('#empresaCfgPanel').innerHTML = `
        <div class="panel-head"><span class="panel-label">Dados do estúdio</span></div>
        <div class="field"><label for="cfgNome">Nome</label><input id="cfgNome" type="text" value="${esc(e.nome)}"></div>
        <div class="field"><label for="cfgRamo">Ramo</label><input id="cfgRamo" type="text" value="${esc(e.ramo)}"></div>
        <div class="field"><label for="cfgPublico">Público</label><input id="cfgPublico" type="text" value="${esc(e.publico)}"></div>
        <div class="field"><label for="cfgMissao">Missão</label><input id="cfgMissao" type="text" value="${esc(e.missao)}"></div>
        <div class="field"><label for="cfgTom">Tom da marca</label><input id="cfgTom" type="text" value="${esc(e.tom)}"></div>
        <div class="row-actions"><button class="btn btn-primary" id="salvarCfgBtn" type="button">Salvar</button></div>
        <p class="hint">Esses campos entram em toda instrução mandada para a IA. Quanto mais específicos, melhor a entrega — e sem custo extra de token.</p>`;
      $('#salvarCfgBtn').onclick = () => {
        e.nome = $('#cfgNome').value.trim() || e.nome;
        e.ramo = $('#cfgRamo').value.trim() || e.ramo;
        e.publico = $('#cfgPublico').value.trim() || e.publico;
        e.missao = $('#cfgMissao').value.trim() || e.missao;
        e.tom = $('#cfgTom').value.trim() || e.tom;
        S.state.gravarJa(); pintarTopo(); toast('Dados atualizados.', 'ok');
      };
    } else {
      $('#empresaCfgPanel').innerHTML = '<div class="empty">Nenhum estúdio selecionado.</div>';
    }
  }

  /* ============================================================
     Diálogos
     ============================================================ */
  function dialogoFundar() {
    folha(`
      <h2>Fundar estúdio</h2>
      <p class="sub">A fundação é imediata e não gasta nenhuma chamada de IA. Você pode ajustar tudo depois no Motor.</p>
      <div class="field"><label for="fNome">Nome do estúdio</label><input id="fNome" type="text" placeholder="ex: Ateliê Rebimboca"></div>
      <div class="field"><label for="fRamo">Ramo</label><input id="fRamo" type="text" placeholder="ex: loja de roupas vintage online"></div>
      <div class="field"><label for="fPublico">Público</label><input id="fPublico" type="text" placeholder="ex: mulheres de 25 a 40 que gostam de garimpo"></div>
      <div class="field"><label for="fMissao">Missão em uma frase</label><input id="fMissao" type="text" placeholder="ex: achar peças únicas e entregar com capricho"></div>
      <div class="sheet-actions">
        <button class="btn" id="cancelFundar" type="button">Cancelar</button>
        <button class="btn btn-primary" id="okFundar" type="button">Fundar</button>
      </div>`, box => {
      box.querySelector('#cancelFundar').onclick = fecharFolha;
      box.querySelector('#okFundar').onclick = () => {
        const ramo = box.querySelector('#fRamo').value.trim() || 'serviços criativos';
        const nome = box.querySelector('#fNome').value.trim()
          || 'Estúdio ' + ramo.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
        S.studio.fundar({
          nome, ramo,
          publico: box.querySelector('#fPublico').value.trim() || 'pequenos negócios',
          missao: box.querySelector('#fMissao').value.trim() || `Entregar ${ramo} com capricho e prazo curto.`,
          tom: 'direto e caloroso'
        });
        fecharFolha();
        mostrar('estudio');
        toast('Estúdio fundado. Três contratos já estão na mesa.', 'ok');
      };
    });
  }

  function dialogoContratar() {
    const e = S.state.atual(); if (!e) return;
    const custo = S.studio.custoContratacao(e);
    folha(`
      <h2>Contratar</h2>
      <p class="sub">Custa ${F.brl(custo)} do caixa e aumenta a folha por hora. A especialidade dá bônus de qualidade nas entregas do tipo certo.</p>
      <div class="field"><label for="cNome">Nome</label><input id="cNome" type="text" placeholder="deixe vazio para sortear"></div>
      <div id="listaEsp">
        ${S.studio.ESPECIALIDADES.map((x, i) => `<button class="pick ${i === 0 ? 'is-on' : ''}" data-esp="${x.id}" type="button">
          <span><b>${esc(x.cargo)}</b><small>${esc(x.desc)}</small></span>
        </button>`).join('')}
      </div>
      <div class="sheet-actions">
        <button class="btn" id="cancelCont" type="button">Cancelar</button>
        <button class="btn btn-primary" id="okCont" type="button">Contratar</button>
      </div>`, box => {
      let esp = S.studio.ESPECIALIDADES[0].id;
      box.querySelectorAll('[data-esp]').forEach(b => b.onclick = () => {
        esp = b.dataset.esp;
        box.querySelectorAll('.pick').forEach(x => x.classList.toggle('is-on', x === b));
      });
      box.querySelector('#cancelCont').onclick = fecharFolha;
      box.querySelector('#okCont').onclick = () => {
        const r = S.studio.contratar(box.querySelector('#cNome').value.trim(), esp);
        fecharFolha();
        toast(r === 'sem-caixa' ? 'Caixa insuficiente para contratar agora.' : 'Contratação feita.', r === 'sem-caixa' ? 'erro' : 'ok');
      };
    });
  }

  function dialogoEstudios() {
    const lista = S.DB.estudios;
    folha(`
      <h2>Seus estúdios</h2>
      <p class="sub">Cada estúdio tem caixa, equipe e arquivos próprios.</p>
      ${lista.map(e => `<button class="pick ${e.id === S.DB.atual ? 'is-on' : ''}" data-est="${e.id}" type="button">
        <span><b>${esc(e.nome)}</b><small>${esc(e.ramo)} · nível ${S.state.nivelDe(e.xp)} · ${e.arquivos.length} arquivos</small></span>
        ${e.id === S.DB.atual ? '<span class="tag tag-ember">atual</span>' : ''}
      </button>`).join('') || '<div class="empty">Nenhum estúdio ainda.</div>'}
      <div class="sheet-actions">
        <button class="btn" id="fecharEst" type="button">Fechar</button>
        <button class="btn btn-primary" id="novoEst" type="button">Novo estúdio</button>
      </div>`, box => {
      box.querySelectorAll('[data-est]').forEach(b => b.onclick = () => {
        S.state.trocar(b.dataset.est); fecharFolha();
      });
      box.querySelector('#fecharEst').onclick = fecharFolha;
      box.querySelector('#novoEst').onclick = () => { fecharFolha(); dialogoFundar(); };
    });
  }

  function confirmar(titulo, texto, aoConfirmar) {
    folha(`
      <h2>${esc(titulo)}</h2>
      <p class="sub">${esc(texto)}</p>
      <div class="sheet-actions">
        <button class="btn" id="naoBtn" type="button">Cancelar</button>
        <button class="btn btn-danger" id="simBtn" type="button">Confirmar</button>
      </div>`, box => {
      box.querySelector('#naoBtn').onclick = fecharFolha;
      box.querySelector('#simBtn').onclick = () => { fecharFolha(); aoConfirmar(); };
    });
  }

  /* ============================================================
     Ligações
     ============================================================ */
  function ligar() {
    $$('.nav-item').forEach(b => b.onclick = () => mostrar(b.dataset.view));
    $('#brandBtn').onclick = () => (S.DB.estudios.length ? dialogoEstudios() : dialogoFundar());
    $('#fundarBtn').onclick = dialogoFundar;
    $('#irMotorBtn').onclick = () => { if (!S.state.atual()) { toast('Funde um estúdio primeiro.'); return; } mostrar('motor'); };
    $('#pulseBtn').onclick = () => mostrar('motor');
    $('#sheetClose').onclick = fecharFolha;
    $('#sheetBackdrop').onclick = ev => { if (ev.target === $('#sheetBackdrop')) fecharFolha(); };

    $('#contratarBtn').onclick = dialogoContratar;
    $('#floor').onclick = ev => {
      const p = S.studio.cliqueNoChao(ev);
      if (p) painelPessoa(p.id);
    };

    $('#ordemBtn').onclick = async () => {
      const inp = $('#ordemInput');
      const txt = inp.value.trim(); if (!txt) return;
      inp.value = ''; $('#ordemBtn').disabled = true;
      await S.studio.darOrdem(txt);
      $('#ordemBtn').disabled = false;
      pintarTrabalho();
    };
    $('#ordemInput').addEventListener('keydown', ev => { if (ev.key === 'Enter') $('#ordemBtn').click(); });

    $('#buscarContratoBtn').onclick = async () => {
      const e = S.state.atual(); if (!e) return;
      const btn = $('#buscarContratoBtn');
      btn.disabled = true; const rotulo = btn.textContent; btn.textContent = 'Prospectando…';
      try {
        const n = await S.factory.prospectar(e, 2);
        toast(n > 0 ? n + ' contrato(s) na mesa.' : 'Já há contratos esperando decisão.');
      } catch (err) {
        toast('Não deu para prospectar agora.', 'erro');
      } finally {
        btn.disabled = false; btn.textContent = rotulo;
        pintarContratos();
      }
    };
    $('#limparLogBtn').onclick = () => { const e = S.state.atual(); if (e) { e.log = []; S.state.gravarJa(); pintarLog(); } };

    $$('#filtroArquivos button').forEach(b => b.onclick = () => {
      filtroClasse = b.dataset.classe;
      $$('#filtroArquivos button').forEach(x => x.classList.toggle('is-on', x === b));
      pintarArquivos();
    });
    $('#exportarTudoBtn').onclick = exportarZip;

    $('#salvarIABtn').onclick = () => {
      try {
        const digitada = $('#apiKeyInput').value.trim();
        S.ai.salvarCfg(digitada ? digitada : undefined, $('#modeloDecisaoSel').value, $('#modeloProducaoSel').value, $('#ritmoSel').value);
        $('#apiKeyInput').value = '';
        toast('Configuração salva.', 'ok');
        pintarMotor();
      } catch (err) { toast(err.message, 'erro'); }
    };
    $('#testarIABtn').onclick = async () => {
      const b = $('#testarIABtn'); b.disabled = true; b.textContent = 'testando…';
      try {
        if ($('#apiKeyInput').value.trim()) S.ai.salvarCfg($('#apiKeyInput').value, $('#modeloDecisaoSel').value, $('#modeloProducaoSel').value, $('#ritmoSel').value);
        const r = await S.ai.testar();
        toast('Conexão ok — a Groq respondeu: ' + r.slice(0, 40), 'ok');
      } catch (err) { toast(err.message, 'erro'); }
      b.disabled = false; b.textContent = 'Testar'; pintarMotor();
    };
    $('#pausarBtn').onclick = () => { S.ai.pausar(!S.ai.estado.pausado); pintarMotor(); };

    $('#fecharEstudioBtn').onclick = () => {
      const e = S.state.atual(); if (!e) return;
      confirmar('Fechar ' + e.nome + '?', 'Some com a equipe, os contratos e todos os arquivos deste estúdio. Exporte o .zip antes se quiser guardar as entregas.', () => {
        S.state.remover(e.id); toast('Estúdio fechado.');
      });
    };
    $('#zerarTudoBtn').onclick = () => {
      confirmar('Apagar tudo?', 'Remove todos os estúdios e o histórico. A chave da API continua salva.', () => {
        S.state.apagarTudo(); toast('Base limpa.');
      });
    };

    window.addEventListener('resize', () => { if (viewAtual === 'estudio') S.studio.ajustarCanvas(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { pintarRelogio(); if (viewAtual === 'negocio') pintarNegocio(); } });
  }

  /* ---------- reações a eventos ---------- */
  function assinar() {
    S.bus.on('ia', () => { pintarPulso(); if (viewAtual === 'motor') pintarMotor(); });
    S.bus.on('equipe', () => { if (viewAtual === 'estudio') pintarEquipe(); });
    S.bus.on('estudio', () => { pintarTopo(); if (viewAtual === 'estudio') { pintarEquipe(); pintarXP(); S.studio.ajustarCanvas(); } });
    S.bus.on('trabalho', () => { pintarBadges(); if (viewAtual === 'trabalho') pintarTrabalho(); });
    S.bus.on('arquivos', () => { pintarBadges(); if (viewAtual === 'entregas') pintarArquivos(); if (viewAtual === 'trabalho') pintarPendencias(); });
    S.bus.on('log', () => { if (viewAtual === 'trabalho') pintarLog(); });
    S.bus.on('negocio', () => { if (viewAtual === 'negocio') pintarNegocio(); });
    S.bus.on('relogio', () => { pintarRelogio(); });
    S.bus.on('nivel', n => { toast('Nível ' + n + '! Novos tipos de entrega liberados.', 'ok'); pintarXP(); pintarKits(); });
    S.bus.on('trocou', () => { S.studio.montar(); pintarTopo(); mostrar(S.state.atual() ? (viewAtual === 'vazio' ? 'estudio' : viewAtual) : 'vazio'); pintarTudo(); });
    S.bus.on('storage-falhou', () => toast('O navegador bloqueou o salvamento. O jogo roda, mas não guarda ao fechar.', 'erro'));
  }

  function pintarTudo() {
    pintarTopo(); pintarRelogio();
    if (!S.state.atual()) return;
    pintarEquipe(); pintarXP(); pintarTrabalho(); pintarKits(); pintarArquivos(); pintarNegocio(); pintarMotor();
  }

  /* ---------- início ---------- */
  function iniciar() {
    S.state.carregar();
    S.ai.iniciar();
    ligar(); assinar();
    S.studio.montar();
    mostrar(S.state.atual() ? 'estudio' : 'vazio');
    pintarTudo();
    setInterval(() => {
      pintarRelogio();
      if (viewAtual === 'negocio') pintarNegocio();
      if (viewAtual === 'motor') pintarMotor();
    }, 5000);
    window.addEventListener('beforeunload', () => S.state.gravarJa());
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  S.ui = { toast, folha, fecharFolha, mostrar, pintarTudo };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window.S);
