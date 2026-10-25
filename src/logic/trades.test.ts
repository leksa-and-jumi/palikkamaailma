import { describe, expect, it } from 'vitest';
import { Inventory } from './inventory';
import { itemId } from './items';
import { canAfford, greeting, makeTrade, tradesFor } from './trades';

describe('villager trades', () => {
  it('farmers buy wheat for an emerald', () => {
    const inv = new Inventory();
    inv.add({ id: itemId('wheat'), count: 25 });
    const [sell] = tradesFor('farmer', 'curious');
    expect(canAfford(inv, sell!)).toBe(true);
    expect(makeTrade(inv, sell!)).toEqual({ id: itemId('emerald'), count: 1 });
    expect(inv.count(itemId('wheat'))).toBe(5);
    expect(makeTrade(inv, sell!)).toBeNull();
  });

  it('grumpy villagers ask more, friendly ones less', () => {
    const price = (p: 'grumpy' | 'friendly' | 'lazy') =>
      tradesFor('smith', p).find((t) => t.get.key === 'iron_pickaxe')!.give[0]!.count;
    expect(price('lazy')).toBe(3);
    expect(price('grumpy')).toBe(4);
    expect(price('friendly')).toBe(2);
    // Never cheaper than one emerald.
    expect(tradesFor('farmer', 'friendly')[1]!.give[0]!.count).toBe(1);
  });

  it('every trade uses real items', () => {
    for (const profession of ['farmer', 'librarian', 'smith', 'shepherd'] as const) {
      for (const t of tradesFor(profession, 'lazy')) {
        expect(() => itemId(t.get.key)).not.toThrow();
        for (const g of t.give) expect(() => itemId(g.key)).not.toThrow();
      }
    }
  });

  it('says something that fits the personality', () => {
    expect(greeting('grumpy', 'farmer', false, () => 0.9)).toMatch(/\\.|\\?/);
    expect(greeting('lazy', 'smith', true, () => 0.1)).toMatch(/yö|zombi|soihtu/i);
  });
});
