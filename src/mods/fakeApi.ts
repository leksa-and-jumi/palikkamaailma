// For tests: a pretend game that records what a mod does.

import type { ActorState, Atmosphere, ModApi, ModPlayer } from './types';

/** A pretend game for mods: records what they do. */
export function fakeApi() {
  const state = {
    toasts: [] as string[],
    lines: [] as string[],
    sparks: 0,
    hurts: 0,
    trophies: [] as string[],
    actors: new Map<string, ActorState>(),
    mood: null as Atmosphere | null,
    boss: null as string | null,
    mode: 'survival' as 'creative' | 'survival',
    night: true,
    nether: false,
    dead: false,
    /** Other players (multiplayer tests). */
    others: [] as ModPlayer[],
    /** Hurts sent to other players: [id, amount]. */
    hurtOthers: [] as [string, number][],
    slowed: 0,
    get players(): ModPlayer[] {
      return [state.player, ...state.others];
    },
    player: {
      id: 'me',
      safe: false,
      x: 0,
      y: 50,
      z: 0,
      vx: 3,
      vz: 0,
      onGround: true,
      yaw: 0,
      look: [0, 0, -1] as [number, number, number],
    },
    toast(text: string) {
      state.toasts.push(text);
    },
    sparkle() {
      state.sparks++;
    },
    say(_who: unknown, text: string) {
      state.lines.push(text);
    },
    atmosphere(a: Atmosphere | null) {
      state.mood = a;
    },
    flash() {},
    actor(id: string, _spec: unknown, s: ActorState) {
      state.actors.set(id, { ...s });
    },
    removeActor(id: string) {
      state.actors.delete(id);
    },
    bossBar(name: string | null) {
      state.boss = name;
    },
    hurt() {
      state.hurts++;
    },
    hurtPlayer(id: string, amount: number) {
      if (id === 'me') state.hurts++;
      else state.hurtOthers.push([id, amount]);
    },
    effect() {
      state.slowed++;
    },
    effectFor(id: string) {
      if (id === 'me') state.slowed++;
    },
    push() {},
    trophy(id: string) {
      if (state.trophies.includes(id)) return false;
      state.trophies.push(id);
      return true;
    },
    hasTrophy(id: string) {
      return state.trophies.includes(id);
    },
    sound() {},
    isSolid: (_x: number, y: number) => y < 50,
    groundY: () => 50,
  };
  return state satisfies ModApi;
}

/** Like the game's api: player, mode and dead can only be read. */
export function readOnlyApi(api: ModApi): ModApi {
  return Object.create(api, {
    player: { get: () => api.player },
    mode: { get: () => api.mode },
    dead: { get: () => api.dead },
  }) as ModApi;
}
