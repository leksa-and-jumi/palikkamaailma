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
const DT = 0.05;
type Api = ReturnType<typeof fakeApi>;

/** A player with every trophy, in a world of its own (unless one is given). */
function player(api = fakeApi()): Api {
  api.night = false;
  if (!api.trophies.includes('halloween-master')) api.trophies.push(...ALL);
  return api;
}

/** Ticks the mod until Ikiyö is here (it can come by day too). */
function summon(api = player()): Api {
  resetHalloween();
  halloween.onTag!(api, 'me', 'all-trophies');
  // First the story is told (about three minutes), then it rises.
  for (let i = 0; i < 8000 && !api.actors.has('ikiyo'); i++) halloween.tick!(api, DT);
  return api;
}

/**
 * Plays for a while: hits the giant whenever it can be seen (as `by`),
 * until `until` is true. Returns true if it got there.
 */
function play(api: Api, seconds: number, until: () => boolean, by = 'me', hit = true): boolean {
  let swing = 0;
  for (let t = 0; t < seconds; t += DT) {
    if (until()) return true;
    halloween.tick!(api, DT);
    swing -= DT;
    if (hit && swing <= 0 && api.actors.get('ikiyo')?.visible !== false) {
      swing = 0.3;
      halloween.onHitActor!(api, 'ikiyo', 7, by);
    }
  }
  return until();
}

const said = (api: Api, text: string) => api.lines.some((l) => l.includes(text));

describe('Ikiyö', () => {
  it('only comes to those with every trophy', () => {
    resetHalloween();
    const api = fakeApi();
    api.night = false;
    for (let i = 0; i < 2000; i++) halloween.tick!(api, DT);
    expect(api.actors.has('ikiyo')).toBe(false);
  });

  it('tells the whole diary story the first time in each world, later only a warning', () => {
    const api = summon();
    expect(api.lines.find((l) => !l.startsWith('{'))).toContain('Tämä maailma ei ole ensimmäinen');
    expect(said(api, 'eri käsialalla')).toBe(true);
    expect(api.toasts).toContain('👤 ??? liittyi maailmaan.');
    expect(api.lines).toContain('{whispers} Nyt… on… sinun… {screams} VUOROSI!');
    // It comes again to the same world: no whole story this time.
    halloween.commands![0]!.run(api, 'lopeta');
    const before = api.lines.length;
    resetHalloween();
    halloween.onTag!(api, 'me', 'all-trophies');
    for (let i = 0; i < 8000 && !api.actors.has('ikiyo'); i++) halloween.tick!(api, DT);
    expect(api.actors.has('ikiyo')).toBe(true);
    const later = api.lines.slice(before);
    expect(later.some((l) => l.includes('Tämä maailma ei ole ensimmäinen'))).toBe(false);
    // A new world (trophies stay: they belong to the player): the story starts from the beginning.
    const other = fakeApi();
    other.trophies.push(...api.trophies);
    summon(player(other));
    expect(said(other, 'Tämä maailma ei ole ensimmäinen')).toBe(true);
  });

  it('goes quiet, then screams in your face, and its neck bites', () => {
    const api = summon();
    let wentQuiet = false;
    for (let i = 0; i < 20 * 90; i++) {
      halloween.tick!(api, DT);
      if (api.mood && api.mood.music === undefined) wentQuiet = true;
    }
    expect(wentQuiet).toBe(true);
    expect(api.lines.some((l) => /HHHAAA|KIIII|SINÄÄÄ|GRRRAAA|LÖYSIN|PÖÖ|KOKO AJAN/.test(l))).toBe(
      true,
    );
    expect(api.acts).toContainEqual(['head', 'attack']);
    expect(api.screamers).toBeGreaterThan(0);
    expect(api.hurts).toBeGreaterThan(0);
    // The neck is a chain of pieces.
    expect(api.actors.has('n0')).toBe(true);
    expect(api.actors.has('head')).toBe(true);
  });

  it('leaves now and then to play hide and seek, and finds you', () => {
    const api = summon();
    let hidden = false;
    expect(
      play(
        api,
        120,
        () => {
          if (api.boss === '👁️ ???') hidden = true;
          return hidden && api.boss === '👁️ Ikiyö';
        },
        'me',
        false,
      ),
    ).toBe(true);
    expect(said(api, 'piilosta') || said(api, 'lasken') || said(api, 'menenkö')).toBe(true);
    expect(said(api, 'Kuuma')).toBe(true);
  });

  it('takes all your things at a tenth, the lost ones whisper, and it begs… then tricks you', () => {
    const api = summon();
    expect(play(api, 300, () => api.stripped.has('me'))).toBe(true);
    expect(api.toasts).toContain('👁️ Ikiyö vei kaikki tavarasi!');
    // Gone: the ones it took whisper in the dark, then it comes back.
    expect(play(api, 200, () => said(api, 'TÄÄLTÄ TULLAAN'))).toBe(true);
    expect(said(api, 'Katso itseäsi')).toBe(true);
    expect(said(api, 'Psst. Hei. Kuuletko meitä?')).toBe(true);
    expect(said(api, 'Miekan. Haarniskan.')).toBe(true);
    // One hit from the end it begs, and gives everything back.
    expect(play(api, 200, () => said(api, 'Armoa… armoa'))).toBe(true);
    expect(play(api, 60, () => !api.stripped.has('me'))).toBe(true);
    // Hitting it now does nothing without the crown: it crawls away…
    expect(play(api, 120, () => api.boss === null)).toBe(true);
    expect(api.trophies).not.toContain('halloween-ikiyo');
    // …and comes back with all its life.
    expect(
      play(api, 60, () => said(api, 'HUIJASIN') || said(api, 'EN TUNNE ARMOA'), 'me', false),
    ).toBe(true);
    expect(api.boss).toBe('👁️ Ikiyö');
    // The second time it begs, it sinks into the ground to charge up.
    expect(play(api, 400, () => !api.actors.has('ikiyo'))).toBe(true);
    expect(api.toasts.some((t) => t.includes('lataa voimiaan'))).toBe(true);
    expect(api.trophies).not.toContain('halloween-ikiyo');
  });

  it('only the one wearing the dawn crown can strike the last blow', () => {
    const api = player();
    const crown = halloween.commands!.find((c) => c.names.includes('aamunkoitto'))!;
    expect(crown.hidden).toBe(true);
    // It is yours only: it runs on your own computer, and shows a crown in the corner.
    expect(crown.local).toBe(true);
    crown.run(api, '');
    halloween.localTick!(api, DT);
    expect(api.cornerIcon).toBe('👑');
    expect(halloween.tags!(api)).toContain('dawn');
    // Someone else (no crown) is there too.
    api.others.push({ ...api.player, id: 'p2', x: 2 });
    summon(api);
    // It begs, and sees the crown's light (the other one does the fighting).
    expect(play(api, 600, () => said(api, 'EI VALOA'), 'p2')).toBe(true);
    play(api, 8, () => false, 'p2');
    expect(said(api, 'Armoa… armoa')).toBe(true);
    expect(api.trophies).not.toContain('halloween-ikiyo');
    play(api, 2, () => false, 'me');
    expect(api.trophies).toContain('halloween-ikiyo');
    for (let i = 0; i < 20; i++) halloween.tick!(api, DT);
    expect(api.actors.has('ikiyo')).toBe(false);
    // The dawn beat it here: it never comes to this world again.
    halloween.localTick!(api, DT);
    expect(api.badge).toBeNull();
    halloween.commands![0]!.run(api, 'ikiyö');
    expect(api.toasts.at(-1)).toContain('Aamu voitti Ikiyön');
    // Say it again and the crown comes off.
    crown.run(api, '');
    halloween.localTick!(api, DT);
    expect(api.cornerIcon).toBeNull();
  });

  it('sometimes comes as a friendly stranger who changes into it', () => {
    const api = player();
    resetHalloween();
    halloween.commands![0]!.run(api, 'muukalainen');
    for (let i = 0; i < 40 && !api.actors.has('stranger'); i++) halloween.tick!(api, DT);
    expect(api.actors.has('stranger')).toBe(true);
    for (let i = 0; i < 20 * 120 && !api.actors.has('ikiyo'); i++) halloween.tick!(api, DT);
    expect(said(api, 'Älä pelkää, minä olen ystävä')).toBe(true);
    expect(said(api, 'MINÄ EN OLE KILTTI')).toBe(true);
    expect(api.actors.has('stranger')).toBe(false);
    expect(api.actors.has('ikiyo')).toBe(true);
  });

  it('marks those with every trophy, and the six no longer come for them', () => {
    resetHalloween();
    const api = fakeApi();
    api.trophies.push(...ALL);
    halloween.localTick!(api, DT);
    expect(api.badge).toBe('Ikiyö on merkinnyt sinut');
    // A night goes by: no pumpkin king, only (after the story) Ikiyö.
    const old = ['king', 'maiden', 'count', 'captain', 'queen', 'silent'];
    for (let i = 0; i < 20 * 40; i++) halloween.tick!(api, DT);
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
      halloween.tick!(api, DT);
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
