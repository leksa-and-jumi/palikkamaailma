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
  // First the story is told (about three minutes), then it rises.
  for (let i = 0; i < 8000 && !api.actors.has('ikiyo'); i++) halloween.tick!(api, 0.05);
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
    // And faces flash on the screen.
    expect(api.screamers).toBeGreaterThan(0);
    expect(api.hurts).toBeGreaterThan(0);
    // The neck is a chain of pieces.
    expect(api.actors.has('n0')).toBe(true);
    expect(api.actors.has('head')).toBe(true);
  });

  it('tells the diary story first, with strange things happening, then a short warning next time', () => {
    const api = summon();
    const diary = api.lines.filter((l) => !l.startsWith('{'));
    expect(diary[0]).toContain('Tämä maailma ei ole ensimmäinen');
    expect(diary.some((l) => l.includes('eri käsialalla'))).toBe(true);
    expect(api.toasts).toContain('👤 ??? liittyi maailmaan.');
    expect(api.lines).toContain('{whispers} Nyt… on… sinun… {screams} VUOROSI!');
    // It leaves (unbeatable)… and when it comes back, only a short warning.
    for (let i = 0; i < 400; i++) {
      halloween.onHitActor!(api, 'ikiyo', 7);
      halloween.tick!(api, 0.05);
    }
    for (let i = 0; i < 400 && api.actors.has('ikiyo'); i++) halloween.tick!(api, 0.05);
    const before = api.lines.length;
    for (let i = 0; i < 20 * 700 && !api.actors.has('ikiyo'); i++) halloween.tick!(api, 0.05);
    const after = api.lines.slice(before);
    expect(after).toContain('Se palasi. Ne palaavat aina.');
    expect(after.some((l) => l.includes('Tämä maailma ei ole ensimmäinen'))).toBe(false);
  });

  it('marks those with every trophy, and the six no longer come for them', () => {
    resetHalloween();
    const api = fakeApi();
    api.trophies.push(...ALL);
    halloween.localTick!(api, 0.05);
    expect(api.badge).toBe('Ikiyö on merkinnyt sinut');
    // A night goes by: no pumpkin king, only (after the story) Ikiyö.
    const old = ['king', 'maiden', 'count', 'captain', 'queen', 'silent'];
    for (let i = 0; i < 20 * 40; i++) halloween.tick!(api, 0.05);
    expect(old.some((id) => api.actors.has(id))).toBe(false);
    halloween.commands![0]!.run(api, '');
    expect(api.toasts.at(-1)).toContain('merkinnyt');
  });

  it('vanishes in smoke instead of walking, with red eyes and heavy eyelids', () => {
    const api = summon();
    let puffs = 0;
    let eyes = 0;
    let lids = 0;
    let jumps = 0;
    let last = { ...api.actors.get('ikiyo')! };
    for (let i = 0; i < 20 * 30; i++) {
      halloween.tick!(api, 0.05);
      const now = api.actors.get('ikiyo');
      if (now && Math.hypot(now.x - last.x, now.z - last.z) > 2) jumps++;
      if (now) last = { ...now };
      if ([...api.actors.keys()].some((k) => k.startsWith('puff'))) puffs++;
      if ([...api.actors.keys()].some((k) => k.startsWith('eyes'))) eyes++;
      lids = Math.max(lids, api.mood?.eyelids ?? 0);
    }
    expect(jumps).toBeGreaterThan(3);
    expect(puffs).toBeGreaterThan(0);
    expect(eyes).toBeGreaterThan(0);
    expect(lids).toBeGreaterThan(0.1);
  });
});
