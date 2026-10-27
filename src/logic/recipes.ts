// Crafting recipes and furnace smelting, the same as in Minecraft so the
// boys can use the recipes they already know.

import { getItem, itemId } from './items';
import type { ItemStack, Slot } from './inventory';

/** An ingredient: one item key, or a group of keys that all work. */
type Ingredient = string | readonly string[];

export interface ShapedRecipe {
  kind: 'shaped';
  /** Rows of letters; ' ' is an empty spot. */
  pattern: readonly string[];
  key: Record<string, Ingredient>;
  result: { key: string; count: number };
}

export interface ShapelessRecipe {
  kind: 'shapeless';
  ingredients: readonly Ingredient[];
  result: { key: string; count: number };
}

export type Recipe = ShapedRecipe | ShapelessRecipe;

const LOGS = ['log', 'birch_log', 'spruce_log'] as const;
const COAL = ['coal', 'charcoal'] as const;
const WOOLS = [
  'white',
  'red',
  'blue',
  'yellow',
  'green',
  'black',
  'pink',
  'orange',
  'purple',
] as const;

function shaped(
  pattern: string[],
  key: Record<string, Ingredient>,
  result: string,
  count = 1,
): Recipe {
  return { kind: 'shaped', pattern, key, result: { key: result, count } };
}

function shapeless(ingredients: Ingredient[], result: string, count = 1): Recipe {
  return { kind: 'shapeless', ingredients, result: { key: result, count } };
}

const TOOL_MATERIALS: Record<string, Ingredient> = {
  wooden: 'planks',
  stone: 'cobblestone',
  iron: 'iron_ingot',
  golden: 'gold_ingot',
  diamond: 'diamond',
};

const ARMOR_MATERIALS: Record<string, Ingredient> = {
  leather: 'leather',
  iron: 'iron_ingot',
  golden: 'gold_ingot',
  diamond: 'diamond',
};

/** Blocks made of 9 of an item, and back. */
const STORAGE_BLOCKS: [string, string][] = [
  ['iron_block', 'iron_ingot'],
  ['gold_block', 'gold_ingot'],
  ['diamond_block', 'diamond'],
  ['emerald_block', 'emerald'],
  ['lapis_block', 'lapis_lazuli'],
  ['redstone_block', 'redstone'],
  ['coal_block', 'coal'],
];

export const RECIPES: readonly Recipe[] = [
  shapeless([LOGS], 'planks', 4),
  shaped(['P', 'P'], { P: 'planks' }, 'stick', 4),
  shaped(['PP', 'PP'], { P: 'planks' }, 'crafting_table'),
  shaped(['C', 'S'], { C: COAL, S: 'stick' }, 'torch', 4),
  shaped(['PPP', 'P P', 'PPP'], { P: 'planks' }, 'chest'),
  shaped(['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, 'furnace'),
  shaped(['SS', 'SS'], { S: 'sand' }, 'sandstone'),
  shaped(['SS', 'SS'], { S: 'string' }, 'white'),
  shaped(['I I', ' I '], { I: 'iron_ingot' }, 'bucket'),
  shaped([' TS', 'T S', ' TS'], { T: 'stick', S: 'string' }, 'bow'),
  shaped(['F', 'T', 'E'], { F: 'flint', T: 'stick', E: 'feather' }, 'arrow', 4),
  shaped(['CCC'], { C: 'sugar_cane' }, 'paper', 3),
  shapeless(['paper', 'paper', 'paper', 'leather'], 'book'),
  shaped(['PPP', 'BBB', 'PPP'], { P: 'planks', B: 'book' }, 'bookshelf'),
  shaped([' B ', 'DOD', 'OOO'], { B: 'book', D: 'diamond', O: 'obsidian' }, 'enchanting_table'),
  shaped(['WWW'], { W: 'wheat' }, 'bread'),
  shaped(['GGG', 'GAG', 'GGG'], { G: 'gold_ingot', A: 'apple' }, 'golden_apple'),
  shaped(['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: 'sand' }, 'tnt'),
  // Minecraft's jack o'lantern: here it makes a glowing lamp block.
  shapeless(['pumpkin', 'torch'], 'lamp'),
  // Redstone and fireworks.
  shaped(['S', 'C'], { S: 'stick', C: 'cobblestone' }, 'lever'),
  shapeless(['stone'], 'button'),
  shaped(['R', 'S'], { R: 'redstone', S: 'stick' }, 'redstone_torch'),
  shaped([' R ', 'RGR', ' R '], { R: 'redstone', G: 'lamp' }, 'redstone_lamp'),
  shapeless(['iron_ingot', 'flint'], 'flint_and_steel'),
  // Minecraft's dispenser, but it shoots rockets.
  shaped(['CCC', 'CBC', 'CRC'], { C: 'cobblestone', B: 'bow', R: 'redstone' }, 'firework_launcher'),
  shaped(['TRT', 'SSS'], { T: 'redstone_torch', R: 'redstone', S: 'stone' }, 'repeater'),
  shaped(['SS'], { S: 'stone' }, 'stone_pressure_plate'),
  shaped(['PP'], { P: 'planks' }, 'oak_pressure_plate'),
  shaped(
    ['PPP', 'CIC', 'CRC'],
    { P: 'planks', C: 'cobblestone', I: 'iron_ingot', R: 'redstone' },
    'piston',
  ),
  shaped(['S', 'P'], { S: 'slime_ball', P: 'piston' }, 'sticky_piston'),
  // Nether blocks.
  shaped(['QQ', 'QQ'], { Q: 'quartz' }, 'quartz_block'),
  shaped(['BB', 'BB'], { B: 'nether_brick' }, 'nether_bricks'),
  // Rails and minecarts.
  shaped(['I I', 'ISI', 'I I'], { I: 'iron_ingot', S: 'stick' }, 'rail', 16),
  shaped(['G G', 'GSG', 'GRG'], { G: 'gold_ingot', S: 'stick', R: 'redstone' }, 'powered_rail', 6),
  shaped(['I I', 'III'], { I: 'iron_ingot' }, 'minecart'),
  // Doors, fences and building blocks.
  shaped(['PP', 'PP', 'PP'], { P: 'planks' }, 'oak_door', 3),
  shaped(['II', 'II', 'II'], { I: 'iron_ingot' }, 'iron_door', 3),
  shaped(['PPP', 'PPP'], { P: 'planks' }, 'trapdoor', 2),
  shaped(['PSP', 'PSP'], { P: 'planks', S: 'stick' }, 'fence', 3),
  shaped(['SPS', 'SPS'], { P: 'planks', S: 'stick' }, 'fence_gate'),
  shaped(['S S', 'SSS', 'S S'], { S: 'stick' }, 'ladder', 3),
  shaped(['SS', 'SS'], { S: 'stone' }, 'stone_bricks', 4),
  shaped(['P  ', 'PP ', 'PPP'], { P: 'planks' }, 'oak_stairs', 4),
  shaped(['C  ', 'CC ', 'CCC'], { C: 'cobblestone' }, 'cobblestone_stairs', 4),
  shaped(['B  ', 'BB ', 'BBB'], { B: 'stone_bricks' }, 'stone_brick_stairs', 4),
  shaped(['PPP'], { P: 'planks' }, 'oak_slab', 6),
  shaped(['CCC'], { C: 'cobblestone' }, 'cobblestone_slab', 6),
  shaped(['BBB'], { B: 'stone_bricks' }, 'stone_brick_slab', 6),
  shaped(['GGG', 'GGG'], { G: 'glass' }, 'glass_pane', 16),
  shaped(['WWW', 'PPP'], { W: WOOLS, P: 'planks' }, 'bed'),
  shapeless(['paper', 'gunpowder'], 'firework_rocket', 3),
  shapeless(['paper', 'gunpowder', 'gunpowder'], 'firework_big', 3),
  shapeless(['paper', 'gunpowder', 'gold_ingot'], 'firework_star', 3),
  shapeless(['paper', 'gunpowder', 'green'], 'firework_creeper', 3),
  shapeless(['paper', 'gunpowder', 'pink'], 'firework_heart', 3),
  ...STORAGE_BLOCKS.flatMap(([block, item]) => [
    shaped(['MMM', 'MMM', 'MMM'], { M: item }, block),
    shapeless([block], item, 9),
  ]),
  ...Object.entries(TOOL_MATERIALS).flatMap(([tier, m]) => [
    shaped(['MMM', ' S ', ' S '], { M: m, S: 'stick' }, `${tier}_pickaxe`),
    shaped(['MM', 'MS', ' S'], { M: m, S: 'stick' }, `${tier}_axe`),
    shaped(['M', 'S', 'S'], { M: m, S: 'stick' }, `${tier}_shovel`),
    shaped(['M', 'M', 'S'], { M: m, S: 'stick' }, `${tier}_sword`),
    shaped(['MM', ' S', ' S'], { M: m, S: 'stick' }, `${tier}_hoe`),
  ]),
  ...Object.entries(ARMOR_MATERIALS).flatMap(([material, m]) => [
    shaped(['MMM', 'M M'], { M: m }, `${material}_helmet`),
    shaped(['M M', 'MMM', 'MMM'], { M: m }, `${material}_chestplate`),
    shaped(['MMM', 'M M', 'M M'], { M: m }, `${material}_leggings`),
    shaped(['M M', 'M M'], { M: m }, `${material}_boots`),
  ]),
];

function matches(ingredient: Ingredient | undefined, slot: Slot): boolean {
  if (ingredient === undefined) return slot === null;
  if (!slot) return false;
  const key = getItem(slot.id)?.key;
  return typeof ingredient === 'string' ? key === ingredient : ingredient.includes(key ?? '');
}

/** The grid with empty rows and columns removed, as rows of slots. */
function trim(grid: readonly Slot[], width: number): Slot[][] {
  const rows: Slot[][] = [];
  for (let i = 0; i < grid.length; i += width) rows.push(grid.slice(i, i + width));
  const filledRows = rows.map((r) => r.some(Boolean));
  const top = filledRows.indexOf(true);
  if (top < 0) return [];
  const bottom = filledRows.lastIndexOf(true);
  const used = rows.slice(top, bottom + 1);
  const filledCols = Array.from({ length: width }, (_, c) => used.some((r) => r[c]));
  const left = filledCols.indexOf(true);
  const right = filledCols.lastIndexOf(true);
  return used.map((r) => r.slice(left, right + 1));
}

function matchShaped(recipe: ShapedRecipe, rows: Slot[][], mirror: boolean): boolean {
  const pattern = recipe.pattern;
  const height = pattern.length;
  const width = Math.max(...pattern.map((p) => p.length));
  if (rows.length !== height || rows[0]!.length !== width) return false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = mirror ? width - 1 - x : x;
      const letter = pattern[y]![px] ?? ' ';
      const ingredient = letter === ' ' ? undefined : recipe.key[letter];
      if (!matches(ingredient, rows[y]![x] ?? null)) return false;
    }
  }
  return true;
}

function matchShapeless(recipe: ShapelessRecipe, grid: readonly Slot[]): boolean {
  const items = grid.filter((s): s is ItemStack => s !== null);
  if (items.length !== recipe.ingredients.length) return false;
  const left = [...items];
  for (const ingredient of recipe.ingredients) {
    const i = left.findIndex((s) => matches(ingredient, s));
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

/** Finds what the crafting grid makes (width 2 or 3), or null. */
export function findRecipe(grid: readonly Slot[], width: number): Recipe | null {
  const rows = trim(grid, width);
  if (rows.length === 0) return null;
  for (const recipe of RECIPES) {
    if (recipe.kind === 'shaped') {
      if (matchShaped(recipe, rows, false) || matchShaped(recipe, rows, true)) return recipe;
    } else if (matchShapeless(recipe, grid)) {
      return recipe;
    }
  }
  return null;
}

export function recipeResult(recipe: Recipe): ItemStack {
  return { id: itemId(recipe.result.key), count: recipe.result.count };
}

/** Uses up one of each ingredient in the grid (after crafting once). */
export function consumeIngredients(grid: Slot[]): void {
  for (let i = 0; i < grid.length; i++) {
    const slot = grid[i];
    if (!slot) continue;
    slot.count--;
    if (slot.count <= 0) grid[i] = null;
  }
}

// --- Furnace ----------------------------------------------------------------

/** What smelts into what (Minecraft recipes; clay makes bricks here). */
export const SMELTING: Record<string, string> = {
  raw_iron: 'iron_ingot',
  raw_gold: 'gold_ingot',
  iron_ore: 'iron_ingot',
  gold_ore: 'gold_ingot',
  diamond_ore: 'diamond',
  coal_ore: 'coal',
  lapis_ore: 'lapis_lazuli',
  redstone_ore: 'redstone',
  emerald_ore: 'emerald',
  sand: 'glass',
  cobblestone: 'stone',
  log: 'charcoal',
  birch_log: 'charcoal',
  spruce_log: 'charcoal',
  porkchop: 'cooked_porkchop',
  beef: 'cooked_beef',
  chicken: 'cooked_chicken',
  mutton: 'cooked_mutton',
  clay: 'brick',
  cactus: 'green',
  netherrack: 'nether_brick',
  quartz_ore: 'quartz',
};

export function smeltResult(id: number): number | undefined {
  const key = getItem(id)?.key;
  const result = key ? SMELTING[key] : undefined;
  return result ? itemId(result) : undefined;
}
