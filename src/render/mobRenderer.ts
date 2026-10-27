// Blocky 3D models for animals, monsters and villagers, built from boxes
// with pixel faces drawn by code. Legs swing when they walk, they flash red
// when hurt, and a name tag shows when you look at them.

import * as THREE from 'three';
import { mulberry32 } from '../logic/noise';
import { MOB_TYPES, PERSONALITY_NAMES, type MobKind, type Personality } from '../logic/mobs';

type Vec3 = [number, number, number];
type Swing = 'legA' | 'legB' | 'armA' | 'armB' | 'tail' | 'none';

interface PartSpec {
  size: Vec3;
  /** Centre of the part, or the top of it for swinging parts. */
  pos: Vec3;
  color: number;
  /** A face picture on the front (-z) side. */
  face?: string;
  swing?: Swing;
  /** Fixed tilt (radians, x axis), e.g. zombie arms held forward. */
  tilt?: number;
  /** Fixed turn around z (spider legs). */
  roll?: number;
  /** White patches (cows). */
  spots?: boolean;
  /** A stronger pattern than the plain pixel noise. */
  pattern?: 'mottled' | 'stripes' | 'magma';
}

const FACE_PIXELS = 8;
const WALK_SPEED = 10;
const SWING = 0.8;
const SMOOTHING = 10;
const HURT_FLASH = 0.3;
const BABY_SCALE = 0.55;
const LABEL_WIDTH = 2.4;
const LABEL_HEIGHT = 0.6;
const MAX_PREDICT_TIME = 0.6;

// Faces drawn as rows of letters: k = black, w = white, r = red, p = pink, n = nose.
const FACES: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  pig: {
    rows: [
      '        ',
      ' wk  kw ',
      '        ',
      '  pppp  ',
      '  pkpk  ',
      '  pppp  ',
      '        ',
      '        ',
    ],
    colors: { k: '#222', w: '#fff', p: '#e88a9a' },
  },
  cow: {
    rows: [
      '        ',
      ' wk  kw ',
      '        ',
      '        ',
      '  pppp  ',
      '  pkpk  ',
      '  pppp  ',
      '        ',
    ],
    colors: { k: '#222', w: '#fff', p: '#d8b8a8' },
  },
  chicken: {
    rows: [
      '        ',
      ' k    k ',
      '        ',
      '  oooo  ',
      '  oooo  ',
      '   rr   ',
      '   rr   ',
      '        ',
    ],
    colors: { k: '#222', o: '#f0a020', r: '#d02020' },
  },
  sheep: {
    rows: [
      '        ',
      ' wk  kw ',
      '        ',
      '        ',
      '   pp   ',
      '        ',
      '        ',
      '        ',
    ],
    colors: { k: '#222', w: '#fff', p: '#e8b0b0' },
  },
  zombie: {
    rows: [
      '        ',
      '        ',
      ' kk  kk ',
      '        ',
      '        ',
      '  kkkk  ',
      '        ',
      '        ',
    ],
    colors: { k: '#16311a' },
  },
  skeleton: {
    rows: [
      '        ',
      ' kk  kk ',
      ' kk  kk ',
      '        ',
      '   kk   ',
      ' kkkkkk ',
      ' k k k  ',
      '        ',
    ],
    colors: { k: '#333' },
  },
  creeper: {
    rows: [
      '        ',
      ' kk  kk ',
      ' kk  kk ',
      '   kk   ',
      '  kkkk  ',
      '  kkkk  ',
      '  k  k  ',
      '        ',
    ],
    colors: { k: '#102a10' },
  },
  spider: {
    rows: [
      '        ',
      ' rr  rr ',
      ' rr  rr ',
      '  r  r  ',
      '        ',
      '  kkkk  ',
      '        ',
      '        ',
    ],
    colors: { r: '#e01010', k: '#000' },
  },
  snout: {
    rows: [
      '        ',
      '        ',
      ' kk  kk ',
      ' kk  kk ',
      '        ',
      '        ',
      '        ',
      '        ',
    ],
    colors: { k: '#7a3a44' },
  },
  muzzle: {
    rows: [
      '        ',
      '  kkkk  ',
      '  kkkk  ',
      '        ',
      '        ',
      '        ',
      '        ',
      '        ',
    ],
    colors: { k: '#222' },
  },
  wolf: {
    rows: [
      '        ',
      '        ',
      ' kw  wk ',
      ' kk  kk ',
      '        ',
      '        ',
      '        ',
      '        ',
    ],
    colors: { k: '#222', w: '#fff' },
  },
  fox: {
    rows: [
      '        ',
      '        ',
      ' wk  kw ',
      '        ',
      'ww    ww',
      'www  www',
      '        ',
      '        ',
    ],
    colors: { k: '#222', w: '#f6f2ea' },
  },
  rabbit: {
    rows: [
      '        ',
      '        ',
      ' wk  kw ',
      '        ',
      '   pp   ',
      '   ww   ',
      '        ',
      '        ',
    ],
    colors: { k: '#222', w: '#fff', p: '#e89aa8' },
  },
  cat: {
    rows: [
      '        ',
      '        ',
      ' gk  kg ',
      '        ',
      '   pp   ',
      '  w  w  ',
      '        ',
      '        ',
    ],
    colors: { k: '#111', g: '#7ac04a', p: '#e88a9a', w: '#fff' },
  },
  horse: {
    rows: [
      '        ',
      ' kk  kk ',
      '        ',
      '        ',
      '        ',
      '  kkkk  ',
      '  k  k  ',
      '        ',
    ],
    colors: { k: '#2a1a10' },
  },
  piglin: {
    rows: [
      '        ',
      '        ',
      ' wk  kw ',
      '        ',
      '        ',
      '  yy yy ',
      '        ',
      '        ',
    ],
    colors: { k: '#222', w: '#fff', y: '#f0e8c0' },
  },
  magma: {
    rows: [
      '        ',
      '        ',
      ' yy  yy ',
      ' yo  yo ',
      '        ',
      '  oooo  ',
      '        ',
      '        ',
    ],
    colors: { y: '#ffe060', o: '#ff7a10' },
  },
  villager: {
    rows: [
      '        ',
      '  kkkk  ',
      ' wg  gw ',
      '   nn   ',
      '   nn   ',
      '   nn   ',
      '  kkkk  ',
      '        ',
    ],
    colors: { k: '#5a3a1a', w: '#fff', g: '#2a7a2a', n: '#c88a60' },
  },
};

function humanoid(
  skin: number,
  shirt: number,
  pants: number,
  face: string,
  armTilt = 0,
  thin = false,
): PartSpec[] {
  const limb = thin ? 0.14 : 0.25;
  return [
    { size: [0.5, 0.5, 0.5], pos: [0, 1.65, 0], color: skin, face },
    { size: [0.5, 0.75, 0.25], pos: [0, 1.02, 0], color: shirt },
    {
      size: [limb, 0.7, limb],
      pos: [-0.37, 1.38, 0],
      color: thin ? skin : skin,
      swing: 'armA',
      tilt: armTilt,
    },
    {
      size: [limb, 0.7, limb],
      pos: [0.37, 1.38, 0],
      color: thin ? skin : skin,
      swing: 'armB',
      tilt: armTilt,
    },
    { size: [limb, 0.7, limb], pos: [-0.13, 0.65, 0], color: pants, swing: 'legA' },
    { size: [limb, 0.7, limb], pos: [0.13, 0.65, 0], color: pants, swing: 'legB' },
  ];
}

function quadruped(
  body: Vec3,
  bodyY: number,
  color: number,
  head: Vec3,
  headPos: Vec3,
  legH: number,
  legColor: number,
  face: string,
): PartSpec[] {
  const [bw, , bd] = body;
  const lx = bw / 2 - 0.12;
  const lz = bd / 2 - 0.14;
  return [
    { size: body, pos: [0, bodyY, 0], color },
    { size: head, pos: headPos, color, face },
    { size: [0.22, legH, 0.22], pos: [-lx, legH, -lz], color: legColor, swing: 'legA' },
    { size: [0.22, legH, 0.22], pos: [lx, legH, -lz], color: legColor, swing: 'legB' },
    { size: [0.22, legH, 0.22], pos: [-lx, legH, lz], color: legColor, swing: 'legB' },
    { size: [0.22, legH, 0.22], pos: [lx, legH, lz], color: legColor, swing: 'legA' },
  ];
}

/** A little box sticking out of the head (snouts, beaks, noses), with its own face. */
const box = (size: Vec3, pos: Vec3, color: number, more: Partial<PartSpec> = {}): PartSpec => ({
  size,
  pos,
  color,
  ...more,
});

const MODELS: Record<MobKind, PartSpec[]> = {
  pig: [
    ...quadruped(
      [0.62, 0.5, 0.9],
      0.55,
      0xf0a8b4,
      [0.5, 0.48, 0.45],
      [0, 0.72, -0.6],
      0.32,
      0xe090a0,
      'pig',
    ),
    box([0.26, 0.18, 0.08], [0, 0.66, -0.86], 0xf4b8c2, { face: 'snout' }),
    box([0.08, 0.08, 0.12], [0, 0.72, 0.48], 0xe090a0, { swing: 'tail', tilt: -0.6 }),
  ],
  cow: [
    ...quadruped(
      [0.8, 0.7, 1.15],
      0.95,
      0x4a3426,
      [0.5, 0.5, 0.4],
      [0, 1.25, -0.72],
      0.6,
      0x3a2a1e,
      'cow',
    ).map((p, i) => (i === 0 ? { ...p, spots: true } : p)),
    { size: [0.1, 0.18, 0.1], pos: [-0.28, 1.56, -0.72], color: 0xe8e0d0 },
    { size: [0.1, 0.18, 0.1], pos: [0.28, 1.56, -0.72], color: 0xe8e0d0 },
    box([0.3, 0.16, 0.08], [0, 1.12, -0.96], 0xd8b8a8, { face: 'snout' }),
    box([0.26, 0.14, 0.3], [0, 0.56, 0.22], 0xf0b0b8),
    box([0.08, 0.5, 0.08], [0, 1.25, 0.6], 0x3a2a1e, { swing: 'tail' }),
  ],
  chicken: [
    { size: [0.38, 0.36, 0.5], pos: [0, 0.5, 0], color: 0xf4f4f0 },
    { size: [0.26, 0.36, 0.22], pos: [0, 0.82, -0.28], color: 0xf4f4f0, face: 'chicken' },
    box([0.2, 0.08, 0.12], [0, 0.82, -0.44], 0xf0a020),
    box([0.08, 0.12, 0.06], [0, 0.72, -0.42], 0xd02020),
    { size: [0.06, 0.3, 0.06], pos: [-0.09, 0.3, 0], color: 0xe8b030, swing: 'legA' },
    { size: [0.06, 0.3, 0.06], pos: [0.09, 0.3, 0], color: 0xe8b030, swing: 'legB' },
    { size: [0.06, 0.24, 0.36], pos: [-0.22, 0.55, 0.02], color: 0xe8e8e2 },
    { size: [0.06, 0.24, 0.36], pos: [0.22, 0.55, 0.02], color: 0xe8e8e2 },
    box([0.24, 0.24, 0.1], [0, 0.6, 0.28], 0xe8e8e2, { tilt: -0.5 }),
  ],
  sheep: [
    ...quadruped(
      [0.86, 0.74, 1.15],
      0.9,
      0xf2f2ee,
      [0.36, 0.38, 0.36],
      [0, 1.12, -0.7],
      0.55,
      0xd8c8b8,
      'sheep',
    ).map((p, i) =>
      i === 1 ? { ...p, color: 0xd8c8b8 } : i === 0 ? { ...p, pattern: 'mottled' as const } : p,
    ),
    box([0.42, 0.18, 0.3], [0, 1.32, -0.66], 0xf2f2ee, { pattern: 'mottled' }),
  ],
  zombie: humanoid(0x5d9b4a, 0x2f8f9a, 0x3c3c8c, 'zombie', -Math.PI / 2),
  skeleton: humanoid(0xd8d8d0, 0xc8c8c0, 0xc0c0b8, 'skeleton', -Math.PI / 2.5, true),
  creeper: [
    {
      size: [0.5, 0.5, 0.5],
      pos: [0, 1.45, 0],
      color: 0x58b048,
      face: 'creeper',
      pattern: 'mottled',
    },
    { size: [0.5, 0.75, 0.3], pos: [0, 0.82, 0], color: 0x4ea040, pattern: 'mottled' },
    { size: [0.24, 0.42, 0.24], pos: [-0.13, 0.42, -0.2], color: 0x48983a, swing: 'legA' },
    { size: [0.24, 0.42, 0.24], pos: [0.13, 0.42, -0.2], color: 0x48983a, swing: 'legB' },
    { size: [0.24, 0.42, 0.24], pos: [-0.13, 0.42, 0.2], color: 0x48983a, swing: 'legB' },
    { size: [0.24, 0.42, 0.24], pos: [0.13, 0.42, 0.2], color: 0x48983a, swing: 'legA' },
  ],
  spider: [
    { size: [0.7, 0.5, 0.85], pos: [0, 0.55, 0.25], color: 0x2a2420 },
    { size: [0.55, 0.45, 0.5], pos: [0, 0.55, -0.4], color: 0x2a2420, face: 'spider' },
    ...[-0.3, -0.1, 0.1, 0.3].flatMap((z, i): PartSpec[] => [
      {
        size: [0.9, 0.08, 0.08],
        pos: [-0.55, 0.55, z],
        color: 0x1e1a18,
        roll: 0.5,
        swing: i % 2 ? 'legA' : 'legB',
      },
      {
        size: [0.9, 0.08, 0.08],
        pos: [0.55, 0.55, z],
        color: 0x1e1a18,
        roll: -0.5,
        swing: i % 2 ? 'legB' : 'legA',
      },
    ]),
  ],
  wolf: [
    ...quadruped(
      [0.42, 0.42, 0.8],
      0.58,
      0xd9d3cc,
      [0.4, 0.36, 0.32],
      [0, 0.78, -0.55],
      0.38,
      0xcfc8c0,
      'wolf',
    ),
    box([0.2, 0.16, 0.2], [0, 0.7, -0.8], 0xe8e2da, { face: 'muzzle' }),
    box([0.1, 0.12, 0.06], [-0.12, 1.0, -0.55], 0xb8b0a8),
    box([0.1, 0.12, 0.06], [0.12, 1.0, -0.55], 0xb8b0a8),
    box([0.5, 0.46, 0.3], [0, 0.62, -0.25], 0xe6e0d8, { pattern: 'mottled' }),
    box([0.1, 0.1, 0.42], [0, 0.72, 0.5], 0xcfc8c0, { swing: 'tail', tilt: 0.5 }),
  ],
  fox: [
    ...quadruped(
      [0.36, 0.34, 0.7],
      0.42,
      0xe0782c,
      [0.4, 0.32, 0.3],
      [0, 0.56, -0.5],
      0.26,
      0x2a221e,
      'fox',
    ),
    box([0.16, 0.12, 0.16], [0, 0.48, -0.72], 0xf2efe8, { face: 'muzzle' }),
    box([0.1, 0.14, 0.05], [-0.12, 0.78, -0.52], 0x2a221e),
    box([0.1, 0.14, 0.05], [0.12, 0.78, -0.52], 0x2a221e),
    box([0.2, 0.2, 0.5], [0, 0.42, 0.55], 0xe0782c, { swing: 'tail', tilt: 0.3 }),
    box([0.2, 0.2, 0.14], [0, 0.32, 0.86], 0xf6f2ea),
  ],
  rabbit: [
    box([0.3, 0.28, 0.4], [0, 0.22, 0], 0x9a7a5a),
    box([0.26, 0.24, 0.22], [0, 0.4, -0.22], 0x9a7a5a, { face: 'rabbit' }),
    box([0.07, 0.26, 0.04], [-0.07, 0.64, -0.2], 0x8a6a4a),
    box([0.07, 0.26, 0.04], [0.07, 0.64, -0.2], 0x8a6a4a),
    box([0.12, 0.12, 0.08], [0, 0.28, 0.22], 0xf4f0ea),
    box([0.08, 0.1, 0.08], [-0.1, 0.1, -0.12], 0x8a6a4a, { swing: 'legA' }),
    box([0.08, 0.1, 0.08], [0.1, 0.1, -0.12], 0x8a6a4a, { swing: 'legB' }),
    box([0.1, 0.1, 0.18], [-0.11, 0.1, 0.12], 0x8a6a4a, { swing: 'legB' }),
    box([0.1, 0.1, 0.18], [0.11, 0.1, 0.12], 0x8a6a4a, { swing: 'legA' }),
  ],
  cat: [
    ...quadruped(
      [0.3, 0.3, 0.7],
      0.42,
      0xe0a050,
      [0.34, 0.3, 0.28],
      [0, 0.58, -0.46],
      0.28,
      0xd89040,
      'cat',
    ).map((p, i) => (i === 0 ? { ...p, pattern: 'stripes' as const } : p)),
    box([0.08, 0.1, 0.06], [-0.1, 0.78, -0.46], 0xd89040),
    box([0.08, 0.1, 0.06], [0.1, 0.78, -0.46], 0xd89040),
    box([0.07, 0.07, 0.5], [0, 0.55, 0.5], 0xe0a050, {
      swing: 'tail',
      tilt: 0.7,
      pattern: 'stripes',
    }),
  ],
  horse: [
    ...quadruped(
      [0.7, 0.7, 1.4],
      1.25,
      0x8a5a36,
      [0.32, 0.32, 0.62],
      [0, 2.05, -0.92],
      0.92,
      0x6a4428,
      'horse',
    ),
    box([0.32, 0.7, 0.36], [0, 1.66, -0.66], 0x8a5a36, { tilt: 0.5 }),
    box([0.08, 0.66, 0.3], [0, 1.84, -0.54], 0x2a1a10, { tilt: 0.5 }),
    box([0.08, 0.14, 0.06], [-0.1, 2.28, -0.74], 0x6a4428),
    box([0.08, 0.14, 0.06], [0.1, 2.28, -0.74], 0x6a4428),
    box([0.14, 0.6, 0.14], [0, 1.5, 0.72], 0x2a1a10, { swing: 'tail', tilt: 0.4 }),
  ],
  piglin: [
    ...humanoid(0xe8a0a0, 0x6a4a2a, 0x3a2a1a, 'piglin', -0.3),
    box([0.24, 0.16, 0.08], [0, 1.56, -0.29], 0xf0b0b0, { face: 'snout' }),
    box([0.06, 0.18, 0.14], [-0.28, 1.72, 0], 0xd88a8a),
    box([0.06, 0.18, 0.14], [0.28, 1.72, 0], 0xd88a8a),
    box([0.52, 0.08, 0.27], [0, 0.82, 0], 0xf0c030),
  ],
  magma_cube: [box([0.9, 0.9, 0.9], [0, 0.45, 0], 0x5a1c10, { face: 'magma', pattern: 'magma' })],
  villager: [
    { size: [0.5, 0.58, 0.5], pos: [0, 1.66, 0], color: 0xc89a78, face: 'villager' },
    box([0.12, 0.22, 0.12], [0, 1.56, -0.3], 0xc08a68),
    { size: [0.52, 0.9, 0.32], pos: [0, 0.95, 0], color: 0x7a5232, pattern: 'mottled' },
    { size: [0.6, 0.22, 0.24], pos: [0, 1.15, -0.2], color: 0x6a4428 },
    { size: [0.24, 0.55, 0.24], pos: [-0.13, 0.55, 0], color: 0x5a3e24, swing: 'legA' },
    { size: [0.24, 0.55, 0.24], pos: [0.13, 0.55, 0], color: 0x5a3e24, swing: 'legB' },
  ],
};

let noiseTexture: THREE.Texture | null = null;

/** A grey pixel-noise picture, tinted by each part's colour. */
function pixelNoise(): THREE.Texture {
  if (noiseTexture) return noiseTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  const random = mulberry32(99);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = 200 + Math.floor(random() * 55);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  noiseTexture = new THREE.CanvasTexture(canvas);
  noiseTexture.magFilter = THREE.NearestFilter;
  noiseTexture.colorSpace = THREE.SRGBColorSpace;
  return noiseTexture;
}

const patternCache = new Map<string, THREE.Texture>();

/** Creeper skin, sheep wool, cat stripes and magma cracks, tinted by the part's colour. */
function patternTexture(pattern: 'mottled' | 'stripes' | 'magma'): THREE.Texture {
  let texture = patternCache.get(pattern);
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const random = mulberry32(pattern.length * 31);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let v = 210 + Math.floor(random() * 45);
      if (pattern === 'mottled') v = 150 + Math.floor(random() * 105);
      if (pattern === 'stripes' && x % 5 < 2) v = 130;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      if (pattern === 'magma') {
        const crack = (x + y * 3) % 7 === 0 || (x * 5 + y) % 11 === 0;
        ctx.fillStyle = crack ? 'rgb(255,190,80)' : `rgb(${v - 60},${v - 80},${v - 80})`;
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }
  texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  patternCache.set(pattern, texture);
  return texture;
}

let shadowTexture: THREE.Texture | null = null;

/** A soft dark round blob under every creature (like Minecraft). */
export function shadowMesh(width: number): THREE.Mesh {
  if (!shadowTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    shadowTexture = new THREE.CanvasTexture(canvas);
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.4, width * 1.4),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  return mesh;
}

const spotCache = new Map<number, THREE.Texture>();

/** Dark patches on white: the dark colour is the part's colour. */
function spotsWithBase(dark: number): THREE.Texture {
  let texture = spotCache.get(dark);
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2eee6';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = `#${dark.toString(16).padStart(6, '0')}`;
  const random = mulberry32(7);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(random() * 13);
    const y = Math.floor(random() * 13);
    ctx.fillRect(x, y, 3 + Math.floor(random() * 4), 2 + Math.floor(random() * 4));
  }
  texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  spotCache.set(dark, texture);
  return texture;
}

const faceCache = new Map<string, THREE.Texture>();

function faceTexture(name: string, base: number): THREE.Texture {
  const key = `${name}:${base}`;
  let texture = faceCache.get(key);
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FACE_PIXELS;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `#${base.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, FACE_PIXELS, FACE_PIXELS);
  const face = FACES[name]!;
  face.rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const color = face.colors[c];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(key, texture);
  return texture;
}

function labelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(4, 8, 248, 48, 14);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33, 240);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface MobView {
  id: string;
  kind: MobKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  baby: boolean;
  hurt: boolean;
  fuse: boolean;
  name: string;
  personality: Personality;
  /** Remote creatures move smoothly towards their latest position. */
  remote: boolean;
}

interface Model {
  group: THREE.Group;
  swings: { mesh: THREE.Object3D; kind: Swing }[];
  materials: THREE.MeshLambertMaterial[];
  label: THREE.Sprite;
  labelText: string;
  walk: number;
  hurtTime: number;
  target: THREE.Vector3;
  velocity: THREE.Vector3;
  predicted: number;
  last: THREE.Vector3;
  lastTime: number;
}

export class MobRenderer {
  private readonly models = new Map<string, Model>();
  private readonly arrows = new Map<number, THREE.Mesh>();
  private readonly arrowGeometry = new THREE.BoxGeometry(0.06, 0.06, 0.6);
  private readonly arrowMaterial = new THREE.MeshLambertMaterial({ color: 0x8a6a40 });
  /** The creature under the crosshair shows its name tag. */
  highlighted: string | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  private build(view: MobView): Model {
    const group = new THREE.Group();
    const swings: Model['swings'] = [];
    const materials: THREE.MeshLambertMaterial[] = [];
    for (const part of MODELS[view.kind]) {
      const material = part.spots
        ? new THREE.MeshLambertMaterial({ map: spotsWithBase(part.color) })
        : new THREE.MeshLambertMaterial({
            color: part.color,
            map: part.pattern ? patternTexture(part.pattern) : pixelNoise(),
          });
      materials.push(material);
      let mats: THREE.Material | THREE.Material[] = material;
      if (part.face) {
        const face = new THREE.MeshLambertMaterial({ map: faceTexture(part.face, part.color) });
        materials.push(face);
        mats = [material, material, material, material, material, face];
      }
      const geometry = new THREE.BoxGeometry(...part.size);
      const swinging = part.swing && part.swing !== 'none';
      // Legs and arms turn around their top end (spider legs around their middle).
      if (swinging && !part.roll) geometry.translate(0, -part.size[1] / 2, 0);
      const mesh = new THREE.Mesh(geometry, mats);
      mesh.position.set(...part.pos);
      if (part.tilt) mesh.rotation.x = part.tilt;
      mesh.userData.tilt = part.tilt ?? 0;
      if (part.roll) mesh.rotation.z = part.roll;
      group.add(mesh);
      if (swinging) swings.push({ mesh, kind: part.swing! });
    }
    group.add(shadowMesh(MOB_TYPES[view.kind].body.width));
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({ depthTest: false, transparent: true }),
    );
    label.scale.set(LABEL_WIDTH, LABEL_HEIGHT, 1);
    label.position.y = MOB_TYPES[view.kind].body.height + 0.5;
    label.visible = false;
    group.add(label);
    this.scene.add(group);
    const at = new THREE.Vector3(view.x, view.y, view.z);
    return {
      group,
      swings,
      materials,
      label,
      labelText: '',
      walk: 0,
      hurtTime: Infinity,
      target: at.clone(),
      velocity: new THREE.Vector3(),
      predicted: 0,
      last: at.clone(),
      lastTime: performance.now(),
    };
  }

  /** Makes the scene match the creatures, then animates them. */
  sync(views: Iterable<MobView>, dt: number): void {
    const seen = new Set<string>();
    const now = performance.now();
    for (const v of views) {
      seen.add(v.id);
      let m = this.models.get(v.id);
      if (!m) {
        m = this.build(v);
        this.models.set(v.id, m);
        m.group.position.set(v.x, v.y, v.z);
      }
      if (v.remote) {
        // New remote position: work out a speed so movement looks smooth in between.
        if (m.last.x !== v.x || m.last.y !== v.y || m.last.z !== v.z) {
          const seconds = Math.max(0.05, (now - m.lastTime) / 1000);
          const next = new THREE.Vector3(v.x, v.y, v.z);
          m.velocity.copy(next).sub(m.last).divideScalar(seconds).clampLength(0, 12);
          // Only guess sideways: guessing a jump left creatures floating.
          m.velocity.y = 0;
          m.last.copy(next);
          m.lastTime = now;
          m.target.copy(next);
          m.predicted = 0;
        } else if (m.predicted < MAX_PREDICT_TIME) {
          m.target.addScaledVector(m.velocity, dt);
          m.predicted += dt;
        }
        m.group.position.lerp(m.target, 1 - Math.exp(-SMOOTHING * dt));
      } else {
        // Your own creatures: speed from how far they moved this frame (for the legs).
        if (dt > 0) {
          m.velocity.set((v.x - m.group.position.x) / dt, 0, (v.z - m.group.position.z) / dt);
        }
        m.target.set(v.x, v.y, v.z);
        m.group.position.copy(m.target);
      }
      let dy = v.yaw - m.group.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      m.group.rotation.y += dy * (1 - Math.exp(-SMOOTHING * dt));
      m.group.scale.setScalar(v.baby ? BABY_SCALE : 1);

      // Legs swing with walking speed.
      const speed = Math.hypot(m.velocity.x, m.velocity.z) || 0;
      const moving = v.remote ? speed : Math.min(1, speed);
      m.walk += dt * WALK_SPEED * Math.min(1, moving + 0.0001);
      for (const { mesh, kind } of m.swings) {
        const s = Math.sin(m.walk) * SWING * Math.min(1, moving);
        if (kind === 'legA' || kind === 'armB') mesh.rotation.x = s + (mesh.userData.tilt ?? 0);
        else if (kind === 'legB' || kind === 'armA')
          mesh.rotation.x = -s + (mesh.userData.tilt ?? 0);
        // Tails wag all the time, faster when walking.
        else if (kind === 'tail') mesh.rotation.y = Math.sin(now / 160 + m.walk) * 0.35;
      }

      // Red flash when hurt, white blinking when a creeper is about to explode.
      if (v.hurt) m.hurtTime = 0;
      m.hurtTime += dt;
      const flash = m.hurtTime < HURT_FLASH ? 0.6 : v.fuse && Math.floor(now / 150) % 2 ? 0.8 : 0;
      for (const mat of m.materials) {
        mat.emissive.setRGB(flash, v.fuse ? flash : 0, v.fuse ? flash : 0);
      }

      const type = MOB_TYPES[v.kind];
      const hearts = `❤️${Math.ceil(v.health / 2)}`;
      const text = `${type.emoji} ${v.name} · ${PERSONALITY_NAMES[v.personality]} ${hearts}`;
      m.label.visible = this.highlighted === v.id;
      if (m.label.visible && text !== m.labelText) {
        m.labelText = text;
        m.label.material.map?.dispose();
        m.label.material.map = labelTexture(text);
        m.label.material.needsUpdate = true;
      }
    }
    for (const [id, m] of this.models) {
      if (seen.has(id)) continue;
      this.scene.remove(m.group);
      m.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const mat of m.materials) mat.dispose();
      this.models.delete(id);
    }
  }

  /** Skeleton arrows in flight. */
  syncArrows(
    arrows: readonly {
      id: number;
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
    }[],
  ): void {
    const seen = new Set<number>();
    for (const a of arrows) {
      seen.add(a.id);
      let mesh = this.arrows.get(a.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.arrowGeometry, this.arrowMaterial);
        this.scene.add(mesh);
        this.arrows.set(a.id, mesh);
      }
      mesh.position.set(a.x, a.y, a.z);
      mesh.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz);
    }
    for (const [id, mesh] of this.arrows) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.arrows.delete(id);
    }
  }

  clear(): void {
    this.sync([], 0);
    this.syncArrows([]);
  }
}
