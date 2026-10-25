// The map: a small one in the corner and a big one (M) with you, your
// friends, villages, your bed and home. Places you have been show the real
// blocks; the rest is drawn from the world's recipe, so the whole island
// can be seen.

import { CHUNK_SIZE, MAP, VILLAGES } from '../config';
import { WATER } from '../logic/blocks';
import { blockColor, columnColor, shade, topOf, type RGB } from '../logic/mapColors';
import { chunkIndex } from '../logic/terrain';
import { chunkKey, chunkOf, type VoxelWorld } from '../logic/world';

export interface MapMarker {
  x: number;
  z: number;
  /** An emoji, or 'me' for your own arrow. */
  icon: string;
  /** Your looking direction (yaw) for the arrow. */
  yaw?: number;
  label?: string;
}

interface Tile {
  /** RGB for each of the 16 × 16 columns. */
  pixels: Uint8ClampedArray;
  /** Made from real blocks (not just the recipe). */
  real: boolean;
}

/** Map pictures of chunks, made a few at a time. */
export class MapTiles {
  private readonly tiles = new Map<string, Tile>();
  private readonly dirty = new Set<string>();

  constructor(private readonly world: VoxelWorld) {}

  /** A block changed: its chunk's picture is made again. */
  markDirty(x: number, z: number): void {
    this.dirty.add(chunkKey(chunkOf(x), chunkOf(z)));
  }

  get(cx: number, cz: number): Tile | undefined {
    return this.tiles.get(chunkKey(cx, cz));
  }

  /** Makes missing or old pictures near (x, z), nearest first, for at most `budgetMs`. */
  update(x: number, z: number, radius: number, budgetMs: number): void {
    const start = performance.now();
    const pcx = chunkOf(x);
    const pcz = chunkOf(z);
    const r = Math.ceil(radius / CHUNK_SIZE);
    const todo: { cx: number; cz: number; d: number }[] = [];
    for (let cz = pcz - r; cz <= pcz + r; cz++) {
      for (let cx = pcx - r; cx <= pcx + r; cx++) {
        const key = chunkKey(cx, cz);
        const tile = this.tiles.get(key);
        const loaded = this.world.hasChunk(cx, cz);
        if (tile && !this.dirty.has(key) && (tile.real || !loaded)) continue;
        todo.push({ cx, cz, d: Math.hypot(cx - pcx, cz - pcz) });
      }
    }
    todo.sort((a, b) => a.d - b.d);
    for (const { cx, cz } of todo) {
      if (performance.now() - start > budgetMs) break;
      const key = chunkKey(cx, cz);
      this.dirty.delete(key);
      this.tiles.set(key, this.make(cx, cz));
    }
    // Forget pictures far away, so memory stays small.
    if (this.tiles.size > MAP.maxTiles) {
      for (const key of this.tiles.keys()) {
        const [tx, tz] = key.split(',').map(Number) as [number, number];
        if (Math.max(Math.abs(tx - pcx), Math.abs(tz - pcz)) > r + 4) this.tiles.delete(key);
      }
    }
  }

  private make(cx: number, cz: number): Tile {
    const pixels = new Uint8ClampedArray(CHUNK_SIZE * CHUNK_SIZE * 3);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const real = this.world.hasChunk(cx, cz);
    const terrain = this.world.terrain;
    // Heights of one row more to the north, for the slope shading.
    const heights = new Float32Array(CHUNK_SIZE * (CHUNK_SIZE + 1));
    const colors: RGB[] = [];
    const depths = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const recipe = (x: number, z: number) => columnColor(terrain.column(x, z));
    // The recipe is slow, so far away places are drawn two blocks at a time.
    const step = real ? 1 : 2;
    for (let lz = -1; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        let height: number;
        let color: RGB;
        let depth = 0;
        if (lz >= 0 && real) {
          const chunk = this.world.getChunk(cx, cz);
          const top = topOf((y) => chunk[chunkIndex(lx, y, lz)]!);
          height = top.height;
          color = blockColor(top.id)!;
          if (top.id === WATER) {
            while (depth < 12 && chunk[chunkIndex(lx, top.height - depth - 1, lz)] === WATER)
              depth++;
          }
        } else if (lz < 0) {
          height = this.world.hasChunk(cx, chunkOf(wz))
            ? topOf((y) => this.world.getBlock(wx, y, wz)).height
            : recipe(wx, wz).height;
          color = [0, 0, 0];
        } else {
          const sx = x0 + lx - (lx % step);
          const sz = z0 + lz - (lz % step);
          const top = recipe(sx, sz);
          height = top.height;
          color = top.color;
          depth = Math.min(12, top.depth);
        }
        heights[(lz + 1) * CHUNK_SIZE + lx] = height;
        if (lz >= 0) {
          colors[lz * CHUNK_SIZE + lx] = color;
          depths[lz * CHUNK_SIZE + lx] = depth;
        }
      }
    }
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = lz * CHUNK_SIZE + lx;
        const c = shade(
          colors[i]!,
          heights[(lz + 1) * CHUNK_SIZE + lx]!,
          heights[lz * CHUNK_SIZE + lx]!,
          depths[i],
        );
        pixels.set(c, i * 3);
      }
    }
    return { pixels, real };
  }
}

/** Draws the map around (x, z) into a canvas; `scale` = blocks per pixel. */
export function drawMap(
  canvas: HTMLCanvasElement,
  tiles: MapTiles,
  x: number,
  z: number,
  scale: number,
  markers: readonly MapMarker[],
): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const image = ctx.createImageData(w, h);
  const data = image.data;
  for (let py = 0; py < h; py++) {
    const wz = Math.floor(z + (py - h / 2) * scale);
    const cz = chunkOf(wz);
    const lz = wz - cz * CHUNK_SIZE;
    for (let px = 0; px < w; px++) {
      const wx = Math.floor(x + (px - w / 2) * scale);
      const cx = chunkOf(wx);
      const tile = tiles.get(cx, cz);
      const o = (py * w + px) * 4;
      if (!tile) {
        // Not drawn yet: a soft grey.
        data[o] = data[o + 1] = data[o + 2] = 70;
        data[o + 3] = 255;
        continue;
      }
      const i = (lz * CHUNK_SIZE + (wx - cx * CHUNK_SIZE)) * 3;
      data[o] = tile.pixels[i]!;
      data[o + 1] = tile.pixels[i + 1]!;
      data[o + 2] = tile.pixels[i + 2]!;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const toScreen = (mx: number, mz: number): [number, number] => [
    w / 2 + (mx - x) / scale,
    h / 2 + (mz - z) / scale,
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const m of markers) {
    const [sx, sy] = toScreen(m.x, m.z);
    const edge = 8;
    const cx = Math.max(edge, Math.min(w - edge, sx));
    const cy = Math.max(edge, Math.min(h - edge, sy));
    if (m.icon === 'me') {
      // A white arrow pointing where you look (yaw 0 = north, up on the map).
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-(m.yaw ?? 0));
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 7);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.font = `${Math.round(MAP.iconSize * (canvas.dataset.big ? 1.4 : 1))}px sans-serif`;
    ctx.fillText(m.icon, cx, cy);
    if (m.label && canvas.dataset.big) {
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(m.label, cx, cy + 16);
      ctx.fillText(m.label, cx, cy + 16);
    }
  }
  // North is up.
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeText('P', w / 2, 10);
  ctx.fillText('P', w / 2, 10);
}

/** Villages whose middle is inside the map (to show 🏘️). */
export function villagesIn(
  world: VoxelWorld,
  x: number,
  z: number,
  radius: number,
): { x: number; z: number }[] {
  const seen = new Map<string, { x: number; z: number }>();
  const step = VILLAGES.regionSize;
  for (let gx = x - radius - step; gx <= x + radius + step; gx += step) {
    for (let gz = z - radius - step; gz <= z + radius + step; gz += step) {
      for (const v of world.terrain.villagesAround(gx, gz)) {
        if (Math.abs(v.x - x) > radius || Math.abs(v.z - z) > radius) continue;
        seen.set(`${v.x},${v.z}`, { x: v.x, z: v.z });
      }
    }
  }
  return [...seen.values()];
}
