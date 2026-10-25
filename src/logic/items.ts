// Everything you can hold: every block is an item (same id), plus tools,
// armor, food and materials (ids from 256). Names and numbers follow
// Minecraft, because the boys know them.

import { BLOCKS, REDSTONE_WIRE, type BlockType } from './blocks';

export const FIRST_ITEM_ID = 256;

export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hoe';
export type Tier = 'wood' | 'stone' | 'iron' | 'gold' | 'diamond';
export type ArmorSlot = 'head' | 'chest' | 'legs' | 'feet';
export type ArmorMaterial = 'leather' | 'iron' | 'gold' | 'diamond';

export interface ToolInfo {
  kind: ToolKind;
  tier: Tier;
  /** Mining level: wood/gold 0, stone 1, iron 2, diamond 3. */
  level: number;
  /** How much faster than a hand on the right blocks. */
  speed: number;
  /** Damage dealt when hitting (hearts × 2). */
  damage: number;
  durability: number;
}

export interface ArmorInfo {
  slot: ArmorSlot;
  material: ArmorMaterial;
  /** Armor points (each point blocks 4 % of damage). */
  points: number;
  durability: number;
}

export interface FoodInfo {
  /** Hunger points filled (2 = one drumstick). */
  hunger: number;
  saturation: number;
}

export interface ItemType {
  id: number;
  key: string;
  /** Finnish name. */
  name: string;
  /** Most in one inventory slot. */
  stack: number;
  /** Placing this item puts this block in the world. */
  block?: number;
  tool?: ToolInfo;
  armor?: ArmorInfo;
  food?: FoodInfo;
  /** Seconds this item burns in a furnace. */
  fuel?: number;
  /** Bow, arrows, buckets and other special items. */
  special?:
    | 'bow'
    | 'arrow'
    | 'bucket'
    | 'water_bucket'
    | 'lava_bucket'
    | 'enchanted_book'
    | 'flint_and_steel'
    | 'firework';
  /** Which firework this rocket makes (index in FIREWORK_KINDS). */
  firework?: number;
}

// --- Tools ------------------------------------------------------------------

export const TIERS: Record<
  Tier,
  { level: number; speed: number; durability: number; name: string }
> = {
  wood: { level: 0, speed: 2, durability: 59, name: 'Puinen' },
  stone: { level: 1, speed: 4, durability: 131, name: 'Kivi' },
  iron: { level: 2, speed: 6, durability: 250, name: 'Rauta' },
  gold: { level: 0, speed: 12, durability: 32, name: 'Kultainen' },
  diamond: { level: 3, speed: 8, durability: 1561, name: 'Timantti' },
};

const TOOL_NAMES: Record<ToolKind, string> = {
  pickaxe: 'hakku',
  axe: 'kirves',
  shovel: 'lapio',
  sword: 'miekka',
  hoe: 'kuokka',
};

/** Hit damage per tool and tier (Minecraft Java values). */
const TOOL_DAMAGE: Record<ToolKind, Record<Tier, number>> = {
  sword: { wood: 4, gold: 4, stone: 5, iron: 6, diamond: 7 },
  axe: { wood: 7, gold: 7, stone: 9, iron: 9, diamond: 9 },
  pickaxe: { wood: 2, gold: 2, stone: 3, iron: 4, diamond: 5 },
  shovel: { wood: 2.5, gold: 2.5, stone: 3.5, iron: 4.5, diamond: 5.5 },
  hoe: { wood: 1, gold: 1, stone: 1, iron: 1, diamond: 1 },
};

const TIER_KEYS: Record<Tier, string> = {
  wood: 'wooden',
  stone: 'stone',
  iron: 'iron',
  gold: 'golden',
  diamond: 'diamond',
};

function toolName(kind: ToolKind, tier: Tier): string {
  const prefix = TIERS[tier].name;
  // "Kivi" and "Rauta" join the word ("Kivihakku"), the others are separate words.
  return tier === 'stone' || tier === 'iron' || tier === 'diamond'
    ? `${prefix}${TOOL_NAMES[kind]}`
    : `${prefix} ${TOOL_NAMES[kind]}`;
}

// --- Armor ------------------------------------------------------------------

const ARMOR_POINTS: Record<ArmorMaterial, Record<ArmorSlot, number>> = {
  leather: { head: 1, chest: 3, legs: 2, feet: 1 },
  gold: { head: 2, chest: 5, legs: 3, feet: 1 },
  iron: { head: 2, chest: 6, legs: 5, feet: 2 },
  diamond: { head: 3, chest: 8, legs: 6, feet: 3 },
};
const ARMOR_DURABILITY_BASE: Record<ArmorSlot, number> = {
  head: 11,
  chest: 16,
  legs: 15,
  feet: 13,
};
const ARMOR_DURABILITY_FACTOR: Record<ArmorMaterial, number> = {
  leather: 5,
  gold: 7,
  iron: 15,
  diamond: 33,
};
const ARMOR_KEYS: Record<ArmorSlot, string> = {
  head: 'helmet',
  chest: 'chestplate',
  legs: 'leggings',
  feet: 'boots',
};
const ARMOR_NAMES: Record<ArmorSlot, string> = {
  head: 'kypärä',
  chest: 'rintapanssari',
  legs: 'housut',
  feet: 'saappaat',
};
const ARMOR_MATERIAL_KEYS: Record<ArmorMaterial, string> = {
  leather: 'leather',
  gold: 'golden',
  iron: 'iron',
  diamond: 'diamond',
};
const ARMOR_MATERIAL_NAMES: Record<ArmorMaterial, string> = {
  leather: 'Nahka',
  gold: 'Kulta',
  iron: 'Rauta',
  diamond: 'Timantti',
};

// --- The list ---------------------------------------------------------------

type ItemSpec = Omit<ItemType, 'id' | 'stack'> & { stack?: number };

/** Items in a fixed order: never reorder, the position is the saved id. */
const ITEM_SPECS: ItemSpec[] = [
  { key: 'stick', name: 'Keppi', fuel: 5 },
  { key: 'coal', name: 'Hiili', fuel: 80 },
  { key: 'charcoal', name: 'Puuhiili', fuel: 80 },
  { key: 'raw_iron', name: 'Raakarauta' },
  { key: 'raw_gold', name: 'Raakakulta' },
  { key: 'iron_ingot', name: 'Rautaharkko' },
  { key: 'gold_ingot', name: 'Kultaharkko' },
  { key: 'diamond', name: 'Timantti' },
  { key: 'emerald', name: 'Smaragdi' },
  { key: 'lapis_lazuli', name: 'Lasuuri' },
  { key: 'redstone', name: 'Punakivipöly', block: REDSTONE_WIRE },
  { key: 'flint', name: 'Piikivi' },
  { key: 'string', name: 'Lanka' },
  { key: 'feather', name: 'Sulka' },
  { key: 'gunpowder', name: 'Ruuti' },
  { key: 'leather', name: 'Nahka' },
  { key: 'paper', name: 'Paperi' },
  { key: 'book', name: 'Kirja' },
  { key: 'bone', name: 'Luu' },
  { key: 'arrow', name: 'Nuoli', special: 'arrow' },
  { key: 'bow', name: 'Jousi', stack: 1, special: 'bow' },
  { key: 'bucket', name: 'Ämpäri', stack: 16, special: 'bucket' },
  { key: 'water_bucket', name: 'Vesiämpäri', stack: 1, special: 'water_bucket' },
  { key: 'lava_bucket', name: 'Laavaämpäri', stack: 1, special: 'lava_bucket', fuel: 1000 },
  { key: 'apple', name: 'Omena', food: { hunger: 4, saturation: 2.4 } },
  { key: 'golden_apple', name: 'Kultainen omena', food: { hunger: 4, saturation: 9.6 } },
  { key: 'bread', name: 'Leipä', food: { hunger: 5, saturation: 6 } },
  { key: 'porkchop', name: 'Raaka porsaankyljys', food: { hunger: 3, saturation: 1.8 } },
  { key: 'cooked_porkchop', name: 'Paistettu kyljys', food: { hunger: 8, saturation: 12.8 } },
  { key: 'beef', name: 'Raaka naudanliha', food: { hunger: 3, saturation: 1.8 } },
  { key: 'cooked_beef', name: 'Pihvi', food: { hunger: 8, saturation: 12.8 } },
  { key: 'chicken', name: 'Raaka kana', food: { hunger: 2, saturation: 1.2 } },
  { key: 'cooked_chicken', name: 'Paistettu kana', food: { hunger: 6, saturation: 7.2 } },
  { key: 'mutton', name: 'Raaka lampaanliha', food: { hunger: 2, saturation: 1.2 } },
  { key: 'cooked_mutton', name: 'Paistettu lampaanliha', food: { hunger: 6, saturation: 9.6 } },
  { key: 'rotten_flesh', name: 'Mätä liha', food: { hunger: 4, saturation: 0.8 } },
  { key: 'enchanted_book', name: 'Lumottu kirja', stack: 1, special: 'enchanted_book' },
  { key: 'wheat', name: 'Vehnä' },
  { key: 'egg', name: 'Muna', stack: 16 },
  { key: 'flint_and_steel', name: 'Tulukset', stack: 1, special: 'flint_and_steel' },
  { key: 'firework_rocket', name: 'Ilotulitusraketti', special: 'firework', firework: 0 },
  { key: 'firework_big', name: 'Iso raketti', special: 'firework', firework: 1 },
  { key: 'firework_star', name: 'Tähtiraketti', special: 'firework', firework: 2 },
  { key: 'firework_creeper', name: 'Creeper-raketti', special: 'firework', firework: 3 },
  { key: 'firework_heart', name: 'Sydänraketti', special: 'firework', firework: 4 },
];

for (const kind of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'] as const) {
  for (const tier of ['wood', 'stone', 'iron', 'gold', 'diamond'] as const) {
    const t = TIERS[tier];
    ITEM_SPECS.push({
      key: `${TIER_KEYS[tier]}_${kind}`,
      name: toolName(kind, tier),
      stack: 1,
      tool: {
        kind,
        tier,
        level: t.level,
        speed: t.speed,
        damage: TOOL_DAMAGE[kind][tier],
        durability: t.durability,
      },
      fuel: tier === 'wood' ? 10 : undefined,
    });
  }
}

for (const material of ['leather', 'iron', 'gold', 'diamond'] as const) {
  for (const slot of ['head', 'chest', 'legs', 'feet'] as const) {
    ITEM_SPECS.push({
      key: `${ARMOR_MATERIAL_KEYS[material]}_${ARMOR_KEYS[slot]}`,
      name: `${ARMOR_MATERIAL_NAMES[material]}${ARMOR_NAMES[slot]}`,
      stack: 1,
      armor: {
        slot,
        material,
        points: ARMOR_POINTS[material][slot],
        durability: ARMOR_DURABILITY_BASE[slot] * ARMOR_DURABILITY_FACTOR[material],
      },
    });
  }
}

// New items go to the end, so the old ids stay the same.
ITEM_SPECS.push({ key: 'slime_ball', name: 'Limapallo' });

/** Blocks that burn in a furnace (seconds). */
const BLOCK_FUEL: Record<string, number> = {
  log: 15,
  birch_log: 15,
  spruce_log: 15,
  planks: 15,
  crafting_table: 15,
  chest: 15,
  bookshelf: 15,
  coal_block: 800,
  oak_door: 10,
  trapdoor: 15,
  fence: 15,
  fence_gate: 15,
  ladder: 15,
  oak_stairs: 15,
  oak_slab: 7.5,
};

function blockItem(b: BlockType): ItemType {
  return { id: b.id, key: b.key, name: b.name, stack: 64, block: b.id, fuel: BLOCK_FUEL[b.key] };
}

const ALL: ItemType[] = [
  ...BLOCKS.map(blockItem),
  ...ITEM_SPECS.map((spec, i) => ({ stack: 64, ...spec, id: FIRST_ITEM_ID + i })),
];
const BY_ID = new Map(ALL.map((item) => [item.id, item]));
const BY_KEY = new Map(ALL.map((item) => [item.key, item]));

export const ITEMS: readonly ItemType[] = ALL;

export function getItem(id: number): ItemType | undefined {
  return BY_ID.get(id);
}

export function itemByKey(key: string): ItemType {
  const item = BY_KEY.get(key);
  if (!item) throw new Error(`Unknown item ${key}`);
  return item;
}

export function itemId(key: string): number {
  return itemByKey(key).id;
}

export function isValidItemId(id: unknown): id is number {
  return typeof id === 'number' && BY_ID.has(id);
}

/** Uses left before the item breaks, or undefined if it never wears out. */
export function maxDurability(item: ItemType): number | undefined {
  return (
    item.tool?.durability ??
    item.armor?.durability ??
    (item.special === 'bow' ? 384 : item.special === 'flint_and_steel' ? 64 : undefined)
  );
}
