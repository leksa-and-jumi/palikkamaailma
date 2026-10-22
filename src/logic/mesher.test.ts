import { describe, expect, it } from 'vitest';
import { WORLD_HEIGHT } from '../config';
import { AIR, GLASS, GOLD, getBlockType, LEAVES, STONE, WATER } from './blocks';
import { buildChunkMesh, isFaceVisible } from './mesher';
import { VoxelWorld } from './world';

const QUAD_INDICES = 6;

function emptyWorld(): VoxelWorld {
  const world = new VoxelWorld(9);
  // Clear chunk (0,0) and its neighbours so only our blocks are there.
  for (const [cx, cz] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    const chunk = world.getChunk(cx, cz);
    chunk.fill(AIR);
  }
  return world;
}

describe('mesher', () => {
  it('draws all 6 sides of a block floating in the air', () => {
    const world = emptyWorld();
    world.setBlock(5, 30, 5, GOLD);
    const mesh = buildChunkMesh(world, 0, 0);
    expect(mesh.solid.indices.length).toBe(6 * QUAD_INDICES);
    expect(mesh.solid.positions.length).toBe(6 * 4 * 3);
  });

  it('hides the sides where two blocks touch', () => {
    const world = emptyWorld();
    world.setBlock(5, 30, 5, GOLD);
    world.setBlock(6, 30, 5, STONE);
    const mesh = buildChunkMesh(world, 0, 0);
    expect(mesh.solid.indices.length).toBe(10 * QUAD_INDICES);
  });

  it('puts water in its own mesh', () => {
    const world = emptyWorld();
    world.setBlock(5, 30, 5, WATER);
    const mesh = buildChunkMesh(world, 0, 0);
    expect(mesh.solid.indices.length).toBe(0);
    expect(mesh.water.indices.length).toBe(6 * QUAD_INDICES);
  });

  it('darkens corners next to other blocks', () => {
    const world = emptyWorld();
    world.setBlock(5, 30, 5, STONE);
    world.setBlock(5, 31, 4, STONE);
    const mesh = buildChunkMesh(world, 0, 0);
    const colors = [...mesh.solid.colors];
    expect(Math.min(...colors)).toBeLessThan(Math.max(...colors));
  });

  it('knows which faces to show', () => {
    const glass = getBlockType(GLASS);
    const leaves = getBlockType(LEAVES);
    const stone = getBlockType(STONE);
    const air = getBlockType(AIR);
    expect(isFaceVisible(stone, air)).toBe(true);
    expect(isFaceVisible(stone, stone)).toBe(false);
    expect(isFaceVisible(stone, glass)).toBe(true);
    expect(isFaceVisible(glass, glass)).toBe(false);
    expect(isFaceVisible(leaves, leaves)).toBe(true);
  });

  it('builds a full generated chunk', () => {
    const world = new VoxelWorld(5);
    const mesh = buildChunkMesh(world, 6, 6);
    expect(mesh.solid.indices.length).toBeGreaterThan(0);
    expect(mesh.solid.positions.every((v) => v >= 0 && v <= WORLD_HEIGHT)).toBe(true);
  });
});
