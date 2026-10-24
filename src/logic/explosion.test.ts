import { describe, expect, it } from 'vitest';
import { TNT_RULES } from '../config';
import { AIR, BEDROCK, OBSIDIAN, REDSTONE_WIRE, STONE, TNT, TNT_LIT, WATER } from './blocks';
import { blastHit, blastResistance, explode } from './explosion';

/** Solid stone everywhere except the TNT at the middle. */
const stoneWorld =
  (extra: Record<string, number> = {}) =>
  (x: number, y: number, z: number) =>
    extra[`${x},${y},${z}`] ?? (x === 0 && y === 0 && z === 0 ? TNT_LIT : STONE);

describe('explosion', () => {
  it('makes a hole and removes the TNT itself', () => {
    const { edits } = explode(stoneWorld(), 0, 0, 0, TNT_RULES.power);
    expect(edits).toContainEqual([0, 0, 0, AIR]);
    expect(edits).toContainEqual([1, 0, 0, AIR]);
    expect(edits.length).toBeGreaterThan(6);
    // Stone stops it before 4 blocks.
    expect(edits.some(([x, y, z]) => Math.hypot(x, y, z) > 4)).toBe(false);
  });

  it('breaks more in soft blocks than in stone', () => {
    const air = (x: number, y: number, z: number) =>
      x === 0 && y === 0 && z === 0 ? TNT_LIT : y < 0 ? 2 : AIR;
    const dirt = explode(air, 0, 0, 0, TNT_RULES.power).edits.length;
    const stone = explode(stoneWorld(), 0, 0, 0, TNT_RULES.power).edits.length;
    expect(dirt).toBeGreaterThan(stone);
  });

  it('never breaks bedrock, obsidian or water', () => {
    const { edits } = explode(
      stoneWorld({ '1,0,0': BEDROCK, '0,1,0': OBSIDIAN, '0,0,1': WATER }),
      0,
      0,
      0,
      4,
    );
    const keys = edits.map(([x, y, z]) => `${x},${y},${z}`);
    expect(keys).not.toContain('1,0,0');
    expect(keys).not.toContain('0,1,0');
    expect(keys).not.toContain('0,0,1');
    expect(blastResistance(BEDROCK)).toBe(Infinity);
  });

  it('lights TNT next to it', () => {
    const blast = explode(stoneWorld({ '1,0,0': TNT }), 0, 0, 0, 4);
    expect(blast.edits).toContainEqual([1, 0, 0, TNT_LIT]);
    expect(blast.lit).toEqual([[1, 0, 0]]);
  });

  it('is the same every time at the same place', () => {
    expect(explode(stoneWorld(), 0, 0, 0, 4)).toEqual(explode(stoneWorld(), 0, 0, 0, 4));
  });

  it('hurts less further away', () => {
    const near = blastHit(1, 4);
    const far = blastHit(6, 4);
    expect(near.damage).toBeGreaterThan(far.damage);
    expect(near.push).toBeGreaterThan(far.push);
    expect(blastHit(8, 4)).toEqual({ damage: 0, push: 0 });
  });

  it('dust falls off when its floor breaks', () => {
    // Air above the TNT; dust on the stone next to it.
    const world = (x: number, y: number, z: number) =>
      x === 0 && y === 0 && z === 0
        ? TNT_LIT
        : x === 1 && y === 1 && z === 0
          ? REDSTONE_WIRE
          : y > 0
            ? AIR
            : STONE;
    const { edits } = explode(world, 0, 0, 0, TNT_RULES.power);
    expect(edits).toContainEqual([1, 0, 0, AIR]);
    expect(edits).toContainEqual([1, 1, 0, AIR]);
  });
});
