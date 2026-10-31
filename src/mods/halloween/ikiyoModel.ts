// 👁️ What Ikiyö looks like: a giant shadow, about twelve blocks tall,
// floating above the ground. A long pale skull with deep eye holes and
// glowing red eyes, jagged teeth and a jaw that moves, horns, a tattered
// cloak that waves, ribs showing through, and arms so long that the claws
// nearly touch the ground. Not only boxes: spheres, cylinders and cones.

import type { ActorPart, ActorSpec, PartMove } from '../types';

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
    // Collar of rags around the neck.
    p([3.2, 0.7, 2.4], [0, 9.05, 0], CLOAK, { shape: 'cylinder' }),
    p([0.6, 1.1, 0.6], [0, 9.6, 0], OLD_BONE, { shape: 'cylinder' }),
    // The skull (everything up here turns with the head).
    p([2.0, 2.9, 2.2], [0, 11, 0], BONE, { shape: 'sphere', move: 'head' }),
    p([2.06, 1.0, 1.4], [0, 12.0, 0.3], 0xc7bfa8, { shape: 'sphere' }),
    // Deep eye holes, glowing eyes.
    ...[-0.48, 0.48].flatMap((x): ActorPart[] => [
      p([0.75, 0.6, 0.4], [x, 11.25, -0.9], HOLE, { shape: 'sphere' }),
      p([0.32, 0.22, 0.2], [x, 11.22, -1.05], EYE, { shape: 'sphere', glow: true, flicker: true }),
    ]),
    // A crack across the forehead.
    p([0.08, 0.7, 0.1], [0.25, 12.1, -0.98], HOLE, { tilt: [0, 0.5] }),
    // Nose hole and a mouth full of jagged teeth.
    p([0.28, 0.32, 0.2], [0, 10.75, -1.05], HOLE),
    p([1.15, 0.5, 0.3], [0, 10.15, -0.95], HOLE),
    ...[-0.42, -0.25, -0.08, 0.08, 0.25, 0.42].map((x, i) =>
      p([0.13, 0.28 + (i % 2) * 0.1, 0.13], [x, 10.3, -1.06], 0xf2ecd8, {
        shape: 'cone',
        tilt: [Math.PI, 0],
      }),
    ),
    p([1.25, 0.32, 1.0], [0, 9.85, -0.55], OLD_BONE, {
      move: 'jaw',
      pivot: [0, 9.95, 0.1],
    }),
    // Twisted horns.
    ...[-1, 1].flatMap((s): ActorPart[] => [
      p([0.45, 1.6, 0.45], [s * 0.75, 12.65, 0.25], 0x2a2420, {
        shape: 'cone',
        tilt: [0.35, -s * 0.5],
      }),
      // Kept low enough to turn with the head.
      p([0.25, 0.9, 0.25], [s * 1.0, 12.9, 0.45], 0x1a1612, {
        shape: 'cone',
        tilt: [0.6, -s * 0.9],
      }),
    ]),
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
