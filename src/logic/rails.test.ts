import { describe, expect, it } from 'vitest';
import { AIR, POWERED_RAIL, RAIL, STONE } from './blocks';
import { planRail } from './rails';

/** Stone floor at y = 0 and a few blocks. */
function world(blocks: Record<string, number>) {
  return (x: number, y: number, z: number) => blocks[`${x},${y},${z}`] ?? (y <= 0 ? STONE : AIR);
}

describe('rails', () => {
  it('a lonely rail goes the way you look', () => {
    expect(planRail(world({}), 0, 1, 0, false, 1)).toEqual([[0, 1, 0, RAIL + 1]]);
    expect(planRail(world({}), 0, 1, 0, false, 2)).toEqual([[0, 1, 0, RAIL]]);
  });

  it('joins a line and turns a corner', () => {
    // A rail to the west: the new one goes east–west.
    const line = world({ '-1,1,0': RAIL });
    const edits = planRail(line, 0, 1, 0, false, 0)!;
    expect(edits[0]).toEqual([0, 1, 0, RAIL + 1]);
    // The neighbour turns to join too.
    expect(edits).toContainEqual([-1, 1, 0, RAIL + 1]);
    // Rails north and east of us make a curve.
    const corner = world({ '0,1,-1': RAIL, '1,1,0': RAIL + 1 });
    expect(planRail(corner, 0, 1, 0, false, 0)![0]).toEqual([0, 1, 0, RAIL + 6]);
    // Powered rails never curve.
    expect(planRail(corner, 0, 1, 0, true, 0)![0]![3]).toBeLessThan(POWERED_RAIL + 2);
  });

  it('climbs to a rail one block up', () => {
    // A rail up a step to the east (on a stone block).
    const hill = world({ '1,1,0': STONE, '1,2,0': RAIL + 1 });
    expect(planRail(hill, 0, 1, 0, false, 0)![0]).toEqual([0, 1, 0, RAIL + 3]);
    // Placing the high one next to a low one tilts the low one up.
    const low = world({ '-1,1,0': RAIL + 1, '0,1,0': STONE });
    expect(planRail(low, 0, 2, 0, false, 1)).toContainEqual([-1, 1, 0, RAIL + 3]);
  });

  it('needs ground under it', () => {
    expect(planRail(world({}), 0, 5, 0, false, 0)).toBeNull();
  });
});
