import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../logic/protocol';
import { fakeApi, readOnlyApi } from './fakeApi';
import { halloween, resetHalloween } from './halloween';
import { ModManager } from './manager';
import { ModFollower, ModRecorder, type ModCall } from './share';
import { ALL_SPECS } from './halloween/models';

const specs = new Map(ALL_SPECS.map((s) => [s.id!, s]));

describe('shared mods', () => {
  it('what the host shows is played back on the other computer', () => {
    const host = fakeApi();
    const recorder = new ModRecorder('halloween');
    const api = recorder.wrap(host);
    api.atmosphere({ fogColor: 0x112233, rain: true });
    api.actor('king', ALL_SPECS[0]!, { x: 3, y: 50, z: 4, yaw: 1 });
    api.bossBar('🎃 Kurpitsakuningas', 0.5);
    api.say({ emoji: '🎃', name: 'Kurpitsakuningas' }, 'Hohhoo!');
    const sync = recorder.take()!;
    // It goes through the room's checks unchanged.
    const msg = parseClientMessage(
      JSON.stringify({ t: 'move', p: [0, 50, 0], yaw: 0, pitch: 0, mod: [sync] }),
    );
    expect(msg?.t === 'move' && msg.mod?.[0]).toEqual(sync);

    const other = fakeApi();
    const follower = new ModFollower(specs, () => undefined);
    follower.apply(sync, other);
    expect(other.actors.get('king')).toMatchObject({ x: 3, z: 4 });
    expect(other.mood).toEqual({ fogColor: 0x112233, rain: true });
    expect(other.boss).toBe('🎃 Kurpitsakuningas');
    expect(other.lines).toEqual(['Hohhoo!']);
    // The same message twice does not repeat the speech.
    follower.apply(sync, other);
    expect(other.lines).toHaveLength(1);
    // When the host goes quiet, everything goes away.
    follower.tick(other, 5);
    expect(other.actors.size).toBe(0);
    expect(other.mood).toBeNull();
  });

  it('everyone who fought together gets the trophy', () => {
    const recorder = new ModRecorder('halloween');
    recorder.wrap(fakeApi()).trophy('halloween-pumpkin');
    const other = fakeApi();
    new ModFollower(specs, () => undefined).apply(recorder.take()!, other);
    expect(other.trophies).toEqual(['halloween-pumpkin']);
  });

  it('a follower asks the host to hit, the host runs the mod', () => {
    resetHalloween();
    const calls: ModCall[] = [];
    let host = false;
    const mods = new ModManager(fakeApi(), { isHost: () => host, callHost: (c) => calls.push(c) });
    mods.set(['halloween']);
    mods.hitActor('halloween:king', 5);
    expect(calls).toEqual([{ mod: 'halloween', call: 'hit', actor: 'king', damage: 5 }]);
    expect(mods.runCommand('kauhu', '')).toBe(true);
    expect(calls[1]).toMatchObject({ call: 'command', name: 'kauhu' });
    host = true;
    // Only the toast from turning the mod on is waiting.
    expect(mods.takeSync()[0]?.a).toEqual([]);
    expect(mods.takeSync()).toEqual([]);
    mods.receiveCall({ mod: 'halloween', call: 'command', name: 'kauhu', args: '' });
    mods.tick(0.1);
    expect(mods.takeSync()[0]?.a.length).toBeGreaterThan(0);
  });

  it('the boss goes after the nearest player in survival, wherever they are', () => {
    resetHalloween();
    const api = fakeApi();
    api.mode = 'creative';
    api.player.safe = true;
    api.others.push({ ...api.player, id: 'leo', safe: false, x: 30, z: 30 });
    // Through a read-only api, like the game's (player is a getter there).
    halloween.commands![0]!.run(readOnlyApi(api), '');
    // The character came for Leo, near Leo, not for the creative host.
    const king = api.actors.get('king')!;
    expect(Math.hypot(king.x - 30, king.z - 30)).toBeLessThan(15);
    for (let i = 0; i < 400 && api.hurtOthers.length === 0; i++)
      halloween.tick!(readOnlyApi(api), 0.05);
    expect(api.hurtOthers[0]?.[0]).toBe('leo');
    expect(api.hurts).toBe(0);
  });

  it('a follower with every trophy tells the host, so Ikiyö may come for them', () => {
    resetHalloween();
    const calls: ModCall[] = [];
    const api = fakeApi();
    api.trophies.push('halloween-master');
    const mods = new ModManager(api, { isHost: () => false, callHost: (c) => calls.push(c) });
    mods.set(['halloween']);
    mods.tick(2);
    expect(calls).toContainEqual({ mod: 'halloween', call: 'tag', name: 'all-trophies' });
  });
});
