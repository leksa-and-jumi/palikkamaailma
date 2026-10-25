import { describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../config';
import { AIR, GRASS, OAK_DOOR, STONE, TALL_GRASS, TORCH, WATER } from './blocks';
import { blockColor, columnColor, shade, topOf } from './mapColors';

describe('map colours', () => {
  it('looks through air and plants but not water or torches', () => {
    expect(blockColor(AIR)).toBeNull();
    expect(blockColor(TALL_GRASS)).toBeNull();
    expect(blockColor(WATER)).not.toBeNull();
    expect(blockColor(TORCH)).not.toBeNull();
    // Every way a door faces has the door's colour.
    expect(blockColor(OAK_DOOR + 5)).toEqual(blockColor(OAK_DOOR));
  });

  it('finds the top block of a column', () => {
    const column = [STONE, STONE, GRASS, TALL_GRASS];
    expect(topOf((y) => column[y] ?? AIR)).toEqual({ id: GRASS, height: 2 });
  });

  it('shades slopes like a Minecraft map', () => {
    const c = [100, 100, 100] as [number, number, number];
    expect(shade(c, 5, 4)[0]).toBeGreaterThan(shade(c, 5, 5)[0]);
    expect(shade(c, 5, 5)[0]).toBeGreaterThan(shade(c, 5, 6)[0]);
    expect(shade(c, 5, 5, 10)[0]).toBeLessThan(shade(c, 5, 5, 1)[0]);
  });

  it('draws unexplored sea as water at sea level', () => {
    const sea = columnColor({ height: SEA_LEVEL - 6, biome: 'ocean', cold: false });
    expect(sea.height).toBe(SEA_LEVEL);
    expect(sea.depth).toBe(6);
    expect(sea.color).toEqual(blockColor(WATER));
  });
});
