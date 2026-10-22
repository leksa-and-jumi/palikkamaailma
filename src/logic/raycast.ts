// Finds the block you are looking at (walks the grid one block at a time).

export interface RayHit {
  /** The block that was hit. */
  x: number;
  y: number;
  z: number;
  /** Which side was hit: a new block goes to (x + nx, y + ny, z + nz). */
  nx: number;
  ny: number;
  nz: number;
  distance: number;
}

/**
 * Casts a ray from (ox, oy, oz) along (dx, dy, dz) and returns the first block
 * for which `hits` is true, or null if nothing is hit within maxDistance.
 */
export function raycast(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
  hits: (x: number, y: number, z: number) => boolean,
): RayHit | null {
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return null;
  dx /= length;
  dy /= length;
  dz /= length;

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let distance = 0;

  while (distance <= maxDistance) {
    if (hits(x, y, z)) return { x, y, z, nx, ny, nz, distance };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      distance = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      distance = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      distance = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }
  return null;
}
