// Many mods on at once: their rules are put together into one set.

import type { Recipe } from '../logic/recipes';
import type { Mod } from './types';

export interface CombinedEffects {
  walkSpeed: number;
  jumpSpeed: number;
  gravity: number;
  miningSpeed: number;
  hunger: number;
  timeOfDay: number | null;
  noMonsters: boolean;
  recipes: readonly Recipe[];
}

export const NO_EFFECTS: CombinedEffects = {
  walkSpeed: 1,
  jumpSpeed: 1,
  gravity: 1,
  miningSpeed: 1,
  hunger: 1,
  timeOfDay: null,
  noMonsters: false,
  recipes: [],
};

/** Multipliers multiply, switches are on if any mod turns them on, recipes add up. */
export function combineEffects(mods: readonly Mod[]): CombinedEffects {
  const out = { ...NO_EFFECTS, recipes: [] as Recipe[] };
  for (const mod of mods) {
    const e = mod.effects;
    if (!e) continue;
    out.walkSpeed *= e.walkSpeed ?? 1;
    out.jumpSpeed *= e.jumpSpeed ?? 1;
    out.gravity *= e.gravity ?? 1;
    out.miningSpeed *= e.miningSpeed ?? 1;
    out.hunger *= e.hunger ?? 1;
    if (e.timeOfDay !== undefined) out.timeOfDay = e.timeOfDay;
    out.noMonsters ||= e.noMonsters ?? false;
    out.recipes.push(...(e.recipes ?? []));
  }
  return out;
}
