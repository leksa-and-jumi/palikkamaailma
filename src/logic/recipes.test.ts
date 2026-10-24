import { describe, expect, it } from 'vitest';
import type { Slot } from './inventory';
import { itemId } from './items';
import { RECIPES, consumeIngredients, findRecipe, recipeResult, smeltResult } from './recipes';

/** Builds a grid from rows of keys ('.' = empty). */
function grid(rows: string[][]): Slot[] {
  return rows.flat().map((key) => (key === '.' ? null : { id: itemId(key), count: 1 }));
}

function craft(rows: string[][]) {
  const recipe = findRecipe(grid(rows), rows[0]!.length);
  return recipe ? recipeResult(recipe) : null;
}

describe('recipes', () => {
  it('makes planks from any log, anywhere in the grid', () => {
    expect(
      craft([
        ['log', '.'],
        ['.', '.'],
      ]),
    ).toEqual({ id: itemId('planks'), count: 4 });
    expect(
      craft([
        ['.', '.', '.'],
        ['.', '.', 'birch_log'],
        ['.', '.', '.'],
      ]),
    ).toEqual({
      id: itemId('planks'),
      count: 4,
    });
  });

  it('makes sticks and a crafting table in the 2×2 grid', () => {
    expect(
      craft([
        ['planks', '.'],
        ['planks', '.'],
      ]),
    ).toEqual({ id: itemId('stick'), count: 4 });
    expect(
      craft([
        ['planks', 'planks'],
        ['planks', 'planks'],
      ])?.id,
    ).toBe(itemId('crafting_table'));
  });

  it('makes Minecraft tools', () => {
    const pick = [
      ['cobblestone', 'cobblestone', 'cobblestone'],
      ['.', 'stick', '.'],
      ['.', 'stick', '.'],
    ];
    expect(craft(pick)?.id).toBe(itemId('stone_pickaxe'));
    const sword = [
      ['.', 'diamond', '.'],
      ['.', 'diamond', '.'],
      ['.', 'stick', '.'],
    ];
    expect(craft(sword)?.id).toBe(itemId('diamond_sword'));
  });

  it('accepts mirrored shapes (axe both ways)', () => {
    const left = [
      ['iron_ingot', 'iron_ingot', '.'],
      ['iron_ingot', 'stick', '.'],
      ['.', 'stick', '.'],
    ];
    const right = [
      ['.', 'iron_ingot', 'iron_ingot'],
      ['.', 'stick', 'iron_ingot'],
      ['.', 'stick', '.'],
    ];
    expect(craft(left)?.id).toBe(itemId('iron_axe'));
    expect(craft(right)?.id).toBe(itemId('iron_axe'));
  });

  it('makes torches from coal or charcoal', () => {
    expect(
      craft([
        ['coal', '.'],
        ['stick', '.'],
      ]),
    ).toEqual({ id: itemId('torch'), count: 4 });
    expect(
      craft([
        ['.', 'charcoal'],
        ['.', 'stick'],
      ])?.id,
    ).toBe(itemId('torch'));
  });

  it('makes armor, furnace, chest and the enchanting table', () => {
    const ring = (m: string) => [
      [m, m, m],
      [m, '.', m],
      [m, m, m],
    ];
    expect(craft(ring('cobblestone'))?.id).toBe(itemId('furnace'));
    expect(craft(ring('planks'))?.id).toBe(itemId('chest'));
    expect(
      craft([
        ['gold_ingot', 'gold_ingot', 'gold_ingot'],
        ['gold_ingot', '.', 'gold_ingot'],
        ['.', '.', '.'],
      ])?.id,
    ).toBe(itemId('golden_helmet'));
    expect(
      craft([
        ['.', 'book', '.'],
        ['diamond', 'obsidian', 'diamond'],
        ['obsidian', 'obsidian', 'obsidian'],
      ])?.id,
    ).toBe(itemId('enchanting_table'));
  });

  it('makes books (shapeless) and storage blocks both ways', () => {
    expect(
      craft([
        ['leather', 'paper'],
        ['paper', 'paper'],
      ])?.id,
    ).toBe(itemId('book'));
    const nine = Array.from({ length: 3 }, () => ['diamond', 'diamond', 'diamond']);
    expect(craft(nine)?.id).toBe(itemId('diamond_block'));
    expect(
      craft([
        ['diamond_block', '.'],
        ['.', '.'],
      ]),
    ).toEqual({ id: itemId('diamond'), count: 9 });
  });

  it('gives nothing for a wrong pattern', () => {
    expect(
      craft([
        ['dirt', 'dirt'],
        ['.', '.'],
      ]),
    ).toBeNull();
    expect(
      craft([
        ['.', '.'],
        ['.', '.'],
      ]),
    ).toBeNull();
  });

  it('uses up one of each ingredient', () => {
    const g: Slot[] = [{ id: itemId('log'), count: 3 }, null, null, null];
    consumeIngredients(g);
    expect(g[0]).toEqual({ id: itemId('log'), count: 2 });
  });

  it('every recipe points to real items', () => {
    for (const r of RECIPES) expect(() => recipeResult(r)).not.toThrow();
  });

  it('smelts like a Minecraft furnace', () => {
    expect(smeltResult(itemId('raw_iron'))).toBe(itemId('iron_ingot'));
    expect(smeltResult(itemId('sand'))).toBe(itemId('glass'));
    expect(smeltResult(itemId('beef'))).toBe(itemId('cooked_beef'));
    expect(smeltResult(itemId('dirt'))).toBeUndefined();
  });
});
