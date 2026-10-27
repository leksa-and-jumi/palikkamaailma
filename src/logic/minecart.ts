// A minecart rolling along the track like in Minecraft: it follows straight
// rails, curves and slopes, slows down by itself, speeds up downhill, a
// powered rail with power pushes it and one without power stops it.

import { CARTS } from '../config';
import { FACING_STEPS, isSolid, type Facing, type RailShape } from './blocks';
import { isPoweredRail, opposite, railShape } from './rails';

type Get = (x: number, y: number, z: number) => number;

export interface CartState {
  /** The rail block the cart is in. */
  cell: [number, number, number];
  /** Position on the map (the middle of the cart). */
  x: number;
  z: number;
  /** Which way it is rolling (or would roll). */
  heading: Facing;
  /** Blocks per second (never below zero: the heading turns instead). */
  speed: number;
}

export interface CartWorld {
  getBlock: Get;
  /** The block as drawn (a lit powered rail has power). */
  shownBlock: Get;
}

const dir = (f: Facing) => FACING_STEPS[f]!;

/** The height of the cart's wheels in its rail block (slopes rise). */
export function cartY(cart: CartState, get: Get): number {
  const [cx, cy, cz] = cart.cell;
  const shape = railShape(get(cx, cy, cz));
  if (shape?.up === undefined) return cy;
  const [ux, , uz] = dir(shape.up);
  const t = 0.5 + (cart.x - cx - 0.5) * ux + (cart.z - cz - 0.5) * uz;
  return cy + Math.max(0, Math.min(1, t));
}

/** A cart standing still in the middle of the rail here. */
export function placeCart(get: Get, x: number, y: number, z: number): CartState | null {
  const shape = railShape(get(x, y, z));
  if (!shape) return null;
  return { cell: [x, y, z], x: x + 0.5, z: z + 0.5, heading: shape.exits[0], speed: 0 };
}

/** The rail block a cart leaving `cell` through side `f` rolls into, or null. */
function nextCell(
  get: Get,
  cell: readonly number[],
  shape: RailShape,
  f: Facing,
): [number, number, number] | null {
  const [dx, , dz] = dir(f);
  const nx = cell[0]! + dx;
  const nz = cell[2]! + dz;
  const ny = cell[1]! + (shape.up === f ? 1 : 0);
  if (railShape(get(nx, ny, nz))) return [nx, ny, nz];
  // Down a slope that climbs back towards us.
  const below = railShape(get(nx, ny - 1, nz));
  if (below?.up === opposite(f)) return [nx, ny - 1, nz];
  return null;
}

/** Of the two ways, the one closest to the direction (dx, dz). */
export function closestExit(shape: RailShape, dx: number, dz: number): Facing {
  const score = (f: Facing) => dir(f)[0] * dx + dir(f)[2] * dz;
  return score(shape.exits[0]) >= score(shape.exits[1]) ? shape.exits[0] : shape.exits[1];
}

/**
 * Moves the cart for dt seconds. `push` speeds it up towards a direction
 * (a rider pressing forward, or someone walking into it).
 */
export function stepCart(
  cart: CartState,
  world: CartWorld,
  dt: number,
  push: { dx: number; dz: number; accel: number } | null = null,
): void {
  const get = world.getBlock;
  let [cx, cy, cz] = cart.cell;
  let id = get(cx, cy, cz);
  let shape = railShape(id);
  if (!shape) {
    // The rail is gone: the cart stops.
    cart.speed = 0;
    return;
  }

  // Which way the track wants to go.
  if (!shape.exits.includes(cart.heading) && !shape.exits.includes(opposite(cart.heading))) {
    cart.heading = closestExit(shape, dir(cart.heading)[0], dir(cart.heading)[2]);
  }
  if (push && push.accel > 0) {
    if (cart.speed < CARTS.stopSpeed) cart.heading = closestExit(shape, push.dx, push.dz);
    const along = dir(cart.heading)[0] * push.dx + dir(cart.heading)[2] * push.dz;
    if (along > 0.3) {
      cart.speed = Math.min(cart.speed + push.accel * dt, Math.max(cart.speed, CARTS.pushSpeed));
    }
  }

  // Slopes: slower uphill, faster downhill.
  if (shape.up !== undefined) {
    if (cart.heading === shape.up) cart.speed -= CARTS.slopeAccel * dt;
    else if (cart.heading === opposite(shape.up)) cart.speed += CARTS.slopeAccel * dt;
  }
  // Powered rails: with power they push, without power they stop the cart.
  if (isPoweredRail(id)) {
    const powered = world.shownBlock(cx, cy, cz) !== id;
    if (powered) {
      if (cart.speed < 0.05) startAwayFromWall(cart, get, shape);
      else cart.speed = Math.min(CARTS.maxSpeed, cart.speed + CARTS.boost * dt);
    } else {
      cart.speed *= Math.exp(-CARTS.brake * dt);
      if (cart.speed < CARTS.stopSpeed) cart.speed = 0;
    }
  } else {
    cart.speed = Math.max(0, cart.speed * Math.exp(-CARTS.friction * dt) - CARTS.drag * dt);
  }
  if (cart.speed < 0) {
    cart.heading = opposite(cart.heading);
    cart.speed = -cart.speed;
  }
  cart.speed = Math.min(cart.speed, CARTS.maxSpeed);

  let move = cart.speed * dt;
  for (let guard = 0; move > 1e-6 && guard < 8; guard++) {
    const centreX = cx + 0.5;
    const centreZ = cz + 0.5;
    const [hx, , hz] = dir(cart.heading);
    // How far past the middle we are, going this way (negative = not there yet).
    const past = (cart.x - centreX) * hx + (cart.z - centreZ) * hz;
    if (past < 0) {
      // Roll to the middle; a curve turns us there.
      const step = Math.min(move, -past);
      cart.x += hx * step;
      cart.z += hz * step;
      move -= step;
      if (step >= -past - 1e-9 && isCurve(shape) && !shape.exits.includes(cart.heading)) {
        cart.x = centreX;
        cart.z = centreZ;
        const from = opposite(cart.heading);
        cart.heading = shape.exits[0] === from ? shape.exits[1] : shape.exits[0];
      }
      continue;
    }
    // From the middle to the edge.
    const toEdge = 0.5 - past;
    const step = Math.min(move, toEdge);
    cart.x += hx * step;
    cart.z += hz * step;
    // Keep on the middle line of the track.
    if (hx !== 0) cart.z = centreZ;
    else cart.x = centreX;
    move -= step;
    if (move <= 1e-9) break;
    const next = nextCell(get, [cx, cy, cz], shape, cart.heading);
    if (!next) {
      // End of the track: stop just before the edge.
      cart.x -= hx * 0.02;
      cart.z -= hz * 0.02;
      cart.speed = 0;
      break;
    }
    [cx, cy, cz] = next;
    id = get(cx, cy, cz);
    shape = railShape(id)!;
  }
  cart.cell = [cx, cy, cz];
}

function isCurve(shape: RailShape): boolean {
  return shape.exits[0] % 2 !== shape.exits[1] % 2;
}

/** A powered rail starts a standing cart if one end has a wall (like Minecraft). */
function startAwayFromWall(cart: CartState, get: Get, shape: RailShape): void {
  const [cx, cy, cz] = cart.cell;
  for (const f of shape.exits) {
    const [dx, , dz] = dir(f);
    if (isSolid(get(cx + dx, cy, cz + dz))) {
      cart.heading = opposite(f);
      cart.speed = CARTS.startSpeed;
      return;
    }
  }
}
