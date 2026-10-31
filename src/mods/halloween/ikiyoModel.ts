// 👁️ What Ikiyö looks like: a giant shadow floating above the ground, with
// a cloak of smoke torn into rags, a bent spine and ribs showing through,
// and bony arms so long that the hooked claws nearly touch the ground. The
// bones, claws and smoke are living shapes (render/organicShapes.ts), not
// plain balls and cylinders. On top, a neck that is one long mouth: a dark
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
const BONE = 0xd9d2bf;
const OLD_BONE = 0xa89f88;
const HOLE = 0x020203;
const EYE = 0xff2a1a;

const SMOKE = 0x050508;
const EMBER = 0x7a0808;
/** A see-through, rippling shadow (the smoke shader). */
const smoke = (size: V, pos: V, more: Partial<ActorPart> = {}): ActorPart =>
  p(size, pos, SMOKE, { shader: 'smoke', rim: EMBER, alpha: 0.85, ...more });

/**
 * One very long arm: smoke round the shoulder, then bare bone with knobby
 * joints (one bone above the elbow, two below it), a bony hand and four
 * long jointed fingers ending in hooked claws.
 */
function arm(side: 1 | -1, move: PartMove): ActorPart[] {
  const x = 1.9 * side;
  const shoulder: V = [x, 8.6, -0.5];
  const swing = { move, pivot: shoulder };
  const bone = (size: V, pos: V, tilt: [number, number] = [0, 0], color = OLD_BONE) =>
    p(size, pos, color, { shape: 'bone', tilt, ...swing });
  const fingers: ActorPart[] = [];
  for (let i = 0; i < 4; i++) {
    const dz = -0.35 + i * 0.22;
    const fx = x + side * (0.3 + (i === 0 ? -0.15 : 0) + i * 0.02);
    const spread = side * (0.06 + i * 0.03);
    fingers.push(
      bone([0.14, 0.62, 0.13], [fx, 1.58, dz - 0.82], [0.15, spread], BONE),
      bone([0.13, 0.62, 0.12], [fx, 1.05, dz - 0.95], [0.45, spread]),
      bone([0.11, 0.48, 0.1], [fx, 0.62, dz - 1.12], [0.85, spread], BONE),
      p([0.11, 0.6, 0.11], [fx, 0.32, dz - 1.32], 0x1a1714, {
        shape: 'claw',
        tilt: [Math.PI + 0.6, spread],
        ...swing,
      }),
    );
  }
  return [
    smoke([1.25, 2.9, 1.25], [x + side * 0.1, 7.6, -0.5], { shape: 'blob', ...swing }),
    bone([0.44, 2.75, 0.38], [x + side * 0.2, 6.05, -0.5], [0, side * 0.04]),
    // Two bones from the elbow to the wrist, crossing a little.
    bone([0.32, 2.8, 0.28], [x + side * 0.16, 3.4, -0.62], [0.1, side * 0.05]),
    bone([0.27, 2.75, 0.24], [x + side * 0.38, 3.42, -0.74], [0.14, -side * 0.04], BONE),
    // The wrist and the back of the hand.
    p([0.6, 0.38, 0.48], [x + side * 0.28, 1.98, -0.82], OLD_BONE, { shape: 'blob', ...swing }),
    ...fingers,
    // Smoke dripping off the arm.
    smoke([0.5, 2.2, 0.5], [x + side * 0.35, 4.4, -0.2], {
      shape: 'tendril',
      tilt: [Math.PI, side * 0.2],
      alpha: 0.55,
      ...swing,
    }),
  ];
}

/** Red eyes all over its smoke, opening and closing (pulse) at their own pace. */
const BODY_EYES: readonly V[] = [
  [-0.7, 7.9, -1.05],
  [0.8, 6.9, -1.0],
  [-0.4, 5.6, -1.4],
  [1.1, 4.6, -1.55],
  [-1.3, 3.6, -1.6],
  [0.3, 2.6, -1.9],
  [-0.9, 1.5, -2.05],
];

export const IKIYO: ActorSpec = {
  id: 'ikiyo',
  width: 3.6,
  height: 12.5,
  speaker: true,
  motion: { float: 1.2, swing: 0.25, gait: 0.6 },
  parts: [
    // A body of living smoke, hunched forward: a long cloak torn at the hem, and shoulders.
    smoke([5.0, 8.8, 4.4], [0, 4.4, 0.2], { shape: 'cloak', alpha: 0.82 }),
    smoke([2.8, 4.3, 2.2], [0, 7.0, -0.25], { shape: 'blob', alpha: 0.7, tilt: [-0.25, 0] }),
    smoke([4.8, 2.0, 2.9], [0, 8.8, -0.45], { shape: 'blob', tilt: [-0.3, 0] }),
    // A bent spine of knobby vertebrae, collarbones and curved ribs round the front.
    ...Array.from({ length: 10 }, (_, i): ActorPart =>
      p([0.44, 0.3, 0.42], [0, 5.1 + i * 0.42, 0.55 - i * 0.12], OLD_BONE, {
        shape: 'vertebra',
        tilt: [-0.12 - i * 0.03, 0],
      }),
    ),
    ...[5.9, 6.4, 6.9, 7.4, 7.9].map((y, i) =>
      p([2.1 - Math.abs(i - 2) * 0.2, 0.14, 1.6], [0, y, 0.15 - i * 0.1], BONE, {
        shape: 'rib',
        tilt: [0.25, 0],
      }),
    ),
    p([0.2, 2.2, 0.16], [0, 6.9, -0.72], BONE, { shape: 'bone', tilt: [-0.25, 0] }),
    p([0.26, 1.9, 0.22], [0.85, 8.7, -0.72], BONE, { shape: 'bone', tilt: [0.1, -1.38] }),
    p([0.26, 1.9, 0.22], [-0.85, 8.7, -0.72], BONE, { shape: 'bone', tilt: [0.1, 1.38] }),
    // Its heart beats red behind the ribs.
    p([0.55, 0.6, 0.45], [0.25, 7.2, -0.3], 0xff1a10, {
      shape: 'blob',
      glow: true,
      flicker: true,
      move: 'pulse',
    }),
    // Eyes in the smoke.
    ...BODY_EYES.map((pos, i): ActorPart =>
      p([0.26, 0.16, 0.1], pos, EYE, {
        shape: 'sphere',
        glow: true,
        flicker: true,
        move: 'blink',
        phase: i * 1.9,
      }),
    ),
    // Strands of smoke hanging from its hem, waving.
    ...Array.from({ length: 14 }, (_, i): ActorPart => {
      const a = (i / 14) * Math.PI * 2;
      return smoke(
        [0.7, 3.8 + (i % 3) * 0.6, 0.7],
        [Math.sin(a) * 2.2, 0.3, Math.cos(a) * 1.9 + 0.2],
        {
          shape: 'tendril',
          tilt: [Math.PI + Math.cos(a) * 0.3, Math.sin(a) * 0.3],
          move: 'sway',
          phase: i * 1.3,
          alpha: 0.6,
        },
      );
    }),
    // Black flames rising from its back.
    ...[-1.3, -0.5, 0.3, 1.1].map((x, i): ActorPart =>
      smoke([0.9, 3.4 + (i % 2) * 0.9, 0.9], [x, 10.6, 0.7], {
        shape: 'tendril',
        tilt: [-0.5, -x * 0.2],
        move: 'sway',
        phase: i * 2.1,
        alpha: 0.55,
      }),
    ),
    // Where the long neck comes out (it leans forward too).
    smoke([1.9, 1.3, 1.7], [0, 9.6, -0.6], { shape: 'blob' }),
    p([1.3, 0.4, 1.3], [0, 9.9, -0.6], 0x161012, { shape: 'blob' }),
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
    // Long smoke hair hanging off its head.
    ...[-1.1, -0.4, 0.4, 1.1].map((x, i): ActorPart =>
      smoke([0.55, 2.8, 0.55], [x, 1.6, 1.15], {
        shape: 'tendril',
        tilt: [Math.PI + 0.25, x * 0.15],
        move: 'sway',
        phase: i * 1.7,
        alpha: 0.75,
      }),
    ),
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
    // A smoky tube: the fangs and the throat show through it.
    p([1.35, 2.5, 1.35], [0, 1.2, 0], 0x0a0608, {
      shape: 'cylinder',
      shader: 'smoke',
      rim: 0x8a0a0a,
      alpha: 0.95,
    }),
    // Bony hooks down the back.
    p([0.3, 0.6, 0.3], [0, 1.0, 0.62], 0x6a6050, { shape: 'claw', tilt: [-1.0, 0] }),
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
    p([0.16, 0.1, 0.06], [-0.18, 0.15, 0], EYE, { shape: 'sphere', glow: true, move: 'blink' }),
    p([0.16, 0.1, 0.06], [0.18, 0.15, 0], EYE, { shape: 'sphere', glow: true, move: 'blink' }),
  ],
};

/** A curtain of smoke left behind when it vanishes (it grows and thins out). */
export const PUFF: ActorSpec = {
  id: 'ikiyo-puff',
  width: 3,
  height: 6,
  parts: [
    smoke([3.2, 5.5, 3.2], [0, 2.8, 0], { shape: 'blob', alpha: 0.75 }),
    smoke([2.4, 3.4, 2.4], [0.6, 6.0, 0.3], { shape: 'blob', alpha: 0.6 }),
    smoke([2.2, 2.8, 2.2], [-0.8, 1.2, -0.4], { shape: 'blob', alpha: 0.6 }),
    smoke([1.2, 4.5, 1.2], [0.2, 8.0, 0], { shape: 'tendril', alpha: 0.45, move: 'sway' }),
  ],
};

const KIND_FACE: FaceSpec = {
  colors: {
    h: '#6a4a2a',
    w: '#ffffff',
    e: '#2a1a10',
    c: '#e89a8a',
    m: '#7a2a20',
    t: '#fff8f0',
  },
  rows: {
    normal: [
      'hhhhhhhh',
      'h......h',
      '.ww..ww.',
      '.we..ew.',
      '........',
      'c......c',
      '.m....m.',
      '..mmmm..',
    ],
    blink: [
      'hhhhhhhh',
      'h......h',
      '........',
      '.ee..ee.',
      '........',
      'c......c',
      '.m....m.',
      '..mmmm..',
    ],
    talk: [
      'hhhhhhhh',
      'h......h',
      '.ww..ww.',
      '.we..ew.',
      '........',
      'c......c',
      '..mttm..',
      '..mmmm..',
    ],
  },
};

/** The same face, gone wrong: black eyes with red pinpricks and a smile to the ears. */
const WRONG_FACE: FaceSpec = {
  colors: {
    h: '#3a2a1a',
    k: '#050303',
    r: '#ff2010',
    m: '#2a0404',
    t: '#efe6d4',
  },
  glow: 'r',
  rows: {
    normal: [
      'hhhhhhhh',
      'h......h',
      '.kk..kk.',
      '.kr..rk.',
      '.kk..kk.',
      'm......m',
      'mtmtmtmm',
      '.mmmmmm.',
    ],
    talk: [
      'hhhhhhhh',
      'h......h',
      '.kk..kk.',
      '.kr..rk.',
      '.kk..kk.',
      'mtmtmtmm',
      'mmmmmmmm',
      'mtmtmtmm',
    ],
  },
};

/** A friendly stranger: a long coat, a wide hat, a lantern and a wave. */
function strangerParts(wrong: boolean): ActorPart[] {
  const coat = wrong ? 0x221b16 : 0x5a4636;
  const skin = wrong ? 0xc9bdb0 : 0xe8c4a0;
  // When it goes wrong its arms hang down to its knees.
  const arm = wrong ? 1.15 : 0.72;
  const lantern = wrong
    ? p([0.2, 0.26, 0.2], [-0.44, 1.56 - arm - 0.12, -0.12], 0x1a1410, {
        move: 'armA',
        pivot: [-0.44, 1.6, 0],
      })
    : p([0.2, 0.26, 0.2], [-0.44, 1.56 - arm - 0.12, -0.12], 0xffc860, {
        glow: true,
        flicker: true,
        move: 'armA',
        pivot: [-0.44, 1.6, 0],
      });
  return [
    p([0.26, 0.9, 0.26], [-0.14, 0.45, 0], 0x2a2420, { move: 'legA' }),
    p([0.26, 0.9, 0.26], [0.14, 0.45, 0], 0x2a2420, { move: 'legB' }),
    // The coat, and its hem that sways as it walks.
    p([0.64, 0.8, 0.38], [0, 1.25, 0], coat),
    p([0.7, 0.5, 0.42], [0, 0.72, 0], coat, { move: 'sway' }),
    p([0.14, 0.5, 0.05], [0, 1.3, -0.2], wrong ? 0x3a0606 : 0xd8cfc0),
    // One arm holds the lantern…
    p([0.2, arm, 0.2], [-0.44, 1.6 - arm / 2, 0], coat, { move: 'armA' }),
    p([0.16, 0.16, 0.16], [-0.44, 1.6 - arm - 0.02, 0], skin, {
      move: 'armA',
      pivot: [-0.44, 1.6, 0],
    }),
    lantern,
    // …and the other waves at you (held up, or hanging when it goes wrong).
    wrong
      ? p([0.2, arm, 0.2], [0.44, 1.6 - arm / 2, 0], coat, { move: 'armB' })
      : p([0.2, 0.72, 0.2], [0.5, 1.98, 0], coat, { move: 'sway', pivot: [0.44, 1.62, 0] }),
    // The head, a little too high, with a wide hat.
    p([0.5, 0.5, 0.5], [0, 1.93, 0], skin, {
      face: wrong ? WRONG_FACE : KIND_FACE,
      move: 'head',
      tilt: wrong ? [0, 0.38] : undefined,
    }),
    p([0.86, 0.06, 0.86], [0, 2.2, 0], 0x2a2018),
    p([0.52, 0.28, 0.52], [0, 2.36, 0], 0x2a2018),
  ];
}

/** Before Ikiyö: a kind-looking stranger walks up to you, waving… */
export const STRANGER: ActorSpec = {
  id: 'ikiyo-stranger',
  width: 0.8,
  height: 2.5,
  speaker: true,
  motion: { gait: 1.4, swing: 0.45 },
  parts: strangerParts(false),
};

/** …and the same stranger when it starts to go wrong. */
export const STRANGER_WRONG: ActorSpec = {
  id: 'ikiyo-stranger-wrong',
  width: 0.8,
  height: 2.5,
  speaker: true,
  motion: { gait: 1.1, swing: 0.25, jerky: true },
  parts: strangerParts(true),
};
