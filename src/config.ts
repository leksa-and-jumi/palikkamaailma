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
  /** How often your position is sent to the others (per second). */
  moveSendRate: 10,
  maxPlayersPerRoom: 8,
  /** Block edits per message (the magic builder can send many). */
  maxEditsPerMessage: 4000,
  /** Edits in the welcome message are sent in pages of this size. */
  editsPerWelcomePage: 5000,
  /** A world keeps at most this many changed blocks. */
  maxStoredEdits: 300_000,
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
} as const;
