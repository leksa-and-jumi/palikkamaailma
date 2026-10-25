import { describe, expect, it } from 'vitest';
import {
  BED,
  BLOCKS,
  FENCE_GATE,
  OAK_DOOR,
  OAK_STAIRS,
  PISTON,
  WALL_TORCH,
  getBlockType,
  rotateBox,
  turnBlock,
} from './blocks';

describe('blocks', () => {
  it('have unique keys and their id is their place in the list', () => {
    const keys = new Set(BLOCKS.map((b) => b.key));
    expect(keys.size).toBe(BLOCKS.length);
    BLOCKS.forEach((b, i) => expect(b.id).toBe(i));
    // Blocks share ids with items, which start at 256.
    expect(BLOCKS.length).toBeLessThanOrEqual(256);
  });

  it('turns boxes a quarter turn clockwise (north becomes east)', () => {
    const box = { from: [0, 0, 0], to: [1, 1, 0.25] } as const;
    expect(rotateBox(box, 1)).toMatchObject({ from: [0.75, 0, 0], to: [1, 1, 1] });
    expect(rotateBox(box, 2)).toMatchObject({ from: [0, 0, 0.75], to: [1, 1, 1] });
    expect(rotateBox(box, 4)).toMatchObject({ from: [0, 0.75, 0], to: [1, 1, 1] });
    expect(rotateBox(box, 5)).toMatchObject({ from: [0, 0, 0], to: [1, 0.25, 1] });
    expect(rotateBox({ ...box, faces: { nz: 'piston_top' } }, 1).faces).toEqual({
      px: 'piston_top',
    });
  });

  it('door halves and bed halves point at each other', () => {
    for (const b of BLOCKS) {
      if (!b.partner) continue;
      expect(
        b.item === OAK_DOOR || b.item === BED || getBlockType(b.item).key === 'iron_door',
      ).toBe(true);
    }
    const foot = getBlockType(BED + 1);
    const head = getBlockType(BED + 4 + 1);
    expect(foot.partner).toEqual([1, 0, 0]);
    expect(head.partner).toEqual([-1, 0, 0]);
    expect(head.noDrop).toBe(true);
  });

  it('turns facing blocks with a build', () => {
    expect(turnBlock(WALL_TORCH, 1)).toBe(WALL_TORCH + 1);
    expect(turnBlock(OAK_STAIRS + 3, 2)).toBe(OAK_STAIRS + 1);
    expect(turnBlock(OAK_DOOR + 8 + 4, 3)).toBe(OAK_DOOR + 8 + 4 + 3);
    expect(turnBlock(FENCE_GATE, 1)).toBe(FENCE_GATE + 1);
    expect(turnBlock(FENCE_GATE + 1, 1)).toBe(FENCE_GATE);
    // Pistons pointing up stay up.
    expect(turnBlock(PISTON + 4, 1)).toBe(PISTON + 4);
  });

  it('opens and closes doors by hand, iron doors only with power', () => {
    const door = getBlockType(OAK_DOOR);
    expect(door.toggle).toBe(OAK_DOOR + 4);
    expect(getBlockType(OAK_DOOR + 4).toggle).toBe(OAK_DOOR);
    const iron = getBlockType(getBlockType(OAK_DOOR).id + 16);
    expect(iron.key).toBe('iron_door');
    expect(iron.toggle).toBeNull();
    expect(iron.powered).toBe(iron.id + 4);
  });
});
