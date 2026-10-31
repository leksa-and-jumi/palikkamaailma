// The players' looks, painted pixel by pixel like Minecraft skins (at twice
// Minecraft's resolution, so faces can have real expressions). Everyone is a
// blocky Minecraft-style kid in an animal costume: the fox wears a fox hood
// with ears and a tail, the frog has eyes on its hood, and so on. The
// animal stays the player's identity (no names or photos, ever).
//
// A skin is one small canvas (an atlas); every box face of the model gets
// its own rectangle there. Expressions only redraw the face rectangle.

import * as THREE from 'three';

/** Texture pixels per Minecraft pixel. */
export const RES = 2;

export type Side = 'right' | 'left' | 'top' | 'bottom' | 'back' | 'front';
/** BoxGeometry's face order (+x, -x, +y, -y, +z, -z); the model looks towards -z. */
export const SIDES: readonly Side[] = ['right', 'left', 'top', 'bottom', 'back', 'front'];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sizes are in Minecraft pixels (a player is 32 high). */
export type Size = [number, number, number];

/** Where each side of each box is in the atlas. */
export class Atlas {
  readonly canvas = document.createElement('canvas');
  readonly regions = new Map<string, Record<Side, Rect>>();
  private cursorX = 0;
  private cursorY = 0;
  private rowHeight = 0;

  constructor(readonly width: number) {
    this.canvas.width = width;
    this.canvas.height = 8;
  }

  /** Makes room for a box (all six sides next to each other). */
  add(name: string, [w, h, d]: Size): Record<Side, Rect> {
    const W = w * RES;
    const H = h * RES;
    const D = d * RES;
    const sizes: Record<Side, [number, number]> = {
      right: [D, H],
      left: [D, H],
      top: [W, D],
      bottom: [W, D],
      back: [W, H],
      front: [W, H],
    };
    const out = {} as Record<Side, Rect>;
    for (const side of SIDES) {
      const [rw, rh] = sizes[side];
      if (this.cursorX + rw > this.width) {
        this.cursorX = 0;
        this.cursorY += this.rowHeight;
        this.rowHeight = 0;
      }
      out[side] = { x: this.cursorX, y: this.cursorY, w: rw, h: rh };
      this.cursorX += rw;
      this.rowHeight = Math.max(this.rowHeight, rh);
    }
    this.regions.set(name, out);
    return out;
  }

  /** Call when every box is added: makes the canvas tall enough. */
  finish(): CanvasRenderingContext2D {
    const height = 2 ** Math.ceil(Math.log2(this.cursorY + this.rowHeight));
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  /** A box whose sides show their rectangles of this atlas. */
  geometry(name: string, [w, h, d]: Size, unit: number, inflate = 0): THREE.BoxGeometry {
    const regions = this.regions.get(name)!;
    const g = new THREE.BoxGeometry(
      (w + inflate) * unit,
      (h + inflate) * unit,
      (d + inflate) * unit,
    );
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const W = this.canvas.width;
    const H = this.canvas.height;
    SIDES.forEach((side, face) => {
      const r = regions[side];
      // Each face has 4 corners: top-left, top-right, bottom-left, bottom-right.
      const corners: [number, number][] = [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x, r.y + r.h],
        [r.x + r.w, r.y + r.h],
      ];
      corners.forEach(([px, py], i) => uv.setXY(face * 4 + i, px / W, 1 - py / H));
    });
    uv.needsUpdate = true;
    return g;
  }
}

// --- Painting helpers --------------------------------------------------------

/** A small random number that is the same every time for the same place. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function shade(color: number, k: number): string {
  const r = Math.max(0, Math.min(255, ((color >> 16) & 255) * k));
  const g = Math.max(0, Math.min(255, ((color >> 8) & 255) * k));
  const b = Math.max(0, Math.min(255, (color & 255) * k));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Fills a rectangle with a colour that has gentle pixel noise and darker edges. */
export function fabric(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  color: number,
  { noise = 0.07, edge = 0.86, seed = 1 } = {},
): void {
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      let k = 1 + (hash(r.x + x, r.y + y, seed) - 0.5) * 2 * noise;
      if (x === 0 || y === 0 || x === r.w - 1 || y === r.h - 1) k *= edge;
      ctx.fillStyle = shade(color, k);
      ctx.fillRect(r.x + x, r.y + y, 1, 1);
    }
  }
}

/** Paints rows of letters into a rectangle ("." leaves it as it is). */
export function pixels(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  rows: readonly string[],
  colors: Readonly<Record<string, string>>,
  ox = 0,
  oy = 0,
): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const c = colors[ch];
      if (!c) return;
      ctx.fillStyle = c;
      ctx.fillRect(r.x + ox + x, r.y + oy + y, 1, 1);
    });
  });
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

// --- The characters ----------------------------------------------------------

export type Ears = 'pointy' | 'round' | 'long' | 'floppy' | 'none';
export type Extra = 'frogEyes' | 'snout' | 'mane' | 'beak' | 'spikes' | 'tentacles' | 'patches';

export interface Look {
  /** The costume (hood, hoodie, sleeves). */
  suit: number;
  /** Tummy patch and inside of the ears. */
  belly: number;
  /** Darker costume parts (ear tips, cuffs). */
  dark: number;
  skin: number;
  hair: number;
  eyes: number;
  pants: number;
  shoes: number;
  ears: Ears;
  tail: 'fox' | 'bear' | 'curly' | 'puff' | 'lion' | 'dino' | 'none';
  extras: readonly Extra[];
}

export const LOOKS: Readonly<Record<string, Look>> = {
  '🦊': {
    suit: 0xe8782a,
    belly: 0xf6efe4,
    dark: 0x3a2a24,
    skin: 0xf1c7a3,
    hair: 0x8a3e1a,
    eyes: 0x3f8f4a,
    pants: 0x4a3a32,
    shoes: 0x2a2224,
    ears: 'pointy',
    tail: 'fox',
    extras: [],
  },
  '🐻': {
    suit: 0x8b5a2b,
    belly: 0xd8b48a,
    dark: 0x5a381a,
    skin: 0xe8b890,
    hair: 0x4a2a14,
    eyes: 0x6a3a1a,
    pants: 0x3a4a6a,
    shoes: 0x2a2a2a,
    ears: 'round',
    tail: 'bear',
    extras: [],
  },
  '🐼': {
    suit: 0xf2f2ee,
    belly: 0xffffff,
    dark: 0x1e1e22,
    skin: 0xf3d2b6,
    hair: 0x2a2a2a,
    eyes: 0x3a3a3a,
    pants: 0x1e1e22,
    shoes: 0x1e1e22,
    ears: 'round',
    tail: 'bear',
    extras: ['patches'],
  },
  '🐸': {
    suit: 0x4caf50,
    belly: 0xc8e6a0,
    dark: 0x2e7a32,
    skin: 0xe9c09a,
    hair: 0x5a3a22,
    eyes: 0x2a7ac0,
    pants: 0x2e5a7a,
    shoes: 0x1e3a22,
    ears: 'none',
    tail: 'none',
    extras: ['frogEyes'],
  },
  '🐷': {
    suit: 0xf4a7b9,
    belly: 0xffd0dc,
    dark: 0xd4788e,
    skin: 0xf6d2b8,
    hair: 0xb8784a,
    eyes: 0x4a7ac8,
    pants: 0x6a4a8a,
    shoes: 0x3a2a3a,
    ears: 'floppy',
    tail: 'curly',
    extras: ['snout'],
  },
  '🐰': {
    suit: 0xe4ddd4,
    belly: 0xffffff,
    dark: 0xf2a8b8,
    skin: 0xf3cdb0,
    hair: 0xd8b070,
    eyes: 0x8a5a3a,
    pants: 0x7a8a9a,
    shoes: 0x4a4a52,
    ears: 'long',
    tail: 'puff',
    extras: [],
  },
  '🦁': {
    suit: 0xe8b43a,
    belly: 0xf6dc96,
    dark: 0x9a5a1a,
    skin: 0xe8b48c,
    hair: 0x7a3a12,
    eyes: 0x8a6a1a,
    pants: 0x5a4a2a,
    shoes: 0x3a2a1a,
    ears: 'round',
    tail: 'lion',
    extras: ['mane'],
  },
  '🐧': {
    suit: 0x2c323c,
    belly: 0xf4f4f0,
    dark: 0x1a1e24,
    skin: 0xf0c8a6,
    hair: 0x2a2a2a,
    eyes: 0x3a6ab0,
    pants: 0x2c323c,
    shoes: 0xf09a20,
    ears: 'none',
    tail: 'none',
    extras: ['beak'],
  },
  '🦖': {
    suit: 0x5aa04a,
    belly: 0xe8d46a,
    dark: 0x3a6a2a,
    skin: 0xe2b48e,
    hair: 0x3a2a1a,
    eyes: 0xb07a1a,
    pants: 0x3a5a2a,
    shoes: 0x2a3a1a,
    ears: 'none',
    tail: 'dino',
    extras: ['spikes'],
  },
  '🐙': {
    suit: 0xa452c0,
    belly: 0xe6b8f2,
    dark: 0x6e2a8a,
    skin: 0xf0c8aa,
    hair: 0x4a1a5a,
    eyes: 0x2a9aa0,
    pants: 0x3a2a5a,
    shoes: 0x2a1a3a,
    ears: 'none',
    tail: 'none',
    extras: ['tentacles'],
  },
};

export function lookFor(avatar: string): Look {
  return LOOKS[avatar] ?? LOOKS['🦊']!;
}

// --- Faces -------------------------------------------------------------------

export type Expression = 'normal' | 'blink' | 'talk' | 'hurt' | 'happy' | 'angry';

/**
 * Paints the face (16 × 16) on the head's front: the hood around it,
 * hair, eyes, brows, cheeks and mouth for the expression.
 */
export function paintFace(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  look: Look,
  mood: Expression,
): void {
  fabric(ctx, r, look.skin, { noise: 0.03, edge: 1, seed: 7 });
  const S = hex(look.suit);
  const D = shade(look.suit, 0.8);
  const H = hex(look.hair);
  // Hood around the face, hair fringe under it.
  pixels(
    ctx,
    r,
    [
      'DSSSSSSSSSSSSSSD',
      'SSSSSSSSSSSSSSSS',
      'SSSSSSSSSSSSSSSS',
      'SSHHHHHHHHHHHHSS',
      'SSHH.HHHH.HHH.SS',
      'SS............SS',
      'SS............SS',
      'SS............SS',
      'SS............SS',
      'SS............SS',
      'S..............S',
      'S..............S',
    ],
    { S, D, H },
  );
  if (look.extras.includes('patches')) {
    // Panda eye patches.
    pixels(ctx, r, ['.KKKK....KKKK.', 'KKKKK....KKKKK', '.KKK......KKK.'], { K: '#2a2a2e' }, 1, 6);
  }
  const W = '#ffffff';
  const I = hex(look.eyes);
  const K = '#1a1416';
  const B = shade(look.hair, 0.8);
  const P = '#f2a0a8';
  const M = '#7a2a2a';
  const T = '#e86a7a';
  const colors = { W, I, K, B, P, M, T, s: shade(look.skin, 0.88) };
  // Eyes: two rows each, the dark part towards the middle.
  const eyes: Record<Expression, string[]> = {
    normal: ['....WII..IIW....', '....WIK..KIW....'],
    happy: ['....KKK..KKK....', '...K...K.K...K..'],
    blink: ['................', '....KKK..KKK....'],
    talk: ['....WII..IIW....', '....WIK..KIW....'],
    hurt: ['....K.K..K.K....', '.....K....K.....'],
    angry: ['....WII..IIW....', '....WIK..KIW....'],
  };
  const brows: Record<Expression, string> = {
    normal: '....BBB..BBB....',
    happy: '....BBB..BBB....',
    blink: '....BBB..BBB....',
    talk: '....BBB..BBB....',
    hurt: '.....BB..BB.....',
    angry: '...BB.B..B.BB...',
  };
  const mouths: Record<Expression, string[]> = {
    normal: ['......s.........', '.....K....K.....', '......KKKK......'],
    happy: ['................', '.....KKKKKK.....', '......KTTK......'],
    blink: ['......s.........', '.....K....K.....', '......KKKK......'],
    talk: ['................', '......KKKK......', '......KMMK......', '.......KK.......'],
    hurt: ['................', '......KKKK......', '.....K....K.....'],
    angry: ['................', '................', '......KKKK......'],
  };
  pixels(ctx, r, [brows[mood]], colors, 0, 6);
  pixels(ctx, r, eyes[mood], colors, 0, 7);
  pixels(ctx, r, ['..P..........P..'], colors, 0, 10);
  pixels(ctx, r, mouths[mood], colors, 0, 10);
}

// --- Whole skins ---------------------------------------------------------------

/** The boxes of a player, in Minecraft pixels (32 high, front towards -z). */
export const BODY: Readonly<Record<string, Size>> = {
  head: [8, 8, 8],
  body: [8, 12, 4],
  armR: [4, 12, 4],
  armL: [4, 12, 4],
  legR: [4, 12, 4],
  legL: [4, 12, 4],
};

/** Extra costume boxes for a look (ears, tails, beaks…), with where they go. */
export interface ExtraBox {
  name: string;
  size: Size;
  /** Centre, in Minecraft pixels from the feet. */
  pos: [number, number, number];
  /** What it hangs on (it moves with it). */
  on: 'head' | 'body';
  color: number;
  /** A second colour for its front (inside of ears, tips). */
  front?: number;
  /** Tails wag, ears and tentacles sway. */
  wag?: boolean;
  tilt?: [number, number, number];
}

export function extrasFor(look: Look): ExtraBox[] {
  const out: ExtraBox[] = [];
  const s = look.suit;
  switch (look.ears) {
    case 'pointy':
      for (const x of [-3, 3]) {
        out.push({
          name: `ear${x}`,
          size: [3, 4, 1],
          pos: [x, 33.5, 0],
          on: 'head',
          color: s,
          front: look.belly,
        });
        out.push({
          name: `tip${x}`,
          size: [2, 1, 1],
          pos: [x, 36, 0],
          on: 'head',
          color: look.dark,
        });
      }
      break;
    case 'round':
      for (const x of [-3.5, 3.5]) {
        out.push({
          name: `ear${x}`,
          size: [3, 3, 1],
          pos: [x, 33, 0.5],
          on: 'head',
          color: look.extras.includes('patches') ? look.dark : s,
          front: look.belly,
        });
      }
      break;
    case 'long':
      for (const x of [-2, 2]) {
        out.push({
          name: `ear${x}`,
          size: [2, 7, 1],
          pos: [x, 35.5, 1],
          on: 'head',
          color: s,
          front: look.dark,
          wag: true,
          tilt: [0.15, 0, x * 0.05],
        });
      }
      break;
    case 'floppy':
      for (const x of [-4, 4]) {
        out.push({
          name: `ear${x}`,
          size: [2, 3, 3],
          pos: [x * 1.05, 31, -1],
          on: 'head',
          color: look.dark,
          tilt: [0, 0, x * 0.08],
        });
      }
      break;
    case 'none':
      break;
  }
  for (const extra of look.extras) {
    switch (extra) {
      case 'frogEyes':
        for (const x of [-2.5, 2.5]) {
          out.push({
            name: `frogEye${x}`,
            size: [3, 3, 3],
            pos: [x, 33, -2],
            on: 'head',
            color: s,
            front: 0xffffff,
          });
          out.push({
            name: `pupil${x}`,
            size: [1, 1, 1],
            pos: [x, 33, -3.6],
            on: 'head',
            color: 0x111111,
          });
        }
        break;
      case 'snout':
        out.push({
          name: 'snout',
          size: [3, 2, 1],
          pos: [0, 31, -4.5],
          on: 'head',
          color: look.dark,
        });
        break;
      case 'mane':
        // A big fluffy mane all round the hood.
        out.push({
          name: 'maneTop',
          size: [11, 3, 10],
          pos: [0, 33, 0.6],
          on: 'head',
          color: look.hair,
        });
        out.push({
          name: 'maneL',
          size: [2, 10, 9],
          pos: [-5, 27.5, 0.6],
          on: 'head',
          color: look.hair,
        });
        out.push({
          name: 'maneR',
          size: [2, 10, 9],
          pos: [5, 27.5, 0.6],
          on: 'head',
          color: look.hair,
        });
        out.push({
          name: 'maneBack',
          size: [11, 11, 2],
          pos: [0, 27.5, 5],
          on: 'head',
          color: look.hair,
        });
        out.push({
          name: 'maneChin',
          size: [8, 2, 2],
          pos: [0, 23.2, -2.6],
          on: 'head',
          color: look.hair,
        });
        break;
      case 'beak':
        out.push({
          name: 'beak',
          size: [4, 1, 2],
          pos: [0, 32.3, -4.5],
          on: 'head',
          color: look.shoes,
        });
        break;
      case 'spikes':
        for (let i = 0; i < 4; i++) {
          out.push({
            name: `spike${i}`,
            size: [1, 2, 1.5],
            pos: [0, 33 - i * 2.4, 2.5 + i * 0.8],
            on: 'head',
            color: look.belly,
          });
        }
        for (let i = 0; i < 3; i++) {
          out.push({
            name: `bspike${i}`,
            size: [1, 1.5, 1.5],
            pos: [0, 21 - i * 3.5, 2.6],
            on: 'body',
            color: look.belly,
          });
        }
        break;
      case 'tentacles':
        for (const [x, z] of [
          [-3, 3],
          [-1, 3.8],
          [1, 3.8],
          [3, 3],
        ] as const) {
          out.push({
            name: `tentacle${x}`,
            size: [1.5, 5, 1.5],
            pos: [x, 23.5, z + 1],
            on: 'head',
            color: s,
            front: look.belly,
            wag: true,
          });
        }
        break;
      case 'patches':
        break;
    }
  }
  switch (look.tail) {
    case 'fox':
      out.push({
        name: 'tail',
        size: [3, 3, 7],
        pos: [0, 12, 5.5],
        on: 'body',
        color: s,
        front: look.belly,
        wag: true,
        tilt: [-0.5, 0, 0],
      });
      break;
    case 'bear':
      out.push({ name: 'tail', size: [2, 2, 2], pos: [0, 13, 2.8], on: 'body', color: s });
      break;
    case 'curly':
      out.push({
        name: 'tail',
        size: [1, 3, 2],
        pos: [0, 14, 3],
        on: 'body',
        color: look.dark,
        wag: true,
      });
      break;
    case 'puff':
      out.push({ name: 'tail', size: [3, 3, 3], pos: [0, 13, 3], on: 'body', color: 0xffffff });
      break;
    case 'lion':
      out.push({
        name: 'tail',
        size: [1, 1, 7],
        pos: [0, 12.5, 5.2],
        on: 'body',
        color: s,
        wag: true,
        tilt: [-0.4, 0, 0],
      });
      out.push({
        name: 'tuft',
        size: [2, 2, 2],
        pos: [0, 10, 8.6],
        on: 'body',
        color: look.hair,
        wag: true,
      });
      break;
    case 'dino':
      out.push({
        name: 'tail',
        size: [4, 4, 8],
        pos: [0, 11, 6],
        on: 'body',
        color: s,
        front: look.belly,
        wag: true,
        tilt: [-0.35, 0, 0],
      });
      break;
    case 'none':
      break;
  }
  return out;
}

export interface Skin {
  atlas: Atlas;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  look: Look;
  extras: ExtraBox[];
  /** Redraws the face for an expression. */
  setExpression(mood: Expression): void;
}

/** Paints a whole player: costume, face, hands, trousers and shoes. */
export function makeSkin(avatar: string): Skin {
  const look = lookFor(avatar);
  const extras = extrasFor(look);
  const atlas = new Atlas(128);
  for (const [name, size] of Object.entries(BODY)) atlas.add(name, size);
  for (const e of extras) atlas.add(e.name, e.size.map((v) => Math.max(1, Math.round(v))) as Size);
  const ctx = atlas.finish();
  const reg = (name: string) => atlas.regions.get(name)!;

  // Head: the hood all round, the face in front.
  const head = reg('head');
  for (const side of SIDES) fabric(ctx, head[side], look.suit, { seed: 2 });
  // A seam down the back of the hood and the hood's rim on the sides.
  ctx.fillStyle = shade(look.suit, 0.82);
  ctx.fillRect(head.back.x + head.back.w / 2 - 1, head.back.y, 2, head.back.h);
  paintFace(ctx, head.front, look, 'normal');

  // Body: hoodie with a tummy patch, pocket and strings.
  const body = reg('body');
  for (const side of SIDES) fabric(ctx, body[side], look.suit, { seed: 3 });
  const f = body.front;
  fabric(ctx, { x: f.x + 3, y: f.y + 6, w: f.w - 6, h: f.h - 9 }, look.belly, {
    seed: 4,
    edge: 0.92,
  });
  ctx.fillStyle = shade(look.belly, 0.82);
  ctx.fillRect(f.x + 4, f.y + 15, f.w - 8, 1);
  ctx.fillStyle = shade(look.suit, 0.7);
  ctx.fillRect(f.x + 5, f.y, 1, 5);
  ctx.fillRect(f.x + f.w - 6, f.y, 1, 5);
  ctx.fillStyle = shade(look.dark, 1);
  ctx.fillRect(f.x, f.y + f.h - 2, f.w, 2);
  ctx.fillRect(body.back.x, body.back.y + body.back.h - 2, body.back.w, 2);
  ctx.fillRect(body.left.x, body.left.y + body.left.h - 2, body.left.w, 2);
  ctx.fillRect(body.right.x, body.right.y + body.right.h - 2, body.right.w, 2);

  // Arms: sleeves, dark cuffs, hands.
  for (const name of ['armR', 'armL']) {
    const arm = reg(name);
    for (const side of SIDES) {
      const r = arm[side];
      fabric(ctx, r, look.suit, { seed: 5 });
      if (side === 'top' || side === 'bottom') continue;
      fabric(ctx, { x: r.x, y: r.y + r.h - 8, w: r.w, h: 2 }, look.dark, { seed: 6, edge: 1 });
      fabric(ctx, { x: r.x, y: r.y + r.h - 6, w: r.w, h: 6 }, look.skin, {
        seed: 6,
        noise: 0.03,
        edge: 0.92,
      });
    }
    fabric(ctx, arm.bottom, look.skin, { noise: 0.03 });
  }

  // Legs: trousers and shoes.
  for (const name of ['legR', 'legL']) {
    const leg = reg(name);
    for (const side of SIDES) {
      const r = leg[side];
      fabric(ctx, r, look.pants, { seed: 8 });
      if (side === 'top' || side === 'bottom') continue;
      fabric(ctx, { x: r.x, y: r.y + r.h - 5, w: r.w, h: 5 }, look.shoes, { seed: 9, edge: 0.8 });
      ctx.fillStyle = shade(look.shoes, 1.35);
      ctx.fillRect(r.x, r.y + r.h - 5, r.w, 1);
    }
    fabric(ctx, leg.bottom, look.shoes, { noise: 0.04 });
  }

  // Costume extras.
  for (const e of extras) {
    const r = reg(e.name);
    for (const side of SIDES) fabric(ctx, r[side], e.color, { seed: 11, edge: 0.82 });
    if (e.front !== undefined) {
      const fr = r.front;
      const inset = fr.w > 2 && fr.h > 2 ? 1 : 0;
      fabric(
        ctx,
        { x: fr.x + inset, y: fr.y + inset, w: fr.w - inset * 2, h: fr.h - inset * 2 },
        e.front,
        {
          seed: 12,
          edge: 1,
        },
      );
      if (e.name.startsWith('frogEye')) {
        // A big round eye.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
      }
    }
    if (e.name === 'tail' && e.front !== undefined) {
      // The tail's tip is light (fox) or its belly side is (dino).
      fabric(ctx, { x: r.back.x, y: r.back.y, w: r.back.w, h: r.back.h }, e.front, { seed: 13 });
    }
  }

  const texture = new THREE.CanvasTexture(atlas.canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  let current: Expression = 'normal';
  return {
    atlas,
    ctx,
    texture,
    look,
    extras,
    setExpression(mood) {
      if (mood === current) return;
      current = mood;
      paintFace(ctx, head.front, look, mood);
      texture.needsUpdate = true;
    },
  };
}

/** The face as a small picture (for the player list and chat). */
export function faceIcon(avatar: string, size = 32): HTMLCanvasElement {
  const look = lookFor(avatar);
  const small = document.createElement('canvas');
  small.width = small.height = 16;
  const ctx = small.getContext('2d')!;
  paintFace(ctx, { x: 0, y: 0, w: 16, h: 16 }, look, 'normal');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const big = canvas.getContext('2d')!;
  big.imageSmoothingEnabled = false;
  big.drawImage(small, 0, 0, size, size);
  return canvas;
}
