// Which mods are on in this world. Everyone in the world has the same mods:
// the room server remembers the list (alone: this device), and turning a
// mod on or off takes effect at once for everybody.

import { setExtraRecipes } from '../logic/recipes';
import { combineEffects, NO_EFFECTS, type CombinedEffects } from './effects';
import { MODS, modById } from './registry';
import type { ActorSpec, ActorState, Mod, ModApi } from './types';

export class ModManager {
  private enabled: string[] = [];
  private combined: CombinedEffects = NO_EFFECTS;
  /** Called after the list changes (the mods window redraws). */
  onChange: (() => void) | null = null;
  /** Called for each mod turned off (the game clears its characters and mood). */
  onTurnedOff: ((id: string) => void) | null = null;

  private readonly apis = new Map<string, ModApi>();

  constructor(private readonly base: ModApi) {}

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
      if (mod) mod.onDisable?.(this.apiFor(mod));
      this.onTurnedOff?.(id);
    }
    for (const id of next) {
      const mod = modById(id);
      if (mod && !this.enabled.includes(id)) mod.onEnable?.(this.apiFor(mod));
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
    for (const mod of active) mod.tick?.(this.apiFor(mod), dt);
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
    mod.onHitActor?.(this.apiFor(mod), id, damage);
  }

  /** Runs a mod's chat command. False if no mod that is on knows it. */
  runCommand(name: string, args: string): boolean {
    for (const mod of this.active) {
      const command = mod.commands?.find((c) => c.names.includes(name));
      if (!command) continue;
      command.run(this.apiFor(mod), args);
      return true;
    }
    return false;
  }

  /** Help lines for the commands of the mods that are on. */
  get commandHelp(): string[] {
    return this.active.flatMap((m) => (m.commands ?? []).map((c) => c.help));
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
