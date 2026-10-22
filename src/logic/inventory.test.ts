import { describe, expect, it } from 'vitest';
import { DIRT, STONE } from './blocks';
import { Inventory, clickSlot, parseStack } from './inventory';
import { itemId } from './items';

describe('inventory', () => {
  it('adds to existing stacks first, then empty slots', () => {
    const inv = new Inventory();
    expect(inv.add({ id: DIRT, count: 60 })).toBe(0);
    expect(inv.add({ id: DIRT, count: 10 })).toBe(0);
    expect(inv.slots[0]).toEqual({ id: DIRT, count: 64 });
    expect(inv.slots[1]).toEqual({ id: DIRT, count: 6 });
    expect(inv.count(DIRT)).toBe(70);
  });

  it('does not stack tools', () => {
    const inv = new Inventory();
    const pick = itemId('wooden_pickaxe');
    inv.add({ id: pick, count: 1 });
    inv.add({ id: pick, count: 1 });
    expect(inv.slots[0]).toEqual({ id: pick, count: 1 });
    expect(inv.slots[1]).toEqual({ id: pick, count: 1 });
  });

  it('says how many did not fit', () => {
    const inv = new Inventory();
    for (let i = 0; i < 36; i++) inv.add({ id: STONE, count: 64 });
    expect(inv.add({ id: DIRT, count: 5 })).toBe(5);
    expect(inv.hasRoomFor({ id: DIRT, count: 1 })).toBe(false);
  });

  it('removes items from anywhere, or nothing if short', () => {
    const inv = new Inventory();
    inv.add({ id: DIRT, count: 70 });
    expect(inv.removeItems(DIRT, 100)).toBe(false);
    expect(inv.count(DIRT)).toBe(70);
    expect(inv.removeItems(DIRT, 66)).toBe(true);
    expect(inv.count(DIRT)).toBe(4);
  });

  it('wears tools until they break', () => {
    const inv = new Inventory();
    inv.add({ id: itemId('golden_pickaxe'), count: 1 });
    for (let i = 0; i < 31; i++) expect(inv.wear('slots', 0)).toBe(false);
    expect(inv.wear('slots', 0)).toBe(true);
    expect(inv.slots[0]).toBeNull();
  });

  it('clicks like Minecraft', () => {
    const dirt = (count: number) => ({ id: DIRT, count });
    expect(clickSlot(null, dirt(10), 'left')).toEqual({ cursor: dirt(10), slot: null });
    expect(clickSlot(dirt(10), null, 'left')).toEqual({ cursor: null, slot: dirt(10) });
    expect(clickSlot(dirt(10), dirt(60), 'left')).toEqual({ cursor: dirt(6), slot: dirt(64) });
    expect(clickSlot(null, dirt(9), 'right')).toEqual({ cursor: dirt(5), slot: dirt(4) });
    expect(clickSlot(dirt(3), null, 'right')).toEqual({ cursor: dirt(2), slot: dirt(1) });
    expect(clickSlot(dirt(3), { id: STONE, count: 1 }, 'left')).toEqual({
      cursor: { id: STONE, count: 1 },
      slot: dirt(3),
    });
  });

  it('checks saved stacks', () => {
    expect(parseStack({ id: DIRT, count: 5 })).toEqual({ id: DIRT, count: 5 });
    expect(parseStack({ id: DIRT, count: 65 })).toBeNull();
    expect(parseStack({ id: 99999, count: 1 })).toBeNull();
    const sword = itemId('diamond_sword');
    expect(parseStack({ id: sword, count: 1, enchants: { sharpness: 5 } })).toEqual({
      id: sword,
      count: 1,
      enchants: { sharpness: 5 },
    });
    expect(parseStack({ id: sword, count: 1, damage: 99999 })).toBeNull();
  });

  it('saves and loads', () => {
    const inv = new Inventory();
    inv.add({ id: DIRT, count: 3 });
    inv.armor[0] = { id: itemId('iron_helmet'), count: 1 };
    const copy = new Inventory();
    copy.load(JSON.parse(JSON.stringify(inv.toJSON())));
    expect(copy.slots[0]).toEqual({ id: DIRT, count: 3 });
    expect(copy.armorPoints()).toBe(2);
  });
});
