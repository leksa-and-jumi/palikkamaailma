// Computer characters: animals, monsters and villagers. Health, size and
// drops follow Minecraft. Every creature also gets a personality (luonne)
// and a name, so no two cows are quite the same.

import type { Body } from './physics';

export type MobKind =
  'pig' | 'cow' | 'chicken' | 'sheep' | 'zombie' | 'skeleton' | 'creeper' | 'spider' | 'villager';

export type Personality = 'curious' | 'shy' | 'lazy' | 'playful' | 'friendly' | 'grumpy' | 'brave';

export interface MobDrop {
  key: string;
  min: number;
  max: number;
}

export interface MobType {
  kind: MobKind;
  name: string;
  emoji: string;
  /** Hit points (hearts × 2). */
  health: number;
  body: Body;
  hostile: boolean;
  /** Damage per hit to the player (normal difficulty). */
  attack: number;
  drops: readonly MobDrop[];
  /** Experience points for defeating it. */
  xp: number;
  /** Burns in sunlight (zombies and skeletons). */
  burnsInDay: boolean;
  /** Personalities this kind can have. */
  personalities: readonly Personality[];
  /** Holding this makes the animal follow you, and feeding it makes babies. */
  food?: string;
}

const ANIMAL_PERSONALITIES: readonly Personality[] = [
  'curious',
  'shy',
  'lazy',
  'playful',
  'friendly',
];

function body(width: number, height: number, walkSpeed: number): Body {
  return {
    width,
    height,
    walkSpeed,
    sprintSpeed: walkSpeed * 1.8,
    jumpSpeed: 7.6,
    stepHeight: 0.6,
  };
}

export const MOB_TYPES: Record<MobKind, MobType> = {
  pig: {
    kind: 'pig',
    name: 'Possu',
    emoji: '🐷',
    health: 10,
    body: body(0.9, 0.9, 1.6),
    hostile: false,
    attack: 0,
    drops: [{ key: 'porkchop', min: 1, max: 3 }],
    xp: 2,
    burnsInDay: false,
    personalities: ANIMAL_PERSONALITIES,
    food: 'apple',
  },
  cow: {
    kind: 'cow',
    name: 'Lehmä',
    emoji: '🐮',
    health: 10,
    body: body(0.9, 1.4, 1.4),
    hostile: false,
    attack: 0,
    drops: [
      { key: 'beef', min: 1, max: 3 },
      { key: 'leather', min: 0, max: 2 },
    ],
    xp: 2,
    burnsInDay: false,
    personalities: ANIMAL_PERSONALITIES,
    food: 'wheat',
  },
  chicken: {
    kind: 'chicken',
    name: 'Kana',
    emoji: '🐔',
    health: 4,
    body: body(0.5, 0.7, 1.5),
    hostile: false,
    attack: 0,
    drops: [
      { key: 'chicken', min: 1, max: 1 },
      { key: 'feather', min: 0, max: 2 },
    ],
    xp: 1,
    burnsInDay: false,
    personalities: ANIMAL_PERSONALITIES,
    food: 'wheat',
  },
  sheep: {
    kind: 'sheep',
    name: 'Lammas',
    emoji: '🐑',
    health: 8,
    body: body(0.9, 1.3, 1.4),
    hostile: false,
    attack: 0,
    drops: [
      { key: 'mutton', min: 1, max: 2 },
      { key: 'white', min: 1, max: 1 },
    ],
    xp: 2,
    burnsInDay: false,
    personalities: ANIMAL_PERSONALITIES,
    food: 'wheat',
  },
  zombie: {
    kind: 'zombie',
    name: 'Zombi',
    emoji: '🧟',
    health: 20,
    body: body(0.6, 1.9, 1.7),
    hostile: true,
    attack: 3,
    drops: [{ key: 'rotten_flesh', min: 0, max: 2 }],
    xp: 5,
    burnsInDay: true,
    personalities: ['grumpy', 'lazy', 'brave'],
  },
  skeleton: {
    kind: 'skeleton',
    name: 'Luuranko',
    emoji: '💀',
    health: 20,
    body: body(0.6, 1.9, 1.9),
    hostile: true,
    attack: 3,
    drops: [
      { key: 'bone', min: 0, max: 2 },
      { key: 'arrow', min: 0, max: 2 },
    ],
    xp: 5,
    burnsInDay: true,
    personalities: ['grumpy', 'shy', 'brave'],
  },
  creeper: {
    kind: 'creeper',
    name: 'Creeper',
    emoji: '💚',
    health: 20,
    body: body(0.6, 1.7, 1.8),
    hostile: true,
    attack: 0,
    drops: [{ key: 'gunpowder', min: 0, max: 2 }],
    xp: 5,
    burnsInDay: false,
    personalities: ['shy', 'brave', 'curious'],
  },
  spider: {
    kind: 'spider',
    name: 'Hämähäkki',
    emoji: '🕷️',
    health: 16,
    body: body(1.3, 0.9, 2.6),
    hostile: true,
    attack: 2,
    drops: [{ key: 'string', min: 0, max: 2 }],
    xp: 5,
    burnsInDay: false,
    personalities: ['grumpy', 'playful', 'brave'],
  },
  villager: {
    kind: 'villager',
    name: 'Kyläläinen',
    emoji: '🧑‍🌾',
    health: 20,
    body: body(0.6, 1.9, 1.3),
    hostile: false,
    attack: 0,
    drops: [],
    xp: 0,
    burnsInDay: false,
    personalities: ['curious', 'shy', 'lazy', 'playful', 'friendly', 'grumpy'],
  },
};

export const MOB_KINDS = Object.keys(MOB_TYPES) as MobKind[];
export const PASSIVE_KINDS: readonly MobKind[] = ['pig', 'cow', 'chicken', 'sheep'];
export const HOSTILE_KINDS: readonly MobKind[] = ['zombie', 'skeleton', 'creeper', 'spider'];

export const PERSONALITIES: readonly Personality[] = [
  'curious',
  'shy',
  'lazy',
  'playful',
  'friendly',
  'grumpy',
  'brave',
];

/** Finnish names for the personalities. */
export const PERSONALITY_NAMES: Record<Personality, string> = {
  curious: 'utelias',
  shy: 'arka',
  lazy: 'laiska',
  playful: 'leikkisä',
  friendly: 'ystävällinen',
  grumpy: 'äkäinen',
  brave: 'rohkea',
};

/** How each personality changes behaviour. */
export const PERSONALITY_TRAITS: Record<
  Personality,
  {
    /** Multiplies walking speed. */
    speed: number;
    /** Chance per second to stop and rest. */
    rest: number;
    /** Comes closer to players (positive) or keeps away (negative), blocks. */
    approach: number;
    /** Chance per second to hop happily. */
    hop: number;
    /** Monsters: how far they notice you (multiplies). */
    notice: number;
  }
> = {
  curious: { speed: 1, rest: 0.1, approach: 3, hop: 0.05, notice: 1.2 },
  shy: { speed: 1.2, rest: 0.1, approach: -6, hop: 0, notice: 0.7 },
  lazy: { speed: 0.6, rest: 0.4, approach: 0, hop: 0, notice: 0.8 },
  playful: { speed: 1.3, rest: 0.05, approach: 1, hop: 0.5, notice: 1 },
  friendly: { speed: 1, rest: 0.15, approach: 2, hop: 0.1, notice: 1 },
  grumpy: { speed: 0.9, rest: 0.2, approach: -2, hop: 0, notice: 1.3 },
  brave: { speed: 1.2, rest: 0.05, approach: 0, hop: 0, notice: 1.5 },
};

/** Fun names; each creature gets one (no real people's data, just names for animals). */
export const MOB_NAMES: readonly string[] = [
  'Nöpö',
  'Pipsa',
  'Möhkö',
  'Hertta',
  'Täplä',
  'Pörrö',
  'Nappi',
  'Kiki',
  'Lumi',
  'Pulla',
  'Rusina',
  'Sulo',
  'Viiru',
  'Hoppu',
  'Toffee',
  'Muru',
  'Piki',
  'Kaneli',
  'Siiri',
  'Hilla',
  'Ruttu',
  'Pötkö',
  'Napero',
  'Tipu',
  'Mansikka',
  'Unikko',
  'Topi',
  'Jemma',
  'Pätkä',
  'Nuppu',
];

export function mobType(kind: MobKind): MobType {
  return MOB_TYPES[kind];
}

export function isMobKind(v: unknown): v is MobKind {
  return typeof v === 'string' && v in MOB_TYPES;
}

/** A random number of drops for each kind of item (Looting adds up to one more each). */
export function rollDrops(
  kind: MobKind,
  random: () => number = Math.random,
  looting = 0,
): { key: string; count: number }[] {
  return MOB_TYPES[kind].drops
    .map((d) => ({
      key: d.key,
      count: d.min + Math.floor(random() * (d.max - d.min + 1 + looting)),
    }))
    .filter((d) => d.count > 0);
}
