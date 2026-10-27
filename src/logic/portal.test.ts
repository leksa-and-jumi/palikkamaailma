import { describe, expect, it } from 'vitest';
import { AIR, NETHER_PORTAL, OBSIDIAN, STONE } from './blocks';
import { fallingWith } from './blockShapes';
import { buildPortal, findPortal, lightPortal } from './portal';

/** A frame along x: inside x 0–1, y 1–3 at z 0 (corners left out, like Minecraft allows). */
function framed(extra: Record<string, number> = {}) {
  const blocks: Record<string, number> = {};
  for (const x of [0, 1]) {
    blocks[`${x},0,0`] = OBSIDIAN;
    blocks[`${x},4,0`] = OBSIDIAN;
  }
  for (let y = 1; y <= 3; y++) {
    blocks[`-1,${y},0`] = OBSIDIAN;
    blocks[`2,${y},0`] = OBSIDIAN;
  }
  Object.assign(blocks, extra);
  return (x: number, y: number, z: number) => blocks[`${x},${y},${z}`] ?? AIR;
}

describe('nether portals', () => {
  it('lights a complete frame from any inside block', () => {
    const edits = lightPortal(framed(), 1, 2, 0)!;
    expect(edits).toHaveLength(6);
    expect(edits).toContainEqual([0, 1, 0, NETHER_PORTAL]);
    expect(edits).toContainEqual([1, 3, 0, NETHER_PORTAL]);
  });

  it('does not light a broken or filled frame', () => {
    expect(lightPortal(framed({ '2,2,0': AIR }), 0, 1, 0)).toBeNull();
    expect(lightPortal(framed({ '1,2,0': STONE }), 0, 1, 0)).toBeNull();
  });

  it('goes out when the frame breaks', () => {
    const get = framed();
    const lit = new Map(lightPortal(get, 0, 1, 0)!.map((e) => [`${e[0]},${e[1]},${e[2]}`, e[3]]));
    const withPortal = (x: number, y: number, z: number) =>
      lit.get(`${x},${y},${z}`) ?? get(x, y, z);
    expect(fallingWith(withPortal, [[-1, 2, 0]])).toHaveLength(6);
  });

  it('builds a new portal and finds it again', () => {
    const blocks = new Map(buildPortal(10, 40, 5).map((e) => [`${e[0]},${e[1]},${e[2]}`, e[3]]));
    const get = (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? AIR;
    expect(get(10, 40, 5)).toBe(NETHER_PORTAL);
    expect(get(9, 41, 5)).toBe(OBSIDIAN);
    expect(findPortal(get, 14, 9, 8, 100)).toEqual([11, 40, 5]);
    expect(findPortal(get, 40, 40, 8, 100)).toBeNull();
  });
});
