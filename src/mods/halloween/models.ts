// What the Halloween characters look like: boxes like the creatures, with
// glowing eyes and lanterns so they shine in the dark.

import type { ActorPart, ActorSpec } from '../types';

type V = [number, number, number];
const part = (size: V, pos: V, color: number, glow = false): ActorPart => ({
  size,
  pos,
  color,
  glow,
});

/** Two glowing eyes on the front (-z) of a head centred at (0, y, z). */
const eyes = (y: number, z: number, color: number, gap = 0.12, size = 0.09): ActorPart[] => [
  part([size, size, 0.04], [-gap, y, z], color, true),
  part([size, size, 0.04], [gap, y, z], color, true),
];

export const PUMPKIN_KING: ActorSpec = {
  id: 'pumpkin-king',
  width: 0.9,
  height: 2.7,
  parts: [
    part([0.22, 0.8, 0.22], [-0.14, 0.4, 0], 0x1c1420),
    part([0.22, 0.8, 0.22], [0.14, 0.4, 0], 0x1c1420),
    part([0.7, 0.95, 0.38], [0, 1.27, 0], 0x4a1f6a),
    part([0.78, 1.2, 0.08], [0, 1.15, 0.24], 0x2a0c3a),
    part([0.18, 0.8, 0.18], [-0.46, 1.3, -0.1], 0x4a1f6a),
    part([0.18, 0.8, 0.18], [0.46, 1.3, -0.1], 0x4a1f6a),
    part([0.9, 0.8, 0.9], [0, 2.15, 0], 0xe87818),
    part([0.12, 0.16, 0.12], [0, 2.62, 0], 0x3a6a18),
    ...eyes(2.25, -0.46, 0xffe040, 0.2, 0.16),
    part([0.5, 0.1, 0.04], [0, 1.98, -0.46], 0xffe040, true),
    part([0.9, 0.12, 0.9], [0, 2.6, 0], 0xf0c030),
  ],
};

export const PUMPKIN_BOMB: ActorSpec = {
  id: 'pumpkin-bomb',
  width: 0.55,
  height: 0.55,
  parts: [
    part([0.5, 0.45, 0.5], [0, 0.25, 0], 0xe87818),
    part([0.08, 0.1, 0.08], [0, 0.52, 0], 0x3a6a18),
    ...eyes(0.3, -0.26, 0xffe040, 0.1, 0.08),
  ],
};

export const MIST_MAIDEN: ActorSpec = {
  id: 'mist-maiden',
  width: 0.8,
  height: 2.3,
  parts: [
    part([0.9, 1.3, 0.6], [0, 0.85, 0], 0xdfe8f2),
    part([0.6, 0.5, 0.4], [0, 1.7, 0], 0xeef3f8),
    part([0.48, 0.48, 0.48], [0, 2.1, 0], 0xf4f7fa),
    part([0.56, 0.7, 0.12], [0, 1.95, 0.24], 0x2a3040),
    ...eyes(2.12, -0.25, 0x6ad0ff),
    part([0.16, 0.06, 0.04], [0, 1.96, -0.25], 0x2a3040),
  ],
};

export const COUNT: ActorSpec = {
  id: 'count',
  width: 0.8,
  height: 2.4,
  parts: [
    part([0.22, 0.85, 0.22], [-0.14, 0.42, 0], 0x111114),
    part([0.22, 0.85, 0.22], [0.14, 0.42, 0], 0x111114),
    part([0.66, 0.95, 0.36], [0, 1.32, 0], 0x1a1a22),
    part([0.3, 0.5, 0.05], [0, 1.4, -0.2], 0xe8e8ee),
    part([1.6, 1.2, 0.08], [0, 1.35, 0.26], 0x8a0a14),
    part([0.48, 0.5, 0.48], [0, 2.08, 0], 0xe6dde0),
    part([0.5, 0.14, 0.5], [0, 2.36, 0], 0x111114),
    ...eyes(2.12, -0.25, 0xff2030),
    part([0.05, 0.08, 0.04], [-0.07, 1.92, -0.25], 0xffffff),
    part([0.05, 0.08, 0.04], [0.07, 1.92, -0.25], 0xffffff),
    part([1.1, 0.5, 0.06], [-0.75, 1.75, 0.2], 0x1a1a22),
    part([1.1, 0.5, 0.06], [0.75, 1.75, 0.2], 0x1a1a22),
  ],
};

const bones = (scale: number, coat: number, hat: number | null): ActorPart[] => {
  const s = scale;
  const out: ActorPart[] = [
    part([0.12 * s, 0.75 * s, 0.12 * s], [-0.12 * s, 0.38 * s, 0], 0xdedbd0),
    part([0.12 * s, 0.75 * s, 0.12 * s], [0.12 * s, 0.38 * s, 0], 0xdedbd0),
    part([0.56 * s, 0.75 * s, 0.3 * s], [0, 1.12 * s, 0], coat),
    part([0.12 * s, 0.7 * s, 0.12 * s], [-0.36 * s, 1.12 * s, -0.15 * s], 0xdedbd0),
    part([0.12 * s, 0.7 * s, 0.12 * s], [0.36 * s, 1.12 * s, -0.15 * s], 0xdedbd0),
    part([0.46 * s, 0.46 * s, 0.46 * s], [0, 1.75 * s, 0], 0xe8e5da),
    ...eyes(1.78 * s, -0.24 * s, 0x60ffd0, 0.1 * s, 0.09 * s),
  ];
  if (hat !== null) {
    out.push(
      part([0.8 * s, 0.1 * s, 0.6 * s], [0, 2.02 * s, 0], hat),
      part([0.5 * s, 0.22 * s, 0.4 * s], [0, 2.15 * s, 0], hat),
    );
  }
  return out;
};

export const CAPTAIN: ActorSpec = {
  width: 0.8,
  height: 2.6,
  parts: bones(1.2, 0x8a1a1a, 0x16161c),
};
export const DECKHAND: ActorSpec = {
  width: 0.6,
  height: 1.9,
  parts: bones(0.95, 0x2a4a8a, 0xb01a1a),
};

export const SPIDER_QUEEN: ActorSpec = {
  id: 'spider-queen',
  width: 2,
  height: 1.3,
  parts: [
    part([1.3, 0.8, 1.5], [0, 0.75, 0.45], 0x2a1030),
    part([0.9, 0.7, 0.8], [0, 0.7, -0.6], 0x3a1840),
    part([0.7, 0.14, 0.5], [0, 1.1, -0.6], 0xd0a8ff, true),
    ...eyes(0.82, -1.01, 0xff2020, 0.14, 0.08),
    ...eyes(0.66, -1.01, 0xff2020, 0.26, 0.07),
    ...[-0.5, -0.15, 0.2, 0.55].flatMap((z): ActorPart[] => [
      part([1.4, 0.1, 0.1], [-1.05, 0.55, z], 0x1a0a20),
      part([1.4, 0.1, 0.1], [1.05, 0.55, z], 0x1a0a20),
    ]),
  ],
};

export const WEB_SHOT: ActorSpec = {
  id: 'web-shot',
  width: 0.5,
  height: 0.5,
  parts: [
    part([0.5, 0.06, 0.06], [0, 0.25, 0], 0xf4f4f8, true),
    part([0.06, 0.5, 0.06], [0, 0.25, 0], 0xf4f4f8, true),
    part([0.06, 0.06, 0.5], [0, 0.25, 0], 0xf4f4f8, true),
  ],
};

export const SILENT: ActorSpec = {
  id: 'silent',
  width: 0.7,
  height: 2.5,
  parts: [
    part([0.24, 1.0, 0.24], [-0.14, 0.5, 0], 0x0a0a0e),
    part([0.24, 1.0, 0.24], [0.14, 0.5, 0], 0x0a0a0e),
    part([0.62, 0.95, 0.32], [0, 1.47, 0], 0x0e0e14),
    part([0.18, 1.0, 0.18], [-0.42, 1.45, 0], 0x0a0a0e),
    part([0.18, 1.0, 0.18], [0.42, 1.45, 0], 0x0a0a0e),
    part([0.5, 0.5, 0.5], [0, 2.2, 0], 0x0e0e14),
    ...eyes(2.22, -0.26, 0xffffff, 0.12, 0.1),
  ],
};

/** Every look, so the others' computers can find them by id. */
export const ALL_SPECS: readonly ActorSpec[] = [
  PUMPKIN_KING,
  PUMPKIN_BOMB,
  MIST_MAIDEN,
  COUNT,
  CAPTAIN,
  DECKHAND,
  SPIDER_QUEEN,
  WEB_SHOT,
  SILENT,
];
