import { describe, expect, it } from 'vitest';
import { NETHER } from '../config';
import { AIR, BEDROCK, LAVA, NETHERRACK } from './blocks';
import { toNether, toOverworld } from './nether';
import { VoxelWorld, isInsideWorld, isNether } from './world';

describe('the Nether', () => {
  it('is a band far to the east, eight times smaller', () => {
    expect(toNether(800, -160)).toEqual([NETHER.offset + 100, -20]);
    expect(toOverworld(NETHER.offset + 100, -20)).toEqual([800, -160]);
    expect(isNether(NETHER.offset)).toBe(true);
    expect(isNether(100)).toBe(false);
    expect(isInsideWorld(NETHER.offset + 10, 50, 10)).toBe(true);
    expect(isInsideWorld(NETHER.offset + NETHER.halfSize + 5, 50, 10)).toBe(false);
  });

  it('has a bedrock floor and roof, netherrack caves and a lava sea', () => {
    const world = new VoxelWorld(42);
    const x0 = NETHER.offset;
    const counts = new Map<number, number>();
    for (let x = x0; x < x0 + 32; x++) {
      for (let z = 0; z < 32; z++) {
        expect(world.getBlock(x, 0, z)).toBe(BEDROCK);
        expect(world.getBlock(x, NETHER.roof, z)).toBe(BEDROCK);
        for (let y = 1; y < NETHER.roof; y++) {
          const id = world.getBlock(x, y, z);
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }
    expect(counts.get(NETHERRACK) ?? 0).toBeGreaterThan(10_000);
    expect(counts.get(AIR) ?? 0).toBeGreaterThan(5_000);
    expect(world.terrain.biomeAt(x0, 0)).toBe('nether');
    // Somewhere the caves reach down to the lava sea.
    let lava = counts.get(LAVA) ?? 0;
    for (let x = x0; x < x0 + 200 && lava === 0; x += 7) {
      for (let z = 0; z < 200 && lava === 0; z += 7) {
        if (world.getBlock(x, NETHER.lavaLevel, z) === LAVA) lava++;
      }
    }
    expect(lava).toBeGreaterThan(0);
  });
});
