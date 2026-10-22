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
  'gold',
  'diamond',
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
] as const;
export type TileName = (typeof TILE_NAMES)[number];

export interface BlockType {
  id: number;
  /** English key, used by the magic builder (AI). */
  key: string;
  /** Finnish name shown in the game. */
  name: string;
  /** Players and physics bump into solid blocks. */
  solid: boolean;
  /** You can see through it (glass, leaves, water). */
  transparent: boolean;
  liquid: boolean;
  /** False for bedrock: it can never be broken. */
  breakable: boolean;
  /** Shown in the block picker. */
  placeable: boolean;
  tiles: { top: TileName; side: TileName; bottom: TileName };
}

function block(
  id: number,
  key: string,
  name: string,
  tiles: TileName | { top: TileName; side: TileName; bottom: TileName },
  options: Partial<
    Pick<BlockType, 'solid' | 'transparent' | 'liquid' | 'breakable' | 'placeable'>
  > = {},
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
    tiles: faces,
  };
}

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
export const GOLD = 13;
export const DIAMOND = 14;
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

const LIST: BlockType[] = [
  block(AIR, 'air', 'Ilma', 'stone', { solid: false, transparent: true, placeable: false }),
  block(GRASS, 'grass', 'Ruoho', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }),
  block(DIRT, 'dirt', 'Multa', 'dirt'),
  block(STONE, 'stone', 'Kivi', 'stone'),
  block(SAND, 'sand', 'Hiekka', 'sand'),
  block(WATER, 'water', 'Vesi', 'water', { solid: false, transparent: true, liquid: true }),
  block(LOG, 'log', 'Puunrunko', { top: 'log_top', side: 'log_side', bottom: 'log_top' }),
  block(LEAVES, 'leaves', 'Lehdet', 'leaves', { transparent: true }),
  block(PLANKS, 'planks', 'Lankku', 'planks'),
  block(GLASS, 'glass', 'Lasi', 'glass', { transparent: true }),
  block(COBBLE, 'cobblestone', 'Mukulakivi', 'cobble'),
  block(BRICK, 'brick', 'Tiili', 'brick'),
  block(SNOW, 'snow', 'Lumi', { top: 'snow', side: 'snow_side', bottom: 'dirt' }),
  block(GOLD, 'gold', 'Kulta', 'gold'),
  block(DIAMOND, 'diamond', 'Timantti', 'diamond'),
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
  block(LAMP, 'lamp', 'Lamppu', 'lamp'),
  block(PUMPKIN, 'pumpkin', 'Kurpitsa', {
    top: 'pumpkin_top',
    side: 'pumpkin_side',
    bottom: 'pumpkin_top',
  }),
  block(TNT, 'tnt', 'Dynamiitti', { top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_top' }),
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
  WOOL_RED,
  LAMP,
];
