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
}

/** One box of a mod character (like the creatures' boxes). */
export interface ActorPart {
  size: [number, number, number];
  /** The box's middle, from the character's feet. */
  pos: [number, number, number];
  color: number;
  /** Shines in the dark (eyes, lanterns). */
  glow?: boolean;
}

export interface ActorSpec {
  parts: readonly ActorPart[];
  /** Size for hitting it. */
  width: number;
  height: number;
}

/** Where a mod character is now. */
export interface ActorState {
  x: number;
  y: number;
  z: number;
  /** Facing (0 looks towards -z, like the player). */
  yaw: number;
  visible?: boolean;
  scale?: number;
  /** Shows a name tag. */
  label?: string;
}

/**
 * What a mod's own code can do. Everything is about how the game looks,
 * sounds and plays right now: nothing a mod does is stored in the world.
 */
export interface ModApi {
  /** Where you are and how you move. */
  readonly player: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vz: number;
    onGround: boolean;
    yaw: number;
    /** Where you look (a unit vector). */
    look: [number, number, number];
  };
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
  /** Shows or moves one of the mod's own characters (only on this computer). */
  actor(id: string, spec: ActorSpec, state: ActorState): void;
  removeActor(id: string): void;
  /** The boss bar at the top of the screen (null hides it). */
  bossBar(name: string | null, health?: number): void;
  /** Hurts you (only in survival). */
  hurt(amount: number, reason: string): void;
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
  | 'heartbeat';

/** A chat command a mod adds (like /kauhu). */
export interface ModCommand {
  names: readonly string[];
  help: string;
  run(api: ModApi, args: string): void;
}

/** A prize for beating something a mod brings (kept on this device). */
export interface Trophy {
  /** Saved: never change it. */
  id: string;
  emoji: string;
  name: string;
  description: string;
}

export interface Mod {
  /** Saved in each world: never change it. Small letters, numbers and dashes. */
  id: string;
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
  /** You hit one of the mod's characters. */
  onHitActor?(api: ModApi, id: string, damage: number): void;
  /** Called every frame while the mod is on. */
  tick?(api: ModApi, dt: number): void;
  onEnable?(api: ModApi): void;
  onDisable?(api: ModApi): void;
}
