import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_LEVEL, TERRAIN, WORLD_HEIGHT } from '../config';
import {
  AIR,
  BEDROCK,
  COAL_ORE,
  DIAMOND_ORE,
  IRON_ORE,
  LAVA,
  LOG,
  SPRUCE_LOG,
  BIRCH_LOG,
  WATER,
} from './blocks';
import { CHUNK_VOLUME, TerrainGenerator, chunkIndex, type Biome } from './terrain';

const terrain = new TerrainGenerator(2024);

function countIn(cx0: number, cz0: number, size: number, ids: number[]): number {
  let n = 0;
  for (let cz = cz0; cz < cz0 + size; cz++) {
    for (let cx = cx0; cx < cx0 + size; cx++) {
      for (const b of terrain.generateChunk(cx, cz)) if (ids.includes(b)) n++;
    }
  }
  return n;
}

describe('terrain', () => {
  it('builds the same chunk every time for the same seed', () => {
    const a = terrain.generateChunk(3, -4);
    const b = new TerrainGenerator(2024).generateChunk(3, -4);
    expect(a.length).toBe(CHUNK_VOLUME);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('gives different worlds for different seeds', () => {
    const a = new TerrainGenerator(1).generateChunk(0, 0);
    const b = new TerrainGenerator(2).generateChunk(0, 0);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('has bedrock at the bottom everywhere and an empty sky', () => {
    const chunk = terrain.generateChunk(-7, 12);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        expect(chunk[chunkIndex(x, 0, z)]).toBe(BEDROCK);
        expect(chunk[chunkIndex(x, WORLD_HEIGHT - 1, z)]).toBe(AIR);
      }
    }
  });

  it('goes on forever: chunks far away work too', () => {
    const far = terrain.generateChunk(1500, -1500);
    expect(far.some((b) => b !== AIR)).toBe(true);
  });

  it('has many different biomes', () => {
    const seen = new Set<Biome>();
    for (let z = -4000; z <= 4000; z += 64) {
      for (let x = -4000; x <= 4000; x += 64) seen.add(terrain.biomeAt(x, z));
    }
    expect(seen.size).toBeGreaterThanOrEqual(7);
    expect(seen.has('ocean')).toBe(true);
    expect(seen.has('desert')).toBe(true);
    expect(seen.has('mountains')).toBe(true);
  });

  it('fills the sea with water up to sea level', () => {
    for (let x = -3000; x < 3000; x += 37) {
      const col = terrain.column(x, 0);
      if (col.biome !== 'ocean' || col.cold) continue;
      expect(terrain.groundBlock(x, SEA_LEVEL, 0, col)).toBe(WATER);
      return;
    }
    throw new Error('no ocean found');
  });

  it('has caves, lava deep down and ores', () => {
    let air = 0;
    let lava = 0;
    for (let x = 0; x < 64; x++) {
      for (let z = 0; z < 64; z++) {
        const col = terrain.column(x, z);
        for (let y = 1; y < Math.min(col.height - 8, 30); y++) {
          const b = terrain.groundBlock(x, y, z, col);
          if (b === AIR) air++;
          if (b === LAVA) lava++;
          if (b === LAVA) expect(y).toBeLessThanOrEqual(TERRAIN.lavaLevel);
        }
      }
    }
    expect(air).toBeGreaterThan(100);
    expect(lava).toBeGreaterThan(0);
    expect(countIn(0, 0, 4, [COAL_ORE])).toBeGreaterThan(20);
    expect(countIn(0, 0, 4, [IRON_ORE])).toBeGreaterThan(10);
    expect(countIn(0, 0, 6, [DIAMOND_ORE])).toBeGreaterThan(0);
  });

  it('grows trees', () => {
    expect(countIn(-8, -8, 8, [LOG, BIRCH_LOG, SPRUCE_LOG])).toBeGreaterThan(20);
  });
});
