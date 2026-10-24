import { describe, expect, it } from 'vitest';
import { FIREWORKS } from '../config';
import { FIREWORK_KINDS, burst, flightTime, isFireworkKind, randomKind } from './fireworks';
import { ITEMS } from './items';

describe('fireworks', () => {
  it('every kind bursts into sparks', () => {
    FIREWORK_KINDS.forEach((_, kind) => {
      const sparks = burst(kind, 1234);
      expect(sparks.length).toBeGreaterThan(40);
      for (const s of sparks) expect(s.v.every(Number.isFinite)).toBe(true);
    });
  });

  it('the same seed gives the same burst on every computer', () => {
    expect(burst(1, 42)).toEqual(burst(1, 42));
    expect(burst(0, 42)).not.toEqual(burst(0, 43));
  });

  it('flies for a while before bursting', () => {
    for (const seed of [1, 2, 3, 99999]) {
      const t = flightTime(seed);
      expect(t).toBeGreaterThanOrEqual(FIREWORKS.flightMin);
      expect(t).toBeLessThanOrEqual(FIREWORKS.flightMax);
    }
  });

  it('every rocket item has a real kind', () => {
    const rockets = ITEMS.filter((i) => i.special === 'firework');
    expect(rockets.length).toBe(FIREWORK_KINDS.length);
    for (const r of rockets) expect(isFireworkKind(r.firework)).toBe(true);
    expect(isFireworkKind(FIREWORK_KINDS.length)).toBe(false);
    expect(isFireworkKind(randomKind(7))).toBe(true);
  });

  it('turns flat pictures towards the watcher', () => {
    // Facing south (+z): the heart lies in the x-y plane, almost no depth.
    const sparks = burst(4, 5, 0);
    const depth = Math.max(...sparks.map((s) => Math.abs(s.v[2])));
    const width = Math.max(...sparks.map((s) => Math.abs(s.v[0])));
    expect(depth).toBeLessThan(width / 2);
  });
});
