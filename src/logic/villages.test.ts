import { describe, expect, it } from 'vitest';
import { VILLAGES } from '../config';
import { COBBLE, OAK_DOOR, PLANKS, SANDSTONE, TORCH, WATER, getBlockType } from './blocks';
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
    // Every house has a door (two halves) at its front, facing into the house.
    for (const h of v.houses) {
      const near: [number, number][] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) near.push([dx, dz]);
      const spot = near.find(
        ([dx, dz]) => getBlockType(world.getBlock(h.x + dx, h.y + 1, h.z + dz)).item === OAK_DOOR,
      );
      expect(spot).toBeDefined();
      const [dx, dz] = spot!;
      const lower = getBlockType(world.getBlock(h.x + dx, h.y + 1, h.z + dz));
      const upper = getBlockType(world.getBlock(h.x + dx, h.y + 2, h.z + dz));
      expect(lower.facing).toBe(h.facing);
      expect(upper.item).toBe(OAK_DOOR);
      expect(upper.partner).toEqual([0, -1, 0]);
    }
  });
});
