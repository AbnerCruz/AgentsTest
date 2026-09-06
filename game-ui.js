/* ============================================================
   GAME-UI — front-end alternativo em tela cheia horizontal.
   Não substitui a UI mobile (index.html + ui.js): é uma segunda porta
   de entrada para o MESMO estado (mesmo localStorage), então trocar
   entre index.html (jogo) e classico.html (painéis) mostra a mesma empresa.
   ============================================================ */
(function (S) {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  /* ---------- layout do escritório: uma sala por departamento ---------- */
  function hash(str) { let h = 0; for (let i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }

  const SALAS = {
    gerencia:  { id:'gerencia',  nome:'Gerência',      x:10,  y:10,  w:280, h:180 },
    reuniao:   { id:'reuniao',   nome:'Reunião',        x:300, y:10,  w:300, h:180 },
    criacao:   { id:'criacao',   nome:'Design',          x:610, y:10,  w:290, h:180 },
    producao:  { id:'producao',  nome:'Desenvolvimento', x:910, y:10,  w:280, h:180 },
    comercial: { id:'comercial', nome:'Marketing',       x:10,  y:200, w:280, h:180 },
    operacoes: { id:'operacoes', nome:'Operações & Dados', x:300, y:200, w:300, h:180 },
    geral:     { id:'geral',     nome:'Equipe',          x:610, y:200, w:580, h:180 }
  };
  const salaDe = f => (f.papel === 'gerente') ? SALAS.gerencia : (SALAS[f.especialidade] || SALAS.geral);

  function slotEmSala(f, sala) {
    const cols = Math.max(1, Math.floor((sala.w - 60) / 130));
    const rows = Math.max(1, Math.floor((sala.h - 90) / 82));
    const slot = hash(f.id) % (cols * rows);
    const col = slot % cols, row = Math.floor(slot / cols);
    return { x: sala.x + 90 + col * 130, y: sala.y + 70 + row * 82 };
  }

  const GAME_LAYOUT = {
    largura: 1200,
    altura: () => 400,
    salas: Object.values(SALAS).map(s => Object.assign({ cor: '#181E22' }, s)),
    mesa(_i, _total, f) {
      const sala = salaDe(f || {});
      return slotEmSala(f || { id: 'x' }, sala);
    },
    estacoes: {
      cafe:       { x: SALAS.geral.x + 60,  y: SALAS.geral.y + 60,  rotulo: 'café' },
      descanso:   { x: SALAS.geral.x + 200, y: SALAS.geral.y + 60,  rotulo: 'descanso' },
      tv:         { x: SALAS.geral.x + 340, y: SALAS.geral.y + 60,  rotulo: 'televisão' },
      dormitorio: { x: SALAS.geral.x + 480, y: SALAS.geral.y + 60,  rotulo: 'dormitório' },
      quadro:     { x: SALAS.reuniao.x + 90, y: SALAS.reuniao.y + 60, rotulo: 'quadro' },
      reuniao:    { x: SALAS.reuniao.x + 210, y: SALAS.reuniao.y + 60, rotulo: 'mesa de reunião' }
    },
    zonas: {
      trabalho: SALAS.geral, arquivo: SALAS.operacoes, planejamento: SALAS.reuniao,
      convivio: SALAS.geral, bemestar: SALAS.geral, prototipo: SALAS.producao
    },
    limites: { minX: 10, maxX: 1190, minY: 10, maxY: 390 }
  };
  S.studio.definirLayout(GAME_LAYOUT);

  /* ---------- toasts ---------- */
  function toast(msg, tipo) {
    const el = document.createElement('div');
    el.className = 'toast' + (tipo === 'ok' ? ' ok' : tipo === 'erro' ? ' erro' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  /* ---------- modal genérico ---------- */
  function abrirModal(html) { $('#modalCaixa').innerHTML = html; $('#modal').classList.remove('oculto'); }
  function fecharModal() { $('#modal').classList.add('oculto'); $('#modalCaixa').innerHTML = ''; }
  $('#modal').addEventListener('click', ev => { if (ev.target.id === 'modal') fecharModal(); });

  /* ---------- HUD ---------- */
  function pintarHud() {
    const e = S.state.atual();
    if (!e) {
      $('#hudNome').textContent = 'Estúdio';
      $('#hudRamo').textContent = 'nenhuma empresa fundada';
      $('#hudLogo').textContent = 'E';
      $('#hudStats').innerHTML = '';
      $('#vazio').classList.remove('oculto');
      return;
    }
    $('#vazio').classList.add('oculto');
    $('#hudNome').textContent = e.nome;
    $('#hudRamo').textContent = e.ramo;
    $('#hudLogo').textContent = (e.nome || 'E').trim().charAt(0).toUpperCase() || 'E';
    const produtos = e.arquivos.filter(a => a.classe === 'produto').length;
    const dia = Math.max(1, Math.floor((Date.now() - (e.criadoEm || Date.now())) / 86400000) + 1);
    const nivel = S.state.nivelDe(e.xp);
    const orc = S.ai.orcamento ? S.ai.orcamento() : null;
    const stats = [
      ['💰', S.fmt.brl(e.ambiente.moedas), 'saldo'],
      ['📦', produtos, 'produtos'],
      ['🧑‍🤝‍🧑', `${e.equipe.length}`, 'equipe'],
      ['⭐', `nível ${nivel.nivel}`, `${Math.round(nivel.pct)}% do próximo`],
      ['📅', `dia ${dia}`, 'desde a fundação'],
      ['🤖', S.ai.pronta() ? 'ativa' : 'sem chave', orc ? `US$ ${orc.custoPeriodo.toFixed(2)} no ciclo` : '']
    ];
    $('#hudStats').innerHTML = stats.map(([ic, v, l]) => `<div class="hud-stat"><span>${ic}</span><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('');
  }

  /* ---------- rail lateral (identidade) ---------- */
  function pintarRail() {
    const e = S.state.atual(); if (!e) return;
    const id = (e.fundacao && e.fundacao.identidade) || {};
    $('#railNome').textContent = e.nome;
    $('#railPosicionamento').textContent = id.posicionamento || id.slogan || e.missao;
    $('#railMissao').textContent = e.missao;
    $('#railFundacao').textContent = e.fundacao && e.fundacao.estado === 'operacional'
      ? 'Concluída — identidade, plano de negócio e primeiro produto definidos.'
      : 'Em preparação: a gerente está definindo a estratégia.';
    const pr = (e.projetos || []).find(p => p.status === 'ativo') || (e.projetos || [])[0];
    $('#railProduto').textContent = pr ? `${pr.nome} — ${pr.objetivo}` : 'ainda não definido';
  }

  /* ---------- dock: tarefas ---------- */
  function pintarTarefas() {
    const e = S.state.atual(); const el = $('#dockTarefas'); if (!e) { el.innerHTML = ''; return; }
    const abertas = e.tarefas.filter(t => t.status !== 'feita').slice(0, 12);
    el.innerHTML = abertas.length ? abertas.map(t => {
      const p = t.para ? e.equipe.find(f => f.id === t.para) : null;
      return `<div class="item"><b>${esc(t.titulo)}</b><small>${t.status === 'fazendo' ? 'em execução' : 'aguardando'}${p ? ' · ' + esc(p.nome) : ''}</small></div>`;
    }).join('') : '<div class="item"><small>Nenhuma tarefa aberta agora.</small></div>';
  }

  /* ---------- dock: atividades ---------- */
  function pintarLog() {
    const e = S.state.atual(); const el = $('#dockLog'); if (!e) { el.innerHTML = ''; return; }
    const linhas = (e.log || []).slice(-20).reverse();
    el.innerHTML = linhas.length ? linhas.map(l => `<div class="item">${esc(l.texto)}<small>${S.fmt.hora(l.t)}</small></div>`).join('')
      : '<div class="item"><small>Sem atividade registrada ainda.</small></div>';
  }

  /* ---------- dock: chat da gerente ---------- */
  function pintarChat() {
    const e = S.state.atual(); const el = $('#dockGerente'); if (!e) { el.innerHTML = ''; return; }
    const msgs = ((e.reuniao && e.reuniao.mensagens) || []).slice(-24);
    el.innerHTML = msgs.length ? msgs.map(m => `<div class="fala"><b>${esc(m.quem)}:</b> ${esc(m.texto)}</div>`).join('')
      : '<div class="fala"><small>Fale com a equipe pela caixa abaixo.</small></div>';
    el.scrollTop = el.scrollHeight;
  }
  $('#chatEnviar').addEventListener('click', enviarChat);
  $('#chatMsg').addEventListener('keydown', ev => { if (ev.key === 'Enter') enviarChat(); });
  function enviarChat() {
    const input = $('#chatMsg'); const texto = input.value.trim(); if (!texto) return;
    input.value = '';
    S.studio.reuniaoFalar('Você', texto).catch(() => {});
  }

  function pintarTudo() { pintarHud(); pintarRail(); pintarTarefas(); pintarLog(); pintarChat(); }

  /* ---------- fundar empresa ---------- */
  function abrirFundar() {
    abrirModal(`
      <span class="modal-fecha" id="fFechar">✕</span>
      <h2>Fundar empresa</h2>
      <label>Ideia / negócio</label>
      <textarea id="fIdeia" placeholder="ex: editora de fantasia, loja de roupas, agência de conteúdo…"></textarea>
      <label>Objetivo</label>
      <textarea id="fObjetivo" placeholder="o que essa empresa deve alcançar"></textarea>
      <label>Tipo de produto</label>
      <input id="fTipo" placeholder="ex: contos e sagas, camisetas, posts">
      <label>Público</label>
      <input id="fPublico" placeholder="para quem é">
      <label>Restrições / recursos</label>
      <input id="fRestricoes" placeholder="opcional">
      <div class="modal-linha">
        <button id="okFundar" class="botao">Fundar e deixar a gerente decidir</button>
      </div>
    `);
    $('#fFechar').onclick = fecharModal;
    $('#okFundar').onclick = async () => {
      const b = $('#okFundar');
      const d = {
        ideia: $('#fIdeia').value.trim(), objetivo: $('#fObjetivo').value.trim(),
        tipoProduto: $('#fTipo').value.trim(), publico: $('#fPublico').value.trim(),
        restricoes: $('#fRestricoes').value.trim()
      };
      if (!d.ideia && !d.objetivo && !d.tipoProduto) { toast('Informe pelo menos a ideia, o objetivo ou o tipo de produto.', 'erro'); return; }
      b.disabled = true; b.textContent = 'Criando empresa…';
      try {
        const e = S.studio.fundar(d);
        await S.studio.processarFundacaoAtual(true);
        fecharModal();
        const ok = e.fundacao && e.fundacao.estado === 'operacional';
        toast(ok ? 'Empresa fundada. A gerente definiu a estratégia e montou a equipe.' : 'Empresa criada. A gerente concluirá a fundação quando a IA estiver disponível.', ok ? 'ok' : 'info');
      } catch (err) {
        b.disabled = false; b.textContent = 'Fundar e deixar a gerente decidir';
        toast(err.message || 'Falha ao fundar a empresa.', 'erro');
      }
    };
  }
  $('#btnFundar').addEventListener('click', abrirFundar);

  /* ---------- configurar motor de IA ---------- */
  function abrirConfig() {
    const cfg = S.ai.cfg, orc = S.ai.orcamento();
    abrirModal(`
      <span class="modal-fecha" id="cFechar">✕</span>
      <h2>Motor de IA · OpenRouter</h2>
      <label>Chave da API</label>
      <input id="cChave" type="password" placeholder="${S.ai.temChave() ? S.ai.chaveMascarada() : 'sk-or-...'}">
      <label>Modelo de imagem</label>
      <select id="cImagem">${(S.ai.MODELOS_IMAGEM||[]).map(m=>`<option value="${m.id}" ${cfg.imagem===m.id?'selected':''}>${esc(m.nome)}</option>`).join('')}</select>
      <p style="font-size:11.5px;color:var(--texto-fraco);margin:0 0 8px">Só é usado quando uma tarefa pede arte visual.</p>
      <label>Orçamento do ciclo de 30 dias (US$)</label>
      <input id="cOrcamento" type="number" min="0.10" step="0.10" value="${cfg.orcamentoUSD}">
      <label>Status</label>
      <p style="font-size:12.5px;color:var(--texto-fraco);margin:0;">${esc(S.ai.estado.texto || '—')} · gasto no ciclo: US$ ${orc.custoPeriodo.toFixed(2)} de US$ ${orc.orcamentoUSD.toFixed(2)}</p>
      <div class="modal-linha">
        <button id="okConfig" class="botao">Salvar</button>
        <button id="cCancelar" class="botao fraco">Fechar</button>
      </div>
    `);
    $('#cFechar').onclick = $('#cCancelar').onclick = fecharModal;
    $('#okConfig').onclick = () => {
      try {
        const chave = $('#cChave').value.trim();
        S.ai.salvarCfg(chave || undefined, cfg.pensamento, cfg.producao, undefined, Number($('#cOrcamento').value) || cfg.orcamentoUSD, undefined, undefined, cfg.modoOrcamento, undefined, $('#cImagem').value);
        toast('Configuração salva.', 'ok');
        fecharModal(); pintarHud();
      } catch (err) { toast(err.message || 'Não foi possível salvar.', 'erro'); }
    };
  }
  $('#btnConfig').addEventListener('click', abrirConfig);
  $('#btnMenu').addEventListener('click', () => { location.href = 'classico.html'; });

  /* ---------- resize / canvas ---------- */
  function ajustar() { S.studio.ajustarCanvas(); }
  window.addEventListener('resize', ajustar);

  /* ---------- boot ---------- */
  function iniciar() {
    S.state.carregar();
    S.ai.iniciar();
    S.studio.montar();
    ajustar();
    pintarTudo();
    S.bus.on('estudio', () => { pintarHud(); pintarRail(); ajustar(); });
    S.bus.on('trabalho', pintarTarefas);
    S.bus.on('log', pintarLog);
    S.bus.on('reuniao', pintarChat);
    S.bus.on('equipe', pintarHud);
    S.bus.on('arquivos', pintarHud);
    S.bus.on('trocou', () => { S.studio.montar(); ajustar(); pintarTudo(); });
    S.bus.on('ia', pintarHud);
    setInterval(pintarHud, 5000);
    window.addEventListener('beforeunload', () => S.state.gravarJa());
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window.S);
