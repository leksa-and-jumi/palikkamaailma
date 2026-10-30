import { describe, expect, it } from 'vitest';
import {
  applyBook,
  enchantsFor,
  levelOf,
  offersFor,
  protectionFactor,
  spendLevels,
  stackName,
} from './enchanting';
import { itemId } from './items';

describe('enchanting', () => {
  it('counts experience levels like Minecraft', () => {
    expect(levelOf(0)).toEqual({ level: 0, progress: 0 });
    expect(levelOf(7).level).toBe(1);
    expect(levelOf(16).level).toBe(2);
    // 3 levels cost 7 + 9 + 11 = 27 points.
    expect(levelOf(27).level).toBe(3);
    expect(levelOf(spendLevels(30, 2)).level).toBe(1);
    expect(spendLevels(5, 3)).toBe(5 * 0 + Math.floor((5 / 7) * 7));
  });

  it('offers enchantments that fit the item', () => {
    const sword = { id: itemId('diamond_sword'), count: 1 };
    expect(enchantsFor(sword)).toEqual(['sharpness', 'unbreaking']);
    const boots = { id: itemId('iron_boots'), count: 1 };
    expect(enchantsFor(boots)).toContain('feather_falling');
    expect(enchantsFor({ id: itemId('stick'), count: 1 })).toEqual([]);
    const offers = offersFor(sword, 42);
    expect(offers.map((o) => o.cost)).toEqual([1, 2, 3]);
    expect(offersFor(sword, 42)).toEqual(offers);
    expect(offers[2]!.level).toBeGreaterThanOrEqual(offers[0]!.level);
  });

  it('puts a book on an item and names it', () => {
    const pick = { id: itemId('iron_pickaxe'), count: 1 };
    const book = { id: itemId('enchanted_book'), count: 1, enchants: { efficiency: 3 } };
    const done = applyBook(pick, book)!;
    expect(done.enchants).toEqual({ efficiency: 3 });
    expect(stackName(done)).toBe('Rautahakku (Tehokkuus III)');
    expect(applyBook({ id: itemId('iron_helmet'), count: 1 }, book)).toBeNull();
  });

  it('protection takes damage off', () => {
    const piece = { id: itemId('iron_chestplate'), count: 1, enchants: { protection: 4 } };
    expect(protectionFactor([piece, null, null, null])).toBeCloseTo(0.84);
    expect(protectionFactor([piece, piece, piece, piece])).toBeCloseTo(0.36);
  });
});
