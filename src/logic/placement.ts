// Putting a finished magic build into the world. Everything inside the
// build's box is cleared first (trees, hills, old blocks), so the build always
// looks exactly like in the preview. On a slope the lowest blocks get
// supports down to the ground so nothing floats.

import { BUILDER, WORLD_HEIGHT } from '../config';
import { AIR, getBlockType } from './blocks';
import { buildBounds, placeBuild, type Bounds, type BuildBlock, type Vec3 } from './shapes';
import type { Edit } from './world';

export interface Placement {
  /** Blocks that change, in world coordinates. */
  edits: Edit[];
  /** The box that is cleared and filled, in world coordinates. */
  bounds: Bounds;
}

/** Bedrock (y = 0) and anything outside the world are never touched. */
function canChange(y: number): boolean {
  return y >= 1 && y < WORLD_HEIGHT;
}

/** Air, water and plants: supports go down through these. */
function isEmpty(id: number): boolean {
  const b = getBlockType(id);
  return id === AIR || b.liquid || b.shape === 'cross';
}

/**
 * How far to move a turned build (relative blocks from `placeBuild` with origin
 * 0) so the side nearest to the player starts at the block they point at.
 * `view` is the direction the player looks (see `facingFromYaw`).
 */
export function nearSideOffset(local: readonly BuildBlock[], view: 0 | 1 | 2 | 3): Vec3 {
  const { min, max } = buildBounds(local);
  switch (view) {
    case 0:
      return [0, 0, -max[2]];
    case 1:
      return [-min[0], 0, 0];
    case 2:
      return [0, 0, -min[2]];
    case 3:
      return [-max[0], 0, 0];
  }
}

/**
 * Plans putting `build` (centred with `centerFootprint`) at `origin`, turned to
 * `facing`. `getBlock` reads the world as it is now.
 */
export function planPlacement(
  build: readonly BuildBlock[],
  origin: Vec3,
  facing: 0 | 1 | 2 | 3,
  getBlock: (x: number, y: number, z: number) => number,
): Placement {
  const placed = placeBuild(build, origin, facing);
  const bounds = buildBounds(placed);
  if (placed.length === 0) return { edits: [], bounds };
  const target = new Map<string, number>();
  for (const [x, y, z, id] of placed) target.set(`${x},${y},${z}`, id);

  const edits: Edit[] = [];
  const { min, max } = bounds;
  for (let y = min[1]; y <= max[1]; y++) {
    if (!canChange(y)) continue;
    for (let z = min[2]; z <= max[2]; z++) {
      for (let x = min[0]; x <= max[0]; x++) {
        const id = target.get(`${x},${y},${z}`) ?? AIR;
        if (getBlock(x, y, z) !== id) edits.push([x, y, z, id]);
      }
    }
  }

  // Supports: solid blocks of the bottom layer continue down to the ground.
  for (const [x, y, z, id] of placed) {
    if (y !== min[1] || isEmpty(id) || !getBlockType(id).solid) continue;
    for (let d = 1; d <= BUILDER.foundationDepth; d++) {
      const below = y - d;
      if (!canChange(below) || !isEmpty(getBlock(x, below, z))) break;
      edits.push([x, below, z, id]);
    }
  }
  return { edits, bounds };
}
