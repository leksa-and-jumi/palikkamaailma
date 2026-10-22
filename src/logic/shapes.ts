// The magic builder describes a build as simple shapes (boxes, balls, ...).
// This file checks the shapes and turns them into blocks.
//
// Build coordinates: x = right, y = up, z = away from the player.
// (0, 0, 0) is the ground block in front of the player.

import { BUILDER } from '../config';
import { AIR, blockIdFromKey } from './blocks';

export type Vec3 = [number, number, number];

export type Shape =
  | { shape: 'box'; block: string; from: Vec3; to: Vec3 }
  | { shape: 'walls'; block: string; from: Vec3; to: Vec3 }
  | { shape: 'sphere'; block: string; center: Vec3; radius: number; hollow?: boolean }
  | { shape: 'cylinder'; block: string; center: Vec3; radius: number; height: number }
  | { shape: 'pyramid'; block: string; center: Vec3; radius: number };

/** One block of a build: [x, y, z, blockId] in build coordinates. */
export type BuildBlock = [number, number, number, number];

export const SHAPE_KINDS = ['box', 'walls', 'sphere', 'cylinder', 'pyramid'] as const;

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

function blockKey(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const key = v.trim().toLowerCase();
  return key === 'air' || blockIdFromKey(key) !== undefined ? key : null;
}

/** Checks one shape from the AI. Unknown or broken shapes become null. */
export function parseShape(v: unknown): Shape | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  const block = blockKey(s.block);
  if (!block) return null;
  const size = BUILDER.maxShapeSize;
  switch (s.shape) {
    case 'box':
    case 'walls': {
      const from = vec(s.from);
      const to = vec(s.to);
      if (!from || !to) return null;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(to[i]! - from[i]!) >= size) return null;
      }
      return { shape: s.shape, block, from, to };
    }
    case 'sphere': {
      const center = vec(s.center);
      const radius = int(s.radius, 1, size / 2);
      if (!center || radius === null) return null;
      return { shape: 'sphere', block, center, radius, hollow: s.hollow === true };
    }
    case 'cylinder': {
      const center = vec(s.center);
      const radius = int(s.radius, 1, size / 2);
      const height = int(s.height, 1, size);
      if (!center || radius === null || height === null) return null;
      return { shape: 'cylinder', block, center, radius, height };
    }
    case 'pyramid': {
      const center = vec(s.center);
      const radius = int(s.radius, 1, size / 2);
      if (!center || radius === null) return null;
      return { shape: 'pyramid', block, center, radius };
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

function shapeBlocks(shape: Shape, put: (x: number, y: number, z: number) => void): void {
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
            if (shape.shape === 'box' || edge) put(x, y, z);
          }
        }
      }
      return;
    }
    case 'sphere': {
      const [cx, cy, cz] = shape.center;
      const r = shape.radius;
      const outer = (r + 0.5) ** 2;
      const inner = (r - 0.5) ** 2;
      for (let y = -r; y <= r; y++) {
        for (let z = -r; z <= r; z++) {
          for (let x = -r; x <= r; x++) {
            const d = x * x + y * y + z * z;
            if (d <= outer && (!shape.hollow || d >= inner)) put(cx + x, cy + y, cz + z);
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
            if (x * x + z * z <= (r + 0.5) ** 2) put(cx + x, cy + y, cz + z);
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
          for (let x = -r; x <= r; x++) put(cx + x, cy + level, cz + z);
        }
      }
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
  for (const shape of shapes) {
    const id = shape.block === 'air' ? AIR : blockIdFromKey(shape.block);
    if (id === undefined) continue;
    shapeBlocks(shape, (x, y, z) => {
      if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT || y < -LIMIT || y > LIMIT) return;
      const key = `${x},${y},${z}`;
      if (!blocks.has(key) && blocks.size >= BUILDER.maxBlocks) return;
      blocks.set(key, [x, y, z, id]);
    });
  }
  return [...blocks.values()];
}

/**
 * Shifts a build so it is centred left–right and starts right in front of the
 * player (smallest z = 0). Heights stay as they are: y = 0 is the ground.
 */
export function centerBuild(blocks: readonly BuildBlock[]): BuildBlock[] {
  if (blocks.length === 0) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  for (const [x, , z] of blocks) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
  }
  const shiftX = -Math.floor((minX + maxX) / 2);
  return blocks.map(([x, y, z, id]) => [x + shiftX, y, z - minZ, id]);
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
