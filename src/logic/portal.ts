// Nether portals like in Minecraft: an obsidian frame (inside 2–21 wide and
// 3–21 tall) lit with flint and steel fills with portal blocks. Standing in
// one takes you to the Nether, where a portal is found or built.

import { AIR, NETHER_PORTAL, OBSIDIAN } from './blocks';
import type { Edit } from './world';

type Get = (x: number, y: number, z: number) => number;
type Pos = [number, number, number];

const MIN_W = 2;
const MAX = 21;
const MIN_H = 3;

export function isPortal(id: number): boolean {
  return id === NETHER_PORTAL || id === NETHER_PORTAL + 1;
}

/**
 * The portal blocks for a frame around (x, y, z), trying both directions,
 * or null if there is no complete frame.
 */
export function lightPortal(get: Get, x: number, y: number, z: number): Edit[] | null {
  for (const axis of [0, 1] as const) {
    const cells = frameInside(get, x, y, z, axis);
    if (cells) return cells.map(([cx, cy, cz]): Edit => [cx, cy, cz, NETHER_PORTAL + axis]);
  }
  return null;
}

/** The empty cells inside an obsidian frame (axis 0 = frame along x, 1 = along z). */
function frameInside(get: Get, x: number, y: number, z: number, axis: 0 | 1): Pos[] | null {
  const free = (id: number) => id === AIR;
  // Steps along the frame's width.
  const at = (w: number, h: number) => (axis === 0 ? get(x + w, h, z) : get(x, h, z + w));
  if (!free(at(0, y))) return null;
  let bottom = y;
  while (free(at(0, bottom - 1))) if (--bottom < y - MAX) return null;
  if (at(0, bottom - 1) !== OBSIDIAN) return null;
  let left = 0;
  while (free(at(left - 1, bottom))) if (--left < -MAX) return null;
  if (at(left - 1, bottom) !== OBSIDIAN) return null;
  let width = 0;
  while (free(at(left + width, bottom))) if (++width > MAX) return null;
  if (at(left + width, bottom) !== OBSIDIAN || width < MIN_W) return null;
  let height = 0;
  while (free(at(left, bottom + height))) if (++height > MAX) return null;
  if (at(left, bottom + height) !== OBSIDIAN || height < MIN_H) return null;
  const cells: Pos[] = [];
  for (let w = left; w < left + width; w++) {
    if (at(w, bottom - 1) !== OBSIDIAN || at(w, bottom + height) !== OBSIDIAN) return null;
    for (let h = bottom; h < bottom + height; h++) {
      if (!free(at(w, h))) return null;
      cells.push(axis === 0 ? [x + w, h, z] : [x, h, z + w]);
    }
  }
  for (let h = bottom; h < bottom + height; h++) {
    if (at(left - 1, h) !== OBSIDIAN || at(left + width, h) !== OBSIDIAN) return null;
  }
  return cells;
}

/** All portal blocks joined to the one at (x, y, z). */
export function connectedPortal(get: Get, x: number, y: number, z: number): Pos[] {
  if (!isPortal(get(x, y, z))) return [];
  const seen = new Set<string>([`${x},${y},${z}`]);
  const out: Pos[] = [[x, y, z]];
  for (let i = 0; i < out.length; i++) {
    const [px, py, pz] = out[i]!;
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const) {
      const n: Pos = [px + dx, py + dy, pz + dz];
      const k = n.join(',');
      if (seen.has(k) || !isPortal(get(...n))) continue;
      seen.add(k);
      out.push(n);
    }
  }
  return out;
}

/**
 * A new portal with its bottom-left inside block at (x, y, z): an obsidian
 * frame, a little obsidian floor to stand on and air around it.
 */
export function buildPortal(x: number, y: number, z: number): Edit[] {
  const edits: Edit[] = [];
  // Room to step out, then the platform under it.
  for (let dx = -1; dx <= 2; dx++) {
    for (const dz of [-1, 1]) {
      edits.push([x + dx, y - 1, z + dz, OBSIDIAN]);
      for (let dy = 0; dy < 3; dy++) edits.push([x + dx, y + dy, z + dz, AIR]);
    }
  }
  for (let dx = -1; dx <= 2; dx++) {
    for (let dy = -1; dy <= 3; dy++) {
      const frame = dx === -1 || dx === 2 || dy === -1 || dy === 3;
      edits.push([x + dx, y + dy, z, frame ? OBSIDIAN : NETHER_PORTAL]);
    }
  }
  return edits;
}

/**
 * The nearest portal block within `radius` of (x, z) (any height), as the
 * lowest block of its column, or null.
 */
export function findPortal(
  get: Get,
  x: number,
  z: number,
  radius: number,
  maxY: number,
): Pos | null {
  let best: Pos | null = null;
  let bestD = Infinity;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = dx * dx + dz * dz;
      if (d >= bestD || d > radius * radius) continue;
      for (let y = 1; y < maxY; y++) {
        if (!isPortal(get(x + dx, y, z + dz)) || isPortal(get(x + dx, y - 1, z + dz))) continue;
        best = [x + dx, y, z + dz];
        bestD = d;
        break;
      }
    }
  }
  return best;
}
