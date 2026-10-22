import { describe, expect, it } from 'vitest';
import {
  BEDROCK,
  COAL_ORE,
  DIAMOND_ORE,
  DIRT,
  GRASS,
  GRAVEL,
  IRON_ORE,
  LOG,
  OBSIDIAN,
  STONE,
  TORCH,
} from './blocks';
import { itemByKey, itemId } from './items';
import { blockDrops, breakTime, canHarvest } from './mining';

const hand = undefined;
const woodPick = itemByKey('wooden_pickaxe');
const stonePick = itemByKey('stone_pickaxe');
const ironPick = itemByKey('iron_pickaxe');
const diamondPick = itemByKey('diamond_pickaxe');

describe('mining', () => {
  it('needs a pickaxe for stone, like Minecraft', () => {
    expect(canHarvest(STONE, hand)).toBe(false);
    expect(blockDrops(STONE, hand)).toEqual([]);
    expect(blockDrops(STONE, woodPick)).toEqual([{ id: itemId('cobblestone'), count: 1 }]);
  });

  it('needs better pickaxes for better ores', () => {
    expect(canHarvest(IRON_ORE, woodPick)).toBe(false);
    expect(canHarvest(IRON_ORE, stonePick)).toBe(true);
    expect(canHarvest(DIAMOND_ORE, stonePick)).toBe(false);
    expect(blockDrops(DIAMOND_ORE, ironPick)).toEqual([{ id: itemId('diamond'), count: 1 }]);
    expect(canHarvest(OBSIDIAN, ironPick)).toBe(false);
    expect(canHarvest(OBSIDIAN, diamondPick)).toBe(true);
  });

  it('drops the right things', () => {
    expect(blockDrops(GRASS, hand)).toEqual([{ id: DIRT, count: 1 }]);
    expect(blockDrops(LOG, hand)).toEqual([{ id: LOG, count: 1 }]);
    expect(blockDrops(COAL_ORE, woodPick)).toEqual([{ id: itemId('coal'), count: 1 }]);
    expect(blockDrops(GRAVEL, itemByKey('wooden_shovel'), () => 0.05)).toEqual([
      { id: itemId('flint'), count: 1 },
    ]);
    expect(blockDrops(GRAVEL, hand, () => 0.5)).toEqual([{ id: GRAVEL, count: 1 }]);
  });

  it('breaks faster with the right tool', () => {
    expect(breakTime(STONE, hand)).toBeCloseTo(7.5);
    expect(breakTime(STONE, woodPick)).toBeCloseTo(1.125);
    expect(breakTime(STONE, diamondPick)).toBeLessThan(breakTime(STONE, ironPick));
    expect(breakTime(LOG, itemByKey('iron_axe'))).toBeLessThan(breakTime(LOG, hand));
    expect(breakTime(STONE, diamondPick, 5)).toBeLessThan(breakTime(STONE, diamondPick));
    expect(breakTime(TORCH, hand)).toBe(0);
    expect(breakTime(BEDROCK, diamondPick)).toBe(Infinity);
  });

  it('gives more ore with Fortune and the block itself with Silk Touch', () => {
    const lots = blockDrops(COAL_ORE, diamondPick, () => 0.99, 3);
    expect(lots[0]!.count).toBeGreaterThan(1);
    expect(blockDrops(DIAMOND_ORE, diamondPick, Math.random, 0, true)).toEqual([
      { id: DIAMOND_ORE, count: 1 },
    ]);
  });
});
