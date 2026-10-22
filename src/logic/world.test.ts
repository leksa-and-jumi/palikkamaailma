import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_LIMIT } from '../config';
import { AIR, BEDROCK, GOLD_BLOCK, PLANKS } from './blocks';
import { VoxelWorld, chunkKey, isInsideWorld } from './world';

describe('world', () => {
  it('changes and remembers blocks', () => {
    const world = new VoxelWorld(1);
    expect(world.setBlock(10, 80, 10, PLANKS)).toBe(true);
    expect(world.getBlock(10, 80, 10)).toBe(PLANKS);
    expect([...world.edits()]).toEqual([[10, 80, 10, PLANKS]]);
    expect(world.setBlock(10, 80, 10, PLANKS)).toBe(false);
  });

  it('never lets anyone break bedrock', () => {
    const world = new VoxelWorld(1);
    expect(world.getBlock(5, 0, 5)).toBe(BEDROCK);
    expect(world.setBlock(5, 0, 5, AIR)).toBe(false);
    expect(world.getBlock(5, -1, 5)).toBe(BEDROCK);
  });

  it('ignores blocks outside the world', () => {
    const world = new VoxelWorld(1);
    expect(world.setBlock(WORLD_LIMIT, 30, 5, GOLD_BLOCK)).toBe(false);
    expect(world.setBlock(5, WORLD_HEIGHT, 5, GOLD_BLOCK)).toBe(false);
    expect(world.getBlock(5, WORLD_HEIGHT + 3, 5)).toBe(AIR);
    expect(isInsideWorld(-100, 0, -100)).toBe(true);
  });

  it('works with negative coordinates', () => {
    const world = new VoxelWorld(1);
    expect(world.setBlock(-1, 85, -1, GOLD_BLOCK)).toBe(true);
    expect(world.getBlock(-1, 85, -1)).toBe(GOLD_BLOCK);
    expect(world.getBlock(0, 85, 0)).toBe(AIR);
  });

  it('marks the neighbour chunks dirty', () => {
    const world = new VoxelWorld(1);
    world.getChunk(0, 0);
    world.getChunk(1, 0);
    world.dirtyChunks.clear();
    world.setBlock(CHUNK_SIZE, 80, 3, GOLD_BLOCK);
    expect(world.dirtyChunks.has(chunkKey(1, 0))).toBe(true);
    expect(world.dirtyChunks.has(chunkKey(0, 0))).toBe(true);
  });

  it('applies a list of edits', () => {
    const world = new VoxelWorld(1);
    const changed = world.applyEdits([
      [1, 90, 1, GOLD_BLOCK],
      [2, 90, 1, GOLD_BLOCK],
      [2, 90, 1, GOLD_BLOCK],
    ]);
    expect(changed).toBe(2);
    expect(world.surfaceY(1, 1)).toBe(90);
  });

  it('keeps edits when a chunk is forgotten and made again', () => {
    const world = new VoxelWorld(1);
    world.setBlock(-40, 85, 300, GOLD_BLOCK);
    world.unloadFarChunks(100, 100, 2);
    expect(world.hasChunk(-3, 18)).toBe(false);
    expect(world.getBlock(-40, 85, 300)).toBe(GOLD_BLOCK);
  });
});
