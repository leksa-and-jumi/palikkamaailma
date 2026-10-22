import { describe, expect, it } from 'vitest';
import { DROPS } from '../config';
import { canPickUp, isExpired, liveDrop, stepDrop } from './drops';

const floor = (_x: number, y: number) => y <= 10;

function drop(y: number) {
  return liveDrop({ id: 'a', item: { id: 1, count: 1 }, p: [5.5, y, 5.5], v: [0, 0, 0], time: 0 });
}

describe('drops', () => {
  it('falls and lands on the ground', () => {
    const d = drop(15);
    for (let i = 0; i < 120; i++) stepDrop(d, 1 / 60, floor);
    expect(d.resting).toBe(true);
    expect(d.p[1]).toBeCloseTo(11.125);
  });

  it('starts falling again when the ground is removed', () => {
    const d = drop(15);
    for (let i = 0; i < 120; i++) stepDrop(d, 1 / 60, floor);
    for (let i = 0; i < 60; i++) stepDrop(d, 1 / 60, (_x, y) => y <= 5);
    expect(d.p[1]).toBeLessThan(11);
  });

  it('can be picked up when close, after a moment', () => {
    const d = drop(11.2);
    expect(canPickUp(d, 5.5, 11, 5.5)).toBe(false);
    d.age = DROPS.pickupDelay + 0.1;
    expect(canPickUp(d, 5.5, 11, 5.5)).toBe(true);
    expect(canPickUp(d, 15.5, 11, 5.5)).toBe(false);
  });

  it('disappears after a while', () => {
    expect(isExpired(drop(1), DROPS.lifetime * 1000 + 1)).toBe(true);
    expect(isExpired(drop(1), 1000)).toBe(false);
  });
});
