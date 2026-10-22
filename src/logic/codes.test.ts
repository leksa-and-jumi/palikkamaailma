import { describe, expect, it } from 'vitest';
import { CODE_WORDS } from '../config';
import { isValidWorldCode, makeWorldCode, normalizeWorldCode, seedFromCode } from './codes';
import { mulberry32 } from './noise';

describe('world codes', () => {
  it('has 64 different words', () => {
    expect(new Set(CODE_WORDS).size).toBe(64);
  });

  it('makes valid codes with two different words', () => {
    const random = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const code = makeWorldCode(random);
      expect(isValidWorldCode(code)).toBe(true);
      const [a, b] = code.split('-');
      expect(a).not.toBe(b);
    }
  });

  it('understands codes typed in many ways', () => {
    expect(normalizeWorldCode('kala puu 42')).toBe('KALA-PUU-42');
    expect(normalizeWorldCode(' Kala-Puu-07 ')).toBe('KALA-PUU-7');
    expect(normalizeWorldCode('kala-puu')).toBeNull();
    expect(normalizeWorldCode('xyz-puu-1')).toBeNull();
    expect(normalizeWorldCode('kala-puu-123')).toBeNull();
  });

  it('gives each code its own seed', () => {
    expect(seedFromCode('KALA-PUU-1')).not.toBe(seedFromCode('KALA-PUU-2'));
  });
});
