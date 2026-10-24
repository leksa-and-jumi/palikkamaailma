import { describe, expect, it } from 'vitest';
import { BUILDER } from '../config';
import { AIR, BEDROCK, DIRT, LOG, PLANKS, STONE, WATER } from './blocks';
import { nearSideOffset, planPlacement } from './placement';
import { placeBuild, type BuildBlock } from './shapes';

/** A flat test world: bedrock at 0, dirt up to y = 10, then air. */
function flatWorld(extra: Record<string, number> = {}) {
  return (x: number, y: number, z: number): number => {
    const key = `${x},${y},${z}`;
    if (key in extra) return extra[key]!;
    if (y === 0) return BEDROCK;
    return y <= 10 ? DIRT : AIR;
  };
}

describe('placement', () => {
  it('clears everything inside the build box', () => {
    // A 3 × 2 × 1 build where only the corners have blocks; a tree trunk is in the way.
    const build: BuildBlock[] = [
      [-1, 0, 0, PLANKS],
      [1, 1, 0, PLANKS],
    ];
    const world = flatWorld({ '0,11,0': LOG, '0,12,0': LOG });
    const { edits, bounds } = planPlacement(build, [0, 11, 0], 0, world);
    expect(bounds).toEqual({ min: [-1, 11, 0], max: [1, 12, 0] });
    expect(edits).toContainEqual([0, 11, 0, AIR]);
    expect(edits).toContainEqual([0, 12, 0, AIR]);
    expect(edits).toContainEqual([-1, 11, 0, PLANKS]);
    expect(edits).toContainEqual([1, 12, 0, PLANKS]);
  });

  it('digs into a hill so the build is exactly like the preview', () => {
    const build: BuildBlock[] = [[0, 0, 0, STONE]];
    const { edits } = planPlacement(build, [0, 5, 0], 0, flatWorld());
    expect(edits).toEqual([[0, 5, 0, STONE]]);
  });

  it('adds supports under the bottom layer down to the ground', () => {
    const build: BuildBlock[] = [
      [0, 0, 0, STONE],
      [0, 1, 0, PLANKS],
    ];
    // Placed 3 blocks above the ground, with water in between.
    const world = flatWorld({ '0,12,0': WATER });
    const { edits } = planPlacement(build, [0, 14, 0], 0, world);
    const supports = edits.filter(([, y]) => y < 14);
    expect(supports).toEqual([
      [0, 13, 0, STONE],
      [0, 12, 0, STONE],
      [0, 11, 0, STONE],
    ]);
  });

  it('never goes deeper than the support limit or touches bedrock', () => {
    const build: BuildBlock[] = [[0, -5, 0, STONE]];
    const air = () => AIR;
    const { edits } = planPlacement(build, [0, 30, 0], 0, air);
    expect(edits.length).toBe(1 + BUILDER.foundationDepth);
    const low = planPlacement([[0, 0, 0, STONE]], [0, 0, 0], 0, flatWorld());
    expect(low.edits).toEqual([]);
  });

  it('puts the near side of the build where the player points', () => {
    // A build 5 deep (z -2…2); looking north (-z) the near side is the +z end.
    const build: BuildBlock[] = [
      [0, 0, -2, STONE],
      [0, 0, 2, STONE],
    ];
    for (const view of [0, 1, 2, 3] as const) {
      const local = placeBuild(build, [0, 0, 0], view);
      const offset = nearSideOffset(local, view);
      const placed = placeBuild(build, offset, view);
      // Looking along the view direction, the nearest block is at distance 0.
      const along = placed.map(([x, , z]) => [-z, x, z, -x][view]!);
      expect(Math.min(...along) + 0).toBe(0);
    }
  });
});
