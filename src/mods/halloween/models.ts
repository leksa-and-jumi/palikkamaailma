// What the Halloween characters look like: boxes like the creatures, but
// with pixel faces that blink, get angry and wince, and parts that move
// (see PartMove): legs and arms swing, capes wave, wings flap, jaws chatter.
// Glowing eyes and lanterns shine in the dark.

import type { ActorPart, ActorSpec, FaceSpec, PartMove } from '../types';
import { IKIYO, IKIYO_HEAD, MARK, NECK, WISP } from './ikiyoModel';

type V = [number, number, number];
const part = (
  size: V,
  pos: V,
  color: number,
  more: Partial<Omit<ActorPart, 'size' | 'pos' | 'color'>> = {},
): ActorPart => ({ size, pos, color, ...more });
const moving = (size: V, pos: V, color: number, move: PartMove, more: Partial<ActorPart> = {}) =>
  part(size, pos, color, { move, ...more });

// --- Faces (8×8, "." = the head's own colour) ------------------------------

const PUMPKIN_FACE: FaceSpec = {
  colors: { y: '#ffe25a', o: '#ff9a1a', k: '#2a1206' },
  glow: 'yo',
  rows: {
    normal: [
      '........',
      '.yy..yy.',
      '.yo..oy.',
      '........',
      '...yy...',
      'y.yyyy.y',
      '.yyyyyy.',
      '..y..y..',
    ],
    blink: [
      '........',
      '........',
      '.yy..yy.',
      '........',
      '...yy...',
      'y.yyyy.y',
      '.yyyyyy.',
      '..y..y..',
    ],
    angry: [
      'y......y',
      '.yy..yy.',
      '..yo.oy.',
      '........',
      '...yy...',
      'yyyyyyyy',
      'y.y..y.y',
      '.y.yy.y.',
    ],
    hurt: [
      '........',
      '.y....y.',
      '..y..y..',
      '.y....y.',
      '........',
      '..yyyy..',
      '.y....y.',
      '........',
    ],
    talk: [
      '........',
      '.yy..yy.',
      '.yo..oy.',
      '........',
      '...yy...',
      '.yyyyyy.',
      'yy....yy',
      '.yyyyyy.',
    ],
  },
};

const BOMB_FACE: FaceSpec = {
  colors: { y: '#ffe25a' },
  glow: 'y',
  rows: {
    normal: ['......', '.y..y.', '......', '.yyyy.', '..yy..', '......'],
    angry: ['y....y', '.y..y.', '......', 'yyyyyy', '.y..y.', '......'],
  },
};

const MAIDEN_FACE: FaceSpec = {
  colors: { b: '#7ad8ff', k: '#24304a', p: '#c8a8c8' },
  glow: 'b',
  rows: {
    normal: [
      'kkkkkkkk',
      'k......k',
      '.bb..bb.',
      '.bk..kb.',
      '........',
      '...pp...',
      '........',
      '........',
    ],
    blink: [
      'kkkkkkkk',
      'k......k',
      '........',
      '.bb..bb.',
      '........',
      '...pp...',
      '........',
      '........',
    ],
    angry: [
      'kkkkkkkk',
      'kb....bk',
      '.bb..bb.',
      '..b..b..',
      '........',
      '..kkkk..',
      '.k....k.',
      '..kkkk..',
    ],
    hurt: [
      'kkkkkkkk',
      'k......k',
      '.b....b.',
      '..b..b..',
      '........',
      '...kk...',
      '..k..k..',
      '...kk...',
    ],
    talk: [
      'kkkkkkkk',
      'k......k',
      '.bb..bb.',
      '.bk..kb.',
      '........',
      '...kk...',
      '...kk...',
      '........',
    ],
  },
};

const COUNT_FACE: FaceSpec = {
  colors: { k: '#111114', r: '#ff2a3a', w: '#ffffff', m: '#5a0a14', b: '#3a2a30' },
  glow: 'r',
  rows: {
    normal: [
      'kkkkkkkk',
      'kkk.kkkk',
      'b......b',
      '.rr..rr.',
      '........',
      '...bb...',
      '..mmmm..',
      '..w..w..',
    ],
    blink: [
      'kkkkkkkk',
      'kkk.kkkk',
      'b......b',
      '........',
      '.bb..bb.',
      '...bb...',
      '..mmmm..',
      '..w..w..',
    ],
    angry: [
      'kkkkkkkk',
      'kkk.kkkk',
      'bb....bb',
      '.rr..rr.',
      '..r..r..',
      '...bb...',
      '.mmmmmm.',
      '.w.ww.w.',
    ],
    hurt: [
      'kkkkkkkk',
      'kkk.kkkk',
      'b......b',
      '.r....r.',
      '..r..r..',
      '...bb...',
      '...mm...',
      '..m..m..',
    ],
    talk: [
      'kkkkkkkk',
      'kkk.kkkk',
      'b......b',
      '.rr..rr.',
      '........',
      '...bb...',
      '..mmmm..',
      '..wmmw..',
    ],
  },
};

/** Skulls: the jaw is its own part, so the face is only eyes and a nose. */
const SKULL_FACE = (eye: string): FaceSpec => ({
  colors: { k: '#1a1a1a', g: eye },
  glow: 'g',
  rows: {
    normal: [
      '........',
      '.kkk.kkk',
      '.kgk.kgk',
      '.kkk.kkk',
      '........',
      '...kk...',
      '...kk...',
      '........',
    ],
    angry: [
      '.k....k.',
      '..kk.kk.',
      '.kgk.kgk',
      '.kkk.kkk',
      '........',
      '...kk...',
      '...kk...',
      '........',
    ],
    hurt: [
      '........',
      '.k.k.k.k',
      '..k...k.',
      '.k.k.k.k',
      '........',
      '...kk...',
      '...kk...',
      '........',
    ],
  },
});

const SPIDER_FACE: FaceSpec = {
  colors: { r: '#ff2a2a', k: '#0a0408', f: '#d8c8e8' },
  glow: 'r',
  rows: {
    normal: [
      '........',
      '.r.rr.r.',
      '..r..r..',
      '.rr..rr.',
      '........',
      '..k..k..',
      '..f..f..',
      '........',
    ],
    blink: [
      '........',
      '.r.rr.r.',
      '..r..r..',
      '.kk..kk.',
      '........',
      '..k..k..',
      '..f..f..',
      '........',
    ],
    angry: [
      'r......r',
      '.r.rr.r.',
      '.rr..rr.',
      '.rr..rr.',
      '........',
      '.k....k.',
      '.f....f.',
      '........',
    ],
    hurt: [
      '........',
      '.k.kk.k.',
      '..r..r..',
      '.kk..kk.',
      '........',
      '..k..k..',
      '..f..f..',
      '........',
    ],
  },
};

const SILENT_FACE: FaceSpec = {
  colors: { w: '#ffffff', g: '#9a9aa8' },
  glow: 'w',
  rows: {
    normal: [
      '........',
      '........',
      '.ww..ww.',
      '.ww..ww.',
      '........',
      '........',
      '........',
      '........',
    ],
    blink: [
      '........',
      '........',
      '........',
      '.ww..ww.',
      '........',
      '........',
      '........',
      '........',
    ],
    angry: [
      '........',
      '.w....w.',
      '.ww..ww.',
      '..w..w..',
      '........',
      '..gggg..',
      '........',
      '........',
    ],
    hurt: [
      '........',
      '........',
      '.w....w.',
      '.w....w.',
      '........',
      '...gg...',
      '..g..g..',
      '........',
    ],
  },
};

// --- Characters ------------------------------------------------------------

export const PUMPKIN_KING: ActorSpec = {
  id: 'pumpkin-king',
  width: 0.9,
  height: 2.75,
  speaker: true,
  motion: { gait: 1.3, swing: 0.6 },
  parts: [
    // Long thin legs in striped stockings, and pointy shoes.
    moving([0.2, 0.85, 0.2], [-0.14, 0.43, 0], 0x1c1420, 'legA'),
    moving([0.2, 0.85, 0.2], [0.14, 0.43, 0], 0x1c1420, 'legB'),
    // Royal robe and belt.
    part([0.72, 0.95, 0.4], [0, 1.32, 0], 0x4a1f6a),
    part([0.74, 0.12, 0.42], [0, 0.98, 0], 0xf0c030),
    part([0.12, 0.12, 0.04], [0, 0.98, -0.22], 0xff4a2a, { glow: true }),
    part([0.36, 0.06, 0.03], [0, 1.6, -0.21], 0xf0c030),
    // The cape waves behind him.
    moving([0.86, 1.4, 0.06], [0, 1.08, 0.27], 0x2a0c3a, 'sway'),
    // Arms with vine-green gloves; the right one throws the bombs.
    moving([0.18, 0.78, 0.18], [-0.46, 1.38, 0], 0x4a1f6a, 'armA'),
    part([0.2, 0.18, 0.2], [-0.46, 0.94, 0], 0x3a6a18),
    moving([0.18, 0.78, 0.18], [0.46, 1.38, 0], 0x4a1f6a, 'armB'),
    // The pumpkin head with a carved, glowing face.
    moving([0.92, 0.8, 0.92], [0, 2.2, 0], 0xe87818, 'head', { face: PUMPKIN_FACE }),
    part([0.94, 0.7, 0.2], [0, 2.2, 0], 0xd06a10),
    part([0.12, 0.18, 0.12], [0, 2.69, 0], 0x3a6a18),
    // A golden crown with points.
    part([0.94, 0.1, 0.94], [0, 2.64, 0], 0xf0c030),
    ...[-0.36, 0, 0.36].map((x) => part([0.14, 0.18, 0.14], [x, 2.76, -0.36], 0xf0c030)),
    part([0.1, 0.1, 0.04], [0, 2.66, -0.48], 0xff3a5a, { glow: true }),
  ],
};

export const PUMPKIN_BOMB: ActorSpec = {
  id: 'pumpkin-bomb',
  width: 0.55,
  height: 0.6,
  motion: { bounce: true },
  parts: [
    part([0.5, 0.45, 0.5], [0, 0.25, 0], 0xe87818, { face: BOMB_FACE }),
    part([0.52, 0.4, 0.14], [0, 0.25, 0], 0xd06a10),
    part([0.06, 0.12, 0.06], [0, 0.53, 0], 0x3a2a18),
    part([0.08, 0.08, 0.08], [0, 0.62, 0], 0xffd040, { glow: true, flicker: true }),
  ],
};

export const MIST_MAIDEN: ActorSpec = {
  id: 'mist-maiden',
  width: 0.8,
  height: 2.3,
  speaker: true,
  motion: { float: 0.35 },
  parts: [
    // A long see-through dress whose hem waves like mist.
    part([0.7, 0.9, 0.5], [0, 1.05, 0], 0xdfe8f2, { alpha: 0.8 }),
    moving([0.9, 0.7, 0.62], [0, 0.4, 0], 0xcfdaea, 'sway', { alpha: 0.55 }),
    moving([1.0, 0.3, 0.7], [0, -0.05, 0], 0xc0cce0, 'sway', { alpha: 0.3, phase: 1.5 }),
    // Arms reaching out a little.
    moving([0.14, 0.7, 0.14], [-0.38, 1.3, 0], 0xeef3f8, 'armA', { alpha: 0.8, tilt: [-0.5, 0] }),
    moving([0.14, 0.7, 0.14], [0.38, 1.3, 0], 0xeef3f8, 'armB', { alpha: 0.8, tilt: [-0.5, 0] }),
    // Pale face, dark hair that flows down her back.
    moving([0.5, 0.5, 0.5], [0, 1.8, 0], 0xf4f7fa, 'head', { face: MAIDEN_FACE, alpha: 0.9 }),
    part([0.54, 0.14, 0.54], [0, 2.08, 0.01], 0x24304a),
    moving([0.54, 0.9, 0.1], [0, 1.6, 0.28], 0x24304a, 'sway', { phase: 0.7 }),
    part([0.1, 0.1, 0.04], [0.2, 2.04, -0.26], 0x7ad8ff, { glow: true }),
  ],
};

export const COUNT: ActorSpec = {
  id: 'count',
  width: 0.8,
  height: 2.45,
  speaker: true,
  motion: { gait: 1.2, swing: 0.45 },
  parts: [
    moving([0.22, 0.85, 0.22], [-0.14, 0.43, 0], 0x111114, 'legA'),
    moving([0.22, 0.85, 0.22], [0.14, 0.43, 0], 0x111114, 'legB'),
    // Black suit, white shirt, red bow and a medal.
    part([0.66, 0.95, 0.36], [0, 1.33, 0], 0x1a1a22),
    part([0.28, 0.6, 0.04], [0, 1.42, -0.19], 0xe8e8ee),
    part([0.22, 0.08, 0.05], [0, 1.68, -0.21], 0xb01020),
    part([0.1, 0.1, 0.04], [0.18, 1.3, -0.2], 0xf0c030, { glow: true }),
    moving([0.18, 0.8, 0.18], [-0.42, 1.4, 0], 0x1a1a22, 'armA'),
    moving([0.18, 0.8, 0.18], [0.42, 1.4, 0], 0x1a1a22, 'armB'),
    // A long red-lined cape, and its high collar spreads like bat wings.
    moving([0.9, 1.55, 0.06], [0, 1.0, 0.24], 0x8a0a14, 'sway'),
    moving([0.5, 0.62, 0.05], [-0.5, 1.92, 0.2], 0x1a1a22, 'wingL'),
    moving([0.5, 0.62, 0.05], [0.5, 1.92, 0.2], 0x1a1a22, 'wingR'),
    moving([0.48, 0.5, 0.48], [0, 2.1, 0], 0xe6dde0, 'head', { face: COUNT_FACE }),
    part([0.5, 0.16, 0.5], [0, 2.38, 0.01], 0x111114),
    part([0.5, 0.3, 0.08], [0, 2.18, 0.25], 0x111114),
  ],
};

/** Pirate skeletons: bony limbs, a coat, a chattering jaw and a cutlass. */
const pirate = (s: number, coat: number, hat: number | null, eye: string): ActorPart[] => {
  const bone = 0xdedbd0;
  const out: ActorPart[] = [
    moving([0.12 * s, 0.75 * s, 0.12 * s], [-0.12 * s, 0.38 * s, 0], bone, 'legA'),
    moving([0.12 * s, 0.75 * s, 0.12 * s], [0.12 * s, 0.38 * s, 0], bone, 'legB'),
    part([0.18 * s, 0.1 * s, 0.24 * s], [-0.12 * s, 0.05 * s, -0.04 * s], 0x2a1a10),
    part([0.18 * s, 0.1 * s, 0.24 * s], [0.12 * s, 0.05 * s, -0.04 * s], 0x2a1a10),
    // Coat with ribs showing through the gap.
    part([0.56 * s, 0.75 * s, 0.3 * s], [0, 1.12 * s, 0], coat),
    part([0.2 * s, 0.6 * s, 0.04 * s], [0, 1.12 * s, -0.16 * s], bone),
    ...[0.95, 1.1, 1.25].map((y) =>
      part([0.22 * s, 0.04 * s, 0.05 * s], [0, y * s, -0.18 * s], 0x6a6458),
    ),
    part([0.6 * s, 0.08 * s, 0.32 * s], [0, 0.78 * s, 0], 0x3a2a18),
    moving([0.12 * s, 0.7 * s, 0.12 * s], [-0.36 * s, 1.15 * s, 0], bone, 'armA'),
    // The sword arm.
    moving([0.12 * s, 0.7 * s, 0.12 * s], [0.36 * s, 1.15 * s, 0], bone, 'attack'),
    part([0.05 * s, 0.6 * s, 0.1 * s], [0.36 * s, 0.6 * s, -0.12 * s], 0xc8ccd4, {
      move: 'attack',
      pivot: [0.36 * s, 1.5 * s, 0],
    }),
    part([0.16 * s, 0.05 * s, 0.14 * s], [0.36 * s, 0.9 * s, -0.08 * s], 0xd0a030, {
      move: 'attack',
      pivot: [0.36 * s, 1.5 * s, 0],
    }),
    // The skull and its jaw.
    moving([0.46 * s, 0.4 * s, 0.46 * s], [0, 1.78 * s, 0], 0xe8e5da, 'head', {
      face: SKULL_FACE(eye),
    }),
    moving([0.36 * s, 0.1 * s, 0.36 * s], [0, 1.53 * s, -0.04 * s], 0xd8d4c8, 'jaw', {
      pivot: [0, 1.58 * s, 0.15 * s],
    }),
  ];
  if (hat !== null) {
    out.push(
      part([0.84 * s, 0.08 * s, 0.56 * s], [0, 2.02 * s, 0], hat),
      part([0.5 * s, 0.22 * s, 0.4 * s], [0, 2.15 * s, 0], hat),
      part([0.12 * s, 0.1 * s, 0.03 * s], [0, 2.15 * s, -0.21 * s], 0xe8e5da),
    );
  }
  return out;
};

export const CAPTAIN: ActorSpec = {
  id: 'captain',
  width: 0.8,
  height: 2.6,
  speaker: true,
  motion: { gait: 1.8, swing: 0.8, jerky: true },
  parts: [
    ...pirate(1.2, 0x8a1a1a, 0x16161c, '#60ffd0'),
    // Gold buttons and an epaulette.
    ...[1.05, 1.2, 1.35].map((y) => part([0.06, 0.06, 0.03], [0.2, y * 1.2, -0.19], 0xf0c030)),
    part([0.2, 0.06, 0.32], [-0.36, 1.86, 0], 0xf0c030),
  ],
};

export const DECKHAND: ActorSpec = {
  id: 'deckhand',
  width: 0.6,
  height: 1.9,
  motion: { gait: 2.2, swing: 0.9, jerky: true },
  parts: pirate(0.95, 0x2a4a8a, 0xb01a1a, '#60ffd0'),
};

export const SPIDER_QUEEN: ActorSpec = {
  id: 'spider-queen',
  width: 2,
  height: 1.4,
  speaker: true,
  motion: { gait: 2.4 },
  parts: [
    // The big abdomen breathes, with a glowing purple mark.
    moving([1.3, 0.85, 1.5], [0, 0.8, 0.5], 0x2a1030, 'pulse'),
    part([0.6, 0.06, 0.8], [0, 1.24, 0.5], 0xd0a8ff, { glow: true }),
    part([0.9, 0.7, 0.8], [0, 0.72, -0.6], 0x3a1840),
    // Head with many eyes and twitching fangs.
    moving([0.7, 0.55, 0.4], [0, 0.78, -1.1], 0x3a1840, 'head', { face: SPIDER_FACE }),
    moving([0.08, 0.2, 0.08], [-0.14, 0.42, -1.28], 0xd8c8e8, 'jaw', {
      pivot: [-0.14, 0.55, -1.25],
    }),
    moving([0.08, 0.2, 0.08], [0.14, 0.42, -1.28], 0xd8c8e8, 'jaw', { pivot: [0.14, 0.55, -1.25] }),
    // A silver crown.
    ...[-0.22, 0, 0.22].map((x) => part([0.1, 0.16, 0.1], [x, 1.12, -1.15], 0xd8d8e8)),
    // Eight legs that take turns.
    ...[-0.75, -0.35, 0.05, 0.45].flatMap((z, i): ActorPart[] => [
      moving([1.4, 0.1, 0.1], [-1.15, 0.6, z], 0x1a0a20, 'crawlL', { phase: i * 1.6 }),
      moving([1.4, 0.1, 0.1], [1.15, 0.6, z], 0x1a0a20, 'crawlR', { phase: i * 1.6 + Math.PI }),
    ]),
  ],
};

export const WEB_SHOT: ActorSpec = {
  id: 'web-shot',
  width: 0.5,
  height: 0.5,
  parts: [
    moving([0.5, 0.06, 0.06], [0, 0.25, 0], 0xf4f4f8, 'spin', { glow: true }),
    moving([0.06, 0.5, 0.06], [0, 0.25, 0], 0xf4f4f8, 'spin', { glow: true }),
    moving([0.06, 0.06, 0.5], [0, 0.25, 0], 0xf4f4f8, 'spin', { glow: true }),
    moving([0.36, 0.36, 0.02], [0, 0.25, 0], 0xe8e8f0, 'spin', { alpha: 0.4 }),
  ],
};

export const SILENT: ActorSpec = {
  id: 'silent',
  width: 0.7,
  height: 2.6,
  speaker: true,
  // It does not walk: it is just somewhere else when you look again.
  motion: { swing: 0 },
  parts: [
    part([0.2, 1.05, 0.2], [-0.12, 0.53, 0], 0x0a0a0e),
    part([0.2, 1.05, 0.2], [0.12, 0.53, 0], 0x0a0a0e),
    part([0.56, 1.0, 0.3], [0, 1.55, 0], 0x0e0e14),
    // Very long arms hanging down to the knees.
    moving([0.14, 1.25, 0.14], [-0.38, 1.4, 0], 0x0a0a0e, 'armA'),
    moving([0.14, 1.25, 0.14], [0.38, 1.4, 0], 0x0a0a0e, 'armB'),
    moving([0.46, 0.5, 0.46], [0, 2.3, 0], 0x0e0e14, 'head', { face: SILENT_FACE }),
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
  IKIYO,
  IKIYO_HEAD,
  NECK,
  WISP,
  MARK,
];
