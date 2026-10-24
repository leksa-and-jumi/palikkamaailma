// All game constants live here. This file is pure (no DOM), so the room
// server (worker/) and Convex can import it too.

// --- World size -----------------------------------------------------------
/** Blocks per chunk side (x and z). */
export const CHUNK_SIZE = 16;
/** The world goes on (almost) forever: up to this many blocks from the middle. */
export const WORLD_LIMIT = 30_000;
/** Blocks from the bottom (y = 0) to the sky limit. */
export const WORLD_HEIGHT = 96;
export const SEA_LEVEL = 40;

// --- Terrain --------------------------------------------------------------
export const TERRAIN = {
  /** Land rises this much above the sea on average. */
  landHeight: 4,
  continentScale: 1 / 320,
  continentAmplitude: 16,
  hillScale: 1 / 56,
  hillAmplitude: 7,
  mountainScale: 1 / 260,
  mountainAmplitude: 40,
  temperatureScale: 1 / 520,
  humidityScale: 1 / 460,
  dirtDepth: 3,
  /** Mountain tops above this get snow. */
  snowLine: SEA_LEVEL + 34,
  /** Tunnels: smaller = thinner caves. */
  caveSize: 0.014,
  caveScale: 1 / 28,
  cavernScale: 1 / 52,
  cavernThreshold: 0.6,
  cavernMaxY: 34,
  /** Air in caves below this height is lava. */
  lavaLevel: 8,
  /** How far trees can reach into the next chunk. */
  treeRadius: 3,
} as const;

/** Ores: how deep they are found and how common (chance per 2×2×2 clump). */
export const ORES = [
  { key: 'coal_ore', maxY: 90, chance: 0.012 },
  { key: 'iron_ore', maxY: 56, chance: 0.008 },
  { key: 'lapis_ore', maxY: 30, chance: 0.0035 },
  { key: 'gold_ore', maxY: 30, chance: 0.003 },
  { key: 'redstone_ore', maxY: 16, chance: 0.006 },
  { key: 'diamond_ore', maxY: 15, chance: 0.0025 },
] as const;

// --- Light ----------------------------------------------------------------
export const LIGHT = {
  max: 15,
  /** Light drops this much per block (bigger = shorter torch light). */
  falloff: 2,
  /** Darkest a block can look (0 = black). */
  minBrightness: 0.07,
} as const;

// --- Player ---------------------------------------------------------------
export const PLAYER = {
  width: 0.6,
  height: 1.75,
  eyeHeight: 1.6,
  walkSpeed: 4.6,
  sprintSpeed: 7,
  flySpeed: 11,
  jumpSpeed: 8.4,
  gravity: 26,
  maxFallSpeed: 40,
  swimGravity: 6,
  swimUpSpeed: 3.5,
  maxSwimFallSpeed: 3,
  /** How far away (blocks) you can break and place. */
  reach: 6,
  /** Two space presses within this time (s) toggles flying. */
  doubleTapTime: 0.3,
  mouseSensitivity: 0.0022,
} as const;

// --- Day and night --------------------------------------------------------
export const DAY = {
  /** Seconds in one whole day (Minecraft: 20 minutes). */
  length: 1200,
  /** How much sunlight is left at night (moonlight). */
  nightSky: 0.27,
  dayColor: 0x8ecbff,
  nightColor: 0x0b1026,
  sunsetColor: 0xf6a35e,
} as const;

// --- Computer characters -------------------------------------------------
export const MOBS = {
  /** Animals around each player (the one who spawned them simulates them). */
  maxAnimals: 10,
  /** Animals appear this far away, so you don't see them pop up. */
  spawnMin: 20,
  spawnMax: 44,
  /** Creatures further than this from their owner disappear. */
  despawnDistance: 96,
  spawnInterval: 3,
  fleeSeconds: 5,
  followDistance: 8,
  followStop: 2,
  noticeDistance: 10,
  wanderDistance: 8,
  growSeconds: 300,
  loveSeconds: 30,
  breedDistance: 3,
  /** Chickens lay an egg every so often. */
  eggSeconds: 300,
  /** Hand damage and how often you can hit. */
  fistDamage: 1,
  attackCooldown: 0.45,
  attackReach: 3.5,
  knockback: 6,
  /** Others' creatures are sent with your position, at most this many. */
  maxSync: 30,
  /** Creatures only sent if another player is this close to them. */
  syncDistance: 80,
  /** A creature not heard about for this long is gone (seconds). */
  remoteTimeout: 3,
} as const;

// --- Game modes and survival ---------------------------------------------
/** Nikkaroija (creative) or selviytyjä (survival). */
export type GameMode = 'creative' | 'survival';
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';

export const GAME_MODES: Record<GameMode, { emoji: string; name: string }> = {
  creative: { emoji: '🛠️', name: 'Nikkaroija' },
  survival: { emoji: '⚔️', name: 'Selviytyjä' },
};

export const DIFFICULTIES: Record<
  Difficulty,
  {
    emoji: string;
    name: string;
    /** Does hunger go down? */
    hunger: boolean;
    /** Starving stops hurting at this health. */
    starveDownTo: number;
    /** Monster damage multiplier (0 = no monsters). */
    monsterDamage: number;
  }
> = {
  peaceful: { emoji: '😊', name: 'Rauhallinen', hunger: false, starveDownTo: 20, monsterDamage: 0 },
  easy: { emoji: '🙂', name: 'Helppo', hunger: true, starveDownTo: 10, monsterDamage: 0.5 },
  normal: { emoji: '😐', name: 'Normaali', hunger: true, starveDownTo: 1, monsterDamage: 1 },
  hard: { emoji: '😈', name: 'Vaikea', hunger: true, starveDownTo: 0, monsterDamage: 1.5 },
};

export const SURVIVAL = {
  maxHealth: 20,
  maxHunger: 20,
  startSaturation: 5,
  /** Seconds of breath under water. */
  maxAir: 15,
  airRefillSpeed: 5,
  drownDamage: 2,
  lavaDamage: 4,
  lavaInterval: 0.5,
  /** Blocks you can fall without getting hurt. */
  safeFall: 3,
  regenHunger: 18,
  regenInterval: 4,
  peacefulRegenInterval: 1,
  starveInterval: 4,
  exhaustionPerPoint: 4,
  exhaustion: { sprintPerBlock: 0.1, jump: 0.05, mine: 0.005, attack: 0.1, hurt: 0.1, regen: 6 },
  /** Kids keep their things when they die (Minecraft's keepInventory). */
  keepInventory: true,
  /** Hand reach is the same in both modes; creative breaks instantly. */
  creativeBreakDelay: 0.2,
} as const;

/** Chests and furnaces. */
export const CONTAINERS = {
  chestSize: 27,
  /** Seconds to smelt one item (Minecraft: 10). */
  cookSeconds: 10,
  /** A furnace catches up at most this much time when opened again. */
  maxCatchUpSeconds: 3600,
} as const;

/** Items lying on the ground. */
export const DROPS = {
  pickupDistance: 1.6,
  /** Seconds before a dropped item can be picked up. */
  pickupDelay: 0.6,
  /** Items disappear after this many seconds. */
  lifetime: 300,
  maxPerRoom: 400,
  gravity: 18,
} as const;

// --- Redstone, TNT and fireworks ------------------------------------------
export const REDSTONE = {
  /** Power from a lever; dust gets one weaker per block. */
  maxPower: 15,
  /** Seconds per redstone tick (Minecraft: 0.1). */
  tickSeconds: 0.1,
  /** A button stays pressed this many seconds. */
  buttonSeconds: 1,
  /** A torch that turns on and off this often within the window burns out. */
  burnoutFlips: 8,
  burnoutWindow: 30,
  burnoutTicks: 60,
} as const;

export const TNT_RULES = {
  /** Seconds from lighting to the bang (Minecraft: 4). */
  fuse: 4,
  /** TNT lit by another explosion goes off sooner. */
  chainFuseMin: 0.5,
  chainFuseMax: 1.5,
  /** Explosion strength (Minecraft TNT: 4). */
  power: 4,
  /** How hard the blast throws you up (blocks/s at the middle). */
  knockback: 14,
  /** The screen shakes this much (blocks) when it goes off right next to you. */
  shake: 0.25,
} as const;

export const FIREWORKS = {
  /** Seconds a rocket flies before it bursts. */
  flightMin: 1.1,
  flightMax: 1.6,
  speed: 14,
  /** Seconds between two rockets from your hand. */
  cooldown: 0.35,
  sparkLifetime: 1.6,
  maxSparks: 6000,
  /** Rockets from one player in NET.chatWindowMs (the room server checks). */
  rateLimit: 20,
} as const;

// --- Rendering ------------------------------------------------------------
export const RENDER = {
  /** Chunks drawn around the player. */
  viewDistance: 6,
  /** Milliseconds per frame spent building chunk meshes, so the game stays smooth. */
  meshBudgetMs: 8,
  /** Chunks kept in memory around the player (generated blocks). */
  keepDistance: 10,
  fov: 72,
  skyColor: 0x8ecbff,
  waterColor: 0x3a7bd5,
  underwaterColor: 0x1d4f91,
  fogNear: 50,
  fogFar: 96,
  /** Pixels per texture tile. */
  tilePixels: 16,
  /** Tiles per row in the texture atlas. */
  atlasColumns: 16,
} as const;

// --- Multiplayer ----------------------------------------------------------
export const NET = {
  /**
   * How often your position is sent to the others (per second). Every message
   * counts towards the Cloudflare quota; the others' figures are predicted in
   * between, so 5 still looks smooth.
   */
  moveSendRate: 5,
  /** Your creatures are sent this often (per second) when you stand still near friends. */
  mobSendRate: 2.5,
  /** Small moves (blocks / radians) are not sent at all. */
  moveDeadZone: 0.05,
  turnDeadZone: 0.03,
  /** Send at least this often (s) while moving a little, so nobody drifts. */
  moveKeepAlive: 2,
  maxPlayersPerRoom: 8,
  /** Block edits per message (the magic builder can send many). */
  maxEditsPerMessage: 4000,
  /** Edits in the welcome message are sent in pages of this size. */
  editsPerWelcomePage: 5000,
  /** A world keeps at most this many changed blocks. */
  maxStoredEdits: 300_000,
  /** Most creatures in one position message. */
  maxMobsPerMove: 40,
  /** Longest chat message. */
  maxChatLength: 200,
  /** Chat messages per player in CHAT_WINDOW_MS (stops spamming). */
  chatRateLimit: 8,
  chatWindowMs: 10_000,
  reconnectDelayMs: 1500,
  reconnectMaxDelayMs: 15_000,
} as const;

// --- World codes ----------------------------------------------------------
// A code is two short Finnish words and a number, e.g. "KALA-PUU-42".
// Easy for kids to say to each other, hard for strangers to guess.
export const CODE_WORDS = [
  'AHVEN',
  'ANKKA',
  'AURINKO',
  'AUTO',
  'HAI',
  'HIIRI',
  'HILLO',
  'HUVI',
  'JUNA',
  'KALA',
  'KANA',
  'KARHU',
  'KETTU',
  'KIVI',
  'KUKKA',
  'KUU',
  'KYNÄ',
  'LAIVA',
  'LEIJA',
  'LEPPÄ',
  'LIMSA',
  'LUMI',
  'MAITO',
  'MANSIKKA',
  'MEHU',
  'MUNA',
  'MÄKI',
  'NALLE',
  'OMENA',
  'ORAVA',
  'PALLO',
  'PANDA',
  'PELI',
  'PILVI',
  'PIPO',
  'PIZZA',
  'POLKU',
  'PORO',
  'PUPU',
  'PUU',
  'RAKETTI',
  'RUSINA',
  'SAMMAKKO',
  'SATU',
  'SIILI',
  'SIENI',
  'SILTA',
  'SUKKA',
  'SUSI',
  'TÄHTI',
  'TALO',
  'TIKKU',
  'TONTTU',
  'TORNI',
  'TUULI',
  'UKKO',
  'VENE',
  'VESI',
  'VIIKSI',
  'ÄMPÄRI',
  'ILVES',
  'JÄNIS',
  'HUKKA',
  'MATO',
] as const;
export const CODE_NUMBER_MAX = 100;

// --- Avatars --------------------------------------------------------------
// Players are animals. Never names or other personal data.
export const AVATARS = [
  { emoji: '🦊', color: 0xf08a24 },
  { emoji: '🐻', color: 0x8b5a2b },
  { emoji: '🐼', color: 0xeeeeee },
  { emoji: '🐸', color: 0x4caf50 },
  { emoji: '🐷', color: 0xf4a7b9 },
  { emoji: '🐰', color: 0xd8d0c8 },
  { emoji: '🦁', color: 0xe8b43a },
  { emoji: '🐧', color: 0x333a44 },
  { emoji: '🦖', color: 0x5aa04a },
  { emoji: '🐙', color: 0xb05cc8 },
] as const;
export const AVATAR_EMOJIS: readonly string[] = AVATARS.map((a) => a.emoji);

// --- Magic builder (AI) ---------------------------------------------------
export const BUILDER = {
  maxPromptLength: 60,
  maxShapes: 60,
  /** No shape may be bigger than this along any axis. */
  maxShapeSize: 24,
  /** The whole build must fit in a box this size. */
  maxBuildSize: 32,
  maxBlocks: 12_000,
  /** Builds per world in RATE_WINDOW_MS. */
  rateLimit: 12,
  rateWindowMs: 10 * 60 * 1000,
  /** Distance in front of the player where the build starts. */
  distanceAhead: 4,
} as const;

// --- Local storage keys -------------------------------------------------
export const STORAGE = {
  avatar: 'palikkamaailma.avatar',
  worlds: 'palikkamaailma.worlds',
  soloEdits: 'palikkamaailma.solo.edits',
  /** Inventory, health and position per world (this device only). */
  player: 'palikkamaailma.player',
  soloSettings: 'palikkamaailma.solo.settings',
  /** Chests and furnaces when playing alone. */
  containers: 'palikkamaailma.containers',
} as const;
