// 👁️ What Ikiyö looks like: a giant shadow floating above the ground, with
// a tattered cloak, ribs showing through and arms so long that the claws
// nearly touch the ground. On top, a neck that is one long mouth: a dark
// tube split down the front and lined with fangs, which can stretch out
// to bite. At its end a blocky head with blood-red eyes that never blink.
// The head and the neck are their own pieces, moved by ikiyo.ts.

import type { ActorPart, ActorSpec, FaceSpec, PartMove } from '../types';

type V = [number, number, number];
const p = (
  size: V,
  pos: V,
  color: number,
  more: Partial<Omit<ActorPart, 'size' | 'pos' | 'color'>> = {},
): ActorPart => ({ size, pos, color, ...more });

const SHADOW = 0x07070c;
const CLOAK = 0x0c0b12;
const BONE = 0xd9d2bf;
const OLD_BONE = 0xa89f88;
const HOLE = 0x020203;
const EYE = 0xff2a1a;

/** One very long arm: shoulder to claws, all turning from the shoulder. */
function arm(side: 1 | -1, move: PartMove): ActorPart[] {
  const x = 1.75 * side;
  const shoulder: V = [x, 8.7, 0];
  const swing = { move, pivot: shoulder };
  return [
    p([0.9, 0.9, 0.9], [x, 8.6, 0], CLOAK, { shape: 'sphere' }),
    p([0.5, 3.4, 0.5], [x + side * 0.15, 6.9, 0], SHADOW, { shape: 'cylinder', ...swing }),
    p([0.42, 0.42, 0.42], [x + side * 0.2, 5.1, 0], OLD_BONE, { shape: 'sphere', ...swing }),
    p([0.36, 3.2, 0.36], [x + side * 0.25, 3.4, -0.1], OLD_BONE, { shape: 'cylinder', ...swing }),
    p([0.8, 0.6, 0.55], [x + side * 0.25, 1.7, -0.15], OLD_BONE, { shape: 'sphere', ...swing }),
    // Four claws pointing down.
    ...[-0.3, -0.1, 0.1, 0.3].map((dz, i) =>
      p([0.16, 1.1, 0.16], [x + side * (0.12 + i * 0.06), 0.95, -0.15 + dz], 0x1a1714, {
        shape: 'cone',
        tilt: [Math.PI + dz * 0.6, side * (0.1 + i * 0.04)],
        ...swing,
      }),
    ),
  ];
}

export const IKIYO: ActorSpec = {
  id: 'ikiyo',
  width: 3.6,
  height: 12.5,
  speaker: true,
  motion: { float: 1.2, swing: 0.25, gait: 0.6 },
  parts: [
    // The cloak: a dark cone, see-through at the edges, with rags that wave.
    p([5, 6.8, 4.4], [0, 3.6, 0.2], CLOAK, { shape: 'cone', alpha: 0.94 }),
    ...Array.from({ length: 10 }, (_, i): ActorPart => {
      const a = (i / 10) * Math.PI * 2;
      return p([0.55, 2.4, 0.1], [Math.sin(a) * 2.15, 0.6, Math.cos(a) * 1.9 + 0.2], SHADOW, {
        move: 'sway',
        phase: i * 1.7,
        alpha: 0.85,
      });
    }),
    // Chest with ribs showing through a tear.
    p([2.6, 3.2, 1.7], [0, 7.4, 0], SHADOW, { shape: 'cylinder' }),
    p([1.6, 2.3, 0.2], [0, 7.6, -0.78], HOLE),
    ...[6.7, 7.2, 7.7, 8.2].map((y, i) => p([1.5 - i * 0.05, 0.14, 0.14], [0, y, -0.86], BONE)),
    p([0.18, 2.1, 0.18], [0, 7.45, -0.84], OLD_BONE),
    // Spikes down the back.
    ...[8.6, 7.8, 7.0, 6.2].map((y, i) =>
      p([0.35, 0.9 - i * 0.1, 0.35], [0, y, 0.95], 0x1b1820, { shape: 'cone', tilt: [-0.9, 0] }),
    ),
    // A collar of rags where the long neck comes out (the head and the neck are their own pieces).
    p([3.2, 0.7, 2.4], [0, 9.05, 0], CLOAK, { shape: 'cylinder' }),
    p([1.5, 0.5, 1.5], [0, 9.5, 0], 0x161012, { shape: 'cylinder' }),
    ...arm(1, 'armB'),
    ...arm(-1, 'armA'),
  ],
};

/** A small floating skull it sends at you. */
export const WISP: ActorSpec = {
  id: 'ikiyo-wisp',
  width: 0.9,
  height: 0.9,
  motion: { float: 0.1 },
  parts: [
    p([0.7, 0.75, 0.7], [0, 0.45, 0], 0xe8e2d0, { shape: 'sphere', alpha: 0.85 }),
    p([0.18, 0.14, 0.1], [-0.15, 0.5, -0.33], EYE, { shape: 'sphere', glow: true, flicker: true }),
    p([0.18, 0.14, 0.1], [0.15, 0.5, -0.33], EYE, { shape: 'sphere', glow: true, flicker: true }),
    p([0.3, 0.12, 0.08], [0, 0.28, -0.32], HOLE),
    // A trail of shadow.
    p([0.45, 0.9, 0.45], [0, 0.3, 0.5], SHADOW, { shape: 'cone', tilt: [-1.6, 0], alpha: 0.6 }),
  ],
};

/** A glowing red circle on the ground: a claw is coming down here. */
export const MARK: ActorSpec = {
  id: 'ikiyo-mark',
  width: 3.4,
  height: 0.1,
  parts: [
    p([3.4, 0.05, 3.4], [0, 0.06, 0], 0xff2010, {
      shape: 'cylinder',
      glow: true,
      alpha: 0.45,
      move: 'pulse',
    }),
    p([2.2, 0.06, 2.2], [0, 0.08, 0], 0x400000, { shape: 'cylinder', alpha: 0.6 }),
  ],
};

const TOOTH = 0xf2ecd8;
const GUM = 0x4a0808;
const THROAT = 0x2a0204;

/** Fangs along both sides of a slit (pointing in), from y0 to y1, at depth z. */
function fangs(
  x: number,
  z: number,
  y0: number,
  y1: number,
  count: number,
  long = 0.6,
): ActorPart[] {
  const out: ActorPart[] = [];
  for (let i = 0; i < count; i++) {
    const y = y0 + ((y1 - y0) * (i + 0.5)) / count;
    const len = long * (0.7 + ((i * 7) % 5) * 0.12);
    out.push(
      p([0.13, len, 0.13], [-x, y, z], TOOTH, { shape: 'cone', tilt: [0.25, -Math.PI / 2 + 0.25] }),
      p([0.13, len, 0.13], [x, y + 0.08, z], TOOTH, {
        shape: 'cone',
        tilt: [0.25, Math.PI / 2 - 0.25],
      }),
    );
  }
  return out;
}

/**
 * The face (16 × 16): sunken black sockets with glowing red eyes and a
 * yellow pinprick, dark streaks running down, veins and a grin from cheek
 * to cheek full of teeth. It never blinks.
 */
const FACE: FaceSpec = {
  colors: {
    h: '#0b0909',
    k: '#050303',
    r: '#e01408',
    y: '#ffd040',
    s: '#241214',
    b: '#170a0a',
    v: '#5a0a0a',
    m: '#0a0000',
    t: '#e8e0c8',
  },
  glow: 'ry',
  rows: {
    normal: [
      'hhhhhhhhhhhhhhhh',
      'hhhhhhhhhhhhhhhh',
      'hhh.hhhhhh.hhhhh',
      'h....h....h...h.',
      '.bb..........bb.',
      '..bbb......bbb..',
      '.kkkkk....kkkkk.',
      '.kkrrk....krrkk.',
      '.kkryk....kyrkk.',
      '.vkkkk....kkkkv.',
      '..s..........s..',
      '..s..v....v..s..',
      '.ms..........sm.',
      '.mmmtmtmmtmtmmm.',
      '..mmmmmmmmmmmm..',
      '...tmtmttmtmt...',
    ],
    angry: [
      'hhhhhhhhhhhhhhhh',
      'hhhhhhhhhhhhhhhh',
      'hhh.hhhhhh.hhhhh',
      'h....h....h...h.',
      '.....bb..bb.....',
      '.bbbb......bbbb.',
      '.kkkkkk..kkkkkk.',
      '.krrrrk..krrrrk.',
      '.krryrk..kryrrk.',
      '.vkrrkk..kkrrkv.',
      '.vs..........sv.',
      '..s..v....v..s..',
      'mms..........smm',
      'mmmtmtmmmmtmtmmm',
      '.mmmmmmmmmmmmmm.',
      '..tmtmtttmtmtm..',
    ],
    hurt: [
      'hhhhhhhhhhhhhhhh',
      'hhhhhhhhhhhhhhhh',
      'hhh.hhhhhh.hhhhh',
      'h....h....h...h.',
      '...bb......bb...',
      '..b..........b..',
      '.kkkkk....kkkkk.',
      '.kkvvk....kvvkk.',
      '.kkvrk....krvkk.',
      '.vkkkk....kkkkv.',
      '..s..........s..',
      '..s..v....v..s..',
      '.ms..........sm.',
      '.mmmtmtmmtmtmmm.',
      '..mmmmmmmmmmmm..',
      '...tmtmttmtmt...',
    ],
  },
};

/** The head, about the size of four blocks; its mouth runs on down into the neck. */
export const IKIYO_HEAD: ActorSpec = {
  id: 'ikiyo-head',
  width: 2.8,
  height: 3.2,
  speaker: true,
  parts: [
    p([2.6, 2.6, 2.6], [0, 1.9, 0], 0x6f6862, { face: FACE }),
    // Black hair hanging over it.
    p([2.72, 0.45, 2.72], [0, 3.2, 0], 0x0e0c0c),
    p([2.72, 2.2, 0.25], [0, 2.1, 1.26], 0x0e0c0c),
    p([0.25, 1.4, 2.4], [-1.3, 2.5, 0.1], 0x0e0c0c),
    p([0.25, 1.1, 2.4], [1.3, 2.6, 0.1], 0x0e0c0c),
    // The mouth opens from the cheeks down: gums, throat and fangs.
    p([0.9, 1.25, 0.25], [0, 0.95, -1.24], THROAT, { glow: true }),
    p([0.14, 1.25, 0.2], [-0.48, 0.95, -1.3], GUM),
    p([0.14, 1.25, 0.2], [0.48, 0.95, -1.3], GUM),
    ...fangs(0.42, -1.36, 0.4, 1.5, 4, 0.7),
    // It drips into the neck below.
    p([1.3, 0.6, 1.3], [0, 0.3, 0], 0x161012, { shape: 'cylinder' }),
  ],
};

/** One piece of the long neck (2.4 long, upright; it is tipped towards where the head is). */
export const NECK: ActorSpec = {
  id: 'ikiyo-neck',
  width: 1.4,
  height: 2.4,
  parts: [
    p([1.35, 2.5, 1.35], [0, 1.2, 0], 0x161012, { shape: 'cylinder' }),
    // Bony bumps down the back.
    p([0.35, 0.5, 0.35], [0, 1.2, 0.62], 0x2a2420, { shape: 'cone', tilt: [-1.2, 0] }),
    // The slit down the front: throat, gums and fangs.
    p([0.75, 2.5, 0.22], [0, 1.2, -0.6], THROAT, { glow: true }),
    p([0.12, 2.5, 0.2], [-0.42, 1.2, -0.64], GUM),
    p([0.12, 2.5, 0.2], [0.42, 1.2, -0.64], GUM),
    ...fangs(0.38, -0.72, 0.1, 2.35, 4),
  ],
};

/**
 * The Watcher, seen before Ikiyö comes: a very tall, thin black figure with
 * arms down to its knees and small red eyes. It never moves while you look.
 */
export const WATCHER: ActorSpec = {
  id: 'ikiyo-watcher',
  width: 0.8,
  height: 3.4,
  parts: [
    p([0.22, 1.5, 0.22], [-0.14, 0.75, 0], SHADOW),
    p([0.22, 1.5, 0.22], [0.14, 0.75, 0], SHADOW),
    p([0.6, 1.2, 0.3], [0, 2.1, 0], SHADOW),
    p([0.14, 1.9, 0.14], [-0.4, 1.75, 0], SHADOW, { tilt: [0, 0.05] }),
    p([0.14, 1.9, 0.14], [0.4, 1.75, 0], SHADOW, { tilt: [0, -0.05] }),
    // The head hangs a little to one side.
    p([0.5, 0.62, 0.5], [0.04, 3.0, 0], SHADOW, { tilt: [0, 0.18] }),
    p([0.09, 0.06, 0.05], [-0.1, 3.05, -0.26], EYE, { glow: true }),
    p([0.09, 0.06, 0.05], [0.14, 3.07, -0.26], EYE, { glow: true }),
  ],
};

/** Two red eyes in the dark. */
export const EYES: ActorSpec = {
  id: 'ikiyo-eyes',
  width: 0.6,
  height: 0.3,
  parts: [
    p([0.16, 0.1, 0.06], [-0.18, 0.15, 0], EYE, { shape: 'sphere', glow: true, flicker: true }),
    p([0.16, 0.1, 0.06], [0.18, 0.15, 0], EYE, { shape: 'sphere', glow: true, flicker: true }),
  ],
};
