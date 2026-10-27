// Rails join their neighbours like in Minecraft: a straight line, a curve
// where the track turns, and a slope where the next rail is one block up.

import {
  FACING_STEPS,
  POWERED_RAIL,
  POWERED_RAIL_ON,
  RAIL,
  RAIL_SHAPES,
  getBlockType,
  isOpaque,
  type Facing,
  type RailShape,
} from './blocks';
import type { Edit } from './world';

type Get = (x: number, y: number, z: number) => number;

export function isRail(id: number): boolean {
  return getBlockType(id).shape === 'rail';
}

export function isPoweredRail(id: number): boolean {
  return id >= POWERED_RAIL && id < POWERED_RAIL_ON + 6;
}

export function railShape(id: number): RailShape | undefined {
  return getBlockType(id).rail;
}

export const opposite = (f: Facing): Facing => ((f + 2) % 4) as Facing;

/** The block id for a rail of this kind with these exits (and slope). */
export function railId(powered: boolean, exits: readonly Facing[], up?: Facing): number {
  const index = RAIL_SHAPES.findIndex(
    (s) =>
      ((s.exits[0] === exits[0] && s.exits[1] === exits[1]) ||
        (s.exits[0] === exits[1] && s.exits[1] === exits[0])) &&
      s.up === up,
  );
  return (powered ? POWERED_RAIL : RAIL) + Math.max(0, index);
}

/** How a rail at (x, y, z) could join the track on side f: level, up a step or down a step. */
function joinOn(
  get: Get,
  x: number,
  y: number,
  z: number,
  f: Facing,
): 'level' | 'up' | 'down' | null {
  const [dx, , dz] = FACING_STEPS[f]!;
  if (isRail(get(x + dx, y, z + dz))) return 'level';
  if (isRail(get(x + dx, y + 1, z + dz))) return 'up';
  // A rail one step down can tilt up to meet this one.
  const below = get(x + dx, y - 1, z + dz);
  const slope = railShape(below);
  if (slope && (slope.up === opposite(f) || slope.up === undefined)) return 'down';
  return null;
}

/** Does the rail at (x, y, z) already lead into the side f? */
function leadsTo(get: Get, x: number, y: number, z: number, f: Facing): boolean {
  const shape = railShape(get(x, y, z));
  if (!shape || !shape.exits.includes(f)) return false;
  return joinOn(get, x, y, z, f) !== null;
}

/** The best shape for a rail here: join the neighbours that are free to join. */
export function shapeFor(
  get: Get,
  x: number,
  y: number,
  z: number,
  powered: boolean,
  look: Facing,
): number {
  const sides: { f: Facing; how: 'level' | 'up' | 'down' }[] = [];
  for (const f of [0, 1, 2, 3] as Facing[]) {
    const how = joinOn(get, x, y, z, f);
    if (!how) continue;
    // A neighbour whose track already goes two other ways stays as it is.
    const [dx, , dz] = FACING_STEPS[f]!;
    const ny = how === 'up' ? y + 1 : how === 'down' ? y - 1 : y;
    const n = railShape(get(x + dx, ny, z + dz))!;
    const busy =
      !n.exits.includes(opposite(f)) && n.exits.every((e) => leadsTo(get, x + dx, ny, z + dz, e));
    if (!busy) sides.push({ f, how });
  }
  const has = (f: Facing) => sides.find((s) => s.f === f);
  const upOf = (a: Facing, b: Facing): Facing | undefined =>
    has(a)?.how === 'up' ? a : has(b)?.how === 'up' ? b : undefined;
  if (has(0) && has(2)) return railId(powered, [0, 2], upOf(0, 2));
  if (has(1) && has(3)) return railId(powered, [1, 3], upOf(1, 3));
  if (!powered) {
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ] as [Facing, Facing][]) {
      if (has(a) && has(b)) return railId(false, [a, b]);
    }
  }
  const one = sides[0];
  if (one) {
    const axis: [Facing, Facing] = one.f % 2 === 0 ? [0, 2] : [1, 3];
    return railId(powered, axis, one.how === 'up' ? one.f : undefined);
  }
  return railId(powered, look % 2 === 0 ? [0, 2] : [1, 3]);
}

/**
 * Places a rail: its own shape plus neighbours that turn or tilt to join it.
 * Null when there is no floor.
 */
export function planRail(
  get: Get,
  x: number,
  y: number,
  z: number,
  powered: boolean,
  look: Facing,
): Edit[] | null {
  if (!isOpaque(get(x, y - 1, z))) return null;
  const id = shapeFor(get, x, y, z, powered, look);
  const edits: Edit[] = [[x, y, z, id]];
  const withNew: Get = (bx, by, bz) => (bx === x && by === y && bz === z ? id : get(bx, by, bz));
  const shape = railShape(id)!;
  for (const f of shape.exits) {
    const how = joinOn(withNew, x, y, z, f);
    if (!how) continue;
    const [dx, , dz] = FACING_STEPS[f]!;
    const ny = how === 'up' ? y + 1 : how === 'down' ? y - 1 : y;
    const nid = withNew(x + dx, ny, z + dz);
    if (railShape(nid)!.exits.includes(opposite(f)) && how !== 'down') continue;
    const turned = shapeFor(withNew, x + dx, ny, z + dz, isPoweredRail(nid), look);
    if (turned !== nid && railShape(turned)!.exits.includes(opposite(f))) {
      edits.push([x + dx, ny, z + dz, turned]);
    }
  }
  return edits;
}
