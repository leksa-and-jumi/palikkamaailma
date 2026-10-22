// Every kind of block in the world. The number (id) is what is stored in the
// world and sent over the network, so never change an existing id.

export const TILE_NAMES = [
  'grass_top',
  'grass_side',
  'dirt',
  'stone',
  'sand',
  'water',
  'log_side',
  'log_top',
  'leaves',
  'planks',
  'glass',
  'cobble',
  'brick',
  'snow',
  'snow_side',
  'gold_block',
  'diamond_block',
  'wool_red',
  'wool_blue',
  'wool_yellow',
  'wool_green',
  'wool_white',
  'wool_black',
  'wool_pink',
  'wool_orange',
  'wool_purple',
  'bedrock',
  'lamp',
  'pumpkin_side',
  'pumpkin_top',
  'tnt_side',
  'tnt_top',
  'coal_ore',
  'iron_ore',
  'gold_ore',
  'diamond_ore',
  'redstone_ore',
  'lapis_ore',
  'emerald_ore',
  'sandstone_top',
  'sandstone_side',
  'gravel',
  'birch_log',
  'birch_leaves',
  'spruce_log',
  'spruce_leaves',
  'cactus_side',
  'cactus_top',
  'tall_grass',
  'dandelion',
  'poppy',
  'dead_bush',
  'lava',
  'obsidian',
  'crafting_table_top',
  'crafting_table_side',
  'crafting_table_front',
  'furnace_front',
  'furnace_side',
  'furnace_top',
  'chest_front',
  'chest_side',
  'chest_top',
  'enchanting_top',
  'enchanting_side',
  'bookshelf',
  'torch',
  'clay',
  'ice',
  'iron_block',
  'emerald_block',
  'lapis_block',
  'redstone_block',
  'coal_block',
  'sugar_cane',
] as const;
export type TileName = (typeof TILE_NAMES)[number];

export interface BlockTiles {
  top: TileName;
  side: TileName;
  bottom: TileName;
  /** Used on the north and south sides when set (furnace, crafting table). */
  front?: TileName;
}

export interface BlockType {
  id: number;
  /** English key, used by the magic builder (AI) and recipes. */
  key: string;
  /** Finnish name shown in the game. */
  name: string;
  /** Players and physics bump into solid blocks. */
  solid: boolean;
  /** You can see through it (glass, leaves, water, plants). */
  transparent: boolean;
  liquid: boolean;
  /** False for bedrock: it can never be broken. */
  breakable: boolean;
  /** Shown in the creative block picker. */
  placeable: boolean;
  /** 'cross' = drawn as two crossing pictures (flowers, grass, torches). */
  shape: 'cube' | 'cross';
  /** Light the block gives (0–15): torches, lamps, lava. */
  light: number;
  tiles: BlockTiles;
}

type BlockOptions = Partial<
  Pick<
    BlockType,
    'solid' | 'transparent' | 'liquid' | 'breakable' | 'placeable' | 'shape' | 'light'
  >
>;

function block(
  id: number,
  key: string,
  name: string,
  tiles: TileName | BlockTiles,
  options: BlockOptions = {},
): BlockType {
  const faces = typeof tiles === 'string' ? { top: tiles, side: tiles, bottom: tiles } : tiles;
  return {
    id,
    key,
    name,
    solid: options.solid ?? true,
    transparent: options.transparent ?? false,
    liquid: options.liquid ?? false,
    breakable: options.breakable ?? true,
    placeable: options.placeable ?? true,
    shape: options.shape ?? 'cube',
    light: options.light ?? 0,
    tiles: faces,
  };
}

/** Flowers, grass and torches: no collision, see-through, drawn as a cross. */
const PLANT: BlockOptions = { solid: false, transparent: true, shape: 'cross' };

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const SAND = 4;
export const WATER = 5;
export const LOG = 6;
export const LEAVES = 7;
export const PLANKS = 8;
export const GLASS = 9;
export const COBBLE = 10;
export const BRICK = 11;
export const SNOW = 12;
export const GOLD_BLOCK = 13;
export const DIAMOND_BLOCK = 14;
export const WOOL_RED = 15;
export const WOOL_BLUE = 16;
export const WOOL_YELLOW = 17;
export const WOOL_GREEN = 18;
export const WOOL_WHITE = 19;
export const BEDROCK = 20;
export const WOOL_BLACK = 21;
export const WOOL_PINK = 22;
export const WOOL_ORANGE = 23;
export const WOOL_PURPLE = 24;
export const LAMP = 25;
export const PUMPKIN = 26;
export const TNT = 27;
export const COAL_ORE = 28;
export const IRON_ORE = 29;
export const GOLD_ORE = 30;
export const DIAMOND_ORE = 31;
export const REDSTONE_ORE = 32;
export const LAPIS_ORE = 33;
export const EMERALD_ORE = 34;
export const SANDSTONE = 35;
export const GRAVEL = 36;
export const BIRCH_LOG = 37;
export const BIRCH_LEAVES = 38;
export const SPRUCE_LOG = 39;
export const SPRUCE_LEAVES = 40;
export const CACTUS = 41;
export const TALL_GRASS = 42;
export const DANDELION = 43;
export const POPPY = 44;
export const DEAD_BUSH = 45;
export const LAVA = 46;
export const OBSIDIAN = 47;
export const CRAFTING_TABLE = 48;
export const FURNACE = 49;
export const CHEST = 50;
export const ENCHANTING_TABLE = 51;
export const BOOKSHELF = 52;
export const TORCH = 53;
export const CLAY = 54;
export const ICE = 55;
export const IRON_BLOCK = 56;
export const EMERALD_BLOCK = 57;
export const LAPIS_BLOCK = 58;
export const REDSTONE_BLOCK = 59;
export const COAL_BLOCK = 60;
export const SUGAR_CANE = 61;

const LIST: BlockType[] = [
  block(AIR, 'air', 'Ilma', 'stone', { solid: false, transparent: true, placeable: false }),
  block(GRASS, 'grass', 'Ruoho', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }),
  block(DIRT, 'dirt', 'Multa', 'dirt'),
  block(STONE, 'stone', 'Kivi', 'stone'),
  block(SAND, 'sand', 'Hiekka', 'sand'),
  block(WATER, 'water', 'Vesi', 'water', { solid: false, transparent: true, liquid: true }),
  block(LOG, 'log', 'Tammen runko', { top: 'log_top', side: 'log_side', bottom: 'log_top' }),
  block(LEAVES, 'leaves', 'Tammen lehdet', 'leaves', { transparent: true }),
  block(PLANKS, 'planks', 'Lankut', 'planks'),
  block(GLASS, 'glass', 'Lasi', 'glass', { transparent: true }),
  block(COBBLE, 'cobblestone', 'Mukulakivi', 'cobble'),
  block(BRICK, 'brick', 'Tiilet', 'brick'),
  block(SNOW, 'snow', 'Lumi', { top: 'snow', side: 'snow_side', bottom: 'dirt' }),
  block(GOLD_BLOCK, 'gold_block', 'Kultapalikka', 'gold_block'),
  block(DIAMOND_BLOCK, 'diamond_block', 'Timanttipalikka', 'diamond_block'),
  block(WOOL_RED, 'red', 'Punainen villa', 'wool_red'),
  block(WOOL_BLUE, 'blue', 'Sininen villa', 'wool_blue'),
  block(WOOL_YELLOW, 'yellow', 'Keltainen villa', 'wool_yellow'),
  block(WOOL_GREEN, 'green', 'Vihreä villa', 'wool_green'),
  block(WOOL_WHITE, 'white', 'Valkoinen villa', 'wool_white'),
  block(BEDROCK, 'bedrock', 'Peruskallio', 'bedrock', { breakable: false, placeable: false }),
  block(WOOL_BLACK, 'black', 'Musta villa', 'wool_black'),
  block(WOOL_PINK, 'pink', 'Pinkki villa', 'wool_pink'),
  block(WOOL_ORANGE, 'orange', 'Oranssi villa', 'wool_orange'),
  block(WOOL_PURPLE, 'purple', 'Violetti villa', 'wool_purple'),
  block(LAMP, 'lamp', 'Hehkukivi', 'lamp', { light: 15 }),
  block(PUMPKIN, 'pumpkin', 'Kurpitsa', {
    top: 'pumpkin_top',
    side: 'pumpkin_side',
    bottom: 'pumpkin_top',
  }),
  block(TNT, 'tnt', 'Dynamiitti', { top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_top' }),
  block(COAL_ORE, 'coal_ore', 'Hiilimalmi', 'coal_ore'),
  block(IRON_ORE, 'iron_ore', 'Rautamalmi', 'iron_ore'),
  block(GOLD_ORE, 'gold_ore', 'Kultamalmi', 'gold_ore'),
  block(DIAMOND_ORE, 'diamond_ore', 'Timanttimalmi', 'diamond_ore'),
  block(REDSTONE_ORE, 'redstone_ore', 'Punakivimalmi', 'redstone_ore'),
  block(LAPIS_ORE, 'lapis_ore', 'Lasuurimalmi', 'lapis_ore'),
  block(EMERALD_ORE, 'emerald_ore', 'Smaragdimalmi', 'emerald_ore'),
  block(SANDSTONE, 'sandstone', 'Hiekkakivi', {
    top: 'sandstone_top',
    side: 'sandstone_side',
    bottom: 'sandstone_top',
  }),
  block(GRAVEL, 'gravel', 'Sora', 'gravel'),
  block(BIRCH_LOG, 'birch_log', 'Koivun runko', {
    top: 'log_top',
    side: 'birch_log',
    bottom: 'log_top',
  }),
  block(BIRCH_LEAVES, 'birch_leaves', 'Koivun lehdet', 'birch_leaves', { transparent: true }),
  block(SPRUCE_LOG, 'spruce_log', 'Kuusen runko', {
    top: 'log_top',
    side: 'spruce_log',
    bottom: 'log_top',
  }),
  block(SPRUCE_LEAVES, 'spruce_leaves', 'Kuusen havut', 'spruce_leaves', { transparent: true }),
  block(CACTUS, 'cactus', 'Kaktus', {
    top: 'cactus_top',
    side: 'cactus_side',
    bottom: 'cactus_top',
  }),
  block(TALL_GRASS, 'tall_grass', 'Heinä', 'tall_grass', PLANT),
  block(DANDELION, 'dandelion', 'Voikukka', 'dandelion', PLANT),
  block(POPPY, 'poppy', 'Unikko', 'poppy', PLANT),
  block(DEAD_BUSH, 'dead_bush', 'Kuollut pensas', 'dead_bush', PLANT),
  block(LAVA, 'lava', 'Laava', 'lava', {
    solid: false,
    transparent: true,
    liquid: true,
    light: 15,
    placeable: false,
  }),
  block(OBSIDIAN, 'obsidian', 'Obsidiaani', 'obsidian'),
  block(CRAFTING_TABLE, 'crafting_table', 'Työpöytä', {
    top: 'crafting_table_top',
    side: 'crafting_table_side',
    front: 'crafting_table_front',
    bottom: 'planks',
  }),
  block(FURNACE, 'furnace', 'Uuni', {
    top: 'furnace_top',
    side: 'furnace_side',
    front: 'furnace_front',
    bottom: 'furnace_top',
  }),
  block(CHEST, 'chest', 'Arkku', {
    top: 'chest_top',
    side: 'chest_side',
    front: 'chest_front',
    bottom: 'chest_top',
  }),
  block(ENCHANTING_TABLE, 'enchanting_table', 'Lumouspöytä', {
    top: 'enchanting_top',
    side: 'enchanting_side',
    bottom: 'obsidian',
  }),
  block(BOOKSHELF, 'bookshelf', 'Kirjahylly', {
    top: 'planks',
    side: 'bookshelf',
    bottom: 'planks',
  }),
  block(TORCH, 'torch', 'Soihtu', 'torch', { ...PLANT, light: 14 }),
  block(CLAY, 'clay', 'Savi', 'clay'),
  block(ICE, 'ice', 'Jää', 'ice', { transparent: true }),
  block(IRON_BLOCK, 'iron_block', 'Rautapalikka', 'iron_block'),
  block(EMERALD_BLOCK, 'emerald_block', 'Smaragdipalikka', 'emerald_block'),
  block(LAPIS_BLOCK, 'lapis_block', 'Lasuuripalikka', 'lapis_block'),
  block(REDSTONE_BLOCK, 'redstone_block', 'Punakivipalikka', 'redstone_block', { light: 7 }),
  block(COAL_BLOCK, 'coal_block', 'Hiilipalikka', 'coal_block'),
  block(SUGAR_CANE, 'sugar_cane', 'Sokeriruoko', 'sugar_cane', PLANT),
];

export const BLOCKS: readonly BlockType[] = LIST;
export const BLOCK_COUNT = LIST.length;

export function getBlockType(id: number): BlockType {
  return LIST[id] ?? LIST[AIR]!;
}

export function isValidBlockId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id >= 0 && id < BLOCK_COUNT;
}

export function isSolid(id: number): boolean {
  return getBlockType(id).solid;
}

/** Blocks light and hides the faces behind it. */
export function isOpaque(id: number): boolean {
  const b = getBlockType(id);
  return b.solid && !b.transparent;
}

const BY_KEY = new Map(LIST.map((b) => [b.key, b.id]));

/** Block id from its English key ("planks"), or undefined. */
export function blockIdFromKey(key: string): number | undefined {
  return BY_KEY.get(key.trim().toLowerCase());
}

/** Blocks the player can choose from, in picker order. */
export const PLACEABLE_BLOCKS: readonly number[] = LIST.filter((b) => b.placeable).map((b) => b.id);

/** The starting hotbar (keys 1–9). */
export const DEFAULT_HOTBAR: readonly number[] = [
  GRASS,
  DIRT,
  STONE,
  PLANKS,
  LOG,
  GLASS,
  BRICK,
  TORCH,
  CRAFTING_TABLE,
];
