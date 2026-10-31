import { describe, expect, it } from 'vitest';
import { AVATARS } from '../config';
import { LOOKS, extrasFor, lookFor } from './skins';

describe('player looks', () => {
  it('every animal has its own costume', () => {
    for (const a of AVATARS) expect(LOOKS[a.emoji]).toBeDefined();
    expect(new Set(AVATARS.map((a) => LOOKS[a.emoji]!.suit)).size).toBe(AVATARS.length);
  });

  it('costume extras sit on the head or the body, inside a sensible space', () => {
    for (const a of AVATARS) {
      for (const e of extrasFor(lookFor(a.emoji))) {
        expect(['head', 'body']).toContain(e.on);
        expect(e.pos[1]).toBeGreaterThan(5);
        expect(e.pos[1]).toBeLessThan(40);
        for (const v of e.size) expect(v).toBeGreaterThan(0);
      }
    }
    // The fox has ears and a tail, the frog has eyes on its hood.
    const fox = extrasFor(lookFor('🦊')).map((e) => e.name);
    expect(fox).toContain('tail');
    expect(fox.some((n) => n.startsWith('ear'))).toBe(true);
    expect(extrasFor(lookFor('🐸')).some((e) => e.name.startsWith('frogEye'))).toBe(true);
  });
});
