import { describe, expect, it } from 'vitest';
import type { Edit } from '../src/logic/world';
import {
  chunkKeyOf,
  groupByChunk,
  mergeEdits,
  packEdits,
  toChunkEdits,
  unpackEdits,
} from './editStore';

describe('edit store', () => {
  it('packs and unpacks edits, also negative coordinates', () => {
    const edits: Edit[] = [
      [1, 2, 3, 4],
      [-17, 95, -29999, 60],
    ];
    expect(unpackEdits(packEdits(edits))).toEqual(edits);
    expect(packEdits(edits).byteLength).toBe(32);
  });

  it('unpacks from a plain ArrayBuffer (what SQLite gives back)', () => {
    const packed = packEdits([[5, 6, 7, 8]]);
    const copy = packed.slice().buffer;
    expect(unpackEdits(copy)).toEqual([[5, 6, 7, 8]]);
  });

  it('groups edits by chunk', () => {
    const groups = groupByChunk([
      [0, 50, 0, 1],
      [15, 50, 15, 1],
      [16, 50, 0, 1],
      [-1, 50, 0, 1],
    ]);
    expect([...groups.keys()]).toEqual(['0,0', '1,0', '-1,0']);
    expect(chunkKeyOf(-1, -16)).toBe('-1,-1');
  });

  it('counts only new positions when merging', () => {
    const chunk = toChunkEdits([[1, 50, 1, 3]]);
    expect(
      mergeEdits(chunk, [
        [1, 50, 1, 0],
        [2, 50, 1, 3],
      ]),
    ).toBe(1);
    expect(chunk.get('1,50,1')).toEqual([1, 50, 1, 0]);
    expect(chunk.size).toBe(2);
  });
});
