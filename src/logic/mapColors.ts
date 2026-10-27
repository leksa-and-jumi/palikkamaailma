// Colours for the map, seen from above like a Minecraft map: every block
// has a colour, and slopes are lighter or darker so hills can be seen.

import { SEA_LEVEL, WORLD_HEIGHT } from '../config';
import { AIR, getBlockType } from './blocks';
import type { Biome, Column } from './terrain';

export type RGB = [number, number, number];

const BY_KEY: Record<string, RGB> = {
  grass: [96, 168, 58],
  dirt: [134, 96, 67],
  stone: [125, 125, 125],
  cobblestone: [118, 118, 118],
  sand: [219, 207, 142],
  sandstone: [214, 200, 140],
  gravel: [136, 128, 124],
  water: [58, 104, 214],
  lava: [230, 100, 20],
  snow: [244, 248, 252],
  ice: [160, 196, 250],
  leaves: [52, 122, 38],
  birch_leaves: [100, 150, 64],
  spruce_leaves: [44, 88, 58],
  log: [110, 82, 50],
  birch_log: [214, 214, 206],
  spruce_log: [80, 58, 34],
  planks: [178, 140, 86],
  cactus: [80, 140, 50],
  clay: [160, 166, 180],
  obsidian: [30, 24, 44],
  bedrock: [60, 60, 64],
  brick: [168, 70, 52],
  glass: [200, 230, 240],
  lamp: [250, 220, 140],
  pumpkin: [220, 130, 30],
  tnt: [206, 52, 40],
};

const WOOL: Record<string, RGB> = {
  red: [196, 50, 46],
  blue: [52, 82, 196],
  yellow: [238, 206, 52],
  green: [70, 160, 60],
  white: [232, 232, 232],
  black: [36, 36, 40],
  pink: [240, 140, 176],
  orange: [236, 128, 40],
  purple: [130, 64, 180],
};

const FALLBACK: RGB = [150, 140, 130];
const cache = new Map<number, RGB | null>();

/** The colour of a block on the map, or null when the map looks through it. */
export function blockColor(id: number): RGB | null {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  const b = getBlockType(id);
  let color: RGB | null;
  if (id === AIR || (!b.solid && !b.liquid && b.light === 0)) color = null;
  else {
    const key = getBlockType(b.item).key;
    color = BY_KEY[key] ?? WOOL[key] ?? (key.includes('oak') ? BY_KEY.planks! : FALLBACK);
    if (b.light > 0 && !BY_KEY[key]) color = [255, 210, 110];
  }
  cache.set(id, color);
  return color;
}

/** What the ground of a biome looks like on the map (for places nobody has seen yet). */
const BIOME_GROUND: Record<Biome, RGB> = {
  ocean: BY_KEY.water!,
  beach: BY_KEY.sand!,
  plains: BY_KEY.grass!,
  forest: [62, 132, 44],
  desert: BY_KEY.sand!,
  snowy: BY_KEY.snow!,
  taiga: [58, 104, 66],
  mountains: BY_KEY.stone!,
  nether: [118, 38, 36],
};

/** The top of a column that is not in memory, from the world's recipe. */
export function columnColor(col: Column): { color: RGB; height: number; depth: number } {
  if (col.height < SEA_LEVEL) {
    return { color: BY_KEY.water!, height: SEA_LEVEL, depth: SEA_LEVEL - col.height };
  }
  const snowCap = col.biome === 'mountains' && col.height > SEA_LEVEL + 40;
  return {
    color: snowCap || col.cold ? BY_KEY.snow! : BIOME_GROUND[col.biome],
    height: col.height,
    depth: 0,
  };
}

/** The highest block the map shows in a column, and its height. */
export function topOf(getBlock: (y: number) => number): { id: number; height: number } {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    const id = getBlock(y);
    if (blockColor(id)) return { id, height: y };
  }
  return { id: AIR, height: 0 };
}

/**
 * Minecraft map shading: higher than the block to the north is lighter,
 * lower is darker. Deep water gets darker too.
 */
export function shade(color: RGB, height: number, northHeight: number, waterDepth = 0): RGB {
  const factor =
    waterDepth > 0
      ? Math.max(0.6, 1 - waterDepth * 0.04)
      : height > northHeight
        ? 1
        : height < northHeight
          ? 0.74
          : 0.87;
  return [color[0] * factor, color[1] * factor, color[2] * factor];
}
