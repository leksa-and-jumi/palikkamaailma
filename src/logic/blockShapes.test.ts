import { describe, expect, it } from 'vitest';
import { AIR, FENCE, FENCE_GATE, GLASS_PANE, OAK_DOOR, STONE, TORCH, WALL_TORCH } from './blocks';
import { collisionBoxes, fallingWith, renderBoxes } from './blockShapes';

function world(blocks: Record<string, number>) {
  return (x: number, y: number, z: number) => blocks[`${x},${y},${z}`] ?? AIR;
}

describe('block shapes', () => {
  it('a fence joins fences and solid blocks next to it', () => {
    const lonely = renderBoxes(FENCE, () => AIR)!;
    expect(lonely).toHaveLength(1);
    const joined = renderBoxes(FENCE, (dx) => (dx === 1 ? FENCE : dx === -1 ? STONE : AIR))!;
    expect(joined).toHaveLength(5);
    // Fences are taller to bump into, so nobody jumps over.
    const tall = collisionBoxes(FENCE, () => AIR)!;
    expect(tall[0]!.to[1]).toBe(1.5);
  });

  it('a lonely glass pane shows a cross, one neighbour makes a straight line', () => {
    expect(renderBoxes(GLASS_PANE, () => AIR)).toHaveLength(5);
    expect(renderBoxes(GLASS_PANE, (dx) => (dx === 1 ? GLASS_PANE : AIR))).toHaveLength(3);
  });

  it('an open gate can be walked through', () => {
    expect(collisionBoxes(FENCE_GATE, () => AIR)!.length).toBeGreaterThan(0);
    expect(collisionBoxes(FENCE_GATE + 2, () => AIR)).toEqual([]);
    expect(collisionBoxes(STONE, () => AIR)).toBeNull();
  });

  it('wall torches fall off when their wall breaks', () => {
    // A torch facing east hangs on the block west of it.
    const get = world({ '1,5,0': WALL_TORCH + 1, '0,6,0': TORCH, '2,5,0': STONE });
    expect(fallingWith(get, [[0, 5, 0]])).toEqual([[1, 5, 0]]);
    expect(fallingWith(get, [[2, 5, 0]])).toEqual([]);
  });

  it('a door falls with its floor and the other half goes too', () => {
    const get = world({ '0,1,0': OAK_DOOR, '0,2,0': OAK_DOOR + 8, '0,0,0': STONE });
    expect(fallingWith(get, [[0, 0, 0]])).toEqual([
      [0, 1, 0],
      [0, 2, 0],
    ]);
    expect(fallingWith(get, [[0, 2, 0]])).toEqual([[0, 1, 0]]);
  });
});
