import { describe, expect, it } from 'vitest';
import { WORLD_HEIGHT } from '../config';
import {
  AIR,
  GLASS,
  GOLD_BLOCK,
  getBlockType,
  LEAVES,
  LEVER,
  REDSTONE_LAMP,
  REDSTONE_LAMP_ON,
  REDSTONE_WIRE,
  STONE,
  WATER,
} from './blocks';
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
    world.setBlock(5, 30, 5, GOLD_BLOCK);
    const mesh = buildChunkMesh(world, 0, 0);
    expect(mesh.solid.indices.length).toBe(6 * QUAD_INDICES);
    expect(mesh.solid.positions.length).toBe(6 * 4 * 3);
  });

  it('hides the sides where two blocks touch', () => {
    const world = emptyWorld();
    world.setBlock(5, 30, 5, GOLD_BLOCK);
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

  it('draws dust flat and longer when it joins its neighbours', () => {
    const world = emptyWorld();
    world.setBlock(5, 30, 5, REDSTONE_WIRE);
    const alone = buildChunkMesh(world, 0, 0).solid;
    const ys = new Set([...alone.positions].filter((_, i) => i % 3 === 1));
    expect(ys.size).toBe(1);
    world.setBlock(6, 30, 5, REDSTONE_WIRE);
    world.setBlock(7, 30, 5, REDSTONE_WIRE);
    const joined = buildChunkMesh(world, 0, 0).solid;
    expect(joined.indices.length).toBeGreaterThan(alone.indices.length);
  });

  it('draws a lever as small boxes', () => {
    const world = emptyWorld();
    world.setBlock(5, 30, 5, LEVER);
    const mesh = buildChunkMesh(world, 0, 0).solid;
    expect(mesh.indices.length).toBe(getBlockType(LEVER).boxes!.length * 6 * QUAD_INDICES);
  });

  it('a lit redstone lamp shines on its neighbours', () => {
    // A small dark cave inside solid stone, with a lamp in it.
    const world = new VoxelWorld(9);
    for (let cz = -1; cz <= 1; cz++) {
      for (let cx = -1; cx <= 1; cx++) world.getChunk(cx, cz).fill(STONE);
    }
    for (let y = 30; y <= 32; y++) {
      for (let z = 5; z <= 7; z++) for (let x = 5; x <= 7; x++) world.setBlock(x, y, z, AIR);
    }
    world.setBlock(6, 30, 6, REDSTONE_LAMP);
    // The sunny top of the stone stays the same, so the total tells the difference.
    const brightest = () => buildChunkMesh(world, 0, 0).solid.colors.reduce((a, b) => a + b, 0);
    const off = brightest();
    world.setShown(6, 30, 6, REDSTONE_LAMP_ON);
    expect(brightest()).toBeGreaterThan(off);
  });
});
