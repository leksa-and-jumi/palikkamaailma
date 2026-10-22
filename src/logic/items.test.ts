import { describe, expect, it } from 'vitest';
import { BLOCKS, STONE } from './blocks';
import { FIRST_ITEM_ID, ITEMS, getItem, itemByKey, itemId, maxDurability } from './items';

describe('items', () => {
  it('has every block as an item with the same id', () => {
    for (const b of BLOCKS) expect(getItem(b.id)?.block).toBe(b.id);
    expect(getItem(STONE)?.name).toBe('Kivi');
  });

  it('gives other items ids from 256 and unique keys', () => {
    const keys = new Set(ITEMS.map((i) => i.key));
    expect(keys.size).toBe(ITEMS.length);
    expect(itemId('stick')).toBe(FIRST_ITEM_ID);
  });

  it('has all Minecraft tools with the right strength', () => {
    expect(itemByKey('wooden_pickaxe').tool).toMatchObject({ level: 0, speed: 2 });
    expect(itemByKey('stone_pickaxe').name).toBe('Kivihakku');
    expect(itemByKey('diamond_sword').tool?.damage).toBe(7);
    expect(itemByKey('golden_axe').name).toBe('Kultainen kirves');
    expect(maxDurability(itemByKey('iron_shovel'))).toBe(250);
    expect(itemByKey('diamond_pickaxe').stack).toBe(1);
  });

  it('has armor with Minecraft armor points', () => {
    expect(itemByKey('diamond_chestplate').armor).toMatchObject({ slot: 'chest', points: 8 });
    expect(itemByKey('iron_helmet').armor?.points).toBe(2);
    expect(itemByKey('leather_boots').name).toBe('Nahkasaappaat');
  });

  it('knows food and fuel', () => {
    expect(itemByKey('cooked_beef').food?.hunger).toBe(8);
    expect(itemByKey('coal').fuel).toBe(80);
    expect(itemByKey('planks').fuel).toBe(15);
  });
});
