import { describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../config';
import { getBlockType } from './blocks';
import { findSpawn } from './spawn';
import { VoxelWorld } from './world';

describe('spawn', () => {
  it('starts on dry land with room to stand', () => {
    for (const seed of [1, 2, 3, 42, 2024]) {
      const world = new VoxelWorld(seed);
      const [x, y, z] = findSpawn(world);
      const bx = Math.floor(x);
      const bz = Math.floor(z);
      expect(y).toBeGreaterThan(SEA_LEVEL);
      expect(getBlockType(world.getBlock(bx, y - 1, bz)).solid).toBe(true);
      expect(getBlockType(world.getBlock(bx, y, bz)).solid).toBe(false);
      expect(getBlockType(world.getBlock(bx, y + 1, bz)).solid).toBe(false);
    }
  });
});
