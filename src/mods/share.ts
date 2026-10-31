// Shared mods in multiplayer. One player – the host, the smallest id in
// the world – runs a shared mod. Everything its characters do on screen
// (where they stand, the mood, the boss bar, what they say) is recorded and
// travels in the host's position messages; the others play it back, so the
// brothers see the same boss and fight it together. Nothing is stored.

import type { ActorAct, ActorSpec, ActorState, Atmosphere, ModApi, ModSound } from './types';

/** One character: id, spec id, x, y, z, yaw, visible (1/0), scale, label. */
export type SyncActor = [string, string, number, number, number, number, number, number, string];

/** Something that happens once: [number, kind, ...]. */
export type SyncEvent =
  | [number, 'say', string, string, string, string]
  | [number, 'flash', string, number]
  | [number, 'sound', ModSound]
  | [number, 'toast', string]
  | [number, 'trophy', string]
  | [number, 'sp', number, number, number, number]
  | [number, 'an', string, ActorAct]
  | [number, 'sk', number, number];

/** What the host sends about one shared mod. */
export interface ModSync {
  m: string;
  a: SyncActor[];
  at: Atmosphere | null;
  b: [string, number] | null;
  e: SyncEvent[];
}

/** A follower asks the host to do something in a shared mod. */
export interface ModCall {
  mod: string;
  call: 'hit' | 'command' | 'tag';
  /** The character hit (without the mod's prefix) and how hard. */
  actor?: string;
  damage?: number;
  /** A chat command and its words. */
  name?: string;
  args?: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
/** Sparkles are many: at most this many go in one message. */
const MAX_SPARKS = 24;

/** On the host: watches what a shared mod shows and says. */
export class ModRecorder {
  private readonly actors = new Map<string, SyncActor>();
  private atmosphere: Atmosphere | null = null;
  private boss: [string, number] | null = null;
  private events: SyncEvent[] = [];
  private seq = 0;
  private sparks = 0;

  constructor(private readonly modId: string) {}

  private event(e: SyncEvent extends [number, ...infer R] ? R : never): void {
    this.events.push([++this.seq, ...e] as SyncEvent);
  }

  /** The mod's api, but everything visible is also written down. */
  wrap(api: ModApi): ModApi {
    return Object.assign(Object.create(api) as ModApi, {
      actor: (id: string, spec: ActorSpec, s: ActorState) => {
        api.actor(id, spec, s);
        this.actors.set(id, [
          id,
          spec.id ?? '',
          r2(s.x),
          r2(s.y),
          r2(s.z),
          r2(s.yaw),
          s.visible === false ? 0 : 1,
          r2(s.scale ?? 1),
          s.label ?? '',
        ]);
      },
      removeActor: (id: string) => {
        api.removeActor(id);
        this.actors.delete(id);
      },
      atmosphere: (a: Atmosphere | null) => {
        api.atmosphere(a);
        this.atmosphere = a;
      },
      bossBar: (name: string | null, health = 1) => {
        api.bossBar(name, health);
        this.boss = name === null ? null : [name, r2(health)];
      },
      say: (who: { emoji: string; name: string; color?: string }, text: string) => {
        api.say(who, text);
        this.event(['say', who.emoji, who.name, who.color ?? '#ffd66b', text]);
      },
      flash: (color: string, seconds: number) => {
        api.flash(color, seconds);
        this.event(['flash', color, seconds]);
      },
      shake: (amount: number, seconds: number) => {
        api.shake(amount, seconds);
        this.event(['sk', amount, seconds]);
      },
      sound: (name: ModSound) => {
        api.sound(name);
        this.event(['sound', name]);
      },
      toast: (text: string) => {
        api.toast(text);
        this.event(['toast', text]);
      },
      trophy: (id: string) => {
        this.event(['trophy', id]);
        return api.trophy(id);
      },
      animate: (id: string, act: ActorAct) => {
        api.animate(id, act);
        this.event(['an', id, act]);
      },
      sparkle: (x: number, y: number, z: number, color: number) => {
        api.sparkle(x, y, z, color);
        if (this.sparks++ < MAX_SPARKS) this.event(['sp', r2(x), r2(y), r2(z), color]);
      },
    });
  }

  /** What to send now, or null when the mod shows nothing. */
  take(): ModSync | null {
    const events = this.events;
    this.events = [];
    this.sparks = 0;
    if (this.actors.size === 0 && !this.atmosphere && !this.boss && events.length === 0) {
      return null;
    }
    return {
      m: this.modId,
      a: [...this.actors.values()],
      at: this.atmosphere,
      b: this.boss,
      e: events,
    };
  }
}

/** Seconds without news before a host's characters disappear (the host left). */
const TIMEOUT = 3;
/** Only players this close to the action see it. */
const NEAR = 96;

/** On everyone else: plays back what the host's shared mod shows. */
export class ModFollower {
  private shown = new Set<string>();
  private lastSeq = 0;
  private quiet = 0;
  private active = false;

  constructor(
    private readonly specs: ReadonlyMap<string, ActorSpec>,
    /** Called when a trophy is won near you. */
    private readonly onTrophy: (api: ModApi, id: string) => void,
  ) {}

  apply(sync: ModSync, api: ModApi): void {
    this.quiet = 0;
    const p = api.player;
    const near =
      sync.a.length === 0 || sync.a.some((a) => Math.hypot(a[2] - p.x, a[4] - p.z) < NEAR);
    if (!near) {
      this.clear(api);
      return;
    }
    this.active = true;
    const now = new Set<string>();
    for (const [id, specId, x, y, z, yaw, visible, scale, label] of sync.a) {
      const spec = this.specs.get(specId);
      if (!spec) continue;
      now.add(id);
      api.actor(id, spec, {
        x,
        y,
        z,
        yaw,
        visible: visible === 1,
        scale,
        label: label || undefined,
      });
    }
    for (const id of this.shown) if (!now.has(id)) api.removeActor(id);
    this.shown = now;
    api.atmosphere(sync.at);
    api.bossBar(sync.b?.[0] ?? null, sync.b?.[1] ?? 1);
    for (const e of sync.e) {
      if (e[0] <= this.lastSeq && this.lastSeq - e[0] < 1000) continue;
      this.lastSeq = e[0];
      switch (e[1]) {
        case 'say':
          api.say({ emoji: e[2], name: e[3], color: e[4] }, e[5]);
          break;
        case 'flash':
          api.flash(e[2], e[3]);
          break;
        case 'sk':
          api.shake(e[2], e[3]);
          break;
        case 'sound':
          api.sound(e[2]);
          break;
        case 'toast':
          api.toast(e[2]);
          break;
        case 'trophy':
          // Everyone who fought together gets the trophy.
          if (api.trophy(e[2])) api.toast('🏆 Uusi pokaali!');
          this.onTrophy(api, e[2]);
          break;
        case 'sp':
          api.sparkle(e[2], e[3], e[4], e[5]);
          break;
        case 'an':
          api.animate(e[2], e[3]);
          break;
      }
    }
  }

  /** Called every frame: the host went quiet, so the show ends. */
  tick(api: ModApi, dt: number): void {
    if (!this.active) return;
    this.quiet += dt;
    if (this.quiet > TIMEOUT) this.clear(api);
  }

  clear(api: ModApi): void {
    if (!this.active) return;
    for (const id of this.shown) api.removeActor(id);
    this.shown.clear();
    api.atmosphere(null);
    api.bossBar(null);
    this.active = false;
  }
}
