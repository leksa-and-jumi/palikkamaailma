// The shared parts of a Halloween character's visit: who it is, its trophy,
// how the world looks while it is here, and helpers for moving around you.

import type { Atmosphere, ModApi, Speaker, Trophy } from '../types';

export type Outcome = 'fight' | 'won' | 'fled';

export interface Encounter {
  readonly who: Speaker;
  readonly trophy: Trophy;
  readonly mood: Atmosphere;
  /** The words it says when it arrives (one by one). */
  readonly intro: readonly string[];
  /** What it says when you win. */
  readonly defeat: string;
  /** What it says when you get away. */
  readonly escape: string;
  start(api: ModApi): void;
  update(api: ModApi, dt: number): Outcome;
  /** `by` is the player who hit it. */
  hit(api: ModApi, id: string, damage: number, by?: string): void;
  /** Takes its characters away. */
  end(api: ModApi): void;
  /** Where it is now (the nearest player gets its attention). */
  where(): Vec;
}

export type Vec = { x: number; y: number; z: number };

/** Facing angle from a towards b (0 looks towards -z, like the player). */
export function yawTo(a: Vec, b: Vec): number {
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** A place on the ground `dist` blocks from you, `angle` radians from where you look. */
export function aroundPlayer(api: ModApi, dist: number, angle: number): Vec {
  const p = api.player;
  const [lx, , lz] = p.look;
  const base = Math.atan2(lx, lz) + angle;
  const x = p.x + Math.sin(base) * dist;
  const z = p.z + Math.cos(base) * dist;
  return { x, y: api.groundY(x, z, p.y), z };
}

/** Are you looking at this place (within `degrees`)? */
export function lookingAt(api: ModApi, target: Vec, degrees: number): boolean {
  const p = api.player;
  const dx = target.x - p.x;
  const dy = target.y + 1.5 - (p.y + 1.6);
  const dz = target.z - p.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const [lx, ly, lz] = p.look;
  return (lx * dx + ly * dy + lz * dz) / len > Math.cos((degrees * Math.PI) / 180);
}

/** Moves `from` towards `to` by at most `step`. Returns true when it got there. */
export function moveTowards(from: Vec, to: Vec, step: number): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dy, dz);
  if (d <= step) {
    from.x = to.x;
    from.y = to.y;
    from.z = to.z;
    return true;
  }
  from.x += (dx / d) * step;
  from.y += (dy / d) * step;
  from.z += (dz / d) * step;
  return false;
}

/** Colourful sparks all around (a win, a hit). */
export function burst(api: ModApi, at: Vec, colors: readonly number[], count = 24): void {
  for (let i = 0; i < count; i++) {
    const c = colors[i % colors.length]!;
    api.sparkle(
      at.x + (Math.random() - 0.5) * 1.5,
      at.y + Math.random() * 2,
      at.z + (Math.random() - 0.5) * 1.5,
      c,
    );
  }
}

/** The player's feet as a point. */
export function me(api: ModApi): Vec {
  return { x: api.player.x, y: api.player.y, z: api.player.z };
}
