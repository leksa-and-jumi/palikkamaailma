// Which mods are on in this world. Everyone in the world has the same mods:
// the room server remembers the list (alone: this device), and turning a
// mod on or off takes effect at once for everybody.

import { setExtraRecipes } from '../logic/recipes';
import { combineEffects, NO_EFFECTS, type CombinedEffects } from './effects';
import { MODS, modById } from './registry';
import { ModFollower, ModRecorder, type ModCall, type ModSync } from './share';
import type { ActorAct, ActorSpec, ActorState, Mod, ModApi } from './types';

/** Seconds between telling the host your tags. */
const TAG_EVERY = 8;

export class ModManager {
  private enabled: string[] = [];
  private combined: CombinedEffects = NO_EFFECTS;
  /** Called after the list changes (the mods window redraws). */
  onChange: (() => void) | null = null;
  /** Called for each mod turned off (the game clears its characters and mood). */
  onTurnedOff: ((id: string) => void) | null = null;

  private readonly apis = new Map<string, ModApi>();
  private readonly recorders = new Map<string, { recorder: ModRecorder; api: ModApi }>();
  private readonly followers = new Map<string, ModFollower>();
  private wasHost = true;
  private tagTimer = 1;

  constructor(
    private readonly base: ModApi,
    /** Multiplayer: am I the host, and how to ask the host. Alone you are always the host. */
    private readonly net: { isHost(): boolean; callHost(call: ModCall): void; myId?(): string } = {
      isHost: () => true,
      callHost: () => undefined,
      myId: () => 'me',
    },
  ) {}

  /** The api a shared mod runs with on the host: what it shows is recorded for the others. */
  private hostApi(mod: Mod): ModApi {
    if (!mod.shared) return this.apiFor(mod);
    let r = this.recorders.get(mod.id);
    if (!r) {
      const recorder = new ModRecorder(mod.id);
      r = { recorder, api: recorder.wrap(this.apiFor(mod)) };
      this.recorders.set(mod.id, r);
    }
    return r.api;
  }

  private follower(mod: Mod): ModFollower {
    let f = this.followers.get(mod.id);
    if (!f) {
      const specs = new Map((mod.actorSpecs ?? []).map((s) => [s.id ?? '', s]));
      f = new ModFollower(specs, (api, id) => mod.onTrophy?.(api, id));
      this.followers.set(mod.id, f);
    }
    return f;
  }

  /**
   * The api one mod gets: the same as everyone's, but its characters are
   * named "mod-id:name" so two mods never mix them up.
   */
  private apiFor(mod: Mod): ModApi {
    let api = this.apis.get(mod.id);
    if (!api) {
      const base = this.base;
      api = Object.assign(Object.create(base) as ModApi, {
        actor: (id: string, spec: ActorSpec, state: ActorState) =>
          base.actor(`${mod.id}:${id}`, spec, state),
        removeActor: (id: string) => base.removeActor(`${mod.id}:${id}`),
        animate: (id: string, act: ActorAct) => base.animate(`${mod.id}:${id}`, act),
      });
      this.apis.set(mod.id, api);
    }
    return api;
  }

  /** The rules of all mods that are on. */
  get effects(): CombinedEffects {
    return this.combined;
  }

  isOn(id: string): boolean {
    return this.enabled.includes(id);
  }

  /** Mods that are on, in the list's order. */
  get active(): Mod[] {
    return MODS.filter((m) => this.enabled.includes(m.id));
  }

  /** The list of ids to save or send. */
  get ids(): string[] {
    return [...this.enabled];
  }

  /**
   * Sets which mods are on (from the room, a save or the mods window).
   * Unknown ids are kept, so a newer game's mods survive an older one.
   */
  set(ids: readonly string[]): void {
    const next = [...new Set(ids)];
    for (const id of this.enabled) {
      const mod = modById(id);
      if (next.includes(id)) continue;
      if (mod) mod.onDisable?.(this.hostApi(mod));
      if (mod) this.followers.get(id)?.clear(this.apiFor(mod));
      this.onTurnedOff?.(id);
    }
    for (const id of next) {
      const mod = modById(id);
      if (mod && !this.enabled.includes(id)) mod.onEnable?.(this.hostApi(mod));
    }
    this.enabled = next;
    this.combined = combineEffects(this.active);
    setExtraRecipes(this.combined.recipes);
    this.onChange?.();
  }

  toggle(id: string): string[] {
    this.set(this.isOn(id) ? this.enabled.filter((m) => m !== id) : [...this.enabled, id]);
    return this.ids;
  }

  tick(dt: number): void {
    const active = this.active;
    const host = this.net.isHost();
    for (const mod of active) {
      if (!mod.shared || host) {
        // Someone with a smaller id came: they run the shared mods now.
        if (mod.shared && !this.wasHost) this.follower(mod).clear(this.apiFor(mod));
        mod.tick?.(this.hostApi(mod), dt);
      } else {
        if (this.wasHost) mod.onDisable?.(this.hostApi(mod));
        this.follower(mod).tick(this.apiFor(mod), dt);
      }
    }
    this.wasHost = host;
    for (const mod of active) mod.localTick?.(this.apiFor(mod), dt);
    // Tell the host your tags now and then (a new host learns them within seconds).
    this.tagTimer -= dt;
    if (this.tagTimer <= 0) {
      this.tagTimer = TAG_EVERY;
      for (const mod of active) {
        if (!mod.shared || !mod.tags) continue;
        for (const tag of mod.tags(this.apiFor(mod))) {
          if (host) mod.onTag?.(this.hostApi(mod), this.net.myId?.() ?? 'me', tag);
          else this.net.callHost({ mod: mod.id, call: 'tag', name: tag });
        }
      }
    }
    // Rules that change all the time (a web slows you) join the fixed ones.
    if (active.some((m) => m.liveEffects)) {
      const live = active.map((m) => ({ ...m, effects: { ...m.effects, ...m.liveEffects?.() } }));
      this.combined = combineEffects(live);
    }
  }

  /** You hit a mod character: its mod decides what happens. Ids are "mod-id:character". */
  hitActor(fullId: string, damage: number): void {
    const [modId, id] = splitActorId(fullId);
    const mod = modById(modId);
    if (!mod || !this.isOn(modId)) return;
    if (mod.shared && !this.net.isHost()) {
      this.net.callHost({ mod: modId, call: 'hit', actor: id, damage });
      return;
    }
    mod.onHitActor?.(this.hostApi(mod), id, damage);
  }

  /** On the host: a follower hit a character or used a command. */
  receiveCall(call: ModCall, from = ''): void {
    const mod = modById(call.mod);
    if (!mod?.shared || !this.isOn(mod.id) || !this.net.isHost()) return;
    if (call.call === 'tag' && call.name && from) mod.onTag?.(this.hostApi(mod), from, call.name);
    if (call.call === 'hit' && call.actor) {
      mod.onHitActor?.(this.hostApi(mod), call.actor, call.damage ?? 1);
    }
    if (call.call === 'command' && call.name) {
      mod.commands
        ?.find((c) => c.names.includes(call.name!))
        ?.run(this.hostApi(mod), call.args ?? '');
    }
  }

  /** On the host: what the shared mods show, for the position message. */
  takeSync(): ModSync[] {
    if (!this.net.isHost()) return [];
    const out: ModSync[] = [];
    for (const mod of this.active) {
      const sync = mod.shared ? this.recorders.get(mod.id)?.recorder.take() : null;
      if (sync) out.push(sync);
    }
    return out;
  }

  /** On the others: what the host's shared mods show. */
  receiveSync(syncs: readonly ModSync[]): void {
    if (this.net.isHost()) return;
    for (const sync of syncs) {
      const mod = modById(sync.m);
      if (!mod?.shared || !this.isOn(mod.id)) continue;
      this.follower(mod).apply(sync, this.apiFor(mod));
    }
  }

  /** Runs a mod's chat command. False if no mod that is on knows it. */
  runCommand(name: string, args: string): boolean {
    for (const mod of this.active) {
      const command = mod.commands?.find((c) => c.names.includes(name));
      if (!command) continue;
      if (mod.shared && !this.net.isHost()) {
        this.net.callHost({ mod: mod.id, call: 'command', name, args });
      } else command.run(this.hostApi(mod), args);
      return true;
    }
    return false;
  }

  /** Help lines for the commands of the mods that are on. */
  get commandHelp(): string[] {
    return this.active.flatMap((m) =>
      (m.commands ?? []).filter((c) => !c.hidden).map((c) => c.help),
    );
  }

  /** The game ended: mods stop (their recipes go away). */
  stop(): void {
    this.set([]);
  }
}

/** "halloween:pumpkin-king" → ["halloween", "pumpkin-king"]. */
export function splitActorId(fullId: string): [string, string] {
  const i = fullId.indexOf(':');
  return i < 0 ? [fullId, ''] : [fullId.slice(0, i), fullId.slice(i + 1)];
}
