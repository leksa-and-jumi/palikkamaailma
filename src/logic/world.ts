// The whole block world: generated chunks plus the blocks players changed.
// Chunks are made when needed and forgotten when far away; the edits stay.

import { CHUNK_SIZE, NETHER, WORLD_HEIGHT, WORLD_LIMIT } from '../config';
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

/** Is this x in the Nether (the band far to the east)? */
export function isNether(x: number): boolean {
  return Math.abs(x - NETHER.offset) < NETHER.halfSize + CHUNK_SIZE * 4;
}

export function isInsideWorld(x: number, y: number, z: number): boolean {
  if (y < 0 || y >= WORLD_HEIGHT) return false;
  if (Math.abs(x - NETHER.offset) < NETHER.halfSize) return Math.abs(z) < NETHER.halfSize;
  return Math.abs(x) < WORLD_LIMIT && Math.abs(z) < WORLD_LIMIT;
}

export function chunkOf(v: number): number {
  return Math.floor(v / CHUNK_SIZE);
}

/** The y of the highest non-air block in a chunk, or -1. */
function highestBlock(chunk: Uint8Array): number {
  for (let i = chunk.length - 1; i >= 0; i--) {
    if (chunk[i] !== AIR) return Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
  }
  return -1;
}

export class VoxelWorld {
  readonly terrain: TerrainGenerator;
  private readonly chunks = new Map<string, Uint8Array>();
  /** One above the highest non-air block of each chunk in memory (for faster drawing). */
  private readonly tops = new Map<string, number>();
  /** Blocks changed by players, grouped by chunk. */
  private readonly editsByChunk = new Map<string, Map<string, Edit>>();
  /**
   * How redstone things look right now (lit lamp, powered dust), by chunk.
   * Only for drawing: the real block stays the same, and nothing is sent.
   */
  private readonly shown = new Map<string, Map<string, Edit>>();
  /** Chunks whose mesh must be rebuilt. */
  readonly dirtyChunks = new Set<string>();
  /** Called after every block change (from players, the network or a save). */
  onChange: ((x: number, y: number, z: number, old: number, id: number) => void) | null = null;
  private lastKey = '';
  private lastChunk: Uint8Array | null = null;

  constructor(readonly seed: number) {
    this.terrain = new TerrainGenerator(seed);
  }

  /** Every changed block (for saving). */
  *edits(): IterableIterator<Edit> {
    for (const chunkEdits of this.editsByChunk.values()) yield* chunkEdits.values();
  }

  get editCount(): number {
    let n = 0;
    for (const chunkEdits of this.editsByChunk.values()) n += chunkEdits.size;
    return n;
  }

  /** The chunk's blocks; generated (plus edits) the first time it is needed. */
  getChunk(cx: number, cz: number): Uint8Array {
    const key = chunkKey(cx, cz);
    if (key === this.lastKey && this.lastChunk) return this.lastChunk;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.terrain.generateChunk(cx, cz);
      const edits = this.editsByChunk.get(key);
      if (edits) {
        for (const [x, y, z, id] of edits.values()) {
          chunk[chunkIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] = id;
        }
      }
      this.chunks.set(key, chunk);
      this.tops.set(key, highestBlock(chunk) + 1);
    }
    this.lastKey = key;
    this.lastChunk = chunk;
    return chunk;
  }

  /** Nothing in this chunk is at this height or higher (all air). */
  chunkTop(cx: number, cz: number): number {
    this.getChunk(cx, cz);
    return this.tops.get(chunkKey(cx, cz)) ?? WORLD_HEIGHT;
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return BEDROCK;
    if (!isInsideWorld(x, y, z)) return AIR;
    const cx = chunkOf(x);
    const cz = chunkOf(z);
    const chunk = this.getChunk(cx, cz);
    return chunk[chunkIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)]!;
  }

  /** Changes one block. Returns false if nothing changed. */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (!isInsideWorld(x, y, z)) return false;
    const old = this.getBlock(x, y, z);
    if (old === id) return false;
    if (!getBlockType(old).breakable) return false;
    const cx = chunkOf(x);
    const cz = chunkOf(z);
    const key = chunkKey(cx, cz);
    this.getChunk(cx, cz)[chunkIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] = id;
    if (id !== AIR && y + 1 > (this.tops.get(key) ?? 0)) this.tops.set(key, y + 1);
    let edits = this.editsByChunk.get(key);
    if (!edits) {
      edits = new Map();
      this.editsByChunk.set(key, edits);
    }
    edits.set(editKey(x, y, z), [x, y, z, id]);
    this.markDirty(cx, cz);
    this.onChange?.(x, y, z, old, id);
    return true;
  }

  /** Light and faces change up to LIGHT range away, so redraw the neighbours too. */
  private markDirty(cx: number, cz: number): void {
    this.dirtyChunks.add(chunkKey(cx, cz));
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx !== 0 || dz !== 0) && this.hasChunk(cx + dx, cz + dz)) {
          this.dirtyChunks.add(chunkKey(cx + dx, cz + dz));
        }
      }
    }
  }

  /** Shows the block as another one (the redstone look), or the real one with null. */
  setShown(x: number, y: number, z: number, id: number | null): void {
    const cx = chunkOf(x);
    const cz = chunkOf(z);
    const key = chunkKey(cx, cz);
    let looks = this.shown.get(key);
    const k = editKey(x, y, z);
    if (id === null) {
      if (!looks?.delete(k)) return;
      if (looks.size === 0) this.shown.delete(key);
    } else {
      if (looks?.get(k)?.[3] === id) return;
      if (!looks) {
        looks = new Map();
        this.shown.set(key, looks);
      }
      looks.set(k, [x, y, z, id]);
    }
    if (this.hasChunk(cx, cz)) this.markDirty(cx, cz);
  }

  /** Redstone looks in one chunk. */
  shownIn(cx: number, cz: number): Iterable<Edit> {
    return this.shown.get(chunkKey(cx, cz))?.values() ?? [];
  }

  /** The block as it is drawn (the redstone look if it has one). */
  shownBlock(x: number, y: number, z: number): number {
    const look = this.shown.get(chunkKey(chunkOf(x), chunkOf(z)))?.get(editKey(x, y, z));
    return look ? look[3] : this.getBlock(x, y, z);
  }

  /** The block for bumping into: redstone can open doors and push out pistons. */
  solidLook(x: number, y: number, z: number): number {
    return this.shown.size === 0 ? this.getBlock(x, y, z) : this.shownBlock(x, y, z);
  }

  /** Applies many edits (from the network or a save). Returns how many changed. */
  applyEdits(edits: Iterable<Edit>): number {
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

  /** Forgets generated chunks further than `distance` chunks away (edits are kept). */
  unloadFarChunks(cx: number, cz: number, distance: number): void {
    for (const key of this.chunks.keys()) {
      const [x, z] = key.split(',').map(Number) as [number, number];
      if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) > distance) {
        this.chunks.delete(key);
        this.tops.delete(key);
        this.dirtyChunks.delete(key);
        if (key === this.lastKey) this.lastChunk = null;
      }
    }
  }
}
