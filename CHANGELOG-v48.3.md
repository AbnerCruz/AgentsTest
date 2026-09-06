# v48.3 — modo jogo (tela cheia, horizontal, salas por departamento)

Nova porta de entrada opcional: `game.html`. Não substitui `index.html`
(mobile) — os dois leem o mesmo estado (mesmo `localStorage`), então
fundar/trabalhar em um aparece no outro.

## O que tem

- **Layout trocável no motor.** `studio.js` ganhou `S.studio.definirLayout(cfg)`:
  posição das mesas, das estações (café, quadro, reunião…), tamanho do chão
  e as zonas de construção agora vêm de um objeto configurável, com o
  comportamento atual como padrão. `index.html`/`ui.js` não chamam essa
  função, então a UI mobile continua exatamente como estava.
- **`game.html` + `game.css` + `game-ui.js`**: tela cheia horizontal, HUD no
  topo (saldo, produtos, equipe, nível, dia desde a fundação, status da IA),
  uma sala por departamento (Gerência, Reunião, Design, Desenvolvimento,
  Marketing, Financeiro, Equipe), painel lateral com missão/posicionamento/
  fundação/primeiro produto, e um dock inferior com chat da gerente, tarefas
  em andamento e atividades recentes.
- **`assets.js`**: carregador de sprites opcional. Tenta buscar
  `./assets/<nome>.png`; se não existir, `get()`/`tint()` devolvem `null` e
  o desenho cai automaticamente no procedural de sempre. Nenhuma imagem é
  obrigatória — o jogo funciona hoje, sem nenhum PNG.
- **Sprite de personagem por tint.** Um único `char_base.png` é recolorido
  por código com a cor já salva de cada funcionário (`p.cor`), então não é
  preciso gerar um sprite por pessoa.
- Nenhum número foi inventado no HUD: tudo vem do estado real (`ambiente.moedas`,
  `arquivos`, `equipe`, `xp`, `log`). Não existe "receita do dia" simulada,
  porque o app não simula vendas — ver LEIAME.

## Assets esperados (opcionais)

Colocar em `./assets/` com esses nomes exatos:
`char_base.png` (32×48), `tile_piso_madeira.png`, `tile_piso_tapete.png`,
`tile_parede.png` (32×32 cada), `mesa.png`, `cadeira.png`, `computador.png`,
`planta.png`, `sofa.png`, `estante.png`, `quadro.png`, `mesa_reuniao.png`.
Fundo transparente, mesmo estilo pixel art top-down em todos.

## Teste

`node teste/layout-jogo.test.js` confirma que o layout de salas posiciona
cada especialidade na sala certa, dentro dos limites do canvas largo, e que
a construção de ambiente (que antes travava nos limites do canvas pequeno)
funciona no layout novo.
