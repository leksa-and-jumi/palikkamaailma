// Where each texture tile sits in the texture atlas image.

import { RENDER } from '../config';
import { TILE_NAMES, type TileName } from './blocks';

export const ATLAS_COLUMNS = RENDER.atlasColumns;
export const ATLAS_ROWS = Math.ceil(TILE_NAMES.length / ATLAS_COLUMNS);

/** [u0, v0, u1, v1] for a tile. v grows upwards (WebGL style). */
export type UVRect = readonly [number, number, number, number];

const INSET = 0.5 / (RENDER.tilePixels * ATLAS_COLUMNS);

function computeRect(index: number): UVRect {
  const col = index % ATLAS_COLUMNS;
  const row = Math.floor(index / ATLAS_COLUMNS);
  const u0 = col / ATLAS_COLUMNS + INSET;
  const u1 = (col + 1) / ATLAS_COLUMNS - INSET;
  const v1 = 1 - row / ATLAS_ROWS - INSET;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + INSET;
  return [u0, v0, u1, v1];
}

const RECTS = new Map<TileName, UVRect>(TILE_NAMES.map((name, i) => [name, computeRect(i)]));

export function tileIndex(name: TileName): number {
  return TILE_NAMES.indexOf(name);
}

export function tileUV(name: TileName): UVRect {
  return RECTS.get(name)!;
}
