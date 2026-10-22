import { describe, expect, it } from 'vitest';
import { createNoise2D, fbm, hash2, hashString, mulberry32 } from './noise';

describe('noise', () => {
  it('gives the same random numbers for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('keeps random numbers between 0 and 1', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashes text and grid points to fixed numbers', () => {
    expect(hashString('KALA-PUU-42')).toBe(hashString('KALA-PUU-42'));
    expect(hashString('KALA-PUU-42')).not.toBe(hashString('KALA-PUU-43'));
    expect(hash2(1, 5, 6)).toBe(hash2(1, 5, 6));
    expect(hash2(1, 5, 6)).not.toBe(hash2(1, 6, 5));
  });

  it('makes smooth noise roughly between -1 and 1', () => {
    const noise = createNoise2D(123);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 2000; i++) {
      const v = fbm(noise, i * 0.137, i * 0.071, 4);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThanOrEqual(-1.01);
    expect(max).toBeLessThanOrEqual(1.01);
    expect(max - min).toBeGreaterThan(0.3);
    // Close points have close values.
    expect(Math.abs(noise(3.5, 4.5) - noise(3.51, 4.5))).toBeLessThan(0.05);
  });
});
