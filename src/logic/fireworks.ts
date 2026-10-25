// Fireworks (ilotulitteet): what each rocket looks like when it bursts.
// A rocket is just a kind and a seed (a dice number), so it can be sent to the
// other players in a tiny message and everyone sees the same burst.

import { FIREWORKS } from '../config';
import { mulberry32 } from './noise';

export type FireworkShape = 'ball' | 'big' | 'star' | 'creeper' | 'heart';

export interface FireworkKind {
  shape: FireworkShape;
  /** Fixed colours, or empty for random ones from the palette. */
  colors: readonly number[];
}

/** Same order as the rocket items (`firework` in items.ts). Never reorder. */
export const FIREWORK_KINDS: readonly FireworkKind[] = [
  { shape: 'ball', colors: [] },
  { shape: 'big', colors: [] },
  { shape: 'star', colors: [0xffd83a, 0xfff3a0] },
  { shape: 'creeper', colors: [0x4cd94c] },
  { shape: 'heart', colors: [0xff4f8b, 0xff9cc2] },
];

/** Minecraft's dye colours, a bit brighter so they shine in the sky. */
const PALETTE = [
  0xff3b30, 0xff9500, 0xffd60a, 0x34c759, 0x30d5c8, 0x0a84ff, 0x5e5ce6, 0xbf5af2, 0xff6ec7,
  0xffffff,
];

export interface Spark {
  /** Speed (blocks per second) when the rocket bursts. */
  v: [number, number, number];
  color: number;
}

export function isFireworkKind(kind: unknown): kind is number {
  return (
    typeof kind === 'number' && Number.isInteger(kind) && kind >= 0 && kind < FIREWORK_KINDS.length
  );
}

/** Seconds the rocket flies up before it bursts. */
export function flightTime(seed: number): number {
  const r = mulberry32(seed ^ 0x5bd1e995)();
  return FIREWORKS.flightMin + r * (FIREWORKS.flightMax - FIREWORKS.flightMin);
}

/** A kind for a launcher: the dice pick one. */
export function randomKind(seed: number): number {
  return Math.floor(mulberry32(seed)() * FIREWORK_KINDS.length);
}

// Creeper face, 8 × 8 ('#' = spark).
const CREEPER = [
  '##....##',
  '##....##',
  '...##...',
  '..####..',
  '..####..',
  '..#..#..',
  '........',
  '........',
];

/**
 * The sparks of one burst. `facing` turns flat pictures (star, creeper,
 * heart) towards the one watching (radians, like the player's yaw).
 */
export function burst(kind: number, seed: number, facing?: number): Spark[] {
  const info = FIREWORK_KINDS[kind] ?? FIREWORK_KINDS[0]!;
  const random = mulberry32(seed);
  const colors =
    info.colors.length > 0
      ? info.colors
      : [0, 1].map(() => PALETTE[Math.floor(random() * PALETTE.length)]!);
  const color = () => colors[Math.floor(random() * colors.length)]!;
  const sparks: Spark[] = [];

  // Flat pictures (star, creeper, heart) stand up and face the watcher.
  const randomYaw = random() * Math.PI * 2;
  const yaw = facing ?? randomYaw;
  const flat = (u: number, v: number, speed: number) => {
    const depth = (random() - 0.5) * 0.6;
    sparks.push({
      v: [
        (Math.cos(yaw) * u + Math.sin(yaw) * depth) * speed,
        v * speed,
        (-Math.sin(yaw) * u + Math.cos(yaw) * depth) * speed,
      ],
      color: color(),
    });
  };

  switch (info.shape) {
    case 'ball':
    case 'big': {
      const count = info.shape === 'big' ? 260 : 120;
      const speed = info.shape === 'big' ? 11 : 6.5;
      for (let i = 0; i < count; i++) {
        // An even spread on a ball (golden angle spiral) with a little shake.
        const y = 1 - (2 * (i + 0.5)) / count;
        const r = Math.sqrt(1 - y * y);
        const a = i * 2.399963 + random() * 0.3;
        const s = speed * (0.85 + random() * 0.3);
        sparks.push({ v: [Math.cos(a) * r * s, y * s, Math.sin(a) * r * s], color: color() });
      }
      break;
    }
    case 'star': {
      const points = 5;
      for (let i = 0; i < 150; i++) {
        const t = (i / 150) * points * 2;
        const corner = Math.floor(t);
        const f = t - corner;
        const radius = (n: number) => (n % 2 === 0 ? 1 : 0.42);
        const angle = (n: number) => (n / (points * 2)) * Math.PI * 2 + Math.PI / 2;
        const ax = Math.cos(angle(corner)) * radius(corner);
        const ay = Math.sin(angle(corner)) * radius(corner);
        const bx = Math.cos(angle(corner + 1)) * radius(corner + 1);
        const by = Math.sin(angle(corner + 1)) * radius(corner + 1);
        flat(ax + (bx - ax) * f, ay + (by - ay) * f, 8);
      }
      break;
    }
    case 'creeper': {
      CREEPER.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (c !== '#') return;
          for (let n = 0; n < 4; n++) {
            const u = (x - 3.5 + (random() - 0.5) * 0.6) / 4;
            const v = (3.5 - y + (random() - 0.5) * 0.6) / 4;
            flat(u, v, 8);
          }
        }),
      );
      break;
    }
    case 'heart': {
      for (let i = 0; i < 140; i++) {
        const t = (i / 140) * Math.PI * 2;
        const u = Math.pow(Math.sin(t), 3);
        const v =
          (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
        flat(u, v, 8);
      }
      break;
    }
  }
  return sparks;
}
