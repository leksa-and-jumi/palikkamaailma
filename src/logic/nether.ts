// The Nether: big hot caves of netherrack between a bedrock floor and roof,
// a lava sea at the bottom, glowstone hanging from the ceiling, soul sand
// and quartz. Like the normal world it comes from the seed.

import { CHUNK_SIZE, NETHER } from '../config';
import { AIR, BEDROCK, GRAVEL, LAMP, LAVA, NETHERRACK, QUARTZ_ORE, SOUL_SAND } from './blocks';
import { createNoise2D, createNoise3D, hash2, hash3 } from './noise';
import { CHUNK_VOLUME, chunkIndex } from './terrain';

/** Overworld (x, z) → the matching Nether place (one Nether block = 8 blocks). */
export function toNether(x: number, z: number): [number, number] {
  return [NETHER.offset + Math.floor(x / NETHER.scale), Math.floor(z / NETHER.scale)];
}

/** Nether (x, z) → the matching overworld place. */
export function toOverworld(x: number, z: number): [number, number] {
  return [(x - NETHER.offset) * NETHER.scale, z * NETHER.scale];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The noise is worked out on a coarse grid and blended between (much faster). */
const STEP_XZ = 4;
const STEP_Y = 8;
const QUARTZ_CHANCE = 0.02;
const GLOWSTONE_TRIES = 3;

export class NetherGenerator {
  private readonly big: (x: number, y: number, z: number) => number;
  private readonly small: (x: number, y: number, z: number) => number;
  private readonly patches: (x: number, z: number) => number;

  constructor(readonly seed: number) {
    this.big = createNoise3D(seed ^ 0x4e455448);
    this.small = createNoise3D(seed ^ 0x52524b21);
    this.patches = createNoise2D(seed ^ 0x534f554c);
  }

  /** Above 0 = netherrack, below = open cave. */
  density(x: number, y: number, z: number): number {
    const n = this.big(x / 56, y / 26, z / 56) * 0.75 + this.small(x / 20, y / 12, z / 20) * 0.25;
    // Closed near the floor and the roof, open in the middle.
    const edge = smoothstep(16, 2, y) * 1.4 + smoothstep(100, NETHER.roof - 2, y) * 1.4 - 0.12;
    return n + edge;
  }

  generateChunk(cx: number, cz: number): Uint8Array {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const nx = CHUNK_SIZE / STEP_XZ + 1;
    const ny = Math.ceil(NETHER.roof / STEP_Y) + 1;
    const grid = new Float32Array(nx * nx * ny);
    for (let gy = 0; gy < ny; gy++) {
      for (let gz = 0; gz < nx; gz++) {
        for (let gx = 0; gx < nx; gx++) {
          grid[gx + gz * nx + gy * nx * nx] = this.density(
            x0 + gx * STEP_XZ,
            gy * STEP_Y,
            z0 + gz * STEP_XZ,
          );
        }
      }
    }
    const at = (gx: number, gy: number, gz: number) => grid[gx + gz * nx + gy * nx * nx]!;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const gx = Math.floor(lx / STEP_XZ);
        const gz = Math.floor(lz / STEP_XZ);
        const fx = (lx % STEP_XZ) / STEP_XZ;
        const fz = (lz % STEP_XZ) / STEP_XZ;
        const soul = this.patches(x / 24, z / 24) > 0.35;
        for (let y = 0; y <= NETHER.roof; y++) {
          let id: number;
          if (y === 0 || y === NETHER.roof) id = BEDROCK;
          else if (y < 4 && hash3(this.seed + 41, x, y, z) < 0.5 / y) id = BEDROCK;
          else if (
            y > NETHER.roof - 4 &&
            hash3(this.seed + 42, x, y, z) < 0.5 / (NETHER.roof - y)
          ) {
            id = BEDROCK;
          } else {
            const gy = Math.floor(y / STEP_Y);
            const fy = (y % STEP_Y) / STEP_Y;
            const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
            const d = lerp(
              lerp(
                lerp(at(gx, gy, gz), at(gx + 1, gy, gz), fx),
                lerp(at(gx, gy, gz + 1), at(gx + 1, gy, gz + 1), fx),
                fz,
              ),
              lerp(
                lerp(at(gx, gy + 1, gz), at(gx + 1, gy + 1, gz), fx),
                lerp(at(gx, gy + 1, gz + 1), at(gx + 1, gy + 1, gz + 1), fx),
                fz,
              ),
              fy,
            );
            if (d <= 0) id = y <= NETHER.lavaLevel ? LAVA : AIR;
            else if (hash3(this.seed + 43, x >> 1, y >> 1, z >> 1) < QUARTZ_CHANCE) {
              id = hash3(this.seed + 44, x, y, z) < 0.6 ? QUARTZ_ORE : NETHERRACK;
            } else id = NETHERRACK;
          }
          blocks[chunkIndex(lx, y, lz)] = id;
        }
        // Soul sand and gravel shores on top of the ground near the lava sea.
        for (let y = NETHER.lavaLevel - 2; y < NETHER.lavaLevel + 18; y++) {
          const i = chunkIndex(lx, y, lz);
          if (blocks[i] !== NETHERRACK || blocks[chunkIndex(lx, y + 1, lz)] !== AIR) continue;
          if (soul) blocks[i] = SOUL_SAND;
          else if (y <= NETHER.lavaLevel + 2 && hash2(this.seed + 45, x, z) < 0.5)
            blocks[i] = GRAVEL;
        }
      }
    }

    // Glowstone hangs from the ceiling in clumps.
    for (let n = 0; n < GLOWSTONE_TRIES; n++) {
      const lx = Math.floor(hash3(this.seed + 46, cx, n, cz) * CHUNK_SIZE);
      const lz = Math.floor(hash3(this.seed + 47, cx, n, cz) * CHUNK_SIZE);
      for (let y = NETHER.roof - 6; y > NETHER.lavaLevel + 20; y--) {
        if (
          blocks[chunkIndex(lx, y, lz)] !== AIR ||
          blocks[chunkIndex(lx, y + 1, lz)] !== NETHERRACK
        ) {
          continue;
        }
        const size = 3 + Math.floor(hash3(this.seed + 48, cx, n, cz) * 6);
        for (let k = 0; k < size; k++) {
          const dx = Math.floor(hash3(this.seed + 49, cx * 7 + k, n, cz) * 3) - 1;
          const dz = Math.floor(hash3(this.seed + 50, cx, n, cz * 7 + k) * 3) - 1;
          const bx = Math.min(CHUNK_SIZE - 1, Math.max(0, lx + dx));
          const bz = Math.min(CHUNK_SIZE - 1, Math.max(0, lz + dz));
          const by = y - Math.floor(k / 3);
          if (blocks[chunkIndex(bx, by, bz)] === AIR) blocks[chunkIndex(bx, by, bz)] = LAMP;
        }
        break;
      }
    }
    return blocks;
  }

  /** A good floor for a portal near (x, z): air above netherrack, away from lava, or null. */
  floorNear(
    getBlock: (x: number, y: number, z: number) => number,
    x: number,
    z: number,
  ): number | null {
    for (let y = NETHER.lavaLevel + 2; y < NETHER.roof - 6; y++) {
      const floor = getBlock(x, y - 1, z);
      if (floor !== NETHERRACK && floor !== SOUL_SAND) continue;
      let room = true;
      for (let dy = 0; dy < 4 && room; dy++) if (getBlock(x, y + dy, z) !== AIR) room = false;
      if (room) return y;
    }
    return null;
  }
}
