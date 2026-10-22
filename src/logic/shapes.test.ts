import { describe, expect, it } from 'vitest';
import { BUILDER } from '../config';
import { AIR, PLANKS, STONE } from './blocks';
import { BLUEPRINTS, findBlueprint } from './blueprints';
import {
  centerBuild,
  expandShapes,
  facingFromYaw,
  parseShapes,
  placeBuild,
  type BuildBlock,
} from './shapes';

describe('shapes', () => {
  it('fills a box', () => {
    const blocks = expandShapes([{ shape: 'box', block: 'stone', from: [0, 0, 0], to: [2, 1, 2] }]);
    expect(blocks.length).toBe(3 * 2 * 3);
    expect(blocks.every((b) => b[3] === STONE)).toBe(true);
  });

  it('makes walls without the middle', () => {
    const blocks = expandShapes([
      { shape: 'walls', block: 'planks', from: [0, 0, 0], to: [4, 0, 4] },
    ]);
    expect(blocks.length).toBe(25 - 9);
  });

  it('lets air shapes cut holes', () => {
    const blocks = expandShapes([
      { shape: 'box', block: 'planks', from: [0, 0, 0], to: [2, 2, 0] },
      { shape: 'box', block: 'air', from: [1, 0, 0], to: [1, 1, 0] },
    ]);
    const door = blocks.filter((b) => b[3] === AIR);
    expect(door.length).toBe(2);
    expect(blocks.filter((b) => b[3] === PLANKS).length).toBe(7);
  });

  it('makes a stepped pyramid', () => {
    const blocks = expandShapes([
      { shape: 'pyramid', block: 'sand', center: [0, 0, 0], radius: 2 },
    ]);
    expect(blocks.length).toBe(25 + 9 + 1);
  });

  it('throws away broken or unknown shapes from the AI', () => {
    const shapes = parseShapes({
      shapes: [
        { shape: 'box', block: 'stone', from: [0, 0, 0], to: [1, 1, 1] },
        { shape: 'rocket', block: 'stone' },
        { shape: 'box', block: 'rainbow', from: [0, 0, 0], to: [1, 1, 1] },
        { shape: 'box', block: 'stone', from: [0, 0, 0], to: [100, 1, 1] },
        { shape: 'sphere', block: 'gold', center: [0, 5, 0], radius: 500 },
      ],
    });
    expect(shapes.map((s) => s.shape)).toEqual(['box', 'sphere']);
    expect(shapes[1]).toMatchObject({ radius: BUILDER.maxShapeSize / 2 });
  });

  it('never makes more than the block limit', () => {
    const shapes = parseShapes(
      Array.from({ length: 20 }, (_, i) => ({
        shape: 'box',
        block: 'stone',
        from: [-16, i, -16],
        to: [7, i, 7],
      })),
    );
    expect(expandShapes(shapes).length).toBeLessThanOrEqual(BUILDER.maxBlocks);
  });

  it('turns builds to face where the player looks', () => {
    const one: BuildBlock[] = [[1, 0, 2, STONE]];
    expect(placeBuild(one, [10, 5, 10], 0)).toEqual([[11, 5, 8, STONE]]);
    expect(placeBuild(one, [10, 5, 10], 1)).toEqual([[12, 5, 11, STONE]]);
    expect(placeBuild(one, [10, 5, 10], 2)).toEqual([[9, 5, 12, STONE]]);
    expect(placeBuild(one, [10, 5, 10], 3)).toEqual([[8, 5, 9, STONE]]);
    expect(facingFromYaw(0)).toBe(0);
    expect(facingFromYaw(-Math.PI / 2)).toBe(1);
    expect(facingFromYaw(Math.PI)).toBe(2);
    expect(facingFromYaw(Math.PI / 2)).toBe(3);
  });

  it('centres a build in front of the player', () => {
    const centred = centerBuild([
      [4, 0, 3, STONE],
      [8, 2, 5, STONE],
    ]);
    expect(centred).toEqual([
      [-2, 0, 0, STONE],
      [2, 2, 2, STONE],
    ]);
  });

  it('has working ready-made builds', () => {
    for (const blueprint of BLUEPRINTS) {
      expect(parseShapes([...blueprint.shapes]).length).toBe(blueprint.shapes.length);
      expect(expandShapes(blueprint.shapes).length).toBeGreaterThan(10);
    }
    expect(findBlueprint('iso linna')?.id).toBe('castle');
    expect(findBlueprint('Talo järven rannalle')?.id).toBe('house');
    expect(findBlueprint('avaruusasema')).toBeUndefined();
  });
});
