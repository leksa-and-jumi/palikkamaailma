// Turns a chunk of blocks into triangles for the graphics card.
// Only faces next to air (or see-through blocks) are drawn, and corners next
// to other blocks are darkened a little (ambient occlusion) so shapes pop out.

import { CHUNK_SIZE, WORLD_HEIGHT } from '../config';
import { AIR, BEDROCK, BLOCKS, LAMP, LEAVES, WATER, type BlockType, type TileName } from './blocks';
import { tileUV } from './atlas';
import { chunkIndex } from './terrain';
import type { VoxelWorld } from './world';

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export interface ChunkMesh {
  /** Solid blocks plus cut-out ones (leaves, glass). */
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
    shade: 0.7,
  },
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
const WATER_SURFACE = 0.875;
const CORNER_UVS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

// The chunk plus a one-block border all around, so neighbours are quick to read.
const PAD = CHUNK_SIZE + 2;
const PAD_HEIGHT = WORLD_HEIGHT + 2;

function padIndex(x: number, y: number, z: number): number {
  return x + 1 + (z + 1) * PAD + (y + 1) * PAD * PAD;
}

function fillPadded(world: VoxelWorld, cx: number, cz: number): Uint8Array {
  const padded = new Uint8Array(PAD * PAD * PAD_HEIGHT);
  const chunk = world.getChunk(cx, cz);
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  for (let y = -1; y <= WORLD_HEIGHT; y++) {
    for (let z = -1; z <= CHUNK_SIZE; z++) {
      for (let x = -1; x <= CHUNK_SIZE; x++) {
        let id: number;
        if (y < 0) id = BEDROCK;
        else if (y >= WORLD_HEIGHT) id = AIR;
        else if (x >= 0 && z >= 0 && x < CHUNK_SIZE && z < CHUNK_SIZE)
          id = chunk[chunkIndex(x, y, z)]!;
        else id = world.getBlock(x0 + x, y, z0 + z);
        padded[padIndex(x, y, z)] = id;
      }
    }
  }
  return padded;
}

/** Does the face of `block` towards `neighbour` need to be drawn? */
export function isFaceVisible(block: BlockType, neighbour: BlockType): boolean {
  if (block.liquid) return !neighbour.liquid && !neighbour.solid;
  if (!neighbour.transparent) return false;
  if (neighbour.id === block.id) {
    // Glass next to glass looks like one big window; leaves stay bushy.
    return block.id === LEAVES;
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

export function buildChunkMesh(world: VoxelWorld, cx: number, cz: number): ChunkMesh {
  const padded = fillPadded(world, cx, cz);
  const solid = new MeshBuilder();
  const water = new MeshBuilder();
  const at = (x: number, y: number, z: number): BlockType => BLOCKS[padded[padIndex(x, y, z)]!]!;
  const occludes = (x: number, y: number, z: number): number => {
    const b = at(x, y, z);
    return b.solid && !b.transparent ? 1 : 0;
  };

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = at(x, y, z);
        if (block.id === AIR) continue;
        const out = block.liquid ? water : solid;
        const waterTop = block.id === WATER && at(x, y + 1, z).id !== WATER;
        const glows = block.id === LAMP;

        FACES.forEach((face, faceIndex) => {
          const [nx, ny, nz] = face.normal;
          if (!isFaceVisible(block, at(x + nx, y + ny, z + nz))) return;

          const tile: TileName = block.tiles[face.tile];
          const [u0, v0, u1, v1] = tileUV(tile);
          const base = out.positions.length / 3;
          const ao: number[] = [];

          face.corners.forEach((corner, i) => {
            const [ox, oy, oz] = corner;
            let level = 3;
            if (!glows) {
              const [s1, s2, c] = AO_OFFSETS[faceIndex]![i]!;
              const a = occludes(x + s1[0], y + s1[1], z + s1[2]);
              const b = occludes(x + s2[0], y + s2[1], z + s2[2]);
              const d = occludes(x + c[0], y + c[1], z + c[2]);
              level = a && b ? 0 : 3 - (a + b + d);
            }
            ao.push(level);

            const top = waterTop && oy === 1 ? WATER_SURFACE : oy;
            out.positions.push(x + ox, y + top, z + oz);
            const [cu, cv] = CORNER_UVS[i]!;
            out.uvs.push(cu ? u1 : u0, cv ? v1 : v0);
            const light = glows ? 1 : face.shade * AO_LEVELS[level as 0 | 1 | 2 | 3];
            out.colors.push(light, light, light);
          });

          // Split the square along the brighter diagonal so shading looks even.
          if (ao[0]! + ao[2]! < ao[1]! + ao[3]!) {
            out.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          } else {
            out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        });
      }
    }
  }

  return { solid: solid.build(), water: water.build() };
}
