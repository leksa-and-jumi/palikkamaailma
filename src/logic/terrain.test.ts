import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_CHUNKS, WORLD_SIZE } from '../config';
import { AIR, BEDROCK, LOG, WATER } from './blocks';
import { CHUNK_VOLUME, TerrainGenerator, chunkIndex } from './terrain';

describe('terrain', () => {
  const terrain = new TerrainGenerator(2024);

  it('builds the same chunk every time for the same seed', () => {
    const a = terrain.generateChunk(3, 4);
    const b = new TerrainGenerator(2024).generateChunk(3, 4);
    expect(a.length).toBe(CHUNK_VOLUME);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('has bedrock at the bottom everywhere', () => {
    const chunk = terrain.generateChunk(0, 0);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) expect(chunk[chunkIndex(x, 0, z)]).toBe(BEDROCK);
    }
  });

  it('is an island: sea at the edges, land in the middle', () => {
    const corner = terrain.generateChunk(0, 0);
    expect(corner[chunkIndex(0, SEA_LEVEL, 0)]).toBe(WATER);
    const middle = WORLD_SIZE / 2;
    expect(terrain.heightAt(middle, middle)).toBeGreaterThan(SEA_LEVEL);
  });

  it('grows some trees on the island', () => {
    let trees = 0;
    for (let cz = 0; cz < WORLD_CHUNKS; cz++) {
      for (let cx = 0; cx < WORLD_CHUNKS; cx++) {
        const chunk = terrain.generateChunk(cx, cz);
        trees += chunk.filter((b) => b === LOG).length;
      }
    }
    expect(trees).toBeGreaterThan(20);
  });

  it('keeps the sky empty', () => {
    const chunk = terrain.generateChunk(5, 5);
    expect(chunk[chunkIndex(8, 63, 8)]).toBe(AIR);
  });
});
