import { describe, expect, it } from 'vitest';
import {
  AIR,
  BED,
  LADDER,
  OAK_DOOR,
  OAK_SLAB,
  OAK_STAIRS,
  PISTON,
  PLANKS,
  STONE,
  TORCH,
  WALL_BUTTON,
  WALL_TORCH,
  BUTTON,
} from './blocks';
import { planPlace, type PlaceInput } from './placing';

/** Stone below y = 1 and a stone wall at x = 5. */
function input(hit: PlaceInput['hit'], look: 0 | 1 | 2 | 3 = 0, pitch = 0): PlaceInput {
  return {
    hit,
    look,
    pitch,
    getBlock: (x, y) => (y < 1 || x === 5 ? STONE : AIR),
  };
}

describe('placing', () => {
  it('puts a torch on the floor or on the side of a wall', () => {
    expect(planPlace(TORCH, input({ x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0 }))).toEqual([
      [0, 1, 0, TORCH],
    ]);
    // Clicking the west side of the wall: the torch faces west.
    expect(planPlace(TORCH, input({ x: 5, y: 2, z: 0, nx: -1, ny: 0, nz: 0 }))).toEqual([
      [4, 2, 0, WALL_TORCH + 3],
    ]);
    // Not under a ceiling.
    expect(planPlace(TORCH, input({ x: 5, y: 2, z: 0, nx: 0, ny: -1, nz: 0 }))).toBeNull();
  });

  it('puts buttons on walls and ladders only on walls', () => {
    const side = { x: 5, y: 2, z: 0, nx: -1, ny: 0, nz: 0 };
    expect(planPlace(BUTTON, input(side))).toEqual([[4, 2, 0, WALL_BUTTON + 3]]);
    expect(planPlace(LADDER, input(side))).toEqual([[4, 2, 0, LADDER + 3]]);
    expect(planPlace(LADDER, input({ x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0 }))).toBeNull();
  });

  it('makes a door of two halves facing the way you look', () => {
    expect(planPlace(OAK_DOOR, input({ x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0 }, 2))).toEqual([
      [0, 1, 0, OAK_DOOR + 2],
      [0, 2, 0, OAK_DOOR + 8 + 2],
    ]);
  });

  it('makes a bed from the foot towards where you look', () => {
    expect(planPlace(BED, input({ x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0 }, 1))).toEqual([
      [0, 1, 0, BED + 1],
      [1, 1, 0, BED + 4 + 1],
    ]);
  });

  it('turns stairs and pistons', () => {
    const floor = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0 };
    expect(planPlace(OAK_STAIRS, input(floor, 3))).toEqual([[0, 1, 0, OAK_STAIRS + 3]]);
    // The pushing side looks at you.
    expect(planPlace(PISTON, input(floor, 0))).toEqual([[0, 1, 0, PISTON + 2]]);
    expect(planPlace(PISTON, input(floor, 0, -1.2))).toEqual([[0, 1, 0, PISTON + 4]]);
  });

  it('two slabs make a whole block', () => {
    const slabWorld: PlaceInput = {
      hit: { x: 0, y: 1, z: 0, nx: 0, ny: 1, nz: 0 },
      look: 0,
      pitch: 0,
      getBlock: (x, y, z) => (x === 0 && y === 1 && z === 0 ? OAK_SLAB : y < 1 ? STONE : AIR),
    };
    expect(planPlace(OAK_SLAB, slabWorld)).toEqual([[0, 1, 0, PLANKS]]);
  });
});
