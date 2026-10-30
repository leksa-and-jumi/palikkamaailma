// Experience levels and enchanting, like in Minecraft: defeating creatures
// gives experience, and at the enchanting table you pay levels and lapis
// lazuli to make a tool, weapon or armor piece stronger. An enchanted book
// can be put on an item there too.

import { getItem, type ItemType } from './items';
import { mulberry32 } from './noise';
import type { ItemStack } from './inventory';

export type EnchantId =
  | 'sharpness'
  | 'efficiency'
  | 'unbreaking'
  | 'fortune'
  | 'silk_touch'
  | 'protection'
  | 'feather_falling'
  | 'power';

interface EnchantInfo {
  /** The Finnish name, like in Minecraft. */
  name: string;
  max: number;
  /** Which items it goes on. */
  fits(item: ItemType): boolean;
  /** Told to the kids when they pick it. */
  help: string;
}

const isTool = (i: ItemType) => !!i.tool && i.tool.kind !== 'sword';
const digs = (i: ItemType) => !!i.tool && ['pickaxe', 'axe', 'shovel'].includes(i.tool.kind);

export const ENCHANTMENTS: Record<EnchantId, EnchantInfo> = {
  sharpness: {
    name: 'Terävyys',
    max: 5,
    fits: (i) => i.tool?.kind === 'sword' || i.tool?.kind === 'axe',
    help: 'lyö kovempaa',
  },
  efficiency: { name: 'Tehokkuus', max: 5, fits: isTool, help: 'louhii nopeammin' },
  unbreaking: {
    name: 'Kestävyys',
    max: 3,
    fits: (i) => !!i.tool || !!i.armor || i.special === 'bow',
    help: 'kestää kauemmin',
  },
  fortune: { name: 'Onni', max: 3, fits: digs, help: 'enemmän malmeja' },
  silk_touch: { name: 'Silkkikosketus', max: 1, fits: digs, help: 'palikka tulee sellaisenaan' },
  protection: { name: 'Suojaus', max: 4, fits: (i) => !!i.armor, help: 'vähemmän vahinkoa' },
  feather_falling: {
    name: 'Höyhenkevyys',
    max: 4,
    fits: (i) => i.armor?.slot === 'feet',
    help: 'putoaminen sattuu vähemmän',
  },
  power: {
    name: 'Voima',
    max: 5,
    fits: (i) => i.special === 'bow',
    help: 'nuolet osuvat kovempaa',
  },
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/** "Terävyys II" */
export function enchantName(id: string, level: number): string {
  const info = ENCHANTMENTS[id as EnchantId];
  return info ? `${info.name} ${ROMAN[level] ?? level}` : id;
}

/** "Timanttimiekka (Terävyys II, Kestävyys I)" */
export function stackName(stack: ItemStack): string {
  const name = getItem(stack.id)?.name ?? '';
  const list = Object.entries(stack.enchants ?? {}).map(([id, l]) => enchantName(id, l));
  return list.length > 0 ? `${name} (${list.join(', ')})` : name;
}

// --- Experience --------------------------------------------------------------

/** Points needed to go from `level` to the next (Minecraft's numbers). */
export function pointsForNext(level: number): number {
  if (level < 16) return 2 * level + 7;
  if (level < 31) return 5 * level - 38;
  return 9 * level - 158;
}

/** Your level and how far you are to the next one (0–1). */
export function levelOf(points: number): { level: number; progress: number } {
  let level = 0;
  let left = Math.max(0, Math.floor(points));
  while (left >= pointsForNext(level)) {
    left -= pointsForNext(level);
    level++;
  }
  return { level, progress: left / pointsForNext(level) };
}

/** All the points up to the start of a level. */
function pointsAt(level: number): number {
  let total = 0;
  for (let l = 0; l < level; l++) total += pointsForNext(l);
  return total;
}

/** Points left after paying `levels` (the bar keeps how far you were). */
export function spendLevels(points: number, levels: number): number {
  const { level, progress } = levelOf(points);
  const to = Math.max(0, level - levels);
  return pointsAt(to) + Math.floor(progress * pointsForNext(to));
}

// --- The enchanting table ----------------------------------------------------

export interface Offer {
  /** Levels (and lapis) it costs: 1, 2 or 3. */
  cost: number;
  enchant: EnchantId;
  level: number;
}

/** What can go on this item at all. */
export function enchantsFor(stack: ItemStack): EnchantId[] {
  const item = getItem(stack.id);
  if (!item) return [];
  return (Object.keys(ENCHANTMENTS) as EnchantId[]).filter((id) => {
    if (!ENCHANTMENTS[id].fits(item)) return false;
    // Fortune and Silk Touch never go together.
    if (id === 'fortune' && stack.enchants?.silk_touch) return false;
    if (id === 'silk_touch' && stack.enchants?.fortune) return false;
    return (stack.enchants?.[id] ?? 0) < ENCHANTMENTS[id].max;
  });
}

/** The three offers for an item (the same until the item or the seed changes). */
export function offersFor(stack: ItemStack, seed: number): Offer[] {
  const choices = enchantsFor(stack);
  if (choices.length === 0) return [];
  const random = mulberry32(seed ^ (stack.id * 7919));
  return [1, 2, 3].map((cost) => {
    const enchant = choices[Math.floor(random() * choices.length)]!;
    const max = ENCHANTMENTS[enchant].max;
    const have = stack.enchants?.[enchant] ?? 0;
    const level = Math.min(max, Math.max(have + 1, Math.ceil((cost * max) / 3)));
    return { cost, enchant, level };
  });
}

/** The item with the enchantment on it. */
export function applyEnchant(stack: ItemStack, enchant: string, level: number): ItemStack {
  const now = stack.enchants?.[enchant] ?? 0;
  return { ...stack, enchants: { ...stack.enchants, [enchant]: Math.max(now, level) } };
}

/** Puts a book's enchantments on an item (only those that fit it). Null if none fit. */
export function applyBook(stack: ItemStack, book: ItemStack): ItemStack | null {
  const fits = enchantsFor(stack);
  let out = stack;
  for (const [id, level] of Object.entries(book.enchants ?? {})) {
    if (fits.includes(id as EnchantId)) out = applyEnchant(out, id, level);
  }
  return out === stack ? null : out;
}

/** Protection on all your armor: each level takes 4 % off (at most 64 %). */
export function protectionFactor(armor: readonly (ItemStack | null)[]): number {
  const levels = armor.reduce((n, s) => n + (s?.enchants?.protection ?? 0), 0);
  return 1 - Math.min(0.64, levels * 0.04);
}
