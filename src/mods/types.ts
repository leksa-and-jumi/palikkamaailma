// What a mod is. A mod only changes how the game behaves while it is on:
// it never adds blocks or items and never stores anything of its own in
// the world, so turning it off leaves every world exactly as it was.

import type { Recipe } from '../logic/recipes';

/** Rules a mod changes. Numbers multiply (1 = normal); the rest are on or off. */
export interface ModEffects {
  /** Walking and running speed. */
  walkSpeed?: number;
  /** How high you jump. */
  jumpSpeed?: number;
  /** How strongly you fall (below 1 = floaty, like the moon). */
  gravity?: number;
  /** How fast blocks break. */
  miningSpeed?: number;
  /** How fast you get hungry (0 = never). */
  hunger?: number;
  /** The time of day stays here (0 = sunrise, 0.25 = noon) instead of following the clock. */
  timeOfDay?: number;
  /** Monsters don't come out. */
  noMonsters?: boolean;
  /** Extra crafting recipes (only crafting: nothing is stored in the world). */
  recipes?: readonly Recipe[];
}

/** Who talks in a speech box. */
export interface Speaker {
  emoji: string;
  name: string;
  /** Colour of the name (CSS). */
  color?: string;
}

/** How the world looks and sounds while a mod wants it (all optional). */
export interface Atmosphere {
  fogColor?: number;
  fogNear?: number;
  fogFar?: number;
  /** 0 = normal, 1 = very dark. */
  darkness?: number;
  /** A colour over the whole screen (CSS, e.g. 'rgba(255,0,0,0.2)'). */
  tint?: string;
  /** Dark screen edges, 0–1. */
  vignette?: number;
  rain?: boolean;
  /** Lightning flashes and thunder now and then. */
  lightning?: boolean;
  /** A music track (public/music/<id>.m4a) that plays quietly while this mood lasts. */
  music?: string;
}

/**
 * How a part moves:
 * - legA/legB, armA/armB swing when the character walks (A and B take turns);
 * - head turns to look at you and nods while talking;
 * - sway (capes, dresses, hair) waves gently and trails behind when walking;
 * - wingL/wingR flap (faster when attacking);
 * - jaw opens and shuts while the character talks;
 * - spin turns around all the time, pulse breathes in and out;
 * - crawlL/crawlR are spider legs that scuttle (use `phase` to take turns);
 * - attack swings forward when the character attacks (an arm with a sword).
 */
export type PartMove =
  | 'legA'
  | 'legB'
  | 'armA'
  | 'armB'
  | 'head'
  | 'sway'
  | 'wingL'
  | 'wingR'
  | 'jaw'
  | 'spin'
  | 'pulse'
  | 'crawlL'
  | 'crawlR'
  | 'attack';

/** Expressions a face can have. */
export type FaceMood = 'normal' | 'blink' | 'angry' | 'hurt' | 'talk';

/**
 * A pixel face drawn on the front (-z) of a part, as rows of letters
 * ("." or space = the part's own colour). Letters in `glow` shine in the dark.
 */
export interface FaceSpec {
  colors: Readonly<Record<string, string>>;
  glow?: string;
  rows: Readonly<Partial<Record<FaceMood, readonly string[]>>> & { normal: readonly string[] };
}

/** One box of a mod character (like the creatures' boxes). */
export interface ActorPart {
  size: [number, number, number];
  /** The box's middle, from the character's feet. */
  pos: [number, number, number];
  color: number;
  /** Shines in the dark (eyes, lanterns). */
  glow?: boolean;
  /** Glowing parts that flicker like a candle. */
  flicker?: boolean;
  /** See-through (ghosts), 0–1. */
  alpha?: number;
  face?: FaceSpec;
  move?: PartMove;
  /** Where it turns around (default: the top for limbs, the bottom for heads). */
  pivot?: [number, number, number];
  /** A head start in the swing (spider legs take turns). */
  phase?: number;
  /** Tilts it a little (radians around x, z), e.g. arms held forward. */
  tilt?: [number, number];
  /** Not only boxes: round heads, long thin arms, sharp claws (size = how big each way). */
  shape?: 'box' | 'sphere' | 'cylinder' | 'cone';
  /**
   * Drawn with a living shader instead of a plain colour: `smoke` is a
   * see-through, rippling shadow with a faint red glow at its edges.
   */
  shader?: 'smoke';
  /** The glowing edge of a smoke part (default dark red). */
  rim?: number;
}

/** How the whole character moves. */
export interface ActorMotion {
  /** Hovers this high and bobs up and down (ghosts). */
  float?: number;
  /** Steps per second at walking speed. */
  gait?: number;
  /** How far legs and arms swing (radians). */
  swing?: number;
  /** Jerky, stop-and-go walking (skeletons). */
  jerky?: boolean;
  /** Bounces along instead of walking (pumpkin bombs). */
  bounce?: boolean;
}

export interface ActorSpec {
  /** A name that is the same on every computer (shared mods send it). */
  id?: string;
  parts: readonly ActorPart[];
  /** Size for hitting it. */
  width: number;
  height: number;
  motion?: ActorMotion;
  /** This character's mouth moves when its mod talks. */
  speaker?: boolean;
}

/** Something a character does once (shown to everyone). */
export type ActorAct = 'attack' | 'hurt' | 'cast';

/** Where a mod character is now. */
export interface ActorState {
  x: number;
  y: number;
  z: number;
  /** Facing (0 looks towards -z, like the player). */
  yaw: number;
  /** Tips the front up (+) or down (−), e.g. a neck reaching for you. */
  pitch?: number;
  visible?: boolean;
  scale?: number;
  /** Shows a name tag. */
  label?: string;
}

/** A player in the world as a mod sees them. */
export interface ModPlayer {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  onGround: boolean;
  yaw: number;
  /** Where they look (a unit vector). */
  look: [number, number, number];
  /** In creative: monsters (and mod characters) leave them alone. */
  safe: boolean;
}

/**
 * What a mod's own code can do. Everything is about how the game looks,
 * sounds and plays right now: nothing a mod does is stored in the world.
 */
export interface ModApi {
  /** Where you are and how you move (in a shared mod: the player it is busy with). */
  readonly player: ModPlayer;
  /** Everyone in the world, you first. */
  readonly players: readonly ModPlayer[];
  readonly mode: 'creative' | 'survival';
  /** It is night (or dark) right now. */
  readonly night: boolean;
  readonly nether: boolean;
  readonly dead: boolean;
  /** A short message on the screen. */
  toast(text: string): void;
  /** A little coloured spark (it fades away). */
  sparkle(x: number, y: number, z: number, color: number): void;
  /** Someone talks in the speech box at the bottom of the screen. */
  say(speaker: Speaker, text: string): void;
  /** Changes the fog, darkness and weather (null = back to normal). */
  atmosphere(a: Atmosphere | null): void;
  /** A quick flash over the screen (CSS colour). */
  flash(color: string, seconds: number): void;
  /**
   * A small badge in the corner that stays until changed (null hides it),
   * e.g. "Ikiyö has marked you". `level` 0–1 makes it pulse faster.
   */
  mark(text: string | null, level?: number): void;
  /** Shakes the screen (0–1 strong) for a moment. */
  shake(amount: number, seconds: number): void;
  /** Shows or moves one of the mod's own characters (only on this computer). */
  actor(id: string, spec: ActorSpec, state: ActorState): void;
  removeActor(id: string): void;
  /** A character attacks, gets hurt or casts a spell (a short animation). */
  animate(id: string, act: ActorAct): void;
  /** The boss bar at the top of the screen (null hides it). */
  bossBar(name: string | null, health?: number): void;
  /** Hurts you (only in survival). */
  hurt(amount: number, reason: string): void;
  /** Hurts another player (they get it over the network). */
  hurtPlayer(id: string, amount: number, reason: string): void;
  /** Changes your rules for a while (a web slows you down). */
  effect(effects: ModEffects, seconds: number): void;
  effectFor(id: string, effects: ModEffects, seconds: number): void;
  /** Gives you a push. */
  push(vx: number, vy: number, vz: number): void;
  /** Gives a trophy (kept on this device). True the first time. */
  trophy(id: string): boolean;
  hasTrophy(id: string): boolean;
  sound(name: ModSound): void;
  isSolid(x: number, y: number, z: number): boolean;
  /** Feet height of the ground at (x, z), looking down from near y. */
  groundY(x: number, z: number, nearY: number): number;
}

export type ModSound =
  | 'boom'
  | 'pop'
  | 'magic'
  | 'click'
  | 'break'
  | 'thunder'
  | 'whisper'
  | 'laugh'
  | 'bell'
  | 'heartbeat'
  | 'creak'
  | 'howl'
  | 'drip'
  | 'wind'
  | 'roar'
  | 'drone'
  | 'glitch'
  | 'scream'
  | 'rumble'
  | 'stinger'
  | 'bite'
  | 'stretch'
  | 'giggle'
  | 'knock'
  | 'steps';

/** A chat command a mod adds (like /kauhu). */
export interface ModCommand {
  names: readonly string[];
  help: string;
  /** A secret (easter egg): not in the help lists. */
  hidden?: boolean;
  run(api: ModApi, args: string): void;
}

/** A prize for beating something a mod brings (kept on this device). */
export interface Trophy {
  /** Saved: never change it. */
  id: string;
  emoji: string;
  name: string;
  description: string;
  /** Shown as ??? until won. */
  secret?: boolean;
}

export interface Mod {
  /** Saved in each world: never change it. Small letters, numbers and dashes. */
  id: string;
  /**
   * Shared in multiplayer: one player (the host, smallest id) runs the mod,
   * and everyone sees its characters, mood and speech and can hit its
   * characters. Its characters' specs need an `id`.
   */
  shared?: boolean;
  /** Every character look the mod uses (shared mods find them by `id`). */
  actorSpecs?: readonly ActorSpec[];
  /** A trophy was won together with the host (shared mods, on the others' computers). */
  onTrophy?(api: ModApi, id: string): void;
  emoji: string;
  /** Finnish name and a sentence for the kids. */
  name: string;
  description: string;
  effects?: ModEffects;
  /** Trophies you can win with this mod (shown in the trophy cabinet). */
  trophies?: readonly Trophy[];
  /** Rules that change from moment to moment (e.g. a web slows you down). */
  liveEffects?(): ModEffects | null;
  /** Chat commands. */
  commands?: readonly ModCommand[];
  /**
   * Short facts about this player that a shared mod's host needs (e.g. "has
   * every trophy"); the others' computers send theirs to the host now and then.
   */
  tags?(api: ModApi): readonly string[];
  /** On the host: a player told one of their tags (`id` is theirs, or yours). */
  onTag?(api: ModApi, playerId: string, tag: string): void;
  /** You hit one of the mod's characters. */
  onHitActor?(api: ModApi, id: string, damage: number): void;
  /** Called every frame while the mod is on. */
  tick?(api: ModApi, dt: number): void;
  /**
   * Called every frame on every computer (also the others' in a shared mod),
   * for things about you only: a badge, your own trophies.
   */
  localTick?(api: ModApi, dt: number): void;
  onEnable?(api: ModApi): void;
  onDisable?(api: ModApi): void;
}
