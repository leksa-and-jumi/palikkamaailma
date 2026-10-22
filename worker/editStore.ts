// Changed blocks are stored one database row per chunk (a packed list),
// not one row per block. Cloudflare counts every row read and written, so
// this keeps a room cheap: placing a block touches one row, and a new
// player loads the world with one read per changed chunk.

import { CHUNK_SIZE } from '../src/config';
import type { Edit } from '../src/logic/world';

/** Four 32-bit numbers per edit: x, y, z, block. */
const INTS_PER_EDIT = 4;

export function chunkKeyOf(x: number, z: number): string {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
}

export function packEdits(edits: Iterable<Edit>): Uint8Array {
  const list = [...edits];
  const ints = new Int32Array(list.length * INTS_PER_EDIT);
  list.forEach(([x, y, z, b], i) => ints.set([x, y, z, b], i * INTS_PER_EDIT));
  return new Uint8Array(ints.buffer);
}

export function unpackEdits(data: ArrayBuffer | Uint8Array): Edit[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // Copy so the numbers are aligned for Int32Array.
  const ints = new Int32Array(bytes.slice().buffer);
  const edits: Edit[] = [];
  for (let i = 0; i + INTS_PER_EDIT <= ints.length; i += INTS_PER_EDIT) {
    edits.push([ints[i]!, ints[i + 1]!, ints[i + 2]!, ints[i + 3]!]);
  }
  return edits;
}

/** Groups edits by chunk so each chunk row is read and written once. */
export function groupByChunk(edits: readonly Edit[]): Map<string, Edit[]> {
  const groups = new Map<string, Edit[]>();
  for (const edit of edits) {
    const key = chunkKeyOf(edit[0], edit[2]);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(edit);
  }
  return groups;
}

/** The edits of one chunk, keyed by block position. */
export type ChunkEdits = Map<string, Edit>;

export function toChunkEdits(edits: readonly Edit[]): ChunkEdits {
  return new Map(edits.map((e) => [`${e[0]},${e[1]},${e[2]}`, e]));
}

/** Applies new edits to a chunk. Returns how many new positions were added. */
export function mergeEdits(chunk: ChunkEdits, edits: readonly Edit[]): number {
  let added = 0;
  for (const edit of edits) {
    const key = `${edit[0]},${edit[1]},${edit[2]}`;
    if (!chunk.has(key)) added++;
    chunk.set(key, edit);
  }
  return added;
}
