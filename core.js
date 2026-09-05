/* ============================================================
   CORE — utilidades, estado e persistência.
   Carregado primeiro; todos os módulos penduram-se em window.S.
   ============================================================ */
window.S = window.S || {};
(function (S) {
  'use strict';

  /* ---------- DOM ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const uid = p => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'arquivo';
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  S.util = { $, $$, esc, uid, clamp, sleep, slug, pick };

  /* ---------- formatação ---------- */
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
  const num = v => Number(v || 0).toLocaleString('pt-BR');
  const compact = v => {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'M';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
    return String(Math.round(n));
  };
  const pct = (v, casas) => (Number(v) || 0).toFixed(casas == null ? 1 : casas).replace('.', ',') + '%';
  const dur = ms => {
    const s = (Number(ms) || 0) / 1000;
    if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + 's';
    const m = Math.floor(s / 60);
    return m < 60 ? m + 'min' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
  };
  const hora = ts => new Date(ts || Date.now()).toTimeString().slice(0, 5);
  const dataHora = ts => new Date(ts || Date.now())
    .toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  S.fmt = { brl, num, compact, pct, dur, hora, dataHora };

  /* ---------- barramento de eventos ----------
     A UI não é redesenhada inteira a cada mudança: cada módulo emite o
     escopo que mexeu e só os painéis daquele escopo são redesenhados. */
  const ouvintes = {};
  S.bus = {
    on(evt, fn) { (ouvintes[evt] = ouvintes[evt] || []).push(fn); },
    emit(evt, dado) { (ouvintes[evt] || []).forEach(fn => { try { fn(dado); } catch (e) { console.error(e); } }); }
  };

  /* ---------- armazenamento ---------- */
  const CHAVE = 'estudio-db-v2';
  const CHAVE_ANTIGA = 'empresas-all';
  let armazenamentoOK = true;

  function lerLocal(k, padrao) {
    try { const v = localStorage.getItem(k); return v == null ? padrao : JSON.parse(v); }
    catch (e) { return padrao; }
  }
  function gravarLocal(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { armazenamentoOK = false; return false; }
  }
  S.local = {
    get: (k, p) => { try { return localStorage.getItem(k) ?? p; } catch (e) { return p; } },
    set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} },
    json: lerLocal, setJson: gravarLocal,
    ok: () => armazenamentoOK
  };

  /* ---------- modelo de dados ---------- */
  const PALETA = ['#E4703E', '#6FA98A', '#D9A441', '#8FA9C9', '#C08BB0', '#B0876B', '#7FA8A3', '#C9553F'];

  const NIVEIS = [0, 120, 320, 700, 1300, 2200, 3600];
  function nivelDe(xp) {
    let n = 1;
    for (let i = 0; i < NIVEIS.length; i++) if ((xp || 0) >= NIVEIS[i]) n = i + 1;
    return n;
  }
  function progressoNivel(xp) {
    const n = nivelDe(xp);
    const base = NIVEIS[n - 1] || 0;
    const topo = NIVEIS[n] != null ? NIVEIS[n] : base + 1600;
    return { nivel: n, base, topo, pct: clamp(((xp - base) / (topo - base)) * 100, 0, 100), falta: Math.max(0, topo - xp) };
  }

  const DB = { estudios: [], atual: null, versao: 2 };
  S.DB = DB;

  function normalizarEstudio(e) {
    if (!e || typeof e !== 'object') return null;
    e.id = e.id || uid('e');
    e.nome = String(e.nome || 'Estúdio');
    e.ramo = String(e.ramo || 'serviços criativos');
    e.missao = String(e.missao || 'Entregar material útil e bem-feito.');
    e.tom = String(e.tom || 'direto e caloroso');
    e.publico = String(e.publico || 'pequenos negócios');
    e.criadoEm = e.criadoEm || Date.now();
    e.xp = Number(e.xp) || 0;
    e.equipe = Array.isArray(e.equipe) ? e.equipe : [];
    e.equipe.forEach((f, i) => {
      f.id = f.id || 'a' + i;
      f.nome = String(f.nome || 'Alguém');
      f.papel = f.papel === 'gerente' ? 'gerente' : 'func';
      f.cargo = String(f.cargo || 'Generalista');
      f.especialidade = f.especialidade || 'geral';
      f.cor = f.cor || PALETA[i % PALETA.length];
      f.energia = Number.isFinite(f.energia) ? f.energia : 80;
      f.humor = Number.isFinite(f.humor) ? f.humor : 68;
      f.entregas = Number(f.entregas) || 0;
      f.memoria = Array.isArray(f.memoria) ? f.memoria.slice(-5) : [];
      f.uso = f.uso || { chamadas: 0, tokens: 0 };
    });
    e.tarefas = Array.isArray(e.tarefas) ? e.tarefas : [];
    e.contratos = Array.isArray(e.contratos) ? e.contratos : [];
    e.arquivos = Array.isArray(e.arquivos) ? e.arquivos : [];
    e.arquivos.forEach(a => {
      a.classe = ['esboco', 'prototipo', 'candidato', 'produto'].includes(a.classe) ? a.classe : 'esboco';
      a.versao = Number(a.versao) || 1;
      a.qualidade = Number.isFinite(a.qualidade) ? a.qualidade : 55;
      a.linhagem = a.linhagem || slug(a.nome);
    });
    e.aprovacoes = Array.isArray(e.aprovacoes) ? e.aprovacoes : [];
    e.decisoes = Array.isArray(e.decisoes) ? e.decisoes : [];
    e.log = Array.isArray(e.log) ? e.log.slice(-160) : [];
    e.uso = e.uso || { chamadas: 0, tokens: 0, entrada: 0, saida: 0, ms: 0 };
    return e;
  }

  function carregar() {
    const bruto = lerLocal(CHAVE, null);
    if (bruto && Array.isArray(bruto.estudios)) {
      DB.estudios = bruto.estudios.map(normalizarEstudio).filter(Boolean);
      DB.atual = bruto.atual || (DB.estudios[0] && DB.estudios[0].id) || null;
    } else {
      migrarV1();
    }
    if (DB.atual && !DB.estudios.some(e => e.id === DB.atual)) DB.atual = DB.estudios[0] ? DB.estudios[0].id : null;
    DB.estudios.forEach(e => S.market && S.market.normalizar(e));
    return DB;
  }

  /* Migração da base antiga ("empresas-all"): ninguém perde o que já
     construiu ao trocar de versão. Campos que não existiam ganham padrão. */
  function migrarV1() {
    const velho = lerLocal(CHAVE_ANTIGA, null);
    if (!velho || !Array.isArray(velho.empresas) || !velho.empresas.length) return;
    DB.estudios = velho.empresas.map(emp => normalizarEstudio({
      id: emp.id, nome: emp.nome, ramo: emp.ramo, missao: emp.missao, tom: emp.tom,
      criadoEm: Date.now(), xp: (emp.arquivos || []).length * 12,
      equipe: (emp.equipe || []).map((f, i) => ({
        id: f.id, nome: f.nome, papel: f.papel, cargo: f.cargo, cor: f.cor,
        especialidade: mapearEspecialidade(f.cargo),
        energia: (f.vitais && f.vitais.energia) || 80,
        humor: (f.vitais && f.vitais.humor) || 65,
        memoria: (f.memoria || []).map(m => (typeof m === 'string' ? m : m.texto)).filter(Boolean)
      })),
      arquivos: (emp.arquivos || []).map(a => ({
        id: a.id, nome: a.nome, tipo: a.tipo, conteudo: a.conteudo,
        classe: a.escopo === 'produto' ? 'produto' : (a.classe === 'candidato-final' ? 'candidato' : (a.classe || 'esboco')),
        versao: a.versao || 1, autor: a.autor, quando: a.quando, criadoEm: Date.now(),
        linhagem: a.linhagem, qualidade: 60, kit: 'legado'
      })),
      negocio: emp.negocio || null,
      log: (emp.log || []).slice(-40).map(l => ({ t: Date.now(), texto: l.text || l.texto || '', tag: 'info' }))
    })).filter(Boolean);
    DB.atual = velho.atual || (DB.estudios[0] && DB.estudios[0].id) || null;
    if (DB.estudios.length) {
      gravar();
      setTimeout(() => S.ui && S.ui.toast(`${DB.estudios.length} estúdio(s) da versão anterior foram importados.`, 'ok'), 900);
    }
  }
  function mapearEspecialidade(cargo) {
    const c = String(cargo || '').toLowerCase();
    if (/cria|design|arte|marca/.test(c)) return 'criacao';
    if (/opera|produ|tec/.test(c)) return 'producao';
    if (/atend|vend|comerc|client/.test(c)) return 'comercial';
    if (/dado|anal|financ/.test(c)) return 'dados';
    return 'geral';
  }

  let timerGravacao = null;
  function gravar() {
    if (timerGravacao) return;
    timerGravacao = setTimeout(() => { timerGravacao = null; gravarJa(); }, 700);
  }
  function gravarJa() {
    const ok = gravarLocal(CHAVE, { versao: 2, atual: DB.atual, estudios: DB.estudios });
    if (!ok) S.bus.emit('storage-falhou');
    return ok;
  }

  const atual = () => DB.estudios.find(e => e.id === DB.atual) || null;

  function registrar(texto, tag, agenteId) {
    const e = atual(); if (!e) return;
    e.log.push({ t: Date.now(), texto: String(texto), tag: tag || 'info', agente: agenteId || null });
    if (e.log.length > 160) e.log.splice(0, e.log.length - 160);
    S.bus.emit('log');
    gravar();
  }

  function ganharXP(qtd, motivo) {
    const e = atual(); if (!e) return;
    const antes = nivelDe(e.xp);
    e.xp = Math.max(0, (e.xp || 0) + (Number(qtd) || 0));
    const depois = nivelDe(e.xp);
    if (depois > antes) {
      registrar(`O estúdio subiu para o nível ${depois}. Novos tipos de entrega foram liberados.`, 'ok');
      S.bus.emit('nivel', depois);
    }
    S.bus.emit('estudio');
    gravar();
  }

  S.state = {
    PALETA, carregar, gravar, gravarJa, atual, registrar, ganharXP,
    nivelDe, progressoNivel, normalizarEstudio, mapearEspecialidade,
    trocar(id) { DB.atual = id; gravarJa(); S.bus.emit('trocou'); },
    remover(id) {
      DB.estudios = DB.estudios.filter(e => e.id !== id);
      if (DB.atual === id) DB.atual = DB.estudios[0] ? DB.estudios[0].id : null;
      gravarJa(); S.bus.emit('trocou');
    },
    apagarTudo() {
      DB.estudios = []; DB.atual = null;
      S.local.del(CHAVE); S.local.del(CHAVE_ANTIGA);
      gravarJa(); S.bus.emit('trocou');
    }
  };

  /* ---------- escritor de ZIP (método "store", sem dependência) ----------
     Serve para exportar o pacote inteiro de um produto pronto para venda.
     Sem compressão: o custo é ~0 e qualquer descompactador abre. */
  const tabelaCRC = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = tabelaCRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(arquivos) {
    const cod = new TextEncoder();
    const partes = [], central = [];
    let deslocamento = 0;
    arquivos.forEach(f => {
      const nome = cod.encode(f.nome);
      const dados = cod.encode(String(f.conteudo == null ? '' : f.conteudo));
      const crc = crc32(dados);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
      local.setUint16(10, 0, true); local.setUint16(12, 0, true);
      local.setUint32(14, crc, true); local.setUint32(18, dados.length, true);
      local.setUint32(22, dados.length, true); local.setUint16(26, nome.length, true);
      local.setUint16(28, 0, true);
      partes.push(new Uint8Array(local.buffer), nome, dados);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
      cen.setUint16(12, 0, true); cen.setUint16(14, 0, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, dados.length, true);
      cen.setUint32(24, dados.length, true); cen.setUint16(28, nome.length, true);
      cen.setUint16(30, 0, true); cen.setUint16(32, 0, true); cen.setUint16(34, 0, true);
      cen.setUint16(36, 0, true); cen.setUint32(38, 0, true);
      cen.setUint32(42, deslocamento, true);
      central.push(new Uint8Array(cen.buffer), nome);
      deslocamento += 30 + nome.length + dados.length;
    });
    const tamCentral = central.reduce((s, p) => s + p.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(4, 0, true); fim.setUint16(6, 0, true);
    fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamCentral, true); fim.setUint32(16, deslocamento, true);
    fim.setUint16(20, 0, true);
    return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/zip' });
  }
  function baixarBlob(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  S.arquivo = { zip, baixarBlob, crc32 };

})(window.S);
