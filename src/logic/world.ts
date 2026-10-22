// The whole block world: generated chunks plus the blocks players changed.

import { CHUNK_SIZE, WORLD_CHUNKS, WORLD_HEIGHT, WORLD_SIZE } from '../config';
import { AIR, BEDROCK, getBlockType } from './blocks';
import { TerrainGenerator, chunkIndex } from './terrain';

/** One changed block: [x, y, z, blockId]. */
export type Edit = [number, number, number, number];

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function editKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function isInsideWorld(x: number, y: number, z: number): boolean {
  return x >= 0 && z >= 0 && y >= 0 && x < WORLD_SIZE && z < WORLD_SIZE && y < WORLD_HEIGHT;
}

export function isChunkInsideWorld(cx: number, cz: number): boolean {
  return cx >= 0 && cz >= 0 && cx < WORLD_CHUNKS && cz < WORLD_CHUNKS;
}

export class VoxelWorld {
  readonly terrain: TerrainGenerator;
  private readonly chunks = new Map<string, Uint8Array>();
  /** Blocks changed by players, so they can be saved. */
  readonly edits = new Map<string, Edit>();
  /** Chunks whose mesh must be rebuilt. */
  readonly dirtyChunks = new Set<string>();

  constructor(readonly seed: number) {
    this.terrain = new TerrainGenerator(seed);
  }

  /** The chunk's blocks; generated the first time it is needed. */
  getChunk(cx: number, cz: number): Uint8Array {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.terrain.generateChunk(cx, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return BEDROCK;
    if (!isInsideWorld(x, y, z)) return AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    return chunk[chunkIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)]!;
  }

  /** Changes one block. Returns false if nothing changed. */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (!isInsideWorld(x, y, z)) return false;
    const old = this.getBlock(x, y, z);
    if (old === id) return false;
    if (!getBlockType(old).breakable) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    this.getChunk(cx, cz)[chunkIndex(lx, y, lz)] = id;
    this.edits.set(editKey(x, y, z), [x, y, z, id]);

    this.dirtyChunks.add(chunkKey(cx, cz));
    // A block on a chunk edge changes what the neighbour chunk shows too.
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  /** Applies many edits (from the network or a save). Returns how many changed. */
  applyEdits(edits: readonly Edit[]): number {
    let changed = 0;
    for (const [x, y, z, id] of edits) {
      if (this.setBlock(x, y, z, id)) changed++;
    }
    return changed;
  }

  /** The y of the highest solid block in a column, or -1. */
  surfaceY(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (getBlockType(this.getBlock(x, y, z)).solid) return y;
    }
    return -1;
  }

  private markDirty(cx: number, cz: number): void {
    if (isChunkInsideWorld(cx, cz) && this.hasChunk(cx, cz)) {
      this.dirtyChunks.add(chunkKey(cx, cz));
    }
  }
}
