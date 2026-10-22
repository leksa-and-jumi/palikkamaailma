import { describe, expect, it } from 'vitest';
import { raycast } from './raycast';

describe('raycast', () => {
  const solidAt = (bx: number, by: number, bz: number) => (x: number, y: number, z: number) =>
    x === bx && y === by && z === bz;

  it('finds the block in front and the side that was hit', () => {
    const hit = raycast(0.5, 0.5, 0.5, 1, 0, 0, 10, solidAt(4, 0, 0));
    expect(hit).toMatchObject({ x: 4, y: 0, z: 0, nx: -1, ny: 0, nz: 0 });
    expect(hit!.distance).toBeCloseTo(3.5);
  });

  it('hits the top of a block when looking down', () => {
    const hit = raycast(2.5, 5.5, 2.5, 0, -1, 0, 10, solidAt(2, 1, 2));
    expect(hit).toMatchObject({ x: 2, y: 1, z: 2, nx: 0, ny: 1, nz: 0 });
  });

  it('gives up when the block is too far', () => {
    expect(raycast(0.5, 0.5, 0.5, 1, 0, 0, 3, solidAt(8, 0, 0))).toBeNull();
  });

  it('works diagonally', () => {
    const hit = raycast(0.5, 0.5, 0.5, 1, 1, 1, 10, solidAt(3, 3, 3));
    expect(hit).not.toBeNull();
    expect([hit!.x, hit!.y, hit!.z]).toEqual([3, 3, 3]);
  });
});
