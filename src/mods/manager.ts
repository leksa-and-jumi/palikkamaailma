// Which mods are on in this world. Everyone in the world has the same mods:
// the room server remembers the list (alone: this device), and turning a
// mod on or off takes effect at once for everybody.

import { setExtraRecipes } from '../logic/recipes';
import { combineEffects, NO_EFFECTS, type CombinedEffects } from './effects';
import { MODS, modById } from './registry';
import type { Mod, ModApi } from './types';

export class ModManager {
  private enabled: string[] = [];
  private combined: CombinedEffects = NO_EFFECTS;
  /** Called after the list changes (the mods window redraws). */
  onChange: (() => void) | null = null;

  constructor(private readonly api: ModApi) {}

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
    for (const id of this.enabled) if (!next.includes(id)) modById(id)?.onDisable?.(this.api);
    for (const id of next) if (!this.enabled.includes(id)) modById(id)?.onEnable?.(this.api);
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
    for (const mod of this.active) mod.tick?.(this.api, dt);
  }

  /** The game ended: mods stop (their recipes go away). */
  stop(): void {
    this.set([]);
  }
}
