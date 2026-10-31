import { beforeEach, describe, expect, it } from 'vitest';
import { fakeApi } from '../fakeApi';
import { halloween, resetHalloween } from './index';

const DT = 1 / 20;

/** A brave robot player: looks at the nearest visible character and hits everything often. */
function play(api: ReturnType<typeof fakeApi>, seconds: number, stopWhen: () => boolean): void {
  let swing = 0;
  for (let t = 0; t < seconds && !stopWhen(); t += DT) {
    const visible = [...api.actors.entries()].filter(([, s]) => s.visible !== false);
    const target = visible.sort(
      ([, a], [, b]) =>
        Math.hypot(a.x - api.player.x, a.z - api.player.z) -
        Math.hypot(b.x - api.player.x, b.z - api.player.z),
    )[0];
    if (target) {
      const [, s] = target;
      const dx = s.x - api.player.x;
      const dy = s.y + 1.5 - (api.player.y + 1.6);
      const dz = s.z - api.player.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      api.player.look = [dx / len, dy / len, dz / len];
    }
    halloween.tick!(api, DT);
    swing -= DT;
    if (swing <= 0) {
      swing = 0.4;
      for (const [id, s] of api.actors) {
        if (s.visible !== false) halloween.onHitActor!(api, id.replace(/^halloween:/, ''), 5, 'me');
      }
    }
  }
}

describe('Kauhu-Halloween', () => {
  beforeEach(() => resetHalloween());

  it('nobody comes in creative, and turning the mod off clears everything', () => {
    const api = fakeApi();
    api.mode = 'creative';
    for (let i = 0; i < 2000; i++) halloween.tick!(api, DT);
    expect(api.actors.size).toBe(0);
    api.mode = 'survival';
    halloween.commands![0]!.run(api, '');
    expect(api.actors.size).toBeGreaterThan(0);
    expect(api.mood).not.toBeNull();
    halloween.onDisable!(api);
    expect(api.actors.size).toBe(0);
    expect(api.mood).toBeNull();
    expect(api.boss).toBeNull();
  });

  it('a character comes by itself at night', () => {
    const api = fakeApi();
    for (let i = 0; i < 60 / DT && api.actors.size === 0; i++) halloween.tick!(api, DT);
    expect(api.actors.size).toBeGreaterThan(0);
    expect(api.boss).toContain('Kurpitsakuningas');
  });

  it('all six can be beaten, each gives its trophy, and then the master trophy', () => {
    const api = fakeApi();
    const ids = [
      'halloween-pumpkin',
      'halloween-mist',
      'halloween-count',
      'halloween-captain',
      'halloween-spider',
      'halloween-silent',
    ];
    for (const id of ids) {
      halloween.commands![0]!.run(api, '');
      play(api, 240, () => api.trophies.includes(id));
      expect(api.trophies).toContain(id);
      expect(api.actors.size).toBe(0);
    }
    expect(api.trophies).toContain('halloween-master');
  });
});
