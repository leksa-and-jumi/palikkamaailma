// Finds a safe place to start: dry land, open sky, room to stand.

import { SEA_LEVEL } from '../config';
import { getBlockType } from './blocks';
import type { VoxelWorld } from './world';

/** Spawn search goes outwards in steps of this many blocks. */
const SEARCH_STEP = 4;
const SEARCH_RADIUS = 1024;

function canStandAt(world: VoxelWorld, x: number, z: number): number | null {
  const col = world.terrain.column(x, z);
  if (col.height <= SEA_LEVEL || col.biome === 'mountains') return null;
  const y = world.surfaceY(x, z);
  const ground = getBlockType(world.getBlock(x, y, z));
  if (!ground.solid || ground.key.endsWith('leaves') || ground.key === 'cactus') return null;
  for (const dy of [1, 2]) {
    const b = getBlockType(world.getBlock(x, y + dy, z));
    if (b.solid || b.liquid) return null;
  }
  return y + 1;
}

/** Feet position of a good starting point near (0, 0). */
export function findSpawn(world: VoxelWorld): [number, number, number] {
  for (let r = 0; r <= SEARCH_RADIUS; r += SEARCH_STEP) {
    for (let dz = -r; dz <= r; dz += SEARCH_STEP) {
      for (let dx = -r; dx <= r; dx += SEARCH_STEP) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const y = canStandAt(world, dx, dz);
        if (y !== null) return [dx + 0.5, y, dz + 0.5];
      }
    }
  }
  return [0.5, world.surfaceY(0, 0) + 1, 0.5];
}
