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
    if (view === 'estudio') { S.studio.ajustarCanvas(); pintarAmbienteBar(); }
    if (view === 'motor') pintarMotor();
    if (view === 'entregas') { pintarArquivos(); }
    if (view === 'trabalho') pintarTrabalho();
    if (view === 'reuniao') pintarReuniao();
  }

  /* ============================================================
     Topo
     ============================================================ */
  function pintarTopo() {
    const e = S.state.atual();
    $('#brandName').textContent = e ? e.nome : 'Estúdio';
    $('#brandSub').textContent = e
      ? `${e.ramo} · ${F.num(e.xp)} XP de experiência`
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
    const d = new Date();
    $('#clockDay').textContent = d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
    $('#clockHour').textContent = d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
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
      const lane = S.ai.estado && S.ai.estado.agentes ? S.ai.estado.agentes[p.id] : null;
      const iaEstado = lane && lane.emVoo ? 'IA própria trabalhando' : (S.ai.disponivel(p.id) ? 'IA própria pronta' : 'IA própria aguardando');
      const estado = p.ocupado ? (p.tarefa || 'trabalhando')
        : p.estado === 'pausa' ? 'em pausa'
          : p.estado === 'andando' ? 'andando pelo estúdio' : 'disponível';
      return `<button class="member" data-pessoa="${p.id}" type="button">
        <span class="avatar" style="background:${esc(p.cor)}">${esc(p.nome.slice(0, 2).toUpperCase())}</span>
        <span class="member-body">
          <span class="member-name">${esc(p.nome)} ${p.ocupado ? '<i class="thinking">trabalhando</i>' : ''}</span>
          <span class="member-role">${esc(p.cargo)}${p.papel === 'gerente' ? ' · coordena e remove bloqueios' : ''}</span>
          <span class="member-personality">${esc((((f.personalidade&&f.personalidade.tracos)||[]).slice(0,2).join(' · ')) || 'perfil em formação')}</span>
          <span class="member-status">${esc(estado)} · ${esc(iaEstado)}</span>
        </span>
        <span class="bars">
          ${barra('energia', f.energia)}
          ${barra('humor', f.humor)}
        </span>
      </button>`;
    }).join('') || '<div class="empty">Sem equipe.</div>';
    $$('#teamList [data-pessoa]').forEach(b => b.onclick = () => painelPessoa(b.dataset.pessoa));
    pintarGerencia();
  }
  function pintarAmbienteBar(){
    const e=S.state.atual(), box=$('#environmentBar'); if(!e||!box) return;
    const a=e.ambiente||{}, objs=a.objetos||[];
    box.innerHTML=`<span class="env-chip">🧱 ${objs.length} construções</span><span class="env-chip">🪙 ${F.brl(a.moedas||0)} orçamento do ambiente</span><span class="env-chip">${esc(a.tema||'oficina')}</span>`;
  }

  function pintarGerencia() {
    const e = S.state.atual(); if (!e) return;
    const box = $('#gerenciaPanel'); if (!box) return;
    const g = e.equipe.find(x => x.papel === 'gerente');
    const gr = e.gerencia || {};
    const alertas = gr.alertas || [];
    const abertas = (e.tarefas || []).filter(t => t.status !== 'feita').length;
    const feitas = (e.tarefas || []).filter(t => t.status === 'feita').length;
    const quadro = S.studio.ESPECIALIDADES.map(x => { const n=(e.equipe||[]).filter(f=>f.papel!=='gerente' && f.especialidade===x.id).length; return `${x.cargo}: ${n}`; }).join(' · ');
    box.innerHTML = `
      <div class="panel-head"><span class="panel-label">Supervisão da gerente</span><span class="chip">contínua</span></div>
      <div class="management-summary">
        <div><b>${abertas}</b><span>etapas abertas</span></div>
        <div><b>${feitas}</b><span>concluídas</span></div>
        <div><b>${(e.equipe||[]).filter(x=>x.papel!=='gerente').length}</b><span>funcionários</span></div>
      </div>
      <p class="panel-foot"><strong>Quadro:</strong> ${esc(quadro)} · A gerente decide contratações e desligamentos conforme a demanda real.</p>
      <p class="manager-focus"><strong>${esc(g ? g.nome : 'Gerente')}:</strong> ${esc(g && g.pensamento || gr.recomendacao || 'Avaliando a operação.')}</p>
      ${gr.recomendacao ? `<div class="manager-recommendation"><b>Recomendação</b><span>${esc(gr.recomendacao)}</span></div>` : ''}
      ${alertas.length ? `<div class="manager-alerts">${alertas.slice(-5).map(a=>`<div>⚠ ${esc(a)}</div>`).join('')}</div>` : '<p class="panel-foot">Nenhum alerta operacional no momento.</p>'}`;
  }

  function pintarXP() {
    const e = S.state.atual(); if (!e) return;
    const pr = S.state.progressoNivel(e.xp);
    $('#xpPanel').innerHTML = `
      <div class="panel-head"><span class="panel-label">Experiência do estúdio</span><span class="chip">nível ${pr.nivel}</span></div>
      <div class="meter"><i style="width:${pr.pct}%"></i></div>
      <div class="stat"><span>${F.num(e.xp)} experiência acumulada</span><b>${pr.falta > 0 ? 'próximo marco em ' + F.num(pr.falta) : 'marco máximo'}</b></div>
      <p class="panel-foot">A experiência é apenas um registro histórico do trabalho realizado; não libera templates nem determina o que a equipe deve produzir.</p>`;
  }

  function painelPessoa(id) {
    const p = S.studio.pessoa(id); if (!p) return;
    const f = p.ref || {};
    const e = S.state.atual();
    const feitas = e.tarefas.filter(t => t.para === id && t.status === 'feita').length;
    const esp = S.studio.ESPECIALIDADES.find(x => x.id === p.especialidade);
    const mem = (f.memoria || []).map(m => typeof m === 'string' ? m : m.texto).filter(Boolean).slice(-8);
    folha(`
      <h2>${esc(p.nome)}</h2>
      <p class="sub">${esc(p.cargo)} · ${esc(esp ? esp.desc : '')}</p>
      <div class="panel" style="margin:12px 0;padding:12px"><div class="panel-label">Ficha profissional</div>
        <div class="item-meta"><span>Experiência: ${esc((f.personalidade&&f.personalidade.experiencia)||'em formação')}</span></div>
        <p class="panel-foot"><strong>Traços:</strong> ${esc(((f.personalidade&&f.personalidade.tracos)||[]).join(', ')||'não definido')}</p>
        <p class="panel-foot"><strong>Comunicação:</strong> ${esc((f.personalidade&&f.personalidade.comunicacao)||'direta e cordial')}</p>
        <p class="panel-foot"><strong>Prioridades:</strong> ${esc((f.personalidade&&f.personalidade.prioridades)||'qualidade e utilidade')}</p>
        <p class="panel-foot"><strong>Estilo:</strong> ${esc((f.personalidade&&f.personalidade.estilo)||'prático')}</p>
        <p class="panel-foot"><strong>Colaboração:</strong> ${esc((f.personalidade&&f.personalidade.colaboracao)||'handoff claro')}</p>
        <p class="panel-foot"><strong>Evita:</strong> ${esc((f.personalidade&&f.personalidade.aversoes)||'retrabalho')}</p>
      </div>
      <div class="panel" style="margin:12px 0;padding:12px"><div class="panel-label">Foco atual</div><p class="panel-foot">${esc(f.pensamento || 'Observando como contribuir com o produto e com a equipe.')}</p></div>
      <div class="stats">
        <div class="stat"><span>Energia</span><b>${Math.round(f.energia)}/100</b></div>
        <div class="stat"><span>Humor</span><b>${Math.round(f.humor)}/100</b></div>
        <div class="stat"><span>Entregas assinadas</span><b>${f.entregas || 0}</b></div>
        <div class="stat"><span>Tarefas concluídas</span><b>${feitas}</b></div>
        <div class="stat"><span>Agora</span><b>${esc(p.ocupado ? (p.tarefa || 'trabalhando') : p.estado)}</b></div>
        <div class="stat"><span>Última contribuição</span><b>${esc((p.ref.contribuicaoAcervo && p.ref.contribuicaoAcervo.ultima) || '—')}</b></div>
      </div>
      ${mem.length ? `<div class="panel" style="margin-top:12px;padding:12px"><div class="panel-label">Memória relevante</div>${mem.map(x => `<p class="panel-foot" style="margin:6px 0">${esc(x)}</p>`).join('')}</div>` : ''}
      <div class="panel" style="margin-top:12px;padding:12px"><div class="panel-head"><span class="panel-label">Log individual</span><span class="chip">últimos eventos</span></div><div class="logbox person-log">${((f.log||[]).slice(-30).reverse()).map(l=>`<div class="log-line ${esc(l.tag||'info')}"><span class="log-ts">${F.hora(l.t)}</span><span class="log-txt">${esc(l.texto)}</span></div>`).join('') || '<div class="empty">Ainda não há eventos individuais.</div>'}</div></div>
      <div class="panel" style="margin-top:12px;padding:12px"><div class="panel-label">Cuidados e rotina</div><p class="panel-foot">Pausas de recuperação: ${Number(f.cuidados&&f.cuidados.pausa||0)} · Hidratação e pausas são simuladas como hábitos de bem-estar, sem monitoramento invasivo.</p></div>
      <div class="sheet-actions">
        <button class="btn btn-primary" id="fecharPessoa" type="button">Fechar</button>
      </div>`, box => {
      box.querySelector('#fecharPessoa').onclick = fecharFolha;
    });
  }

  /* ============================================================
     Trabalho
     ============================================================ */
  function pintarTrabalho() { pintarProjetos(); pintarIdeias(); pintarBacklog(); pintarLog(); pintarPendencias(); pintarBadges(); }

  function pintarBadges() {
    const e = S.state.atual(); if (!e) return;
    const candidatos = e.arquivos.filter(a => a.classe === 'candidato').length;
    $('#badgeTrabalho').hidden = true;
    $('#badgeEntregas').hidden = candidatos === 0;
  }

  function pintarProjetos() {
    const e = S.state.atual(); if (!e) return;
    const projetos = e.projetos || [];
    $('#projetosList').innerHTML = projetos.length ? projetos.map(pr => {
      const abertas = e.tarefas.filter(t => t.projectId === pr.id && t.status !== 'feita').length;
      const feitas = e.tarefas.filter(t => t.projectId === pr.id && t.status === 'feita').length;
      const arquivos = (pr.arquivoIds || []).map(id => e.arquivos.find(a => a.id === id)).filter(Boolean);
      const completos = arquivos.filter(a=>a.validacao?.pronto || a.classe==='produto').length;
      const atividade = (pr.atividade || []).slice(-4).reverse();
      return `<div class="item project-item">
        <span class="dot-state ${pr.status === 'ativo' ? 'fazendo' : ''}"></span>
        <div class="item-body">
          <div class="item-title">${esc(pr.nome)}</div>
          <div class="item-meta"><span>${esc(pr.objetivo)}</span></div>
          <div class="stats project-stats">
            <div class="stat"><span>Etapas</span><b>${feitas} feitas · ${abertas} abertas</b></div>
            <div class="stat"><span>Artefatos</span><b>${arquivos.length}</b></div>
            <div class="stat"><span>Entregas completas</span><b>${completos}/${arquivos.length}</b></div>
          </div>
          ${atividade.length ? `<div class="project-feed">${atividade.map(a=>`<div><span>${F.hora(a.t)}</span>${esc(a.texto)}</div>`).join('')}</div>` : ''}
        </div>
      </div>`;
    }).join('') : '<div class="empty">A equipe ainda não criou um projeto.</div>';
  }

  function pintarIdeias() {
    const e = S.state.atual(); if (!e) return;
    const box = $('#ideiasList'); if (!box) return;
    const ideias = (e.ideias || []).slice(0, 8);
    box.innerHTML = ideias.length ? ideias.map(i => `
      <div class="item idea-item">
        <span class="dot-state ${i.status === 'descartada' ? '' : 'fazendo'}"></span>
        <div class="item-body">
          <div class="item-title">${esc(i.titulo)}</div>
          <div class="item-meta"><span>${F.dataHora(i.t)}</span><span>· ${esc(i.status || 'selecionada')}</span></div>
          ${i.objetivo ? `<p class="panel-foot">${esc(i.objetivo)}</p>` : ''}
          ${i.proposta ? `<div class="project-feed"><div>${esc(i.proposta)}</div></div>` : ''}
          ${(i.participantes||[]).length ? `<div class="item-meta">${i.participantes.map(p=>`<span>${esc(p.nome)}</span>`).join(' · ')}</div>` : ''}
        </div>
      </div>`).join('') : '<div class="empty">A equipe ainda não chegou a uma nova iniciativa.</div>';
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
            ${quem ? `<span>· ${esc(quem)}</span>` : '<span>· aguardando distribuição</span>'}
            ${t.validacao?.pronto ? `<span>· entrega completa</span>` : ''}
            ${t.handoff ? `<span>· ${esc(t.handoff)}</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('') : '<div class="empty">O plano está vazio. A gerente cria as próximas etapas conforme o projeto evolui.</div>';
  }

  function pintarPendencias() {
    const e = S.state.atual(); if (!e) return;
    const cands = e.arquivos.filter(a => a.classe === 'candidato').slice(0, 4);
    const painel = $('#aprovacoesPanel');
    painel.hidden = cands.length === 0;
    if (!cands.length) return;
    painel.innerHTML = `<div class="panel-head"><span class="panel-label">Revisões da gerência</span><span class="chip">${cands.length}</span></div>
      ${cands.map(a => `<div class="item">
        <span class="dot-state feita"></span>
        <div class="item-body">
          <div class="item-title">${esc(a.nome)}</div>
          <div class="item-meta"><span>${a.validacao?.pronto || a.classe==='produto' ? 'entrega completa' : 'em trabalho'}</span><span>· por ${esc(a.autor)}</span></div>
        </div>

      </div>`).join('')}
      <p class="panel-foot">A gerente avalia os candidatos automaticamente. Aprovações internas não dependem de você: a equipe resolve briefings, distribuição e decisões operacionais sozinha. Só decisões externas ou irreversíveis são escaladas.</p>`;
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
  function pintarKits() { /* Produção é autônoma; não há encomendas manuais. */ }

  const ROTULO_CLASSE = { esboco: 'esboço', prototipo: 'protótipo', candidato: 'candidato', produto: 'produto final' };
  const EXPLICA_CLASSE = {
    todos: 'O pipeline registra a evolução dos artefatos: esboço → protótipo → candidato → produto final. Versões anteriores permanecem no histórico.',
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
              <span class="quality">${a.validacao?.pronto || a.classe==='produto' ? 'pronto' : 'em trabalho'}</span>
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
          ${a.classe !== 'produto' ? `<button class="btn btn-mini" data-editar="${a.id}" type="button">Editar</button>` : ''}
          ${a.classe !== 'produto' ? `<button class="btn btn-mini btn-danger" data-apagar="${a.id}" type="button">Apagar</button>` : ''}
        </div>
        ${previa ? `<iframe class="file-frame" sandbox="allow-same-origin" srcdoc="${esc(a.conteudo)}"></iframe>` : ''}
        ${aberto === 'codigo' ? `<div class="file-view">${esc(a.conteudo.slice(0, 9000))}</div>` : ''}
      </div>`;
    }).join('') : `<div class="empty">Nenhum arquivo ${filtroClasse === 'todos' ? '' : 'nesse estágio '}ainda. A equipe ainda não produziu um artefato neste projeto.</div>`;

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
    $$('#filesList [data-editar]').forEach(b => b.onclick = () => {
      const a = e.arquivos.find(x => x.id === b.dataset.editar); if (!a || a.classe === 'produto') return;
      folha(`
        <h2>Editar artefato</h2>
        <p class="sub">Este material ainda está em produção. Ao editar, ele volta para revisão da gerente antes de poder virar produto final.</p>
        <div class="field"><label for="editNome">Nome</label><input id="editNome" value="${esc(a.nome)}"></div>
        <div class="field"><label for="editConteudo">Conteúdo</label><textarea id="editConteudo" rows="16" style="width:100%;resize:vertical">${esc(a.conteudo)}</textarea></div>
        <div class="sheet-actions"><button class="btn" id="cancelEdit" type="button">Cancelar</button><button class="btn btn-primary" id="saveEdit" type="button">Salvar edição</button></div>`, box => {
        box.querySelector('#cancelEdit').onclick = fecharFolha;
        box.querySelector('#saveEdit').onclick = () => {
          const ok = S.studio.editarArquivo(a.id, box.querySelector('#editConteudo').value, box.querySelector('#editNome').value);
          if (ok) { fecharFolha(); toast('Artefato editado e devolvido à revisão.', 'ok'); pintarArquivos(); }
          else toast('Não foi possível editar este artefato.', 'erro');
        };
      });
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
        e.arquivos.map(a => `- \`${a.classe}/${a.nome}\` — ${a.validacao?.pronto ? 'entrega estruturalmente completa' : 'entrega ainda em trabalho'}, por ${a.autor}`).join('\n') +
        `\n\nOs arquivos deste pacote são reais e podem ser usados, editados e vendidos livremente. O aplicativo não simula vendas, caixa ou clientes. A interação com o mundo real fica com você.\n`
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

  /* ============================================================
     Motor
     ============================================================ */
  function pintarMotor() {
    const e = S.state.atual();
    const st = S.ai.estado;
    // O painel do Motor pode existir em uma versão de shell diferente
    // durante uma atualização do GitHub Pages/service worker. Nunca assuma
    // que um elemento existe: uma pintura da UI não pode derrubar o app.
    const chip = $('#conexaoChip');
    const pausar = $('#pausarBtn');
    const apiKeyInput = $('#apiKeyInput');
    const msg = $('#conexaoMsg');
    if (chip) chip.textContent = st.pausado ? 'pausada' : S.ai.temChave() ? st.situacao : 'desligada';
    if (pausar) pausar.textContent = st.pausado ? 'Religar equipe' : 'Pausar equipe';
    if (msg) msg.textContent = st.detalhe || '';

    const pv = S.ai.provedorAtual();
    const info = S.ai.PROVEDORES[pv] || S.ai.PROVEDORES.groq;
    const auto = S.ai.cfg.roteamento === 'automatico';
    const provSel = $('#provedorSel');
    if (provSel) provSel.value = auto ? 'auto' : pv;
    const pHint = $('#provedorHint');
    if (pHint) pHint.textContent = auto ? 'Roteamento real: Groq primeiro, OpenRouter somente quando a Groq atingir a cota. O orçamento local continua valendo para o gasto pago.' : info.nota;
    const manualField=$('#chaveManualField'), autoField=$('#chavesAutoField');
    if(manualField) manualField.hidden=auto; if(autoField) autoField.hidden=!auto;
    const kLabel = $('#apiKeyLabel');
    if (kLabel) kLabel.textContent = `Chave ${info.rotulo}`;
    const kHint = $('#apiKeyHint');
    if (kHint) kHint.textContent = `A chave fica só neste aparelho, no armazenamento do navegador. Pegue a sua em ${info.console}.`;
    if (apiKeyInput) apiKeyInput.placeholder = S.ai.temChave() ? S.ai.chaveMascarada() : info.prefixo + '...';
    const tierField = $('#tierField');
    if (tierField) tierField.hidden = !auto && pv !== 'groq';
    const gki=$('#groqKeyInput'), ori=$('#openrouterKeyInput'), mgmt=$('#openrouterManagementKeyInput'), mgmtStatus=$('#openrouterManagementStatus');
    const ps=S.ai.statusFornecedores();
    if(gki) gki.placeholder=ps.groq.status==='disponivel'?'gsk_••••••':'gsk_...';
    if(ori) ori.placeholder=ps.openrouter.status==='disponivel'?'sk-or-••••••':'sk-or-...';
    if(mgmt) mgmt.placeholder=ps.openrouterManagementConfigured?'Management Key · ••••••':'Management Key OpenRouter';
    if(mgmtStatus) { const r=ps.openrouter; mgmtStatus.textContent = r.saldoConta!=null ? `Saldo real: US$ ${Number(r.saldoConta).toFixed(4)}${r.ultimoSyncCreditos ? ' · sincronizado' : ''}` : (r.erroCreditos ? `Falha ao sincronizar: ${r.erroCreditos}` : (ps.openrouterManagementConfigured ? 'Management Key configurada · sincronizando…' : 'Cole a Management Key e sincronize o saldo.')); mgmtStatus.style.color = r.erroCreditos ? '#E08573' : ''; }

    const opcoes = sel => (S.ai.MODELOS || []).map(m =>
      `<option value="${m.id}" ${S.ai.cfg[sel] === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('');
    const pensamento = $('#modeloPensamentoSel');
    const producao = $('#modeloProducaoSel');
    if (pensamento) pensamento.innerHTML = opcoes('pensamento');
    if (producao) producao.innerHTML = opcoes('producao');
    const limite = $('#limiteTokensSel');
    if (limite) limite.value = String(S.ai.cfg.limiteTokensDia || 120000);
    const mensal = $('#orcamentoMensalInput');
    if (mensal) mensal.value = Number(S.ai.cfg.orcamentoUSD || 3).toFixed(2);
    const autoDia = $('#diarioAutoInput');
    if (autoDia) autoDia.checked = S.ai.cfg.diarioAutomatico !== false;
    const diario = $('#limiteDiarioUSDInput');
    if (diario) diario.value = Number(S.ai.cfg.limiteDiarioUSD || 0.10).toFixed(2);
    const diarioHint = $('#limiteDiarioHint');
    if (diarioHint) diarioHint.textContent = S.ai.cfg.diarioAutomatico !== false ? 'Calculado automaticamente a cada novo dia a partir do saldo do orçamento e dos dias restantes.' : 'Limite fixo por dia. O orçamento de 30 dias continua sendo o teto absoluto.';
    if (diario) diario.disabled = S.ai.cfg.diarioAutomatico !== false;

    const o = S.ai.orcamento();
    const h = o.headers;
    const autoDiaInput = $('#diarioAutoInput');
    const modoOrcamento = $('#modoOrcamentoSel');
    if (modoOrcamento) modoOrcamento.value = S.ai.cfg.modoOrcamento || 'normal';
    if (autoDiaInput) autoDiaInput.onchange = () => { const d=$('#limiteDiarioUSDInput'); if(d) d.disabled=autoDiaInput.checked; };
    const tierSel = $('#tierSel');
    if (tierSel && tierSel.value !== o.tier) tierSel.value = o.tier;
    const espera = S.ai.estado.bloqueadaAte - Date.now();
    $('#consumoPanel').innerHTML = `
      <div class="panel-head"><span class="panel-label">Consumo de hoje</span><span class="tag tag-real">REAL</span></div>
      ${o.pctTokens != null ? `<div class="meter ${o.pctTokens > 85 ? 'bad' : o.pctTokens > 60 ? 'warn' : 'ok'}"><i style="width:${o.pctTokens}%"></i></div>` : ''}
      <div class="stats">
        <div class="stat"><span>Orçamento do ciclo</span><b>US$ ${Number(o.orcamentoUSD||3).toFixed(2)} / 30 dias</b></div>
        <div class="stat"><span>Gasto estimado no ciclo</span><b>US$ ${Number(o.custoPeriodo||0).toFixed(4)}</b></div>
        <div class="stat"><span>Restante do ciclo</span><b>US$ ${Number(o.restanteUSD||0).toFixed(4)}</b></div>
        <div class="stat"><span>Limite de hoje</span><b>US$ ${Number(o.limiteDiarioUSD||0).toFixed(4)} ${o.modoOrcamento === 'intensivo' ? '· ignorado no intensivo' : (o.diarioAutomatico ? '· automático' : '· fixo')}</b></div>
        <div class="stat"><span>Gasto de hoje</span><b>US$ ${Number(o.custoDiaUSD||0).toFixed(4)}</b></div>
        <div class="stat"><span>Restante hoje</span><b>US$ ${Number(o.restanteDiaUSD||0).toFixed(4)}</b></div>
        <div class="stat"><span>Dias restantes</span><b>${Math.ceil(o.diasRestantes||0)}</b></div>
        <div class="stat"><span>Ritmo médio disponível</span><b>US$ ${Number(o.ritmoDiarioUSD||0).toFixed(4)}/dia</b></div>
        <div class="stat"><span>Tokens usados hoje</span><b>${F.num(o.tokens)}</b></div>
        <div class="stat"><span>Teto de segurança diário</span><b>${F.num(o.limiteTokensDia || 120000)}</b></div>
        <div class="stat"><span>Chamadas feitas hoje</span><b>${F.num(o.requisicoes)}</b></div>
        <div class="stat"><span>Entrada / saída</span><b>${F.compact(o.entrada)} / ${F.compact(o.saida)}</b></div>
        ${h && h.restaReq != null ? `<div class="stat"><span>Requisições restantes</span><b>${F.num(h.restaReq)}${h.limiteReq ? ' / ' + F.num(h.limiteReq) : ''}</b></div>` : ''}
        ${h && h.restaTok != null ? `<div class="stat"><span>Tokens restantes na janela</span><b>${F.num(h.restaTok)}${h.limiteTok ? ' / ' + F.num(h.limiteTok) : ''}</b></div>` : ''}
        <div class="stat"><span>Modo de provedor</span><b>${o.roteamento === 'automatico' ? 'Groq grátis → OpenRouter' : o.provedor}</b></div>
        ${(()=>{ const ps=S.ai.statusFornecedores(); const g=ps.groq, r=ps.openrouter; const saldo=r.saldoConta; const efetivo=ps.openrouterSaldo; return `<div class="stat"><span>Groq</span><b>${g.status}${g.headers&&g.headers.restaReq!=null?' · '+F.num(g.headers.restaReq)+' req restantes':''}</b></div><div class="stat"><span>Saldo real OpenRouter</span><b>${saldo!=null?'US$ '+Number(saldo).toFixed(4):'não sincronizado'}</b></div><div class="stat"><span>Disponível para o Estúdio</span><b>${efetivo!=null?'US$ '+Number(efetivo).toFixed(4):'—'}</b></div><div class="stat"><span>Limite da chave</span><b>${r.temLimiteChave===true && r.limiteRestante!=null?'US$ '+Number(r.limiteRestante).toFixed(4)+' restantes':'sem limite específico'}</b></div>`; })()}
        <div class="stat"><span>Modo de trabalho</span><b>${o.modoOrcamento === 'intensivo' ? 'Trabalho intensivo' : 'Normal'}</b></div>
        <div class="stat"><span>Autonomia</span><b>${st.emVoo ? 'em execução' : st.pausado ? 'pausada' : S.ai.pronta() ? 'pronta' : 'aguardando chave'}</b></div>
        ${(o.esgotado || o.esgotadoDia || (S.ai.estado && S.ai.estado.orcamentoPreventivo)) ? `<p class="panel-foot" style="color:#E08573"><strong>${o.esgotado ? 'Orçamento do ciclo esgotado.' : 'Limite diário esgotado.'}</strong> A equipe não fará novas chamadas e entra em rotina Sims-like até ${o.esgotado ? 'o próximo ciclo de 30 dias' : 'o próximo dia'}. ${(!o.esgotado && o.modoOrcamento !== 'intensivo') ? 'Ative Trabalho intensivo se quiser usar o saldo mensal restante hoje.' : ''}</p>` : ''}
        ${espera > 0 ? `<div class="stat"><span>Janela reabre em</span><b>${F.dur(espera)}</b></div>` : ''}
        ${e ? `<div class="stat"><span>Consumo deste estúdio</span><b>${F.compact(e.uso.tokens)} tokens · ${F.num(e.uso.chamadas)} chamadas</b></div>` : ''}
      </div>
      ${st.ultimo429 && o.provedor === 'groq' ? `<p class="panel-foot" style="color:#E4A03E">A o provedor ativo atingiu um limite. Se houver outro provedor configurado, o motor tenta fazer failover automaticamente.</p>` : ''}
      <p class="panel-foot">${o.fonte === 'groq'
        ? 'Os limites de janela vêm dos cabeçalhos do provedor. O limite local acima é um freio de segurança escolhido no aparelho.'
        : 'O saldo real do OpenRouter é consultado pela Management Key diretamente do navegador e sincronizado periodicamente.'}</p>`;

    $('#callsList').innerHTML = st.chamadas.length ? st.chamadas.map(c => `
      <div class="call">
        <div class="call-head"><b>${esc(c.quem)}</b><span>${esc(c.motivo)}</span>
          <span class="tag ${c.ok ? 'tag-real' : 'tag-rust'}">${c.ok ? 'ok' : 'falhou'}</span></div>
        <div class="call-meta">${esc(c.modelo)}${c.provedor ? ' · '+esc(c.provedor) : ''} · ${F.dur(c.ms)}${c.tokens ? ' · ' + F.num(c.tokens) + ' tokens' : ''} · ${F.hora(c.em)}</div>
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
        <div class="foundation-summary">
          <div class="panel-head"><span class="panel-label">Fundação estratégica</span><span class="status-chip">${esc(e.fundacao?.estado==='operacional'?'concluída':'em preparação')}</span></div>
          <p class="hint"><b>${esc(e.fundacao?.identidade?.slogan||'Identidade definida pela gerente')}</b></p>
          <p class="hint">${esc(e.fundacao?.identidade?.posicionamento||'A gerente ainda está construindo o posicionamento.')}</p>
          <details><summary>Plano de negócio</summary><pre class="foundation-text">${esc(e.fundacao?.planoNegocio||'Ainda não concluído.')}</pre></details>
          <details><summary>Planejamento do primeiro produto</summary><pre class="foundation-text">${esc(e.fundacao?.primeiroProduto||'Ainda não concluído.')}</pre></details>
          <details><summary>Manifesto</summary><pre class="foundation-text">${esc(e.fundacao?.identidade?.manifesto||'Ainda não concluído.')}</pre></details>
        </div>
        <p class="hint">A gerente decide a identidade e a estratégia durante a fundação. Os dados persistentes e os artefatos anteriores continuam no contexto dos agentes.</p>Esses campos entram em toda instrução mandada para a IA. Quanto mais específicos, melhor a entrega; o contexto também consome tokens.</p>`;
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
      <h2>Fundar nova empresa</h2>
      <p class="sub">Você fornece só as decisões estruturais. A nova gerente decide o nome, identidade visual, missão, manifesto, plano de negócio e primeiro produto. Ela também define os cargos iniciais e cria as fichas dos funcionários que a empresa realmente precisa.</p>
      <div class="field"><label for="fIdeia">Ideia central</label><textarea id="fIdeia" rows="3" placeholder="O que você quer criar ou resolver?"></textarea></div>
      <div class="field"><label for="fObjetivo">Objetivo</label><textarea id="fObjetivo" rows="2" placeholder="Onde você quer chegar com essa empresa?"></textarea></div>
      <div class="field"><label for="fTipo">Tipo de produto</label><input id="fTipo" type="text" placeholder="ex.: software, livro, curso, serviço, ferramenta"></div>
      <div class="field"><label for="fPublico">Público que você imagina</label><input id="fPublico" type="text" placeholder="Pode ser uma hipótese; a gerente vai refiná-la."></div>
      <div class="field"><label for="fRestricoes">Recursos ou restrições importantes</label><textarea id="fRestricoes" rows="2" placeholder="ex.: tecnologia, conhecimento, orçamento, prazo, país"></textarea></div>
      <p class="hint">A gerente geral é criada primeiro. A IA define os cargos e cria as fichas dos funcionários necessários; depois a gerente mantém o quadro, podendo contratar ou demitir conforme a demanda real.</p>
      <div class="sheet-actions"><button class="btn" id="cancelFundar" type="button">Cancelar</button><button class="btn btn-primary" id="okFundar" type="button">Fundar e deixar a gerente decidir</button></div>`, box => {
      box.querySelector('#cancelFundar').onclick=fecharFolha;
      box.querySelector('#okFundar').onclick=async()=>{const b=box.querySelector('#okFundar'),d={ideia:box.querySelector('#fIdeia').value.trim(),objetivo:box.querySelector('#fObjetivo').value.trim(),tipoProduto:box.querySelector('#fTipo').value.trim(),publico:box.querySelector('#fPublico').value.trim(),restricoes:box.querySelector('#fRestricoes').value.trim(),ramo:box.querySelector('#fTipo').value.trim()||'empresa de produto'};if(!d.ideia&&!d.objetivo&&!d.tipoProduto){toast('Informe pelo menos a ideia, o objetivo ou o tipo de produto.','erro');return;}b.disabled=true;b.textContent='Criando empresa…';try{const e=S.studio.fundar(d);await S.studio.processarFundacaoAtual();fecharFolha();mostrar('estudio');pintarTudo();const ok=e.fundacao&&e.fundacao.estado==='operacional';toast(ok?'Empresa fundada. A gerente definiu a estratégia e montou a equipe.':'Empresa criada. A gerente concluirá a fundação quando a IA estiver disponível.',ok?'ok':'info');}catch(err){b.disabled=false;b.textContent='Fundar e deixar a gerente decidir';toast(err.message||'Falha ao fundar a empresa.','erro');}};
    });
  }

  function dialogoContratar() {
    const e = S.state.atual(); if (!e) return;
    folha(`
      <h2>Contratar</h2>
      <p class="sub">A contratação altera a composição da equipe. O Estúdio não simula salários, caixa ou mercado.</p>
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
        toast('Contratação feita.', 'ok');
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
     Sala de reuniões
     ============================================================ */
  function pintarReuniao() {
    const e=S.state.atual(); if(!e) return;
    const r=e.reuniao||{mensagens:[],relatorios:[],reunioes:[]};
    const pessoas=e.equipe||[];
    const mp=$('#meetingPeople');
    if(mp) mp.innerHTML=pessoas.map(f=>`<div class="meeting-person"><span class="avatar" style="background:${esc(f.cor)}">${esc(f.nome.slice(0,2).toUpperCase())}</span><span><b>${esc(f.nome)}</b><small>${esc(f.cargo)} · ${f.foco?esc(f.foco):'disponível'}</small></span></div>`).join('');
    const active=r.reuniaoAtiva;
    const head=document.querySelector('.meeting-room-head .panel-foot');
    if(head) head.textContent = active ? `Reunião em andamento: ${active.motivo}. As falas e decisões são registradas automaticamente.` : (e.fundacao && e.fundacao.estado !== 'operacional' ? 'A empresa está em fundação. A gerente está consolidando identidade, plano de negócio e primeiro produto antes do trabalho normal.' : 'A equipe usa esta sala para alinhamentos reais, decisões e conversas internas. As interações ficam na ata e também na memória individual.');
    const box=$('#meetingMessages');
    if(!box) return;
    const msgs=(r.mensagens||[]).slice(-80);
    box.innerHTML=msgs.length?msgs.map(m=>`<div class="meeting-msg ${m.tipo==='usuario'?'mine':''} ${m.tipo==='relatorio'?'system':''}"><div class="who">${esc(m.quem)}</div><div class="txt">${esc(m.texto)}</div><div class="time">${F.hora(m.t)}</div></div>`).join(''):'<div class="empty">A sala está vazia. Comece uma conversa com a equipe.</div>';
    box.scrollTop=box.scrollHeight;
  }

  async function enviarReuniao(texto) {
    const input=$('#meetingInput'), btn=$('#meetingSend');
    if(!String(texto||'').trim()) return;
    btn.disabled=true; btn.textContent='A equipe está conversando…';
    try {
      const r=await S.studio.reuniaoFalar(texto);
      if(r && r.erro) toast(r.erro,'erro');
    } catch(err){ toast(err.message||'Falha na reunião.','erro'); }
    finally { btn.disabled=false; btn.textContent='Enviar à reunião'; pintarReuniao(); if(input) { input.value=''; input.focus(); } }
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

    $('#meetingForm').onsubmit = ev => { ev.preventDefault(); enviarReuniao($('#meetingInput').value); };
    $('#pedirRelatorioBtn').onclick = () => enviarReuniao('Apresente um relatório objetivo do estado atual do projeto, do que já foi produzido, do que está pendente e do próximo passo recomendado.');
    $('#pedirFeedbackBtn').onclick = () => enviarReuniao('Quero feedback da equipe: o que está funcionando, o que está bloqueando o produto final e o que devemos melhorar agora?');
    $('#limparReuniaoBtn').onclick = () => { const e=S.state.atual(); if(e){ e.reuniao=e.reuniao||{mensagens:[],relatorios:[]}; e.reuniao.mensagens=[]; S.state.gravarJa(); pintarReuniao(); toast('Conversa da sala limpa.'); } };

    $('#floor').onclick = ev => {
      const alvo = S.studio.cliqueNoChao(ev);
      if (alvo && alvo.objeto) {
        const o=alvo.objeto;
        toast(`${o.nome || o.tipo} · usado ${Number(o.uso||0)} vez(es)${o.por ? ' · criado pela equipe' : ''}.`, 'info');
      } else if (alvo) painelPessoa(alvo.id);
    };

    $('#limparLogBtn').onclick = () => { const e = S.state.atual(); if (e) { e.log = []; S.state.gravarJa(); pintarLog(); } };

    $$('#filtroArquivos button').forEach(b => b.onclick = () => {
      filtroClasse = b.dataset.classe;
      $$('#filtroArquivos button').forEach(x => x.classList.toggle('is-on', x === b));
      pintarArquivos();
    });
    $('#exportarTudoBtn').onclick = exportarZip;

    const salvarIABtn = $('#salvarIABtn');
    if (salvarIABtn) salvarIABtn.onclick = async () => {
      try {
        const key = $('#apiKeyInput');
        const pensamento = $('#modeloPensamentoSel');
        const producao = $('#modeloProducaoSel');
        const limite = $('#limiteTokensSel');
        const mensal = $('#orcamentoMensalInput');
        const diario = $('#limiteDiarioUSDInput');
        const autoDia = $('#diarioAutoInput');
        const modoOrcamento = $('#modoOrcamentoSel');
        const digitada = key ? key.value.trim() : '';
        const mgmt = $('#openrouterManagementKeyInput');
        if (mgmt && mgmt.value.trim()) { await S.ai.salvarChaveGerenciamentoOpenRouter(mgmt.value); mgmt.value=''; }
        if (S.ai.cfg.roteamento === 'automatico') {
          const g=$('#groqKeyInput'), r=$('#openrouterKeyInput');
          S.ai.salvarChaves(g&&g.value.trim()?g.value:undefined, r&&r.value.trim()?r.value:undefined);
          if(g) g.value=''; if(r) r.value='';
        } else {
          S.ai.salvarCfg(digitada ? digitada : undefined, pensamento ? pensamento.value : undefined, producao ? producao.value : undefined, limite ? limite.value : undefined, mensal ? mensal.value : undefined, diario ? diario.value : undefined, autoDia ? autoDia.checked : undefined, modoOrcamento ? modoOrcamento.value : undefined);
          if (key) key.value = '';
        }
        S.ai.salvarCfg(undefined, pensamento ? pensamento.value : undefined, producao ? producao.value : undefined, limite ? limite.value : undefined, mensal ? mensal.value : undefined, diario ? diario.value : undefined, autoDia ? autoDia.checked : undefined, modoOrcamento ? modoOrcamento.value : undefined); 
        toast('Configuração salva.', 'ok');
        pintarMotor();
      } catch (err) { toast(err.message, 'erro'); }
    };
    const testarIABtn = $('#testarIABtn');
    if (testarIABtn) testarIABtn.onclick = async () => {
      const b = testarIABtn; b.disabled = true; b.textContent = 'testando…';
      try {
        const key = $('#apiKeyInput');
        const pensamento = $('#modeloPensamentoSel');
        const producao = $('#modeloProducaoSel');
        const limite = $('#limiteTokensSel');
        const mensal = $('#orcamentoMensalInput');
        const diario = $('#limiteDiarioUSDInput');
        const autoDia = $('#diarioAutoInput');
        const modoOrcamento = $('#modoOrcamentoSel');
        const mgmt = $('#openrouterManagementKeyInput');
        if (mgmt && mgmt.value.trim()) { await S.ai.salvarChaveGerenciamentoOpenRouter(mgmt.value); mgmt.value=''; }
        if (S.ai.cfg.roteamento === 'automatico') { const g=$('#groqKeyInput'), r=$('#openrouterKeyInput'); S.ai.salvarChaves(g&&g.value.trim()?g.value:undefined, r&&r.value.trim()?r.value:undefined); if(g) g.value=''; if(r) r.value=''; }
        else if (key && key.value.trim()) S.ai.salvarCfg(key.value, pensamento ? pensamento.value : undefined, producao ? producao.value : undefined, limite ? limite.value : undefined, mensal ? mensal.value : undefined, diario ? diario.value : undefined, autoDia ? autoDia.checked : undefined, modoOrcamento ? modoOrcamento.value : undefined);
        const r = await S.ai.testar();
        toast('Conexão ok — o provedor respondeu: ' + r.slice(0, 40), 'ok');
      } catch (err) { toast(err.message, 'erro'); }
      b.disabled = false; b.textContent = 'Testar'; pintarMotor();
    };
    const sincronizarSaldoBtn = $('#sincronizarSaldoBtn');
    if (sincronizarSaldoBtn) sincronizarSaldoBtn.onclick = async () => {
      const b=sincronizarSaldoBtn; const mgmt=$('#openrouterManagementKeyInput');
      try {
        b.disabled=true; b.textContent='sincronizando…';
        if (mgmt && mgmt.value.trim()) { await S.ai.salvarChaveGerenciamentoOpenRouter(mgmt.value); mgmt.value=''; }
        else if (!S.ai.statusFornecedores().openrouterManagementConfigured) throw new Error('Cole a Management Key do OpenRouter primeiro.');
        const r=await S.ai.sincronizarCreditosOpenRouter();
        if (!r) throw new Error(S.ai.statusFornecedores().openrouter.erroCreditos || 'Não foi possível consultar os créditos.');
        toast('Saldo OpenRouter sincronizado.', 'ok');
      } catch(err) { toast(err.message, 'erro'); }
      finally { b.disabled=false; b.textContent='Sincronizar saldo'; pintarMotor(); }
    };
    const pausarBtn = $('#pausarBtn');
    if (pausarBtn) pausarBtn.onclick = () => { S.ai.pausar(!S.ai.estado.pausado); pintarMotor(); };
    const tierSel = $('#tierSel');
    if (tierSel) tierSel.onchange = () => { S.ai.definirTier(tierSel.value); pintarMotor(); };
    const provedorSel = $('#provedorSel');
    if (provedorSel) provedorSel.onchange = () => {
      S.ai.definirProvedor(provedorSel.value);
      const k = $('#apiKeyInput'); if (k) k.value = '';
      toast(provedorSel.value==='auto' ? 'Roteamento automático: Groq grátis → OpenRouter.' : `Provedor: ${S.ai.PROVEDORES[provedorSel.value].nome}.`, 'ok');
      pintarMotor();
    };

    const fecharEstudioBtn = $('#fecharEstudioBtn');
    if (fecharEstudioBtn) fecharEstudioBtn.onclick = () => {
      const e = S.state.atual(); if (!e) return;
      confirmar('Fechar ' + e.nome + '?', 'Some com a equipe, os projetos e todos os arquivos deste estúdio. Exporte o .zip antes se quiser guardar as entregas.', () => {
        S.state.remover(e.id); toast('Estúdio fechado.');
      });
    };
    const zerarTudoBtn = $('#zerarTudoBtn');
    if (zerarTudoBtn) zerarTudoBtn.onclick = () => {
      confirmar('Apagar tudo?', 'Remove todos os estúdios e o histórico. A chave da API continua salva.', () => {
        S.state.apagarTudo(); toast('Base limpa.');
      });
    };

    window.addEventListener('resize', () => { if (viewAtual === 'estudio') S.studio.ajustarCanvas(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { pintarRelogio(); } });
  }

  /* ---------- reações a eventos ---------- */
  function assinar() {
    S.bus.on('ia', () => { pintarPulso(); if (viewAtual === 'motor') pintarMotor(); });
    S.bus.on('gerencia', () => pintarGerencia());
    S.bus.on('equipe', () => pintarGerencia());
    S.bus.on('equipe', () => { if (viewAtual === 'estudio') pintarEquipe(); });
    S.bus.on('estudio', () => { pintarTopo(); if (viewAtual === 'estudio') { pintarEquipe(); pintarXP(); pintarAmbienteBar(); S.studio.ajustarCanvas(); } });
    S.bus.on('trabalho', () => { pintarBadges(); if (viewAtual === 'trabalho') pintarTrabalho(); });
    S.bus.on('arquivos', () => { pintarBadges(); if (viewAtual === 'entregas') pintarArquivos(); if (viewAtual === 'trabalho') pintarPendencias(); });
    S.bus.on('log', () => { if (viewAtual === 'trabalho') pintarLog(); });
    S.bus.on('reuniao', () => { if (viewAtual === 'reuniao') pintarReuniao(); });
        S.bus.on('ambiente', () => { if (viewAtual === 'estudio') pintarAmbienteBar(); });
  S.bus.on('ideias', () => { if (viewAtual === 'trabalho') pintarIdeias(); });
    S.bus.on('relogio', () => { pintarRelogio(); });
    S.bus.on('nivel', n => { toast('Experiência do estúdio: nível ' + n + '.', 'ok'); pintarXP(); pintarKits(); });
    S.bus.on('trocou', () => { S.studio.montar(); pintarTopo(); mostrar(S.state.atual() ? (viewAtual === 'vazio' ? 'estudio' : viewAtual) : 'vazio'); pintarTudo(); });
    S.bus.on('storage-falhou', () => toast('O navegador bloqueou o salvamento. A simulação roda, mas não guarda ao fechar.', 'erro'));
  }

  function pintarTudo() {
    pintarTopo(); pintarRelogio();
    if (!S.state.atual()) return;
    pintarEquipe(); pintarAmbienteBar(); pintarXP(); pintarTrabalho(); pintarArquivos(); pintarMotor(); pintarReuniao();
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
      if (viewAtual === 'motor') pintarMotor();
    }, 5000);
    window.addEventListener('beforeunload', () => S.state.gravarJa());
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  S.ui = { toast, folha, fecharFolha, mostrar, pintarTudo, pintarReuniao };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window.S);
