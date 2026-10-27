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
  'redstone_dust',
  'redstone_dust_on',
  'lever_stick',
  'lever_tip_on',
  'redstone_torch',
  'redstone_torch_off',
  'redstone_lamp',
  'redstone_lamp_on',
  'launcher_front',
  'launcher_side',
  'tnt_lit_side',
  'tnt_lit_top',
  'door_lower',
  'door_upper',
  'door_item',
  'iron_door_lower',
  'iron_door_upper',
  'iron_door_item',
  'trapdoor',
  'ladder',
  'stone_bricks',
  'bed_pillow',
  'bed_blanket',
  'bed_side',
  'smooth_stone',
  'repeater_torch',
  'piston_top',
  'piston_sticky_top',
  'piston_side',
  'piston_back',
  'piston_inner',
  'rail',
  'rail_corner',
  'powered_rail',
  'powered_rail_on',
  'netherrack',
  'soul_sand',
  'quartz_ore',
  'nether_bricks',
  'quartz_block',
  'portal',
] as const;
export type TileName = (typeof TILE_NAMES)[number];

export interface BlockTiles {
  top: TileName;
  side: TileName;
  bottom: TileName;
  /** Used on the north and south sides when set (furnace, crafting table). */
  front?: TileName;
}

/** A piece of track: it joins two sides; a slope climbs towards `up`. */
export interface RailShape {
  exits: readonly [Facing, Facing];
  up?: Facing;
}

/**
 * Rail shapes like Minecraft: straight north–south and east–west, four
 * slopes and four curves (powered rails have only the first six).
 */
export const RAIL_SHAPES: readonly RailShape[] = [
  { exits: [0, 2] },
  { exits: [1, 3] },
  { exits: [0, 2], up: 0 },
  { exits: [1, 3], up: 1 },
  { exits: [0, 2], up: 2 },
  { exits: [1, 3], up: 3 },
  { exits: [0, 1] },
  { exits: [1, 2] },
  { exits: [2, 3] },
  { exits: [3, 0] },
];

/** Sides of a box: +x, -x, +y, -y, +z, -z. */
export type BoxFace = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

/** A small box inside the block (0–1), for levers, doors, stairs and more. */
export interface BlockBox {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  /** Picture for this box; default is the block's side picture. */
  tile?: TileName;
  /** Pictures for single sides (a piston's face, a bed's blanket). */
  faces?: Partial<Record<BoxFace, TileName>>;
}

/**
 * Which way a block faces: 0 = north (-z), 1 = east (+x), 2 = south (+z),
 * 3 = west (-x), and for pistons also 4 = up and 5 = down.
 */
export type Facing = 0 | 1 | 2 | 3;
export type Facing6 = Facing | 4 | 5;

/** Steps (x, y, z) for each facing. */
export const FACING_STEPS: readonly (readonly [number, number, number])[] = [
  [0, 0, -1],
  [1, 0, 0],
  [0, 0, 1],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
];

/** The facing whose step is (x, 0, z), or null for up and down. */
export function facingOfStep(x: number, z: number): Facing | null {
  const i = FACING_STEPS.findIndex(([sx, sy, sz]) => sx === x && sy === 0 && sz === z);
  return i >= 0 && i < 4 ? (i as Facing) : null;
}

const TURN_FACES: Record<BoxFace, BoxFace> = {
  nz: 'px',
  px: 'pz',
  pz: 'nx',
  nx: 'nz',
  py: 'py',
  ny: 'ny',
};
const UP_FACES: Record<BoxFace, BoxFace> = {
  nz: 'py',
  py: 'pz',
  pz: 'ny',
  ny: 'nz',
  px: 'px',
  nx: 'nx',
};
const DOWN_FACES: Record<BoxFace, BoxFace> = {
  nz: 'ny',
  ny: 'pz',
  pz: 'py',
  py: 'nz',
  px: 'px',
  nx: 'nx',
};

function remapFaces(box: BlockBox, map: Record<BoxFace, BoxFace>): BlockBox['faces'] {
  if (!box.faces) return undefined;
  const out: Partial<Record<BoxFace, TileName>> = {};
  for (const [face, tile] of Object.entries(box.faces) as [BoxFace, TileName][]) {
    out[map[face]] = tile;
  }
  return out;
}

/** Turns a box made for facing north to face another way (around the middle). */
export function rotateBox(box: BlockBox, facing: Facing6): BlockBox {
  let [x0, y0, z0] = box.from;
  let [x1, y1, z1] = box.to;
  let b: BlockBox = box;
  if (facing === 4) {
    // North turns to up: (y, z) → (1 - z, y).
    [y0, z0, y1, z1] = [1 - z1, y0, 1 - z0, y1];
    return { ...b, from: [x0, y0, z0], to: [x1, y1, z1], faces: remapFaces(b, UP_FACES) };
  }
  if (facing === 5) {
    // North turns to down: (y, z) → (z, 1 - y).
    [y0, z0, y1, z1] = [z0, 1 - y1, z1, 1 - y0];
    return { ...b, from: [x0, y0, z0], to: [x1, y1, z1], faces: remapFaces(b, DOWN_FACES) };
  }
  for (let i = 0; i < facing; i++) {
    // A quarter turn clockwise seen from above: (x, z) → (1 - z, x).
    [x0, z0, x1, z1] = [1 - z1, x0, 1 - z0, x1];
    b = { ...b, faces: remapFaces(b, TURN_FACES) };
  }
  return { ...b, from: [x0, y0, z0], to: [x1, y1, z1] };
}

function turned(boxes: readonly BlockBox[], facing: Facing6): BlockBox[] {
  return boxes.map((b) => rotateBox(b, facing));
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
  /**
   * 'cross' = drawn as two crossing pictures (flowers, grass, torches),
   * 'dust' = flat on the ground and joins its neighbours (redstone dust),
   * 'boxes' = small boxes (levers, doors, stairs),
   * 'fence' and 'pane' = a post that joins its neighbours.
   */
  shape: 'cube' | 'cross' | 'dust' | 'boxes' | 'fence' | 'pane' | 'rail';
  /** Rails: which two sides the track goes to, and which way it climbs (slopes). */
  rail?: RailShape;
  boxes?: readonly BlockBox[];
  /** Bumping boxes when they differ from the drawn ones (fences are taller). */
  collision?: readonly BlockBox[];
  /** A cross picture that leans on a wall (wall torches). */
  lean?: Facing;
  /** Which way it faces (wall torches, doors, stairs, repeaters, pistons). */
  facing?: Facing6;
  /**
   * The block it hangs on, as a step from itself: a torch on the floor has
   * [0, -1, 0]. When that block breaks, this one falls off.
   */
  support: readonly [number, number, number] | null;
  /** The other half of a door or bed (both break together). */
  partner: readonly [number, number, number] | null;
  /** The block it turns into when you right-click it (doors, trapdoors, gates). */
  toggle: number | null;
  /** How it looks with redstone power (an open door). */
  powered: number | null;
  /** You can climb it (ladders). */
  climbable: boolean;
  /** The item you get back and pick with the middle button (a door's lower half). */
  item: number;
  /** Breaking this one gives nothing (the other half of a door or bed gives the item). */
  noDrop: boolean;
  /** Flat picture for the inventory (doors and ladders). */
  icon?: TileName;
  /** Drawn half see-through, like water (Nether portals). */
  translucent: boolean;
  /** Must stand on a solid block (dust, levers, buttons, torches). */
  needsFloor: boolean;
  /**
   * Only shown by the redstone circuit (a lit lamp, powered dust). Never stored
   * in the world or sent over the network.
   */
  shownOnly: boolean;
  /** Light the block gives (0–15): torches, lamps, lava. */
  light: number;
  tiles: BlockTiles;
}

type BlockOptions = Partial<
  Pick<
    BlockType,
    | 'solid'
    | 'transparent'
    | 'liquid'
    | 'breakable'
    | 'placeable'
    | 'shape'
    | 'light'
    | 'boxes'
    | 'needsFloor'
    | 'shownOnly'
    | 'collision'
    | 'lean'
    | 'facing'
    | 'support'
    | 'partner'
    | 'toggle'
    | 'powered'
    | 'climbable'
    | 'item'
    | 'noDrop'
    | 'icon'
    | 'rail'
    | 'translucent'
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
    boxes: options.boxes,
    needsFloor: options.needsFloor ?? false,
    shownOnly: options.shownOnly ?? false,
    collision: options.collision,
    lean: options.lean,
    facing: options.facing,
    support: options.support ?? (options.needsFloor ? FLOOR : null),
    partner: options.partner ?? null,
    toggle: options.toggle ?? null,
    powered: options.powered ?? null,
    climbable: options.climbable ?? false,
    item: options.item ?? id,
    noDrop: options.noDrop ?? false,
    icon: options.icon,
    rail: options.rail,
    translucent: options.translucent ?? false,
    tiles: faces,
  };
}

const FLOOR = [0, -1, 0] as const;

/** Flowers, grass and torches: no collision, see-through, drawn as a cross. */
const PLANT: BlockOptions = { solid: false, transparent: true, shape: 'cross' };
/** Redstone things that stand on the floor. */
const GADGET: BlockOptions = { solid: false, transparent: true, needsFloor: true };
/** A circuit look that is never stored (lit lamp, powered dust, unlit torch). */
const SHOWN: BlockOptions = { placeable: false, shownOnly: true };

const LEVER_BASE: BlockBox = { from: [0.31, 0, 0.25], to: [0.69, 0.19, 0.75], tile: 'cobble' };
const lever = (on: boolean): BlockBox[] => {
  // The stick leans towards north (off) or south (on).
  const z = on ? [0.56, 0.68] : [0.32, 0.44];
  return [
    LEVER_BASE,
    { from: [0.44, 0.19, 0.44], to: [0.56, 0.4, 0.56], tile: 'lever_stick' },
    { from: [0.44, 0.4, z[0]!], to: [0.56, 0.62, z[1]!], tile: 'lever_stick' },
    {
      from: [0.42, 0.62, z[0]! - 0.02],
      to: [0.58, 0.72, z[1]! + 0.02],
      tile: on ? 'lever_tip_on' : 'lever_stick',
    },
  ];
};
const button = (pressed: boolean): BlockBox[] => [
  { from: [0.31, 0, 0.37], to: [0.69, pressed ? 0.06 : 0.13, 0.63], tile: 'stone' },
];

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
export const REDSTONE_WIRE = 62;
export const REDSTONE_WIRE_ON = 63;
export const LEVER = 64;
export const LEVER_ON = 65;
export const BUTTON = 66;
export const BUTTON_ON = 67;
export const REDSTONE_TORCH = 68;
export const REDSTONE_TORCH_OFF = 69;
export const REDSTONE_LAMP = 70;
export const REDSTONE_LAMP_ON = 71;
export const FIREWORK_LAUNCHER = 72;
export const TNT_LIT = 73;
/** Torch on a wall: WALL_TORCH + facing (away from the wall). */
export const WALL_TORCH = 74;
export const WALL_LEVER = 78;
export const WALL_LEVER_ON = 82;
export const WALL_BUTTON = 86;
export const WALL_BUTTON_ON = 90;
/** Doors: base + 8 for the upper half + 4 when open + facing. */
export const OAK_DOOR = 94;
export const IRON_DOOR = 110;
/** Trapdoor: base + 4 when open + facing. */
export const TRAPDOOR = 126;
/** Fence gate: base + 2 when open + 0 (runs along x) or 1 (along z). */
export const FENCE_GATE = 134;
export const FENCE = 138;
export const LADDER = 139;
export const STONE_BRICKS = 143;
export const OAK_STAIRS = 144;
export const COBBLE_STAIRS = 148;
export const STONE_BRICK_STAIRS = 152;
export const OAK_SLAB = 156;
export const COBBLE_SLAB = 157;
export const STONE_BRICK_SLAB = 158;
export const GLASS_PANE = 159;
/** Bed: base + 4 for the head + facing (from the foot to the head). */
export const BED = 160;
export const STONE_PLATE = 168;
export const STONE_PLATE_ON = 169;
export const OAK_PLATE = 170;
export const OAK_PLATE_ON = 171;
/** Repeater: base + facing (the way the signal goes). */
export const REPEATER = 172;
export const REPEATER_ON = 176;
/** Pistons: base + facing (0–3, 4 = up, 5 = down). */
export const PISTON = 180;
export const STICKY_PISTON = 186;
/** Looks of a pushed-out piston (never stored). */
export const PISTON_BASE_ON = 192;
export const PISTON_HEAD = 198;
export const STICKY_HEAD = 204;
/** Rails: base + shape (RAIL_SHAPES). Powered rails have shapes 0–5 and a lit look. */
export const RAIL = 210;
export const POWERED_RAIL = 220;
export const POWERED_RAIL_ON = 226;
export const NETHERRACK = 232;
export const SOUL_SAND = 233;
export const QUARTZ_ORE = 234;
export const NETHER_BRICKS = 235;
export const QUARTZ_BLOCK = 236;
/** Nether portal: + 0 = a portal along x (thin in z), + 1 = along z. */
export const NETHER_PORTAL = 237;

const SIDE_NAMES = ['north', 'east', 'south', 'west', 'up', 'down'] as const;
const FACINGS: readonly Facing[] = [0, 1, 2, 3];
const FACINGS6: readonly Facing6[] = [0, 1, 2, 3, 4, 5];
const step = (f: Facing6) => FACING_STEPS[f]!;
const back = (f: Facing6) => step(f).map((v) => (v === 0 ? 0 : -v)) as [number, number, number];

// --- Doors, building blocks and redstone machines ---------------------------
// Boxes are made for facing north and turned for the other ways.

const wallLever = (on: boolean): BlockBox[] => [
  { from: [0.31, 0.25, 0.81], to: [0.69, 0.75, 1], tile: 'cobble' },
  on
    ? { from: [0.44, 0.3, 0.62], to: [0.56, 0.56, 0.81], tile: 'lever_stick' }
    : { from: [0.44, 0.44, 0.62], to: [0.56, 0.7, 0.81], tile: 'lever_stick' },
  on
    ? { from: [0.42, 0.22, 0.58], to: [0.58, 0.34, 0.7], tile: 'lever_tip_on' }
    : { from: [0.42, 0.66, 0.58], to: [0.58, 0.78, 0.7], tile: 'lever_stick' },
];
const wallButton = (pressed: boolean): BlockBox[] => [
  { from: [0.31, 0.37, pressed ? 0.94 : 0.875], to: [0.69, 0.63, 1], tile: 'stone' },
];
const THIN = 3 / 16;
/** A closed door is on the side nearest to you; it opens along the left wall. */
const doorPanel = (open: boolean, tile: TileName): BlockBox =>
  open
    ? { from: [0, 0, 0], to: [THIN, 1, 1], tile }
    : { from: [0, 0, 1 - THIN], to: [1, 1, 1], tile };
const trapdoorPanel = (open: boolean): BlockBox =>
  open
    ? { from: [0, 0, 1 - THIN], to: [1, 1, 1], tile: 'trapdoor' }
    : { from: [0, 0, 0], to: [1, THIN, 1], tile: 'trapdoor' };
const GATE_POSTS: BlockBox[] = [
  { from: [0, 0.3125, 0.4375], to: [0.125, 1, 0.5625] },
  { from: [0.875, 0.3125, 0.4375], to: [1, 1, 0.5625] },
];
const gateBoxes = (open: boolean): BlockBox[] =>
  open
    ? [
        ...GATE_POSTS,
        { from: [0, 0.375, 0.5625], to: [0.125, 0.9375, 0.9375] },
        { from: [0.875, 0.375, 0.5625], to: [1, 0.9375, 0.9375] },
      ]
    : [
        ...GATE_POSTS,
        { from: [0.125, 0.375, 0.4375], to: [0.875, 0.5625, 0.5625] },
        { from: [0.125, 0.75, 0.4375], to: [0.875, 0.9375, 0.5625] },
        { from: [0.4375, 0.5625, 0.4375], to: [0.5625, 0.75, 0.5625] },
      ];
/** Fences and gates are 1.5 blocks tall for bumping, so nobody jumps over. */
const GATE_COLLISION: BlockBox[] = [{ from: [0, 0, 0.375], to: [1, 1.5, 0.625] }];
const stairBoxes = (tile: TileName): BlockBox[] => [
  { from: [0, 0, 0], to: [1, 0.5, 1], tile },
  { from: [0, 0.5, 0], to: [1, 1, 0.5], tile },
];
const SLAB = (tile: TileName): BlockBox[] => [{ from: [0, 0, 0], to: [1, 0.5, 1], tile }];
const bedBoxes = (head: boolean): BlockBox[] => {
  const z = head ? [0, 0.1875] : [0.8125, 1];
  return [
    {
      from: [0, 0.1875, 0],
      to: [1, 0.5625, 1],
      tile: 'bed_side',
      faces: { py: head ? 'bed_pillow' : 'bed_blanket', ny: 'planks' },
    },
    { from: [0, 0, z[0]!], to: [0.1875, 0.1875, z[1]!], tile: 'planks' },
    { from: [0.8125, 0, z[0]!], to: [1, 0.1875, z[1]!], tile: 'planks' },
  ];
};
const plate = (pressed: boolean, tile: TileName): BlockBox[] => [
  { from: [0.0625, 0, 0.0625], to: [0.9375, pressed ? 0.03 : 0.0625, 0.9375], tile },
];
const repeaterBoxes = (on: boolean): BlockBox[] => {
  const torch: TileName = on ? 'lever_tip_on' : 'repeater_torch';
  return [
    { from: [0, 0, 0], to: [1, 0.125, 1], tile: 'smooth_stone' },
    { from: [0.4375, 0.125, 0.1875], to: [0.5625, 0.4375, 0.3125], tile: torch },
    { from: [0.4375, 0.125, 0.5625], to: [0.5625, 0.375, 0.6875], tile: torch },
    { from: [0.47, 0.125, 0.3125], to: [0.53, 0.14, 0.5625], tile: torch },
  ];
};
const pistonBoxes = (sticky: boolean): BlockBox[] => [
  {
    from: [0, 0, 0],
    to: [1, 1, 1],
    tile: 'piston_side',
    faces: { nz: sticky ? 'piston_sticky_top' : 'piston_top', pz: 'piston_back' },
  },
];
const PISTON_BASE_BOXES: BlockBox[] = [
  {
    from: [0, 0, 0.25],
    to: [1, 1, 1],
    tile: 'piston_side',
    faces: { nz: 'piston_inner', pz: 'piston_back' },
  },
];
const pistonHeadBoxes = (sticky: boolean): BlockBox[] => [
  {
    from: [0, 0, 0],
    to: [1, 1, 0.25],
    tile: 'planks',
    faces: { nz: sticky ? 'piston_sticky_top' : 'piston_top' },
  },
  { from: [0.375, 0.375, 0.25], to: [0.625, 0.625, 1], tile: 'planks' },
];

/** Solid, see-through little boxes (doors, stairs, beds). */
const PARTS: BlockOptions = { transparent: true, shape: 'boxes' };

function moreBlocks(): BlockType[] {
  const out: BlockType[] = [];
  const name = (base: string, f: Facing6, isBase: boolean) =>
    isBase ? base : `${base}_${SIDE_NAMES[f]}`;

  for (const f of FACINGS) {
    out.push(
      block(WALL_TORCH + f, `wall_torch_${SIDE_NAMES[f]}`, 'Soihtu', 'torch', {
        ...PLANT,
        light: 14,
        lean: f,
        facing: f,
        support: back(f),
        placeable: false,
        item: TORCH,
      }),
    );
  }
  for (const on of [false, true]) {
    for (const f of FACINGS) {
      out.push(
        block(
          (on ? WALL_LEVER_ON : WALL_LEVER) + f,
          `wall_lever_${on ? 'on_' : ''}${SIDE_NAMES[f]}`,
          'Vipu',
          'lever_stick',
          {
            solid: false,
            transparent: true,
            shape: 'boxes',
            boxes: turned(wallLever(on), f),
            facing: f,
            support: back(f),
            placeable: false,
            item: LEVER,
          },
        ),
      );
    }
  }
  for (const on of [false, true]) {
    for (const f of FACINGS) {
      out.push(
        block(
          (on ? WALL_BUTTON_ON : WALL_BUTTON) + f,
          `wall_button_${on ? 'on_' : ''}${SIDE_NAMES[f]}`,
          'Nappi',
          'stone',
          {
            solid: false,
            transparent: true,
            shape: 'boxes',
            boxes: turned(wallButton(on), f),
            facing: f,
            support: back(f),
            placeable: false,
            item: BUTTON,
          },
        ),
      );
    }
  }
  const doors = [
    { base: OAK_DOOR, key: 'oak_door', name: 'Puuovi', tile: 'door', byHand: true },
    { base: IRON_DOOR, key: 'iron_door', name: 'Rautaovi', tile: 'iron_door', byHand: false },
  ] as const;
  for (const d of doors) {
    for (const upper of [false, true]) {
      for (const open of [false, true]) {
        for (const f of FACINGS) {
          const id = d.base + (upper ? 8 : 0) + (open ? 4 : 0) + f;
          const isBase = !upper && !open && f === 0;
          const tile: TileName = `${d.tile}_${upper ? 'upper' : 'lower'}`;
          const other = open ? id - 4 : id + 4;
          out.push(
            block(
              id,
              isBase
                ? d.key
                : `${d.key}_${upper ? 'upper' : 'lower'}_${open ? 'open' : 'closed'}_${SIDE_NAMES[f]}`,
              d.name,
              tile,
              {
                ...PARTS,
                boxes: turned([doorPanel(open, tile)], f),
                facing: f,
                support: FLOOR,
                partner: upper ? [0, -1, 0] : [0, 1, 0],
                toggle: d.byHand ? other : null,
                powered: open ? null : other,
                placeable: isBase,
                item: d.base,
                noDrop: upper,
                icon: `${d.tile}_item`,
              },
            ),
          );
        }
      }
    }
  }
  for (const open of [false, true]) {
    for (const f of FACINGS) {
      const id = TRAPDOOR + (open ? 4 : 0) + f;
      const isBase = !open && f === 0;
      out.push(
        block(
          id,
          isBase ? 'trapdoor' : `trapdoor_${open ? 'open' : 'closed'}_${SIDE_NAMES[f]}`,
          'Luukku',
          'trapdoor',
          {
            ...PARTS,
            boxes: turned([trapdoorPanel(open)], f),
            facing: f,
            toggle: open ? id - 4 : id + 4,
            powered: open ? null : id + 4,
            placeable: isBase,
            item: TRAPDOOR,
          },
        ),
      );
    }
  }
  for (const open of [false, true]) {
    for (const axis of [0, 1] as const) {
      const id = FENCE_GATE + (open ? 2 : 0) + axis;
      const isBase = !open && axis === 0;
      out.push(
        block(
          id,
          isBase ? 'fence_gate' : `fence_gate_${open ? 'open' : 'closed'}_${axis ? 'z' : 'x'}`,
          'Aidan portti',
          'planks',
          {
            ...PARTS,
            solid: !open,
            boxes: turned(gateBoxes(open), axis),
            collision: open ? [] : turned(GATE_COLLISION, axis),
            facing: axis,
            toggle: open ? id - 2 : id + 2,
            powered: open ? null : id + 2,
            placeable: isBase,
            item: FENCE_GATE,
          },
        ),
      );
    }
  }
  out.push(block(FENCE, 'fence', 'Aita', 'planks', { transparent: true, shape: 'fence' }));
  for (const f of FACINGS) {
    out.push(
      block(LADDER + f, name('ladder', f, f === 0), 'Tikkaat', 'ladder', {
        ...PARTS,
        boxes: turned([{ from: [0, 0, 0.875], to: [1, 1, 1] }], f),
        facing: f,
        support: back(f),
        climbable: true,
        placeable: f === 0,
        item: LADDER,
        icon: 'ladder',
      }),
    );
  }
  out.push(block(STONE_BRICKS, 'stone_bricks', 'Kivitiilet', 'stone_bricks'));
  const stairs = [
    { base: OAK_STAIRS, key: 'oak_stairs', name: 'Puuportaat', tile: 'planks' },
    { base: COBBLE_STAIRS, key: 'cobblestone_stairs', name: 'Mukulakiviportaat', tile: 'cobble' },
    {
      base: STONE_BRICK_STAIRS,
      key: 'stone_brick_stairs',
      name: 'Kivitiiliportaat',
      tile: 'stone_bricks',
    },
  ] as const;
  for (const st of stairs) {
    for (const f of FACINGS) {
      out.push(
        block(st.base + f, name(st.key, f, f === 0), st.name, st.tile, {
          ...PARTS,
          boxes: turned(stairBoxes(st.tile), f),
          facing: f,
          placeable: f === 0,
          item: st.base,
        }),
      );
    }
  }
  out.push(
    block(OAK_SLAB, 'oak_slab', 'Puulaatta', 'planks', { ...PARTS, boxes: SLAB('planks') }),
    block(COBBLE_SLAB, 'cobblestone_slab', 'Mukulakivilaatta', 'cobble', {
      ...PARTS,
      boxes: SLAB('cobble'),
    }),
    block(STONE_BRICK_SLAB, 'stone_brick_slab', 'Kivitiililaatta', 'stone_bricks', {
      ...PARTS,
      boxes: SLAB('stone_bricks'),
    }),
    block(GLASS_PANE, 'glass_pane', 'Lasiruutu', 'glass', { transparent: true, shape: 'pane' }),
  );
  for (const head of [false, true]) {
    for (const f of FACINGS) {
      const isBase = !head && f === 0;
      out.push(
        block(
          BED + (head ? 4 : 0) + f,
          isBase ? 'bed' : `bed_${head ? 'head' : 'foot'}_${SIDE_NAMES[f]}`,
          'Sänky',
          'bed_side',
          {
            ...PARTS,
            boxes: turned(bedBoxes(head), f),
            facing: f,
            support: FLOOR,
            partner: head ? back(f) : step(f),
            placeable: isBase,
            item: BED,
            noDrop: head,
          },
        ),
      );
    }
  }
  const plates = [
    { base: STONE_PLATE, key: 'stone_pressure_plate', name: 'Kivinen painelaatta', tile: 'stone' },
    { base: OAK_PLATE, key: 'oak_pressure_plate', name: 'Puinen painelaatta', tile: 'planks' },
  ] as const;
  for (const pl of plates) {
    out.push(
      block(pl.base, pl.key, pl.name, pl.tile, {
        ...GADGET,
        shape: 'boxes',
        boxes: plate(false, pl.tile),
      }),
      block(pl.base + 1, `${pl.key}_on`, pl.name, pl.tile, {
        ...GADGET,
        ...SHOWN,
        shape: 'boxes',
        boxes: plate(true, pl.tile),
        item: pl.base,
      }),
    );
  }
  for (const on of [false, true]) {
    for (const f of FACINGS) {
      out.push(
        block(
          (on ? REPEATER_ON : REPEATER) + f,
          on ? `repeater_on_${SIDE_NAMES[f]}` : name('repeater', f, f === 0),
          'Toistin',
          'smooth_stone',
          {
            ...GADGET,
            ...(on ? SHOWN : { placeable: f === 0 }),
            shape: 'boxes',
            boxes: turned(repeaterBoxes(on), f),
            facing: f,
            item: REPEATER,
          },
        ),
      );
    }
  }
  for (const sticky of [false, true]) {
    const base = sticky ? STICKY_PISTON : PISTON;
    for (const f of FACINGS6) {
      out.push(
        block(
          base + f,
          name(sticky ? 'sticky_piston' : 'piston', f, f === 0),
          sticky ? 'Tahmea mäntä' : 'Mäntä',
          'piston_side',
          {
            shape: 'boxes',
            boxes: turned(pistonBoxes(sticky), f),
            facing: f,
            placeable: f === 0,
            item: base,
          },
        ),
      );
    }
  }
  for (const f of FACINGS6) {
    out.push(
      block(PISTON_BASE_ON + f, `piston_base_on_${SIDE_NAMES[f]}`, 'Mäntä', 'piston_side', {
        ...PARTS,
        ...SHOWN,
        boxes: turned(PISTON_BASE_BOXES, f),
        facing: f,
        item: PISTON,
      }),
    );
  }
  for (const sticky of [false, true]) {
    for (const f of FACINGS6) {
      out.push(
        block(
          (sticky ? STICKY_HEAD : PISTON_HEAD) + f,
          `${sticky ? 'sticky_' : ''}piston_head_${SIDE_NAMES[f]}`,
          'Männän pää',
          'planks',
          {
            ...PARTS,
            ...SHOWN,
            boxes: turned(pistonHeadBoxes(sticky), f),
            facing: f,
            item: sticky ? STICKY_PISTON : PISTON,
          },
        ),
      );
    }
  }
  const RAIL_NAMES = ['ns', 'ew', 'up_n', 'up_e', 'up_s', 'up_w', 'ne', 'es', 'sw', 'wn'];
  RAIL_SHAPES.forEach((shape, i) => {
    out.push(
      block(
        RAIL + i,
        i === 0 ? 'rail' : `rail_${RAIL_NAMES[i]}`,
        'Raide',
        i < 6 ? 'rail' : 'rail_corner',
        {
          ...GADGET,
          shape: 'rail',
          rail: shape,
          placeable: i === 0,
          item: RAIL,
          icon: 'rail',
        },
      ),
    );
  });
  for (const on of [false, true]) {
    for (let i = 0; i < 6; i++) {
      const id = (on ? POWERED_RAIL_ON : POWERED_RAIL) + i;
      out.push(
        block(
          id,
          on
            ? `powered_rail_on_${RAIL_NAMES[i]}`
            : i === 0
              ? 'powered_rail'
              : `powered_rail_${RAIL_NAMES[i]}`,
          'Sähköraide',
          on ? 'powered_rail_on' : 'powered_rail',
          {
            ...GADGET,
            ...(on ? SHOWN : { placeable: i === 0 }),
            shape: 'rail',
            rail: RAIL_SHAPES[i],
            item: POWERED_RAIL,
            icon: 'powered_rail',
          },
        ),
      );
    }
  }
  out.push(
    block(NETHERRACK, 'netherrack', 'Hornakivi', 'netherrack'),
    block(SOUL_SAND, 'soul_sand', 'Sielunhiekka', 'soul_sand'),
    block(QUARTZ_ORE, 'quartz_ore', 'Kvartsimalmi', 'quartz_ore'),
    block(NETHER_BRICKS, 'nether_bricks', 'Hornatiilet', 'nether_bricks'),
    block(QUARTZ_BLOCK, 'quartz_block', 'Kvartsipalikka', 'quartz_block'),
  );
  for (const axis of [0, 1] as const) {
    out.push(
      block(
        NETHER_PORTAL + axis,
        axis ? 'nether_portal_z' : 'nether_portal',
        'Portaali',
        'portal',
        {
          solid: false,
          transparent: true,
          translucent: true,
          shape: 'boxes',
          boxes: turned([{ from: [0, 0, 0.375], to: [1, 1, 0.625] }], axis),
          light: 11,
          placeable: false,
          item: NETHER_PORTAL,
        },
      ),
    );
  }
  return out;
}

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
  // Placed with the redstone dust item, so it is not in the block picker.
  block(REDSTONE_WIRE, 'redstone_wire', 'Punakivipöly', 'redstone_dust', {
    ...GADGET,
    shape: 'dust',
    placeable: false,
  }),
  block(REDSTONE_WIRE_ON, 'redstone_wire_on', 'Punakivipöly', 'redstone_dust_on', {
    ...GADGET,
    ...SHOWN,
    shape: 'dust',
  }),
  block(LEVER, 'lever', 'Vipu', 'lever_stick', { ...GADGET, shape: 'boxes', boxes: lever(false) }),
  block(LEVER_ON, 'lever_on', 'Vipu', 'lever_stick', {
    ...GADGET,
    item: LEVER,
    shape: 'boxes',
    boxes: lever(true),
    placeable: false,
  }),
  block(BUTTON, 'button', 'Nappi', 'stone', { ...GADGET, shape: 'boxes', boxes: button(false) }),
  block(BUTTON_ON, 'button_on', 'Nappi', 'stone', {
    ...GADGET,
    item: BUTTON,
    shape: 'boxes',
    boxes: button(true),
    placeable: false,
  }),
  block(REDSTONE_TORCH, 'redstone_torch', 'Punakivisoihtu', 'redstone_torch', {
    ...PLANT,
    needsFloor: true,
    light: 7,
  }),
  block(REDSTONE_TORCH_OFF, 'redstone_torch_off', 'Punakivisoihtu', 'redstone_torch_off', {
    ...PLANT,
    ...SHOWN,
  }),
  block(REDSTONE_LAMP, 'redstone_lamp', 'Punakivilamppu', 'redstone_lamp'),
  block(REDSTONE_LAMP_ON, 'redstone_lamp_on', 'Punakivilamppu', 'redstone_lamp_on', {
    ...SHOWN,
    light: 15,
  }),
  block(FIREWORK_LAUNCHER, 'firework_launcher', 'Rakettilaukaisin', {
    top: 'launcher_front',
    side: 'launcher_side',
    bottom: 'furnace_top',
  }),
  // Lit TNT is stored, so everyone sees it burning and it explodes for all.
  block(
    TNT_LIT,
    'tnt_lit',
    'Palava dynamiitti',
    {
      top: 'tnt_lit_top',
      side: 'tnt_lit_side',
      bottom: 'tnt_lit_top',
    },
    { placeable: false },
  ),
  ...moreBlocks(),
];

LIST.forEach((b, i) => {
  if (b.id !== i) throw new Error(`Block ${b.key} has id ${b.id} but is at ${i}`);
});

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

/**
 * The same block turned `turns` quarter turns clockwise (for builds that are
 * turned to face you): a door facing north faces east after one turn.
 */
export function turnBlock(id: number, turns: number): number {
  const b = getBlockType(id);
  const f = b.facing;
  if (f === undefined || f > 3 || turns % 4 === 0) return id;
  const sides = b.item === FENCE_GATE ? 2 : 4;
  return id - f + ((f + turns) % sides);
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
