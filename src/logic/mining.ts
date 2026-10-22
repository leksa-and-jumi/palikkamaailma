// How long blocks take to break, which tool is right, and what drops.
// Numbers follow Minecraft: stone needs a pickaxe, iron needs a stone
// pickaxe, diamonds need an iron pickaxe, obsidian needs a diamond pickaxe.

import { getBlockType } from './blocks';
import { itemId, type ItemType, type ToolKind } from './items';

export interface BlockRules {
  /** Seconds-ish toughness (Minecraft "hardness"). Infinity = unbreakable. */
  hardness: number;
  /** The tool that breaks it fast. */
  tool?: ToolKind;
  /** Without this tool level nothing drops (0 = wood, 1 = stone, 2 = iron, 3 = diamond). */
  needsLevel?: number;
  /** What drops (item key and count). Default: the block itself. Empty = nothing. */
  drops?: readonly { key: string; count: number; chance?: number }[];
}

const RULES: Record<string, BlockRules> = {
  grass: { hardness: 0.6, tool: 'shovel', drops: [{ key: 'dirt', count: 1 }] },
  dirt: { hardness: 0.5, tool: 'shovel' },
  stone: {
    hardness: 1.5,
    tool: 'pickaxe',
    needsLevel: 0,
    drops: [{ key: 'cobblestone', count: 1 }],
  },
  sand: { hardness: 0.5, tool: 'shovel' },
  log: { hardness: 2, tool: 'axe' },
  birch_log: { hardness: 2, tool: 'axe' },
  spruce_log: { hardness: 2, tool: 'axe' },
  leaves: {
    hardness: 0.2,
    tool: 'hoe',
    drops: [
      { key: 'apple', count: 1, chance: 0.02 },
      { key: 'stick', count: 1, chance: 0.04 },
    ],
  },
  birch_leaves: { hardness: 0.2, tool: 'hoe', drops: [{ key: 'stick', count: 1, chance: 0.04 }] },
  spruce_leaves: { hardness: 0.2, tool: 'hoe', drops: [{ key: 'stick', count: 1, chance: 0.04 }] },
  planks: { hardness: 2, tool: 'axe' },
  glass: { hardness: 0.3, drops: [] },
  cobblestone: { hardness: 2, tool: 'pickaxe', needsLevel: 0 },
  brick: { hardness: 2, tool: 'pickaxe', needsLevel: 0 },
  snow: { hardness: 0.6, tool: 'shovel', drops: [{ key: 'dirt', count: 1 }] },
  gold_block: { hardness: 3, tool: 'pickaxe', needsLevel: 2 },
  diamond_block: { hardness: 5, tool: 'pickaxe', needsLevel: 2 },
  bedrock: { hardness: Infinity },
  lamp: { hardness: 0.3 },
  pumpkin: { hardness: 1, tool: 'axe' },
  tnt: { hardness: 0 },
  coal_ore: { hardness: 3, tool: 'pickaxe', needsLevel: 0, drops: [{ key: 'coal', count: 1 }] },
  iron_ore: { hardness: 3, tool: 'pickaxe', needsLevel: 1, drops: [{ key: 'raw_iron', count: 1 }] },
  gold_ore: { hardness: 3, tool: 'pickaxe', needsLevel: 2, drops: [{ key: 'raw_gold', count: 1 }] },
  diamond_ore: {
    hardness: 3,
    tool: 'pickaxe',
    needsLevel: 2,
    drops: [{ key: 'diamond', count: 1 }],
  },
  redstone_ore: {
    hardness: 3,
    tool: 'pickaxe',
    needsLevel: 2,
    drops: [{ key: 'redstone', count: 4 }],
  },
  lapis_ore: {
    hardness: 3,
    tool: 'pickaxe',
    needsLevel: 1,
    drops: [{ key: 'lapis_lazuli', count: 6 }],
  },
  emerald_ore: {
    hardness: 3,
    tool: 'pickaxe',
    needsLevel: 2,
    drops: [{ key: 'emerald', count: 1 }],
  },
  sandstone: { hardness: 0.8, tool: 'pickaxe', needsLevel: 0 },
  gravel: { hardness: 0.6, tool: 'shovel' },
  cactus: { hardness: 0.4 },
  tall_grass: { hardness: 0, drops: [{ key: 'wheat', count: 1, chance: 0.08 }] },
  dandelion: { hardness: 0 },
  poppy: { hardness: 0 },
  dead_bush: { hardness: 0, drops: [{ key: 'stick', count: 1 }] },
  sugar_cane: { hardness: 0 },
  obsidian: { hardness: 50, tool: 'pickaxe', needsLevel: 3 },
  crafting_table: { hardness: 2.5, tool: 'axe' },
  furnace: { hardness: 3.5, tool: 'pickaxe', needsLevel: 0 },
  chest: { hardness: 2.5, tool: 'axe' },
  enchanting_table: { hardness: 5, tool: 'pickaxe', needsLevel: 0 },
  bookshelf: { hardness: 1.5, tool: 'axe', drops: [{ key: 'book', count: 3 }] },
  torch: { hardness: 0 },
  clay: { hardness: 0.6, tool: 'shovel' },
  ice: { hardness: 0.5, tool: 'pickaxe', drops: [] },
  iron_block: { hardness: 5, tool: 'pickaxe', needsLevel: 1 },
  emerald_block: { hardness: 5, tool: 'pickaxe', needsLevel: 2 },
  lapis_block: { hardness: 3, tool: 'pickaxe', needsLevel: 1 },
  redstone_block: { hardness: 5, tool: 'pickaxe', needsLevel: 0 },
  coal_block: { hardness: 5, tool: 'pickaxe', needsLevel: 0 },
};

const GRAVEL_FLINT_CHANCE = 0.1;

/** Wool and anything not in the table. */
const DEFAULT_RULES: BlockRules = { hardness: 0.8 };

export function blockRules(blockId: number): BlockRules {
  return RULES[getBlockType(blockId).key] ?? DEFAULT_RULES;
}

/** Will this item break the block so that it drops something? */
export function canHarvest(blockId: number, tool: ItemType | undefined): boolean {
  const rules = blockRules(blockId);
  if (rules.needsLevel === undefined) return true;
  const info = tool?.tool;
  return !!info && info.kind === rules.tool && info.level >= rules.needsLevel;
}

/**
 * Seconds needed to break the block in survival with this item.
 * `efficiency` is the Efficiency enchantment level (0 = none).
 */
export function breakTime(blockId: number, tool: ItemType | undefined, efficiency = 0): number {
  const rules = blockRules(blockId);
  if (!Number.isFinite(rules.hardness)) return Infinity;
  if (rules.hardness === 0) return 0;
  let speed = 1;
  if (tool?.tool && tool.tool.kind === rules.tool) {
    speed = tool.tool.speed;
    if (efficiency > 0) speed += efficiency * efficiency + 1;
  }
  const factor = canHarvest(blockId, tool) ? 1.5 : 5;
  return (rules.hardness * factor) / speed;
}

export interface Drop {
  id: number;
  count: number;
}

/**
 * What falls out when the block breaks. `random` gives 0…1; `fortune` and
 * `silkTouch` are enchantments on the tool.
 */
export function blockDrops(
  blockId: number,
  tool: ItemType | undefined,
  random: () => number = Math.random,
  fortune = 0,
  silkTouch = false,
): Drop[] {
  if (!canHarvest(blockId, tool)) return [];
  const rules = blockRules(blockId);
  const block = getBlockType(blockId);
  if (silkTouch && block.placeable) return [{ id: blockId, count: 1 }];
  // Gravel gives flint one time in ten, otherwise itself.
  if (block.key === 'gravel') {
    return [{ id: random() < GRAVEL_FLINT_CHANCE ? itemId('flint') : blockId, count: 1 }];
  }
  if (!rules.drops) return [{ id: blockId, count: 1 }];

  const drops: Drop[] = [];
  for (const drop of rules.drops) {
    if (drop.chance !== undefined && random() >= drop.chance) continue;
    let count = drop.count;
    // Fortune gives extra ore drops (like Minecraft: up to fortune + 1 times).
    if (fortune > 0 && block.key.endsWith('_ore')) {
      count *= 1 + Math.max(0, Math.floor(random() * (fortune + 2)) - 1);
    }
    drops.push({ id: itemId(drop.key), count });
  }
  return drops;
}

/** Does this item get worn by breaking blocks with it? */
export function wearsWhenMining(item: ItemType | undefined): boolean {
  return !!item?.tool && item.tool.kind !== 'sword';
}
