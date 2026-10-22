// Builds an endless world from a seed: oceans, beaches, plains, forests,
// deserts, snowy lands, taiga and mountains, with caves, lava and ores below.
// The same seed always gives the same world, so only the changed blocks
// (edits) need to be saved and sent over the network.

import { CHUNK_SIZE, ORES, SEA_LEVEL, TERRAIN, WORLD_HEIGHT } from '../config';
import {
  AIR,
  BEDROCK,
  BIRCH_LEAVES,
  BIRCH_LOG,
  CACTUS,
  CLAY,
  DANDELION,
  DEAD_BUSH,
  DIRT,
  EMERALD_ORE,
  GRASS,
  GRAVEL,
  ICE,
  LAVA,
  LEAVES,
  LOG,
  OBSIDIAN,
  POPPY,
  SAND,
  SANDSTONE,
  SNOW,
  SPRUCE_LEAVES,
  SPRUCE_LOG,
  STONE,
  SUGAR_CANE,
  TALL_GRASS,
  WATER,
  blockIdFromKey,
} from './blocks';
import { createNoise2D, createNoise3D, fbm, hash2, hash3 } from './noise';

/** Index of a block inside a chunk array. y is the slowest axis. */
export function chunkIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

export type Biome =
  'ocean' | 'beach' | 'plains' | 'forest' | 'desert' | 'snowy' | 'taiga' | 'mountains';

/** Finnish names for the biomes (shown in the game). */
export const BIOME_NAMES: Record<Biome, string> = {
  ocean: 'Meri',
  beach: 'Ranta',
  plains: 'Niitty',
  forest: 'Metsä',
  desert: 'Aavikko',
  snowy: 'Lumimaa',
  taiga: 'Havumetsä',
  mountains: 'Vuoret',
};

export interface Column {
  /** y of the highest ground block. */
  height: number;
  biome: Biome;
  /** Cold enough for ice and snow. */
  cold: boolean;
}

export type TreeKind = 'oak' | 'birch' | 'spruce' | 'cactus';

export interface Tree {
  kind: TreeKind;
  /** Trunk height. */
  height: number;
}

const TREE_CHANCE: Record<Biome, number> = {
  ocean: 0,
  beach: 0,
  plains: 0.004,
  forest: 0.045,
  desert: 0.006,
  snowy: 0.006,
  taiga: 0.03,
  mountains: 0.003,
};

const ORE_IDS = ORES.map((o) => ({ ...o, id: blockIdFromKey(o.key)! }));
const COLUMN_CACHE_LIMIT = 120_000;
const LEAF_CORNER_CHANCE = 0.5;
const OBSIDIAN_CHANCE = 0.45;
const EMERALD_CHANCE = 0.0015;
const EMERALD_MAX_Y = 70;
const CLAY_CHANCE = 0.06;
const BEDROCK_LAYERS = 4;
const SUGAR_CANE_CHANCE = 0.25;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export class TerrainGenerator {
  private readonly continent: (x: number, z: number) => number;
  private readonly hills: (x: number, z: number) => number;
  private readonly ridges: (x: number, z: number) => number;
  private readonly temperature: (x: number, z: number) => number;
  private readonly humidity: (x: number, z: number) => number;
  private readonly caveA: (x: number, y: number, z: number) => number;
  private readonly caveB: (x: number, y: number, z: number) => number;
  private readonly caverns: (x: number, y: number, z: number) => number;
  private readonly columns = new Map<number, Column>();

  constructor(readonly seed: number) {
    this.continent = createNoise2D(seed);
    this.hills = createNoise2D(seed ^ 0x5bd1e995);
    this.ridges = createNoise2D(seed ^ 0x1b873593);
    this.temperature = createNoise2D(seed ^ 0x2545f491);
    this.humidity = createNoise2D(seed ^ 0x68e31da4);
    this.caveA = createNoise3D(seed ^ 0x7f4a7c15);
    this.caveB = createNoise3D(seed ^ 0x3c6ef372);
    this.caverns = createNoise3D(seed ^ 0x0b5ad4ec);
  }

  /** Height and biome of a column (cached). */
  column(x: number, z: number): Column {
    const key = (x + 32768) * 65536 + (z + 32768);
    const cached = this.columns.get(key);
    if (cached) return cached;
    if (this.columns.size > COLUMN_CACHE_LIMIT) this.columns.clear();

    const t = TERRAIN;
    const cont = clamp(
      fbm(this.continent, x * t.continentScale, z * t.continentScale, 4) * 1.8,
      -1,
      1,
    );
    const hill = fbm(this.hills, x * t.hillScale, z * t.hillScale, 4);
    const ridge = 1 - Math.abs(fbm(this.ridges, x * t.mountainScale, z * t.mountainScale, 4));
    const mountain = smoothstep(0.62, 0.95, ridge) * smoothstep(0, 0.35, cont);

    const base =
      cont < 0
        ? SEA_LEVEL + t.landHeight + cont * t.continentAmplitude * 1.4
        : SEA_LEVEL + t.landHeight + cont * t.continentAmplitude * 0.6;
    const roughness = 0.4 + 0.6 * Math.max(0, cont);
    const raw = base + hill * t.hillAmplitude * roughness + mountain * t.mountainAmplitude;
    const height = Math.round(clamp(raw, 4, WORLD_HEIGHT - 16));

    const temp = fbm(this.temperature, x * t.temperatureScale, z * t.temperatureScale, 3);
    const hum = fbm(this.humidity, x * t.humidityScale, z * t.humidityScale, 3);
    const cold = temp < -0.3;

    let biome: Biome;
    if (height < SEA_LEVEL - 1) biome = 'ocean';
    else if (height <= SEA_LEVEL + 1) biome = cold ? 'snowy' : 'beach';
    else if (mountain > 0.35 || height > SEA_LEVEL + 28) biome = 'mountains';
    else if (cold) biome = 'snowy';
    else if (temp < -0.1) biome = 'taiga';
    else if (temp > 0.3 && hum < 0.05) biome = 'desert';
    else if (hum > 0.1) biome = 'forest';
    else biome = 'plains';

    const result = { height, biome, cold };
    this.columns.set(key, result);
    return result;
  }

  heightAt(x: number, z: number): number {
    return this.column(x, z).height;
  }

  biomeAt(x: number, z: number): Biome {
    return this.column(x, z).biome;
  }

  /** Is this block hollowed out by a cave? */
  isCave(x: number, y: number, z: number, col: Column): boolean {
    if (y < 1 || y > col.height) return false;
    // Keep the sea floor closed so the oceans don't drain.
    if ((col.biome === 'ocean' || col.height <= SEA_LEVEL + 1) && y > col.height - 6) return false;
    const s = TERRAIN.caveScale;
    const a = this.caveA(x * s, y * s * 1.5, z * s);
    const b = this.caveB(x * s, y * s * 1.5, z * s);
    if (a * a + b * b < TERRAIN.caveSize) return true;
    if (y < TERRAIN.cavernMaxY) {
      const c = TERRAIN.cavernScale;
      const fade = 1 - y / TERRAIN.cavernMaxY;
      if (this.caverns(x * c, y * c * 1.6, z * c) * (0.6 + fade) > TERRAIN.cavernThreshold) {
        return true;
      }
    }
    return false;
  }

  /** The block at (x, y, z) before trees, plants and edits. */
  groundBlock(x: number, y: number, z: number, col: Column): number {
    if (y === 0) return BEDROCK;
    if (y < BEDROCK_LAYERS && hash3(this.seed + 9, x, y, z) < 0.5 / y) return BEDROCK;
    const h = col.height;
    if (y > h) {
      if (y > SEA_LEVEL) return AIR;
      if (y === SEA_LEVEL && col.cold) return ICE;
      return WATER;
    }
    if (this.isCave(x, y, z, col)) return y <= TERRAIN.lavaLevel ? LAVA : AIR;

    const depth = h - y;
    if (depth < TERRAIN.dirtDepth + 1) {
      switch (col.biome) {
        case 'ocean':
          if (depth === 0 && hash2(this.seed + 11, x, z) < CLAY_CHANCE) return CLAY;
          return h > SEA_LEVEL - 8 ? SAND : GRAVEL;
        case 'beach':
          return SAND;
        case 'desert':
          return SAND;
        case 'mountains':
          if (depth === 0 && h >= TERRAIN.snowLine) return SNOW;
          return depth === 0 && hash2(this.seed + 12, x, z) < 0.15 ? GRAVEL : STONE;
        case 'snowy':
          return depth === 0 ? SNOW : DIRT;
        default:
          return depth === 0 ? GRASS : DIRT;
      }
    }
    if (col.biome === 'desert' && depth < TERRAIN.dirtDepth + 5) return SANDSTONE;

    // Obsidian floors under lava lakes.
    if (
      y < TERRAIN.lavaLevel &&
      this.isCave(x, y + 1, z, col) &&
      hash3(this.seed + 13, x, y, z) < OBSIDIAN_CHANCE
    ) {
      return OBSIDIAN;
    }
    // Ores come in small clumps (2 × 2 × 2 grid cells).
    for (let i = 0; i < ORE_IDS.length; i++) {
      const ore = ORE_IDS[i]!;
      if (y <= ore.maxY && hash3(this.seed + 100 + i, x >> 1, y >> 1, z >> 1) < ore.chance) {
        if (hash3(this.seed + 200 + i, x, y, z) < 0.7) return ore.id;
      }
    }
    if (
      col.biome === 'mountains' &&
      y < EMERALD_MAX_Y &&
      hash3(this.seed + 14, x, y, z) < EMERALD_CHANCE
    ) {
      return EMERALD_ORE;
    }
    return STONE;
  }

  /** The tree (or cactus) growing in this column, if any. */
  treeAt(x: number, z: number): Tree | null {
    const col = this.column(x, z);
    const chance = TREE_CHANCE[col.biome];
    if (chance === 0 || hash2(this.seed + 1, x, z) >= chance) return null;
    if (col.biome === 'mountains' && col.height >= TERRAIN.snowLine - 2) return null;
    if (this.isCave(x, col.height, z, col)) return null;
    const r = hash2(this.seed + 2, x, z);
    switch (col.biome) {
      case 'desert':
        return { kind: 'cactus', height: 1 + Math.floor(r * 3) };
      case 'forest':
        return r < 0.3
          ? { kind: 'birch', height: 5 + Math.floor(r * 9) }
          : { kind: 'oak', height: 4 + Math.floor(r * 3) };
      case 'taiga':
      case 'snowy':
      case 'mountains':
        return { kind: 'spruce', height: 6 + Math.floor(r * 4) };
      default:
        return { kind: 'oak', height: 4 + Math.floor(r * 3) };
    }
  }

  /** A flower, grass tuft or dead bush on top of this column, or AIR. */
  plantAt(x: number, z: number): number {
    const col = this.column(x, z);
    const r = hash2(this.seed + 3, x, z);
    switch (col.biome) {
      case 'plains':
        if (r < 0.02) return DANDELION;
        if (r < 0.04) return POPPY;
        return r < 0.3 ? TALL_GRASS : AIR;
      case 'forest':
        if (r < 0.015) return POPPY;
        return r < 0.12 ? TALL_GRASS : AIR;
      case 'taiga':
        return r < 0.06 ? TALL_GRASS : AIR;
      case 'desert':
        return r < 0.012 ? DEAD_BUSH : AIR;
      default:
        return AIR;
    }
  }

  /** Sugar cane: on low dry land right next to water. */
  sugarCaneAt(x: number, z: number): boolean {
    const col = this.column(x, z);
    if (col.cold || col.height !== SEA_LEVEL + 1 || col.biome === 'mountains') return false;
    if (hash2(this.seed + 4, x, z) >= SUGAR_CANE_CHANCE) return false;
    if (this.isCave(x, col.height, z, col)) return false;
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dz]) => this.heightAt(x + dx!, z + dz!) < SEA_LEVEL);
  }

  /** Makes all blocks of one chunk. cx and cz are chunk coordinates. */
  generateChunk(cx: number, cz: number): Uint8Array {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const col = this.column(x, z);
        const top = Math.max(col.height, SEA_LEVEL);
        for (let y = 0; y <= top; y++) {
          blocks[chunkIndex(lx, y, lz)] = this.groundBlock(x, y, z, col);
        }
        // Sugar cane grows on the shore next to water.
        if (this.sugarCaneAt(x, z)) {
          const tall = 1 + Math.floor(hash2(this.seed + 5, x, z) * 3);
          for (let y = col.height + 1; y <= col.height + tall; y++) {
            blocks[chunkIndex(lx, y, lz)] = SUGAR_CANE;
          }
          continue;
        }
        // Plants grow on grass (or sand in the desert) when nothing else is there.
        const plant = col.height > SEA_LEVEL ? this.plantAt(x, z) : AIR;
        if (plant !== AIR && col.height + 1 < WORLD_HEIGHT) {
          const ground = blocks[chunkIndex(lx, col.height, lz)];
          const fits = plant === DEAD_BUSH ? ground === SAND : ground === GRASS;
          if (fits) blocks[chunkIndex(lx, col.height + 1, lz)] = plant;
        }
      }
    }

    // Trees near the chunk can reach into it, so look a bit outside too.
    const r = TERRAIN.treeRadius;
    for (let z = z0 - r; z < z0 + CHUNK_SIZE + r; z++) {
      for (let x = x0 - r; x < x0 + CHUNK_SIZE + r; x++) {
        const tree = this.treeAt(x, z);
        if (tree) this.placeTree(blocks, x0, z0, x, z, tree);
      }
    }
    return blocks;
  }

  private placeTree(
    blocks: Uint8Array,
    x0: number,
    z0: number,
    x: number,
    z: number,
    tree: Tree,
  ): void {
    const ground = this.heightAt(x, z);
    const set = (bx: number, by: number, bz: number, id: number, overwrite: boolean) => {
      const lx = bx - x0;
      const lz = bz - z0;
      if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE) return;
      if (by < 0 || by >= WORLD_HEIGHT) return;
      const i = chunkIndex(lx, by, lz);
      const old = blocks[i]!;
      if (!overwrite && old !== AIR && old !== TALL_GRASS) return;
      blocks[i] = id;
    };
    const topY = ground + tree.height;

    if (tree.kind === 'cactus') {
      for (let y = ground + 1; y <= topY; y++) set(x, y, z, CACTUS, true);
      return;
    }

    const log = tree.kind === 'birch' ? BIRCH_LOG : tree.kind === 'spruce' ? SPRUCE_LOG : LOG;
    const leaves =
      tree.kind === 'birch' ? BIRCH_LEAVES : tree.kind === 'spruce' ? SPRUCE_LEAVES : LEAVES;

    if (tree.kind === 'spruce') {
      // A cone: wide at the bottom, a point at the top.
      const layers = tree.height - 2;
      for (let i = 0; i <= layers; i++) {
        const y = topY + 1 - i;
        // Layers alternate narrow and wide, like a real spruce.
        const radius = i === 0 ? 0 : i % 2 === 1 || i < 4 ? 1 : TERRAIN.treeRadius - 1;
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (radius > 0 && Math.abs(dx) === radius && Math.abs(dz) === radius) continue;
            set(x + dx, y, z + dz, leaves, false);
          }
        }
      }
    } else {
      for (let dy = -2; dy <= 1; dy++) {
        const radius = dy <= -1 ? 2 : 1;
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
            const skip = dy === 1 || hash2(this.seed + 3 + dy, x + dx, z + dz) < LEAF_CORNER_CHANCE;
            if (corner && skip) continue;
            set(x + dx, topY + dy, z + dz, leaves, false);
          }
        }
      }
    }
    for (let y = ground + 1; y <= topY; y++) set(x, y, z, log, true);
    set(x, ground, z, DIRT, true);
  }
}
