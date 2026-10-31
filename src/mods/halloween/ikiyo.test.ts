import { describe, expect, it } from 'vitest';
import { fakeApi } from '../fakeApi';
import { halloween, resetHalloween } from './index';

const ALL = [
  'halloween-pumpkin',
  'halloween-mist',
  'halloween-count',
  'halloween-captain',
  'halloween-spider',
  'halloween-silent',
  'halloween-master',
];

/** Ticks the mod until Ikiyö is here (it can come by day too). */
function summon() {
  resetHalloween();
  const api = fakeApi();
  api.night = false;
  api.trophies.push(...ALL);
  halloween.onTag!(api, 'me', 'all-trophies');
  for (let i = 0; i < 2000 && !api.actors.has('ikiyo'); i++) halloween.tick!(api, 0.05);
  return api;
}

/** Hits the giant a lot (from close, between its attacks). */
function beat(api: ReturnType<typeof fakeApi>) {
  for (let i = 0; i < 400; i++) {
    halloween.onHitActor!(api, 'ikiyo', 7);
    halloween.tick!(api, 0.05);
  }
}

describe('Ikiyö', () => {
  it('only comes to those with every trophy', () => {
    resetHalloween();
    const api = fakeApi();
    api.night = false;
    for (let i = 0; i < 2000; i++) halloween.tick!(api, 0.05);
    expect(api.actors.has('ikiyo')).toBe(false);
  });

  it('comes by day, shakes the screen and cannot be beaten', () => {
    const api = summon();
    expect(api.actors.has('ikiyo')).toBe(true);
    expect(api.shakes).toBeGreaterThan(0);
    beat(api);
    for (let i = 0; i < 400 && api.actors.has('ikiyo'); i++) halloween.tick!(api, 0.05);
    expect(api.actors.has('ikiyo')).toBe(false);
    expect(api.trophies).not.toContain('halloween-ikiyo');
    expect(api.toasts.some((t) => t.includes('lataa voimiaan'))).toBe(true);
  });

  it('the secret word lets you take its last life', () => {
    const api = summon();
    const secret = halloween.commands!.find((c) => c.names.includes('aamunkoitto'))!;
    expect(secret.hidden).toBe(true);
    secret.run(api, '');
    beat(api);
    expect(api.trophies).toContain('halloween-ikiyo');
    expect(api.actors.has('ikiyo')).toBe(false);
  });

  it('goes quiet, then screams in your face, and its neck bites', () => {
    const api = summon();
    let wentQuiet = false;
    for (let i = 0; i < 20 * 90; i++) {
      halloween.tick!(api, 0.05);
      if (api.mood && api.mood.music === undefined) wentQuiet = true;
    }
    expect(wentQuiet).toBe(true);
    expect(api.lines.some((l) => /HHHAAA|KIIII|SINÄÄÄ|GRRRAAA/.test(l))).toBe(true);
    expect(api.acts).toContainEqual(['head', 'attack']);
    expect(api.hurts).toBeGreaterThan(0);
    // The neck is a chain of pieces.
    expect(api.actors.has('n0')).toBe(true);
    expect(api.actors.has('head')).toBe(true);
  });
});
