// Items lying on the ground: they fall, land and wait to be picked up.

import { DROPS } from '../config';
import type { DroppedItem } from './protocol';

export interface LiveDrop extends DroppedItem {
  /** Seconds since it appeared on this computer. */
  age: number;
  resting: boolean;
}

/** Half the size of the little item, so it sits on top of the ground. */
const RADIUS = 0.125;
const AIR_DRAG = 2;

export function liveDrop(drop: DroppedItem): LiveDrop {
  return { ...drop, p: [...drop.p], v: [...drop.v], age: 0, resting: false };
}

/** Moves an item: gravity, drag and landing on solid blocks. */
export function stepDrop(
  d: LiveDrop,
  dt: number,
  isSolid: (x: number, y: number, z: number) => boolean,
): void {
  d.age += dt;
  if (d.resting) {
    // Start falling again if the block below was removed.
    if (!isSolid(Math.floor(d.p[0]), Math.floor(d.p[1] - RADIUS - 0.01), Math.floor(d.p[2]))) {
      d.resting = false;
    }
    return;
  }
  const drag = Math.max(0, 1 - AIR_DRAG * dt);
  d.v[0] *= drag;
  d.v[2] *= drag;
  d.v[1] -= DROPS.gravity * dt;

  const nx = d.p[0] + d.v[0] * dt;
  const nz = d.p[2] + d.v[2] * dt;
  const cy = Math.floor(d.p[1]);
  if (!isSolid(Math.floor(nx), cy, Math.floor(d.p[2]))) d.p[0] = nx;
  else d.v[0] = 0;
  if (!isSolid(Math.floor(d.p[0]), cy, Math.floor(nz))) d.p[2] = nz;
  else d.v[2] = 0;

  const ny = d.p[1] + d.v[1] * dt;
  const below = Math.floor(ny - RADIUS);
  if (d.v[1] < 0 && isSolid(Math.floor(d.p[0]), below, Math.floor(d.p[2]))) {
    d.p[1] = below + 1 + RADIUS;
    d.v = [0, 0, 0];
    d.resting = true;
  } else {
    d.p[1] = Math.max(-10, ny);
  }
}

/** Can the player at feet (x, y, z) pick this up now? */
export function canPickUp(d: LiveDrop, x: number, y: number, z: number): boolean {
  if (d.age < DROPS.pickupDelay) return false;
  const dx = d.p[0] - x;
  const dy = d.p[1] - (y + 0.8);
  const dz = d.p[2] - z;
  return dx * dx + dy * dy + dz * dz <= DROPS.pickupDistance * DROPS.pickupDistance;
}

/** Has the item been lying around too long? */
export function isExpired(d: DroppedItem, now: number): boolean {
  return now - d.time > DROPS.lifetime * 1000;
}
