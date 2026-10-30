import { describe, expect, it } from 'vitest';
import { bowPower, segmentHit } from './arrows';

describe('arrows', () => {
  it('a barely drawn bow does not shoot, a full one shoots hardest', () => {
    expect(bowPower(0.05)).toBe(0);
    expect(bowPower(0.5)).toBeGreaterThan(0.3);
    expect(bowPower(1)).toBe(1);
    expect(bowPower(3)).toBe(1);
  });

  it('finds where an arrow hits a box', () => {
    const t = segmentHit([0, 1, 0], [0, 0, -10], [-0.5, 0, -5.5], [0.5, 2, -4.5]);
    expect(t).toBeCloseTo(0.45);
    expect(segmentHit([0, 5, 0], [0, 0, -10], [-0.5, 0, -5.5], [0.5, 2, -4.5])).toBeNull();
  });
});
