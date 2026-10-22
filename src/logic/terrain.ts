// Builds the island: hills, lakes, beaches, snowy mountains, trees and ores.
// The same seed always gives the same world, so only the changed blocks
// (edits) need to be saved and sent over the network.

import { CHUNK_SIZE, SEA_LEVEL, TERRAIN, WORLD_HEIGHT, WORLD_SIZE } from '../config';
import {
  AIR,
  BEDROCK,
  DIAMOND,
  DIRT,
  GOLD,
  GRASS,
  LEAVES,
  LOG,
  SAND,
  SNOW,
  STONE,
  WATER,
} from './blocks';
import { createNoise2D, fbm, hash2 } from './noise';

/** Index of a block inside a chunk array. y is the slowest axis. */
export function chunkIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

const ORE_GOLD_CHANCE = 0.006;
const ORE_DIAMOND_CHANCE = 0.003;
const ORE_DIAMOND_MAX_Y = 14;
const BEACH_HEIGHT = SEA_LEVEL + 1;
const SHORE_NOISE = 8;
const LEAF_CORNER_CHANCE = 0.5;

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export class TerrainGenerator {
  private readonly hills: (x: number, z: number) => number;
  private readonly mountains: (x: number, z: number) => number;
  private readonly shore: (x: number, z: number) => number;
  private readonly heights = new Map<number, number>();

  constructor(readonly seed: number) {
    this.hills = createNoise2D(seed);
    this.mountains = createNoise2D(seed ^ 0x5bd1e995);
    this.shore = createNoise2D(seed ^ 0x1b873593);
  }

  /** The y of the highest ground block in a column. */
  heightAt(x: number, z: number): number {
    const key = x * 100_003 + z;
    const cached = this.heights.get(key);
    if (cached !== undefined) return cached;

    const half = WORLD_SIZE / 2;
    const dx = (x + 0.5 - half) / half;
    const dz = (z + 0.5 - half) / half;
    // A rounded square: between a square and a circle.
    const r = Math.max(Math.abs(dx), Math.abs(dz)) * 0.5 + Math.hypot(dx, dz) * 0.5;
    const edgeDistance = (1 - r) * half + this.shore(x / 24, z / 24) * SHORE_NOISE;
    const land = smoothstep(edgeDistance / TERRAIN.shoreWidth);

    const hill = fbm(this.hills, x * TERRAIN.hillScale, z * TERRAIN.hillScale, 4);
    const mountain = Math.max(
      0,
      fbm(this.mountains, x * TERRAIN.mountainScale, z * TERRAIN.mountainScale, 3),
    );
    const landHeight =
      TERRAIN.baseHeight +
      hill * TERRAIN.hillAmplitude +
      Math.pow(mountain * 1.6, 1.5) * TERRAIN.mountainAmplitude;

    const height = Math.round(TERRAIN.seaFloor + (landHeight - TERRAIN.seaFloor) * land);
    const clamped = Math.min(WORLD_HEIGHT - 12, Math.max(1, height));
    this.heights.set(key, clamped);
    return clamped;
  }

  /** Trunk height of a tree growing in this column, or 0 for no tree. */
  treeAt(x: number, z: number): number {
    const margin = TERRAIN.treeRadius;
    if (x < margin || z < margin || x >= WORLD_SIZE - margin || z >= WORLD_SIZE - margin) return 0;
    if (hash2(this.seed + 1, x, z) >= TERRAIN.treeChance) return 0;
    const h = this.heightAt(x, z);
    if (h <= BEACH_HEIGHT || h >= TERRAIN.snowLine - 2) return 0;
    const range = TERRAIN.treeMaxHeight - TERRAIN.treeMinHeight + 1;
    return TERRAIN.treeMinHeight + Math.floor(hash2(this.seed + 2, x, z) * range);
  }

  /** Ground block at (x, y, z) before trees and edits. */
  groundBlock(x: number, y: number, z: number, height: number): number {
    if (y === 0) return BEDROCK;
    if (y > height) return y <= SEA_LEVEL ? WATER : AIR;
    const beach = height <= BEACH_HEIGHT;
    if (y === height) {
      if (beach) return SAND;
      if (height >= TERRAIN.snowLine) return SNOW;
      return GRASS;
    }
    if (y > height - TERRAIN.dirtDepth) return beach ? SAND : DIRT;
    const ore = hash2(this.seed ^ Math.imul(y, 0x9e3779b1), x, z);
    if (y <= ORE_DIAMOND_MAX_Y && ore < ORE_DIAMOND_CHANCE) return DIAMOND;
    if (ore < ORE_DIAMOND_CHANCE + ORE_GOLD_CHANCE) return GOLD;
    return STONE;
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
        const height = this.heightAt(x, z);
        const top = Math.max(height, SEA_LEVEL);
        for (let y = 0; y <= top; y++) {
          blocks[chunkIndex(lx, y, lz)] = this.groundBlock(x, y, z, height);
        }
      }
    }

    // Trees near the chunk can reach into it, so look a bit outside too.
    const r = TERRAIN.treeRadius;
    for (let z = z0 - r; z < z0 + CHUNK_SIZE + r; z++) {
      for (let x = x0 - r; x < x0 + CHUNK_SIZE + r; x++) {
        const trunk = this.treeAt(x, z);
        if (trunk > 0) this.placeTree(blocks, x0, z0, x, z, trunk);
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
    trunk: number,
  ): void {
    const ground = this.heightAt(x, z);
    const set = (bx: number, by: number, bz: number, id: number, onlyAir: boolean) => {
      const lx = bx - x0;
      const lz = bz - z0;
      if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE) return;
      if (by < 0 || by >= WORLD_HEIGHT) return;
      const i = chunkIndex(lx, by, lz);
      if (onlyAir && blocks[i] !== AIR) return;
      blocks[i] = id;
    };

    const topY = ground + trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const radius = dy <= -1 ? 2 : 1;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          if (
            corner &&
            (dy === 1 || hash2(this.seed + 3 + dy, x + dx, z + dz) < LEAF_CORNER_CHANCE)
          ) {
            continue;
          }
          set(x + dx, topY + dy, z + dz, LEAVES, true);
        }
      }
    }
    for (let y = ground + 1; y <= topY; y++) set(x, y, z, LOG, false);
    set(x, ground, z, DIRT, false);
  }
}
