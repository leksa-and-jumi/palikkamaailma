// All block pictures are painted with code (16 × 16 pixels each), so the game
// has no image files to download and no licences to worry about.

import * as THREE from 'three';
import { RENDER } from '../config';
import { TILE_NAMES, getBlockType, type TileName } from '../logic/blocks';
import { ATLAS_COLUMNS, ATLAS_ROWS, tileIndex } from '../logic/atlas';
import { mulberry32 } from '../logic/noise';

const S = RENDER.tilePixels;

type RGB = [number, number, number];
type Painter = (px: (x: number, y: number, c: RGB, a?: number) => void, rnd: () => number) => void;

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
  gold: ore([250, 214, 60]),
  diamond: ore([110, 236, 230]),
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
  tnt_side: (px, rnd) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const band = y >= 5 && y <= 10;
        px(x, y, band ? vary([236, 236, 236], rnd, 10) : vary([206, 52, 40], rnd, 16));
      }
    }
    // "TNT" letters on the white band.
    const letters = ['111.1..1.111', '.1..11.1..1.', '.1..1.11..1.', '.1..1..1..1.'];
    letters.forEach((row, dy) =>
      [...row].forEach((c, dx) => c === '1' && px(dx + 2, dy + 6, [30, 30, 30])),
    );
  },
  tnt_top: (px, rnd) => {
    noisy([206, 52, 40], 16)(px, rnd);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) px(x, y, [60, 60, 60]);
  },
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
  const tiles = getBlockType(blockId).tiles;
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
