// Turns a chunk of blocks into triangles for the graphics card.
// Only faces next to air (or see-through blocks) are drawn. Each corner gets
// a brightness from light (sun from above, torches, lava) and is darkened a
// little next to other blocks (ambient occlusion) so shapes pop out.

import { CHUNK_SIZE, LIGHT, WORLD_HEIGHT } from '../config';
import {
  AIR,
  BEDROCK,
  BLOCKS,
  REDSTONE_WIRE,
  REDSTONE_WIRE_ON,
  WATER,
  type BlockType,
  type TileName,
} from './blocks';
import { isRedstoneThing } from './redstone';
import { tileUV } from './atlas';
import { chunkIndex } from './terrain';
import { chunkOf, type VoxelWorld } from './world';

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export interface ChunkMesh {
  /** Solid blocks, cut-out ones (leaves, glass, plants) and lava. */
  solid: MeshData;
  /** Water is drawn separately because it is half see-through. */
  water: MeshData;
}

type Vec3 = readonly [number, number, number];

interface Face {
  normal: Vec3;
  /** Corners seen from outside: bottom-left, bottom-right, top-right, top-left. */
  corners: readonly [Vec3, Vec3, Vec3, Vec3];
  tile: 'top' | 'side' | 'bottom';
  /** North/south faces use the block's front picture when it has one. */
  front: boolean;
  shade: number;
}

const FACES: readonly Face[] = [
  {
    normal: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    tile: 'side',
    front: false,
    shade: 0.8,
  },
  {
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    tile: 'side',
    front: false,
    shade: 0.8,
  },
  {
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    tile: 'top',
    front: false,
    shade: 1,
  },
  {
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    tile: 'bottom',
    front: false,
    shade: 0.55,
  },
  {
    normal: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    tile: 'side',
    front: true,
    shade: 0.7,
  },
  {
    normal: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    tile: 'side',
    front: true,
    shade: 0.7,
  },
];

/** Redstone dust lies this high above the ground. */
const DUST_HEIGHT = 0.02;
/** The dust line is this wide (from DUST_EDGE to 1 - DUST_EDGE). */
const DUST_EDGE = 0.3125;
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const WIRES: readonly boolean[] = BLOCKS.map(
  (b) => b.id === REDSTONE_WIRE || b.id === REDSTONE_WIRE_ON,
);
const JOINS_DUST: readonly boolean[] = BLOCKS.map((b) => isRedstoneThing(b.id));

/** Picture position (0–1) of a point on a box face, so pictures are not squashed. */
function boxUV(normal: Vec3, x: number, y: number, z: number): [number, number] {
  if (normal[0] !== 0) return [normal[0] > 0 ? 1 - z : z, y];
  if (normal[2] !== 0) return [normal[2] > 0 ? x : 1 - x, y];
  return [x, normal[1] > 0 ? 1 - z : z];
}

/** Two pictures crossing diagonally, for flowers, grass and torches. */
const CROSS_QUADS: readonly (readonly [Vec3, Vec3, Vec3, Vec3])[] = [
  [
    [0.15, 0, 0.15],
    [0.85, 0, 0.85],
    [0.85, 1, 0.85],
    [0.15, 1, 0.15],
  ],
  [
    [0.85, 0, 0.15],
    [0.15, 0, 0.85],
    [0.15, 1, 0.85],
    [0.85, 1, 0.15],
  ],
];

/**
 * For each face corner: the two side blocks and the diagonal block just outside
 * the face that can shade that corner (offsets from the block itself).
 */
const AO_OFFSETS: readonly (readonly (readonly [Vec3, Vec3, Vec3])[])[] = FACES.map((face) => {
  const tangents = [0, 1, 2].filter((axis) => face.normal[axis] === 0);
  return face.corners.map((corner) => {
    const side = (axes: number[]): Vec3 => {
      const v = [...face.normal] as [number, number, number];
      for (const axis of axes) v[axis]! += corner[axis] === 1 ? 1 : -1;
      return v;
    };
    return [side([tangents[0]!]), side([tangents[1]!]), side(tangents)] as const;
  });
});

/** Brightness by how many blocks touch a corner (0 = three blocks, 3 = none). */
const AO_LEVELS = [0.5, 0.68, 0.84, 1] as const;
const LIQUID_SURFACE = 0.875;
const CORNER_UVS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

/** Light only travels this far, so this much of the neighbours is enough. */
const PAD = Math.ceil(LIGHT.max / LIGHT.falloff);
const SIZE = CHUNK_SIZE + PAD * 2;
const HEIGHT = WORLD_HEIGHT + 2;
const CELLS = SIZE * SIZE * HEIGHT;
const STEP_Z = SIZE;
const STEP_Y = SIZE * SIZE;

const OPAQUE: readonly boolean[] = BLOCKS.map((b) => b.solid && !b.transparent);
/** Leaves and water dim the light passing through them. */
const DIMS: readonly boolean[] = BLOCKS.map((b) => b.key.endsWith('leaves') || b.id === WATER);

function padIndex(x: number, y: number, z: number): number {
  return x + PAD + (z + PAD) * STEP_Z + (y + 1) * STEP_Y;
}

/** Copies the chunk and PAD blocks of its neighbours into one array. */
function fillPadded(world: VoxelWorld, cx: number, cz: number): Uint8Array {
  const padded = new Uint8Array(CELLS);
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  for (let pz = 0; pz < SIZE; pz++) {
    for (let px = 0; px < SIZE; px++) {
      const wx = x0 - PAD + px;
      const wz = z0 - PAD + pz;
      const ncx = chunkOf(wx);
      const ncz = chunkOf(wz);
      const chunk = world.getChunk(ncx, ncz);
      const lx = wx - ncx * CHUNK_SIZE;
      const lz = wz - ncz * CHUNK_SIZE;
      const column = px + pz * STEP_Z;
      padded[column] = BEDROCK;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        padded[column + (y + 1) * STEP_Y] = chunk[chunkIndex(lx, y, lz)]!;
      }
      // The top row (y = WORLD_HEIGHT) stays air.
    }
  }
  // Redstone looks (lit lamps, powered dust) cover the real blocks.
  for (let ncz = chunkOf(z0 - PAD); ncz <= chunkOf(z0 + CHUNK_SIZE + PAD - 1); ncz++) {
    for (let ncx = chunkOf(x0 - PAD); ncx <= chunkOf(x0 + CHUNK_SIZE + PAD - 1); ncx++) {
      for (const [x, y, z, id] of world.shownIn(ncx, ncz)) {
        const px = x - x0 + PAD;
        const pz = z - z0 + PAD;
        if (px < 0 || pz < 0 || px >= SIZE || pz >= SIZE) continue;
        padded[px + pz * STEP_Z + (y + 1) * STEP_Y] = id;
      }
    }
  }
  return padded;
}

// A cell can wait in the queue more than once, so leave plenty of room.
const QUEUE_SIZE = CELLS * 4;
const LIGHT_QUEUE = new Int32Array(QUEUE_SIZE);

/** Spreads light from the seeded cells (flood fill), dropping LIGHT.falloff per block. */
function spread(padded: Uint8Array, light: Uint8Array, queue: Int32Array, tail: number): void {
  let head = 0;
  const push = (i: number) => {
    queue[tail] = i;
    tail = (tail + 1) % QUEUE_SIZE;
  };
  while (head !== tail) {
    const i = queue[head]!;
    head = (head + 1) % QUEUE_SIZE;
    const next = light[i]! - LIGHT.falloff;
    if (next <= 0) continue;
    const x = i % SIZE;
    const z = Math.floor(i / STEP_Z) % SIZE;
    const neighbours = [
      x < SIZE - 1 ? i + 1 : -1,
      x > 0 ? i - 1 : -1,
      z < SIZE - 1 ? i + STEP_Z : -1,
      z > 0 ? i - STEP_Z : -1,
      i + STEP_Y < CELLS ? i + STEP_Y : -1,
      i - STEP_Y,
    ];
    for (const n of neighbours) {
      if (n < 0) continue;
      const id = padded[n]!;
      if (OPAQUE[id]) continue;
      const level = DIMS[id] ? next - LIGHT.falloff : next;
      if (level > light[n]!) {
        light[n] = level;
        push(n);
      }
    }
  }
}

/**
 * Two kinds of light: sunlight (straight down, then spreading under
 * overhangs; it dims at night) and block light from torches, lamps and lava.
 */
function computeLight(padded: Uint8Array): { sky: Uint8Array; block: Uint8Array } {
  const sky = new Uint8Array(CELLS);
  const block = new Uint8Array(CELLS);
  const queue = LIGHT_QUEUE;

  let tail = 0;
  for (let column = 0; column < STEP_Y; column++) {
    let level: number = LIGHT.max;
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const i = column + y * STEP_Y;
      const id = padded[i]!;
      if (OPAQUE[id]) break;
      if (DIMS[id]) level = Math.max(0, level - LIGHT.falloff);
      sky[i] = level;
      if (level > LIGHT.falloff) {
        queue[tail] = i;
        tail = (tail + 1) % QUEUE_SIZE;
      }
    }
  }
  spread(padded, sky, queue, tail);

  tail = 0;
  for (let i = 0; i < CELLS; i++) {
    const glow = BLOCKS[padded[i]!]!.light;
    if (glow > 0) {
      block[i] = glow;
      queue[tail] = i;
      tail = (tail + 1) % QUEUE_SIZE;
    }
  }
  spread(padded, block, queue, tail);
  return { sky, block };
}

/** Does the face of `block` towards `neighbour` need to be drawn? */
export function isFaceVisible(block: BlockType, neighbour: BlockType): boolean {
  if (block.liquid) return neighbour.id !== block.id && !OPAQUE[neighbour.id];
  if (!neighbour.transparent) return false;
  if (neighbour.shape !== 'cube') return true;
  if (neighbour.id === block.id) {
    // Glass next to glass looks like one big window; leaves stay bushy.
    return block.key.endsWith('leaves');
  }
  return true;
}

class MeshBuilder {
  positions: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  build(): MeshData {
    return {
      positions: new Float32Array(this.positions),
      uvs: new Float32Array(this.uvs),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
    };
  }
}

/** What the mesher needs to know about the blocks around the one it draws. */
interface Grid {
  at(x: number, y: number, z: number): BlockType;
  opaqueAt(x: number, y: number, z: number): number;
  skyAt(x: number, y: number, z: number): number;
  blockAt(x: number, y: number, z: number): number;
}

/** Adds the faces of one block to the mesh. */
function emitBlock(
  solid: MeshBuilder,
  water: MeshBuilder,
  { at, opaqueAt, skyAt, blockAt }: Grid,
  x: number,
  y: number,
  z: number,
): void {
  const max = LIGHT.max;
  const block = at(x, y, z);
  if (block.id === AIR) return;
  const out = block.id === WATER ? water : solid;
  const glows = block.light > 0;

  if (block.shape === 'cross') {
    const [u0, v0, u1, v1] = tileUV(block.tiles.side);
    const sky = glows ? 1 : skyAt(x, y, z) / max;
    const lit = glows ? 1 : blockAt(x, y, z) / max;
    for (const quad of CROSS_QUADS) {
      const base = out.positions.length / 3;
      quad.forEach(([ox, oy, oz], i) => {
        out.positions.push(x + ox, y + oy, z + oz);
        const [cu, cv] = CORNER_UVS[i]!;
        out.uvs.push(cu ? u1 : u0, cv ? v1 : v0);
        out.colors.push(1, sky, lit);
      });
      // Both sides, so the plant can be seen from everywhere.
      out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      out.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    return;
  }

  if (block.shape === 'dust') {
    const [u0, v0, u1, v1] = tileUV(block.tiles.top);
    // Powered dust shines so you can see the signal, also at night.
    const on = block.id === REDSTONE_WIRE_ON;
    const sky = on ? 1 : skyAt(x, y, z) / max;
    const lit = on ? 1 : blockAt(x, y, z) / max;
    /** `wall` = 'x' or 'z' for dust climbing up a side, null for the floor. */
    const quad = (corners: readonly Vec3[], wall: 'x' | 'z' | null = null) => {
      const base = out.positions.length / 3;
      for (const [px, py, pz] of corners) {
        out.positions.push(x + px, y + py, z + pz);
        const [fu, fv] = wall ? [wall === 'x' ? pz : px, py] : [px, 1 - pz];
        out.uvs.push(u0 + (u1 - u0) * fu, v0 + (v1 - v0) * fv);
        out.colors.push(1, sky, lit);
      }
      out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      out.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    };
    const flat = (ax: number, az: number, bx: number, bz: number) =>
      quad([
        [ax, DUST_HEIGHT, bz],
        [bx, DUST_HEIGHT, bz],
        [bx, DUST_HEIGHT, az],
        [ax, DUST_HEIGHT, az],
      ]);
    const above = OPAQUE[at(x, y + 1, z).id]!;
    const joined = DIRECTIONS.map(([dx, dz]) => {
      const side = at(x + dx, y, z + dz);
      if (JOINS_DUST[side.id]) return 'flat';
      if (!above && WIRES[at(x + dx, y + 1, z + dz).id]!) return 'up';
      if (!OPAQUE[side.id] && WIRES[at(x + dx, y - 1, z + dz).id]!) return 'flat';
      return null;
    });
    const count = joined.filter(Boolean).length;
    const lo = DUST_EDGE;
    const hi = 1 - DUST_EDGE;
    flat(lo, lo, hi, hi);
    DIRECTIONS.forEach(([dx, dz], i) => {
      // A lonely dot shows all four arms; one line goes straight through.
      const opposite = joined[i ^ 1];
      const show = count === 0 || !!joined[i] || (count === 1 && !!opposite);
      if (!show) return;
      if (dx === 1) flat(hi, lo, 1, hi);
      if (dx === -1) flat(0, lo, lo, hi);
      if (dz === 1) flat(lo, hi, hi, 1);
      if (dz === -1) flat(lo, 0, hi, lo);
      if (joined[i] !== 'up') return;
      // Climbs up the side of the block next to it.
      const e = 1 - DUST_HEIGHT;
      const w = dx !== 0 ? 'x' : 'z';
      const at0 = dx === -1 || dz === -1 ? 1 - e : e;
      if (w === 'x')
        quad(
          [
            [at0, 0, lo],
            [at0, 0, hi],
            [at0, 1, hi],
            [at0, 1, lo],
          ],
          w,
        );
      else
        quad(
          [
            [lo, 0, at0],
            [hi, 0, at0],
            [hi, 1, at0],
            [lo, 1, at0],
          ],
          w,
        );
    });
    return;
  }

  if (block.shape === 'boxes') {
    const sky = skyAt(x, y, z) / max;
    const lit = blockAt(x, y, z) / max;
    for (const box of block.boxes ?? []) {
      const [u0, v0, u1, v1] = tileUV(box.tile ?? block.tiles.side);
      for (const face of FACES) {
        const base = out.positions.length / 3;
        for (const corner of face.corners) {
          const p = [0, 1, 2].map((a) => (corner[a] ? box.to[a]! : box.from[a]!)) as [
            number,
            number,
            number,
          ];
          out.positions.push(x + p[0], y + p[1], z + p[2]);
          const [fu, fv] = boxUV(face.normal, ...p);
          out.uvs.push(u0 + (u1 - u0) * fu, v0 + (v1 - v0) * fv);
          out.colors.push(face.shade, sky, lit);
        }
        out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    return;
  }

  const liquidTop = block.liquid && at(x, y + 1, z).id !== block.id;

  FACES.forEach((face, faceIndex) => {
    const [nx, ny, nz] = face.normal;
    if (!isFaceVisible(block, at(x + nx, y + ny, z + nz))) return;

    const tile: TileName =
      face.front && block.tiles.front ? block.tiles.front : block.tiles[face.tile];
    const [u0, v0, u1, v1] = tileUV(tile);
    const base = out.positions.length / 3;
    const ao: number[] = [];

    face.corners.forEach((corner, i) => {
      const [ox, oy, oz] = corner;
      let level = 3;
      let sky = 1;
      let lit = 1;
      if (!glows) {
        const [s1, s2, c] = AO_OFFSETS[faceIndex]![i]!;
        const a = opaqueAt(x + s1[0], y + s1[1], z + s1[2]);
        const b = opaqueAt(x + s2[0], y + s2[1], z + s2[2]);
        const d = opaqueAt(x + c[0], y + c[1], z + c[2]);
        level = a && b ? 0 : 3 - (a + b + d);
        // Smooth light: average the open blocks around this corner.
        const cells: (readonly [number, number, number])[] = [[x + nx, y + ny, z + nz]];
        if (!a) cells.push([x + s1[0], y + s1[1], z + s1[2]]);
        if (!b) cells.push([x + s2[0], y + s2[1], z + s2[2]]);
        if (!d && !(a && b)) cells.push([x + c[0], y + c[1], z + c[2]]);
        let skySum = 0;
        let blockSum = 0;
        for (const [cx, cy, cz] of cells) {
          skySum += skyAt(cx, cy, cz);
          blockSum += blockAt(cx, cy, cz);
        }
        sky = skySum / cells.length / max;
        lit = blockSum / cells.length / max;
      }
      ao.push(level);

      const top = liquidTop && oy === 1 ? LIQUID_SURFACE : oy;
      out.positions.push(x + ox, y + top, z + oz);
      const [cu, cv] = CORNER_UVS[i]!;
      out.uvs.push(cu ? u1 : u0, cv ? v1 : v0);
      // Colour channels: r = shade and corner darkness, g = sunlight, b = torch light.
      // The shader mixes them with the time of day (see worldRenderer).
      const shade = glows ? 1 : face.shade * AO_LEVELS[level as 0 | 1 | 2 | 3];
      out.colors.push(shade, sky, lit);
    });

    // Split the square along the brighter diagonal so shading looks even.
    if (ao[0]! + ao[2]! < ao[1]! + ao[3]!) {
      out.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    } else {
      out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
}

export function buildChunkMesh(world: VoxelWorld, cx: number, cz: number): ChunkMesh {
  const padded = fillPadded(world, cx, cz);
  const light = computeLight(padded);
  const solid = new MeshBuilder();
  const water = new MeshBuilder();
  const grid: Grid = {
    at: (x, y, z) => BLOCKS[padded[padIndex(x, y, z)]!]!,
    opaqueAt: (x, y, z) => (OPAQUE[padded[padIndex(x, y, z)]!] ? 1 : 0),
    skyAt: (x, y, z) => light.sky[padIndex(x, y, z)]!,
    blockAt: (x, y, z) => light.block[padIndex(x, y, z)]!,
  };

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) emitBlock(solid, water, grid, x, y, z);
    }
  }

  return { solid: solid.build(), water: water.build() };
}

/**
 * A mesh for a loose set of blocks ([x, y, z, id]), for example a magic build
 * in the preview. Everything is in full daylight; corners still get shade, and
 * the colours are plain grey shades (no day and night channels).
 */
export function buildBlocksMesh(
  blocks: readonly (readonly [number, number, number, number])[],
): ChunkMesh {
  const ids = new Map<string, number>();
  for (const [x, y, z, id] of blocks) if (id !== AIR) ids.set(`${x},${y},${z}`, id);
  const idAt = (x: number, y: number, z: number) => ids.get(`${x},${y},${z}`) ?? AIR;
  const grid: Grid = {
    at: (x, y, z) => BLOCKS[idAt(x, y, z)]!,
    opaqueAt: (x, y, z) => (OPAQUE[idAt(x, y, z)] ? 1 : 0),
    skyAt: () => LIGHT.max,
    blockAt: () => 0,
  };
  const solid = new MeshBuilder();
  const water = new MeshBuilder();
  for (const key of ids.keys()) {
    const [x, y, z] = key.split(',').map(Number) as [number, number, number];
    emitBlock(solid, water, grid, x, y, z);
  }
  for (const mesh of [solid, water]) {
    // Shade only: copy the red channel (shade and corner darkness) to green and blue.
    for (let i = 0; i < mesh.colors.length; i += 3) {
      mesh.colors[i + 1] = mesh.colors[i + 2] = mesh.colors[i]!;
    }
  }
  return { solid: solid.build(), water: water.build() };
}
