import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../config';
import { AIR, BEDROCK, GOLD, PLANKS } from './blocks';
import { VoxelWorld, chunkKey, isInsideWorld } from './world';

describe('world', () => {
  it('changes and remembers blocks', () => {
    const world = new VoxelWorld(1);
    expect(world.setBlock(10, 40, 10, PLANKS)).toBe(true);
    expect(world.getBlock(10, 40, 10)).toBe(PLANKS);
    expect(world.edits.get('10,40,10')).toEqual([10, 40, 10, PLANKS]);
    expect(world.setBlock(10, 40, 10, PLANKS)).toBe(false);
  });

  it('never lets anyone break bedrock', () => {
    const world = new VoxelWorld(1);
    expect(world.getBlock(5, 0, 5)).toBe(BEDROCK);
    expect(world.setBlock(5, 0, 5, AIR)).toBe(false);
    expect(world.getBlock(5, -1, 5)).toBe(BEDROCK);
  });

  it('ignores blocks outside the world', () => {
    const world = new VoxelWorld(1);
    expect(world.setBlock(-1, 30, 5, GOLD)).toBe(false);
    expect(world.setBlock(5, WORLD_HEIGHT, 5, GOLD)).toBe(false);
    expect(world.getBlock(-1, 30, 5)).toBe(AIR);
    expect(isInsideWorld(0, 0, 0)).toBe(true);
  });

  it('marks the neighbour chunk dirty for blocks on the edge', () => {
    const world = new VoxelWorld(1);
    world.getChunk(0, 0);
    world.getChunk(1, 0);
    world.dirtyChunks.clear();
    world.setBlock(CHUNK_SIZE, 40, 3, GOLD);
    expect(world.dirtyChunks.has(chunkKey(1, 0))).toBe(true);
    expect(world.dirtyChunks.has(chunkKey(0, 0))).toBe(true);
  });

  it('applies a list of edits', () => {
    const world = new VoxelWorld(1);
    const changed = world.applyEdits([
      [1, 40, 1, GOLD],
      [2, 40, 1, GOLD],
      [2, 40, 1, GOLD],
    ]);
    expect(changed).toBe(2);
    expect(world.surfaceY(1, 1)).toBe(40);
  });
});
