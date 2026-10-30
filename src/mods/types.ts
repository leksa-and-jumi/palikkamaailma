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

/** What a mod's own code can do: only things that disappear by themselves. */
export interface ModApi {
  /** Where you are and how you move. */
  readonly player: { x: number; y: number; z: number; vx: number; vz: number; onGround: boolean };
  /** A short message on the screen. */
  toast(text: string): void;
  /** A little coloured spark (it fades away). */
  sparkle(x: number, y: number, z: number, color: number): void;
}

export interface Mod {
  /** Saved in each world: never change it. Small letters, numbers and dashes. */
  id: string;
  emoji: string;
  /** Finnish name and a sentence for the kids. */
  name: string;
  description: string;
  effects?: ModEffects;
  /** Called every frame while the mod is on. */
  tick?(api: ModApi, dt: number): void;
  onEnable?(api: ModApi): void;
  onDisable?(api: ModApi): void;
}
