import { describe, expect, it } from 'vitest';
import { VILLAGES } from '../config';
import { COBBLE, PLANKS, SANDSTONE, TORCH, WATER } from './blocks';
import { TerrainGenerator } from './terrain';
import { villageBlocks, villageInRegion, type Village } from './villages';
import { VoxelWorld } from './world';

function findVillage(seed: number): Village {
  const ground = new TerrainGenerator(seed);
  for (let r = 0; r < 12; r++) {
    for (let rx = -r; rx <= r; rx++) {
      for (let rz = -r; rz <= r; rz++) {
        const v = villageInRegion(ground, rx, rz);
        if (v) return v;
      }
    }
  }
  throw new Error('no village found');
}

describe('villages', () => {
  it('are found in the world and are always the same', () => {
    const a = findVillage(2024);
    const b = findVillage(2024);
    expect(a).toEqual(b);
    expect(a.houses.length).toBeGreaterThanOrEqual(VILLAGES.minHouses);
    expect(['plains', 'desert', 'taiga', 'snowy']).toContain(a.biome);
  });

  it('have a well with water and houses with torches', () => {
    const v = findVillage(7);
    const blocks = villageBlocks(new TerrainGenerator(7), v);
    const ids = new Set(blocks.map((b) => b[3]));
    expect(ids.has(WATER)).toBe(true);
    expect(ids.has(TORCH)).toBe(true);
    expect(ids.has(PLANKS) || ids.has(SANDSTONE)).toBe(true);
    expect(ids.has(COBBLE) || ids.has(SANDSTONE)).toBe(true);
  });

  it('are built into the generated world', () => {
    const v = findVillage(42);
    const world = new VoxelWorld(42);
    // The well's water is in the middle of the village.
    expect(world.getBlock(v.x, v.y, v.z)).toBe(WATER);
    // Every house has a doorway: two air blocks above its front floor.
    for (const h of v.houses) {
      expect(world.getBlock(h.x, h.y + 1, h.z)).toBe(0);
      expect(world.getBlock(h.x, h.y + 2, h.z)).toBe(0);
    }
  });
});
