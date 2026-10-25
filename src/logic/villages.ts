// Villages: a well in the middle, houses around it with their doors facing
// the well, gravel paths and torches (so no monsters spawn there). Like the
// rest of the world they come from the seed: every player gets the same
// village in the same place, and nothing needs to be saved.

import { CHUNK_SIZE, SEA_LEVEL, VILLAGES } from '../config';
import { AIR, COBBLE, GRAVEL, SANDSTONE } from './blocks';
import { hash2 } from './noise';
import {
  buildBounds,
  centerFootprint,
  expandShapes,
  placeBuild,
  type BuildBlock,
  type Shape,
} from './shapes';
import type { Biome } from './terrain';
import type { Edit } from './world';

/** What the village builder needs from the world generator. */
export interface Ground {
  readonly seed: number;
  heightAt(x: number, z: number): number;
  biomeAt(x: number, z: number): Biome;
}

export type Profession = 'farmer' | 'librarian' | 'smith' | 'shepherd';

export const PROFESSIONS: readonly Profession[] = ['farmer', 'librarian', 'smith', 'shepherd'];

export const PROFESSION_NAMES: Record<Profession, string> = {
  farmer: 'maanviljelijä',
  librarian: 'kirjastonhoitaja',
  smith: 'seppä',
  shepherd: 'lammaspaimen',
};

export interface House {
  /** Front door (x, z) and floor height. */
  x: number;
  y: number;
  z: number;
  /** Direction the house extends away from the well (0 = -z, 1 = +x, 2 = +z, 3 = -x). */
  facing: 0 | 1 | 2 | 3;
  profession: Profession;
}

export interface Village {
  /** The well in the middle. */
  x: number;
  y: number;
  z: number;
  biome: Biome;
  houses: House[];
}

const VILLAGE_BIOMES: readonly Biome[] = ['plains', 'desert', 'taiga', 'snowy'];
const FLAT_SAMPLES = 5;

/** The village whose region is (rx, rz), or null. Each region has at most one. */
export function villageInRegion(ground: Ground, rx: number, rz: number): Village | null {
  if (hash2(ground.seed + 21, rx, rz) >= VILLAGES.chance) return null;
  // Try a few places inside the region (away from its edges) until one fits.
  for (let tryNo = 0; tryNo < VILLAGES.tries; tryNo++) {
    const spot = villageSpot(ground, rx, rz, tryNo);
    if (spot) return spot;
  }
  return null;
}

function villageSpot(ground: Ground, rx: number, rz: number, tryNo: number): Village | null {
  const size = VILLAGES.regionSize;
  const margin = VILLAGES.radius + 4;
  const x = Math.floor(
    rx * size + margin + hash2(ground.seed + 22 + tryNo * 7, rx, rz) * (size - margin * 2),
  );
  const z = Math.floor(
    rz * size + margin + hash2(ground.seed + 23 + tryNo * 7, rx, rz) * (size - margin * 2),
  );
  const biome = ground.biomeAt(x, z);
  if (!VILLAGE_BIOMES.includes(biome)) return null;

  // Only on fairly flat dry land.
  const heights: number[] = [];
  const r = VILLAGES.radius;
  for (let i = 0; i < FLAT_SAMPLES; i++) {
    for (let j = 0; j < FLAT_SAMPLES; j++) {
      const sx = x - r + Math.round((i * 2 * r) / (FLAT_SAMPLES - 1));
      const sz = z - r + Math.round((j * 2 * r) / (FLAT_SAMPLES - 1));
      heights.push(ground.heightAt(sx, sz));
    }
  }
  const lowest = Math.min(...heights);
  if (lowest <= SEA_LEVEL + 1 || Math.max(...heights) - lowest > VILLAGES.maxBumpiness) return null;

  const y = ground.heightAt(x, z);
  const count =
    VILLAGES.minHouses +
    Math.floor(hash2(ground.seed + 24, rx, rz) * (VILLAGES.maxHouses - VILLAGES.minHouses + 1));
  const houses: House[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + hash2(ground.seed + 25, rx * 7 + i, rz) * 0.4;
    const distance = VILLAGES.houseDistance + hash2(ground.seed + 26, rx, rz * 7 + i) * 4;
    const hx = Math.round(x + Math.cos(angle) * distance);
    const hz = Math.round(z + Math.sin(angle) * distance);
    // Face away from the well along the main direction, so the door looks at it.
    const dx = hx - x;
    const dz = hz - z;
    const facing: 0 | 1 | 2 | 3 = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : dz > 0 ? 2 : 0;
    houses.push({
      x: hx,
      y: ground.heightAt(hx, hz),
      z: hz,
      facing,
      profession: PROFESSIONS[i % PROFESSIONS.length]!,
    });
  }
  return { x, y, z, biome, houses };
}

/** All villages whose region is within one region of (x, z). */
export function villagesNear(ground: Ground, x: number, z: number): Village[] {
  const size = VILLAGES.regionSize;
  const rx = Math.floor(x / size);
  const rz = Math.floor(z / size);
  const list: Village[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const v = villageInRegion(ground, rx + dx, rz + dz);
      if (v) list.push(v);
    }
  }
  return list;
}

interface Materials {
  wall: string;
  corner: string;
  floor: string;
  roof: string;
  flatRoof: boolean;
}

function materials(biome: Biome): Materials {
  switch (biome) {
    case 'desert':
      return {
        wall: 'sandstone',
        corner: 'sandstone',
        floor: 'sandstone',
        roof: 'sandstone',
        flatRoof: true,
      };
    case 'taiga':
    case 'snowy':
      return {
        wall: 'planks',
        corner: 'spruce_log',
        floor: 'cobblestone',
        roof: 'spruce_log',
        flatRoof: false,
      };
    default:
      return {
        wall: 'planks',
        corner: 'log',
        floor: 'cobblestone',
        roof: 'planks',
        flatRoof: false,
      };
  }
}

/** A small house, door at z = 0 (the front), 7 × 7 blocks. */
function houseShapes(m: Materials): Shape[] {
  const shapes: Shape[] = [
    // Clear the space first (trees, grass), then build.
    { shape: 'box', block: 'air', from: [0, 1, 0], to: [6, 8, 6] },
    { shape: 'box', block: m.floor, from: [0, 0, 0], to: [6, 0, 6] },
    { shape: 'walls', block: m.wall, from: [0, 1, 0], to: [6, 3, 6] },
    { shape: 'box', block: m.corner, from: [0, 1, 0], to: [0, 3, 0] },
    { shape: 'box', block: m.corner, from: [6, 1, 0], to: [6, 3, 0] },
    { shape: 'box', block: m.corner, from: [0, 1, 6], to: [0, 3, 6] },
    { shape: 'box', block: m.corner, from: [6, 1, 6], to: [6, 3, 6] },
    { shape: 'box', block: 'air', from: [3, 1, 0], to: [3, 2, 0] },
    { shape: 'box', block: 'glass', from: [1, 2, 0], to: [1, 2, 0] },
    { shape: 'box', block: 'glass', from: [5, 2, 0], to: [5, 2, 0] },
    { shape: 'box', block: 'glass', from: [0, 2, 3], to: [0, 2, 3] },
    { shape: 'box', block: 'glass', from: [6, 2, 3], to: [6, 2, 3] },
    { shape: 'box', block: 'torch', from: [2, 1, 1], to: [2, 1, 1] },
  ];
  if (m.flatRoof) shapes.push({ shape: 'box', block: m.roof, from: [0, 4, 0], to: [6, 4, 6] });
  else shapes.push({ shape: 'pyramid', block: m.roof, center: [3, 4, 3], radius: 4 });
  return shapes;
}

/** The well: cobblestone ring with water, posts and a little roof with torches. */
function wellShapes(m: Materials): Shape[] {
  return [
    { shape: 'box', block: 'air', from: [-2, 1, -2], to: [2, 5, 2] },
    { shape: 'walls', block: 'cobblestone', from: [-2, 0, -2], to: [2, 1, 2] },
    { shape: 'box', block: 'water', from: [-1, 0, -1], to: [1, 0, 1] },
    { shape: 'box', block: m.corner, from: [-2, 2, -2], to: [-2, 3, -2] },
    { shape: 'box', block: m.corner, from: [2, 2, -2], to: [2, 3, -2] },
    { shape: 'box', block: m.corner, from: [-2, 2, 2], to: [-2, 3, 2] },
    { shape: 'box', block: m.corner, from: [2, 2, 2], to: [2, 3, 2] },
    { shape: 'box', block: m.roof, from: [-2, 4, -2], to: [2, 4, 2] },
    { shape: 'box', block: 'torch', from: [-2, 5, -2], to: [-2, 5, -2] },
    { shape: 'box', block: 'torch', from: [2, 5, 2], to: [2, 5, 2] },
  ];
}

/** Centred left–right, with the front (the door side, smallest z) at z = 0. */
function frontAtOrigin(blocks: readonly BuildBlock[]): BuildBlock[] {
  const centred = centerFootprint(blocks);
  const minZ = buildBounds(centred).min[2];
  return centred.map(([x, y, z, id]) => [x, y, z - minZ, id]);
}

function offset(blocks: readonly BuildBlock[], x: number, y: number, z: number): Edit[] {
  return blocks.map(([bx, by, bz, id]) => [bx + x, by + y, bz + z, id]);
}

/** Every block of a village (well, houses, foundations, paths). */
export function villageBlocks(ground: Ground, v: Village): Edit[] {
  const m = materials(v.biome);
  const edits: Edit[] = offset(expandShapes(wellShapes(m)), v.x, v.y, v.z);
  const floorBlock = m.floor === 'sandstone' ? SANDSTONE : COBBLE;

  for (const h of v.houses) {
    // Door at the front: the house is centred and extends away from the well.
    const house = placeBuild(
      frontAtOrigin(expandShapes(houseShapes(m))),
      [h.x, h.y, h.z],
      h.facing,
    );
    // Fill under the floor down to the ground, so no house floats.
    for (const [x, y, z] of house) {
      if (y !== h.y) continue;
      for (let fy = y - 1; fy > ground.heightAt(x, z); fy--) edits.push([x, fy, z, floorBlock]);
    }
    edits.push(...house);
    // A gravel path from the well to the door.
    const steps = Math.max(Math.abs(h.x - v.x), Math.abs(h.z - v.z));
    for (let s = 3; s < steps; s++) {
      const px = Math.round(v.x + ((h.x - v.x) * s) / steps);
      const pz = Math.round(v.z + ((h.z - v.z) * s) / steps);
      const py = ground.heightAt(px, pz);
      edits.push([px, py, pz, v.biome === 'desert' ? SANDSTONE : GRAVEL], [px, py + 1, pz, AIR]);
    }
  }
  return edits;
}

/** Village blocks grouped by chunk (cached by the world generator). */
export function villageChunks(ground: Ground, v: Village): Map<string, Edit[]> {
  const byChunk = new Map<string, Edit[]>();
  for (const e of villageBlocks(ground, v)) {
    const key = `${Math.floor(e[0] / CHUNK_SIZE)},${Math.floor(e[2] / CHUNK_SIZE)}`;
    let list = byChunk.get(key);
    if (!list) {
      list = [];
      byChunk.set(key, list);
    }
    list.push(e);
  }
  return byChunk;
}
