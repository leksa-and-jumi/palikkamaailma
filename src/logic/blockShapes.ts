// The little boxes a block is made of (doors, fences, stairs) for drawing and
// bumping, and which blocks fall off when the block holding them breaks.

import {
  FENCE,
  FENCE_GATE,
  GLASS,
  GLASS_PANE,
  getBlockType,
  isOpaque,
  rotateBox,
  type BlockBox,
  type Facing,
} from './blocks';
import type { BlockQuery } from './physics';

/** The block next to this one at the same height: (dx, dz) = one step. */
export type Near = (dx: number, dz: number) => number;

const SIDES: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function joinsFence(id: number): boolean {
  return id === FENCE || getBlockType(id).item === FENCE_GATE || isOpaque(id);
}

export function joinsPane(id: number): boolean {
  return id === GLASS_PANE || id === GLASS || isOpaque(id);
}

/** Which sides join (bit 1 = north, 2 = east, 4 = south, 8 = west). */
function joinMask(near: Near, joins: (id: number) => boolean): number {
  let mask = 0;
  SIDES.forEach(([dx, dz], i) => {
    if (joins(near(dx, dz))) mask |= 1 << i;
  });
  return mask;
}

function armsFor(mask: number, arm: readonly BlockBox[]): BlockBox[] {
  const out: BlockBox[] = [];
  for (let f = 0; f < 4; f++) {
    if (mask & (1 << f)) for (const box of arm) out.push(rotateBox(box, f as Facing));
  }
  return out;
}

const FENCE_POST: BlockBox = { from: [0.375, 0, 0.375], to: [0.625, 1, 0.625] };
const FENCE_ARM: BlockBox[] = [
  { from: [0.4375, 0.375, 0], to: [0.5625, 0.5625, 0.375] },
  { from: [0.4375, 0.75, 0], to: [0.5625, 0.9375, 0.375] },
];
const FENCE_TALL_POST: BlockBox = { from: [0.375, 0, 0.375], to: [0.625, 1.5, 0.625] };
const FENCE_TALL_ARM: BlockBox[] = [{ from: [0.375, 0, 0], to: [0.625, 1.5, 0.375] }];
const PANE_POST: BlockBox = { from: [0.4375, 0, 0.4375], to: [0.5625, 1, 0.5625] };
const PANE_ARM: BlockBox[] = [{ from: [0.4375, 0, 0], to: [0.5625, 1, 0.4375] }];

const fenceCache = new Map<string, BlockBox[]>();

function cached(kind: string, mask: number, make: () => BlockBox[]): BlockBox[] {
  const key = `${kind}${mask}`;
  let boxes = fenceCache.get(key);
  if (!boxes) {
    boxes = make();
    fenceCache.set(key, boxes);
  }
  return boxes;
}

/** A lonely pane shows all four arms, one arm goes straight through (like dust). */
function paneMask(mask: number): number {
  if (mask === 0) return 15;
  for (let f = 0; f < 4; f++) if (mask === 1 << f) return mask | (1 << ((f + 2) % 4));
  return mask;
}

/** The boxes to draw, or null when the block is not made of boxes. */
export function renderBoxes(id: number, near: Near): readonly BlockBox[] | null {
  const b = getBlockType(id);
  if (b.shape === 'boxes') return b.boxes ?? [];
  if (b.shape === 'fence') {
    const mask = joinMask(near, joinsFence);
    return cached('f', mask, () => [FENCE_POST, ...armsFor(mask, FENCE_ARM)]);
  }
  if (b.shape === 'pane') {
    const mask = paneMask(joinMask(near, joinsPane));
    return cached('p', mask, () => [PANE_POST, ...armsFor(mask, PANE_ARM)]);
  }
  return null;
}

/** The boxes you bump into: [] = walk through, null = the whole block. */
export function collisionBoxes(id: number, near: Near): readonly BlockBox[] | null {
  const b = getBlockType(id);
  if (!b.solid) return [];
  if (b.shape === 'fence') {
    const mask = joinMask(near, joinsFence);
    return cached('F', mask, () => [FENCE_TALL_POST, ...armsFor(mask, FENCE_TALL_ARM)]);
  }
  if (b.collision) return b.collision;
  return renderBoxes(id, near);
}

/** The smallest box around all the boxes (for the highlight frame). */
export function boxBounds(boxes: readonly BlockBox[]): BlockBox | null {
  if (boxes.length === 0) return null;
  const from = [1, 1, 1];
  const to = [0, 0, 0];
  for (const box of boxes) {
    for (let a = 0; a < 3; a++) {
      from[a] = Math.min(from[a]!, box.from[a]!);
      to[a] = Math.max(to[a]!, Math.min(1, box.to[a]!));
    }
  }
  return { from: from as [number, number, number], to: to as [number, number, number] };
}

type Pos = [number, number, number];

const AROUND: readonly Pos[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Blocks that fall off when these blocks are removed: torches on a wall,
 * things standing on top, and the other half of a door or bed.
 */
export function fallingWith(
  getBlock: (x: number, y: number, z: number) => number,
  removed: readonly Pos[],
): Pos[] {
  const gone = new Set(removed.map((p) => p.join(',')));
  const queue: Pos[] = [...removed];
  const out: Pos[] = [];
  for (let i = 0; i < queue.length; i++) {
    const [x, y, z] = queue[i]!;
    for (const [dx, dy, dz] of AROUND) {
      const n: Pos = [x + dx, y + dy, z + dz];
      const k = n.join(',');
      if (gone.has(k)) continue;
      const b = getBlockType(getBlock(...n));
      const hangs = (s: readonly number[] | null) =>
        !!s && s[0] === -dx && s[1] === -dy && s[2] === -dz;
      if (!hangs(b.support) && !hangs(b.partner)) continue;
      gone.add(k);
      queue.push(n);
      out.push(n);
    }
  }
  return out;
}

/** What physics needs to know about the world, from a block getter. */
export function blockQuery(get: (x: number, y: number, z: number) => number): BlockQuery {
  return {
    isSolid: (x, y, z) => getBlockType(get(x, y, z)).solid,
    isLiquid: (x, y, z) => getBlockType(get(x, y, z)).liquid,
    boxes: (x, y, z) => {
      const id = get(x, y, z);
      if (getBlockType(id).shape === 'cube') return null;
      return collisionBoxes(id, (dx, dz) => get(x + dx, y, z + dz));
    },
    climbable: (x, y, z) => getBlockType(get(x, y, z)).climbable,
  };
}
