// Little 16 × 16 pictures for items that are not blocks (tools, food,
// materials), drawn with code from letter patterns. Blocks use the block
// texture as a small cube instead.

import { RENDER } from '../config';
import { getItem, type ArmorMaterial, type Tier } from '../logic/items';
import { drawBlockIcon } from './textures';

type RGB = [number, number, number];
const S = RENDER.tilePixels;

const HANDLE: RGB = [120, 84, 46];
const TIER_COLOR: Record<Tier, RGB> = {
  wood: [168, 128, 74],
  stone: [130, 130, 130],
  iron: [222, 222, 226],
  gold: [250, 214, 60],
  diamond: [90, 230, 220],
};
const ARMOR_COLOR: Record<ArmorMaterial, RGB> = {
  leather: [150, 90, 50],
  iron: [214, 214, 220],
  gold: [246, 206, 56],
  diamond: [80, 220, 214],
};

// h = head (tool material), s = stick, o = outline.
const TOOL_PATTERNS: Record<string, string[]> = {
  pickaxe: [
    '................',
    '....hhhhhhh.....',
    '...hhhhhhhhh....',
    '..hh...s...hh...',
    '..h....s....h...',
    '.......s........',
    '.......s........',
    '.......s........',
    '.......s........',
    '.......s........',
    '.......s........',
    '.......s........',
    '.......s........',
    '.......s........',
    '................',
    '................',
  ],
  axe: [
    '................',
    '......hhh.......',
    '.....hhhhs......',
    '.....hhhhs......',
    '......hh.s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '................',
    '................',
    '................',
  ],
  shovel: [
    '................',
    '.......hh.......',
    '......hhhh......',
    '......hhhh......',
    '......hhhh......',
    '.......ss.......',
    '.......s........',
    '.......s........',
    '.......s........',
    '.......s........',
    '.......s........',
    '.......s........',
    '......sss.......',
    '................',
    '................',
    '................',
  ],
  sword: [
    '..............hh',
    '.............hhh',
    '............hhh.',
    '...........hhh..',
    '..........hhh...',
    '.........hhh....',
    '........hhh.....',
    '...s...hhh......',
    '....s.hhh.......',
    '.....shh........',
    '.....ss.........',
    '....s..s........',
    '...s............',
    '..s.............',
    '................',
    '................',
  ],
  hoe: [
    '................',
    '.....hhhhh......',
    '.....hh..s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '.........s......',
    '................',
    '................',
    '................',
  ],
};

const ARMOR_PATTERNS: Record<string, string[]> = {
  head: [
    '................',
    '................',
    '................',
    '....aaaaaaaa....',
    '...aaaaaaaaaa...',
    '...aaaaaaaaaa...',
    '...aaa....aaa...',
    '...aa......aa...',
    '...aa......aa...',
    '................',
  ],
  chest: [
    '................',
    '..aaa......aaa..',
    '..aaaaa..aaaaa..',
    '..aaaaaaaaaaaa..',
    '...aaaaaaaaaa...',
    '....aaaaaaaa....',
    '....aaaaaaaa....',
    '....aaaaaaaa....',
    '....aaaaaaaa....',
    '....aaaaaaaa....',
    '....aaaaaaaa....',
    '................',
  ],
  legs: [
    '................',
    '....aaaaaaaa....',
    '....aaaaaaaa....',
    '....aaa..aaa....',
    '....aaa..aaa....',
    '....aaa..aaa....',
    '....aa....aa....',
    '....aa....aa....',
    '....aa....aa....',
    '....aa....aa....',
    '................',
  ],
  feet: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '...aa......aa...',
    '...aa......aa...',
    '...aa......aa...',
    '..aaa......aaa..',
    '.aaaa......aaaa.',
    '................',
  ],
};

interface Sprite {
  rows: readonly string[];
  colors: Record<string, RGB>;
}

const GEM = [
  '.....gggg......',
  '....gwgggg.....',
  '...gwggggGg....',
  '..gggggggGGg...',
  '...gggggGGg....',
  '....ggggGg.....',
  '.....gggg......',
];
const INGOT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....wwwwwwww....',
  '...gwwggggggg...',
  '..ggggggggggGG..',
  '..gggggggggGGG..',
  '...GGGGGGGGGG...',
];
const LUMP = [
  '................',
  '................',
  '................',
  '.....gggg.......',
  '....gggGgg......',
  '...ggGgggGgg....',
  '...gggggggggg...',
  '...ggGgggGggg...',
  '....ggggggGg....',
  '.....gggggg.....',
];
const DUST = [
  '................',
  '................',
  '.......g........',
  '....g.ggg..g....',
  '...ggggGggg.....',
  '..gggGgggggg....',
  '...ggggggGgg....',
  '....gg.gg.g.....',
];
const MEAT = [
  '................',
  '................',
  '................',
  '.....mmmmm......',
  '....mmmmmmmw....',
  '...mmmmmmmmww...',
  '...mmmmmmmmw....',
  '....mmmmmmm.....',
  '.....mmmmm......',
];

const SPRITES: Record<string, Sprite> = {
  stick: {
    rows: [
      '.............s..',
      '............s...',
      '...........s....',
      '..........s.....',
      '.........s......',
      '........s.......',
      '.......s........',
      '......s.........',
      '.....s..........',
      '....s...........',
      '...s............',
    ],
    colors: { s: HANDLE },
  },
  coal: { rows: LUMP, colors: { g: [40, 40, 40], G: [70, 70, 70] } },
  minecart: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      'g..............g',
      'gG............Gg',
      'gGGGGGGGGGGGGGGg',
      'gGddddddddddddGg',
      'gGddddddddddddGg',
      '.gGGGGGGGGGGGGg.',
      '..gggggggggggg..',
      '...ww......ww...',
      '..wwww....wwww..',
      '...ww......ww...',
      '................',
    ],
    colors: { g: [120, 124, 132], G: [170, 174, 182], d: [80, 82, 88], w: [40, 40, 44] },
  },
  slime_ball: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '......gggg......',
      '....ggwwgggg....',
      '...ggwwggggGg...',
      '...gggggggGGg...',
      '...ggggggGGGg...',
      '....gggGGGGg....',
      '......gggg......',
    ],
    colors: { g: [110, 196, 90], G: [70, 150, 60], w: [200, 250, 190] },
  },
  charcoal: { rows: LUMP, colors: { g: [60, 48, 36], G: [90, 74, 56] } },
  raw_iron: { rows: LUMP, colors: { g: [200, 160, 130], G: [160, 120, 96] } },
  raw_gold: { rows: LUMP, colors: { g: [240, 196, 50], G: [200, 150, 30] } },
  iron_ingot: {
    rows: INGOT,
    colors: { g: [210, 210, 214], G: [160, 160, 166], w: [250, 250, 250] },
  },
  gold_ingot: { rows: INGOT, colors: { g: [246, 206, 56], G: [210, 160, 30], w: [255, 246, 180] } },
  diamond: { rows: GEM, colors: { g: [90, 230, 220], G: [40, 170, 170], w: [220, 255, 255] } },
  emerald: { rows: GEM, colors: { g: [50, 210, 100], G: [20, 150, 60], w: [200, 255, 210] } },
  lapis_lazuli: { rows: LUMP, colors: { g: [40, 70, 190], G: [80, 120, 230] } },
  redstone: { rows: DUST, colors: { g: [200, 20, 20], G: [255, 80, 80] } },
  gunpowder: { rows: DUST, colors: { g: [90, 90, 90], G: [140, 140, 140] } },
  flint: { rows: GEM, colors: { g: [60, 60, 66], G: [30, 30, 34], w: [140, 140, 150] } },
  string: {
    rows: [
      '................',
      '..ww............',
      '...ww...........',
      '....ww....ww....',
      '.....ww..w..w...',
      '......www....w..',
      '.............w..',
      '............w...',
    ],
    colors: { w: [240, 240, 240] },
  },
  feather: {
    rows: [
      '.............ww.',
      '............www.',
      '...........wwww.',
      '..........wwww..',
      '.........wwww...',
      '........wwww....',
      '.......wwww.....',
      '......wwww......',
      '.....s..........',
      '....s...........',
    ],
    colors: { w: [245, 245, 245], s: [200, 200, 200] },
  },
  leather: {
    rows: [
      '................',
      '...llllllllll...',
      '..llllllllllll..',
      '..llllllllllll..',
      '...llllllllll...',
      '...llllllllll...',
      '..llllllllllll..',
      '...ll.llll.ll...',
    ],
    colors: { l: [160, 96, 54] },
  },
  paper: {
    rows: [
      '................',
      '...pppppppppp...',
      '...pppppppppp...',
      '...pppppppppp...',
      '...pppppppppp...',
      '...pppppppppp...',
      '...pppppppppp...',
      '...pppppppppp...',
      '...pppppppppp...',
    ],
    colors: { p: [240, 236, 220] },
  },
  book: {
    rows: [
      '................',
      '...bbbbbbbbbb...',
      '...bbbbbbbbbp...',
      '...bbbbbbbbbp...',
      '...bbbbbbbbbp...',
      '...bbbbbbbbbp...',
      '...bbbbbbbbbp...',
      '...bbbbbbbbbp...',
      '...bbbbbbbbbb...',
    ],
    colors: { b: [140, 70, 30], p: [240, 236, 220] },
  },
  enchanted_book: {
    rows: [
      '................',
      '...bbbbbbbbbb...',
      '...bbbwbbbbbp...',
      '...bbbbbbwbbp...',
      '...bwbbbbbbbp...',
      '...bbbbwbbbbp...',
      '...bbbbbbbwbp...',
      '...bbwbbbbbbp...',
      '...bbbbbbbbbb...',
    ],
    colors: { b: [120, 50, 170], p: [240, 236, 220], w: [230, 200, 255] },
  },
  bone: {
    rows: [
      '................',
      '.ww.............',
      'wwww............',
      '.wwww...........',
      '...www..........',
      '....www.........',
      '.....www........',
      '......www.......',
      '.......wwww.....',
      '........wwww....',
      '.........ww.....',
    ],
    colors: { w: [236, 232, 220] },
  },
  arrow: {
    rows: [
      '.............hh.',
      '............hhh.',
      '...........shh..',
      '..........s.....',
      '.........s......',
      '........s.......',
      '.......s........',
      '......s.........',
      '..f..s..........',
      '..ffs...........',
      '..fff...........',
    ],
    colors: { h: [150, 150, 150], s: HANDLE, f: [240, 240, 240] },
  },
  bow: {
    rows: [
      '........sss.....',
      '.......s...w....',
      '......s.....w...',
      '.....s.......w..',
      '....s.........w.',
      '....s.........w.',
      '....s.........w.',
      '.....s.......w..',
      '......s.....w...',
      '.......s...w....',
      '........sss.....',
    ],
    colors: { s: HANDLE, w: [230, 230, 230] },
  },
  bucket: {
    rows: [
      '................',
      '................',
      '..mmmmmmmmmmmm..',
      '..m..........m..',
      '..mm........mm..',
      '...m........m...',
      '...mm......mm...',
      '....mmmmmmmm....',
    ],
    colors: { m: [200, 200, 206] },
  },
  water_bucket: {
    rows: [
      '................',
      '................',
      '..mmmmmmmmmmmm..',
      '..mwwwwwwwwwwm..',
      '..mmwwwwwwwwmm..',
      '...m........m...',
      '...mm......mm...',
      '....mmmmmmmm....',
    ],
    colors: { m: [200, 200, 206], w: [60, 110, 220] },
  },
  lava_bucket: {
    rows: [
      '................',
      '................',
      '..mmmmmmmmmmmm..',
      '..mllllllllllm..',
      '..mmllllllllmm..',
      '...m........m...',
      '...mm......mm...',
      '....mmmmmmmm....',
    ],
    colors: { m: [200, 200, 206], l: [240, 120, 20] },
  },
  apple: {
    rows: [
      '.......s........',
      '.......sll......',
      '....rr.s.rr.....',
      '...rrrrrrrrr....',
      '..rrrwrrrrrrr...',
      '..rrrrrrrrrrr...',
      '..rrrrrrrrrrr...',
      '...rrrrrrrrr....',
      '....rrr.rrr.....',
    ],
    colors: { s: HANDLE, l: [80, 160, 50], r: [210, 30, 30], w: [255, 140, 140] },
  },
  golden_apple: {
    rows: [
      '.......s........',
      '.......sll......',
      '....yy.s.yy.....',
      '...yyyyyyyyy....',
      '..yyywyyyyyyy...',
      '..yyyyyyyyyyy...',
      '..yyyyyyyyyyy...',
      '...yyyyyyyyy....',
      '....yyy.yyy.....',
    ],
    colors: { s: HANDLE, l: [80, 160, 50], y: [250, 210, 60], w: [255, 250, 200] },
  },
  bread: {
    rows: [
      '................',
      '................',
      '.....bbbbbb.....',
      '...bbBbbBbbbb...',
      '..bbbbbbbbbbbb..',
      '..bbbbbbbbbbbb..',
      '...bbbbbbbbbb...',
    ],
    colors: { b: [200, 140, 60], B: [240, 200, 120] },
  },
  porkchop: { rows: MEAT, colors: { m: [240, 140, 140], w: [255, 230, 230] } },
  cooked_porkchop: { rows: MEAT, colors: { m: [180, 110, 60], w: [230, 200, 160] } },
  beef: { rows: MEAT, colors: { m: [200, 40, 40], w: [255, 220, 220] } },
  cooked_beef: { rows: MEAT, colors: { m: [110, 60, 30], w: [180, 130, 90] } },
  chicken: { rows: MEAT, colors: { m: [250, 200, 180], w: [255, 255, 255] } },
  cooked_chicken: { rows: MEAT, colors: { m: [200, 140, 70], w: [240, 220, 180] } },
  mutton: { rows: MEAT, colors: { m: [210, 60, 60], w: [250, 250, 250] } },
  cooked_mutton: { rows: MEAT, colors: { m: [140, 70, 40], w: [220, 200, 170] } },
  rotten_flesh: { rows: MEAT, colors: { m: [120, 150, 60], w: [170, 90, 60] } },
  wheat: {
    rows: [
      '..........y.....',
      '........y.y.y...',
      '.......yyyy.....',
      '......yyyy.y....',
      '.....yyy........',
      '....yy..........',
      '...g............',
      '..g.............',
      '.g..............',
    ],
    colors: { y: [220, 190, 70], g: [130, 150, 60] },
  },
  egg: {
    rows: [
      '................',
      '......eeee......',
      '.....eeeeee.....',
      '....eeeeeeee....',
      '....eeeeeeee....',
      '....eeeeeeee....',
      '.....eeeeee.....',
      '......eeee......',
    ],
    colors: { e: [240, 230, 200] },
  },
  flint_and_steel: {
    rows: [
      '................',
      '..mmmm..........',
      '.m....m.........',
      '.m.....m........',
      '..m.....m.......',
      '...mm....m......',
      '.....m...m...f..',
      '......mmm...fff.',
      '...........fffff',
      '............fff.',
      '.............f..',
    ],
    colors: { m: [200, 200, 206], f: [60, 60, 66] },
  },
  lever: {
    rows: [
      '................',
      '.....r..........',
      '.....s..........',
      '......s.........',
      '......s.........',
      '.......s........',
      '.......s........',
      '........s.......',
      '....cccccccc....',
      '....cccccccc....',
      '....cccccccc....',
    ],
    colors: { s: HANDLE, r: [130, 92, 50], c: [130, 130, 130] },
  },
  button: {
    rows: [
      '................',
      '....bbbbbbbb....',
      '...bwwwwwwwwb...',
      '..bwwwwwwwwwwb..',
      '..bbbbbbbbbbbb..',
      '..bbbbbbbbbbbb..',
      '..BBBBBBBBBBBB..',
      '................',
    ],
    colors: { b: [140, 140, 140], w: [185, 185, 185], B: [95, 95, 95] },
  },
  firework_rocket: rocket([255, 59, 48]),
  firework_big: rocket([10, 132, 255]),
  firework_star: rocket([255, 214, 10]),
  firework_creeper: rocket([52, 199, 89]),
  firework_heart: rocket([255, 79, 139]),
};

/** A paper rocket with a coloured top and a stick. */
function rocket(top: RGB): Sprite {
  return {
    rows: [
      '.......tt.......',
      '......tttt......',
      '......pppp......',
      '......pPpp......',
      '......pppp......',
      '......pppP......',
      '......pppp......',
      '.......s........',
      '.......s........',
      '.......s........',
      '.......s........',
      '.......s........',
    ],
    colors: { t: top, p: [235, 225, 205], P: [200, 60, 50], s: HANDLE },
  };
}

function spriteFor(id: number): Sprite | null {
  const item = getItem(id);
  if (!item) return null;
  if (item.tool) {
    return {
      rows: TOOL_PATTERNS[item.tool.kind]!,
      colors: { h: TIER_COLOR[item.tool.tier], s: HANDLE },
    };
  }
  if (item.armor) {
    return {
      rows: ARMOR_PATTERNS[item.armor.slot]!,
      colors: { a: ARMOR_COLOR[item.armor.material] },
    };
  }
  return SPRITES[item.key] ?? null;
}

const cache = new Map<number, HTMLCanvasElement>();

function spriteCanvas(id: number): HTMLCanvasElement | null {
  const cached = cache.get(id);
  if (cached) return cached;
  const sprite = spriteFor(id);
  if (!sprite) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const top = Math.floor((S - sprite.rows.length) / 2);
  sprite.rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      const color = sprite.colors[c];
      if (!color) return;
      ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
      ctx.fillRect(x, y + top, 1, 1);
    });
  });
  cache.set(id, canvas);
  return canvas;
}

/** Draws any item (block or not) into a square canvas. */
export function drawItemIcon(canvas: HTMLCanvasElement, id: number): void {
  const item = getItem(id);
  // Levers, buttons and redstone dust have their own little pictures.
  if (item?.block !== undefined && !SPRITES[item.key]) {
    drawBlockIcon(canvas, item.block);
    return;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const sprite = spriteCanvas(id);
  if (sprite) ctx.drawImage(sprite, 0, 0, canvas.width, canvas.height);
}

/** The sprite canvas for a non-block item (for 3D drops). */
export function itemSpriteCanvas(id: number): HTMLCanvasElement | null {
  return spriteCanvas(id);
}
