// The magic builder describes a build as simple shapes (boxes, balls, ...).
// This file checks the shapes and turns them into blocks.
//
// Build coordinates: x = right, y = up, z = away from the player.
// (0, 0, 0) is the ground block in front of the player.

import { BUILDER } from '../config';
import { AIR, blockIdFromKey } from './blocks';

export type Vec3 = [number, number, number];

/** Mirror a shape to the other side of x = 0 (for symmetric builds). */
type Mirror = { mirror?: 'x' };

export type Shape = Mirror &
  (
    | { shape: 'box'; block: string; from: Vec3; to: Vec3 }
    | { shape: 'walls'; block: string; from: Vec3; to: Vec3 }
    | { shape: 'line'; block: string; from: Vec3; to: Vec3 }
    | { shape: 'sphere'; block: string; center: Vec3; radius: number; hollow?: boolean }
    | { shape: 'cylinder'; block: string; center: Vec3; radius: number; height: number }
    | { shape: 'pyramid'; block: string; center: Vec3; radius: number }
    | {
        shape: 'roof';
        block: string;
        /** Corners of the roof's bottom row; the roof starts at from[1]. */
        from: Vec3;
        to: Vec3;
        /** The ridge (top line) runs along this axis. */
        axis: 'x' | 'z';
        /** Fills the triangle walls one block inside each end. */
        ends?: string;
      }
    | { shape: 'blocks'; block: string; points: Vec3[] }
    | {
        shape: 'layers';
        origin: Vec3;
        /** One letter → block key. "." and " " leave the spot as it is. */
        palette: Record<string, string>;
        /** layers[y][z][x]: bottom layer first, each layer a list of rows. */
        layers: string[][];
      }
  );

/** One block of a build: [x, y, z, blockId] in build coordinates. */
export type BuildBlock = [number, number, number, number];

export const SHAPE_KINDS = [
  'box',
  'walls',
  'line',
  'sphere',
  'cylinder',
  'pyramid',
  'roof',
  'blocks',
  'layers',
] as const;

const LIMIT = BUILDER.maxBuildSize;

function int(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function vec(v: unknown): Vec3 | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out = v.map((n) => int(n, -LIMIT, LIMIT));
  return out.every((n) => n !== null) ? (out as Vec3) : null;
}

/** Words the AI might use for blocks with a longer key. */
const BLOCK_ALIASES: Record<string, string> = {
  gold: 'gold_block',
  diamond: 'diamond_block',
  iron: 'iron_block',
  wood: 'planks',
  oak_planks: 'planks',
  oak_log: 'log',
  stone_bricks: 'brick',
  glowstone: 'lamp',
};

function blockKey(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const typed = v.trim().toLowerCase();
  const key = BLOCK_ALIASES[typed] ?? typed;
  return key === 'air' || blockIdFromKey(key) !== undefined ? key : null;
}

const MAX_POINTS = 400;
const NOTHING = new Set(['.', ' ']);

function parseLayers(s: Record<string, unknown>): Shape | null {
  const origin = vec(s.origin);
  if (!origin || typeof s.palette !== 'object' || s.palette === null) return null;
  // The AI sends [{char, block}, ...]; {letter: block} works too.
  const entries: [unknown, unknown][] = Array.isArray(s.palette)
    ? s.palette.map((p: unknown) => {
        const e = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
        return [e.char, e.block];
      })
    : Object.entries(s.palette as Record<string, unknown>);
  const palette: Record<string, string> = {};
  for (const [letter, key] of entries) {
    const block = blockKey(key);
    if (typeof letter === 'string' && letter.length === 1 && !NOTHING.has(letter) && block) {
      palette[letter] = block;
    }
  }
  if (!Array.isArray(s.layers)) return null;
  const size = BUILDER.maxShapeSize;
  const layers = s.layers
    .slice(0, size)
    .map((layer) =>
      Array.isArray(layer)
        ? layer.slice(0, size).map((row) => (typeof row === 'string' ? row.slice(0, size) : ''))
        : [],
    );
  if (Object.keys(palette).length === 0 || layers.length === 0) return null;
  return { shape: 'layers', origin, palette, layers };
}

/** Checks one shape from the AI. Unknown or broken shapes become null. */
export function parseShape(v: unknown): Shape | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  const mirror: Mirror = s.mirror === 'x' ? { mirror: 'x' } : {};
  if (s.shape === 'layers') {
    const layers = parseLayers(s);
    return layers && { ...layers, ...mirror };
  }
  const block = blockKey(s.block);
  if (!block) return null;
  const size = BUILDER.maxShapeSize;
  switch (s.shape) {
    case 'box':
    case 'walls':
    case 'line':
    case 'roof': {
      const from = vec(s.from);
      const to = vec(s.to);
      if (!from || !to) return null;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(to[i]! - from[i]!) >= size) return null;
      }
      if (s.shape !== 'roof') return { shape: s.shape, block, from, to, ...mirror };
      const ends = s.ends === undefined ? null : blockKey(s.ends);
      return {
        shape: 'roof',
        block,
        from,
        to,
        axis: s.axis === 'z' ? 'z' : 'x',
        ...(ends ? { ends } : {}),
        ...mirror,
      };
    }
    case 'sphere': {
      const center = vec(s.center);
      const radius = int(s.radius, 1, size / 2);
      if (!center || radius === null) return null;
      return { shape: 'sphere', block, center, radius, hollow: s.hollow === true, ...mirror };
    }
    case 'cylinder': {
      const center = vec(s.center);
      const radius = int(s.radius, 1, size / 2);
      const height = int(s.height, 1, size);
      if (!center || radius === null || height === null) return null;
      return { shape: 'cylinder', block, center, radius, height, ...mirror };
    }
    case 'pyramid': {
      const center = vec(s.center);
      const radius = int(s.radius, 1, size / 2);
      if (!center || radius === null) return null;
      return { shape: 'pyramid', block, center, radius, ...mirror };
    }
    case 'blocks': {
      if (!Array.isArray(s.points)) return null;
      const points = s.points
        .slice(0, MAX_POINTS)
        .map(vec)
        .filter((p): p is Vec3 => p !== null);
      return points.length > 0 ? { shape: 'blocks', block, points, ...mirror } : null;
    }
    default:
      return null;
  }
}

export function parseShapes(v: unknown): Shape[] {
  const list = Array.isArray(v)
    ? v
    : typeof v === 'object' && v !== null && Array.isArray((v as { shapes?: unknown }).shapes)
      ? (v as { shapes: unknown[] }).shapes
      : [];
  return list
    .slice(0, BUILDER.maxShapes)
    .map(parseShape)
    .filter((s): s is Shape => s !== null);
}

function range(a: number, b: number): number[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

type Put = (x: number, y: number, z: number, block: string) => void;

/** Every block on a straight line between two points (both ends included). */
function lineBlocks(from: Vec3, to: Vec3, put: (x: number, y: number, z: number) => void): void {
  const steps = Math.max(...[0, 1, 2].map((i) => Math.abs(to[i]! - from[i]!)));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    put(
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
    );
  }
}

/**
 * A stepped gable roof: each row is one block higher and one block further in,
 * until the two sides meet at the ridge.
 */
function roofBlocks(shape: Extract<Shape, { shape: 'roof' }>, put: Put): void {
  const y0 = shape.from[1];
  // "along" runs with the ridge, "across" goes from eave to eave.
  const [a, c] = shape.axis === 'x' ? [0, 2] : [2, 0];
  const along = range(shape.from[a]!, shape.to[a]!);
  const lo = Math.min(shape.from[c]!, shape.to[c]!);
  const hi = Math.max(shape.from[c]!, shape.to[c]!);
  const at = (alongV: number, acrossV: number, y: number, block: string) =>
    shape.axis === 'x' ? put(alongV, y, acrossV, block) : put(acrossV, y, alongV, block);
  for (let k = 0; lo + k <= hi - k; k++) {
    for (const v of along) {
      at(v, lo + k, y0 + k, shape.block);
      at(v, hi - k, y0 + k, shape.block);
    }
    if (!shape.ends || along.length < 3) continue;
    for (let w = lo + k + 1; w <= hi - k - 1; w++) {
      at(along[1]!, w, y0 + k, shape.ends);
      at(along[along.length - 2]!, w, y0 + k, shape.ends);
    }
  }
}

function shapeBlocks(shape: Shape, put: Put): void {
  const one = (x: number, y: number, z: number) => put(x, y, z, (shape as { block: string }).block);
  switch (shape.shape) {
    case 'box':
    case 'walls': {
      const [x0, y0, z0] = shape.from;
      const [x1, y1, z1] = shape.to;
      const xs = range(x0, x1);
      const zs = range(z0, z1);
      for (const y of range(y0, y1)) {
        for (const z of zs) {
          for (const x of xs) {
            const edge =
              x === xs[0] || x === xs[xs.length - 1] || z === zs[0] || z === zs[zs.length - 1];
            if (shape.shape === 'box' || edge) one(x, y, z);
          }
        }
      }
      return;
    }
    case 'line':
      lineBlocks(shape.from, shape.to, one);
      return;
    case 'sphere': {
      const [cx, cy, cz] = shape.center;
      const r = shape.radius;
      const outer = (r + 0.5) ** 2;
      const inner = (r - 0.5) ** 2;
      for (let y = -r; y <= r; y++) {
        for (let z = -r; z <= r; z++) {
          for (let x = -r; x <= r; x++) {
            const d = x * x + y * y + z * z;
            if (d <= outer && (!shape.hollow || d >= inner)) one(cx + x, cy + y, cz + z);
          }
        }
      }
      return;
    }
    case 'cylinder': {
      const [cx, cy, cz] = shape.center;
      const r = shape.radius;
      for (let y = 0; y < shape.height; y++) {
        for (let z = -r; z <= r; z++) {
          for (let x = -r; x <= r; x++) {
            if (x * x + z * z <= (r + 0.5) ** 2) one(cx + x, cy + y, cz + z);
          }
        }
      }
      return;
    }
    case 'pyramid': {
      const [cx, cy, cz] = shape.center;
      for (let level = 0; level <= shape.radius; level++) {
        const r = shape.radius - level;
        for (let z = -r; z <= r; z++) {
          for (let x = -r; x <= r; x++) one(cx + x, cy + level, cz + z);
        }
      }
      return;
    }
    case 'roof':
      roofBlocks(shape, put);
      return;
    case 'blocks':
      for (const [x, y, z] of shape.points) one(x, y, z);
      return;
    case 'layers': {
      const [ox, oy, oz] = shape.origin;
      shape.layers.forEach((rows, y) =>
        rows.forEach((row, z) => {
          for (let x = 0; x < row.length; x++) {
            const block = shape.palette[row[x]!];
            if (block) put(ox + x, oy + y, oz + z, block);
          }
        }),
      );
      return;
    }
  }
}

/**
 * Turns shapes into blocks. Later shapes paint over earlier ones, and "air"
 * shapes cut holes (doors, windows). Stops at BUILDER.maxBlocks.
 */
export function expandShapes(shapes: readonly Shape[]): BuildBlock[] {
  const blocks = new Map<string, BuildBlock>();
  const set = (x: number, y: number, z: number, id: number) => {
    if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT || y < -LIMIT || y > LIMIT) return;
    const key = `${x},${y},${z}`;
    if (!blocks.has(key) && blocks.size >= BUILDER.maxBlocks) return;
    blocks.set(key, [x, y, z, id]);
  };
  for (const shape of shapes) {
    shapeBlocks(shape, (x, y, z, block) => {
      const id = block === 'air' ? AIR : blockIdFromKey(block);
      if (id === undefined) return;
      set(x, y, z, id);
      if (shape.mirror === 'x') set(-x, y, z, id);
    });
  }
  return [...blocks.values()];
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** The smallest box around all blocks of a build. */
export function buildBounds(blocks: readonly BuildBlock[]): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of blocks) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, b[i]!);
      max[i] = Math.max(max[i]!, b[i]!);
    }
  }
  return { min, max };
}

/**
 * Shifts a build so its footprint is centred on (0, 0): then it can be turned
 * around its middle and placed where the player points. Heights stay as they
 * are: y = 0 is the ground.
 */
export function centerFootprint(blocks: readonly BuildBlock[]): BuildBlock[] {
  if (blocks.length === 0) return [];
  const { min, max } = buildBounds(blocks);
  const shiftX = -Math.floor((min[0] + max[0]) / 2);
  const shiftZ = -Math.floor((min[2] + max[2]) / 2);
  return blocks.map(([x, y, z, id]) => [x + shiftX, y, z + shiftZ, id]);
}

/**
 * Moves a build into the world in front of the player. `facing` is the
 * direction the player looks: 0 = -z (north), 1 = +x, 2 = +z, 3 = -x.
 */
export function placeBuild(
  blocks: readonly BuildBlock[],
  origin: Vec3,
  facing: 0 | 1 | 2 | 3,
): BuildBlock[] {
  const [ox, oy, oz] = origin;
  return blocks.map(([x, y, z, id]) => {
    // Build z is "away from the player", build x is "to the right".
    switch (facing) {
      case 0:
        return [ox + x, oy + y, oz - z, id];
      case 1:
        return [ox + z, oy + y, oz + x, id];
      case 2:
        return [ox - x, oy + y, oz + z, id];
      case 3:
        return [ox - z, oy + y, oz - x, id];
    }
  });
}

/** Which of the four directions a yaw angle is closest to (yaw 0 = -z). */
export function facingFromYaw(yaw: number): 0 | 1 | 2 | 3 {
  // yaw grows when turning left, so turning right (towards +x) is negative.
  const quarter = Math.round(-yaw / (Math.PI / 2));
  return (((quarter % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}
