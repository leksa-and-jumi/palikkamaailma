// All block pictures are painted with code (16 × 16 pixels each), so the game
// has no image files to download and no licences to worry about.

import * as THREE from 'three';
import { RENDER } from '../config';
import { TILE_NAMES, getBlockType, type TileName } from '../logic/blocks';
import { ATLAS_COLUMNS, ATLAS_ROWS, tileIndex } from '../logic/atlas';
import { mulberry32 } from '../logic/noise';

const S = RENDER.tilePixels;

type RGB = [number, number, number];
type Pixel = (x: number, y: number, c: RGB, a?: number) => void;
type Painter = (px: Pixel, rnd: () => number) => void;

function vary(c: RGB, rnd: () => number, amount: number): RGB {
  const d = (rnd() - 0.5) * amount;
  return [c[0] + d, c[1] + d, c[2] + d];
}

function noisy(base: RGB, amount: number): Painter {
  return (px, rnd) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, vary(base, rnd, amount));
  };
}

function wool(base: RGB): Painter {
  return (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const knit = (x + (y % 2)) % 2 === 0 ? 10 : -6;
        px(x, y, vary([base[0] + knit, base[1] + knit, base[2] + knit], rnd, 14));
      }
    }
  };
}

function ore(spot: RGB): Painter {
  return (px, rnd) => {
    noisy([125, 125, 125], 26)(px, rnd);
    for (let i = 0; i < 6; i++) {
      const cx = 2 + Math.floor(rnd() * 11);
      const cy = 2 + Math.floor(rnd() * 11);
      px(cx, cy, spot);
      px(cx + 1, cy, vary(spot, rnd, 30));
      px(cx, cy + 1, vary(spot, rnd, 30));
    }
  };
}

/** A polished metal or gem block with a lighter edge and a few sparkles. */
function shiny(base: RGB): Painter {
  return (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
        const light = edge ? 34 : (x + y) % 7 === 0 ? 18 : 0;
        px(x, y, vary([base[0] + light, base[1] + light, base[2] + light], rnd, 10));
      }
    }
  };
}

/** Tree bark with vertical stripes. */
function bark(base: RGB, stripe: RGB, darkSpots: boolean): Painter {
  return (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const isStripe = darkSpots ? rnd() < 0.12 && (y % 3 === 0 || x % 5 === 0) : x % 4 === 0;
        px(x, y, vary(isStripe ? stripe : base, rnd, 14));
      }
    }
  };
}

/** Leaves with little holes. */
function foliage(base: RGB, holes: number): Painter {
  return (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (rnd() < holes) px(x, y, [0, 0, 0], 0);
        else px(x, y, vary(base, rnd, 40));
      }
    }
  };
}

/** Draws a picture from rows of letters; '.' is see-through. */
function sprite(rows: readonly string[], colors: Record<string, RGB>): Painter {
  return (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const c = rows[y]?.[x] ?? '.';
        const color = colors[c];
        if (color) px(x, y, vary(color, rnd, 16));
        else px(x, y, [0, 0, 0], 0);
      }
    }
  };
}

/** Stone (or another base) with a frame, for furnaces and tables. */
function framed(base: RGB, frame: RGB, inside: (px: Pixel, rnd: () => number) => void): Painter {
  return (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
        px(x, y, vary(edge ? frame : base, rnd, 14));
      }
    }
    inside(px, rnd);
  };
}

/** TNT; `flash` > 0 makes it whiter (lit TNT). */
function tntSide(flash: number): Painter {
  return (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const band = y >= 5 && y <= 10;
        const c: RGB = band ? [236, 236, 236] : [206, 52, 40];
        px(x, y, vary(whiter(c, flash), rnd, band ? 10 : 16));
      }
    }
    // "TNT" letters on the white band.
    const letters = ['111.1..1.111', '.1..11.1..1.', '.1..1.11..1.', '.1..1..1..1.'];
    letters.forEach((row, dy) =>
      [...row].forEach((c, dx) => c === '1' && px(dx + 2, dy + 6, whiter([30, 30, 30], flash))),
    );
  };
}

function tntTop(flash: number): Painter {
  return (px, rnd) => {
    noisy(whiter([206, 52, 40], flash), 16)(px, rnd);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) px(x, y, whiter([60, 60, 60], flash));
  };
}

function whiter(c: RGB, amount: number): RGB {
  return [c[0] + (255 - c[0]) * amount, c[1] + (255 - c[1]) * amount, c[2] + (255 - c[2]) * amount];
}

/** Redstone dust: red specks with small gaps. */
function dust(base: RGB): Painter {
  return (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (rnd() < 0.12) px(x, y, [0, 0, 0], 0);
        else px(x, y, vary(base, rnd, 40));
      }
    }
  };
}

/** Redstone lamp: a glass-like grid over the light. */
function redstoneLamp(on: boolean): Painter {
  return (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const frame = x === 0 || y === 0 || x === S - 1 || y === S - 1;
        const grid = x % 5 === 0 || y % 5 === 0;
        const glow = 1 - Math.hypot(x - 7.5, y - 7.5) / 12;
        const c: RGB = frame
          ? on
            ? [150, 96, 50]
            : [92, 58, 34]
          : grid
            ? on
              ? [255, 214, 140]
              : [120, 76, 44]
            : on
              ? [255, 196 + glow * 50, 90 + glow * 90]
              : [150, 90, 50];
        px(x, y, vary(c, rnd, 14));
      }
    }
  };
}

function redstoneTorch(head: RGB): Painter {
  return sprite(
    [
      '................',
      '................',
      '................',
      '................',
      '.......hh.......',
      '......hHHh......',
      '......hHHh......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
    ],
    { h: head, H: whiter(head, 0.35), w: [130, 92, 50] },
  );
}

const GRASS: RGB = [96, 170, 58];
const DIRT: RGB = [134, 96, 67];
const SNOW: RGB = [240, 246, 252];

const PAINTERS: Record<TileName, Painter> = {
  grass_top: noisy(GRASS, 30),
  grass_side: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const fringe = y < 3 || (y === 3 && rnd() < 0.5);
        px(x, y, vary(fringe ? GRASS : DIRT, rnd, 26));
      }
    }
  },
  dirt: noisy(DIRT, 30),
  stone: noisy([125, 125, 125], 26),
  sand: noisy([219, 207, 142], 18),
  water: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wave = Math.sin((x + y * 2) * 0.8) * 8;
        px(x, y, vary([50 + wave, 110 + wave, 210], rnd, 10), 200);
      }
    }
  },
  log_side: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const stripe = x % 4 === 0 ? -22 : 0;
        px(x, y, vary([104 + stripe, 80 + stripe, 48 + stripe], rnd, 16));
      }
    }
  },
  log_top: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const r = Math.hypot(x - 7.5, y - 7.5);
        const bark = r > 6.5;
        const ring = Math.floor(r) % 2 === 0 ? 14 : 0;
        px(x, y, vary(bark ? [104, 80, 48] : [176 + ring, 140 + ring, 86 + ring], rnd, 12));
      }
    }
  },
  leaves: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (rnd() < 0.18) px(x, y, [0, 0, 0], 0);
        else px(x, y, vary([58, 132, 40], rnd, 40));
      }
    }
  },
  planks: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const gap = y % 4 === 3 || (x === (y < 8 ? 5 : 11) && y % 4 !== 3);
        px(x, y, vary(gap ? [120, 88, 52] : [178, 140, 86], rnd, 14));
      }
    }
  },
  glass: (px) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
        const shine = (x === 3 && y >= 3 && y <= 6) || (x === 4 && y === 3);
        if (edge) px(x, y, [200, 230, 240]);
        else if (shine) px(x, y, [255, 255, 255], 200);
        else px(x, y, [0, 0, 0], 0);
      }
    }
  },
  cobble: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const crack = (x + Math.floor(y / 4) * 3) % 5 === 0 || y % 4 === 0;
        px(x, y, vary(crack ? [86, 86, 86] : [140, 140, 140], rnd, 24));
      }
    }
  },
  brick: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const row = Math.floor(y / 4);
        const mortar = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
        px(x, y, vary(mortar ? [200, 196, 188] : [168, 70, 52], rnd, 16));
      }
    }
  },
  snow: noisy(SNOW, 8),
  snow_side: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const top = y < 4 || (y === 4 && rnd() < 0.5);
        px(x, y, vary(top ? SNOW : DIRT, rnd, top ? 8 : 26));
      }
    }
  },
  gold_block: shiny([246, 208, 60]),
  diamond_block: shiny([100, 228, 222]),
  wool_red: wool([196, 50, 46]),
  wool_blue: wool([52, 82, 196]),
  wool_yellow: wool([238, 206, 52]),
  wool_green: wool([70, 160, 60]),
  wool_white: wool([232, 232, 232]),
  wool_black: wool([36, 36, 40]),
  wool_pink: wool([240, 140, 176]),
  wool_orange: wool([236, 128, 40]),
  wool_purple: wool([130, 64, 180]),
  bedrock: noisy([60, 60, 64], 50),
  lamp: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const glow = 1 - Math.hypot(x - 7.5, y - 7.5) / 11;
        px(x, y, vary([255, 220 + glow * 30, 120 + glow * 100], rnd, 20));
      }
    }
  },
  pumpkin_side: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const groove = x % 5 === 0 ? -30 : 0;
        px(x, y, vary([224 + groove, 128 + groove, 26], rnd, 14));
      }
    }
  },
  pumpkin_top: (px, rnd) => {
    noisy([214, 122, 26], 16)(px, rnd);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) px(x, y, [86, 110, 40]);
  },
  tnt_side: tntSide(0),
  tnt_top: tntTop(0),
  coal_ore: ore([40, 40, 40]),
  iron_ore: ore([216, 176, 140]),
  gold_ore: ore([250, 214, 60]),
  diamond_ore: ore([110, 236, 230]),
  redstone_ore: ore([220, 30, 30]),
  lapis_ore: ore([40, 70, 190]),
  emerald_ore: ore([40, 200, 90]),
  sandstone_top: noisy([222, 210, 160], 12),
  sandstone_side: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const band = y < 3 ? 8 : y > 12 ? -16 : y % 4 === 0 ? -8 : 0;
        px(x, y, vary([216 + band, 202 + band, 150 + band], rnd, 10));
      }
    }
  },
  gravel: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const r = rnd();
        const c: RGB = r < 0.3 ? [100, 96, 92] : r < 0.6 ? [140, 134, 128] : [170, 164, 158];
        px(x, y, vary(c, rnd, 12));
      }
    }
  },
  birch_log: bark([226, 226, 218], [40, 40, 40], true),
  birch_leaves: foliage([110, 160, 70], 0.18),
  spruce_log: bark([82, 58, 34], [58, 40, 22], false),
  spruce_leaves: foliage([46, 92, 60], 0.12),
  cactus_side: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const spine = (x === 3 || x === 12) && y % 4 === 1;
        const rib = x % 5 === 0 ? -20 : 0;
        px(x, y, spine ? [230, 230, 200] : vary([70 + rib, 140 + rib, 60 + rib], rnd, 12));
      }
    }
  },
  cactus_top: (px, rnd) => {
    noisy([90, 160, 70], 16)(px, rnd);
    for (let i = 4; i < 12; i++) px(i, i, [60, 120, 50]);
  },
  tall_grass: sprite(
    [
      '................',
      '................',
      '.......g........',
      '..g....g...g....',
      '..g...gg...g....',
      '...g..g...gg....',
      '...g..g...g..g..',
      '.g.g..g..gg..g..',
      '.g.gg.g..g..g...',
      '..g.g.gg.g..g...',
      '..g.g..g.g.gg...',
      '..gg.g.g.ggg....',
      '...g.g.gggg.....',
      '...gggggggg.....',
      '....gggggg......',
      '.....gggg.......',
    ],
    { g: [90, 160, 50] },
  ),
  dandelion: sprite(
    [
      '................',
      '................',
      '................',
      '......yyy.......',
      '.....yyyyy......',
      '.....yyoyy......',
      '.....yyyyy......',
      '......yyy.......',
      '.......g........',
      '.......g..gg....',
      '....gg.g.gg.....',
      '.....ggggg......',
      '.......g........',
      '.......g........',
      '.......g........',
      '.......g........',
    ],
    { y: [250, 220, 40], o: [240, 160, 30], g: [70, 140, 40] },
  ),
  poppy: sprite(
    [
      '................',
      '................',
      '................',
      '.....r.r.r......',
      '....rrrrrrr.....',
      '....rrrkrrr.....',
      '....rrrrrrr.....',
      '.....rrrrr......',
      '.......g........',
      '.......g........',
      '...gg..g........',
      '....gggg..gg....',
      '.......g.gg.....',
      '.......gg.......',
      '.......g........',
      '.......g........',
    ],
    { r: [210, 30, 30], k: [30, 20, 20], g: [70, 140, 40] },
  ),
  dead_bush: sprite(
    [
      '................',
      '................',
      '..b.........b...',
      '...b.......b....',
      '....b..b..b.....',
      '..b..b.b.b..b...',
      '...b..bbb..b....',
      '....b..b..b.....',
      '.....b.b.b......',
      '......bbb.......',
      '.......b........',
      '.......b........',
      '.......b........',
      '.......b........',
      '.......b........',
      '.......b........',
    ],
    { b: [140, 100, 50] },
  ),
  lava: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const swirl = Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) * 30;
        px(x, y, vary([240, 110 + swirl, 20], rnd, 20));
      }
    }
  },
  obsidian: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const glint = rnd() < 0.06 ? 40 : 0;
        px(x, y, vary([28 + glint, 18 + glint, 44 + glint * 1.5], rnd, 10));
      }
    }
  },
  crafting_table_top: (px, rnd) => {
    PAINTERS.planks(px, rnd);
    for (let i = 2; i < 14; i++) {
      px(i, 5, [96, 64, 36]);
      px(i, 10, [96, 64, 36]);
      px(5, i, [96, 64, 36]);
      px(10, i, [96, 64, 36]);
    }
  },
  crafting_table_side: (px, rnd) => {
    PAINTERS.planks(px, rnd);
    for (let x = 0; x < S; x++) px(x, 0, [120, 84, 50]);
    // A saw and a hammer hanging on the side.
    for (let x = 3; x < 8; x++) px(x, 5, [200, 200, 210]);
    for (let y = 4; y < 9; y++) px(11, y, [110, 76, 44]);
    for (let x = 9; x < 14; x++) px(x, 4, [150, 150, 160]);
  },
  crafting_table_front: (px, rnd) => {
    PAINTERS.planks(px, rnd);
    for (let x = 0; x < S; x++) px(x, 0, [120, 84, 50]);
    for (let y = 3; y < 12; y++) px(4, y, [110, 76, 44]);
    for (let x = 2; x < 7; x++) px(x, 3, [150, 150, 160]);
    for (let y = 4; y < 12; y++) px(10 + (y % 2), y, [200, 200, 210]);
  },
  furnace_front: framed([120, 120, 120], [90, 90, 90], (px) => {
    for (let y = 9; y < 14; y++) for (let x = 4; x < 12; x++) px(x, y, [30, 30, 30]);
    for (let x = 5; x < 11; x++) px(x, 12, [230, 120, 30]);
    for (let x = 4; x < 12; x++) px(x, 5, [70, 70, 70]);
  }),
  furnace_side: framed([128, 128, 128], [96, 96, 96], () => undefined),
  furnace_top: noisy([110, 110, 110], 18),
  chest_front: framed([166, 110, 50], [110, 70, 30], (px) => {
    for (let x = 1; x < 15; x++) px(x, 6, [90, 56, 24]);
    for (let y = 5; y < 9; y++) for (let x = 7; x < 9; x++) px(x, y, [210, 210, 210]);
  }),
  chest_side: framed([166, 110, 50], [110, 70, 30], (px) => {
    for (let x = 1; x < 15; x++) px(x, 6, [90, 56, 24]);
  }),
  chest_top: framed([176, 118, 56], [110, 70, 30], () => undefined),
  enchanting_top: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const edge = x < 2 || y < 2 || x > 13 || y > 13;
        px(x, y, edge ? vary([170, 30, 40], rnd, 20) : vary([36, 26, 50], rnd, 12));
      }
    }
    // An open book in the middle.
    for (let y = 5; y < 11; y++)
      for (let x = 3; x < 13; x++) px(x, y, x === 8 ? [120, 80, 40] : [236, 230, 210]);
  },
  enchanting_side: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const top = y < 4;
        px(x, y, top ? vary([170, 30, 40], rnd, 20) : vary([36, 26, 50], rnd, 12));
      }
    }
    for (let i = 0; i < 5; i++) px(2 + i * 3, 7 + (i % 2) * 3, [80, 220, 230]);
  },
  bookshelf: (px, rnd) => {
    const colors: RGB[] = [
      [170, 40, 40],
      [40, 90, 170],
      [60, 140, 60],
      [200, 170, 60],
      [130, 60, 150],
    ];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const shelf = y === 0 || y === 7 || y === 8 || y === 15;
        if (shelf) px(x, y, vary([178, 140, 86], rnd, 12));
        else px(x, y, vary(colors[(x + (y > 7 ? 2 : 0)) % colors.length]!, rnd, 20));
      }
    }
  },
  torch: sprite(
    [
      '................',
      '................',
      '................',
      '................',
      '.......yy.......',
      '......yooy......',
      '......yooy......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
    ],
    { y: [255, 230, 90], o: [255, 150, 40], w: [130, 92, 50] },
  ),
  clay: noisy([160, 166, 180], 12),
  ice: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const crack = (x + y) % 9 === 0;
        px(x, y, vary(crack ? [230, 240, 255] : [150, 190, 245], rnd, 10), 210);
      }
    }
  },
  iron_block: shiny([210, 210, 214]),
  emerald_block: shiny([50, 200, 100]),
  lapis_block: shiny([40, 70, 180]),
  redstone_block: shiny([190, 20, 20]),
  coal_block: shiny([24, 24, 26]),
  sugar_cane: sprite(
    [
      '..g......g......',
      '..g...g..g...g..',
      '..g...g..gg..g..',
      '..G...g..g...g..',
      '..g...G..g...G..',
      '..g...g..G...g..',
      '.gg...g..g...g..',
      '..g...g..g..gg..',
      '..G...g..g...g..',
      '..g..gg..G...g..',
      '..g...G..g...G..',
      '..g...g..g...g..',
      '..g...g..gg..g..',
      '..G...g..g...g..',
      '..g...G..G...g..',
      '..g...g..g...g..',
    ],
    { g: [130, 190, 80], G: [90, 140, 60] },
  ),
  redstone_dust: dust([120, 10, 8]),
  redstone_dust_on: dust([255, 34, 24]),
  lever_stick: noisy([130, 92, 50], 18),
  lever_tip_on: noisy([255, 40, 30], 20),
  redstone_torch: redstoneTorch([255, 40, 30]),
  redstone_torch_off: redstoneTorch([96, 24, 20]),
  redstone_lamp: redstoneLamp(false),
  redstone_lamp_on: redstoneLamp(true),
  launcher_front: framed([120, 120, 120], [90, 90, 90], (px) => {
    // A dark hole where the rockets fly out.
    for (let y = 4; y < 12; y++) {
      for (let x = 4; x < 12; x++) {
        if (Math.hypot(x - 7.5, y - 7.5) < 4) px(x, y, [24, 24, 28]);
      }
    }
  }),
  launcher_side: framed([128, 128, 128], [96, 96, 96], (px) => {
    // A coloured stripe so you can tell it from a furnace.
    const colors: RGB[] = [
      [255, 59, 48],
      [255, 214, 10],
      [52, 199, 89],
      [10, 132, 255],
    ];
    for (let x = 2; x < 14; x++) {
      px(x, 7, colors[Math.floor((x - 2) / 3)]!);
      px(x, 8, colors[Math.floor((x - 2) / 3)]!);
    }
  }),
  tnt_lit_side: tntSide(0.55),
  tnt_lit_top: tntTop(0.55),
};

function paintTile(name: TileName, image: ImageData, ox: number, oy: number): void {
  const rnd = mulberry32(tileIndex(name) * 7919 + 17);
  const width = image.width;
  PAINTERS[name]((x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = ((oy + y) * width + ox + x) * 4;
    image.data[i] = Math.max(0, Math.min(255, c[0]));
    image.data[i + 1] = Math.max(0, Math.min(255, c[1]));
    image.data[i + 2] = Math.max(0, Math.min(255, c[2]));
    image.data[i + 3] = a;
  }, rnd);
}

let atlasCanvas: HTMLCanvasElement | null = null;

/** The atlas image with every tile. Made once. */
export function getAtlasCanvas(): HTMLCanvasElement {
  if (atlasCanvas) return atlasCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLUMNS * S;
  canvas.height = ATLAS_ROWS * S;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(canvas.width, canvas.height);
  TILE_NAMES.forEach((name, i) => {
    paintTile(name, image, (i % ATLAS_COLUMNS) * S, Math.floor(i / ATLAS_COLUMNS) * S);
  });
  ctx.putImageData(image, 0, 0);
  atlasCanvas = canvas;
  return canvas;
}

export function createAtlasTexture(): THREE.Texture {
  const texture = new THREE.CanvasTexture(getAtlasCanvas());
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A small picture of a block for the hotbar: top and two sides like a cube. */
export function drawBlockIcon(canvas: HTMLCanvasElement, blockId: number): void {
  const ctx = canvas.getContext('2d')!;
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  const atlas = getAtlasCanvas();
  const type = getBlockType(blockId);
  const tiles = type.tiles;
  if (type.shape !== 'cube') {
    // Flowers and torches look best as a flat picture.
    const i = tileIndex(tiles.side);
    ctx.drawImage(
      atlas,
      (i % ATLAS_COLUMNS) * S,
      Math.floor(i / ATLAS_COLUMNS) * S,
      S,
      S,
      0,
      0,
      size,
      size,
    );
    return;
  }
  const src = (name: TileName) => {
    const i = tileIndex(name);
    return [(i % ATLAS_COLUMNS) * S, Math.floor(i / ATLAS_COLUMNS) * S] as const;
  };
  const h = size / 2;
  const q = size / 4;

  const face = (
    name: TileName,
    transform: [number, number, number, number, number, number],
    shade: number,
  ) => {
    const [sx, sy] = src(name);
    ctx.save();
    ctx.setTransform(...transform);
    ctx.drawImage(atlas, sx, sy, S, S, 0, 0, S, S);
    ctx.fillStyle = `rgba(0,0,0,${1 - shade})`;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
  };
  const k = h / S;
  // Top (diamond), left side, right side.
  face(tiles.top, [k, k / 2, -k, k / 2, h, 0], 1);
  face(tiles.side, [k, k / 2, 0, k, 0, q], 0.8);
  face(tiles.side, [k, -k / 2, 0, k, h, h], 0.65);
}
