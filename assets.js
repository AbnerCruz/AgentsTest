/* ============================================================
   ASSETS — carregador de sprites, opcional.
   Nada aqui é obrigatório: se um PNG não existe, get()/tint() devolvem
   null e quem desenha usa o fallback procedural. Basta soltar os arquivos
   em ./assets/<nome>.png com os nomes do LEIAME de arte que eles entram
   em uso sozinhos, sem precisar mexer em código.
   ============================================================ */
(function (S) {
  'use strict';

  const NOMES = [
    'char_base',
    'tile_piso_madeira', 'tile_piso_tapete', 'tile_parede',
    'mesa', 'cadeira', 'computador',
    'planta', 'sofa', 'estante', 'quadro', 'mesa_reuniao'
  ];
  const PASTA = './assets/';

  const imagens = {};   // nome -> HTMLImageElement | null (null = tentado e não existe)
  const tintCache = {}; // "nome|cor" -> canvas tingido

  function carregar(nome) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { imagens[nome] = img; resolve(img); };
      img.onerror = () => { imagens[nome] = null; resolve(null); };
      img.src = PASTA + nome + '.png';
    });
  }

  /* Carrega tudo em paralelo, sem bloquear o jogo: os frames seguintes já
     desenham com o que chegou primeiro. */
  const pronto = Promise.all(NOMES.map(carregar));

  function get(nome) { return imagens[nome] || null; }

  /* Recolore um sprite em escala de cinza/neutro para a cor do agente,
     preservando luz e sombra do desenho original. Evita precisar gerar
     um sprite por funcionário: 1 char_base.png serve para a equipe inteira. */
  function tint(nome, cor) {
    const base = get(nome);
    if (!base || !cor) return null;
    const chave = nome + '|' + cor;
    if (tintCache[chave]) return tintCache[chave];
    const c = document.createElement('canvas');
    c.width = base.naturalWidth || base.width;
    c.height = base.naturalHeight || base.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = cor;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    tintCache[chave] = c;
    return c;
  }

  S.assets = {
    NOMES, pronto, get, tint,
    algumCarregado: () => NOMES.some(n => imagens[n]),
    faltando: () => NOMES.filter(n => !imagens[n])
  };
})(window.S);
