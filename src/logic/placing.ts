// Which blocks go where when you place something: torches and buttons stick
// to the side you click, doors and beds take two blocks, stairs and pistons
// turn the way you look, and two slabs make a whole block.

import {
  AIR,
  BED,
  BUTTON,
  COBBLE,
  COBBLE_SLAB,
  COBBLE_STAIRS,
  OAK_STAIRS,
  STONE_BRICK_STAIRS,
  TRAPDOOR,
  FACING_STEPS,
  FENCE_GATE,
  IRON_DOOR,
  LADDER,
  LEVER,
  OAK_DOOR,
  OAK_SLAB,
  PISTON,
  PLANKS,
  POWERED_RAIL,
  RAIL,
  REPEATER,
  STICKY_PISTON,
  STONE_BRICKS,
  STONE_BRICK_SLAB,
  TORCH,
  WALL_BUTTON,
  WALL_LEVER,
  WALL_TORCH,
  facingOfStep,
  getBlockType,
  isOpaque,
  type Facing,
  type Facing6,
} from './blocks';
import { planRail } from './rails';
import type { Edit } from './world';

/** Turned blocks: the first one faces north, the next ones east, south and west. */
const TURNED = new Set([OAK_STAIRS, COBBLE_STAIRS, STONE_BRICK_STAIRS, TRAPDOOR, REPEATER]);

/** Two slabs on top of each other become this whole block. */
export const DOUBLE_SLABS: Record<number, number> = {
  [OAK_SLAB]: PLANKS,
  [COBBLE_SLAB]: COBBLE,
  [STONE_BRICK_SLAB]: STONE_BRICKS,
};

export interface PlaceInput {
  /** The block that was clicked and which side (normal) of it. */
  hit: { x: number; y: number; z: number; nx: number; ny: number; nz: number };
  /** Which way the player looks (0–3) and up/down (radians, up is positive). */
  look: Facing;
  pitch: number;
  getBlock(x: number, y: number, z: number): number;
}

/** Can a block go here (air, water or a plant)? */
export function isFree(id: number): boolean {
  const b = getBlockType(id);
  return id === AIR || b.liquid || (b.shape === 'cross' && !b.solid && b.light === 0);
}

/**
 * The blocks to place for this item, or null when it can't go there.
 * `blockId` is the block the item places (a door item places the lower half).
 */
export function planPlace(blockId: number, input: PlaceInput): Edit[] | null {
  const { hit, look, getBlock } = input;
  const x = hit.x + hit.nx;
  const y = hit.y + hit.ny;
  const z = hit.z + hit.nz;
  const clicked = getBlock(hit.x, hit.y, hit.z);

  // A slab on a slab of the same kind makes a whole block.
  const whole = DOUBLE_SLABS[blockId];
  if (whole !== undefined && clicked === blockId && hit.ny === 1) {
    return [[hit.x, hit.y, hit.z, whole]];
  }
  if (!isFree(getBlock(x, y, z))) return null;
  const floor = isOpaque(getBlock(x, y - 1, z));
  /** The side clicked as a facing (away from the clicked block), for walls. */
  const wall = hit.ny === 0 ? facingOfStep(hit.nx, hit.nz) : null;
  const onWall = wall !== null && isOpaque(clicked);

  if (blockId === TORCH || blockId === LEVER || blockId === BUTTON) {
    if (hit.ny === 1 && floor) return [[x, y, z, blockId]];
    if (!onWall) return null;
    const base = blockId === TORCH ? WALL_TORCH : blockId === LEVER ? WALL_LEVER : WALL_BUTTON;
    return [[x, y, z, base + wall]];
  }
  if (blockId === LADDER) return onWall ? [[x, y, z, LADDER + wall]] : null;
  if (blockId === RAIL || blockId === POWERED_RAIL) {
    return planRail(getBlock, x, y, z, blockId === POWERED_RAIL, look);
  }
  if (blockId === OAK_DOOR || blockId === IRON_DOOR) {
    if (!floor || !isFree(getBlock(x, y + 1, z))) return null;
    return [
      [x, y, z, blockId + look],
      [x, y + 1, z, blockId + 8 + look],
    ];
  }
  if (blockId === BED) {
    const [dx, , dz] = FACING_STEPS[look]!;
    const hx = x + dx;
    const hz = z + dz;
    if (!floor || !isFree(getBlock(hx, y, hz)) || !isOpaque(getBlock(hx, y - 1, hz))) return null;
    return [
      [x, y, z, BED + look],
      [hx, y, hz, BED + 4 + look],
    ];
  }
  if (blockId === FENCE_GATE) return [[x, y, z, FENCE_GATE + (look % 2)]];
  if (blockId === PISTON || blockId === STICKY_PISTON) {
    // The pushing side looks at you (up or down when you look steeply).
    const facing: Facing6 =
      input.pitch < -PISTON_STEEP
        ? 4
        : input.pitch > PISTON_STEEP
          ? 5
          : (((look + 2) % 4) as Facing);
    return [[x, y, z, blockId + facing]];
  }
  if (TURNED.has(blockId)) {
    if (getBlockType(blockId).needsFloor && !floor) return null;
    return [[x, y, z, blockId + look]];
  }
  if (getBlockType(blockId).needsFloor && !floor) return null;
  return [[x, y, z, blockId]];
}

/** Looking up or down more than this turns a piston up or down. */
const PISTON_STEEP = 0.8;
